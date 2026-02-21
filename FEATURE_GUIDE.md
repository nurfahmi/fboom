# Feature Creation Guide

## ⚠️ IMPORTANT RULE

**ALL browser automation MUST use `electron-automation-core` API only.**

❌ **NEVER** write raw `page.evaluate()` with inline JavaScript.
✅ **ALWAYS** use `page.click()`, `page.focus()`, `page.keyboard.type()`, etc.

If a function you need doesn't exist in the library, request it to be added to `electron-automation-core`. Do NOT work around it with `page.evaluate()`.

---

## How Features Work

Each feature is a self-contained folder inside `features/`. The app **auto-discovers** all feature folders on startup — no need to edit any other file.

```
features/
  your-feature/
    handler.js    ← Backend logic (IPC handlers, runs in Node.js main process)
    ui.ejs        ← Sidebar UI (HTML with Tailwind CSS)
    client.js     ← Frontend JS (runs in renderer, has access to globals)
```

---

## Step-by-Step: Create a New Feature

### 1. Create the folder

```bash
mkdir features/my-feature
```

### 2. Create `handler.js` — Backend Logic

Runs in the **main process** (Node.js). Receives `getPage(slot)` to access browser instances.

```js
const { ipcMain } = require('electron')

module.exports = function (getPage) {

  ipcMain.handle('my-action', async (e, slot, data) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }

    try {
      await page.click('button.submit')
      await page.waitForTimeout(1000)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}
```

### 3. Create `ui.ejs` — Sidebar UI

HTML that appears in the sidebar when a browser is expanded. Use Tailwind classes.

```html
<div class="bg-dark-300 rounded-lg p-3">
  <h3 class="text-xs text-gray-500 uppercase tracking-wider mb-2">My Feature</h3>
  <button onclick="myAction()"
    class="w-full px-3 py-2 bg-accent hover:bg-accent-light text-white rounded-md text-sm font-semibold transition">
    🚀 Do Something
  </button>
</div>
```

### 4. Create `client.js` — Frontend Functions

Runs in the **renderer process**. Calls IPC handlers via `window.api.invoke()`.

```js
async function myAction() {
  setStatus('Running...', 'info')
  const res = await window.api.invoke('my-action', currentSlot, {})
  if (res.ok) setStatus('Done ✓', 'success')
  else setStatus('Error: ' + res.error, 'error')
}
```

### 5. Done!

Restart the app. Your feature automatically appears as a sidebar tab.

---

## Per-Slot Data (Important!)

Each slot (0-9) is a separate browser profile. Feature state must be **per-slot** — don't use global variables that are shared across slots.

```js
// ✅ CORRECT — per-slot storage
const _slotData = {}

function _save(slot) {
  _slotData[slot] = { urls: myUrls, text: document.getElementById('myInput').value }
}

function _load(slot) {
  const data = _slotData[slot] || { urls: [], text: '' }
  myUrls = data.urls
  document.getElementById('myInput').value = data.text
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
  if (action === 'save') _save(slot)
  if (action === 'load') _load(slot)
})
```

---

## Client.js Available Globals

| Global | Description |
|--------|-------------|
| `currentSlot` | Currently active browser slot (0-9) |
| `setStatus(msg, type)` | Show status bar message. Types: `'info'`, `'success'`, `'error'` |
| `window.api.invoke(channel, slot, data)` | Call any IPC handler |
| `window.api.on(channel, callback)` | Listen for events from main process |
| `slotSwitchCallbacks` | Array — push `(action, slot) => {}` to save/load per-slot data |

---

## electron-automation-core API Reference

All methods below are available on `page` (from `getPage(slot)` in handler.js).

### Navigation

| Method | Description |
|--------|-------------|
| `page.goto(url)` | Navigate to URL |
| `page.goBack()` | Navigate back |
| `page.goForward()` | Navigate forward |
| `page.reload()` | Reload page |
| `page.waitForNavigation(timeout)` | Wait for navigation to complete |
| `page.waitForNetworkIdle(timeout)` | Wait for network to be idle |

### Waiting

| Method | Description |
|--------|-------------|
| `page.waitForSelector(selector, timeout)` | Wait for element to appear in DOM |
| `page.waitForTimeout(ms)` | Wait N milliseconds |
| `page.waitForFunction(fnString, timeout)` | Wait for JS function to return truthy |

### Element Interaction (by selector)

| Method | Description |
|--------|-------------|
| `page.click(selector)` | Click element (finds center, sends real mouse click) |
| `page.type(selector, text, delay)` | Focus element then type with keyboard simulation |
| `page.focus(selector)` | Focus an element |
| `page.hover(selector)` | Hover over an element |
| `page.select(selector, value)` | Set value on select/input + dispatch change |
| `page.check(selector)` | Check a checkbox |
| `page.uncheck(selector)` | Uncheck a checkbox |
| `page.upload(selector, filePath)` | Set file on `<input type="file">` via CDP (no file picker) |

### Element Queries (returns ElementHandle)

| Method | Description |
|--------|-------------|
| `page.$(selector)` | Get single ElementHandle |
| `page.$$(selector)` | Get array of ElementHandles |
| `page.$x(expression)` | Get ElementHandles by XPath |
| `page.querySelector(selector)` | Get element info (tagName, text, bounds, etc) |
| `page.querySelectorAll(selector)` | Get all matching element infos |
| `page.getElementById(id)` | Get element by ID |
| `page.getElementsByClassName(cls)` | Get elements by class |
| `page.getElementsByTagName(tag)` | Get elements by tag |
| `page.xpath(expression)` | XPath query |

### Keyboard (`page.keyboard`)

| Method | Description |
|--------|-------------|
| `page.keyboard.type(text, delay)` | Type text char-by-char (keyDown/char/keyUp per character) |
| `page.keyboard.press(key)` | Press and release a key (e.g. `'Enter'`, `'Tab'`, `'Backspace'`) |
| `page.keyboard.down(key)` | Hold key down |
| `page.keyboard.up(key)` | Release key |
| `page.keyboard.shortcut(['Control', 'a'])` | Press keyboard shortcut |

Supported special keys: `Enter`, `Tab`, `Backspace`, `Delete`, `Escape`, `ArrowUp/Down/Left/Right`, `Home`, `End`, `PageUp/Down`, `F1-F12`, `Control`, `Shift`, `Alt`, `Meta`, `Space`

### Mouse (`page.mouse`)

| Method | Description |
|--------|-------------|
| `page.mouse.click(x, y, button)` | Click at coordinates (button: `'left'`, `'right'`) |
| `page.mouse.doubleClick(x, y)` | Double click |
| `page.mouse.rightClick(x, y)` | Right click |
| `page.mouse.move(x, y)` | Move mouse |
| `page.mouse.drag(fromX, fromY, toX, toY, steps)` | Drag from A to B |
| `page.mouse.wheel(deltaX, deltaY, x, y)` | Scroll wheel |

### ElementHandle (from `page.$()`, `page.$$()`, `page.$x()`)

| Method | Description |
|--------|-------------|
| `el.click()` | Click this element |
| `el.doubleClick()` | Double-click |
| `el.rightClick()` | Right-click |
| `el.hover()` | Hover over |
| `el.focus()` | Focus |
| `el.type(text, delay)` | Focus + type into this element |
| `el.textContent()` | Get text content |
| `el.innerText()` | Get inner text |
| `el.value(newValue?)` | Get or set value |
| `el.getAttribute(name)` | Get attribute |
| `el.setAttribute(name, val)` | Set attribute |
| `el.isVisible()` | Check visibility |
| `el.scrollIntoView()` | Scroll into view |
| `el.getInfo()` | Get full info (tagName, id, class, text, bounds) |
| `el.select(value)` | Set select/input value |
| `el.check()` | Check checkbox |
| `el.uncheck()` | Uncheck checkbox |
| `el.dispose()` | Clean up handle |

### Network (`page.network`)

| Method | Description |
|--------|-------------|
| `page.network.enable()` | Enable network monitoring via CDP |
| `page.network.disable()` | Disable network monitoring |
| `page.network.blockResourceTypes(['Image', 'Media'])` | Block resource types |
| `page.network.setExtraHTTPHeaders(headers)` | Set extra HTTP headers |
| `page.network.interceptRequests(handler)` | Intercept all requests with custom handler |
| `page.network.getResponseBody(requestId)` | Get response body |
| `page.network.destroy()` | Clean up listeners |

### Screenshots & PDF

| Method | Description |
|--------|-------------|
| `page.screenshot({ path })` | Take screenshot (saves PNG) |
| `page.pdf({ path, ... })` | Save page as PDF |

### Cookies

| Method | Description |
|--------|-------------|
| `page.getCookies(filter)` | Get cookies |
| `page.setCookies(cookies)` | Set cookies |
| `page.clearCookies()` | Clear all cookies |

### Device Emulation

| Method | Description |
|--------|-------------|
| `page.setMobile(preset)` | Switch to mobile. Presets: `'iphone12'`, `'pixel5'`, `'ipadair'` |
| `page.setDesktop()` | Switch back to desktop |
| `page.emulateDevice(device)` | Custom device `{ width, height, userAgent, mobile }` |
| `page.setUserAgent(ua)` | Set custom user agent |
| `page.setViewport(width, height)` | Set viewport size |
| `page.setExtraHTTPHeaders(headers)` | Set headers for all requests |

---

## Example: Auto Comment (simplified)

**handler.js:**
```js
const { ipcMain } = require('electron')

module.exports = function (getPage) {
  ipcMain.handle('post-comment', async (e, slot, { url, text }) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }

    await page.goto(url)
    await page.waitForTimeout(3000)

    // Open comment box
    await page.click('[aria-label="Comment"]')
    await page.waitForTimeout(1500)

    // Focus and type
    const boxSel = 'div[role="textbox"][contenteditable="true"]'
    await page.waitForSelector(boxSel, 5000)
    await page.focus(boxSel)
    await page.keyboard.type(text, 50)
    await page.waitForTimeout(500)

    // Submit
    await page.keyboard.press('Enter')
    await page.waitForTimeout(3000)

    return { ok: true }
  })
}
```

## Example: Like All Posts

**handler.js:**
```js
const { ipcMain } = require('electron')

module.exports = function (getPage) {
  ipcMain.handle('like-all-posts', async (e, slot) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }

    const likeButtons = await page.$$('[aria-label="Like"]')
    for (const btn of likeButtons) {
      await btn.click()
      await page.waitForTimeout(1000)
    }
    return { ok: true, count: likeButtons.length }
  })
}
```

---

## Tailwind Theme Colors

| Color | Class | Hex |
|-------|-------|-----|
| Dark bg | `bg-dark-100` | `#1a1a2e` |
| Card bg | `bg-dark-300` | `#0f3460` |
| Accent | `bg-accent` | `#e94560` |
| Accent hover | `hover:bg-accent-light` | `#ff6b81` |
| Success | `bg-emerald-600` | green |
| Danger | `bg-red-700` | red |
