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
    if (countEl) countEl.textContent = `${filtered.length} / ${data.groups.length}`

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-3 text-center text-gray-600">No groups. Load from TXT or import.</td></tr>'
        return
    }

    tbody.innerHTML = filtered.map((g, idx) => {
        let statusBadge = ''
        switch (g.status) {
            case 'success': statusBadge = '<span class="text-emerald-400">✓</span>'; break
            case 'error': statusBadge = '<span class="text-red-400">✕</span>'; break
            case 'processing': statusBadge = '<span class="text-yellow-400">⟳</span>'; break
            case 'waiting': statusBadge = '<span class="text-blue-400">⏳</span>'; break
            case 'resting': statusBadge = '<span class="text-purple-400">💤</span>'; break
            default: statusBadge = '<span class="text-gray-600">—</span>'
        }
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[150px]" title="${g.name}">${g.name}</td>
      <td class="px-2 py-1 text-gray-400 font-mono text-[10px]">${g.groupId}</td>
      <td class="px-2 py-1 text-center">${statusBadge}</td>
    </tr>`
    }).join('')
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
    data.groups = result.groups.map(g => ({ ...g, status: '' }))
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
    data.groups = groups.map(g => ({ name: g.name, groupId: g.groupId, status: '' }))
    renderShareGroupsTable()
}

// ========================
// START / STOP AUTO SHARE
// ========================
async function startAutoShareGroups() {
    const data = _getCurSgData()
    if (data.groups.length === 0) return setStatus('No target groups!', 'error')

    // Save form values
    _saveSgSlot(currentSlot)

    if (!data.postUrl) return setStatus('Please enter a Facebook post URL', 'error')

    // Reset statuses
    data.groups.forEach(g => g.status = '')
    renderShareGroupsTable()

    sgRunning = true
    data.running = true
    updateShareGroupsButtons()
    setStatus('Starting auto share to groups...', 'info')

    const config = {
        groups: data.groups,
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
    updateShareGroupsButtons()
}

async function stopAutoShareGroups() {
    await window.api.invoke('stop-auto-share-groups', currentSlot)
    sgRunning = false
    const data = _getCurSgData()
    data.running = false
    updateShareGroupsButtons()
    setStatus('Stopped auto share groups.')
}

// ========================
// LISTEN TO PROGRESS & DONE EVENTS
// ========================
window.api.on('share-groups-progress', (slot, info) => {
    // Update slot data even if not viewing
    const data = _sgSlotData[slot]
    if (data && info.index !== undefined && data.groups[info.index]) {
        data.groups[info.index].status = info.status
    }
    if (slot !== currentSlot) return
    renderShareGroupsTable()

    const msgs = {
        processing: `Sharing to: ${info.groupName} (${info.index + 1}/${info.total})`,
        success: `✅ ${info.groupName} done (${info.successCount}/${info.total})`,
        error: `❌ ${info.groupName}: ${info.error || 'failed'}`,
        waiting: `⏳ Waiting ${info.delay}s before next group...`,
        resting: `💤 Resting for ${info.restSeconds}s...`
    }
    setStatus(msgs[info.status] || 'Processing...', info.status === 'error' ? 'error' : 'info')
})

window.api.on('share-groups-done', (slot, summary) => {
    if (slot !== currentSlot) return
    sgRunning = false
    const data = _getCurSgData()
    data.running = false
    updateShareGroupsButtons()
    setStatus(`Done! ✅${summary.successCount} ❌${summary.failCount} / ${summary.total} groups`, 'success')
})
