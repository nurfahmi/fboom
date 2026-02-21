const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Generic invoke — features use this
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Generic listeners — features use these
  on: (channel, cb) => ipcRenderer.on(channel, (e, ...args) => cb(...args)),

  // Core shortcuts
  openBrowser: (slot) => ipcRenderer.invoke('open-browser', slot),
  navigate: (slot, url) => ipcRenderer.invoke('navigate', slot, url),
  goBack: (slot) => ipcRenderer.invoke('go-back', slot),
  goForward: (slot) => ipcRenderer.invoke('go-forward', slot),
  reloadPage: (slot) => ipcRenderer.invoke('reload-page', slot),
  takeScreenshot: (slot) => ipcRenderer.invoke('take-screenshot', slot),
  closeBrowser: (slot) => ipcRenderer.invoke('close-browser', slot),
  expandSlot: (slot) => ipcRenderer.invoke('expand-slot', slot),
  collapseAll: () => ipcRenderer.invoke('collapse-all'),
  onAllOpened: (cb) => ipcRenderer.on('all-opened', cb)
})
