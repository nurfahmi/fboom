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

    ipcMain.handle('start-auto-post-groups', async (e, slot, config) => {
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { groups, postText, filePaths, delayMin, delayMax, restAfter, restSeconds } = config
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
            if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'processing', total: groups.length, groupName: group.name, successCount, failCount })

            try {
                await page.goto(groupUrl)
                await page.waitForTimeout(5000)

                const finalText = spinText(postText)
                const success = await createGroupPost(page, finalText, filePaths)

                if (success) {
                    successCount++
                    if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'success', total: groups.length, groupName: group.name, successCount, failCount })
                } else {
                    failCount++
                    if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'error', error: 'Failed to post', total: groups.length, groupName: group.name, successCount, failCount })
                }
            } catch (err) {
                failCount++
                if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'error', error: err.message, total: groups.length, groupName: group.name, successCount, failCount })
            }

            // Delay between posts
            if (i < groups.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: groups.length, successCount, failCount })
                await page.waitForTimeout(delay)

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    if (!e.sender.isDestroyed()) e.sender.send('post-groups-progress', slot, { index: i, status: 'resting', restSeconds, total: groups.length, successCount, failCount })
                    await page.waitForTimeout(restSeconds * 1000)
                }
            }
        }

        state[slot] = null
        if (!e.sender.isDestroyed()) e.sender.send('post-groups-done', slot, { successCount, failCount, total: groups.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-auto-post-groups', (e, slot) => {
        if (state[slot]) state[slot].running = false
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
async function createGroupPost(page, postText, filePaths) {
    await page.waitForTimeout(3000)

    // STEP 1: Click "Write something..." button
    try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'Write something')]") }
    catch (e) {
        try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'Tulis sesuatu')]") }
        catch (e2) {
            try { await page.click('div[role="button"][tabindex="0"]') }
            catch (e3) { return false }
        }
    }
    await page.waitForTimeout(5000)

    // STEP 2: Upload files if provided
    if (filePaths && Array.isArray(filePaths) && filePaths.length > 0) {
        const existingFiles = filePaths.filter(f => fs.existsSync(f))
        if (existingFiles.length > 0) {
            await page.waitForTimeout(2000)
            for (const filePath of existingFiles) {
                try {
                    await page.interceptFileChooser(filePath, { persistent: true })
                    await page.click('div[role="button"][aria-label="Photo/video"]')
                    await page.stopInterceptFileChooser()
                    await page.waitForTimeout(2000)
                } catch (e) { continue }
            }
            const waitTime = Math.min(3000 + (existingFiles.length * 1500), 15000)
            await page.waitForTimeout(waitTime)
        }
    }

    // STEP 3: Type caption
    if (postText && postText.trim()) {
        // Use page.evaluate to find and focus the caption textbox
        let captionFocused = false
        try {
            captionFocused = await page.evaluate(`
                (function () {
                    const selectors = [
                        '[aria-placeholder="Create your pohst..."]',
                        '[aria-placeholder*="Create your post"]',
                    ];

                    for (const sel of selectors) {
                        try {
                            const el = document.querySelector(sel);
                            if (el) {
                                el.focus();
                                el.click();
                                return true;
                            }
                        } catch (e) {}
                    }

                    return false;
                })();
            `)
        } catch (e) { /* evaluate failed */ }


        if (captionFocused) {
            await page.waitForTimeout(1000)

            // Clear text (from facebook-groups-poster.js)
            await page.keyboard.down('Control')
            // await page.keyboard.press('a')
            await page.keyboard.up('Control')
            await page.waitForTimeout(300)
            await page.keyboard.press('Backspace')
            await page.waitForTimeout(500)

            // Type caption with line breaks support
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
            await page.waitForTimeout(1000)
            console.log('[CreateGroupPost] Caption typed successfully')
        } else {
            console.log('[CreateGroupPost] Caption textbox not found, continuing without caption')
        }
    }

    // STEP 4: Click Post button
    // Wait for the post button to be ready after caption
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
                    if (btn) { btn.click(); return true; }
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

    await page.waitForTimeout(5000)
    return true
}
