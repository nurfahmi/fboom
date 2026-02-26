const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// Global marketplace products file
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

module.exports = function (getPage) {
    const state = {}

    // Interruptible wait — checks stop flag every 500ms so Stop takes effect quickly
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
        // Strip internal fields
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
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { products, delayMin, delayMax, restAfter, restSeconds } = config
        if (!products || products.length === 0) return { ok: false, error: 'No products selected' }

        state[slot] = { running: true }
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < products.length; i++) {
            if (!state[slot] || !state[slot].running) break

            const product = products[i]
            const onStep = (step) => {
                console.log(`[Slot ${slot}] Product ${i + 1}/${products.length}: ${step}`)
                e.sender.send('mp-progress', slot, {
                    index: i,
                    status: 'posting',
                    detail: step,
                    productId: product.id,
                    productName: product.name,
                    total: products.length,
                    successCount,
                    failCount
                })
            }

            try {
                const result = await postMarketplaceListing(page, product, onStep)
                if (result === true) {
                    successCount++
                    e.sender.send('mp-progress', slot, { index: i, status: 'success', productId: product.id, productName: product.name, total: products.length, successCount, failCount })
                } else {
                    failCount++
                    const errorMsg = typeof result === 'string' ? result : 'Post failed'
                    e.sender.send('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: errorMsg, total: products.length, successCount, failCount })
                }
            } catch (err) {
                failCount++
                console.error(`[Slot ${slot}] Error:`, err)
                e.sender.send('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: err.message, total: products.length, successCount, failCount })
            }

            // Delay between products (interruptible)
            if (i < products.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                e.sender.send('mp-progress', slot, { index: i, status: 'waiting', productId: product.id, productName: product.name, delay: Math.round(delay / 1000), total: products.length, successCount, failCount })
                const continued = await interruptibleWait(page, delay, slot)
                if (!continued) break

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    e.sender.send('mp-progress', slot, { index: i, status: 'resting', productId: product.id, productName: product.name, restSeconds, total: products.length, successCount, failCount })
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
        // Strip internal fields before saving
        const cleaned = products.map(p => {
            const { _selected, status, ...rest } = p
            return rest
        })
        fs.writeFileSync(result.filePath, JSON.stringify(cleaned, null, 2), 'utf8')
        return { ok: true }
    })
}

// Main posting orchestrator
async function postMarketplaceListing(page, product, onStep) {
    const type = product.listingType || 'item'
    const urls = { item: 'https://www.facebook.com/marketplace/create/item', vehicle: 'https://www.facebook.com/marketplace/create/vehicle', property: 'https://www.facebook.com/marketplace/create/rental' }

    // STEP 1: Navigate to create page
    onStep('Navigating to create page...')
    await page.goto(urls[type] || urls.item)
    await page.waitForTimeout(8000)
    const url = await page.url()
    if (!url.includes('marketplace/create')) {
        onStep('Navigation failed, trying again...')
        await page.goto(urls[type] || urls.item)
        await page.waitForTimeout(5000)
    }

    // STEP 2: Upload images
    if (product.images && product.images.length > 0) {
        onStep(`Uploading ${product.images.length} images...`)
        const uploaded = await uploadImages(page, product.images, onStep)
        if (!uploaded) return 'Failed to upload images'
        await page.waitForTimeout(3000)
    }

    // STEP 3: Fill details based on type
    onStep(`Filling ${type} details...`)
    let filled = false
    if (type === 'vehicle') filled = await fillVehicleForm(page, product, onStep)
    else if (type === 'property') filled = await fillPropertyForm(page, product, onStep)
    else filled = await fillItemForm(page, product, onStep)

    if (!filled) return `Failed to fill ${type} details`
    await page.waitForTimeout(200)

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

// Upload images via file input
async function uploadImages(page, imagePaths, onStep) {
    const validPaths = imagePaths.filter(p => fs.existsSync(p))
    if (validPaths.length === 0) return false

    // Attempt direct upload first
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
        onStep('Direct upload failed, trying fallback clicking method...')
    }

    // Try clicking add photos then intercepting
    try {
        const addPhotoSelectors = [
            '[aria-label="Add Photos"][role="button"]',
            '[aria-label="Tambah Foto"][role="button"]',
            '[aria-label="Add Photo"][role="button"]',
            "//div[@role='button']//span[contains(text(),'Add Photo')]",
            "//div[@role='button']//span[contains(text(),'Tambah Foto')]"
        ]

        for (const imgPath of validPaths) {
            onStep(`Uploading image: ${path.basename(imgPath)}`)
            await page.interceptFileChooser(imgPath, { accept: true })
            let clicked = false
            for (const sel of addPhotoSelectors) {
                try {
                    if (sel.startsWith('//')) await page.clickByXpath(sel)
                    else await page.click(sel)
                    clicked = true
                    break
                } catch (err) { continue }
            }
            if (!clicked) {
                onStep('Could not find Add Photo button for fallback.')
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

// ========== ITEM FORM ==========
async function fillItemForm(page, product, onStep) {
    // 1. Title
    onStep('Filling title...')
    const titleFilled = await fillField(page, product.name, [
        'input[aria-label="Title"]', 'input[aria-label="Judul"]',
        'input[aria-labelledby*="Title"]',
        "//label[.//span[contains(text(),'Title') or contains(text(),'Judul')]]//input"
    ])
    if (!titleFilled) return false
    await page.waitForTimeout(100)

    // 2. Price (formatted with commas like in poster script)
    onStep('Filling price...')
    const formattedPrice = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    const priceFilled = await fillField(page, formattedPrice, [
        'input[aria-label="Price"]', 'input[aria-label="Harga"]',
        'input[aria-labelledby*="Price"]',
        "//label[.//span[contains(text(),'Price') or contains(text(),'Harga')]]//input"
    ])
    if (!priceFilled) return false
    await page.waitForTimeout(100)

    // 3. Category
    onStep('Selecting category...')
    const categoryFilled = await selectDropdown(page, product.category, [
        '[aria-label="Category"]',
        '[aria-label="Kategori"]',
        "//label[contains(.,'Category') or contains(.,'Kategori')]//div[@role='combobox']",
        "//span[contains(text(),'Category') or contains(text(),'Kategori')]/ancestor::label",
        "//label[@role='combobox'][.//span[contains(text(),'Category') or contains(text(),'Kategori')]]"
    ], onStep)
    if (!categoryFilled) return false
    await page.waitForTimeout(200)

    // 4. Condition
    onStep('Selecting condition...')
    const conditionFilled = await selectDropdown(page, product.condition, [
        '[aria-label="Condition"]',
        '[aria-label="Kondisi"]',
        "//label[contains(.,'Condition') or contains(.,'Kondisi')]//div[@role='combobox']",
        "//span[contains(text(),'Condition') or contains(text(),'Kondisi')]/ancestor::label",
        "//label[@role='combobox'][.//span[contains(text(),'Condition') or contains(text(),'Kondisi')]]"
    ], onStep)
    if (!conditionFilled) return false
    await page.waitForTimeout(100)

    // 5. Description
    onStep('Filling description...')
    await fillTextarea(page, product.description)
    await page.waitForTimeout(100)

    // 6. Location
    onStep('Filling location...')
    const locationFilled = await fillLocation(page, product.location, onStep)
    if (!locationFilled) return false
    await page.waitForTimeout(150)

    return true
}

// ========== VEHICLE FORM ==========
async function fillVehicleForm(page, product, onStep) {
    // Vehicle type dropdown
    // Langsung set ke 'Other' tanpa perlu cek apapun
    product.vehicleType = 'Other';
    onStep(`Selecting vehicle type: ${product.vehicleType}...`)
    await selectDropdown(page, product.vehicleType, [
        '[aria-label="Vehicle type"]', '[aria-label="Jenis kendaraan"]',
        '//span[contains(text(), "Vehicle type")]/ancestor::div[@role="combobox"]'
    ], onStep)
    await page.waitForTimeout(100)

    // Year (Required for vehicles)
    onStep(`Selecting year: ${product.year}...`)
    if (!await selectDropdown(page, product.year, [
        '[aria-label="Year"]', '[aria-label="Tahun"]',
        'input[aria-label="Year"]', 'input[aria-label="Tahun"]',
        '//span[contains(text(), "Year") or contains(text(), "Tahun")]/ancestor::div[@role="combobox"]'
    ], onStep)) return false
    await page.waitForTimeout(500)

    // Make
    onStep(`Filling make: ${product.make}...`)
    if (!await fillField(page, product.make, [
        'input[aria-label="Make"]', 'input[aria-label="Merek"]',
        'input[placeholder="Make"]', 'input[placeholder="Merek"]',
        '//span[contains(text(), "Make") or contains(text(), "Merek")]/ancestor::div[@role="combobox"]//input',
        '//label[.//span[contains(text(), "Make") or contains(text(), "Merek")]]//input'
    ])) return false
    await page.waitForTimeout(500)

    // Model
    onStep(`Filling model: ${product.model}...`)
    if (!await fillField(page, product.model, [
        'input[aria-label="Model"]', 'input[placeholder="Model"]',
        '//span[contains(text(), "Model")]/ancestor::div[@role="combobox"]//input',
        '//label[.//span[contains(text(), "Model")]]//input'
    ])) return false
    await page.waitForTimeout(500)

    // Price
    onStep(`Filling price: ${product.price}...`)
    const formattedPrice = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (!await fillField(page, formattedPrice, [
        'input[aria-label="Price"]', 'input[aria-label="Harga"]',
        '//span[contains(text(), "Price") or contains(text(), "Harga")]/ancestor::div[@role="combobox"]//input',
        '//label[.//span[contains(text(), "Price") or contains(text(), "Harga")]]//input'
    ])) return false
    await page.waitForTimeout(500)

    // Location
    onStep('Filling location...')
    const locationFilled = await fillLocation(page, product.location, onStep)
    if (!locationFilled) return false
    await page.waitForTimeout(150)


    // Description
    onStep('Filling description...')
    if (!await fillTextarea(page, product.description)) return false
    await page.waitForTimeout(500)

    return true
}

// ========== PROPERTY FORM ==========
async function fillPropertyForm(page, product, onStep) {
    // 1. Sale/Rent type
    if (product.saleType) {
        onStep(`Selecting sale/rent type: ${product.saleType}...`)
        await selectDropdown(page, product.saleType, [
            '//span[contains(text(), "Home for Sale or Rent") or contains(text(), "dijual atau disewakan")]/ancestor::div[@role="combobox"]',
            '//span[contains(text(), "Home for sale or rent")]/ancestor::div[@role="combobox"]',
            'div[role="combobox"]'
        ], onStep);
        await page.waitForTimeout(1000);
    }

    // 2. Property type
    if (product.propertyType) {
        onStep(`Selecting property type: ${product.propertyType}...`)
        await selectDropdown(page, product.propertyType, [
            '[aria-label="Property type"]',
            '[aria-label="Jenis properti"]',
            '//span[contains(text(), "Property type") or contains(text(), "Tipe properti")]/ancestor::div[@role="combobox"]',
            'select[aria-label="Property type"]'
        ], onStep)
        await page.waitForTimeout(1000)
    }

    // 3. Bedrooms
    if (product.bedrooms) {
        onStep(`Filling bedrooms: ${product.bedrooms}...`)
        await fillField(page, product.bedrooms.toString(), [
            '//span[contains(text(), "Number of bedrooms") or contains(text(), "kamar tidur")]/following-sibling::input',
            '//span[contains(text(), "Number of bedrooms") or contains(text(), "kamar tidur")]/parent::*/input',
            '//label[.//span[contains(text(), "bedrooms") or contains(text(), "kamar tidur")]]//input',
            'input[aria-label*="bedrooms"]',
            'input[aria-label*="kamar tidur"]'
        ]);
        await page.waitForTimeout(500);
    }

    // 4. Bathrooms
    if (product.bathrooms) {
        onStep(`Filling bathrooms: ${product.bathrooms}...`)
        await fillField(page, product.bathrooms.toString(), [
            '//span[contains(text(), "Number of bathrooms") or contains(text(), "kamar mandi")]/following-sibling::input',
            '//span[contains(text(), "Number of bathrooms") or contains(text(), "kamar mandi")]/parent::*/input',
            '//label[.//span[contains(text(), "bathrooms") or contains(text(), "kamar mandi")]]//input',
            'input[aria-label*="bathrooms"]',
            'input[aria-label*="kamar mandi"]'
        ]);
        await page.waitForTimeout(500);
    }

    // 5. Price
    onStep(`Filling price: ${product.price}...`)
    const formattedPrice = product.price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    if (!await fillField(page, formattedPrice, [
        '//span[contains(text(), "Price") or contains(text(), "Harga") or contains(text(), "Sewa")]/following-sibling::input',
        '//span[contains(text(), "Price") or contains(text(), "Harga") or contains(text(), "Sewa")]/parent::*/input',
        '//label[.//span[contains(text(), "Price") or contains(text(), "Harga")]]//input',
        'input[aria-label="Price"]', 'input[aria-label="Harga"]',
        'input[aria-label="Rent per month"]', 'input[aria-label="Sewa per bulan"]'
    ])) return false
    await page.waitForTimeout(1000)

    // 6. Square Meters
    if (product.squareMeters) {
        onStep(`Filling square meters: ${product.squareMeters}...`)
        await fillField(page, product.squareMeters, [
            '//span[contains(text(), "Square meters") or contains(text(), "Luas bangunan")]/following-sibling::input',
            '//span[contains(text(), "Square meters") or contains(text(), "Luas bangunan")]/parent::*/input',
            '//label[.//span[contains(text(), "Square meters") or contains(text(), "Luas bangunan")]]//input',
            'input[aria-label*="Square meters"]',
            'input[aria-label*="Luas bangunan"]'
        ]);
        await page.waitForTimeout(500);
    }

    // 7. Location
    onStep(`Filling location: ${product.location}...`)
    if (!await fillLocationProperty(page, product.location, onStep)) return false
    await page.waitForTimeout(1500)

    // 8. Description
    onStep('Filling description (Property/Rental)...')
    const descSelectors = [
        '//span[contains(text(), "Property description") or contains(text(), "Rental description")]/following-sibling::div//textarea',
        '//label[.//span[contains(text(), "Property description") or contains(text(), "Rental description")]]//textarea',
        "//label[.//span[contains(text(),'Description') or contains(text(),'Deskripsi')]]//textarea",
    ]
    if (!await fillTextarea(page, product.description, descSelectors)) return false
    await page.waitForTimeout(1000)

    return true
}

// ========== HELPER: Fill text input ==========
async function fillField(page, value, selectors) {
    if (!value) return false
    console.log(`[fillField] Attempting to fill with value: ${value}`)

    // Pattern from poster script: Label to Input traversal
    for (const sel of selectors) {
        try {
            if (sel.startsWith('//') || sel.startsWith('xpath=')) {
                const xpath = sel.replace('xpath=', '')
                const clicked = await page.evaluate((xp) => {
                    const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = result.singleNodeValue;
                    if (el) {
                        // If it's already an input, click/focus it
                        if (el.tagName === 'INPUT') {
                            el.focus(); el.click(); return true;
                        }
                        // Otherwise, traverse up to find an input
                        let parent = el.parentElement;
                        while (parent) {
                            const input = parent.querySelector('input');
                            if (input) { input.focus(); input.click(); return true; }
                            parent = parent.parentElement;
                        }
                        // Fallback: closest label
                        const label = el.closest('label');
                        if (label) {
                            const input = label.querySelector('input');
                            if (input) { input.focus(); input.click(); return true; }
                        }
                    }
                    return false;
                }, xpath);
                if (!clicked) await page.clickByXpath(xpath);
            } else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }
            await page.waitForTimeout(500)
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(200)
            await page.keyboard.type(value.toString(), 25)
            await page.keyboard.press('Enter')
            await page.waitForTimeout(500)
            return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Fill textarea (description) ==========
async function fillTextarea(page, text, customSelectors = []) {
    if (!text) return false

    const defaultSelectors = [
        'textarea[aria-label*="Description"]', 'textarea[aria-label*="Deskripsi"]',
        'textarea[aria-label*="description"]', 'textarea[aria-label*="deskripsi"]',
        'textarea[placeholder*="Description"]', 'textarea[placeholder*="Deskripsi"]',
        'textarea[placeholder*="description"]', 'textarea[placeholder*="deskripsi"]',
        'textarea'
    ]
    const selectors = customSelectors.length > 0 ? customSelectors : defaultSelectors

    for (const sel of selectors) {
        try {
            let focused = false;
            if (sel.startsWith('//') || sel.startsWith('xpath=')) {
                const xpath = sel.replace('xpath=', '')
                focused = await page.evaluate((xp) => {
                    const result = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                    const el = result.singleNodeValue;
                    if (el) {
                        if (el.tagName === 'TEXTAREA') { el.focus(); el.click(); return true; }
                        let parent = el.parentElement;
                        while (parent) {
                            const ta = parent.querySelector('textarea');
                            if (ta) { ta.focus(); ta.click(); return true; }
                            parent = parent.parentElement;
                        }
                        const label = el.closest('label');
                        if (label) {
                            const ta = label.querySelector('textarea');
                            if (ta) { ta.focus(); ta.click(); return true; }
                        }
                    }
                    return false;
                }, xpath);
                if (!focused) await page.clickByXpath(xpath);
            } else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }

            await page.waitForTimeout(500)
            // await page.keyboard.shortcut(['Control', 'a'])
            await page.keyboard.press('Backspace')

            const lines = text.split('\n')
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > 0) await page.keyboard.type(lines[i], 25)
                if (i < lines.length - 1) {
                    await page.keyboard.shortcut(['Shift', 'Enter'])
                    await page.waitForTimeout(100)
                }
            }
            await page.waitForTimeout(500)
            return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Select dropdown option ==========
async function selectDropdown(page, value, selectors, onStep) {
    if (!value) return false

    for (const sel of selectors) {
        try {
            const hint = sel.match(/["'](.*?)["']/) ? sel.match(/["'](.*?)["']/)[1] : sel;
            onStep(`Opening dropdown: ${hint}...`)

            // Robust method to find and click the dropdown
            const opened = await page.evaluate((searchHint) => {
                // Try to find the exact span or label contains the text
                const spans = Array.from(document.querySelectorAll('span, label'));
                const target = spans.find(s => {
                    const txt = s.textContent.trim().toLowerCase();
                    return txt === searchHint.toLowerCase() || txt.includes(searchHint.toLowerCase());
                });

                if (target) {
                    const clickable = target.closest('div[role="combobox"]') ||
                        target.closest('label') ||
                        target.closest('div[role="button"]') ||
                        target;
                    clickable.scrollIntoView({ block: 'center' });
                    clickable.click();
                    return true;
                }

                // Fallback to searching by attribute if needed
                const attrEl = document.querySelector(`[aria-label*="${searchHint}"], [placeholder*="${searchHint}"]`);
                if (attrEl) {
                    attrEl.scrollIntoView({ block: 'center' });
                    attrEl.click();
                    return true;
                }

                return false;
            }, hint);

            if (!opened) {
                if (sel.startsWith('//')) {
                    await page.clickByXpath(sel)
                } else {
                    await page.waitForSelector(sel, 3000)
                    await page.scrollIntoView(sel)
                    await page.click(sel)
                }
            }

            await page.waitForTimeout(2000)

            // Mapping for translation & common variations
            const translations = {
                'For Sale': ['For Sale'],
                'Sale': ['For Sale'],
                'Rent': ['Rent'],
                'Tools': ['Tools'],
                'New': ['New', 'Baru'],
                'Used - Like New': ['Used - Like New', 'Bekas - Seperti Baru'],
                'Used - Good': ['Used - Good', 'Bekas - Baik'],
                'Used - Fair': ['Used - Fair', 'Bekas - Cukup Baik'],
                'Apartment': ['Apartment/condo', 'Apartemen/condo', 'Apartment', 'Apartemen'],
                'House': ['House', 'Rumah'],
                'Townhouse': ['Townhouse', 'Townhouse'],
                'Condo': ['Condo', 'Condo'],
                'Land': ['Land', 'Tanah'],
                'Car/Truck': ['Cars & Trucks', 'Mobil/Truk', 'Car/Truck', 'Car or Truck'],
                'Motorcycle': ['Motorcycles', 'Sepeda Motor', 'Motorcycle'],
                'Books Movies & Music': ['Books, Movies & Music', 'Buku, Film & Musik']
            }
            const targets = translations[value] || [value]
            onStep(`Looking for option matching: ${value}...`)

            const clickedText = await page.evaluate((possibleTexts) => {
                // Method 1: Target [role="option"] directly (most robust for years/exact matches)
                const options = Array.from(document.querySelectorAll('[role="option"]'));
                for (const opt of options) {
                    const text = opt.textContent.trim();
                    if (possibleTexts.includes(text) || possibleTexts.some(t => text.toLowerCase() === t.toLowerCase())) {
                        opt.scrollIntoView({ block: 'center' });
                        opt.click();
                        return text;
                    }
                }

                // Method 2: Search within spans (legacy/fallback)
                const spans = Array.from(document.querySelectorAll('span'));
                const targetSpan = spans.find(span => {
                    const txt = span.textContent.trim();
                    // 1. Priority: Exact match (case insensitive)
                    if (possibleTexts.some(t => txt.toLowerCase() === t.toLowerCase())) return true;

                    // 2. Fallback: Partial match but only if it's not a giant container (length < 50)
                    if (txt.length < 50 && possibleTexts.some(t => txt.toLowerCase().includes(t.toLowerCase()))) return true;

                    return false;
                });

                if (targetSpan) {
                    const actualText = targetSpan.textContent.trim();
                    const clickableElement = targetSpan.closest('div[role="option"]') ||
                        targetSpan.closest('div[role="button"]') ||
                        targetSpan.parentElement?.closest('div[role="button"]') ||
                        targetSpan;

                    clickableElement.scrollIntoView({ block: 'center' });
                    clickableElement.click();
                    return actualText;
                }
                return null;
            }, targets);

            if (clickedText) {
                onStep(`✅ Option "${clickedText}" selected`)
                await page.waitForTimeout(1000)
                return true
            }

            onStep(`Option not found by click, typing backup: ${value}`)
            await page.keyboard.type(value, 50)
            await page.waitForTimeout(1500)
            await page.keyboard.press('Enter')
            return true
        } catch (e) {
            onStep(`Dropdown error: ${e.message}`)
            continue
        }
    }
    return false
}

// ========== HELPER: Fill location (Item & Vehicle) ==========
async function fillLocation(page, location, onStep) {
    if (!location) return false

    onStep('Finding location field...')
    const selectors = [
        'input[aria-label="Location"][role="combobox"]',
        'input[aria-label="Lokasi"][role="combobox"]',
        'xpath=//i[contains(@style, "background-position: 0px -550px")]/ancestor::label//input',
        'input[role="combobox"][placeholder*="Location"]'
    ]

    for (const sel of selectors) {
        try {
            if (sel.startsWith('//') || sel.startsWith('xpath=')) {
                await page.clickByXpath(sel.replace('xpath=', ''))
            } else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }
            await page.waitForTimeout(500)

            onStep(`Typing location: ${location}`)
            // await page.keyboard.shortcut(['Control', 'a'])
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(300)

            for (const char of location) {
                await page.keyboard.type(char)
                await page.waitForTimeout(60 + Math.random() * 80)
            }

            onStep('Selecting first location option...')
            let success = false
            for (let i = 0; i < 15; i++) { // Max 7.5 seconds
                success = await page.evaluate(() => {
                    const listbox = document.querySelector('[role="listbox"]');
                    if (!listbox) return false;

                    // Ambil option pertama dalam listbox
                    const opt = listbox.querySelector('[role="option"]');
                    if (opt && opt.offsetParent !== null) {
                        // Cari span di dalamnya (biasanya berisi teks lokasi)
                        const span = opt.querySelector('span');
                        if (span) {
                            span.click();
                        } else {
                            opt.click();
                        }
                        return true;
                    }
                    return false;
                });

                if (success) break;

                // Fallback keyboard setiap 3 percobaan
                if (i > 0 && i % 3 === 0) {
                    await page.keyboard.press('ArrowDown')
                    await page.waitForTimeout(200)
                    await page.keyboard.press('Enter')
                    await page.waitForTimeout(500)
                    // Cek apakah listbox sudah hilang
                    if (await page.evaluate(() => !document.querySelector('[role="listbox"]'))) {
                        success = true; break;
                    }
                }
                await page.waitForTimeout(500);
            }

            if (success) {
                await page.waitForTimeout(1000)
                return true
            }
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Fill location (Property) ==========
async function fillLocationProperty(page, location, onStep) {
    if (!location) return false

    onStep('Searching for Property location field...')
    // Property location often needs scrolling and "More details"
    for (let scrollAttempt = 0; scrollAttempt < 10; scrollAttempt++) {
        const found = await page.evaluate(() => {
            const el = document.querySelector('i[style*="-658px"]') ||
                document.querySelector('i[style*="-550px"]') ||
                document.querySelector('input[aria-label="Location"]') ||
                document.querySelector('input[aria-label="Lokasi"]');
            return !!el;
        })
        if (found) break
        await page.mouse.wheel(0, 300)
        await page.waitForTimeout(500)
    }

    try {
        await page.evaluate(() => {
            const btn = [...document.querySelectorAll('div[role="button"]')]
                .find(b => b.textContent.includes('More details') || b.textContent.includes('Detail selengkapnya'))
            if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click()
        })
        await page.waitForTimeout(1500)
    } catch (e) { }

    const selectors = [
        'xpath=//i[contains(@style, "background-position: 0px -658px") or contains(@style, "background-position: 0px -550px")]/ancestor::label//input',
        'input[aria-label="Location"][role="combobox"]',
        'input[aria-label="Lokasi"][role="combobox"]',
        'input[role="combobox"]'
    ]

    for (const sel of selectors) {
        try {
            if (sel.startsWith('//') || sel.startsWith('xpath=')) {
                await page.clickByXpath(sel.replace('xpath=', ''))
            } else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }
            await page.waitForTimeout(500)

            onStep(`Typing property location: ${location}`)
            await page.keyboard.press('Backspace') // Clear existing
            await page.waitForTimeout(300)

            for (const char of location) {
                await page.keyboard.type(char)
                await page.waitForTimeout(60 + Math.random() * 80)
            }

            onStep('Selecting first location option...')
            let success = false
            for (let i = 0; i < 15; i++) {
                success = await page.evaluate(() => {
                    const listbox = document.querySelector('[role="listbox"]');
                    if (!listbox) return false;
                    const opt = listbox.querySelector('[role="option"]');
                    if (opt && opt.offsetParent !== null) {
                        const span = opt.querySelector('span');
                        if (span) span.click();
                        else opt.click();
                        return true;
                    }
                    return false;
                });
                if (success) break;

                if (i > 0 && i % 3 === 0) {
                    await page.keyboard.press('ArrowDown');
                    await page.waitForTimeout(200);
                    await page.keyboard.press('Enter');
                    await page.waitForTimeout(500);
                    if (await page.evaluate(() => !document.querySelector('[role="listbox"]'))) {
                        success = true; break;
                    }
                }
                await page.waitForTimeout(500);
            }
            if (success) {
                await page.waitForTimeout(1000)
                return true
            }
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Click Next button ==========
async function clickNextBtn(page, location, onStep) {
    await page.waitForTimeout(3000)

    // Redundant location check (from poster script repair attempts)
    if (location) {
        try {
            const val = await page.evaluate(() => {
                const i = document.querySelector('input[role="combobox"][aria-label*="Loc"]') ||
                    document.querySelector('input[role="combobox"][aria-label*="Lok"]')
                return i ? i.value : ''
            })
            if (!val || val.trim().length < 2) {
                onStep('Redundant check: Location missing, refilling...')
                await fillLocation(page, location, onStep)
                await page.waitForTimeout(1000)
            }
        } catch (e) { }
    }

    await page.mouse.wheel(0, 1000)
    await page.waitForTimeout(1000)

    const nextSelectors = [
        '[aria-label="Next"][role="button"]',
        '[aria-label="Selanjutnya"][role="button"]',
        '[aria-label="Lanjutkan"][role="button"]',
        "//div[@role='button'][.//span[text()='Next' or text()='Selanjutnya' or text()='Lanjutkan']]",
        "//div[@role='button'][contains(.,'Next') or contains(.,'Selanjutnya')]"
    ]

    for (const sel of nextSelectors) {
        try {
            if (sel.startsWith('//')) await page.clickByXpath(sel)
            else await page.click(sel)

            // Wait to see if we navigate
            await page.waitForTimeout(3000)
            const url = await page.url()
            if (url.includes('publish') || url.includes('next')) return true
            // If still can see publish button, it worked
            const hasPublish = await page.evaluate(() => [...document.querySelectorAll('span')].some(s => s.textContent === 'Publish' || s.textContent === 'Terbitkan'))
            if (hasPublish) return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Click Publish button ==========
async function clickPublishBtn(page, onStep) {
    await page.waitForTimeout(5000)

    // Retries from poster script
    for (let attempt = 0; attempt < 5; attempt++) {
        onStep(`Attempting to click Publish (try ${attempt + 1})...`)
        await page.mouse.wheel(0, 500)
        const publishSelectors = [
            '[aria-label="Publish"][role="button"]',
            '[aria-label="Terbitkan"][role="button"]',
            '[aria-label="Publikasikan"][role="button"]',
            "//div[@role='button'][.//span[text()='Publish' or text()='Terbitkan' or text()='Publikasikan']]",
            "//div[@role='button'][contains(.,'Publish')]"
        ]

        for (const sel of publishSelectors) {
            try {
                if (sel.startsWith('//')) await page.clickByXpath(sel)
                else await page.click(sel)

                onStep('Publish button clicked!')
                return true
            } catch (e) { continue }
        }
        await page.waitForTimeout(3000)
    }
    return false
}

