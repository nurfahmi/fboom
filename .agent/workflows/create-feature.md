---
description: How to create a new feature for FBOOMX V2. Follow this pattern strictly for every new feature.
---

# Create New Feature

## File Structure

Every feature lives in `features/<feature-name>/` with these files:

```
features/<feature-name>/
  ├── handler.js    # Backend logic (IPC handlers + core automation)
  └── client.js     # Frontend logic (UI rendering + IPC calls)
```

## handler.js Pattern

Follow `features/auto-comment/handler.js` as the **reference pattern**. Every handler must follow these rules:

### 1. Imports & Helpers at Top

```js
const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// Spin text (if needed): {{option1|option2|option3}} → random pick
function spinText(text) {
  if (!text) return text
  return text.replace(/\{\{([^}]+)\}\}/g, (match, options) => {
    const list = options.split('|').map(o => o.trim()).filter(o => o.length > 0)
    return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : match
  })
}
```

### 2. Module Export with `getPage`

```js
module.exports = function (getPage) {
  const state = {} // per-slot state

  ipcMain.handle('start-<feature-name>', async (e, slot, config) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }
    // ... feature logic
  })

  ipcMain.handle('stop-<feature-name>', (e, slot) => {
    if (state[slot]) state[slot].running = false
    return { ok: true }
  })
}
```

### 3. ISHBrowser API — What to Use

✅ **Always use these ISHBrowser methods:**

| Action | Method |
|--------|--------|
| Navigate | `page.goto(url)` |
| Wait | `page.waitForTimeout(ms)` |
| Click by CSS | `page.click(selector)` — auto scrolls + native click |
| Click by CSS (force) | `page.click(selector, { force: true })` — JS click, bypasses overlays |
| Click by XPath | `page.clickByXpath(expression)` |
| Type into field | `page.type(selector, text, delay)` |
| Focus | `page.focus(selector)` |
| Wait for element | `page.waitForSelector(selector, timeout)` |
| Upload file | `page.upload(selector, filePath)` |
| Intercept file | `page.interceptFileChooser(path, opts)` + `page.stopInterceptFileChooser()` |
| Keyboard | `page.keyboard.press('Enter')`, `page.keyboard.type(text, delay)`, `page.keyboard.shortcut(['Control', 'a'])` |
| Mouse click at coords | `page.mouse.click(x, y)` |
| Scroll page | `page.mouse.wheel(0, 500)` — scroll down 500px, use negative to scroll up |
| Get current URL | `page.url()` |
| Find elements | `page.$$('selector')` — returns `ElementHandle[]` |
| Find single element | `page.$('selector')` — returns `ElementHandle` or `null` |
| Scroll into view | `page.scrollIntoView(selector)` or `ElementHandle.scrollIntoView()` |

**ElementHandle methods** (from `page.$$()` or `page.$()`):  
`.click()`, `.innerText()`, `.isVisible()`, `.scrollIntoView()`, `.focus()`, `.type(text, delay)`, `.getAttribute(name)`, `.getInfo()`, `.dispose()`

> ⚠️ Always call `.dispose()` on ElementHandles when done to prevent memory leaks.

❌ **Never use these:**

- `new Promise(resolve => setTimeout(resolve, ms))` — use `page.waitForTimeout(ms)` instead
- Custom `delay()` helper functions — use `page.waitForTimeout(ms)` instead
- `page.querySelectorAll()` with manual `.bounds` coordinate clicking — use `page.click()` or `page.clickByXpath()` instead
- `page.evaluate('window.scrollBy(...)')` — use `page.mouse.wheel(0, amount)` instead
- `page.evaluate()` for clicking/finding single elements — use `page.click()`, `page.$$()`, `page.$()` instead

⚠️ **`page.evaluate()` — Only allowed for:**

- Bulk DOM extraction (scraping hundreds of elements at once, e.g. group links)
- Complex DOM traversal that would require too many IPC round-trips with `page.$$()` + `.innerText()`
- Finding special scrollable containers (nested overflow)

### 4. Selector Fallbacks — Use Nested try/catch

```js
// ✅ GOOD — simple nested try/catch
try { await page.click('div[aria-label="Share"][role="button"]') }
catch (e) {
  try { await page.click('div[aria-label="Bagikan"][role="button"]') }
  catch (e2) {
    try { await page.clickByXpath("//div[@role='button']//span[text()='Share']") }
    catch (e3) { return false }
  }
}

// ❌ BAD — verbose Method A/B/C pattern
// Method A: ...
let clicked = false
for (const sel of selectors) { ... }
// Method B: ...
if (!clicked) { ... }
// Method C: ...
if (!clicked) { ... }
```

### 5. No Verbose Logging

```js
// ❌ BAD
console.log(`[auto-share-groups] [STEP 2/7] Trying page.click("${sel}")...`)
console.log(`[auto-share-groups] [STEP 2/7] ✅ Share button clicked via page.click(): ${sel}`)
console.log(`[auto-share-groups] [STEP 2/7] Selector not found: ${sel}`)

// ✅ GOOD — no logging in the core logic function. Keep it clean.
// Only use minimal logging in the main IPC handler loop if absolutely needed.
```

### 6. Code Style

- **2-space indentation**
- **No section dividers** like `// ========================` — keep it minimal
- **Short inline comments** like `// STEP 1: Click Share button`
- **No empty lines between try/catch chains**
- **Use `page.waitForTimeout(ms)`** for all delays
- **Return `false` on failure**, `true` on success
- **Always support both English and Indonesian** (Bahasa) selectors for Facebook

### 7. Core Logic Function Template

```js
// <Description> using ISHBrowser API only
async function doSomething(page, param1, param2) {
  await page.waitForTimeout(2000)

  // STEP 1: Do first thing
  try { await page.click('selector-en') }
  catch (e) {
    try { await page.click('selector-id') }
    catch (e2) { return false }
  }
  await page.waitForTimeout(1500)

  // STEP 2: Do second thing
  try { await page.waitForSelector('selector', 5000) }
  catch (e) { return false }
  await page.focus('selector')
  await page.waitForTimeout(300)

  // STEP 3: Type text (multiline-safe)
  await page.keyboard.shortcut(['Control', 'a'])
  await page.keyboard.press('Backspace')
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) await page.keyboard.type(lines[i], 50)
    if (i < lines.length - 1) {
      await page.keyboard.shortcut(['Shift', 'Enter'])
      await page.waitForTimeout(100)
    }
  }
  await page.waitForTimeout(500)

  // STEP 4: Submit
  try { await page.click('submit-selector') }
  catch (e) { await page.keyboard.press('Enter') }

  await page.waitForTimeout(3000)
  return true
}
```

### 8. IPC Progress Events Pattern

For features that process multiple items:

```js
for (let i = 0; i < items.length; i++) {
  if (!state[slot] || !state[slot].running) break

  e.sender.send('<feature>-progress', slot, { index: i, status: 'processing', total: items.length, successCount, failCount })

  try {
    const success = await coreLogic(page, items[i])
    if (success) {
      successCount++
      e.sender.send('<feature>-progress', slot, { index: i, status: 'success', total: items.length, successCount, failCount })
    } else {
      failCount++
      e.sender.send('<feature>-progress', slot, { index: i, status: 'error', error: 'Failed', total: items.length, successCount, failCount })
    }
  } catch (err) {
    failCount++
    e.sender.send('<feature>-progress', slot, { index: i, status: 'error', error: err.message, total: items.length, successCount, failCount })
  }

  // Delay
  if (i < items.length - 1 && state[slot] && state[slot].running) {
    const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
    e.sender.send('<feature>-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: items.length, successCount, failCount })
    await page.waitForTimeout(delay)

    if (restAfter > 0 && (i + 1) % restAfter === 0) {
      e.sender.send('<feature>-progress', slot, { index: i, status: 'resting', restSeconds, total: items.length, successCount, failCount })
      await page.waitForTimeout(restSeconds * 1000)
    }
  }
}

state[slot] = null
e.sender.send('<feature>-done', slot, { successCount, failCount, total: items.length })
return { ok: true, successCount, failCount }
```

## Reference Files

- **Best example**: `features/auto-comment/handler.js` (161 lines)
- **Good examples**: `features/auto-share-groups/handler.js`, `features/auto-post-groups/handler.js`
- **ISHBrowser API docs**: `node_modules/ishbrowser/README.md`
