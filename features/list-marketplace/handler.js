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
            e.sender.send('mp-progress', slot, { index: i, status: 'posting', productId: product.id, productName: product.name, total: products.length, successCount, failCount })

            try {
                const success = await postMarketplaceListing(page, product)
                if (success) {
                    successCount++
                    e.sender.send('mp-progress', slot, { index: i, status: 'success', productId: product.id, productName: product.name, total: products.length, successCount, failCount })
                } else {
                    failCount++
                    e.sender.send('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: 'Post failed', total: products.length, successCount, failCount })
                }
            } catch (err) {
                failCount++
                e.sender.send('mp-progress', slot, { index: i, status: 'error', productId: product.id, productName: product.name, error: err.message, total: products.length, successCount, failCount })
            }

            // Delay between products
            if (i < products.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                e.sender.send('mp-progress', slot, { index: i, status: 'waiting', productId: product.id, productName: product.name, delay: Math.round(delay / 1000), total: products.length, successCount, failCount })
                await page.waitForTimeout(delay)

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    e.sender.send('mp-progress', slot, { index: i, status: 'resting', productId: product.id, productName: product.name, restSeconds, total: products.length, successCount, failCount })
                    await page.waitForTimeout(restSeconds * 1000)
                }
            }
        }

        state[slot] = null
        e.sender.send('mp-done', slot, { successCount, failCount, total: products.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-list-marketplace', (e, slot) => {
        if (state[slot]) state[slot].running = false
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
async function postMarketplaceListing(page, product) {
    const type = product.listingType || 'item'
    const urls = { item: 'https://www.facebook.com/marketplace/create/item', vehicle: 'https://www.facebook.com/marketplace/create/vehicle', property: 'https://www.facebook.com/marketplace/create/rental' }

    // STEP 1: Navigate to create page
    await page.goto(urls[type] || urls.item)
    await page.waitForTimeout(8000)
    const url = await page.url()
    if (!url.includes('marketplace/create')) {
        // Fallback navigation
        await page.goto(urls[type] || urls.item)
        await page.waitForTimeout(5000)
    }

    // STEP 2: Upload images
    if (product.images && product.images.length > 0) {
        const uploaded = await uploadImages(page, product.images)
        if (!uploaded) return false
        await page.waitForTimeout(3000)
    }

    // STEP 3: Fill details based on type
    let filled = false
    if (type === 'vehicle') filled = await fillVehicleForm(page, product)
    else if (type === 'property') filled = await fillPropertyForm(page, product)
    else filled = await fillItemForm(page, product)

    if (!filled) return false
    await page.waitForTimeout(2000)

    // STEP 4: Click Next
    const nextClicked = await clickNextBtn(page, product.location)
    if (!nextClicked) return false
    await page.waitForTimeout(3000)

    // STEP 5: Click Publish
    const published = await clickPublishBtn(page)
    if (!published) return false
    await page.waitForTimeout(8000)

    return true
}

// Upload images via file input
async function uploadImages(page, imagePaths) {
    const validPaths = imagePaths.filter(p => fs.existsSync(p))
    if (validPaths.length === 0) return false

    // Attempt direct upload first as it's most reliable if input exists
    try {
        const inputSelector = 'input[type="file"][accept*="image"]'
        await page.waitForSelector(inputSelector, 5000)
        for (const imgPath of validPaths) {
            await page.upload(inputSelector, imgPath)
            await page.waitForTimeout(1500)
        }
        return true
    } catch (e) { /* fallback */ }

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
            await page.waitForTimeout(3000)
            await page.stopInterceptFileChooser()
        }
        return true
    } catch (e) { return false }
}

// ========== ITEM FORM ==========
async function fillItemForm(page, product) {
    // Title
    if (!await fillField(page, product.name, [
        'input[id="_r_1l_"]', // Specific ID from HTML
        'input[aria-labelledby*="Title"]',
        'input[type="text"]:first-of-type'
    ])) return false
    await page.waitForTimeout(1000)

    // Price
    if (!await fillField(page, product.price, [
        'input[id="_r_1p_"]', // Specific ID from HTML
        'input[aria-labelledby*="Price"]',
        'input[type="text"]:nth-of-type(2)'
    ])) return false
    await page.waitForTimeout(1000)

    // Category
    if (!await selectDropdown(page, product.category, [
        '[aria-label="Category"]', '[aria-label="Kategori"]',
        "//label[@role='combobox'][.//span[contains(text(),'Category')]]",
        "//label[@role='combobox'][.//span[contains(text(),'Kategori')]]"
    ])) return false
    await page.waitForTimeout(1500)

    // Condition
    if (!await selectDropdown(page, product.condition, [
        '[aria-label="Condition"]', '[aria-label="Kondisi"]',
        "//label[@role='combobox'][.//span[contains(text(),'Condition')]]",
        "//label[@role='combobox'][.//span[contains(text(),'Kondisi')]]"
    ])) return false
    await page.waitForTimeout(1000)

    // Description
    if (!await fillTextarea(page, product.description)) return false
    await page.waitForTimeout(1000)

    // Location
    if (!await fillLocation(page, product.location)) return false
    await page.waitForTimeout(1500)

    return true
}

// ========== VEHICLE FORM ==========
async function fillVehicleForm(page, product) {
    // Vehicle type dropdown
    if (product.vehicleType && product.vehicleType !== 'Other') {
        await selectDropdown(page, product.vehicleType, [
            '[aria-label="Vehicle type"]', '[aria-label="Jenis kendaraan"]'
        ])
        await page.waitForTimeout(1000)
    }

    // Location
    if (!await fillLocation(page, product.location)) return false
    await page.waitForTimeout(1500)

    // Year (Required for vehicles)
    if (!await selectDropdown(page, product.year, [
        '[aria-label="Year"]', '[aria-label="Tahun"]',
        'input[aria-label="Year"]', 'input[aria-label="Tahun"]'
    ])) return false
    await page.waitForTimeout(1000)

    // Make
    if (!await fillField(page, product.make, [
        'input[aria-label="Make"]', 'input[aria-label="Merek"]',
        'input[placeholder="Make"]', 'input[placeholder="Merek"]'
    ])) return false
    await page.waitForTimeout(1000)

    // Model
    if (!await fillField(page, product.model, [
        'input[aria-label="Model"]', 'input[placeholder="Model"]'
    ])) return false
    await page.waitForTimeout(1000)

    // Price
    if (!await fillField(page, product.price, [
        'input[aria-label="Price"]', 'input[aria-label="Harga"]'
    ])) return false
    await page.waitForTimeout(1000)

    // Description
    if (!await fillTextarea(page, product.description)) return false
    await page.waitForTimeout(1000)

    return true
}

// ========== PROPERTY FORM ==========
async function fillPropertyForm(page, product) {
    // Sale/Rent type
    if (product.saleType) {
        await selectDropdown(page, product.saleType, [
            '[aria-label="Property for"]', '[aria-label="Properti untuk"]'
        ])
        await page.waitForTimeout(1000)
    }

    // Property type
    if (product.propertyType) {
        await selectDropdown(page, product.propertyType, [
            '[aria-label="Property type"]', '[aria-label="Jenis properti"]',
            '[aria-label="Type"]', '[aria-label="Tipe"]'
        ])
        await page.waitForTimeout(1000)
    }

    // Bedrooms
    if (product.bedrooms) {
        await fillField(page, product.bedrooms.toString(), [
            'input[aria-label="Number of bedrooms"]', 'input[aria-label="Jumlah kamar tidur"]'
        ])
        await page.waitForTimeout(500)
    }

    // Price
    if (!await fillField(page, product.price, [
        'input[aria-label="Price"]', 'input[aria-label="Harga"]',
        'input[aria-label="Rent per month"]', 'input[aria-label="Sewa per bulan"]'
    ])) return false
    await page.waitForTimeout(1000)

    // Location
    if (!await fillLocation(page, product.location)) return false
    await page.waitForTimeout(1500)

    // Description
    if (!await fillTextarea(page, product.description)) return false
    await page.waitForTimeout(1000)

    return true
}

// ========== HELPER: Fill text input ==========
async function fillField(page, value, selectors) {
    if (!value) return false

    for (const sel of selectors) {
        try {
            if (sel.startsWith('//')) {
                await page.clickByXpath(sel)
            } else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }
            await page.waitForTimeout(500)
            await page.keyboard.shortcut(['Control', 'a'])
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
async function fillTextarea(page, text) {
    if (!text) return false

    const selectors = [
        'textarea[aria-label="Description"]', 'textarea[aria-label="Deskripsi"]',
        'textarea[placeholder*="Description"]', 'textarea[placeholder*="Deskripsi"]',
        'textarea'
    ]

    for (const sel of selectors) {
        try {
            await page.waitForSelector(sel, 3000)
            await page.scrollIntoView(sel)
            await page.click(sel)
            await page.waitForTimeout(500)
            await page.keyboard.shortcut(['Control', 'a'])
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
async function selectDropdown(page, value, selectors) {
    if (!value) return false

    for (const sel of selectors) {
        try {
            if (sel.startsWith('//')) await page.clickByXpath(sel)
            else {
                await page.waitForSelector(sel, 3000)
                await page.scrollIntoView(sel)
                await page.click(sel)
            }
            await page.waitForTimeout(1500)

            // Try multiple option finding strategies
            const optionXpaths = [
                `//div[@role='option']//span[text()='${value}']`,
                `//div[@role='listbox']//div[contains(text(),'${value}')]`,
                `//div[@role='option'][contains(.,'${value}')]`,
                `//span[text()='${value}']`
            ]

            let optionClicked = false
            for (const ox of optionXpaths) {
                try {
                    await page.clickByXpath(ox)
                    optionClicked = true
                    break
                } catch (err) { continue }
            }

            if (!optionClicked) {
                // Try typing and enter
                await page.keyboard.type(value, 50)
                await page.waitForTimeout(1000)
                await page.keyboard.press('Enter')
            }

            await page.waitForTimeout(1000)
            return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Fill location with dropdown selection ==========
async function fillLocation(page, location) {
    if (!location) return false

    // Step 0: Ensure "More Details" is expanded if present
    try {
        const moreDetailsBtn = "//div[@role='button'][.//span[contains(text(), 'More details') or contains(text(), 'Detail selengkapnya')]]"
        await page.clickByXpath(moreDetailsBtn)
        await page.waitForTimeout(1000)
    } catch (e) { /* ignore if already expanded or not found */ }

    const selectors = [
        'input[aria-label="Location"][role="combobox"]',
        'input[aria-label="Lokasi"][role="combobox"]',
        'input[role="combobox"][placeholder*="Location"]',
        'input[role="combobox"][placeholder*="Lokasi"]'
    ]

    for (const sel of selectors) {
        try {
            await page.waitForSelector(sel, 3000)
            await page.scrollIntoView(sel)
            await page.click(sel)
            await page.waitForTimeout(500)
            await page.keyboard.shortcut(['Control', 'a'])
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(300)
            await page.keyboard.type(location, 50)
            await page.waitForTimeout(3000)

            // Click first match in dropdown
            const optXpaths = [
                "(//ul[@role='listbox']//li)[1]",
                "(//div[@role='option'])[1]",
                "(//div[@role='listbox']//div[contains(@class,'option')])[1]"
            ]

            let optClicked = false
            for (const ox of optXpaths) {
                try {
                    await page.clickByXpath(ox)
                    optClicked = true
                    break
                } catch (err) { continue }
            }

            if (!optClicked) {
                await page.keyboard.press('ArrowDown')
                await page.waitForTimeout(500)
                await page.keyboard.press('Enter')
            }

            await page.waitForTimeout(1500)
            return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Click Next button ==========
async function clickNextBtn(page, location) {
    await page.waitForTimeout(3000)

    // Redundant location check
    if (location) {
        try {
            const locVal = await page.getValue('input[role="combobox"]')
            if (!locVal || locVal.trim().length < 2) {
                await fillLocation(page, location)
                await page.waitForTimeout(1000)
            }
        } catch (e) { }
    }

    await page.mouse.wheel(0, 800)
    await page.waitForTimeout(1000)

    const nextSelectors = [
        '[aria-label="Next"][role="button"]',
        '[aria-label="Selanjutnya"][role="button"]',
        '[aria-label="Lanjutkan"][role="button"]',
        "//div[@role='button']//span[text()='Next']",
        "//div[@role='button']//span[text()='Selanjutnya']"
    ]

    for (const sel of nextSelectors) {
        try {
            if (sel.startsWith('//')) await page.clickByXpath(sel)
            else await page.click(sel)
            return true
        } catch (e) { continue }
    }
    return false
}

// ========== HELPER: Click Publish button ==========
async function clickPublishBtn(page) {
    await page.waitForTimeout(5000)
    await page.mouse.wheel(0, 800)

    // Try retrying up to 5 times for Publish button
    for (let attempt = 0; attempt < 5; attempt++) {
        const publishSelectors = [
            '[aria-label="Publish"][role="button"]',
            '[aria-label="Terbitkan"][role="button"]',
            '[aria-label="Publikasikan"][role="button"]',
            "//div[@role='button']//span[text()='Publish']",
            "//div[@role='button']//span[text()='Terbitkan']"
        ]

        for (const sel of publishSelectors) {
            try {
                if (sel.startsWith('//')) await page.clickByXpath(sel)
                else await page.click(sel)
                return true
            } catch (e) { continue }
        }
        await page.waitForTimeout(2000)
    }
    return false
}

