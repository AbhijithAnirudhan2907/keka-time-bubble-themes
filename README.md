# Keka Time Bubble Themes

Optional themes for [Keka Time Bubble](https://github.com/AbhijithAnirudhan2907/keka-time-bubble-releases).
Nothing here is bundled with the app: in the app, open the dashboard, choose **Themes** in the sidebar
and click **Get** on the ones you want. Only those are downloaded.

Gallery: https://abhijithanirudhan2907.github.io/keka-time-bubble-themes/

## Themes

| Theme | Style | |
|---|---|---|
| Spider-Man Mask | Classic | Spider-Man mask emblem behind the time, red ring; ♪ Homecoming tune |
| Doctor Strange | Classic | Sanctum window emblem, mystic blue ring |
| Arc Reactor | Classic | Glowing arc reactor emblem, gold ring |
| Spider-Man Casio | Watch face | Casio-style Spider-Man face with an LCD readout (date, in, break, done, week); ♪ Homecoming tune |
| Miles Morales | Watch face | Miles Morales face with dial numerals; ♪ Homecoming tune |
| Iron Man | Watch face | Neon orange Iron Man face |

## Adding or changing a theme

1. Add a folder under `packs/` named after the theme id (lowercase letters, digits, `-`; not starting
   with `my-`, which is kept for themes people make in the app), holding `theme.json` and at most one
   image (JPG, PNG or WebP, up to 2 MB; an animated WebP plays in the bubble).
   It may also hold one sound (MP3, Ogg or WAV, up to 1.5 MB) for the bubble's play button.
2. Run `node scripts/build.js` to check it (and preview `_site/index.html` in a browser).
3. Push to `main` (or open a pull request; the checks run on it). The site updates in about a minute,
   and the app sees the new theme the next time someone opens **Themes**.

Anyone can also turn their own picture into a theme in the app (**Themes > Make your own theme**,
app v2.13.0 or later); those stay on their computer and never come here.

When you change an existing theme, raise its `version`: the app then shows **Update** to everyone who
has it.

### theme.json

```json
{
  "name": "Iron Man",
  "version": 1,
  "description": "Neon orange Iron Man watch face.",
  "tags": ["marvel", "iron man", "orange", "watch"],
  "style": "watch",
  "colors": {
    "bg": "#0f0f0f", "surface": "#171717", "edge": "#242424", "text": "#ffffff",
    "muted": "#c2b6ad", "faint": "#74695f", "track": "#2a2420",
    "accent": "#ff6a1a", "warn": "#ffb02e", "bad": "#ff3b3b", "info": "#4fc3ff", "gold": "#ffc83d"
  },
  "art": { "image": "art.jpg", "kind": "face", "slot": { "x": 8, "y": 66, "w": 84, "h": 28 } }
}
```

| Field | |
|---|---|
| `name`, `version` | Required. Raise `version` on every change. |
| `description`, `tags` | Shown and searched in the app and the gallery. |
| `style` | The style the app switches to when the theme is picked (`classic` for emblems, `watch` for faces). |
| `colors` | Hex colours. The seven surface roles (`bg` … `track`) go together, all or none; each accent is optional. A theme with only colours and no image works with every style. |
| `art.kind` | `emblem`: a round picture behind the Classic face. `face`: a full tall watch face (168×298 ratio) for the Watch face style. |
| `art.slot` | Where the live time sits on a face, in % of the face: `x`, `y`, width `w`, height `h`. |
| `art.dim` | 0–0.9: how much an emblem is darkened behind the time (default 0.5). |
| `art.cat` | `false` hides the Classic cat. |
| `sound.file`, `sound.volume` | Optional tune for the play button on the bubble (next to ⚙). `volume` 0–1, default 0.8. Needs app v2.12.0 or later. |
| `move` | Optional travel button on the bubble: click it, then any spot on the screen, and the bubble goes there. `web` (Spider-Man: web strand + swing), `portal` (Doctor Strange: sling-ring portals), `flight` (Iron Man: repulsor flight). Needs app v2.14.0 or later. |
| `art.readout` | `lcd` (faces only): an LCD-style readout with the date and an IN / BREAK / DONE / WEEK strip. Needs app v2.11.0 or later. |

## How it is published

`.github/workflows/publish.yml` runs `scripts/build.js` on every push and pull request. It rejects
broken packs (bad JSON, missing or non-hex colours, fake or oversized images, unexpected files), makes
small previews, and on `main` publishes `_site/` to GitHub Pages: `index.json` (the catalog the app
reads), `packs/<id>/` (the files the app installs), `thumbs/` and the gallery page.
