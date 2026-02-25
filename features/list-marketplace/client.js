// ====== LIST MARKETPLACE — Client JS ======
// Per-slot data management and UI for marketplace listings

const _mpSlotData = {}
let mpRunning = false
let mpEditingIndex = -1 // -1 = not editing, >= 0 = editing product at index

function _saveMpSlot(slot) {
    _mpSlotData[slot] = _mpSlotData[slot] || _defaultMpData()
    const d = _mpSlotData[slot]
    d.delayMin = parseInt(document.getElementById('mpDelayMin')?.value) || 15
    d.delayMax = parseInt(document.getElementById('mpDelayMax')?.value) || 60
    d.restAfter = parseInt(document.getElementById('mpRestAfter')?.value) || 5
    d.restSeconds = parseInt(document.getElementById('mpRestSeconds')?.value) || 300
    d.running = mpRunning
}

function _loadMpSlot(slot) {
    const d = _mpSlotData[slot] || _defaultMpData()
    _mpSlotData[slot] = d

    const fields = { mpDelayMin: d.delayMin, mpDelayMax: d.delayMax, mpRestAfter: d.restAfter, mpRestSeconds: d.restSeconds }
    for (const [id, val] of Object.entries(fields)) {
        const el = document.getElementById(id)
        if (el) el.value = val
    }

    mpRunning = d.running
    mpEditingIndex = -1
    clearMpForm()
    renderMpTable()
    renderMpImageCount()
    updateMpButtons()
}

function _defaultMpData() {
    return { products: [], imagePaths: [], delayMin: 15, delayMax: 60, restAfter: 5, restSeconds: 300, running: false }
}

function _getCurMpData() {
    if (!_mpSlotData[currentSlot]) _mpSlotData[currentSlot] = _defaultMpData()
    return _mpSlotData[currentSlot]
}

// Register for slot switching
slotSwitchCallbacks.push((action, slot) => {
    if (action === 'save') _saveMpSlot(slot)
    if (action === 'load') _loadMpSlot(slot)
})

// ========================
// INNER TAB SWITCHING
// ========================
function switchMpTab(tab) {
    document.querySelectorAll('.mp-tab').forEach(el => {
        el.classList.remove('bg-accent', 'text-white')
        el.classList.add('bg-dark-100', 'text-gray-400')
    })
    document.querySelectorAll('.mp-panel').forEach(el => el.classList.add('hidden'))

    const activeBtn = document.querySelector(`.mp-tab[data-mptab="${tab}"]`)
    if (activeBtn) {
        activeBtn.classList.add('bg-accent', 'text-white')
        activeBtn.classList.remove('bg-dark-100', 'text-gray-400')
    }
    const activePanel = document.querySelector(`.mp-panel[data-mppanel="${tab}"]`)
    if (activePanel) activePanel.classList.remove('hidden')
}

// ========================
// FORM TYPE SWITCHING
// ========================
function switchMpFormType(type) {
    document.getElementById('mpFormItem').classList.toggle('hidden', type !== 'item')
    document.getElementById('mpFormVehicle').classList.toggle('hidden', type !== 'vehicle')
    document.getElementById('mpFormProperty').classList.toggle('hidden', type !== 'property')
}

// ========================
// IMAGES
// ========================
async function pickMpImages() {
    const result = await window.api.invoke('pick-mp-images')
    if (!result.ok) return
    const d = _getCurMpData()
    d.imagePaths = result.paths
    renderMpImageCount()
    setStatus(`Selected ${d.imagePaths.length} image(s)`)
}

function clearMpImages() {
    const d = _getCurMpData()
    d.imagePaths = []
    renderMpImageCount()
}

function renderMpImageCount() {
    const d = _getCurMpData()
    const el = document.getElementById('mpImageCount')
    if (el) el.textContent = d.imagePaths.length > 0 ? `${d.imagePaths.length} file(s) selected` : 'No images'
}

// ========================
// SAVE PRODUCT (form → products array)
// ========================
function saveMpProduct() {
    const type = document.querySelector('input[name="mpListingType"]:checked')?.value || 'item'
    let product = { id: Date.now(), listingType: type, status: '' }
    const d = _getCurMpData()

    if (type === 'item') {
        product.name = document.getElementById('mpItemName')?.value?.trim() || ''
        product.price = document.getElementById('mpItemPrice')?.value?.trim() || ''
        product.category = document.getElementById('mpItemCategory')?.value || ''
        product.condition = document.getElementById('mpItemCondition')?.value || ''
        product.location = document.getElementById('mpItemLocation')?.value?.trim() || ''
        product.description = document.getElementById('mpItemDescription')?.value?.trim() || ''
        if (!product.name || !product.price || !product.category || !product.condition || !product.location || !product.description) {
            return setStatus('Please fill all required item fields', 'error')
        }
    } else if (type === 'vehicle') {
        product.vehicleType = document.getElementById('mpVehicleType')?.value || 'Other'
        product.year = document.getElementById('mpVehicleYear')?.value?.trim() || ''
        product.make = document.getElementById('mpVehicleMake')?.value?.trim() || ''
        product.model = document.getElementById('mpVehicleModel')?.value?.trim() || ''
        product.price = document.getElementById('mpVehiclePrice')?.value?.trim() || ''
        product.location = document.getElementById('mpVehicleLocation')?.value?.trim() || ''
        product.description = document.getElementById('mpVehicleDescription')?.value?.trim() || ''
        product.name = `${product.make} ${product.model} ${product.year}`.trim()
        if (!product.year || !product.make || !product.model || !product.price || !product.location || !product.description) {
            return setStatus('Please fill all required vehicle fields', 'error')
        }
    } else if (type === 'property') {
        product.saleType = document.getElementById('mpPropertySaleType')?.value || 'Rent'
        product.propertyType = document.getElementById('mpPropertyType')?.value || ''
        product.bedrooms = document.getElementById('mpPropertyBedrooms')?.value || '1'
        product.bathrooms = document.getElementById('mpPropertyBathrooms')?.value || '1'
        product.price = document.getElementById('mpPropertyPrice')?.value?.trim() || ''
        product.squareMeters = document.getElementById('mpPropertySqm')?.value?.trim() || ''
        product.location = document.getElementById('mpPropertyLocation')?.value?.trim() || ''
        product.description = document.getElementById('mpPropertyDescription')?.value?.trim() || ''
        product.name = `${product.propertyType} ${product.saleType} - ${product.location}`.trim()
        if (!product.propertyType || !product.price || !product.location || !product.description) {
            return setStatus('Please fill all required property fields', 'error')
        }
    }

    // Attach current image paths
    product.images = [...d.imagePaths]

    if (mpEditingIndex >= 0) {
        // Editing existing product — preserve original id
        product.id = d.products[mpEditingIndex].id
        d.products[mpEditingIndex] = product
        mpEditingIndex = -1
        setStatus('Product updated!', 'success')
    } else {
        d.products.push(product)
        setStatus('Product saved!', 'success')
    }

    // Also save to global table
    window.api.invoke('add-global-mp-product', { ...product })

    clearMpForm()
    renderMpTable()
    switchMpTab('saved')
}

// ========================
// CLEAR FORM
// ========================
function clearMpForm() {
    mpEditingIndex = -1

    // Item
    const itemFields = ['mpItemName', 'mpItemPrice', 'mpItemLocation', 'mpItemDescription']
    itemFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
    const catEl = document.getElementById('mpItemCategory'); if (catEl) catEl.value = ''
    const condEl = document.getElementById('mpItemCondition'); if (condEl) condEl.value = ''

    // Vehicle
    const vehFields = ['mpVehicleYear', 'mpVehicleMake', 'mpVehicleModel', 'mpVehiclePrice', 'mpVehicleLocation', 'mpVehicleDescription']
    vehFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
    const vtEl = document.getElementById('mpVehicleType'); if (vtEl) vtEl.value = 'Other'

    // Property
    const propFields = ['mpPropertyPrice', 'mpPropertySqm', 'mpPropertyLocation', 'mpPropertyDescription']
    propFields.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
    const stEl = document.getElementById('mpPropertySaleType'); if (stEl) stEl.value = 'Rent'
    const ptEl = document.getElementById('mpPropertyType'); if (ptEl) ptEl.value = ''
    const brEl = document.getElementById('mpPropertyBedrooms'); if (brEl) brEl.value = '1'
    const baEl = document.getElementById('mpPropertyBathrooms'); if (baEl) baEl.value = '1'

    // Reset radio to item
    const itemRadio = document.querySelector('input[name="mpListingType"][value="item"]')
    if (itemRadio) itemRadio.checked = true
    switchMpFormType('item')
}

// ========================
// TABLE RENDERING
// ========================
function renderMpTable() {
    const d = _getCurMpData()
    const filterVal = (document.getElementById('mpFilter')?.value || '').toLowerCase()
    const tbody = document.getElementById('mpTableBody')
    const countEl = document.getElementById('mpProductCount')
    if (!tbody) return

    const filtered = d.products.filter(p => (p.name || '').toLowerCase().includes(filterVal))
    if (countEl) countEl.textContent = `${filtered.length} / ${d.products.length}`

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="px-2 py-3 text-center text-gray-600">No saved products.</td></tr>'
        return
    }

    tbody.innerHTML = filtered.map((p, idx) => {
        // Find real index in products array
        const realIdx = d.products.indexOf(p)
        const typeIcon = p.listingType === 'vehicle' ? '🚗' : p.listingType === 'property' ? '🏠' : '🛍️'
        let statusBadge = ''
        switch (p.status) {
            case 'success': statusBadge = '<span class="text-emerald-400">✓</span>'; break
            case 'error': statusBadge = '<span class="text-red-400">✕</span>'; break
            case 'posting': statusBadge = '<span class="text-yellow-400">⟳</span>'; break
            default: statusBadge = '<span class="text-gray-600">—</span>'
        }
        const checked = p._selected ? 'checked' : ''
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-1.5 py-1 text-center"><input type="checkbox" ${checked} onchange="toggleMpSelect(${realIdx}, this.checked)"></td>
      <td class="px-1.5 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-1.5 py-1 text-gray-400">${typeIcon}</td>
      <td class="px-1.5 py-1 text-gray-200 truncate max-w-[120px]" title="${p.name}">${p.name}</td>
      <td class="px-1.5 py-1 text-gray-300 font-mono text-[10px]">${p.price}</td>
      <td class="px-1.5 py-1 text-gray-400 truncate max-w-[80px]" title="${p.location}">${p.location}</td>
      <td class="px-1.5 py-1 text-center">${statusBadge}</td>
      <td class="px-1.5 py-1 text-center">
        <button onclick="editMpProduct(${realIdx})" class="text-blue-400 hover:text-blue-300 text-[10px] mr-1" title="Edit">✎</button>
        <button onclick="deleteMpProduct(${realIdx})" class="text-red-400 hover:text-red-300 text-[10px]" title="Delete">✕</button>
      </td>
    </tr>`
    }).join('')
}

// ========================
// SELECTION
// ========================
function toggleMpSelect(idx, checked) {
    const d = _getCurMpData()
    if (d.products[idx]) d.products[idx]._selected = checked
}

function toggleMpSelectAll(checked) {
    const d = _getCurMpData()
    d.products.forEach(p => p._selected = checked)
    renderMpTable()
}

// ========================
// EDIT / DELETE
// ========================
function editMpProduct(idx) {
    const d = _getCurMpData()
    const p = d.products[idx]
    if (!p) return

    mpEditingIndex = idx
    d.imagePaths = p.images ? [...p.images] : []
    renderMpImageCount()

    // Set radio
    const radio = document.querySelector(`input[name="mpListingType"][value="${p.listingType}"]`)
    if (radio) radio.checked = true
    switchMpFormType(p.listingType)

    if (p.listingType === 'item') {
        document.getElementById('mpItemName').value = p.name || ''
        document.getElementById('mpItemPrice').value = p.price || ''
        document.getElementById('mpItemCategory').value = p.category || ''
        document.getElementById('mpItemCondition').value = p.condition || ''
        document.getElementById('mpItemLocation').value = p.location || ''
        document.getElementById('mpItemDescription').value = p.description || ''
    } else if (p.listingType === 'vehicle') {
        document.getElementById('mpVehicleType').value = p.vehicleType || 'Other'
        document.getElementById('mpVehicleYear').value = p.year || ''
        document.getElementById('mpVehicleMake').value = p.make || ''
        document.getElementById('mpVehicleModel').value = p.model || ''
        document.getElementById('mpVehiclePrice').value = p.price || ''
        document.getElementById('mpVehicleLocation').value = p.location || ''
        document.getElementById('mpVehicleDescription').value = p.description || ''
    } else if (p.listingType === 'property') {
        document.getElementById('mpPropertySaleType').value = p.saleType || 'Rent'
        document.getElementById('mpPropertyType').value = p.propertyType || ''
        document.getElementById('mpPropertyBedrooms').value = p.bedrooms || '1'
        document.getElementById('mpPropertyBathrooms').value = p.bathrooms || '1'
        document.getElementById('mpPropertyPrice').value = p.price || ''
        document.getElementById('mpPropertySqm').value = p.squareMeters || ''
        document.getElementById('mpPropertyLocation').value = p.location || ''
        document.getElementById('mpPropertyDescription').value = p.description || ''
    }

    switchMpTab('form')
    setStatus(`Editing product: ${p.name}`, 'info')
}

function deleteMpProduct(idx) {
    const d = _getCurMpData()
    d.products.splice(idx, 1)
    renderMpTable()
    setStatus('Product deleted')
}

function clearMpProducts() {
    const d = _getCurMpData()
    d.products = []
    renderMpTable()
    setStatus('All products cleared')
}

// ========================
// LOAD / SAVE TXT
// ========================
async function loadMpTxt() {
    const result = await window.api.invoke('load-mp-txt')
    if (!result.ok) return
    const d = _getCurMpData()
    d.products = result.products.map(p => ({ ...p, status: '', _selected: false }))
    renderMpTable()
    setStatus(`Loaded ${d.products.length} products from TXT`, 'success')
}

async function saveMpTxt() {
    const d = _getCurMpData()
    if (d.products.length === 0) return setStatus('No products to save', 'error')
    const result = await window.api.invoke('save-mp-txt', d.products)
    if (result.ok) setStatus(`Saved ${d.products.length} products to TXT`, 'success')
}

// ========================
// BUTTON STATE
// ========================
function updateMpButtons() {
    const startBtn = document.getElementById('btnStartMp')
    const stopBtn = document.getElementById('btnStopMp')

    if (mpRunning) {
        if (startBtn) { startBtn.disabled = true; startBtn.classList.add('opacity-40', 'cursor-not-allowed') }
        if (stopBtn) { stopBtn.disabled = false; stopBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
    } else {
        if (startBtn) { startBtn.disabled = false; startBtn.classList.remove('opacity-40', 'cursor-not-allowed') }
        if (stopBtn) { stopBtn.disabled = true; stopBtn.classList.add('opacity-40', 'cursor-not-allowed') }
    }
}

// ========================
// START / STOP
// ========================
async function startMarketplace() {
    const d = _getCurMpData()
    const selected = d.products.filter(p => p._selected)
    if (selected.length === 0) return setStatus('Select products to list first (use checkboxes)', 'error')

    _saveMpSlot(currentSlot)

    // Reset statuses on selected
    selected.forEach(p => p.status = '')
    renderMpTable()

    mpRunning = true
    d.running = true
    updateMpButtons()
    setStatus(`Starting marketplace listing (${selected.length} products)...`, 'info')

    const config = {
        products: selected.map(p => {
            const { _selected, ...rest } = p
            return rest
        }),
        delayMin: d.delayMin,
        delayMax: d.delayMax,
        restAfter: d.restAfter,
        restSeconds: d.restSeconds
    }

    const result = await window.api.invoke('start-list-marketplace', currentSlot, config)
    if (result && !result.ok && result.error) {
        setStatus('❌ Error: ' + result.error, 'error')
    }
    mpRunning = false
    d.running = false
    updateMpButtons()
}

async function stopMarketplace() {
    await window.api.invoke('stop-list-marketplace', currentSlot)
    mpRunning = false
    const d = _getCurMpData()
    d.running = false
    updateMpButtons()
    setStatus('Marketplace listing stopped.')
}

// ========================
// PROGRESS & DONE EVENTS
// ========================
window.api.on('mp-progress', (slot, info) => {
    const d = _mpSlotData[slot]
    if (d && info.productId) {
        const p = d.products.find(x => x.id === info.productId)
        if (p) p.status = info.status
    }
    if (slot !== currentSlot) return
    renderMpTable()

    const msgs = {
        posting: `🔄 Posting: ${info.productName} (${info.index + 1}/${info.total}) ${info.detail ? '- ' + info.detail : ''}`,
        success: `✅ ${info.productName} posted (${info.successCount}/${info.total})`,
        error: `❌ ${info.productName}: ${info.error || 'failed'}`,
        waiting: `⏳ Waiting ${info.delay}s before next...`,
        resting: `💤 Resting for ${info.restSeconds}s...`
    }
    setStatus(msgs[info.status] || 'Processing...', info.status === 'error' ? 'error' : 'info')
})

window.api.on('mp-done', (slot, summary) => {
    if (slot !== currentSlot) return
    mpRunning = false
    const d = _getCurMpData()
    d.running = false
    updateMpButtons()
    setStatus(`Done! ✅${summary.successCount} ❌${summary.failCount} / ${summary.total} products`, 'success')
})

// ========================
// GLOBAL MARKETPLACE TABLE
// ========================
let _globalMpProducts = []

async function openGlobalMpModal() {
    // Hide browser views so modal appears on top
    await window.api.invoke('hide-browser-views')
    const modal = document.getElementById('mpGlobalModal')
    if (modal) modal.classList.remove('hidden')
    // Load global products from file
    const result = await window.api.invoke('get-global-mp-products')
    _globalMpProducts = (result && result.ok) ? result.products : []
    renderGlobalMpTable()
}

async function closeGlobalMpModal() {
    const modal = document.getElementById('mpGlobalModal')
    if (modal) modal.classList.add('hidden')
    // Restore browser views
    await window.api.invoke('show-browser-views')
}

function renderGlobalMpTable() {
    const filterVal = (document.getElementById('mpGlobalFilter')?.value || '').toLowerCase()
    const tbody = document.getElementById('mpGlobalTableBody')
    const countEl = document.getElementById('mpGlobalCount')
    if (!tbody) return

    const filtered = _globalMpProducts.filter(p => (p.name || '').toLowerCase().includes(filterVal))
    if (countEl) countEl.textContent = `${filtered.length} / ${_globalMpProducts.length}`

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-2 py-3 text-center text-gray-600">No global products.</td></tr>'
        return
    }

    tbody.innerHTML = filtered.map((p, idx) => {
        const realIdx = _globalMpProducts.indexOf(p)
        const typeIcon = p.listingType === 'vehicle' ? '🚗' : p.listingType === 'property' ? '🏠' : '🛍️'
        return `<tr class="border-b border-dark-100 hover:bg-dark-400/50">
      <td class="px-1.5 py-1 text-gray-500">${idx + 1}</td>
      <td class="px-1.5 py-1 text-gray-400">${typeIcon}</td>
      <td class="px-1.5 py-1 text-gray-200 truncate max-w-[140px]" title="${p.name}">${p.name}</td>
      <td class="px-1.5 py-1 text-gray-300 font-mono text-[10px]">${p.price}</td>
      <td class="px-1.5 py-1 text-gray-400 truncate max-w-[80px]" title="${p.location}">${p.location}</td>
      <td class="px-1.5 py-1 text-center">
        <button onclick="importFromGlobalMp(${realIdx})" class="text-blue-400 hover:text-blue-300 text-[10px] font-semibold" title="Import to current account">⬇ Import</button>
      </td>
    </tr>`
    }).join('')
}

function importFromGlobalMp(idx) {
    const p = _globalMpProducts[idx]
    if (!p) return
    const d = _getCurMpData()
    // Clone with new id to avoid duplicates
    const imported = { ...p, id: Date.now() + Math.random(), status: '', _selected: false }
    d.products.push(imported)
    renderMpTable()
    setStatus(`Imported "${p.name}" to current account`, 'success')
}

async function importGlobalMpTxt() {
    const result = await window.api.invoke('import-global-mp-txt')
    if (!result.ok) return
    // Reload
    const fresh = await window.api.invoke('get-global-mp-products')
    _globalMpProducts = (fresh && fresh.ok) ? fresh.products : []
    renderGlobalMpTable()
    setStatus(`Imported to global table (${_globalMpProducts.length} total)`, 'success')
}

async function exportGlobalMpTxt() {
    if (_globalMpProducts.length === 0) return setStatus('No global products to export', 'error')
    const result = await window.api.invoke('export-global-mp-txt')
    if (result.ok) setStatus(`Exported ${_globalMpProducts.length} global products`, 'success')
}

async function clearGlobalMpProducts() {
    await window.api.invoke('clear-global-mp-products')
    _globalMpProducts = []
    renderGlobalMpTable()
    setStatus('Global products cleared')
}
