const { app, BrowserWindow, ipcMain } = require('electron')
const { BrowserManager } = require('ishbrowser')
const path = require('path')
const ejs = require('ejs')
const fs = require('fs')
const Store = require('./lib/store')
const LicenseManager = require('./lib/license')

const SLOT_COUNT = 2
const COLS = 2
const ROWS = 1
const HEADER_H = 80

let managerWindow = null
let loginWindow = null

// --- Multi-group support: Map of groupId -> context ---
const activeGroups = new Map()
// Each context: { window, manager, group, pages, expandedSlot, sidebarWidth }

// --- Store ---
const store = new Store(path.join(__dirname, 'data', 'accounts.json'))
const license = new LicenseManager(path.join(__dirname, 'data'))

// --- Auto-discover features ---
const featuresDir = path.join(__dirname, 'features')
const featureFolders = fs.readdirSync(featuresDir).filter(f =>
  fs.statSync(path.join(featuresDir, f)).isDirectory()
)

const features = featureFolders.map(name => {
  const dir = path.join(featuresDir, name)
  const uiPath = path.join(dir, 'ui.ejs')
  const clientPath = path.join(dir, 'client.js')

  return {
    name,
    ui: fs.existsSync(uiPath) ? fs.readFileSync(uiPath, 'utf8') : '',
    client: fs.existsSync(clientPath) ? fs.readFileSync(clientPath, 'utf8') : '',
    register: require(path.join(dir, 'handler.js'))
  }
})

// --- Helper: find group context by sender (webContents) ---
function getGroupContext(sender) {
  for (const [, ctx] of activeGroups) {
    if (ctx.window && !ctx.window.isDestroyed() && ctx.window.webContents === sender) {
      return ctx
    }
  }
  return null
}

// --- Layout ---
function layoutBrowsers(ctx) {
  if (!ctx || !ctx.window || ctx.window.isDestroyed()) return
  const bounds = ctx.window.getContentBounds()

  if (ctx.expandedSlot >= 0) {
    const leftWidth = ctx.sidebarWidth + 6
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (ctx.pages[i] && ctx.pages[i].view) {
        if (i === ctx.expandedSlot) {
          ctx.pages[i].view.setBounds({
            x: leftWidth, y: 0,
            width: bounds.width - leftWidth, height: bounds.height
          })
        } else {
          ctx.pages[i].view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
        }
      }
    }
  } else {
    const cellW = Math.floor(bounds.width / COLS)
    const cellH = Math.floor(bounds.height / ROWS)
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (ctx.pages[i] && ctx.pages[i].view) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        ctx.pages[i].view.setBounds({
          x: col * cellW,
          y: row * cellH + HEADER_H,
          width: cellW,
          height: cellH - HEADER_H
        })
      }
    }
  }
}

// --- Manager Window ---
function openManager() {
  if (managerWindow) { managerWindow.focus(); return }

  managerWindow = new BrowserWindow({
    width: 900,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload-manager.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const template = fs.readFileSync(path.join(__dirname, 'views', 'manager.ejs'), 'utf8')
  const html = ejs.render(template, {})
  const tmpHtml = path.join(__dirname, 'views', '_rendered_manager.html')
  fs.writeFileSync(tmpHtml, html)
  managerWindow.loadFile(tmpHtml)

  managerWindow.on('closed', () => { managerWindow = null })
}

// --- Login Window ---
function openLogin() {
  if (loginWindow) { loginWindow.focus(); return }

  loginWindow = new BrowserWindow({
    width: 480,
    height: 580,
    resizable: false,
    maximizable: false,
    title: 'FBOOMX V2 — License',
    webPreferences: {
      preload: path.join(__dirname, 'preload-login.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  loginWindow.removeMenu()

  const template = fs.readFileSync(path.join(__dirname, 'views', 'login.ejs'), 'utf8')
  const html = ejs.render(template, {})
  const tmpHtml = path.join(__dirname, 'views', '_rendered_login.html')
  fs.writeFileSync(tmpHtml, html)
  loginWindow.loadFile(tmpHtml)

  loginWindow.on('closed', () => { loginWindow = null })
}

async function startApp() {
  const session = license.checkSession()
  if (session.valid) {
    const result = await license.validateLicense(session.license, session.pcid)
    if (result.success) {
      license.saveSession(session.license, session.pcid)
      openManager()
      return
    }
    if (result.clearSession) {
      license.clearSession()
    } else {
      openManager()
      return
    }
  }
  openLogin()
}

// --- Browser Grid Window ---
async function launchGroup(groupId) {
  const group = store.getGroups().find(g => g.id === groupId)
  if (!group) return

  // If this group is already launched, just focus the window
  const existing = activeGroups.get(groupId)
  if (existing && existing.window && !existing.window.isDestroyed()) {
    existing.window.focus()
    if (existing.window.isMinimized()) existing.window.restore()
    return
  }

  // Accounts are directly in the group, index = slot
  const slotAccounts = [...group.accounts]
  while (slotAccounts.length < SLOT_COUNT) slotAccounts.push(null)

  const newWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: `Group: ${group.name}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  newWindow.setMaxListeners(20)

  // Create manager BEFORE loading file
  const newManager = new BrowserManager(newWindow)

  // Create context for this group
  const ctx = {
    window: newWindow,
    manager: newManager,
    group: group,
    pages: new Array(SLOT_COUNT).fill(null),
    expandedSlot: -1,
    sidebarWidth: 350
  }

  // Store in active groups map
  activeGroups.set(groupId, ctx)

  // Render browser grid template
  const template = fs.readFileSync(path.join(__dirname, 'views', 'index.ejs'), 'utf8')
  let html = ejs.render(template, {
    slotCount: SLOT_COUNT,
    features,
    groupName: group.name,
    slotAccounts: JSON.stringify(slotAccounts)
  })

  const featureUIs = features.map((f, idx) =>
    `<div class="feature-panel" data-panel="${f.name}" style="${idx === 0 ? '' : 'display:none;'}">${f.ui}</div>`
  ).join('\n')
  html = html.replace('<!-- INJECT_FEATURE_UIS -->', featureUIs)

  const clientScripts = features.map(f => `<script>${f.client}</script>`).join('\n')
  html = html.replace('<!-- INJECT_CLIENT_SCRIPTS -->', clientScripts)

  // Use unique temp file per group to avoid conflicts
  const tmpHtml = path.join(__dirname, 'views', `_rendered_${groupId}.html`)
  fs.writeFileSync(tmpHtml, html)

  // Auto-open browsers for assigned slots
  newWindow.webContents.once('did-finish-load', async () => {
    try {
      if (newWindow.isDestroyed()) return

      // Override GridManager's layout BEFORE creating profiles
      if (newManager._gridManager) {
        newManager._gridManager._applyLayout = () => { }
      }

      const navPromises = []
      for (let i = 0; i < SLOT_COUNT; i++) {
        const account = slotAccounts[i]
        if (account) {
          ctx.pages[i] = newManager.createProfile(account.id)
          navPromises.push(
            ctx.pages[i].goto('https://www.facebook.com')
              .catch(e => console.log(`[Group ${group.name}] Slot ${i} nav error:`, e.message))
          )
        }
      }

      layoutBrowsers(ctx)
      await Promise.all(navPromises)
      if (!newWindow.isDestroyed()) {
        newWindow.webContents.send('all-opened')
      }
    } catch (err) {
      console.error(`[Group ${group.name}] Browser init error:`, err)
    }
  })

  // Load the file AFTER registering the did-finish-load handler
  await newWindow.loadFile(tmpHtml)

  newWindow.on('resize', () => layoutBrowsers(ctx))

  newWindow.on('closed', () => {
    // Remove from active groups
    activeGroups.delete(groupId)

    // Clean up temp file
    try { fs.unlinkSync(tmpHtml) } catch (e) { }

    // Notify manager window so it can update buttons
    if (managerWindow && !managerWindow.isDestroyed()) {
      managerWindow.webContents.send('group-window-closed', groupId)
    }
  })
}

// --- App Ready ---
app.whenReady().then(() => {
  // Register feature handlers with a getPage that resolves by sender
  features.forEach(f => f.register((slot, sender) => {
    if (sender) {
      const ctx = getGroupContext(sender)
      return ctx ? ctx.pages[slot] : null
    }
    // Fallback: return first active group's page (for backward compat)
    for (const [, ctx] of activeGroups) {
      if (ctx.pages[slot]) return ctx.pages[slot]
    }
    return null
  }))

  // Manager IPC
  ipcMain.handle('get-groups', () => store.getGroups())
  ipcMain.handle('get-group', (e, id) => store.getGroup(id))
  ipcMain.handle('add-group', (e, name) => store.addGroup(name))
  ipcMain.handle('delete-group', (e, id) => { store.deleteGroup(id) })
  ipcMain.handle('add-account', (e, groupId, name) => store.addAccount(groupId, name))
  ipcMain.handle('remove-account', (e, groupId, accountId) => { store.removeAccount(groupId, accountId) })
  ipcMain.handle('rename-account', (e, groupId, accountId, name) => { store.renameAccount(groupId, accountId, name) })
  ipcMain.handle('generate-accounts', (e, groupId) => store.generateAccounts(groupId))
  ipcMain.handle('launch-group', async (e, groupId) => { await launchGroup(groupId) })
  ipcMain.handle('is-group-launched', (e, groupId) => {
    const ctx = activeGroups.get(groupId)
    return !!(ctx && ctx.window && !ctx.window.isDestroyed())
  })
  ipcMain.handle('focus-group-window', (e, groupId) => {
    const ctx = activeGroups.get(groupId)
    if (ctx && ctx.window && !ctx.window.isDestroyed()) {
      ctx.window.focus()
      if (ctx.window.isMinimized()) ctx.window.restore()
    }
  })

  // Browser grid IPC — uses sender to find the right group context
  ipcMain.handle('open-browser', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || slot < 0 || slot >= SLOT_COUNT) return { ok: false }
    const acc = ctx.group.accounts[slot]
    if (!acc) return { ok: false, error: 'No account in this slot' }
    if (ctx.pages[slot] && ctx.pages[slot].view) {
      try { ctx.window.removeBrowserView(ctx.pages[slot].view) } catch (e) { }
    }
    ctx.pages[slot] = ctx.manager.createProfile(acc.id)
    layoutBrowsers(ctx)
    await ctx.pages[slot].goto('https://www.facebook.com')
    return { ok: true }
  })

  ipcMain.handle('navigate', async (e, slot, url) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || !ctx.pages[slot]) return { ok: false, error: 'No browser open' }
    await ctx.pages[slot].goto(url)
    return { ok: true }
  })

  ipcMain.handle('go-back', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || !ctx.pages[slot]) return { ok: false }
    await ctx.pages[slot].goBack()
    return { ok: true }
  })

  ipcMain.handle('go-forward', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || !ctx.pages[slot]) return { ok: false }
    await ctx.pages[slot].goForward()
    return { ok: true }
  })

  ipcMain.handle('reload-page', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || !ctx.pages[slot]) return { ok: false }
    await ctx.pages[slot].reload()
    return { ok: true }
  })

  ipcMain.handle('take-screenshot', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx || !ctx.pages[slot]) return { ok: false }
    const screenshotPath = path.join(__dirname, 'screenshots', `slot${slot}_${Date.now()}.png`)
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true })
    await ctx.pages[slot].screenshot({ path: screenshotPath })
    return { ok: true, path: screenshotPath }
  })

  ipcMain.handle('close-browser', async (e, slot) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    if (ctx.pages[slot] && ctx.pages[slot].view) {
      try { ctx.window.removeBrowserView(ctx.pages[slot].view) } catch (e) { }
      ctx.pages[slot] = null
    }
    layoutBrowsers(ctx)
    return { ok: true }
  })

  ipcMain.handle('expand-slot', async (e, slot, width) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    ctx.expandedSlot = slot
    if (width) ctx.sidebarWidth = width
    layoutBrowsers(ctx)
    return { ok: true }
  })

  ipcMain.handle('resize-sidebar', async (e, width) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    ctx.sidebarWidth = width
    layoutBrowsers(ctx)
    return { ok: true }
  })

  ipcMain.handle('collapse-all', async (e) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    ctx.expandedSlot = -1
    layoutBrowsers(ctx)
    return { ok: true }
  })

  // Hide/show browser views (so modals can appear on top)
  ipcMain.handle('hide-browser-views', (e) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (ctx.pages[i] && ctx.pages[i].view) {
        ctx.pages[i].view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
      }
    }
    return { ok: true }
  })

  ipcMain.handle('show-browser-views', (e) => {
    const ctx = getGroupContext(e.sender)
    if (!ctx) return { ok: false }
    layoutBrowsers(ctx)
    return { ok: true }
  })

  // License IPC
  ipcMain.handle('license-check-session', () => license.checkSession())
  ipcMain.handle('license-login', async (e, licenseKey) => {
    const pcid = license.getPcId()
    const result = await license.validateLicense(licenseKey, pcid)
    if (result.success) {
      license.saveSession(licenseKey, pcid)
    } else if (result.clearSession) {
      license.clearSession()
    }
    return result
  })
  ipcMain.handle('license-proceed', () => {
    openManager()
    if (loginWindow) { loginWindow.close(); loginWindow = null }
    return { ok: true }
  })
  ipcMain.handle('license-reset-device', async () => {
    // 1. Get current session to find the license key
    const session = license.checkSession()
    const licenseKey = session.license || ''

    // 2. Call reset device API (if we have a key)
    let apiResult = { success: true }
    if (licenseKey) {
      apiResult = await license.resetDevice(licenseKey)
    }

    // 3. Clear local session regardless of API result
    license.clearSession()

    // 4. Close all browser group windows
    for (const [groupId, ctx] of activeGroups) {
      if (ctx.window && !ctx.window.isDestroyed()) {
        ctx.window.removeAllListeners('closed')
        ctx.window.close()
      }
    }
    activeGroups.clear()

    // 5. Close manager window
    if (managerWindow && !managerWindow.isDestroyed()) {
      managerWindow.removeAllListeners('closed')
      managerWindow.close()
      managerWindow = null
    }

    // 6. Open login window
    openLogin()

    return { ok: true, apiResult }
  })

  // Start with license check
  startApp()
})

app.on('window-all-closed', async () => {
  for (const [, ctx] of activeGroups) {
    if (ctx.manager) {
      try { await ctx.manager.cleanup() } catch (e) { }
    }
  }
  app.quit()
})
