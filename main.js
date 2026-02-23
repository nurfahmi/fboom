const { app, BrowserWindow, ipcMain } = require('electron')
const { BrowserManager } = require('ishbrowser')
const path = require('path')
const ejs = require('ejs')
const fs = require('fs')
const Store = require('./lib/store')

const SLOT_COUNT = 2
const COLS = 2
const ROWS = 1
const HEADER_H = 56

let managerWindow = null
let browserWindow = null
let manager = null
const pages = new Array(SLOT_COUNT).fill(null)
let expandedSlot = -1
let currentGroup = null

// --- Store ---
const store = new Store(path.join(__dirname, 'data', 'accounts.json'))

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

// --- Layout ---
function layoutBrowsers() {
  if (!browserWindow) return
  const bounds = browserWindow.getContentBounds()

  if (expandedSlot >= 0) {
    const leftWidth = Math.floor(bounds.width * 0.3)
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (pages[i] && pages[i].view) {
        if (i === expandedSlot) {
          pages[i].view.setBounds({
            x: leftWidth, y: 0,
            width: bounds.width - leftWidth, height: bounds.height
          })
        } else {
          pages[i].view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
        }
      }
    }
  } else {
    const cellW = Math.floor(bounds.width / COLS)
    const cellH = Math.floor(bounds.height / ROWS)
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (pages[i] && pages[i].view) {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        pages[i].view.setBounds({
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

// --- Browser Grid Window ---
async function launchGroup(groupId) {
  const group = store.getGroups().find(g => g.id === groupId)
  if (!group) return

  // Close existing browser window
  if (browserWindow) {
    if (manager) await manager.cleanup()
    pages.fill(null)
    browserWindow.close()
    browserWindow = null
    manager = null
  }

  currentGroup = group
  expandedSlot = -1

  // Accounts are directly in the group, index = slot
  const slotAccounts = [...group.accounts]
  // Pad to SLOT_COUNT with nulls
  while (slotAccounts.length < SLOT_COUNT) slotAccounts.push(null)

  browserWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: `Group: ${group.name}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  browserWindow.setMaxListeners(20)

  // Render browser grid template
  const template = fs.readFileSync(path.join(__dirname, 'views', 'index.ejs'), 'utf8')
  const html = ejs.render(template, {
    slotCount: SLOT_COUNT,
    features,
    groupName: group.name,
    slotAccounts: JSON.stringify(slotAccounts)
  })
  const tmpHtml = path.join(__dirname, 'views', '_rendered.html')
  fs.writeFileSync(tmpHtml, html)
  browserWindow.loadFile(tmpHtml)

  manager = new BrowserManager(browserWindow)

  // Auto-open browsers for assigned slots
  browserWindow.webContents.once('did-finish-load', async () => {
    const navPromises = []
    for (let i = 0; i < SLOT_COUNT; i++) {
      const account = slotAccounts[i]
      if (account) {
        // Use account ID as profile for persistent sessions
        pages[i] = manager.createProfile(account.id)
        navPromises.push(
          pages[i].goto('https://www.facebook.com')
            .catch(e => console.log(`Slot ${i} nav error:`, e.message))
        )
      }
    }
    layoutBrowsers()
    await Promise.all(navPromises)
    browserWindow.webContents.send('all-opened')
  })

  browserWindow.on('resize', () => layoutBrowsers())
  browserWindow.on('closed', () => {
    // DON'T call manager.cleanup() — it wipes session data (cookies/login)
    // The persist: partition keeps data on disk automatically
    pages.fill(null)
    browserWindow = null
    manager = null
    currentGroup = null
  })
}

// --- App Ready ---
app.whenReady().then(() => {
  // Register feature handlers
  features.forEach(f => f.register((slot) => pages[slot]))

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

  // Browser grid IPC
  ipcMain.handle('open-browser', async (e, slot) => {
    if (!currentGroup || slot < 0 || slot >= SLOT_COUNT) return { ok: false }
    const acc = currentGroup.accounts[slot]
    if (!acc) return { ok: false, error: 'No account in this slot' }
    if (pages[slot] && pages[slot].view) {
      try { browserWindow.removeBrowserView(pages[slot].view) } catch (e) { }
    }
    pages[slot] = manager.createProfile(acc.id)
    layoutBrowsers()
    await pages[slot].goto('https://www.facebook.com')
    return { ok: true }
  })

  ipcMain.handle('navigate', async (e, slot, url) => {
    if (!pages[slot]) return { ok: false, error: 'No browser open' }
    await pages[slot].goto(url)
    return { ok: true }
  })

  ipcMain.handle('go-back', async (e, slot) => {
    if (!pages[slot]) return { ok: false }
    await pages[slot].goBack()
    return { ok: true }
  })

  ipcMain.handle('go-forward', async (e, slot) => {
    if (!pages[slot]) return { ok: false }
    await pages[slot].goForward()
    return { ok: true }
  })

  ipcMain.handle('reload-page', async (e, slot) => {
    if (!pages[slot]) return { ok: false }
    await pages[slot].reload()
    return { ok: true }
  })

  ipcMain.handle('take-screenshot', async (e, slot) => {
    if (!pages[slot]) return { ok: false }
    const screenshotPath = path.join(__dirname, 'screenshots', `slot${slot}_${Date.now()}.png`)
    fs.mkdirSync(path.join(__dirname, 'screenshots'), { recursive: true })
    await pages[slot].screenshot({ path: screenshotPath })
    return { ok: true, path: screenshotPath }
  })

  ipcMain.handle('close-browser', async (e, slot) => {
    if (pages[slot] && pages[slot].view) {
      try { browserWindow.removeBrowserView(pages[slot].view) } catch (e) { }
      pages[slot] = null
    }
    layoutBrowsers()
    return { ok: true }
  })

  ipcMain.handle('expand-slot', async (e, slot) => {
    expandedSlot = slot
    layoutBrowsers()
    return { ok: true }
  })

  ipcMain.handle('collapse-all', async () => {
    expandedSlot = -1
    layoutBrowsers()
    return { ok: true }
  })

  // Hide/show browser views (so modals can appear on top)
  ipcMain.handle('hide-browser-views', () => {
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (pages[i] && pages[i].view) {
        pages[i].view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 })
      }
    }
    return { ok: true }
  })

  ipcMain.handle('show-browser-views', () => {
    layoutBrowsers()
    return { ok: true }
  })

  // Start with manager
  openManager()
})

app.on('window-all-closed', async () => {
  if (manager) await manager.cleanup()
  app.quit()
})
