'use strict';
// Checks every pack in packs/ and builds the site the app downloads from:
//   _site/index.json            catalog (what the app's Themes page lists)
//   _site/packs/<id>/...        the pack files, exactly as installed
//   _site/thumbs/<id>.jpg       small previews for the list and the gallery
//   _site/index.html            the web gallery
// Usage: node scripts/build.js [--require-thumbs]
// Exits non-zero (and builds nothing) if any pack is invalid, so a bad pack never goes live.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const packsDir = path.join(root, 'packs');
const out = path.join(root, '_site');
const requireThumbs = process.argv.includes('--require-thumbs');

// Same limits as the app (src-tauri/src/main.rs, src/themes.js in keka-time-bubble).
const ID = /^[a-z0-9-]{1,40}$/;
const JSON_MAX = 64 * 1024;
// The app hands art to CSS as a base64 data: URL (a third bigger), and Chromium drops CSS URLs over
// 2M characters: a picture over ~1.5 MB would not show in apps before 2.19.1.
const IMAGE_MAX = 1450 * 1024;
const SOUND_MAX = 1536 * 1024;
const SURFACE = ['bg', 'surface', 'edge', 'text', 'muted', 'faint', 'track'];
const ACCENT = ['accent', 'warn', 'bad', 'info', 'gold'];
const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const STYLES = ['classic', 'card', 'agenda', 'activity', 'chart', 'pixel', 'summary', 'battery', 'dots', 'flip', 'split',
  'flight', 'gauge', 'capsules', 'countdown', 'timeline', 'sunset', 'meter', 'watch'];

function imageType(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

function soundType(b) {
  if (b.slice(0, 3).toString() === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  if (b.slice(0, 4).toString() === 'OggS') return 'ogg';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WAVE') return 'wav';
  return null;
}

function check(id) {
  const errs = [], dir = path.join(packsDir, id);
  if (!ID.test(id)) return { errs: ['folder name must be lowercase letters, digits and -'] };
  if (id.startsWith('my-')) return { errs: ['folder names starting with my- are kept for themes people make in the app'] };
  const jf = path.join(dir, 'theme.json');
  if (!fs.existsSync(jf)) return { errs: ['missing theme.json'] };
  if (fs.statSync(jf).size > JSON_MAX) return { errs: ['theme.json is over 64 KB'] };
  let t;
  try { t = JSON.parse(fs.readFileSync(jf, 'utf8')); } catch (e) { return { errs: ['theme.json is not valid JSON: ' + e.message] }; }

  if (typeof t.name !== 'string' || !t.name.trim() || t.name.length > 40) errs.push('name: 1-40 characters');
  if (!Number.isInteger(t.version) || t.version < 1) errs.push('version: a whole number, 1 or more (raise it on every change)');
  if (t.description != null && (typeof t.description !== 'string' || t.description.length > 160)) errs.push('description: up to 160 characters');
  if (t.tags != null && (!Array.isArray(t.tags) || t.tags.length > 10 || t.tags.some((x) => typeof x !== 'string' || x.length > 24))) errs.push('tags: up to 10 short strings');
  if (t.style != null && !STYLES.includes(t.style)) errs.push('style: one of ' + STYLES.join(', '));
  const c = t.colors || {};
  const surf = SURFACE.filter((k) => c[k] != null);
  if (surf.length && surf.length !== SURFACE.length) errs.push('colors: set all of ' + SURFACE.join(', ') + ' or none');
  Object.keys(c).forEach((k) => {
    if (!SURFACE.includes(k) && !ACCENT.includes(k)) errs.push('colors.' + k + ': unknown role');
    else if (!COLOR.test(c[k])) errs.push('colors.' + k + ': use a hex colour like #1f8fd6');
  });

  const files = [{ name: 'theme.json', size: fs.statSync(jf).size }];
  let image = null;
  if (t.art != null) {
    const a = t.art;
    if (typeof a.image !== 'string' || !/^[\w.-]+\.(jpe?g|png|webp)$/i.test(a.image) || a.image.startsWith('.')) errs.push('art.image: a file name in this folder (.jpg, .png or .webp)');
    else if (!fs.existsSync(path.join(dir, a.image))) errs.push('art.image: ' + a.image + ' not found');
    else {
      image = path.join(dir, a.image);
      const b = fs.readFileSync(image);
      if (b.length > IMAGE_MAX) errs.push('art.image: over 1.45 MB (older apps cannot show it; shrink it)');
      if (!imageType(b)) errs.push('art.image: not a real JPG, PNG or WebP');
      files.push({ name: a.image, size: b.length });
    }
    if (!['emblem', 'face'].includes(a.kind)) errs.push('art.kind: emblem or face');
    if (a.slot != null && !['x', 'y', 'w', 'h'].every((k) => typeof a.slot[k] === 'number' && a.slot[k] >= 0 && a.slot[k] <= 100)) errs.push('art.slot: x, y, w, h as 0-100');
    if (a.dim != null && !(typeof a.dim === 'number' && a.dim >= 0 && a.dim <= 0.9)) errs.push('art.dim: 0 to 0.9');
    if (a.cat != null && typeof a.cat !== 'boolean') errs.push('art.cat: true or false');
    if (a.readout != null && a.readout !== 'lcd') errs.push('art.readout: lcd (or leave it out)');
    if (a.mouth != null && !(Array.isArray(a.mouth) && a.mouth.length >= 2 && a.mouth.length <= 8 &&
      a.mouth.every((p) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 100))))
      errs.push('art.mouth: 2 to 8 [x, y] points in %, along the closed lips, left to right (app 2.26.0+)');
    if (a.hue != null) { // colour cycle (app 2.25.0+; older apps ignore it): seconds 3-600, keep = [x, y, rx, ry] ovals in %
      const pc = (v) => typeof v === 'number' && v >= 0 && v <= 100;
      if (!(typeof a.hue.seconds === 'number' && a.hue.seconds >= 3 && a.hue.seconds <= 600)) errs.push('art.hue.seconds: 3 to 600');
      if (a.hue.keep != null && !(Array.isArray(a.hue.keep) && a.hue.keep.length <= 6 && a.hue.keep.every((k) => Array.isArray(k) && k.length === 4 && k.every(pc))))
        errs.push('art.hue.keep: up to 6 [x, y, rx, ry] in %');
    }
  }
  if (t.sound != null) {
    const sf = t.sound.file;
    if (typeof sf !== 'string' || !/^[\w.-]+\.(mp3|ogg|wav)$/i.test(sf) || sf.startsWith('.')) errs.push('sound.file: a file name in this folder (.mp3, .ogg or .wav)');
    else if (!fs.existsSync(path.join(dir, sf))) errs.push('sound.file: ' + sf + ' not found');
    else {
      const b = fs.readFileSync(path.join(dir, sf));
      if (b.length > SOUND_MAX) errs.push('sound.file: over 1.5 MB (trim it or lower the bitrate)');
      if (!soundType(b)) errs.push('sound.file: not a real MP3, Ogg or WAV');
      files.push({ name: sf, size: b.length });
    }
    if (t.sound.volume != null && !(typeof t.sound.volume === 'number' && t.sound.volume >= 0 && t.sound.volume <= 1)) errs.push('sound.volume: 0 to 1');
  }
  const extra = fs.readdirSync(dir).filter((f) => !files.some((x) => x.name === f));
  if (extra.length) errs.push('unexpected files: ' + extra.join(', ') + ' (a pack is theme.json, one image and one sound at most)');
  return { errs, t, files, image };
}

// Small preview: ImageMagick on the build server, ffmpeg as a local fallback.
function tool() {
  const has = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch (_) { return false; } };
  if (has('magick', ['-version'])) return 'magick';
  if (process.platform !== 'win32' && has('convert', ['-version'])) return 'convert'; // Windows' convert.exe is a disk tool
  if (has('ffmpeg', ['-version'])) return 'ffmpeg';
  return null;
}
function thumb(t, src, dest) {
  if (t === 'ffmpeg') execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=160:-2', '-q:v', '5', dest]);
  else execFileSync(t, [src + '[0]', '-strip', '-resize', '160x', '-quality', '78', dest]); // [0]: first frame of an animated WebP
}

const ids = fs.readdirSync(packsDir).filter((f) => fs.statSync(path.join(packsDir, f)).isDirectory()).sort();
const results = ids.map((id) => ({ id, ...check(id) }));
const bad = results.filter((r) => r.errs.length);
bad.forEach((r) => r.errs.forEach((e) => console.error('packs/' + r.id + ': ' + e)));
if (bad.length) { console.error('\n' + bad.length + ' pack(s) need fixing; nothing was built.'); process.exit(1); }

const t = tool();
if (!t && requireThumbs) { console.error('No image tool (ImageMagick or ffmpeg) for previews.'); process.exit(1); }
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'thumbs'), { recursive: true });

const themes = results.map((r) => {
  const dest = path.join(out, 'packs', r.id);
  fs.mkdirSync(dest, { recursive: true });
  r.files.forEach((f) => fs.copyFileSync(path.join(packsDir, r.id, f.name), path.join(dest, f.name)));
  let thumbPath = null;
  if (r.image && t) {
    thumbPath = 'thumbs/' + r.id + '.jpg';
    try { thumb(t, r.image, path.join(out, thumbPath)); } catch (e) {
      if (requireThumbs) throw e;
      console.warn('packs/' + r.id + ': no preview (' + t + ' cannot read this image; ffmpeg cannot read animated WebP)');
      thumbPath = null;
    }
  }
  return {
    id: r.id, name: r.t.name, version: r.t.version, description: r.t.description || '', tags: r.t.tags || [],
    style: r.t.style || null, kind: r.t.art ? r.t.art.kind : null, colors: r.t.colors || {},
    thumb: thumbPath, sound: !!r.t.sound, files: r.files, size: r.files.reduce((s, f) => s + f.size, 0),
  };
});

const catalog = { format: 1, updated: new Date().toISOString(), themes };
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(catalog, null, 2) + '\n');
fs.copyFileSync(path.join(root, 'site', 'index.html'), path.join(out, 'index.html'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
themes.forEach((x) => console.log(x.id.padEnd(16) + ' v' + x.version + '  ' + Math.round(x.size / 1024) + ' KB' + (x.thumb ? '' : '  (no preview)')));
console.log('\n' + themes.length + ' theme(s) -> _site/' + (t ? '' : '  (no image tool found: previews skipped)'));
