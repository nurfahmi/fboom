// ====== AUTO SHARE GROUPS — Client JS ======
// Manages per-slot data and UI for the auto-share-groups feature.

const _sgSlotData = {} // per-slot storage
let sgRunning = false

function _saveSgSlot(slot) {
    _sgSlotData[slot] = _sgSlotData[slot] || { groups: [], postUrl: '', title: '', caption: '', delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    const data = _sgSlotData[slot]
    data.postUrl = document.getElementById('sgPostUrl')?.value || ''
    data.title = document.getElementById('sgTitle')?.value || ''
    data.caption = document.getElementById('sgCaption')?.value || ''
    data.delayMin = parseInt(document.getElementById('sgDelayMin')?.value) || 10
    data.delayMax = parseInt(document.getElementById('sgDelayMax')?.value) || 120
    data.restAfter = parseInt(document.getElementById('sgRestAfter')?.value) || 5
    data.restSeconds = parseInt(document.getElementById('sgRestSeconds')?.value) || 300
    data.running = sgRunning
}

function _loadSgSlot(slot) {
    const data = _sgSlotData[slot] || { groups: [], postUrl: '', title: '', caption: '', delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    _sgSlotData[slot] = data

    const urlEl = document.getElementById('sgPostUrl')
    if (urlEl) urlEl.value = data.postUrl

    const titleEl = document.getElementById('sgTitle')
    if (titleEl) titleEl.value = data.title || ''

    const capEl = document.getElementById('sgCaption')
    if (capEl) capEl.value = data.caption

    const fields = { sgDelayMin: data.delayMin, sgDelayMax: data.delayMax, sgRestAfter: data.restAfter, sgRestSeconds: data.restSeconds }
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id)
        if (el) el.value = val
    }

    sgRunning = data.running
    renderShareGroupsTable()
    updateShareGroupsButtons()
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
    if (action === 'save') _saveSgSlot(slot)
    if (action === 'load') _loadSgSlot(slot)
})

function _getCurSgData() {
    if (!_sgSlotData[currentSlot]) {
        _sgSlotData[currentSlot] = { groups: [], postUrl: '', title: '', caption: '', delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    }
    return _sgSlotData[currentSlot]
}

// ========================
// TAB SWITCHING
// ========================
function switchShareGroupTab(tab) {
    document.querySelectorAll('.sg-tab').forEach(el => {
        el.classList.remove('bg-accent', 'text-white')
        el.classList.add('bg-dark-100', 'text-gray-400')
    })
    document.querySelectorAll('.sg-panel').forEach(el => el.classList.add('hidden'))

    const activeBtn = document.querySelector(`.sg-tab[data-sgtab="${tab}"]`)
    if (activeBtn) {
        activeBtn.classList.add('bg-accent', 'text-white')
        activeBtn.classList.remove('bg-dark-100', 'text-gray-400')
    }
    const activePanel = document.querySelector(`.sg-panel[data-sgpanel="${tab}"]`)
    if (activePanel) activePanel.classList.remove('hidden')
}

// ========================
// TABLE RENDERING
// ========================
function renderShareGroupsTable() {
    const data = _getCurSgData()
    const filterVal = (document.getElementById('sgFilter')?.value || '').toLowerCase()
    const tbody = document.getElementById('sgTableBody')
    const countEl = document.getElementById('sgCount')
    if (!tbody) return

    const filtered = data.groups.filter(g => g.name.toLowerCase().includes(filterVal))
    const selectedCount = data.groups.filter(g => g._selected).length
    if (countEl) countEl.textContent = `${selectedCount} selected / ${data.groups.length} total`

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="px-2 py-3 text-center text-gray-600">No groups. Load from TXT or import.</td></tr>'
        return
    }

    tbody.innerHTML = filtered.map((g, idx) => {
        const realIdx = data.groups.indexOf(g)
        let statusBadge = ''
        switch (g.status) {
            case 'success': statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(34,197,94,0.15);color:#22c55e;">Success</span>'; break
            case 'error': statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(239,68,68,0.15);color:#ef4444;">Failed</span>'; break
            case 'processing': statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;background:rgba(234,179,8,0.15);color:#eab308;">Sharing...</span>'; break
            default: statusBadge = '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600;background:transparent;color:#666;">Pending</span>'
        }
        const checked = g._selected ? 'checked' : ''
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-1.5 py-1 text-center"><input type="checkbox" ${checked} onchange="toggleSgSelect(${realIdx}, this.checked)"></td>
      <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[150px]" title="${g.name}">${g.name}</td>
      <td class="px-2 py-1 text-gray-400 font-mono text-[10px]">${g.groupId}</td>
      <td class="px-2 py-1 text-center">${statusBadge}</td>
    </tr>`
    }).join('')
}

function toggleSgSelect(idx, checked) {
    const data = _getCurSgData()
    if (data.groups[idx]) data.groups[idx]._selected = checked
    renderShareGroupsTable()
}

function toggleSgSelectAll(checked) {
    const data = _getCurSgData()
    data.groups.forEach(g => g._selected = checked)
    renderShareGroupsTable()
}

// ========================
// BUTTON STATE
// ========================
function updateShareGroupsButtons() {
    const startBtn = document.getElementById('btnStartShareGroups')
    const stopBtn = document.getElementById('btnStopShareGroups')

    if (sgRunning) {
        if (startBtn) { startBtn.disabled = true; startBtn.classList.add('opacity-40', 'cursor-not-allowed') }
        if (stopBtn) { stopBtn.disabled = false; stopBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
    } else {
        if (startBtn) { startBtn.disabled = false; startBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
        if (stopBtn) { stopBtn.disabled = true; stopBtn.classList.add('opacity-40', 'cursor-not-allowed') }
    }
}

// ========================
// ACTIONS
// ========================
async function loadShareGroupsTxt() {
    const result = await window.api.invoke('load-share-groups-txt')
    if (!result.ok) return
    const data = _getCurSgData()
    data.groups = result.groups.map(g => ({ ...g, status: '', _selected: true }))
    renderShareGroupsTable()
    setStatus(`Loaded ${data.groups.length} groups from TXT`)
}

async function saveShareGroupsTxt() {
    const data = _getCurSgData()
    if (data.groups.length === 0) return setStatus('No groups to save', 'error')
    const result = await window.api.invoke('save-share-groups-txt', data.groups)
    if (result.ok) setStatus(`Saved ${data.groups.length} groups`)
}

function clearShareGroups() {
    const data = _getCurSgData()
    data.groups = []
    renderShareGroupsTable()
    setStatus('Groups cleared')
}

// Called by other features (e.g. get-joined-groups) to import groups
function importGroupsToAutoShare(groups) {
    const data = _getCurSgData()
    data.groups = groups.map(g => ({ name: g.name, groupId: g.groupId, status: '', _selected: true }))
    renderShareGroupsTable()
}

// ========================
// START / STOP AUTO SHARE
// ========================
async function startAutoShareGroups() {
    const data = _getCurSgData()
    const selected = data.groups.filter(g => g._selected)
    if (selected.length === 0) return setStatus('Select groups first (use checkboxes)', 'error')

    // Save form values
    _saveSgSlot(currentSlot)

    if (!data.postUrl) return setStatus('Please enter a Facebook post URL', 'error')

    if (!acquireSlotLock(currentSlot, 'Auto Share Groups')) return

    // Reset statuses on selected
    selected.forEach(g => g.status = '')
    renderShareGroupsTable()

    sgRunning = true
    data.running = true
    updateShareGroupsButtons()
    setStatus('Starting auto share to groups...', 'info')

    const config = {
        groups: selected,
        postUrl: data.postUrl,
        title: data.title,
        caption: data.caption,
        delayMin: data.delayMin,
        delayMax: data.delayMax,
        restAfter: data.restAfter,
        restSeconds: data.restSeconds
    }

    await window.api.invoke('start-auto-share-groups', currentSlot, config)
    sgRunning = false
    data.running = false
    releaseSlotLock(currentSlot, 'Auto Share Groups')
    updateShareGroupsButtons()
}

async function stopAutoShareGroups() {
    await window.api.invoke('stop-auto-share-groups', currentSlot)
    sgRunning = false
    const data = _getCurSgData()
    data.running = false
    releaseSlotLock(currentSlot, 'Auto Share Groups')
    updateShareGroupsButtons()
    setStatus('Stopped auto share groups.')
}

// ========================
// LISTEN TO PROGRESS & DONE EVENTS
// ========================
window.api.on('share-groups-progress', (slot, info) => {
    // Update slot data even if not viewing — but don't overwrite with waiting/resting
    const data = _sgSlotData[slot]
    if (data && info.index !== undefined && data.groups[info.index]) {
        if (info.status !== 'waiting' && info.status !== 'resting') {
            data.groups[info.index].status = info.status
        }
    }
    if (slot === currentSlot) renderShareGroupsTable()

    const msgs = {
        processing: `Sharing to: ${info.groupName} (${info.index + 1}/${info.total})`,
        success: `✅ ${info.groupName} done (${info.successCount}/${info.total})`,
        error: `❌ ${info.groupName}: ${info.error || 'failed'}`,
        waiting: `⏳ Waiting ${info.delay}s before next group...`,
        resting: `💤 Resting for ${info.restSeconds}s...`
    }
    setSlotStatus(slot, msgs[info.status] || 'Processing...', info.status === 'error' ? 'error' : 'info')
})

window.api.on('share-groups-done', (slot, summary) => {
    if (slot === currentSlot) {
        sgRunning = false
        const data = _getCurSgData()
        data.running = false
        updateShareGroupsButtons()
    } else {
        if (_sgSlotData[slot]) _sgSlotData[slot].running = false
    }
    releaseSlotLock(slot, 'Auto Share Groups')
    setSlotStatus(slot, `Done! ✅${summary.successCount} ❌${summary.failCount} / ${summary.total} groups`, 'success')
})
