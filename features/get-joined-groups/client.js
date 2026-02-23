// Get Joined Groups — per-slot data
const _groupSlotData = {} // { slot: { groups: [] } }
let joinedGroups = []
let isScrapingGroups = false

function _saveGroupSlot(slot) {
  _groupSlotData[slot] = { groups: joinedGroups }
}

function _loadGroupSlot(slot) {
  const data = _groupSlotData[slot] || { groups: [] }
  joinedGroups = data.groups
  renderGroupTable()
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
  if (action === 'save') _saveGroupSlot(slot)
  if (action === 'load') _loadGroupSlot(slot)
})

// Listen for incremental results from main process
window.api.on('groups-found', (slot, groups) => {
  if (_groupSlotData[slot]) _groupSlotData[slot].groups = groups
  if (slot !== currentSlot) return
  joinedGroups = groups
  renderGroupTable()
})

window.api.on('groups-done', (slot) => {
  if (slot !== currentSlot) return
  isScrapingGroups = false
  updateGroupButtons()
  setStatus('Scraping complete! Found ' + joinedGroups.length + ' groups', 'success')
})

async function startGetGroups() {
  isScrapingGroups = true
  joinedGroups = []
  renderGroupTable()
  updateGroupButtons()
  setStatus('Starting group scraping...', 'info')

  const res = await window.api.invoke('start-get-groups', currentSlot)
  isScrapingGroups = false
  updateGroupButtons()

  if (res.ok) {
    joinedGroups = res.groups
    renderGroupTable()
    setStatus('Done! Found ' + joinedGroups.length + ' groups', 'success')
  } else {
    setStatus('Error: ' + (res.error || 'Failed'), 'error')
  }
}

async function stopGetGroups() {
  await window.api.invoke('stop-get-groups', currentSlot)
  isScrapingGroups = false
  updateGroupButtons()
  setStatus('Scraping stopped. Found ' + joinedGroups.length + ' groups', 'info')
}

function clearGroups() {
  joinedGroups = []
  renderGroupTable()
  setStatus('Groups cleared', 'info')
}

async function saveGroupsTxt() {
  if (joinedGroups.length === 0) { setStatus('No groups to save', 'error'); return }
  setStatus('Saving...', 'info')
  const res = await window.api.invoke('save-groups-txt', currentSlot, joinedGroups)
  if (res.ok) setStatus('Saved to ' + res.path, 'success')
  else setStatus('Save cancelled', 'info')
}

async function importGroupsTxt() {
  const res = await window.api.invoke('import-groups-txt', currentSlot)
  if (res.ok) {
    joinedGroups = res.groups
    renderGroupTable()
    setStatus('Imported ' + res.groups.length + ' groups', 'success')
  }
}

function exportToAutoPost() {
  if (joinedGroups.length === 0) { setStatus('No groups to export', 'error'); return }
  if (typeof importGroupsToAutoPost === 'function') {
    importGroupsToAutoPost(joinedGroups)
    setStatus(`✅ Exported ${joinedGroups.length} groups to Auto Post Groups`, 'success')
  } else {
    setStatus('Auto Post Groups feature not available', 'error')
  }
}

function exportToAutoShare() {
  if (joinedGroups.length === 0) { setStatus('No groups to export', 'error'); return }
  if (typeof importGroupsToAutoShare === 'function') {
    importGroupsToAutoShare(joinedGroups)
    setStatus(`✅ Exported ${joinedGroups.length} groups to Auto Share Groups`, 'success')
  } else {
    setStatus('Auto Share Groups feature not available', 'error')
  }
}

function updateGroupButtons() {
  const startBtn = document.getElementById('btnStartGroups')
  const stopBtn = document.getElementById('btnStopGroups')
  const statusEl = document.getElementById('groupScrapingStatus')
  if (startBtn) startBtn.disabled = isScrapingGroups
  if (stopBtn) stopBtn.disabled = !isScrapingGroups
  if (statusEl) statusEl.classList.toggle('hidden', !isScrapingGroups)
}

function renderGroupTable() {
  const tbody = document.getElementById('groupTableBody')
  const countEl = document.getElementById('groupCount')
  if (countEl) countEl.textContent = joinedGroups.length

  if (joinedGroups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="px-2 py-4 text-center text-gray-600">No groups yet. Click Start to begin.</td></tr>'
    return
  }

  tbody.innerHTML = joinedGroups.map((g, i) => `
    <tr class="${i % 2 === 0 ? 'bg-dark-100' : 'bg-dark-400'}">
      <td class="px-2 py-1 text-gray-500">${i + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[200px]" title="${g.name}">${g.name}</td>
      <td class="px-2 py-1 text-gray-400 font-mono text-[10px]">${g.groupId}</td>
    </tr>
  `).join('')
}
