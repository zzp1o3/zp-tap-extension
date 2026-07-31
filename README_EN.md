# zptap

> 🌐 **中文 ([README.md](README.md))** · English

A minimalist, comfortable new tab page. Opens focused, type to search, one-click direct to your bookmarks and frequently visited sites.

| ![img.png](img.png)   | ![img_1.png](img_1.png) | ![img_2.png](img_2.png) |
|-----------------------|-------------------------|-------------------------|
| ![img_3.png](img_3.png) |                         |                         |

## Why zptap

- **Open & focused**：The cursor is already waiting in the search box the moment your new tab opens. Just type — no clicks needed.
- **Minimal & calm**：By default, only a quiet background. No ads, no feeds, no distractions.
- **Bookmarks & history, one key away**：As you type, suggestions smartly blend your bookmarks and browsing history, ranked by frecency (frequency × recency × match position × bookmark weight). Same domain collapses to the most-visited entry — **where you want to go is always on top**.
- **Enter goes straight**：Select a suggestion to open it directly; type a domain (with TLD) to visit it directly; anything else searches with the current engine.

## Features

### Search
- 7 preset engines: Bing / Bilibili / GitHub / Baidu / Zhihu / Google / Yandex
- Add custom engines (name + `{q}` URL template), drag to reorder
- Dropdown picker + **Ctrl+↑/Ctrl+↓** to cycle the quick group
- Persistent search box or "appear on typing" mode — your choice

### Background
- Image / video backgrounds, from local upload or remote URL
- Images auto-compressed client-side; videos stored as-is with auto-captured poster
- Rotation modes: change every open / timed interval / fixed
- Per-item checkbox to join rotation, or pin as the fixed background
- Dark / Light / System theme with smooth transitions

### Details
- **Four-source favicon fallback**: Chrome local cache → domestic CDN → Google → letter badge, icons never missing
- **Constraint protection**: keeps at least one rotating item, one fixed item, and one engine — falls back to defaults if you delete everything
- All data stays local. No account, no upload.

## Installation

### Chrome

1. Open Chrome and go to `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this repository root (or the extracted zip folder)
5. Open a new tab and enjoy

### Edge

1. Open Edge and go to `edge://extensions`
2. Toggle **Developer mode** (left sidebar)
3. Click **Load unpacked extension**
4. Select this repository root (or the extracted zip folder)
5. Open a new tab and enjoy

> Or download the zip from [Releases](https://github.com/zzp1o3/zp-tap-extension/releases) and extract it.

## Permissions

| Permission | Purpose |
|------------|---------|
| `bookmarks` | Search bookmarks for direct suggestions |
| `history` | Search browsing history for direct suggestions |
| `storage` | Store engines, quick group, theme, wallpaper config |
| `unlimitedStorage` | Extra quota headroom for IndexedDB media |
| `favicon` | Enable Chrome built-in favicon API (first fallback source) |

## Directory

```
manifest.json
zptop.html                        New tab entry (repo root)
_locales/                         i18n (zh-CN / en)
icons/                            Extension icons (derived from icons/zp-tap.png)
scripts/gen_icons.py              Icon generation script
src/background/sw.js              MV3 service worker (opens page on icon click)
src/newtab/
  launch.html launch.js           Launch page (redirects to zptop.html for instant focus)
  focus-init.js                   Early focus script
  main.js                         Main logic
  tailwind.css                    Tailwind output (committed, ready to use)
  tailwind.input.css              Tailwind source + theme variables
  engines.js                      Search engine config
  storage.js                      IndexedDB + chrome.storage wrapper
  suggestions.js                  Suggestions, scoring, rendering
  url-detect.js                   URL detector
  favicon.js                      Four-source favicon fallback
  settings/
    settings.html settings.js     Right-drawer settings panel
```

## Development

- Pure vanilla HTML/JS, no runtime build. `npm install` is only needed to regenerate Tailwind CSS after editing styles.
- After editing `tailwind.input.css`: `npm install && npm run build:css`
- Regenerate icons: `uv run --with=pillow python scripts/gen_icons.py`

## License

MIT
