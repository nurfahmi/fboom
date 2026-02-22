# Flow Runner Guide

JSON-driven automation runner for `electron-automation-core`.  
Define automation sequences as JSON files instead of writing code.

---

## How It Works

```js
const { runFlow } = require('./lib/flow-runner')
const steps = require('./flows/my-flow.json')

const result = await runFlow(page, steps, { username: 'john', password: 's3cret' })
// result = { ok: true, stepsRun: 12 }
// or     = { ok: false, stepsRun: 5, error: 'Step 5 (click) failed: Element not found' }
```

---

## Step Format

Each step is an object with:

| Key | Type | Required | Description |
|-----|------|----------|-------------|
| `action` | string | ✅ | Method to call (e.g. `"click"`, `"keyboard.type"`) |
| `args` | array | ❌ | Arguments passed to the method |
| `fallback` | object | ❌ | Another step to run if this one fails |
| `if` | string | ❌ | Skip step if variable is empty/null |
| `optional` | boolean | ❌ | If true, failure won't stop the flow |

### Basic Step

```json
{ "action": "click", "args": ["button.submit"] }
```

### With Variable Injection

```json
{ "action": "keyboard.type", "args": ["{{commentText}}", 50] }
```

Variables are passed at runtime: `runFlow(page, steps, { commentText: "Hello!" })`

### With Fallback

```json
{
  "action": "click",
  "args": ["[aria-label=\"Submit\"]"],
  "fallback": {
    "action": "keyboard.press",
    "args": ["Enter"]
  }
}
```

Fallbacks can be nested:
```json
{
  "action": "click", "args": ["#btn1"],
  "fallback": {
    "action": "click", "args": ["#btn2"],
    "fallback": {
      "action": "keyboard.press", "args": ["Enter"]
    }
  }
}
```

### Conditional Step

```json
{
  "action": "upload",
  "args": ["input[type=\"file\"]", "{{imagePath}}"],
  "if": "{{imagePath}}"
}
```

Step is skipped when the variable is empty, null, or undefined.

### Optional Step

```json
{
  "action": "click",
  "args": ["[aria-label=\"Close\"]"],
  "optional": true
}
```

If it fails, the flow continues (no error returned).

---

## All Available Actions

Every public method on `ElectronPage` and its sub-modules can be used as an action.

### page.* (Direct Actions)

These are called as `"action": "methodName"`.

#### Navigation

| Action | Args | Description |
|--------|------|-------------|
| `goto` | `["https://example.com"]` | Navigate to URL |
| `reload` | `[]` | Reload page |
| `reloadIgnoringCache` | `[]` | Reload without cache |
| `goBack` | `[]` | Go back in history |
| `goForward` | `[]` | Go forward in history |
| `stop` | `[]` | Stop loading |
| `goToIndex` | `[2]` | Go to specific history index |
| `clearHistory` | `[]` | Clear navigation history |
| `waitForNavigation` | `[30000]` | Wait for page load (timeout ms) |
| `waitForNetworkIdle` | `[30000]` | Wait until network is idle |

#### Waiting

| Action | Args | Description |
|--------|------|-------------|
| `waitForTimeout` | `[2000]` | Wait for N milliseconds |
| `waitForSelector` | `["div.loaded", 10000]` | Wait until selector exists (timeout ms) |
| `waitForFunction` | `["() => document.title === 'Done'", 5000]` | Wait for JS condition |

#### Element Interaction

| Action | Args | Description |
|--------|------|-------------|
| `click` | `["button.submit"]` | Click element by CSS selector |
| `type` | `[".input", "hello", 50]` | Focus + type text (delay per char in ms) |
| `hover` | `["a.link"]` | Hover over element |
| `focus` | `["input.email"]` | Focus an element |
| `select` | `["select#country", "ID"]` | Set select/input value + dispatch change |
| `check` | `["input#agree"]` | Check a checkbox |
| `uncheck` | `["input#agree"]` | Uncheck a checkbox |
| `clickByXpath` | `["//button[text()='OK']"]` | Click by XPath expression |
| `typeByXpath` | `["//input[@name='q']", "search text", 30]` | Type into element by XPath |

#### File Upload

| Action | Args | Description |
|--------|------|-------------|
| `upload` | `["input[type='file']", "/path/to/file.jpg"]` | Upload file to input |
| `uploadByIndex` | `["input[type='file']", 0, "/path/to/file.jpg"]` | Upload to Nth matching input |
| `interceptFileChooser` | `["/path/to/file.jpg"]` | Auto-provide file on next file dialog |
| `stopInterceptFileChooser` | `[]` | Stop intercepting file choosers |

#### Screenshot & PDF

| Action | Args | Description |
|--------|------|-------------|
| `screenshot` | `[{ "path": "/tmp/shot.png" }]` | Capture screenshot |
| `pdf` | `[{ "path": "/tmp/page.pdf" }]` | Export page as PDF |

#### Page Info

| Action | Args | Description |
|--------|------|-------------|
| `evaluate` | `["document.title"]` | Run JavaScript and return result |
| `pageSource` | `[]` | Get full HTML source |

#### Cookies

| Action | Args | Description |
|--------|------|-------------|
| `getCookies` | `[{}]` | Get cookies (optional filter) |
| `setCookies` | `[[{ "url": "https://x.com", "name": "a", "value": "1" }]]` | Set multiple cookies |
| `setCookie` | `[{ "url": "https://x.com", "name": "a", "value": "1" }]` | Set single cookie |
| `deleteCookie` | `["https://x.com", "cookieName"]` | Delete a cookie |
| `clearCookies` | `[]` | Clear all cookies |
| `flushCookies` | `[]` | Flush cookies to disk |

#### localStorage

| Action | Args | Description |
|--------|------|-------------|
| `getLocalStorage` | `["key"]` | Get value from localStorage |
| `setLocalStorage` | `["key", "value"]` | Set value in localStorage |
| `removeLocalStorage` | `["key"]` | Remove key from localStorage |
| `clearLocalStorage` | `[]` | Clear all localStorage |

#### sessionStorage

| Action | Args | Description |
|--------|------|-------------|
| `getSessionStorage` | `["key"]` | Get value from sessionStorage |
| `setSessionStorage` | `["key", "value"]` | Set value in sessionStorage |
| `removeSessionStorage` | `["key"]` | Remove key from sessionStorage |
| `clearSessionStorage` | `[]` | Clear all sessionStorage |

#### Browser Emulation

| Action | Args | Description |
|--------|------|-------------|
| `setUserAgent` | `["Mozilla/5.0..."]` | Set custom user agent |
| `setViewport` | `[1280, 720]` | Set viewport size |
| `setExtraHTTPHeaders` | `[{ "X-Custom": "value" }]` | Set extra HTTP headers |
| `setMobile` | `["iphone12"]` | Switch to mobile emulation preset |
| `emulateDevice` | `[{ "width": 390, "height": 844 }]` | Custom device emulation |
| `setDesktop` | `[]` | Reset to desktop mode |

Available `setMobile` presets: `iphone12`, `iphone14pro`, `iphoneSE`, `pixel7`, `galaxyS21`, `ipadAir`, `ipadPro`

#### Zoom

| Action | Args | Description |
|--------|------|-------------|
| `setZoom` | `[1.5]` | Set zoom factor (1.0 = 100%) |
| `setZoomLevel` | `[2]` | Set Chromium zoom level (0 = 100%) |

#### Text Search

| Action | Args | Description |
|--------|------|-------------|
| `findText` | `["search term", { "matchCase": true }]` | Find text on page |
| `stopFindText` | `["clearSelection"]` | Stop search + clear highlights |

#### Frames / iFrames

| Action | Args | Description |
|--------|------|-------------|
| `evaluateInFrame` | `[1, "document.title"]` | Run JS in iframe (by index or name) |
| `clickInFrame` | `[1, "button.submit"]` | Click element inside iframe |
| `typeInFrame` | `[1, "input.name", "hello", 30]` | Type in iframe element |

#### WebRTC

| Action | Args | Description |
|--------|------|-------------|
| `setWebRTCPolicy` | `["disable_non_proxied_udp"]` | Set WebRTC IP handling policy |

Policies: `default`, `default_public_and_private_interfaces`, `default_public_interface_only`, `disable_non_proxied_udp`

#### Permissions

| Action | Args | Description |
|--------|------|-------------|
| `setPermissions` | `[{ "media": "grant", "geolocation": "deny" }]` | Set permission rules |
| `grantAllPermissions` | `[]` | Auto-grant all permissions |
| `clearPermissions` | `[]` | Reset permission handlers |

#### Popups

| Action | Args | Description |
|--------|------|-------------|
| `blockPopups` | `[]` | Block all popup windows |
| `allowPopups` | `[]` | Allow all popup windows |

---

### keyboard.* (Keyboard Actions)

Use `"action": "keyboard.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `keyboard.type` | `["hello world", 50]` | Type text char by char (delay ms) |
| `keyboard.press` | `["Enter"]` | Press single key |
| `keyboard.down` | `["Shift"]` | Hold key down |
| `keyboard.up` | `["Shift"]` | Release key |
| `keyboard.shortcut` | `[["Control", "a"]]` | Press key combo |

Available special keys: `Enter`, `Tab`, `Backspace`, `Delete`, `Escape`, `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, `PageUp`, `PageDown`, `F1`-`F12`, `Control`, `Shift`, `Alt`, `Meta`, `Space`

---

### mouse.* (Mouse Actions)

Use `"action": "mouse.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `mouse.move` | `[100, 200]` | Move mouse to (x, y) |
| `mouse.click` | `[100, 200, "left"]` | Click at coordinates |
| `mouse.doubleClick` | `[100, 200]` | Double-click at coordinates |
| `mouse.rightClick` | `[100, 200]` | Right-click at coordinates |
| `mouse.drag` | `[100, 200, 300, 400, 10]` | Drag from→to (steps) |
| `mouse.wheel` | `[0, -300, 100, 200]` | Scroll wheel (deltaX, deltaY, x, y) |

---

### touch.* (Touch Actions)

Use `"action": "touch.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `touch.tap` | `[200, 300]` | Tap at (x, y) |
| `touch.doubleTap` | `[200, 300]` | Double tap |
| `touch.longPress` | `[200, 300, 800]` | Long press (duration ms) |
| `touch.swipe` | `[200, 500, 200, 100, 10, 300]` | Swipe from→to (steps, duration) |
| `touch.pinch` | `[200, 300, 100, 50, 10]` | Pinch (cx, cy, startDist, endDist, steps) |
| `touch.scroll` | `[200, 300, 0, -200, 5]` | Scroll via touch |

---

### network.* (Network Actions)

Use `"action": "network.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `network.enable` | `[]` | Enable network monitoring |
| `network.disable` | `[]` | Disable network monitoring |
| `network.blockResourceTypes` | `[["Image", "Media"]]` | Block resource types |
| `network.setExtraHTTPHeaders` | `[{ "Authorization": "Bearer xxx" }]` | Set HTTP headers |

---

### dialogs.* (Dialog Actions)

Use `"action": "dialogs.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `dialogs.enable` | `[{ "acceptAlerts": true, "promptText": "ok" }]` | Enable auto-handling of alert/confirm/prompt |
| `dialogs.disable` | `[]` | Disable dialog handling |
| `dialogs.clearHistory` | `[]` | Clear dialog history |

---

### downloads.* (Download Actions)

Use `"action": "downloads.methodName"`.

| Action | Args | Description |
|--------|------|-------------|
| `downloads.enable` | `[{ "savePath": "/tmp/downloads", "autoAccept": true }]` | Enable download handling |
| `downloads.disable` | `[]` | Disable download handling |
| `downloads.downloadURL` | `["https://example.com/file.zip"]` | Trigger download by URL |
| `downloads.cancel` | `["dl_1"]` | Cancel a download |

---

## Full Example: Facebook Comment Flow

**`flows/comment-on-post.json`**

```json
[
  { "action": "waitForTimeout", "args": [2000] },

  {
    "action": "click",
    "args": ["[aria-label=\"Comment\"]"],
    "fallback": {
      "action": "click",
      "args": ["div[role=\"textbox\"][contenteditable=\"true\"]"]
    }
  },

  { "action": "waitForTimeout", "args": [1500] },

  {
    "action": "waitForSelector",
    "args": ["div[role=\"textbox\"][contenteditable=\"true\"]", 5000],
    "optional": true
  },

  {
    "action": "focus",
    "args": ["div[role=\"textbox\"][contenteditable=\"true\"]"]
  },

  { "action": "waitForTimeout", "args": [300] },
  { "action": "keyboard.shortcut", "args": [["Control", "a"]] },
  { "action": "keyboard.press", "args": ["Backspace"] },
  { "action": "keyboard.type", "args": ["{{commentText}}", 50] },
  { "action": "waitForTimeout", "args": [500] },

  {
    "action": "upload",
    "args": ["[role=\"dialog\"] [role=\"table\"] input[type=\"file\"]", "{{imagePath}}"],
    "if": "{{imagePath}}",
    "optional": true
  },

  { "action": "waitForTimeout", "args": [3000], "if": "{{imagePath}}" },

  {
    "action": "click",
    "args": ["#focused-state-composer-submit [role=\"button\"]"],
    "fallback": {
      "action": "click",
      "args": ["[aria-label=\"Comment\"]"],
      "fallback": {
        "action": "keyboard.press",
        "args": ["Enter"]
      }
    }
  },

  { "action": "waitForTimeout", "args": [3000] }
]
```

**Usage:**

```js
const { runFlow } = require('./lib/flow-runner')
const commentFlow = require('./features/auto-comment/flows/comment-on-post.json')

async function commentOnPost(page, commentText, imagePath) {
  const result = await runFlow(page, commentFlow, {
    commentText,
    imagePath: imagePath || ''
  })
  return result.ok
}
```

---

## Full Example: Login Flow

**`flows/login.json`**

```json
[
  { "action": "goto", "args": ["https://example.com/login"] },
  { "action": "waitForSelector", "args": ["input[name='email']", 10000] },
  { "action": "click", "args": ["input[name='email']"] },
  { "action": "keyboard.type", "args": ["{{email}}", 30] },
  { "action": "click", "args": ["input[name='password']"] },
  { "action": "keyboard.type", "args": ["{{password}}", 30] },
  { "action": "click", "args": ["button[type='submit']"] },
  { "action": "waitForNavigation", "args": [15000] },
  { "action": "waitForTimeout", "args": [2000] }
]
```

```js
await runFlow(page, loginFlow, { email: 'user@mail.com', password: 's3cret' })
```
