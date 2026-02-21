// Auto Comment client — per-slot data
const _commentSlotData = {} // { slot: { urls, commentText, imagePath, ... } }
let commentUrls = []
let commentImagePath = ''
let isCommenting = false

function _saveCommentSlot(slot) {
  _commentSlotData[slot] = {
    urls: commentUrls,
    commentText: document.getElementById('commentTextField').value,
    imagePath: commentImagePath,
    delayMin: document.getElementById('commentDelayMin').value,
    delayMax: document.getElementById('commentDelayMax').value,
    restAfter: document.getElementById('commentRestAfter').value,
    restSeconds: document.getElementById('commentRestSeconds').value
  }
}

function _loadCommentSlot(slot) {
  const data = _commentSlotData[slot] || { urls: [], commentText: '', imagePath: '', delayMin: '10', delayMax: '30', restAfter: '5', restSeconds: '300' }
  commentUrls = data.urls
  commentImagePath = data.imagePath
  document.getElementById('commentTextField').value = data.commentText
  document.getElementById('commentImagePath').value = data.imagePath ? data.imagePath.split('/').pop() : ''
  document.getElementById('commentDelayMin').value = data.delayMin
  document.getElementById('commentDelayMax').value = data.delayMax
  document.getElementById('commentRestAfter').value = data.restAfter
  document.getElementById('commentRestSeconds').value = data.restSeconds
  renderCommentUrls()
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
  if (action === 'save') _saveCommentSlot(slot)
  if (action === 'load') _loadCommentSlot(slot)
})

// Inner tab switching
function switchCommentTab(tab) {
  document.querySelectorAll('.comment-panel').forEach(p => {
    p.classList.toggle('hidden', p.dataset.cpanel !== tab)
  })
  document.querySelectorAll('.comment-tab').forEach(t => {
    const active = t.dataset.ctab === tab
    t.className = 'comment-tab px-3 py-1.5 rounded-md text-xs font-semibold transition ' +
      (active ? 'bg-accent text-white' : 'bg-dark-100 text-gray-400 hover:text-white')
  })
}

// === TARGET URLS ===
function renderCommentUrls() {
  const tbody = document.getElementById('commentUrlTable')
  const count = document.getElementById('commentUrlCount')
  if (count) count.textContent = commentUrls.length

  if (commentUrls.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="px-2 py-3 text-center text-gray-600">No targets. Add URLs above.</td></tr>'
    return
  }
  tbody.innerHTML = commentUrls.map((u, i) => `
    <tr class="${i % 2 === 0 ? 'bg-dark-100' : 'bg-dark-400'}">
      <td class="px-2 py-1 text-gray-500">${i + 1}</td>
      <td class="px-2 py-1 text-gray-200 truncate max-w-[200px] text-[10px]" title="${u.url}">${u.url}</td>
      <td class="px-2 py-1"><span class="text-[10px] font-semibold ${u.status === 'success' ? 'text-emerald-400' : u.status === 'error' ? 'text-red-400' : u.status === 'processing' ? 'text-yellow-400' : 'text-gray-600'}">${u.status || 'pending'}</span></td>
      <td class="px-2 py-1"><button onclick="removeCommentUrl(${i})" class="text-red-500 hover:text-red-400 text-xs">✕</button></td>
    </tr>
  `).join('')
}

function toggleAddUrl() {
  const row = document.getElementById('addUrlRow')
  const isHidden = row.classList.contains('hidden')
  row.classList.toggle('hidden')
  if (isHidden) {
    document.getElementById('newCommentUrl').value = ''
    document.getElementById('newCommentUrl').focus()
  }
}

function confirmAddUrl() {
  const url = document.getElementById('newCommentUrl').value.trim()
  if (!url) return
  commentUrls.push({ url, status: 'pending' })
  document.getElementById('newCommentUrl').value = ''
  document.getElementById('newCommentUrl').focus()
  renderCommentUrls()
}

function removeCommentUrl(i) {
  commentUrls.splice(i, 1)
  renderCommentUrls()
}

function clearCommentUrls() {
  commentUrls = []
  renderCommentUrls()
}

async function importCommentUrls() {
  const res = await window.api.invoke('import-comment-urls', currentSlot)
  if (res.ok) {
    for (const url of res.urls) {
      commentUrls.push({ url, status: 'pending' })
    }
    renderCommentUrls()
    setStatus('Imported ' + res.urls.length + ' URLs', 'success')
  }
}

async function exportCommentUrls() {
  if (commentUrls.length === 0) { setStatus('No URLs to export', 'error'); return }
  const res = await window.api.invoke('export-comment-urls', currentSlot, commentUrls.map(u => u.url))
  if (res.ok) setStatus('Exported URLs', 'success')
}

// === IMAGE ===
async function pickCommentImage() {
  const res = await window.api.invoke('pick-comment-image', currentSlot)
  if (res.ok) {
    commentImagePath = res.path
    document.getElementById('commentImagePath').value = res.path.split('/').pop()
  }
}

function clearCommentImage() {
  commentImagePath = ''
  document.getElementById('commentImagePath').value = ''
}

// === PROGRESS LISTENERS ===
window.api.on('comment-progress', (slot, data) => {
  // Update the slot data even if not viewing it
  if (_commentSlotData[slot] && _commentSlotData[slot].urls[data.index]) {
    _commentSlotData[slot].urls[data.index].status = data.status
  }
  if (slot !== currentSlot) return
  if (commentUrls[data.index]) {
    commentUrls[data.index].status = data.status
    renderCommentUrls()
  }
  if (data.status === 'processing') setStatus(`Commenting on post ${data.index + 1}/${data.total}...`, 'info')
  else if (data.status === 'success') setStatus(`✓ Post ${data.index + 1} done (${data.successCount}/${data.total})`, 'success')
  else if (data.status === 'error') setStatus(`✗ Post ${data.index + 1} failed: ${data.error}`, 'error')
  else if (data.status === 'waiting') setStatus(`Waiting ${data.delay}s before next...`, 'info')
  else if (data.status === 'resting') setStatus(`Resting for ${data.restSeconds}s...`, 'info')
})

window.api.on('comment-done', (slot, data) => {
  if (slot !== currentSlot) return
  isCommenting = false
  updateCommentButtons()
  setStatus(`Done! ${data.successCount}/${data.total} comments posted`, 'success')
})

// === START / STOP ===
async function startAutoComment() {
  const commentText = document.getElementById('commentTextField').value.trim()
  if (!commentText) { setStatus('Enter comment text first', 'error'); return }
  if (commentUrls.length === 0) { setStatus('Add target URLs first', 'error'); return }

  commentUrls.forEach(u => u.status = 'pending')
  renderCommentUrls()

  isCommenting = true
  updateCommentButtons()
  setStatus('Starting auto comment...', 'info')

  const config = {
    urls: commentUrls.map(u => u.url),
    commentText,
    imagePath: commentImagePath || null,
    delayMin: parseInt(document.getElementById('commentDelayMin').value) || 10,
    delayMax: parseInt(document.getElementById('commentDelayMax').value) || 30,
    restAfter: parseInt(document.getElementById('commentRestAfter').value) || 0,
    restSeconds: parseInt(document.getElementById('commentRestSeconds').value) || 300
  }

  await window.api.invoke('start-auto-comment', currentSlot, config)
  isCommenting = false
  updateCommentButtons()
}

async function stopAutoComment() {
  await window.api.invoke('stop-auto-comment', currentSlot)
  isCommenting = false
  updateCommentButtons()
  setStatus('Comment stopped', 'info')
}

function updateCommentButtons() {
  const start = document.getElementById('btnStartComment')
  const stop = document.getElementById('btnStopComment')
  if (start) start.disabled = isCommenting
  if (stop) stop.disabled = !isCommenting
}

// Enter key for inline add
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !document.getElementById('addUrlRow').classList.contains('hidden')) {
    confirmAddUrl()
  }
})
