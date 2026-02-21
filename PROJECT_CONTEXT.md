# PROJECT CONTEXT

Read this file first when starting or continuing development on this project.

## What Is This

An **Electron desktop app** for managing multiple Facebook browser profiles with automation features. Think of it as a multi-account Facebook automation tool.

## Tech Stack

- **Electron** — desktop app framework
- **electron-automation-core** (GitHub: nurfahmi/electron-automation-core) — browser automation library (our own). Provides `ElectronPage`, `Keyboard`, `Mouse`, `Network`, `ElementHandle`
- **EJS** — HTML templating
- **Tailwind CSS v3** (CDN) — styling
- **No frameworks** — vanilla JS frontend

## How To Run

```bash
npm start
```

## Architecture Overview

```
main.js                  ← Electron main process entry point
preload.js               ← IPC bridge for browser grid window
preload-manager.js       ← IPC bridge for account manager window
lib/store.js             ← Simple JSON file store
views/
  manager.ejs            ← Account management UI (groups + accounts)
  index.ejs              ← Browser grid + sidebar + feature tabs
styles/
  manager.css            ← Manager window styles
  app.css                ← Browser grid window styles
features/                ← Auto-discovered feature modules (see below)
data/accounts.json       ← Persisted account/group data
```

## App Flow

1. **Manager Window** opens first → user creates groups and assigns accounts (name + ID)
2. User clicks **Launch** on a group → **Browser Grid Window** opens
3. Grid window shows up to 10 BrowserViews in a 5×2 grid
4. Each slot has a persistent session (`persist:accountId` partition — survives app restart)
5. Clicking ⛶ on a slot enters **Expanded Mode** — one browser takes 70% width, sidebar shows feature tabs on the left 30%
6. Sidebar has **feature tabs** — each feature folder adds a tab automatically

## Feature System

Features are **auto-discovered** from `features/` folder. Each feature has 3 files:

| File | Runs In | Purpose |
|------|---------|---------|
| `handler.js` | Main process (Node.js) | IPC handlers, automation logic |
| `ui.ejs` | Renderer (sidebar HTML) | UI controls |
| `client.js` | Renderer (browser JS) | Frontend logic, calls IPC handlers |

### handler.js pattern:
```js
const { ipcMain } = require('electron')

module.exports = function (getPage) {
  // getPage(slot) returns ElectronPage for that browser slot (0-9)
  ipcMain.handle('my-action', async (e, slot, data) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }
    // Use page.click(), page.keyboard.type(), etc.
    return { ok: true }
  })
}
```

### client.js pattern:
```js
// Per-slot data storage
const _slotData = {}
slotSwitchCallbacks.push((action, slot) => {
  if (action === 'save') _slotData[slot] = { /* save state */ }
  if (action === 'load') { /* restore state from _slotData[slot] */ }
})

async function myAction() {
  setStatus('Running...', 'info')
  const res = await window.api.invoke('my-action', currentSlot, {})
  if (res.ok) setStatus('Done', 'success')
  else setStatus(res.error, 'error')
}
```

### Available client globals:
- `currentSlot` — active browser slot (0-9)
- `setStatus(msg, type)` — status bar ('info', 'success', 'error')
- `window.api.invoke(channel, slot, data)` — call IPC handler
- `window.api.on(channel, callback)` — listen for events from main
- `slotSwitchCallbacks` — register save/load for per-slot data

## Existing Features

### `auto-comment`
Comments on Facebook posts automatically. Supports spintax `{{opt1|opt2}}`, image upload, random delay, rest periods. Uses `page.keyboard.type()` for real typing simulation.

### `get-joined-groups`
Scrapes all Facebook groups the user has joined. Scrolls the groups page and collects group names + IDs. Can import/export as TXT.

### `facebook-login`
Basic login helper (open/close browser slot).

## Critical Rules

1. **Do NOT change the project structure** — don't move, rename, or reorganize existing files/folders. New features go in `features/your-feature/`. Everything else stays where it is.
2. **Use `electron-automation-core` API only** — never write raw `page.evaluate()` with inline JS. See `FEATURE_GUIDE.md` for full API reference.
3. **Per-slot data** — every feature must save/restore state when user switches slots. Register with `slotSwitchCallbacks`.
4. **Don't call `destroyProfile()`** on window close — it wipes session data (cookies, login). Just null out references.
5. **Sessions persist** — `persist:accountId` partition keeps cookies across restarts.

## Key Files To Read

| Priority | File | Why |
|----------|------|-----|
| 1st | `FEATURE_GUIDE.md` | Full API reference + how to create features |
| 2nd | `main.js` | App entry point, IPC handlers, grid layout logic |
| 3rd | `views/index.ejs` | Browser grid UI, slot switching, feature tab system |
| 4th | Any `features/*/handler.js` | See real examples of automation code |

## How To Add a New Feature

```bash
mkdir features/my-feature
# Create handler.js, ui.ejs, client.js
# Restart app — feature auto-appears in sidebar
```

See `FEATURE_GUIDE.md` for complete step-by-step guide and API reference.
