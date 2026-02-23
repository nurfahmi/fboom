// ====== AUTO JOIN GROUPS — Client JS ======
// Manages per-slot data and UI for the auto-join-groups feature.

const _jgSlotData = {} // per-slot storage
let jgSearching = false
let jgJoining = false
let _jgIndexMap = {} // mapping: original handler index -> groupId (for removal on join)

function _saveJgSlot(slot) {
    _jgSlotData[slot] = _jgSlotData[slot] || _defaultJgData()
    const data = _jgSlotData[slot]
    data.keyword = document.getElementById('jgKeyword')?.value || ''
    data.limit = parseInt(document.getElementById('jgLimit')?.value) || 20
    data.delayMin = parseInt(document.getElementById('jgDelayMin')?.value) || 30
    data.delayMax = parseInt(document.getElementById('jgDelayMax')?.value) || 120
    data.restAfter = parseInt(document.getElementById('jgRestAfter')?.value) || 5
    data.restSeconds = parseInt(document.getElementById('jgRestSeconds')?.value) || 300
    data.searching = jgSearching
    data.joining = jgJoining
}

function _loadJgSlot(slot) {
    const data = _jgSlotData[slot] || _defaultJgData()
    _jgSlotData[slot] = data

    const fields = {
        jgKeyword: data.keyword,
        jgLimit: data.limit,
        jgDelayMin: data.delayMin,
        jgDelayMax: data.delayMax,
        jgRestAfter: data.restAfter,
        jgRestSeconds: data.restSeconds
    }
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id)
        if (el) el.value = val
    }

    jgSearching = data.searching
    jgJoining = data.joining
    renderJoinGroupsTable()
    updateJoinGroupsButtons()
}

function _defaultJgData() {
    return { groups: [], keyword: '', limit: 20, delayMin: 30, delayMax: 120, restAfter: 5, restSeconds: 300, searching: false, joining: false }
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
    if (action === 'save') _saveJgSlot(slot)
    if (action === 'load') _loadJgSlot(slot)
})

function _getCurJgData() {
    if (!_jgSlotData[currentSlot]) {
        _jgSlotData[currentSlot] = _defaultJgData()
    }
    return _jgSlotData[currentSlot]
}

// ========================
// TABLE RENDERING
// ========================
function renderJoinGroupsTable() {
    const data = _getCurJgData()
    const filterVal = (document.getElementById('jgFilter')?.value || '').toLowerCase()
    const tbody = document.getElementById('jgTableBody')
    const countEl = document.getElementById('jgCount')
    if (!tbody) return

    const filtered = data.groups.filter(g => g.name.toLowerCase().includes(filterVal))
    if (countEl) countEl.textContent = `${filtered.length} / ${data.groups.length}`

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-3 text-center text-gray-600">No groups. Search or load from TXT.</td></tr>'
        return
    }

    tbody.innerHTML = filtered.map((g, idx) => {
        let statusBadge = ''
        switch (g.status) {
            case 'joined': statusBadge = '<span class="text-emerald-400">✓</span>'; break
            case 'failed': statusBadge = '<span class="text-red-400">✕</span>'; break
            case 'error': statusBadge = '<span class="text-red-400">✕</span>'; break
            case 'joining': statusBadge = '<span class="text-yellow-400">⟳</span>'; break
            case 'waiting': statusBadge = '<span class="text-blue-400">⏳</span>'; break
            case 'resting': statusBadge = '<span class="text-purple-400">💤</span>'; break
            default: statusBadge = '<span class="text-gray-600">—</span>'
        }
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[150px]" title="${g.name}">${g.name}</td>
      <td class="px-2 py-1 text-gray-400 font-mono text-[10px]">${g.groupId || g.id || ''}</td>
      <td class="px-2 py-1 text-center">${statusBadge}</td>
    </tr>`
    }).join('')
}

// ========================
// BUTTON STATE
// ========================
function updateJoinGroupsButtons() {
    const startSearchBtn = document.getElementById('btnStartSearch')
    const stopSearchBtn = document.getElementById('btnStopSearch')
    const startJoinBtn = document.getElementById('btnStartJoin')
    const stopJoinBtn = document.getElementById('btnStopJoin')

    // Search buttons
    if (jgSearching) {
        if (startSearchBtn) { startSearchBtn.disabled = true; startSearchBtn.classList.add('opacity-40', 'cursor-not-allowed') }
        if (stopSearchBtn) { stopSearchBtn.disabled = false; stopSearchBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
    } else {
        if (startSearchBtn) { startSearchBtn.disabled = false; startSearchBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
        if (stopSearchBtn) { stopSearchBtn.disabled = true; stopSearchBtn.classList.add('opacity-40', 'cursor-not-allowed') }
    }

    // Join buttons
    if (jgJoining) {
        if (startJoinBtn) { startJoinBtn.disabled = true; startJoinBtn.classList.add('opacity-40', 'cursor-not-allowed') }
        if (stopJoinBtn) { stopJoinBtn.disabled = false; stopJoinBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
    } else {
        if (startJoinBtn) { startJoinBtn.disabled = false; startJoinBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
        if (stopJoinBtn) { stopJoinBtn.disabled = true; stopJoinBtn.classList.add('opacity-40', 'cursor-not-allowed') }
    }
}

// ========================
// SEARCH STATUS UI
// ========================
function showSearchStatus(msg) {
    const statusDiv = document.getElementById('jgSearchStatus')
    const msgEl = document.getElementById('jgSearchMsg')
    if (statusDiv && msgEl) {
        statusDiv.classList.remove('hidden')
        msgEl.textContent = msg
    }
}

function hideSearchStatus() {
    const statusDiv = document.getElementById('jgSearchStatus')
    if (statusDiv) statusDiv.classList.add('hidden')
}

// ========================
// ACTIONS — SEARCH
// ========================
async function startSearchGroups() {
    const data = _getCurJgData()
    _saveJgSlot(currentSlot)

    const keyword = data.keyword
    if (!keyword) return setStatus('Please enter a keyword', 'error')

    jgSearching = true
    data.searching = true
    updateJoinGroupsButtons()
    showSearchStatus('Searching...')
    setStatus(`🔍 Searching groups for "${keyword}"...`, 'info')

    const config = {
        keyword: keyword,
        limit: data.limit
    }

    await window.api.invoke('start-search-groups', currentSlot, config)
    jgSearching = false
    data.searching = false
    updateJoinGroupsButtons()
}

async function stopSearchGroups() {
    await window.api.invoke('stop-search-groups', currentSlot)
    jgSearching = false
    const data = _getCurJgData()
    data.searching = false
    updateJoinGroupsButtons()
    hideSearchStatus()
    setStatus('Search stopped.')
}

// ========================
// ACTIONS — JOIN
// ========================
async function startJoinGroups() {
    const data = _getCurJgData()
    if (data.groups.length === 0) return setStatus('No groups to join!', 'error')

    _saveJgSlot(currentSlot)

    // Reset statuses
    data.groups.forEach(g => g.status = '')
    renderJoinGroupsTable()

    jgJoining = true
    data.joining = true
    updateJoinGroupsButtons()
    setStatus('Starting auto join groups...', 'info')

    // Save mapping from handler index to groupId before sending
    _jgIndexMap = {}
    data.groups.forEach((g, i) => {
        _jgIndexMap[i] = g.groupId || g.id || g.name
    })

    const config = {
        groups: data.groups,
        delayMin: data.delayMin,
        delayMax: data.delayMax,
        restAfter: data.restAfter,
        restSeconds: data.restSeconds
    }

    await window.api.invoke('start-join-groups', currentSlot, config)
    jgJoining = false
    data.joining = false
    updateJoinGroupsButtons()
}

async function stopJoinGroups() {
    await window.api.invoke('stop-join-groups', currentSlot)
    jgJoining = false
    const data = _getCurJgData()
    data.joining = false
    updateJoinGroupsButtons()
    setStatus('Join stopped.')
}

// ========================
// ACTIONS — FILE
// ========================
async function loadJoinGroupsTxt() {
    const result = await window.api.invoke('load-join-groups-txt')
    if (!result.ok) return
    const data = _getCurJgData()
    data.groups = result.groups.map(g => ({ ...g, status: '' }))
    renderJoinGroupsTable()
    setStatus(`Loaded ${data.groups.length} groups from TXT`)
}

async function saveJoinGroupsTxt() {
    const data = _getCurJgData()
    if (data.groups.length === 0) return setStatus('No groups to save', 'error')
    const result = await window.api.invoke('save-join-groups-txt', data.groups)
    if (result.ok) setStatus(`Saved ${data.groups.length} groups`)
}

function clearJoinGroups() {
    const data = _getCurJgData()
    data.groups = []
    renderJoinGroupsTable()
    setStatus('Groups cleared')
}

// ========================
// LISTEN TO SEARCH EVENTS
// ========================
window.api.on('join-groups-search-progress', (slot, info) => {
    if (slot !== currentSlot) return
    showSearchStatus(info.message || 'Searching...')
    setStatus(info.message || 'Searching...', info.status === 'error' ? 'error' : 'info')
})

window.api.on('join-groups-search-done', (slot, result) => {
    if (slot !== currentSlot) return
    jgSearching = false
    const data = _getCurJgData()
    data.searching = false
    updateJoinGroupsButtons()

    if (result.groups && result.groups.length > 0) {
        data.groups = result.groups.map(g => ({ ...g, status: '' }))
        renderJoinGroupsTable()
        hideSearchStatus()
        setStatus(`✅ Found ${result.total} groups!`, 'success')
    } else {
        hideSearchStatus()
        setStatus('No groups found.', 'error')
    }
})

// ========================
// LISTEN TO JOIN EVENTS
// ========================
window.api.on('join-groups-progress', (slot, info) => {
    const data = _jgSlotData[slot]
    if (!data) return

    // If joined, remove group from the table
    if (info.status === 'joined' && info.index !== undefined) {
        const targetId = _jgIndexMap[info.index]
        if (targetId) {
            const idx = data.groups.findIndex(g => (g.groupId || g.id || g.name) === targetId)
            if (idx !== -1) {
                data.groups.splice(idx, 1)
            }
        }
    } else if (info.index !== undefined) {
        // For non-joined statuses, update the status via the index map
        const targetId = _jgIndexMap[info.index]
        if (targetId) {
            const group = data.groups.find(g => (g.groupId || g.id || g.name) === targetId)
            if (group) group.status = info.status
        }
    }

    if (slot !== currentSlot) return
    renderJoinGroupsTable()

    const msgs = {
        joining: `🤝 Joining: ${info.groupName} (${info.index + 1}/${info.total})`,
        joined: `✅ ${info.groupName} joined — removed from list (${info.successCount}/${info.total})`,
        failed: `❌ ${info.groupName}: ${info.error || 'failed'}`,
        error: `❌ ${info.groupName}: ${info.error || 'error'}`,
        waiting: `⏳ Waiting ${info.delay}s before next join...`,
        resting: `💤 Resting for ${info.restSeconds}s...`
    }
    setStatus(msgs[info.status] || 'Processing...', (info.status === 'failed' || info.status === 'error') ? 'error' : 'info')
})

window.api.on('join-groups-done', (slot, summary) => {
    if (slot !== currentSlot) return
    jgJoining = false
    const data = _getCurJgData()
    data.joining = false
    updateJoinGroupsButtons()
    setStatus(`Done! ✅${summary.successCount} joined ❌${summary.failCount} failed / ${summary.total} groups`, 'success')
})
