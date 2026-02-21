const fs = require('fs')
const path = require('path')

class Store {
  constructor(filePath) {
    this.path = filePath
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    this.data = this.load()
  }

  load() {
    try {
      if (fs.existsSync(this.path)) {
        return JSON.parse(fs.readFileSync(this.path, 'utf8'))
      }
    } catch (e) {}
    return { groups: [] }
  }

  save() {
    fs.writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }

  // --- Groups ---
  getGroups() { return this.data.groups }

  getGroup(id) { return this.data.groups.find(g => g.id === id) }

  addGroup(name) {
    const group = {
      id: 'grp_' + Date.now(),
      name,
      accounts: []
    }
    this.data.groups.push(group)
    this.save()
    return group
  }

  deleteGroup(id) {
    this.data.groups = this.data.groups.filter(g => g.id !== id)
    this.save()
  }

  // --- Accounts (inside groups) ---
  addAccount(groupId, name) {
    const group = this.getGroup(groupId)
    if (!group || group.accounts.length >= 10) return null
    const acc = { id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), name }
    group.accounts.push(acc)
    this.save()
    return acc
  }

  removeAccount(groupId, accountId) {
    const group = this.getGroup(groupId)
    if (!group) return
    group.accounts = group.accounts.filter(a => a.id !== accountId)
    this.save()
  }

  renameAccount(groupId, accountId, newName) {
    const group = this.getGroup(groupId)
    if (!group) return
    const acc = group.accounts.find(a => a.id === accountId)
    if (acc) acc.name = newName
    this.save()
  }

  generateAccounts(groupId, count = 10) {
    const group = this.getGroup(groupId)
    if (!group) return
    const existing = group.accounts.length
    const toCreate = Math.min(count, 10 - existing)
    for (let i = 0; i < toCreate; i++) {
      group.accounts.push({
        id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: `Account ${existing + i + 1}`
      })
    }
    this.save()
    return group
  }
}

module.exports = Store
