const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

// Spin text: {{option1|option2|option3}} → random pick
function spinText(text) {
    if (!text) return text
    return text.replace(/\{\{([^}]+)\}\}/g, (match, options) => {
        const list = options.split('|').map(o => o.trim()).filter(o => o.length > 0)
        return list.length > 0 ? list[Math.floor(Math.random() * list.length)] : match
    })
}

module.exports = function (getPage) {
    const state = {} // per-slot state

    // Interruptible wait — checks stop flag every 500ms so Stop takes effect quickly
    const interruptibleWait = async (page, ms, slot) => {
        const interval = 500
        let waited = 0
        while (waited < ms) {
            if (!state[slot] || !state[slot].running) return false // stopped
            const chunk = Math.min(interval, ms - waited)
            await page.waitForTimeout(chunk)
            waited += chunk
        }
        return true // completed without stop
    }

    ipcMain.handle('start-auto-post-groups', async (e, slot, config) => {
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { groups, title, postText, filePaths, delayMin, delayMax, restAfter, restSeconds } = config
        if (!groups || groups.length === 0) return { ok: false, error: 'No target groups' }
        if (!postText && (!filePaths || filePaths.length === 0)) return { ok: false, error: 'No post content (text or media)' }

        state[slot] = { running: true }
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < groups.length; i++) {
            if (!state[slot] || !state[slot].running) break
            if (e.sender.isDestroyed()) break

            const group = groups[i]
            const groupUrl = `https://www.facebook.com/groups/${group.groupId}/buy_sell_discussion`
            e.sender.send('post-groups-progress', slot, { index: i, status: 'processing', total: groups.length, groupName: group.name, successCount, failCount })

            try {
                await page.goto(groupUrl)
                await page.waitForTimeout(5000)

                const finalTitle = spinText(title)
                const finalText = spinText(postText)
                const success = await createGroupPost(page, finalTitle, finalText, filePaths)

                if (success) {
                    successCount++
                    if (!e.sender.isDestroyed()) {
                        e.sender.send('post-groups-progress', slot, { index: i, status: 'success', total: groups.length, groupName: group.name, successCount, failCount })
                    }
                } else {
                    failCount++
                    if (!e.sender.isDestroyed()) {
                        e.sender.send('post-groups-progress', slot, { index: i, status: 'error', error: 'Failed to post', total: groups.length, groupName: group.name, successCount, failCount })
                    }
                }
            } catch (err) {
                failCount++
                if (!e.sender.isDestroyed()) {
                    e.sender.send('post-groups-progress', slot, { index: i, status: 'error', error: err.message, total: groups.length, groupName: group.name, successCount, failCount })
                }
            }

            // Delay between posts (interruptible)
            if (i < groups.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                if (!e.sender.isDestroyed()) {
                    e.sender.send('post-groups-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: groups.length, successCount, failCount })
                }
                const continued = await interruptibleWait(page, delay, slot)
                if (!continued) break

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    if (!e.sender.isDestroyed()) {
                        e.sender.send('post-groups-progress', slot, { index: i, status: 'resting', restSeconds, total: groups.length, successCount, failCount })
                    }
                    const restContinued = await interruptibleWait(page, restSeconds * 1000, slot)
                    if (!restContinued) break
                }
            }
        }

        if (e.sender.isDestroyed()) return { ok: false, error: 'Window closed' }
        state[slot] = null
        e.sender.send('post-groups-done', slot, { successCount, failCount, total: groups.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-auto-post-groups', (e, slot) => {
        if (state[slot]) {
            state[slot].running = false
            state[slot] = null
        }
        if (!e.sender.isDestroyed()) {
            e.sender.send('post-groups-done', slot, { successCount: 0, failCount: 0, total: 0, stopped: true })
        }
        return { ok: true }
    })

    ipcMain.handle('load-post-groups-txt', async (e) => {
        const result = await dialog.showOpenDialog({
            title: 'Load Groups from TXT',
            filters: [{ name: 'Text Files', extensions: ['txt'] }],
            properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) return { ok: false }
        const content = fs.readFileSync(result.filePaths[0], 'utf8')
        const groups = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                const parts = line.split(',')
                return { name: parts[0] || '', groupId: parts[1] || parts[0] }
            })
        return { ok: true, groups }
    })

    ipcMain.handle('save-post-groups-txt', async (e, groups) => {
        const result = await dialog.showSaveDialog({
            title: 'Save Groups to TXT',
            defaultPath: 'post_target_groups.txt',
            filters: [{ name: 'Text Files', extensions: ['txt'] }]
        })
        if (result.canceled) return { ok: false }
        const lines = groups.map(g => `${g.name},${g.groupId}`).join('\n')
        fs.writeFileSync(result.filePath, lines, 'utf8')
        return { ok: true, path: result.filePath }
    })

    ipcMain.handle('pick-post-groups-media', async (e) => {
        const result = await dialog.showOpenDialog({
            title: 'Select Images/Videos',
            filters: [
                { name: 'Media Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mov', 'avi', 'mkv'] }
            ],
            properties: ['openFile', 'multiSelections']
        })
        if (result.canceled) return { ok: false }
        return { ok: true, paths: result.filePaths }
    })
}

// Post logic using ISHBrowser API only
async function createGroupPost(page, title, postText, filePaths) {
    await page.waitForTimeout(3000)

    // STEP 1: Click "Write something..." button
    console.log('[CreateGroupPost] STEP 1: Opening composer...')
    let composerOpened = false
    const composerSelectors = [
        "//div[@role='button']//span[contains(text(),'Write something')]",
        "//div[@role='button']//span[contains(text(),'Tulis sesuatu')]",
        "//div[@role='button']//span[contains(text(),'Create a public post')]",
    ]
    for (const xpath of composerSelectors) {
        try {
            await page.clickByXpath(xpath)
            composerOpened = true
            console.log('[CreateGroupPost] Composer opened via: ' + xpath)
            break
        } catch (e) { continue }
    }
    if (!composerOpened) {
        try { await page.click('div[role="button"][tabindex="0"]'); composerOpened = true }
        catch (e3) { return false }
    }
    await page.waitForTimeout(5000)

    // STEP 2: Upload files if provided
    // IMPORTANT: The file input inside the composer popup has accept="image/*,...,video/*,..."
    // We must use a specific selector to avoid targeting file inputs OUTSIDE the popup!
    // The correct selector is: input[type="file"][accept*="video"] (unique to the popup media input)
    if (filePaths && Array.isArray(filePaths) && filePaths.length > 0) {
        const existingFiles = filePaths.filter(f => fs.existsSync(f))
        if (existingFiles.length > 0) {
            console.log(`[CreateGroupPost] STEP 2: Uploading ${existingFiles.length} file(s)...`)
            await page.waitForTimeout(2000)

            // The popup file input selector — this is SPECIFIC to the composer popup
            // The popup's input has: accept="image/*,image/heif,image/heic,video/*,video/mp4,..."
            // Using [accept*="video"] ensures we only target the popup's media input, not other inputs on the page
            const POPUP_FILE_INPUT = 'input[type="file"][accept*="video"]'

            let uploadSuccess = false

            // ============================================================
            // STRATEGY A (PRIMARY): interceptFileChooser + click Photo/video button
            // This is the most reliable method — mimics what a real user does.
            // The Photo/video button is inside the popup with aria-label="Photo/video"
            // ============================================================
            console.log('[CreateGroupPost] Strategy A: interceptFileChooser + Photo/video click...')
            try {
                for (let i = 0; i < existingFiles.length; i++) {
                    const filePath = existingFiles[i]
                    const fileName = path.basename(filePath)
                    console.log(`[CreateGroupPost] Intercepting for file ${i + 1}/${existingFiles.length}: ${fileName}`)

                    // Set up interceptor BEFORE clicking the button
                    await page.interceptFileChooser(filePath, { accept: true })

                    // Click Photo/Video button inside the popup to trigger the file dialog
                    let triggered = false
                    const photoSelectors = [
                        'div[aria-label="Photo/video"][role="button"]',
                        'div[aria-label="Foto/video"][role="button"]',
                        'div[aria-label="Photo/video"]',
                        'div[aria-label="Foto/video"]',
                    ]
                    for (const sel of photoSelectors) {
                        try {
                            await page.click(sel)
                            triggered = true
                            console.log(`[CreateGroupPost] ✅ Clicked Photo/video: ${sel}`)
                            break
                        } catch (e) { continue }
                    }

                    // Fallback: try XPath for Photo/video button
                    if (!triggered) {
                        const xpathSelectors = [
                            "//div[@role='button'][@aria-label='Photo/video']",
                            "//div[@role='button'][@aria-label='Foto/video']",
                        ]
                        for (const xp of xpathSelectors) {
                            try {
                                await page.clickByXpath(xp)
                                triggered = true
                                console.log(`[CreateGroupPost] ✅ Clicked Photo/video via XPath: ${xp}`)
                                break
                            } catch (e) { continue }
                        }
                    }

                    // Fallback: JS evaluate to find Photo/video button
                    if (!triggered) {
                        try {
                            triggered = await page.evaluate(`
                                (function() {
                                    const btns = document.querySelectorAll('div[role="button"]');
                                    for (const btn of btns) {
                                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                                        if (label === 'photo/video' || label === 'foto/video') {
                                            btn.scrollIntoView({ block: 'center' });
                                            btn.click();
                                            return true;
                                        }
                                    }
                                    return false;
                                })()
                            `)
                            if (triggered) console.log('[CreateGroupPost] ✅ Clicked Photo/video via JS evaluate')
                        } catch (e) { /* ignore */ }
                    }

                    if (triggered) {
                        // Wait for file chooser to be intercepted
                        await page.waitForTimeout(3000)
                        uploadSuccess = true
                        console.log(`[CreateGroupPost] ✅ File ${fileName} provided via interceptor`)
                    } else {
                        console.log('[CreateGroupPost] ⚠️ Photo/video button not found for interceptor')
                    }

                    await page.stopInterceptFileChooser()
                    await page.waitForTimeout(1500)
                }
            } catch (e) {
                console.log(`[CreateGroupPost] Strategy A failed: ${e.message}`)
                try { await page.stopInterceptFileChooser() } catch (e2) { }
            }

            // ============================================================
            // STRATEGY B (FALLBACK): Direct upload to popup file input
            // Use the SPECIFIC selector: input[type="file"][accept*="video"]
            // This targets ONLY the file input inside the composer popup
            // ============================================================
            if (!uploadSuccess) {
                console.log('[CreateGroupPost] Strategy B: Direct upload to popup file input...')
                try {
                    // Check if the popup-specific file input exists
                    const popupInputCount = await page.evaluate(`document.querySelectorAll('${POPUP_FILE_INPUT}').length`)
                    console.log(`[CreateGroupPost] Popup file inputs found: ${popupInputCount}`)

                    if (popupInputCount > 0) {
                        for (let i = 0; i < existingFiles.length; i++) {
                            const filePath = existingFiles[i]
                            const fileName = path.basename(filePath)
                            console.log(`[CreateGroupPost] Direct uploading to popup input: ${fileName}`)
                            await page.upload(POPUP_FILE_INPUT, filePath)
                            console.log(`[CreateGroupPost] ✅ Uploaded ${fileName} via popup input`)
                            await page.waitForTimeout(2000 + Math.random() * 1000)
                        }
                        uploadSuccess = true
                    } else {
                        // Try clicking Photo/video first to reveal the input, then upload
                        console.log('[CreateGroupPost] No popup input found, clicking Photo/video to reveal it...')
                        let photoClicked = false
                        try { await page.click('div[aria-label="Photo/video"]'); photoClicked = true } catch (e) {
                            try { await page.click('div[aria-label="Foto/video"]'); photoClicked = true } catch (e2) { }
                        }
                        if (photoClicked) {
                            await page.waitForTimeout(3000)
                            const newCount = await page.evaluate(`document.querySelectorAll('${POPUP_FILE_INPUT}').length`)
                            if (newCount > 0) {
                                for (let i = 0; i < existingFiles.length; i++) {
                                    const filePath = existingFiles[i]
                                    const fileName = path.basename(filePath)
                                    await page.upload(POPUP_FILE_INPUT, filePath)
                                    console.log(`[CreateGroupPost] ✅ Uploaded ${fileName} after Photo/video click`)
                                    await page.waitForTimeout(2000 + Math.random() * 1000)
                                }
                                uploadSuccess = true
                            }
                        }
                    }
                } catch (e) {
                    console.log(`[CreateGroupPost] Strategy B failed: ${e.message}`)
                }
            }

            // ============================================================
            // STRATEGY C (LAST RESORT): uploadByIndex with popup-specific selector
            // ============================================================
            if (!uploadSuccess) {
                console.log('[CreateGroupPost] Strategy C: uploadByIndex to popup input...')
                try {
                    for (let i = 0; i < existingFiles.length; i++) {
                        const filePath = existingFiles[i]
                        const fileName = path.basename(filePath)
                        await page.uploadByIndex(POPUP_FILE_INPUT, 0, filePath)
                        console.log(`[CreateGroupPost] ✅ uploadByIndex for ${fileName}`)
                        await page.waitForTimeout(2000)
                    }
                    uploadSuccess = true
                } catch (e) {
                    console.log(`[CreateGroupPost] ❌ Strategy C failed: ${e.message}`)
                }
            }

            if (!uploadSuccess) {
                console.log('[CreateGroupPost] ❌ ALL upload strategies failed!')
            }

            // Wait for uploads to process
            const waitTime = Math.min(3000 + (existingFiles.length * 1500), 12000)
            console.log(`[CreateGroupPost] Waiting ${waitTime / 1000}s for upload processing...`)
            await page.waitForTimeout(waitTime)
        }
    } else {
        console.log('[CreateGroupPost] STEP 2: No files to upload')
    }

    // STEP 3: Type title and caption
    // Flow: click textbox → type title → Tab → type caption
    console.log('[CreateGroupPost] STEP 3: Typing title and caption...')
    if ((title && title.trim()) || (postText && postText.trim())) {
        // Use page.evaluate to find and focus the caption textbox
        let captionFocused = false
        try {
            captionFocused = await page.evaluate(`
                (function () {
                    const selectors = [
                        '[aria-placeholder*="Create a public post"]',
                        '[aria-placeholder*="Tulis sesuatu"]',
                        '[aria-placeholder*="Create your post"]',
                        '[role="textbox"][aria-label*="post"]',
                        '[contenteditable="true"]'
                    ];

                    for (const sel of selectors) {
                        try {
                            const els = document.querySelectorAll(sel);
                            for (const el of els) {
                                if (el.offsetParent !== null) { // is visible
                                    el.click();
                                    el.focus();
                                    return true;
                                }
                            }
                        } catch (e) {}
                    }

                    return false;
                })();
            `)
        } catch (e) { /* evaluate failed */ }

        if (captionFocused) {
            await page.waitForTimeout(1000)

            // Clear text just in case
            await page.keyboard.shortcut(['Control', 'a'])
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(300)

            // Type title first (if provided)
            if (title && title.trim()) {
                const titleLines = title.split('\n')
                for (let i = 0; i < titleLines.length; i++) {
                    if (titleLines[i].length > 0) {
                        await page.keyboard.type(titleLines[i], 20)
                    }
                    if (i < titleLines.length - 1) {
                        await page.keyboard.shortcut(['Shift', 'Enter'])
                        await page.waitForTimeout(100)
                    }
                }
                console.log('[CreateGroupPost] ✅ Title typed successfully')

                // Press Tab to move to caption field
                await page.waitForTimeout(500)
                await page.keyboard.press('Tab')
                await page.waitForTimeout(500)
            }

            // Type caption (if provided)
            if (postText && postText.trim()) {
                const lines = postText.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].length > 0) {
                        await page.keyboard.type(lines[i], 20)
                    }
                    if (i < lines.length - 1) {
                        await page.keyboard.shortcut(['Shift', 'Enter'])
                        await page.waitForTimeout(100)
                    }
                }
                console.log('[CreateGroupPost] ✅ Caption typed successfully')
            }

            await page.waitForTimeout(1000)
        } else {
            console.log('[CreateGroupPost] ⚠️ Caption textbox not found')
        }
    }

    // STEP 4: Click Post button
    console.log('[CreateGroupPost] STEP 4: Clicking Post button...')
    await page.waitForTimeout(3000)

    let posted = false

    // Strategy A: page.evaluate with multiple selectors
    try {
        posted = await page.evaluate(`
            (function() {
                // Try aria-label selectors
                const selectors = [
                    'div[aria-label="Post"][role="button"]',
                    'div[aria-label="Kirim"][role="button"]',
                    'div[aria-label="Posting"][role="button"]'
                ];
                for (const sel of selectors) {
                    const btn = document.querySelector(sel);
                    if (btn && btn.offsetParent !== null) { btn.click(); return true; }
                }
                // Try span text match
                const postTexts = ['Post', 'Kirim', 'Posting'];
                const spans = document.querySelectorAll('div[role="button"] span');
                for (const span of spans) {
                    const t = span.textContent.trim();
                    if (postTexts.includes(t)) {
                        let el = span;
                        while (el && el !== document.body) {
                            if (el.getAttribute('role') === 'button') {
                                el.click();
                                return true;
                            }
                            el = el.parentElement;
                        }
                    }
                }
                return false;
            })()
        `)
    } catch (e) { /* evaluate failed */ }

    // Strategy B: ISHBrowser API click fallback
    if (!posted) {
        try { await page.click('div[aria-label="Post"][role="button"]'); posted = true }
        catch (e) {
            try { await page.click('div[aria-label="Kirim"][role="button"]'); posted = true }
            catch (e2) {
                try { await page.clickByXpath("//div[@role='button']//span[text()='Post']"); posted = true }
                catch (e3) {
                    try { await page.clickByXpath("//div[@role='button']//span[text()='Kirim']"); posted = true }
                    catch (e4) {
                        // Last resort: press Enter
                        await page.keyboard.press('Enter')
                        posted = true
                    }
                }
            }
        }
    }

    if (posted) console.log('[CreateGroupPost] ✅ Post button clicked')
    await page.waitForTimeout(5000)
    return posted
}
