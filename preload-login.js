const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
    checkSession: () => ipcRenderer.invoke('license-check-session'),
    login: (licenseKey) => ipcRenderer.invoke('license-login', licenseKey),
    proceed: () => ipcRenderer.invoke('license-proceed')
})
