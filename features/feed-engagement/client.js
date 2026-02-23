// ====== FEED ENGAGEMENT — Client JS ======
// Manages per-slot data and UI for the feed-engagement feature.

const _feSlotData = {} // per-slot storage
let feRunning = false
let _feNewImagePath = '' // temp image path for add comment form

function _saveFeSlot(slot) {
    _feSlotData[slot] = _feSlotData[slot] || _defaultFeData()
    const data = _feSlotData[slot]
    data.targetLikes = parseInt(document.getElementById('feTargetLikes')?.value) || 10
    data.targetComments = parseInt(document.getElementById('feTargetComments')?.value) || 5
    data.delayMin = parseInt(document.getElementById('feDelayMin')?.value) || 10
    data.delayMax = parseInt(document.getElementById('feDelayMax')?.value) || 30
    data.restAfter = parseInt(document.getElementById('feRestAfter')?.value) || 10
    data.restSeconds = parseInt(document.getElementById('feRestSeconds')?.value) || 120
    data.running = feRunning
}

function _loadFeSlot(slot) {
    const data = _feSlotData[slot] || _defaultFeData()
    _feSlotData[slot] = data

    const fields = {
        feTargetLikes: data.targetLikes,
        feTargetComments: data.targetComments,
        feDelayMin: data.delayMin,
        feDelayMax: data.delayMax,
        feRestAfter: data.restAfter,
        feRestSeconds: data.restSeconds
    }
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id)
        if (el) el.value = val
    }

    feRunning = data.running
    _feNewImagePath = ''
    document.getElementById('feNewCommentText').value = ''
    document.getElementById('feImageName').textContent = 'No image'
    renderFeedCommentsTable()
    updateFeedButtons()
}

function _defaultFeData() {
    return {
        targetLikes: 10, targetComments: 5,
        delayMin: 10, delayMax: 30,
        restAfter: 10, restSeconds: 120,
        commentTemplates: [],
        running: false
    }
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
    if (action === 'save') _saveFeSlot(slot)
    if (action === 'load') _loadFeSlot(slot)
})

function _getCurFeData() {
    if (!_feSlotData[currentSlot]) {
        _feSlotData[currentSlot] = _defaultFeData()
    }
    return _feSlotData[currentSlot]
}

// ========================
// COMMENTS TABLE
// ========================
function renderFeedCommentsTable() {
    const data = _getCurFeData()
    const tbody = document.getElementById('feCommentsTableBody')
    if (!tbody) return

    if (!data.commentTemplates || data.commentTemplates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-2 text-center text-gray-600">No comments added.</td></tr>'
        return
    }

    tbody.innerHTML = data.commentTemplates.map((tpl, idx) => {
        const truncatedText = tpl.text.length > 40 ? tpl.text.substring(0, 40) + '...' : tpl.text
        const imgBadge = tpl.imagePath
            ? `<span class="text-emerald-400 text-[10px]" title="${tpl.imagePath}">📎</span>`
            : '<span class="text-gray-600">—</span>'
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-2 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[120px]" title="${tpl.text}">${truncatedText}</td>
      <td class="px-2 py-1 text-center">${imgBadge}</td>
      <td class="px-2 py-1 text-center">
        <button onclick="deleteFeedComment(${idx})" class="text-red-400 hover:text-red-300 text-[10px]">🗑</button>
      </td>
    </tr>`
    }).join('')
}

// ========================
// ADD / DELETE COMMENTS
// ========================
async function pickFeedCommentImage() {
    const result = await window.api.invoke('pick-feed-comment-image')
    if (result.ok) {
        _feNewImagePath = result.path
        const fileName = result.path.split('\\').pop().split('/').pop()
        document.getElementById('feImageName').textContent = fileName
    }
}

function addFeedComment() {
    const textEl = document.getElementById('feNewCommentText')
    const text = (textEl?.value || '').trim()
    if (!text) return setStatus('Please enter comment text', 'error')

    const data = _getCurFeData()
    data.commentTemplates.push({
        text: text,
        imagePath: _feNewImagePath || ''
    })

    // Reset form
    textEl.value = ''
    _feNewImagePath = ''
    document.getElementById('feImageName').textContent = 'No image'

    renderFeedCommentsTable()
    setStatus(`Added comment template #${data.commentTemplates.length}`)
}

function deleteFeedComment(idx) {
    const data = _getCurFeData()
    if (idx >= 0 && idx < data.commentTemplates.length) {
        data.commentTemplates.splice(idx, 1)
        renderFeedCommentsTable()
        setStatus('Comment template deleted')
    }
}

// ========================
// BUTTON STATE
// ========================
function updateFeedButtons() {
    const startBtn = document.getElementById('btnStartFeed')
    const stopBtn = document.getElementById('btnStopFeed')

    if (feRunning) {
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
async function startFeedEngagement() {
    const data = _getCurFeData()
    _saveFeSlot(currentSlot)

    const targetLikes = data.targetLikes
    const targetComments = data.targetComments
    const enableLike = targetLikes > 0
    const enableComment = targetComments > 0

    if (!enableLike && !enableComment) return setStatus('Set at least likes or comments count!', 'error')
    if (enableComment && data.commentTemplates.length === 0) {
        return setStatus('Add at least one comment template!', 'error')
    }

    feRunning = true
    data.running = true
    updateFeedButtons()
    setStatus('🚀 Starting feed engagement...', 'info')

    const config = {
        enableLike,
        enableComment,
        targetLikes,
        targetComments,
        commentTemplates: data.commentTemplates,
        delayMin: data.delayMin,
        delayMax: data.delayMax,
        restAfter: data.restAfter,
        restSeconds: data.restSeconds
    }

    await window.api.invoke('start-feed-engagement', currentSlot, config)
    feRunning = false
    data.running = false
    updateFeedButtons()
}

async function stopFeedEngagement() {
    await window.api.invoke('stop-feed-engagement', currentSlot)
    feRunning = false
    const data = _getCurFeData()
    data.running = false
    updateFeedButtons()
    setStatus('Feed engagement stopped.')
}

// ========================
// LISTEN TO EVENTS
// ========================
window.api.on('feed-engagement-progress', (slot, info) => {
    if (slot !== currentSlot) return
    const errorStatuses = ['error']
    setStatus(info.message || 'Processing...', errorStatuses.includes(info.status) ? 'error' : 'info')
})

window.api.on('feed-engagement-done', (slot, summary) => {
    if (slot !== currentSlot) return
    feRunning = false
    const data = _getCurFeData()
    data.running = false
    updateFeedButtons()
    const msg = summary.error
        ? `Feed engagement error: ${summary.error}`
        : `Done! ❤️${summary.likeCount} likes 💬${summary.commentCount} comments`
    setStatus(msg, summary.error ? 'error' : 'success')
})
