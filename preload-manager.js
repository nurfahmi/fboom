const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getGroups: () => ipcRenderer.invoke('get-groups'),
  getGroup: (id) => ipcRenderer.invoke('get-group', id),
  addGroup: (name) => ipcRenderer.invoke('add-group', name),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),
  addAccount: (groupId, name) => ipcRenderer.invoke('add-account', groupId, name),
  removeAccount: (groupId, accountId) => ipcRenderer.invoke('remove-account', groupId, accountId),
  renameAccount: (groupId, accountId, name) => ipcRenderer.invoke('rename-account', groupId, accountId, name),
  generateAccounts: (groupId) => ipcRenderer.invoke('generate-accounts', groupId),
  launchGroup: (groupId) => ipcRenderer.invoke('launch-group', groupId)
})
