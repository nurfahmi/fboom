// ====== AUTO POST GROUPS — Client JS ======
// Manages per-slot data and UI for the auto-post-groups feature.

const _pgSlotData = {} // per-slot storage
let pgRunning = false

function _savePgSlot(slot) {
    _pgSlotData[slot] = _pgSlotData[slot] || { groups: [], postText: '', filePaths: [], delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    const data = _pgSlotData[slot]
    data.postText = document.getElementById('pgPostText')?.value || ''
    data.delayMin = parseInt(document.getElementById('pgDelayMin')?.value) || 10
    data.delayMax = parseInt(document.getElementById('pgDelayMax')?.value) || 120
    data.restAfter = parseInt(document.getElementById('pgRestAfter')?.value) || 5
    data.restSeconds = parseInt(document.getElementById('pgRestSeconds')?.value) || 300
    data.running = pgRunning
}

function _loadPgSlot(slot) {
    const data = _pgSlotData[slot] || { groups: [], postText: '', filePaths: [], delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    _pgSlotData[slot] = data

    const txtEl = document.getElementById('pgPostText')
    if (txtEl) txtEl.value = data.postText

    const fields = { pgDelayMin: data.delayMin, pgDelayMax: data.delayMax, pgRestAfter: data.restAfter, pgRestSeconds: data.restSeconds }
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id)
        if (el) el.value = val
    }

    pgRunning = data.running
    renderPostGroupsTable()
    renderPostGroupsMedia()
    updatePostGroupsButtons()
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
    if (action === 'save') _savePgSlot(slot)
    if (action === 'load') _loadPgSlot(slot)
})

function _getCurPgData() {
    if (!_pgSlotData[currentSlot]) {
        _pgSlotData[currentSlot] = { groups: [], postText: '', filePaths: [], delayMin: 10, delayMax: 120, restAfter: 5, restSeconds: 300, running: false }
    }
    return _pgSlotData[currentSlot]
}

// ========================
// TAB SWITCHING (inner tabs)
// ========================
function switchPostGroupTab(tab) {
    document.querySelectorAll('.pg-tab').forEach(el => {
        el.classList.remove('bg-accent', 'text-white')
        el.classList.add('bg-dark-100', 'text-gray-400')
    })
    document.querySelectorAll('.pg-panel').forEach(el => el.classList.add('hidden'))

    const activeBtn = document.querySelector(`.pg-tab[data-pgtab="${tab}"]`)
    if (activeBtn) {
        activeBtn.classList.add('bg-accent', 'text-white')
        activeBtn.classList.remove('bg-dark-100', 'text-gray-400')
    }
    const activePanel = document.querySelector(`.pg-panel[data-pgpanel="${tab}"]`)
    if (activePanel) activePanel.classList.remove('hidden')
}

// ========================
// TABLE RENDERING
// ========================
function renderPostGroupsTable() {
    const data = _getCurPgData()
    const filterVal = (document.getElementById('pgFilter')?.value || '').toLowerCase()
    const tbody = document.getElementById('pgTableBody')
    const countEl = document.getElementById('pgCount')
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
// MEDIA LIST RENDERING
// ========================
function renderPostGroupsMedia() {
    const data = _getCurPgData()
    const el = document.getElementById('pgMediaList')
    if (!el) return
    if (data.filePaths.length === 0) {
        el.innerHTML = '<span class="text-gray-600">No files selected.</span>'
    } else {
        el.innerHTML = data.filePaths.map((p, i) => {
            const name = p.split(/[/\\]/).pop()
            return `<div class="text-gray-300">${i + 1}. ${name}</div>`
        }).join('')
    }
}

// ========================
// BUTTON STATE
// ========================
function updatePostGroupsButtons() {
    const startBtn = document.getElementById('btnStartPostGroups')
    const stopBtn = document.getElementById('btnStopPostGroups')

    if (pgRunning) {
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
async function loadPostGroupsTxt() {
    const result = await window.api.invoke('load-post-groups-txt')
    if (!result.ok) return
    const data = _getCurPgData()
    data.groups = result.groups.map(g => ({ ...g, status: '' }))
    renderPostGroupsTable()
    setStatus(`Loaded ${data.groups.length} groups from TXT`)
}

async function savePostGroupsTxt() {
    const data = _getCurPgData()
    if (data.groups.length === 0) return setStatus('No groups to save', 'error')
    const result = await window.api.invoke('save-post-groups-txt', data.groups)
    if (result.ok) setStatus(`Saved ${data.groups.length} groups`)
}

function clearPostGroups() {
    const data = _getCurPgData()
    data.groups = []
    renderPostGroupsTable()
    setStatus('Groups cleared')
}

// Called by other features (e.g. get-joined-groups) to import groups
function importGroupsToAutoPost(groups) {
    const data = _getCurPgData()
    data.groups = groups.map(g => ({ name: g.name, groupId: g.groupId, status: '' }))
    renderPostGroupsTable()
}

async function pickPostGroupsMedia() {
    const result = await window.api.invoke('pick-post-groups-media')
    if (!result.ok) return
    const data = _getCurPgData()
    data.filePaths = result.paths
    renderPostGroupsMedia()
    setStatus(`Selected ${data.filePaths.length} media file(s)`)
}

function clearPostGroupsMedia() {
    const data = _getCurPgData()
    data.filePaths = []
    renderPostGroupsMedia()
    setStatus('Media cleared')
}

// ========================
// START / STOP AUTO POST
// ========================
async function startAutoPostGroups() {
    const data = _getCurPgData()
    if (data.groups.length === 0) return setStatus('No target groups!', 'error')

    // Save form values
    _savePgSlot(currentSlot)

    if (!data.postText && data.filePaths.length === 0) return setStatus('Please enter post text or select media files', 'error')

    // Reset statuses
    data.groups.forEach(g => g.status = '')
    renderPostGroupsTable()

    pgRunning = true
    data.running = true
    updatePostGroupsButtons()
    setStatus('Starting auto post to groups...', 'info')

    const config = {
        groups: data.groups,
        postText: data.postText,
        filePaths: data.filePaths,
        delayMin: data.delayMin,
        delayMax: data.delayMax,
        restAfter: data.restAfter,
        restSeconds: data.restSeconds
    }

    const result = await window.api.invoke('start-auto-post-groups', currentSlot, config)
    if (result && !result.ok && result.error) {
        setStatus('❌ Error: ' + result.error, 'error')
    }
    pgRunning = false
    data.running = false
    updatePostGroupsButtons()
}

async function stopAutoPostGroups() {
    await window.api.invoke('stop-auto-post-groups', currentSlot)
    pgRunning = false
    const data = _getCurPgData()
    data.running = false
    updatePostGroupsButtons()
    setStatus('Stopped auto post groups.')
}

// ========================
// LISTEN TO PROGRESS & DONE EVENTS
// ========================
window.api.on('post-groups-progress', (slot, info) => {
    // Update slot data even if not viewing
    const data = _pgSlotData[slot]
    if (data && info.index !== undefined && data.groups[info.index]) {
        data.groups[info.index].status = info.status
    }
    if (slot !== currentSlot) return
    renderPostGroupsTable()

    const msgs = {
        processing: `Posting to: ${info.groupName} (${info.index + 1}/${info.total})`,
        success: `✅ ${info.groupName} done (${info.successCount}/${info.total})`,
        error: `❌ ${info.groupName}: ${info.error || 'failed'}`,
        waiting: `⏳ Waiting ${info.delay}s before next group...`,
        resting: `💤 Resting for ${info.restSeconds}s...`
    }
    setStatus(msgs[info.status] || 'Processing...', info.status === 'error' ? 'error' : 'info')
})

window.api.on('post-groups-done', (slot, summary) => {
    if (slot !== currentSlot) return
    pgRunning = false
    const data = _getCurPgData()
    data.running = false
    updatePostGroupsButtons()
    setStatus(`Done! ✅${summary.successCount} ❌${summary.failCount} / ${summary.total} groups`, 'success')
})
