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
    const runningSlots = new Set()

    ipcMain.handle('start-feed-engagement', async (e, slot, config) => {
        if (runningSlots.has(slot)) return { ok: false, error: 'Already running' }

        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { enableLike, enableComment, targetLikes, targetComments, commentTemplates, delayMin, delayMax, restAfter, restSeconds } = config
        if (!enableLike && !enableComment) return { ok: false, error: 'Enable at least likes or comments' }
        if (enableComment && (!commentTemplates || commentTemplates.length === 0)) return { ok: false, error: 'Add at least one comment template' }

        runningSlots.add(slot)
        state[slot] = { running: true }

        let likeCount = 0
        let commentCount = 0
        let actionCount = 0
        let scrollCount = 0
        const maxScrollAttempts = 200

        const sendProgress = (data) => { try { if (e.sender && !e.sender.isDestroyed()) e.sender.send('feed-engagement-progress', slot, data) } catch (err) { } }
        const sendDone = (data) => { try { if (e.sender && !e.sender.isDestroyed()) e.sender.send('feed-engagement-done', slot, data) } catch (err) { } }
        const isRunning = () => state[slot] && state[slot].running

        try {
            // Navigate to feed if needed
            try {
                const url = page.url()
                if (!url.includes('facebook.com') || url.includes('login')) {
                    await page.goto('https://www.facebook.com/')
                    await page.waitForTimeout(3000)
                }
            } catch (e) {
                await page.goto('https://www.facebook.com/')
                await page.waitForTimeout(3000)
            }

            sendProgress({ status: 'started', message: '🚀 Starting feed engagement...', likeCount, commentCount, targetLikes, targetComments })

            // ===== PHASE 1: LIKES =====
            if (enableLike && targetLikes > 0) {
                sendProgress({ status: 'phase', message: `❤️ Phase 1: Liking posts (0/${targetLikes})...`, likeCount, commentCount, targetLikes, targetComments })

                while (isRunning() && likeCount < targetLikes && scrollCount < maxScrollAttempts) {
                    scrollCount++

                    // Find like buttons using $$() + innerText()
                    let liked = false
                    try {
                        const btns = await page.$$('[role="button"]')
                        for (const btn of btns) {
                            if (!isRunning() || likeCount >= targetLikes) { await btn.dispose(); break }
                            try {
                                const text = await btn.innerText()
                                const trimmed = (text || '').trim().toLowerCase()
                                if (trimmed === 'like' || trimmed === 'suka') {
                                    const visible = await btn.isVisible()
                                    if (visible) {
                                        await btn.scrollIntoView()
                                        await page.waitForTimeout(300)
                                        await btn.click()
                                        await page.waitForTimeout(800)

                                        likeCount++
                                        actionCount++
                                        liked = true
                                        sendProgress({ status: 'liked', message: `❤️ Like #${likeCount}/${targetLikes}`, likeCount, commentCount, targetLikes, targetComments })
                                        await btn.dispose()

                                        const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000)
                                        sendProgress({ status: 'waiting', message: `⏱️ Waiting ${Math.round(delay / 1000)}s...`, likeCount, commentCount, targetLikes, targetComments })
                                        await page.waitForTimeout(delay)

                                        if (restAfter > 0 && actionCount > 0 && actionCount % restAfter === 0) {
                                            sendProgress({ status: 'resting', message: `💤 Resting ${restSeconds}s...`, likeCount, commentCount, targetLikes, targetComments })
                                            await page.waitForTimeout(restSeconds * 1000)
                                        }
                                        break
                                    }
                                }
                                await btn.dispose()
                            } catch (e) { continue }
                        }
                    } catch (e) { /* skip this scroll cycle */ }

                    // Scroll to find more posts
                    const scrollAmt = 500 + Math.floor(Math.random() * 300)
                    await page.mouse.wheel(0, scrollAmt)
                    await page.waitForTimeout(2000)
                }
            }

            // ===== PHASE 2: COMMENTS =====
            if (enableComment && targetComments > 0 && commentTemplates.length > 0) {
                sendProgress({ status: 'phase', message: `💬 Phase 2: Commenting (0/${targetComments})...`, likeCount, commentCount, targetLikes, targetComments })

                scrollCount = 0
                let commentFailCount = 0

                while (isRunning() && commentCount < targetComments && scrollCount < maxScrollAttempts) {
                    scrollCount++

                    // Find comment button using $$()
                    let foundComment = false
                    try {
                        const commentBtns = await page.$$('[aria-label="Comment"], [aria-label="Komentar"], [aria-label="Leave a comment"]')
                        for (const btn of commentBtns) {
                            try {
                                const visible = await btn.isVisible()
                                if (visible) {
                                    await btn.scrollIntoView()
                                    await page.waitForTimeout(500)
                                    await btn.click()
                                    await page.waitForTimeout(2000)
                                    foundComment = true
                                    await btn.dispose()
                                    break
                                }
                                await btn.dispose()
                            } catch (e) { continue }
                        }
                    } catch (e) { /* no buttons */ }

                    if (!foundComment) {
                        await page.mouse.wheel(0, 700)
                        await page.waitForTimeout(2500)
                        continue
                    }

                    try {
                        // Pick random comment
                        const randomTemplate = commentTemplates[Math.floor(Math.random() * commentTemplates.length)]
                        const commentText = spinText(randomTemplate.text)

                        // Find and click comment box using $()
                        const boxSelectors = [
                            'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
                            'div[role="textbox"][contenteditable="true"][aria-label*="Comment"]',
                            'div[role="textbox"][contenteditable="true"][aria-label*="Komentar"]',
                            'div[role="textbox"][contenteditable="true"][aria-label*="Write"]',
                            'div[role="textbox"][contenteditable="true"]'
                        ]

                        let boxHandle = null
                        for (const sel of boxSelectors) {
                            try {
                                const handle = await page.$(sel)
                                if (handle) {
                                    const visible = await handle.isVisible()
                                    if (visible) {
                                        boxHandle = handle
                                        break
                                    }
                                    await handle.dispose()
                                }
                            } catch (e) { continue }
                        }

                        if (!boxHandle) {
                            commentFailCount++
                            await closeCommentPopup(page)
                            if (commentFailCount >= 3) break
                            await page.mouse.wheel(0, 600)
                            await page.waitForTimeout(2000)
                            continue
                        }

                        commentFailCount = 0
                        await boxHandle.click()
                        await page.waitForTimeout(500)

                        // Type comment
                        await page.keyboard.shortcut(['Control', 'a'])
                        await page.keyboard.press('Backspace')
                        await page.waitForTimeout(300)

                        const chunkSize = 10
                        for (let i = 0; i < commentText.length; i += chunkSize) {
                            const chunk = commentText.substring(i, Math.min(i + chunkSize, commentText.length))
                            await page.keyboard.type(chunk, 30)
                            await page.waitForTimeout(100 + Math.random() * 200)
                        }
                        await page.waitForTimeout(800)
                        await boxHandle.dispose()

                        // Upload image if provided
                        if (randomTemplate.imagePath && fs.existsSync(randomTemplate.imagePath)) {
                            try {
                                await page.upload('input[type="file"]', randomTemplate.imagePath)
                                await page.waitForTimeout(3000)
                            } catch (e) { /* optional */ }
                        }

                        // Submit
                        await submitComment(page)
                        await page.waitForTimeout(2500)

                        commentCount++
                        actionCount++
                        sendProgress({ status: 'commented', message: `💬 Comment #${commentCount}/${targetComments}: "${commentText.substring(0, 30)}..."`, likeCount, commentCount, targetLikes, targetComments })

                        // Close popup + scroll away
                        await closeCommentPopup(page)
                        await page.waitForTimeout(1000)

                        const bigScroll = 800 + Math.floor(Math.random() * 400)
                        await page.mouse.wheel(0, bigScroll)
                        await page.waitForTimeout(2000)

                        const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000)
                        sendProgress({ status: 'waiting', message: `⏱️ Waiting ${Math.round(delay / 1000)}s...`, likeCount, commentCount, targetLikes, targetComments })
                        await page.waitForTimeout(delay)

                        if (restAfter > 0 && actionCount > 0 && actionCount % restAfter === 0) {
                            sendProgress({ status: 'resting', message: `💤 Resting ${restSeconds}s...`, likeCount, commentCount, targetLikes, targetComments })
                            await page.waitForTimeout(restSeconds * 1000)
                        }
                    } catch (e) {
                        await closeCommentPopup(page)
                        await page.mouse.wheel(0, 500)
                        await page.waitForTimeout(2000)
                    }
                }
            }

            state[slot] = null
            runningSlots.delete(slot)
            sendDone({ likeCount, commentCount, targetLikes, targetComments })
            return { ok: true, likeCount, commentCount }

        } catch (err) {
            state[slot] = null
            runningSlots.delete(slot)
            sendDone({ likeCount, commentCount, targetLikes, targetComments, error: err.message })
            return { ok: false, error: err.message }
        }
    })

    ipcMain.handle('stop-feed-engagement', (e, slot) => {
        if (state[slot]) state[slot].running = false
        runningSlots.delete(slot)
        return { ok: true }
    })

    ipcMain.handle('pick-feed-comment-image', async (e) => {
        const result = await dialog.showOpenDialog({
            title: 'Select Comment Image',
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
            properties: ['openFile']
        })
        if (result.canceled || result.filePaths.length === 0) return { ok: false }
        return { ok: true, path: result.filePaths[0] }
    })
}

// Helper: submit comment
async function submitComment(page) {
    try { await page.click('[aria-label="Comment"][role="button"]') }
    catch (e) {
        try { await page.click('[aria-label="Komentar"][role="button"]') }
        catch (e2) { await page.keyboard.press('Enter') }
    }
}

// Helper: close comment popup
async function closeCommentPopup(page) {
    try { await page.click('div[aria-label="Close"][role="button"]') }
    catch (e) {
        try { await page.click('div[aria-label="Tutup"][role="button"]') }
        catch (e2) { /* no close button */ }
    }
    for (let i = 0; i < 3; i++) {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(300) } catch (e) { }
    }
}
