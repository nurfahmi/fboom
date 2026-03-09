const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// ============================================================
// DATA: Global Marketplace Products
// ============================================================
const GLOBAL_MP_FILE = path.join(__dirname, '..', '..', 'data', 'global_marketplace.json')

function readGlobalProducts() {
    try {
        if (fs.existsSync(GLOBAL_MP_FILE)) return JSON.parse(fs.readFileSync(GLOBAL_MP_FILE, 'utf8'))
    } catch (e) { /* ignore */ }
    return []
}

function writeGlobalProducts(products) {
    const dir = path.dirname(GLOBAL_MP_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(GLOBAL_MP_FILE, JSON.stringify(products, null, 2), 'utf8')
}

// ============================================================
// Escape helper — safely embed strings inside JS template literals
// ============================================================
function esc(str) {
    if (str == null) return ''
    return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '')
}

// ============================================================
// IPC HANDLERS
// ============================================================
module.exports = function (getPage) {
    const state = {}

    // Interruptible wait — checks stop flag every 500ms
    const interruptibleWait = async (page, ms, slot) => {
        const interval = 500
        let waited = 0
        while (waited < ms) {
            if (!state[slot] || !state[slot].running) return false
            const chunk = Math.min(interval, ms - waited)
            await page.waitForTimeout(chunk)
            waited += chunk
        }
        return true
    }

    // ===== GLOBAL MARKETPLACE TABLE =====
    ipcMain.handle('get-global-mp-products', () => {
        return { ok: true, products: readGlobalProducts() }
    })

    ipcMain.handle('add-global-mp-product', (e, product) => {
        const products = readGlobalProducts()
        const { _selected, status, ...clean } = product
        clean.id = clean.id || Date.now()
        products.push(clean)
        writeGlobalProducts(products)
        return { ok: true, count: products.length }
    })

    ipcMain.handle('remove-global-mp-product', (e, productId) => {
        let products = readGlobalProducts()
        products = products.filter(p => p.id !== productId)
        writeGlobalProducts(products)
        return { ok: true, count: products.length }
    })

    ipcMain.handle('clear-global-mp-products', () => {
        writeGlobalProducts([])
        return { ok: true }
    })

    ipcMain.handle('import-global-mp-txt', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Import Global Marketplace Products',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile']
        })
        if (result.canceled) return { ok: false }
        try {
            const content = fs.readFileSync(result.filePaths[0], 'utf8')
            const imported = JSON.parse(content)
            if (!Array.isArray(imported)) return { ok: false, error: 'Invalid format' }
            const existing = readGlobalProducts()
            const merged = [...existing, ...imported.map(p => ({ ...p, id: p.id || Date.now() + Math.random() }))]
            writeGlobalProducts(merged)
            return { ok: true, count: merged.length }
        } catch (err) {
            return { ok: false, error: err.message }
        }
    })

    ipcMain.handle('export-global-mp-txt', async () => {
        const result = await dialog.showSaveDialog({
            title: 'Export Global Marketplace Products',
            defaultPath: 'global_marketplace_products.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        })
        if (result.canceled) return { ok: false }
        const products = readGlobalProducts()
        fs.writeFileSync(result.filePath, JSON.stringify(products, null, 2), 'utf8')
        return { ok: true }
    })

    ipcMain.handle('start-list-marketplace', async (e, slot, config) => {
        const page = getPage(slot, e.sender)
        if (!page) return { ok: false, error: 'No browser open' }

        const { products, delayMin, delayMax, restAfter, restSeconds } = config
        if (!products || products.length === 0) return { ok: false, error: 'No products selected' }

        state[slot] = { running: true }
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < products.length; i++) {
            if (!state[slot] || !state[slot].running) break

            const product = products[i]
            const safeSend = (...args) => {
                try { e.sender.send(...args) } catch (sendErr) {
                    console.log(`[Slot ${slot}] Window destroyed, cannot send progress`)
                }
            }

            const onStep = (step) => {
                console.log(`[Slot ${slot}] Product ${i + 1}/${products.length}: ${step}`)
                safeSend('mp-progress', slot, {
                    index: i, status: 'posting', detail: step,
                    productId: product.id, productName: product.name,
                    total: products.length, successCount, failCount
                })
            }

            try {
                const result = await postMarketplaceListing(page, product, onStep)
                if (result === true) {
                    successCount++
                    safeSend('mp-progress', slot, { index: i, status: 'success', productId: product.id, productName: product.name, total: products.length, successCount, failCount })
                } else {
                    failCount++
                    const errorMsg = typeof result === 'string' ? result : 'Post failed'
                    safeSend('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: errorMsg, total: products.length, successCount, failCount })
                }
            } catch (err) {
                failCount++
                console.error(`[Slot ${slot}] Error:`, err)
                safeSend('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: err.message, total: products.length, successCount, failCount })
            }

            // Delay between products (interruptible)
            if (i < products.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                safeSend('mp-progress', slot, { index: i, status: 'waiting', productId: product.id, productName: product.name, delay: Math.round(delay / 1000), total: products.length, successCount, failCount })
                const continued = await interruptibleWait(page, delay, slot)
                if (!continued) break

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    safeSend('mp-progress', slot, { index: i, status: 'resting', productId: product.id, productName: product.name, restSeconds, total: products.length, successCount, failCount })
                    const restContinued = await interruptibleWait(page, restSeconds * 1000, slot)
                    if (!restContinued) break
                }
            }
        }

        state[slot] = null
        e.sender.send('mp-done', slot, { successCount, failCount, total: products.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-list-marketplace', (e, slot) => {
        if (state[slot]) {
            state[slot].running = false
            state[slot] = null
        }
        if (!e.sender.isDestroyed()) {
            e.sender.send('mp-done', slot, { successCount: 0, failCount: 0, total: 0, stopped: true })
        }
        return { ok: true }
    })

    ipcMain.handle('pick-mp-images', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Select Product Images',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
            properties: ['openFile', 'multiSelections']
        })
        if (result.canceled) return { ok: false }
        return { ok: true, paths: result.filePaths }
    })

    ipcMain.handle('load-mp-txt', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Load Marketplace Products',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile']
        })
        if (result.canceled) return { ok: false }
        try {
            const content = fs.readFileSync(result.filePaths[0], 'utf8')
            const products = JSON.parse(content)
            return { ok: true, products: Array.isArray(products) ? products : [] }
        } catch (err) {
            return { ok: false, error: err.message }
        }
    })

    ipcMain.handle('save-mp-txt', async (e, products) => {
        const result = await dialog.showSaveDialog({
            title: 'Save Marketplace Products',
            defaultPath: 'marketplace_products.json',
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        })
        if (result.canceled) return { ok: false }
        const cleaned = products.map(p => {
            const { _selected, status, ...rest } = p
            return rest
        })
        fs.writeFileSync(result.filePath, JSON.stringify(cleaned, null, 2), 'utf8')
        return { ok: true }
    })
}


// ============================================================
// MAIN ORCHESTRATOR
// ============================================================
async function postMarketplaceListing(page, product, onStep) {
    const type = product.listingType || 'item'
    const urls = {
        item: 'https://www.facebook.com/marketplace/create/item',
        vehicle: 'https://www.facebook.com/marketplace/create/vehicle',
        property: 'https://www.facebook.com/marketplace/create/rental'
    }

    // STEP 1: Navigate
    onStep('Navigating to create page...')
    await page.goto(urls[type] || urls.item)
    await page.waitForTimeout(8000)

    const url = page.url()
    if (!url.includes('marketplace/create')) {
        onStep('Navigation failed, retrying...')
        await page.goto(urls[type] || urls.item)
        await page.waitForTimeout(8000)
    }

    // STEP 2: Upload images
    if (product.images && product.images.length > 0) {
        onStep(`Uploading ${product.images.length} images...`)
        const uploaded = await uploadImages(page, product.images, onStep)
        if (!uploaded) return 'Failed to upload images'
        await page.waitForTimeout(5000)
    }

    // STEP 3: Fill form
    onStep(`Filling ${type} details...`)
    let filled = false
    try {
        if (type === 'vehicle') filled = await fillVehicleForm(page, product, onStep)
        else if (type === 'property') filled = await fillPropertyForm(page, product, onStep)
        else filled = await fillItemForm(page, product, onStep)
    } catch (fillErr) {
        console.error(`[MP] Fill ${type} error:`, fillErr.message)
        onStep(`Form fill error: ${fillErr.message}`)
    }

    if (!filled) return `Failed to fill ${type} details`
    await page.waitForTimeout(2000)

    // STEP 4: Click Next
    onStep('Clicking Next...')
    const nextClicked = await clickNextBtn(page, product.location, onStep)
    if (!nextClicked) return 'Failed to click Next button'
    await page.waitForTimeout(3000)

    // STEP 5: Click Publish
    onStep('Clicking Publish...')
    const published = await clickPublishBtn(page, onStep)
    if (!published) return 'Failed to click Publish button'

    onStep('Post finished, waiting for confirmation...')
    await page.waitForTimeout(8000)
    return true
}


// ============================================================
// IMAGE UPLOAD
// ============================================================
async function uploadImages(page, imagePaths, onStep) {
    const validPaths = imagePaths.filter(p => fs.existsSync(p))
    if (validPaths.length === 0) return false

    // Method 1: Direct file input upload
    try {
        onStep('Attempting direct image upload...')
        const inputSelector = 'input[type="file"][accept*="image"]'
        await page.waitForSelector(inputSelector, 5000)
        for (const imgPath of validPaths) {
            await page.upload(inputSelector, imgPath)
            await page.waitForTimeout(1500)
        }
        return true
    } catch (e) {
        onStep('Direct upload failed, trying fallback...')
    }

    // Method 2: File chooser intercept
    try {
        const addPhotoSelectors = [
            '[aria-label="Add Photos"][role="button"]',
            '[aria-label="Tambah Foto"][role="button"]',
            '[aria-label="Add Photo"][role="button"]'
        ]
        const addPhotoXpaths = [
            "//div[@role='button']//span[contains(text(),'Add Photo')]",
            "//div[@role='button']//span[contains(text(),'Tambah Foto')]"
        ]

        for (const imgPath of validPaths) {
            onStep(`Uploading: ${path.basename(imgPath)}`)
            await page.interceptFileChooser(imgPath, { accept: true })

            let clicked = false
            for (const sel of addPhotoSelectors) {
                try { await page.click(sel); clicked = true; break } catch (err) { continue }
            }
            if (!clicked) {
                for (const xp of addPhotoXpaths) {
                    try { await page.clickByXpath(xp); clicked = true; break } catch (err) { continue }
                }
            }
            if (!clicked) {
                onStep('Could not find Add Photo button')
                await page.stopInterceptFileChooser()
                return false
            }
            await page.waitForTimeout(3000)
            await page.stopInterceptFileChooser()
        }
        return true
    } catch (e) {
        onStep(`Upload error: ${e.message}`)
        return false
    }
}


// ============================================================
// FORM: Item
// ============================================================
async function fillItemForm(page, product, onStep) {
    onStep('Filling title...')
    if (!await fillField(page, product.name, ['Title', 'Judul'])) return false
    await page.waitForTimeout(500)

    onStep('Filling price...')
    const price = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (!await fillField(page, price, ['Price', 'Harga'])) return false
    await page.waitForTimeout(500)

    onStep('Selecting category...')
    if (!await selectDropdown(page, product.category, ['Category', 'Kategori'], onStep)) return false
    await page.waitForTimeout(1000)

    onStep('Selecting condition...')
    if (!await selectDropdown(page, product.condition, ['Condition', 'Kondisi'], onStep)) return false
    await page.waitForTimeout(1000)

    onStep('Filling description...')
    await fillTextarea(page, product.description, ['Description', 'Deskripsi'])
    await page.waitForTimeout(1000)

    onStep('Filling location...')
    if (!await fillLocation(page, product.location, onStep)) return false
    await page.waitForTimeout(1000)

    return true
}


// ============================================================
// FORM: Vehicle
// ============================================================
async function fillVehicleForm(page, product, onStep) {
    product.vehicleType = 'Other'
    onStep(`Selecting vehicle type: ${product.vehicleType}...`)
    await selectDropdown(page, product.vehicleType, ['Vehicle type', 'Jenis kendaraan'], onStep)
    await page.waitForTimeout(500)

    onStep(`Selecting year: ${product.year}...`)
    if (!await selectDropdown(page, product.year, ['Year', 'Tahun'], onStep)) return false
    await page.waitForTimeout(500)

    onStep(`Filling make: ${product.make}...`)
    if (!await fillField(page, product.make, ['Make', 'Merek'])) return false
    await page.waitForTimeout(500)

    onStep(`Filling model: ${product.model}...`)
    if (!await fillField(page, product.model, ['Model'])) return false
    await page.waitForTimeout(500)

    onStep(`Filling price: ${product.price}...`)
    const price = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (!await fillField(page, price, ['Price', 'Harga'])) return false
    await page.waitForTimeout(500)

    onStep('Filling location...')
    if (!await fillLocation(page, product.location, onStep)) return false
    await page.waitForTimeout(500)

    onStep('Filling description...')
    if (!await fillTextarea(page, product.description, ['Description', 'Deskripsi'])) return false
    await page.waitForTimeout(500)

    return true
}


// ============================================================
// FORM: Property
// ============================================================
async function fillPropertyForm(page, product, onStep) {
    if (product.saleType) {
        onStep(`Selecting sale/rent type: ${product.saleType}...`)
        await selectDropdown(page, product.saleType, ['Home for sale or rent', 'Home for Sale or Rent', 'dijual atau disewakan'], onStep)
        await page.waitForTimeout(1000)
    }

    if (product.propertyType) {
        onStep(`Selecting property type: ${product.propertyType}...`)
        await selectDropdown(page, product.propertyType, ['Property type', 'Tipe properti'], onStep)
        await page.waitForTimeout(1000)
    }

    if (product.bedrooms) {
        onStep(`Filling bedrooms: ${product.bedrooms}...`)
        await fillField(page, product.bedrooms.toString(), ['Number of bedrooms', 'kamar tidur'])
        await page.waitForTimeout(500)
    }

    if (product.bathrooms) {
        onStep(`Filling bathrooms: ${product.bathrooms}...`)
        await fillField(page, product.bathrooms.toString(), ['Number of bathrooms', 'kamar mandi'])
        await page.waitForTimeout(500)
    }

    onStep(`Filling price: ${product.price}...`)
    const price = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (!await fillField(page, price, ['Price', 'Harga', 'Price per month', 'Sewa per bulan', 'Rent per month'])) return false
    await page.waitForTimeout(1000)

    if (product.squareMeters) {
        onStep(`Filling square meters: ${product.squareMeters}...`)
        await fillField(page, product.squareMeters.toString(), ['Square meters', 'Luas bangunan'])
        await page.waitForTimeout(500)
    }

    onStep('Filling location...')
    if (!await fillLocationProperty(page, product.location, onStep)) return false
    await page.waitForTimeout(1500)

    onStep('Filling description...')
    if (!await fillTextarea(page, product.description, ['Rental description', 'Property description', 'Description', 'Deskripsi'])) return false
    await page.waitForTimeout(1000)

    return true
}


// ============================================================
// HELPER: Fill text input field
// Finds an input inside a <label> whose text matches one of the labelHints.
// Uses ishbrowser evaluate (string-only), then types with human-like delay.
// ============================================================
async function fillField(page, value, labelHints) {
    if (!value) return false
    const v = esc(value.toString())
    const hints = JSON.stringify(labelHints)

    // Step 1: Find and focus the input via label text
    const focused = await page.evaluate(`
        (function() {
            var hints = ${hints};
            var labels = document.querySelectorAll('label');
            for (var h = 0; h < hints.length; h++) {
                for (var i = 0; i < labels.length; i++) {
                    var txt = labels[i].textContent.trim();
                    if (txt === hints[h] || txt.indexOf(hints[h]) !== -1) {
                        var input = labels[i].querySelector('input');
                        if (input) {
                            input.scrollIntoView({ block: 'center' });
                            input.focus();
                            input.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        })()
    `)

    if (!focused) {
        console.log(`[fillField] No label found for hints: ${labelHints.join(', ')}`)
        return false
    }

    // Step 2: Clear existing value & type new value
    await page.waitForTimeout(400)
    await page.keyboard.shortcut(['Control', 'a'])
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    for (const char of value.toString()) {
        await page.keyboard.type(char)
        await page.waitForTimeout(50 + Math.random() * 100)
    }

    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    console.log(`[fillField] ✅ Filled: ${value}`)
    return true
}


// ============================================================
// HELPER: Fill textarea (description)
// Finds textarea via label text or fallback to any textarea on page.
// ============================================================
async function fillTextarea(page, text, labelHints) {
    if (!text) return false
    const hints = JSON.stringify(labelHints || ['Description', 'Deskripsi'])

    const focused = await page.evaluate(`
        (function() {
            var hints = ${hints};
            var labels = document.querySelectorAll('label');
            for (var h = 0; h < hints.length; h++) {
                for (var i = 0; i < labels.length; i++) {
                    var txt = labels[i].textContent.trim();
                    if (txt === hints[h] || txt.indexOf(hints[h]) !== -1) {
                        var ta = labels[i].querySelector('textarea');
                        if (ta) {
                            ta.scrollIntoView({ block: 'center' });
                            ta.focus();
                            ta.click();
                            return true;
                        }
                    }
                }
            }
            // Fallback: find any textarea
            var textareas = document.querySelectorAll('textarea');
            if (textareas.length > 0) {
                var last = textareas[textareas.length - 1];
                last.scrollIntoView({ block: 'center' });
                last.focus();
                last.click();
                return true;
            }
            return false;
        })()
    `)

    if (!focused) {
        console.log(`[fillTextarea] No textarea found`)
        return false
    }

    await page.waitForTimeout(400)
    await page.keyboard.shortcut(['Control', 'a'])
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(200)

    // Type with line breaks support
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0) {
            await page.keyboard.type(lines[i], 25)
        }
        if (i < lines.length - 1) {
            await page.keyboard.shortcut(['Shift', 'Enter'])
            await page.waitForTimeout(100)
        }
    }
    await page.waitForTimeout(500)
    console.log(`[fillTextarea] ✅ Filled (${text.length} chars)`)
    return true
}


// ============================================================
// HELPER: Select dropdown option
// 2-step: open combobox → click matching option.
// ============================================================
async function selectDropdown(page, value, labelHints, onStep) {
    if (!value) return false
    const valueStr = value.toString()
    const v = esc(valueStr)
    const hints = JSON.stringify(labelHints)

    // Translation map for common dropdown values
    const translations = {
        'For Sale': ['For Sale'], 'Sale': ['For Sale', 'Sale'], 'Rent': ['Rent'],
        'Other': ['Other', 'Lainnya'],
        'New': ['New', 'Baru'], 'Used - Like New': ['Used - Like New', 'Bekas - Seperti Baru'],
        'Used - Good': ['Used - Good', 'Bekas - Baik'], 'Used - Fair': ['Used - Fair', 'Bekas - Cukup Baik'],
        'Apartment': ['Apartment/condo', 'Apartemen/condo', 'Apartment'], 'House': ['House', 'Rumah'],
        'Townhouse': ['Townhouse'], 'Condo': ['Condo'], 'Land': ['Land', 'Tanah'],
        'Car/Truck': ['Cars & Trucks', 'Mobil/Truk'], 'Motorcycle': ['Motorcycles', 'Sepeda Motor'],
        'Books Movies & Music': ['Books, Movies & Music'], 'Tools': ['Tools'],
        'Furniture': ['Furniture'], 'Household': ['Household'],
        'Electronics & computers': ['Electronics & computers'],
        'Mobile phones': ['Mobile phones'],
        'Miscellaneous': ['Miscellaneous']
    }
    const targets = translations[valueStr] || [valueStr]
    const targetsJson = JSON.stringify(targets)

    // STEP 1: Open dropdown by clicking the combobox label
    onStep(`Opening dropdown for: ${labelHints[0]}...`)
    const opened = await page.evaluate(`
        (function() {
            var hints = ${hints};
            var labels = document.querySelectorAll('label');
            for (var h = 0; h < hints.length; h++) {
                for (var i = 0; i < labels.length; i++) {
                    var txt = labels[i].textContent.trim();
                    if (txt === hints[h] || txt.indexOf(hints[h]) !== -1) {
                        var role = labels[i].getAttribute('role');
                        if (role === 'combobox' || labels[i].querySelector('[role="combobox"]')) {
                            labels[i].scrollIntoView({ block: 'center' });
                            labels[i].click();
                            return true;
                        }
                    }
                }
            }
            // Fallback: find span with hint text → click parent combobox
            var spans = document.querySelectorAll('span');
            for (var h = 0; h < hints.length; h++) {
                for (var s = 0; s < spans.length; s++) {
                    var st = spans[s].textContent.trim();
                    if (st === hints[h] || st.indexOf(hints[h]) !== -1) {
                        var cb = spans[s].closest('[role="combobox"]') || spans[s].closest('label');
                        if (cb) {
                            cb.scrollIntoView({ block: 'center' });
                            cb.click();
                            return true;
                        }
                    }
                }
            }
            return false;
        })()
    `)

    if (!opened) {
        onStep(`Could not open dropdown for: ${labelHints[0]}`)
        return false
    }

    await page.waitForTimeout(2000)

    // STEP 2: Click matching option
    onStep(`Looking for option: ${valueStr}...`)
    const clicked = await page.evaluate(`
        (function() {
            var targets = ${targetsJson};
            // Try [role="option"] elements
            var options = document.querySelectorAll('[role="option"]');
            for (var t = 0; t < targets.length; t++) {
                for (var i = 0; i < options.length; i++) {
                    var txt = options[i].textContent.trim();
                    if (txt === targets[t]) {
                        options[i].scrollIntoView({ block: 'center' });
                        options[i].click();
                        return true;
                    }
                }
            }
            // Fallback: case-insensitive match
            for (var t = 0; t < targets.length; t++) {
                for (var i = 0; i < options.length; i++) {
                    if (options[i].textContent.trim().toLowerCase() === targets[t].toLowerCase()) {
                        options[i].scrollIntoView({ block: 'center' });
                        options[i].click();
                        return true;
                    }
                }
            }
            // Fallback: partial match on all spans within dropdown area
            var spans = document.querySelectorAll('div[data-visualcompletion="ignore-dynamic"] span');
            for (var t = 0; t < targets.length; t++) {
                for (var s = 0; s < spans.length; s++) {
                    if (spans[s].textContent.trim() === targets[t]) {
                        spans[s].click();
                        return true;
                    }
                }
            }
            return false;
        })()
    `)

    if (clicked) {
        onStep(`✅ Option "${valueStr}" selected`)
        await page.waitForTimeout(1000)
        return true
    }

    // Fallback: type the value and press Enter
    onStep(`Option not found in list, typing: ${valueStr}`)
    await page.keyboard.type(valueStr, 50)
    await page.waitForTimeout(1500)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)
    return true
}


// ============================================================
// HELPER: Fill location field
// Scrolls to find it, types slowly, then selects first dropdown option.
// ============================================================
async function fillLocation(page, location, onStep) {
    if (!location) return false
    const loc = esc(location)
    onStep('Finding location field...')

    // Scroll to find location input
    for (let i = 0; i < 15; i++) {
        const found = await page.evaluate(`
            (function() {
                var el = document.querySelector('input[aria-label="Location"][role="combobox"]')
                    || document.querySelector('input[aria-label="Lokasi"][role="combobox"]');
                return !!el;
            })()
        `)
        if (found) break
        await page.mouse.wheel(0, 100)
        await page.waitForTimeout(300)
    }

    // Expand "More details" if collapsed
    await page.evaluate(`
        (function() {
            var btns = document.querySelectorAll('div[role="button"]');
            for (var i = 0; i < btns.length; i++) {
                var t = btns[i].textContent;
                if (t.indexOf('More details') !== -1 || t.indexOf('Detail selengkapnya') !== -1) {
                    if (btns[i].getAttribute('aria-expanded') !== 'true') btns[i].click();
                    break;
                }
            }
        })()
    `)
    await page.waitForTimeout(2000)

    // Focus on location input
    const focused = await page.evaluate(`
        (function() {
            var input = document.querySelector('input[aria-label="Location"][role="combobox"]')
                || document.querySelector('input[aria-label="Lokasi"][role="combobox"]');
            if (input) {
                if (input.value && input.value.trim().length > 2) return 'filled';
                input.scrollIntoView({ block: 'center' });
                input.focus();
                input.click();
                input.select();
                return 'ready';
            }
            return 'notfound';
        })()
    `)

    if (focused === 'filled') {
        onStep('Location already filled, skipping...')
        return true
    }
    if (focused === 'notfound') {
        onStep('Location field not found!')
        return false
    }

    return await _typeAndSelectLocation(page, location, onStep)
}


// ============================================================
// HELPER: Fill location (Property form)
// Property location input has aria-label="" (empty), unlike
// item/vehicle which has aria-label="Location".
// Strategy: try standard first, then scan for any empty combobox.
// ============================================================
async function fillLocationProperty(page, location, onStep) {
    if (!location) return false
    onStep('[Property] Finding location field...')

    // Scroll down to make sure location section is visible
    for (let i = 0; i < 15; i++) {
        await page.mouse.wheel(0, 200)
        await page.waitForTimeout(300)
    }
    await page.waitForTimeout(1000)

    // Expand "More details" if collapsed
    await page.evaluate(`
        (function() {
            var btns = document.querySelectorAll('div[role="button"]');
            for (var i = 0; i < btns.length; i++) {
                var t = btns[i].textContent;
                if (t.indexOf('More details') !== -1 || t.indexOf('Detail selengkapnya') !== -1) {
                    if (btns[i].getAttribute('aria-expanded') !== 'true') btns[i].click();
                    break;
                }
            }
        })()
    `)
    await page.waitForTimeout(2000)

    // Try standard location input first (item/vehicle style)
    const stdResult = await page.evaluate(`
        (function() {
            var input = document.querySelector('input[aria-label="Location"][role="combobox"]')
                || document.querySelector('input[aria-label="Lokasi"][role="combobox"]');
            if (input) {
                if (input.value && input.value.trim().length > 2) return 'filled';
                input.scrollIntoView({ block: 'center' });
                input.focus();
                input.click();
                return 'ready';
            }
            return 'notfound';
        })()
    `)

    if (stdResult === 'filled') {
        onStep('[Property] Location already filled')
        return true
    }
    if (stdResult === 'ready') {
        onStep('[Property] Found standard location input')
        return await _typeAndSelectLocation(page, location, onStep)
    }

    // Property-specific: find ALL combobox inputs and log them for debugging
    onStep('[Property] Standard location not found, scanning all combobox inputs...')
    const comboInfo = await page.evaluate(`
        (function() {
            var inputs = document.querySelectorAll('input[role="combobox"]');
            var results = [];
            for (var i = 0; i < inputs.length; i++) {
                results.push({
                    index: i,
                    label: inputs[i].getAttribute('aria-label') || '',
                    value: inputs[i].value || '',
                    autocomplete: inputs[i].getAttribute('aria-autocomplete') || '',
                    type: inputs[i].type || ''
                });
            }
            return JSON.stringify(results);
        })()
    `)
    console.log('[fillLocationProperty] All combobox inputs:', comboInfo)

    // Find and focus the property location input
    // It's typically the one with empty aria-label and aria-autocomplete="list"
    const propResult = await page.evaluate(`
        (function() {
            var inputs = document.querySelectorAll('input[role="combobox"]');
            // Pass 1: empty aria-label with autocomplete="list" (strongest match)
            for (var i = 0; i < inputs.length; i++) {
                var lbl = inputs[i].getAttribute('aria-label');
                var ac = inputs[i].getAttribute('aria-autocomplete');
                if ((lbl === '' || lbl === null) && ac === 'list') {
                    if (inputs[i].value && inputs[i].value.trim().length > 2) return 'filled';
                    inputs[i].scrollIntoView({ block: 'center' });
                    inputs[i].focus();
                    inputs[i].click();
                    return 'ready';
                }
            }
            // Pass 2: any combobox with empty aria-label
            for (var i = 0; i < inputs.length; i++) {
                var lbl = inputs[i].getAttribute('aria-label');
                if (lbl === '' || lbl === null) {
                    if (inputs[i].value && inputs[i].value.trim().length > 2) return 'filled';
                    inputs[i].scrollIntoView({ block: 'center' });
                    inputs[i].focus();
                    inputs[i].click();
                    return 'ready';
                }
            }
            // Pass 3: last unfocused/unfilled combobox input
            for (var i = inputs.length - 1; i >= 0; i--) {
                if (!inputs[i].value || inputs[i].value.trim().length < 2) {
                    inputs[i].scrollIntoView({ block: 'center' });
                    inputs[i].focus();
                    inputs[i].click();
                    return 'ready';
                }
            }
            return 'notfound';
        })()
    `)

    console.log('[fillLocationProperty] Property input result:', propResult)

    if (propResult === 'filled') {
        onStep('[Property] Location already filled')
        return true
    }
    if (propResult === 'notfound') {
        onStep('[Property] Location field NOT found after all methods!')
        return false
    }

    onStep('[Property] Found property location input, typing...')
    return await _typeAndSelectLocation(page, location, onStep)
}


// ============================================================
// HELPER: Type location and select from dropdown
// Shared logic between fillLocation and fillLocationProperty.
// Uses native mouse click for dropdown selection (most reliable).
// ============================================================
async function _typeAndSelectLocation(page, location, onStep) {
    onStep(`Typing location: ${location}`)
    await page.waitForTimeout(300)
    await page.keyboard.shortcut(['Control', 'a'])
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')
    await page.waitForTimeout(300)

    // Type with slow human-like delays
    for (let ci = 0; ci < location.length; ci++) {
        const char = location[ci]
        await page.keyboard.type(char)
        let delay = char === ' ' ? (200 + Math.random() * 200) : (80 + Math.random() * 180)
        if (Math.random() < 0.1 && ci > 2 && ci < location.length - 2) delay += 300 + Math.random() * 400
        await page.waitForTimeout(delay)
    }

    // Wait for location dropdown to appear
    onStep('Waiting for location suggestions...')
    await page.waitForTimeout(3000)

    // Probe for dropdown (up to 12 seconds)
    let dropdownFound = false
    for (let probe = 0; probe < 24; probe++) {
        const hasDropdown = await page.evaluate(`
            (function() {
                var sels = [
                    'ul[role="listbox"] li[role="option"]',
                    '[role="listbox"] [role="option"]',
                    'li[role="option"]'
                ];
                for (var i = 0; i < sels.length; i++) {
                    var el = document.querySelector(sels[i]);
                    if (el && el.offsetParent !== null) return true;
                }
                return false;
            })()
        `)
        if (hasDropdown) { dropdownFound = true; break }
        await page.waitForTimeout(500)
    }

    if (!dropdownFound) {
        onStep('No dropdown appeared, pressing Enter...')
        await page.keyboard.press('Enter')
        await page.waitForTimeout(1000)
        return true
    }

    onStep('Selecting first location option...')

    // METHOD 1: Native click via ishbrowser page.click on first option
    const optionSelectors = [
        'ul[role="listbox"] li[role="option"]:first-child',
        '[role="listbox"] [role="option"]:first-child',
        'li[role="option"]:first-child',
        'li[role="option"]'
    ]
    for (const sel of optionSelectors) {
        try {
            await page.click(sel)
            onStep('✅ Location selected (native click)')
            await page.waitForTimeout(1500)
            return true
        } catch (e) {
            console.log(`[_typeAndSelectLocation] Native click failed for ${sel}: ${e.message}`)
            continue
        }
    }

    // METHOD 2: Keyboard ArrowDown + Enter
    onStep('Trying keyboard selection...')
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(300)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)

    const closed2 = await page.evaluate(`
        (function() {
            var lb = document.querySelector('[role="listbox"]');
            return !lb || lb.offsetParent === null;
        })()
    `)
    if (closed2) {
        onStep('✅ Location selected (keyboard)')
        await page.waitForTimeout(1500)
        return true
    }

    // METHOD 3: JS event dispatch on first option
    await page.evaluate(`
        (function() {
            var sels = [
                'ul[role="listbox"] li[role="option"]:first-child',
                '[role="listbox"] [role="option"]',
                'li[role="option"]:first-child'
            ];
            for (var i = 0; i < sels.length; i++) {
                var el = document.querySelector(sels[i]);
                if (el && el.offsetParent !== null) {
                    el.scrollIntoView({ block: 'center' });
                    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                    return;
                }
            }
        })()
    `)
    await page.waitForTimeout(800)

    // METHOD 4: Double Enter fallback
    await page.keyboard.press('Enter')
    await page.waitForTimeout(200)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)

    onStep('✅ Location selected')
    await page.waitForTimeout(1500)
    return true
}


// ============================================================
// HELPER: Click Next button
// Detects disabled state and attempts form repair.
// ============================================================
async function clickNextBtn(page, location, onStep) {
    await page.waitForTimeout(3000)

    // Redundant location check
    if (location) {
        const locVal = await page.evaluate(`
            (function() {
                var i = document.querySelector('input[aria-label="Location"][role="combobox"]')
                    || document.querySelector('input[aria-label="Lokasi"][role="combobox"]')
                    || document.querySelector('input[role="combobox"][aria-label=""]');
                return i ? i.value : '';
            })()
        `)
        if (!locVal || locVal.trim().length < 2) {
            onStep('Location missing before Next, refilling...')
            await fillLocation(page, location, onStep)
            await page.waitForTimeout(2000)
        }
    }

    await page.mouse.wheel(0, 1000)
    await page.waitForTimeout(1000)

    // Try JS click with disabled detection
    const result = await page.evaluate(`
        (function() {
            var labels = ['Next', 'Selanjutnya', 'Lanjutkan'];
            for (var i = 0; i < labels.length; i++) {
                var btn = document.querySelector('[aria-label="' + labels[i] + '"][role="button"]');
                if (btn) {
                    var disabled = btn.getAttribute('aria-disabled') === 'true';
                    var hidden = window.getComputedStyle(btn).display === 'none';
                    if (hidden) continue;
                    if (disabled) return 'disabled';
                    btn.scrollIntoView({ block: 'center' });
                    btn.click();
                    return 'clicked';
                }
            }
            // Fallback: search by span text
            var spans = document.querySelectorAll('span');
            for (var i = 0; i < labels.length; i++) {
                for (var s = 0; s < spans.length; s++) {
                    if (spans[s].textContent.trim() === labels[i]) {
                        var b = spans[s].closest('[role="button"]');
                        if (b) {
                            if (b.getAttribute('aria-disabled') === 'true') return 'disabled';
                            b.scrollIntoView({ block: 'center' });
                            b.click();
                            return 'clicked';
                        }
                    }
                }
            }
            return 'notfound';
        })()
    `)

    if (result === 'clicked') {
        onStep('Next button clicked')
        await page.waitForTimeout(3000)
        return true
    }

    if (result === 'disabled') {
        onStep('Next button disabled, repairing form...')
        // Re-trigger location to wake up form state
        await page.evaluate(`
            (function() {
                var loc = document.querySelector('input[aria-label="Location"][role="combobox"]')
                    || document.querySelector('input[role="combobox"]');
                if (loc) { loc.focus(); loc.click(); }
            })()
        `)
        await page.waitForTimeout(2000)
        await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
        await page.waitForTimeout(2000)

        // Retry
        const retry = await page.evaluate(`
            (function() {
                var labels = ['Next', 'Selanjutnya', 'Lanjutkan'];
                for (var i = 0; i < labels.length; i++) {
                    var btn = document.querySelector('[aria-label="' + labels[i] + '"][role="button"]');
                    if (btn && btn.getAttribute('aria-disabled') !== 'true') {
                        btn.click();
                        return true;
                    }
                }
                return false;
            })()
        `)
        if (retry) {
            onStep('Next button clicked after form repair')
            await page.waitForTimeout(3000)
            return true
        }
    }

    // Final fallback: direct selector clicks
    const fallbacks = [
        '[aria-label="Next"][role="button"]',
        '[aria-label="Selanjutnya"][role="button"]',
        '[aria-label="Lanjutkan"][role="button"]'
    ]
    for (const sel of fallbacks) {
        try {
            await page.click(sel)
            onStep('Next button clicked (fallback)')
            await page.waitForTimeout(3000)
            return true
        } catch (e) { continue }
    }

    // XPath fallback
    try {
        await page.clickByXpath("//div[@role='button'][.//span[text()='Next' or text()='Selanjutnya' or text()='Lanjutkan']]")
        onStep('Next button clicked (xpath)')
        await page.waitForTimeout(3000)
        return true
    } catch (e) { /* ignore */ }

    return false
}


// ============================================================
// HELPER: Click Publish button
// Retries with disabled detection.
// ============================================================
async function clickPublishBtn(page, onStep) {
    await page.waitForTimeout(5000)

    for (let attempt = 0; attempt < 5; attempt++) {
        onStep(`Clicking Publish (try ${attempt + 1})...`)
        await page.mouse.wheel(0, 500)
        await page.waitForTimeout(500)

        const result = await page.evaluate(`
            (function() {
                var labels = ['Publish', 'Terbitkan', 'Publikasikan'];
                for (var i = 0; i < labels.length; i++) {
                    var btn = document.querySelector('[aria-label="' + labels[i] + '"][role="button"]');
                    if (btn) {
                        var disabled = btn.getAttribute('aria-disabled') === 'true';
                        if (disabled) return 'disabled';
                        btn.scrollIntoView({ block: 'center' });
                        btn.click();
                        return 'clicked';
                    }
                }
                // Search by span text
                var spans = document.querySelectorAll('span');
                for (var i = 0; i < labels.length; i++) {
                    for (var s = 0; s < spans.length; s++) {
                        if (spans[s].textContent.trim() === labels[i]) {
                            var b = spans[s].closest('[role="button"]');
                            if (b) {
                                if (b.getAttribute('aria-disabled') === 'true') return 'disabled';
                                b.scrollIntoView({ block: 'center' });
                                b.click();
                                return 'clicked';
                            }
                        }
                    }
                }
                return 'notfound';
            })()
        `)

        if (result === 'clicked') {
            onStep('✅ Publish button clicked!')
            await page.waitForTimeout(5000)
            return true
        }
        if (result === 'disabled') {
            onStep(`Publish button disabled, waiting...`)
        }

        // Fallback: direct selectors
        const fallbacks = [
            '[aria-label="Publish"][role="button"]',
            '[aria-label="Terbitkan"][role="button"]',
            '[aria-label="Publikasikan"][role="button"]'
        ]
        for (const sel of fallbacks) {
            try {
                await page.click(sel)
                onStep('✅ Publish button clicked!')
                await page.waitForTimeout(5000)
                return true
            } catch (e) { continue }
        }

        await page.waitForTimeout(3000)
    }
    return false
}
