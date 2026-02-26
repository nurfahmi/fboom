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

    // Interruptible wait — checks stop flag every 500ms so Stop takes effect quickly
    const iWait = async (page, ms, slot) => {
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

        // Track processed post areas to avoid duplicates (same as scrip-old)
        const processedLikeAreas = new Set()
        const processedCommentAreas = new Set()
        let commentFailCount = 0
        const MAX_CONSECUTIVE_FAILURES = 3

        const sendProgress = (data) => {
            if (!e.sender || e.sender.isDestroyed()) return
            try {
                e.sender.send('feed-engagement-progress', String(slot), {
                    status: String(data.status || ''),
                    message: String(data.message || ''),
                    likeCount: Number(likeCount),
                    commentCount: Number(commentCount),
                    targetLikes: Number(targetLikes),
                    targetComments: Number(targetComments)
                })
            } catch (err) { console.error('[FeedEngagement] IPC Progress Error:', err.message) }
        }

        const sendDone = (data) => {
            if (!e.sender || e.sender.isDestroyed()) return
            try {
                e.sender.send('feed-engagement-done', String(slot), {
                    status: String(data.status || ''),
                    error: data.error ? String(data.error) : undefined,
                    likeCount: Number(likeCount),
                    commentCount: Number(commentCount),
                    targetLikes: Number(targetLikes),
                    targetComments: Number(targetComments)
                })
            } catch (err) { console.error('[FeedEngagement] IPC Done Error:', err.message) }
        }

        const isRunning = () => state[slot] && state[slot].running

        // Helper: random human-like scrolling (matching scrip-old)
        const randomHumanScroll = async () => {
            const randomScrolls = Math.floor(Math.random() * 8) + 2 // 2-10 times
            sendProgress({ status: 'scrolling', message: `📜 Random scrolling ${randomScrolls} times...` })
            for (let s = 0; s < randomScrolls; s++) {
                if (!isRunning()) break
                try {
                    await page.evaluate(`window.scrollBy({ top: ${Math.floor(Math.random() * 300) + 150}, behavior: 'smooth' })`)
                    await page.waitForTimeout(600 + Math.random() * 600)
                } catch (e) { break }
            }
        }

        try {
            // STEP 1: Navigate to Facebook Home Feed
            sendProgress({ status: 'navigating', message: '🌐 Navigating to Facebook Beranda...' })
            try {
                await page.goto('https://www.facebook.com/')
                await page.waitForTimeout(5000)
            } catch (navErr) {
                console.warn('[FeedEngagement] Initial navigation failed:', navErr.message)
                await page.goto('https://www.facebook.com/')
                await page.waitForTimeout(5000)
            }

            sendProgress({ status: 'started', message: '🚀 Starting feed engagement...' })

            // ===== PHASE 1: LIKES (using page.evaluate to find buttons, like scrip-old) =====
            if (enableLike && targetLikes > 0) {
                sendProgress({ status: 'phase', message: `❤️ Phase 1: Liking posts (0/${targetLikes})...` })

                scrollCount = 0
                while (isRunning() && likeCount < targetLikes && scrollCount < maxScrollAttempts) {
                    scrollCount++

                    // Use page.evaluate to find all Like buttons in viewport (same logic as scrip-old)
                    let likedInThisCycle = false
                    try {
                        const likeButtons = await page.evaluate(`
                            (function() {
                                const buttons = [];
                                const scrollY = window.scrollY || window.pageYOffset;
                                document.querySelectorAll('*').forEach(el => {
                                    const text = el.textContent?.trim().toLowerCase();
                                    if (text === 'like' || text === 'suka') {
                                        const button = el.closest('[role="button"]');
                                        if (button) {
                                            const rect = button.getBoundingClientRect();
                                            if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                                                const absoluteTop = scrollY + rect.top;
                                                const ariaPressed = button.getAttribute('aria-pressed');
                                                buttons.push({
                                                    postArea: Math.floor(absoluteTop / 300),
                                                    x: rect.x + rect.width / 2,
                                                    y: rect.y + rect.height / 2,
                                                    top: rect.top,
                                                    absoluteTop: absoluteTop,
                                                    alreadyLiked: ariaPressed === 'true'
                                                });
                                            }
                                        }
                                    }
                                });
                                return buttons.sort((a, b) => a.top - b.top);
                            })()
                        `)

                        if (likeButtons && likeButtons.length > 0) {
                            for (const btn of likeButtons) {
                                if (!isRunning() || likeCount >= targetLikes) break

                                // Skip already liked or already processed
                                if (btn.alreadyLiked) continue
                                if (processedLikeAreas.has(btn.postArea)) continue

                                // Mark as processed BEFORE action (same as scrip-old)
                                processedLikeAreas.add(btn.postArea)

                                // Click the like button using coordinates
                                try {
                                    await page.evaluate(`
                                        (function() {
                                            const el = document.elementFromPoint(${btn.x}, ${btn.y});
                                            if (el) {
                                                const button = el.closest('[role="button"]') || el;
                                                button.click();
                                            }
                                        })()
                                    `)
                                    await page.waitForTimeout(800)

                                    likeCount++
                                    actionCount++
                                    likedInThisCycle = true
                                    sendProgress({ status: 'liked', message: `❤️ Like #${likeCount}/${targetLikes} (Post area: ${btn.postArea})` })

                                    // Random human scroll after each like (same as scrip-old)
                                    await randomHumanScroll()

                                    // Random delay (interruptible)
                                    const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000)
                                    sendProgress({ status: 'waiting', message: `⏱️ Waiting ${Math.round(delay / 1000)}s...` })
                                    const continued = await iWait(page, delay, slot)
                                    if (!continued) break

                                    // Rest time check (interruptible)
                                    if (restAfter > 0 && actionCount > 0 && actionCount % restAfter === 0) {
                                        sendProgress({ status: 'resting', message: `💤 Resting ${restSeconds}s...` })
                                        const restCont = await iWait(page, restSeconds * 1000, slot)
                                        if (!restCont) break
                                    }

                                    break // Process one like per scroll cycle
                                } catch (clickErr) {
                                    console.log('[FeedEngagement] Like click error:', clickErr.message)
                                }
                            }
                        }
                    } catch (evalErr) {
                        console.log('[FeedEngagement] Like evaluate error:', evalErr.message)
                    }

                    // Scroll down to find more posts if no like was performed
                    if (!likedInThisCycle) {
                        try {
                            const scrollAmt = 600 + Math.floor(Math.random() * 400)
                            await page.evaluate(`window.scrollBy({ top: ${scrollAmt}, behavior: 'smooth' })`)
                            await page.waitForTimeout(2500)
                        } catch (e) { /* ignore scroll error */ }
                    }
                }

                sendProgress({ status: 'phase-done', message: `✅ Like phase done: ${likeCount}/${targetLikes}` })
            }

            // ===== PHASE 2: COMMENTS (using ISHBrowser API pattern from auto-comment handler) =====
            if (enableComment && targetComments > 0 && commentTemplates.length > 0) {
                sendProgress({ status: 'phase', message: `💬 Phase 2: Commenting (0/${targetComments})...` })

                scrollCount = 0
                commentFailCount = 0

                while (isRunning() && commentCount < targetComments && scrollCount < maxScrollAttempts) {
                    scrollCount++

                    // Find comment buttons using page.evaluate (same logic as scrip-old)
                    let commentBtnInfo = null
                    try {
                        const commentButtons = await page.evaluate(`
                            (function() {
                                const buttons = [];
                                const scrollY = window.scrollY || window.pageYOffset;

                                // Strategy 1: aria-label selectors
                                const commentSelectors = [
                                    '[aria-label="Comment"]',
                                    '[aria-label="Komentar"]',
                                    '[role="button"][aria-label="Comment"]',
                                    '[role="button"][aria-label="Komentar"]',
                                    '[aria-label="Leave a comment"]',
                                    '[aria-label="Write a comment"]'
                                ];

                                commentSelectors.forEach(selector => {
                                    document.querySelectorAll(selector).forEach(button => {
                                        const rect = button.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                                            const absoluteTop = scrollY + rect.top;
                                            const postArea = Math.floor(absoluteTop / 300);
                                            const exists = buttons.some(b => b.postArea === postArea);
                                            if (!exists) {
                                                buttons.push({
                                                    postArea: postArea,
                                                    x: rect.x + rect.width / 2,
                                                    y: rect.y + rect.height / 2,
                                                    top: rect.top,
                                                    absoluteTop: absoluteTop
                                                });
                                            }
                                        }
                                    });
                                });

                                // Strategy 2: Text-based matching (fallback)
                                document.querySelectorAll('[role="button"]').forEach(button => {
                                    const text = button.textContent?.trim().toLowerCase() || '';
                                    if (text === 'comment' || text === 'komentar') {
                                        const rect = button.getBoundingClientRect();
                                        if (rect.width > 0 && rect.height > 0 && rect.top > 100 && rect.top < window.innerHeight - 100) {
                                            const absoluteTop = scrollY + rect.top;
                                            const postArea = Math.floor(absoluteTop / 300);
                                            const exists = buttons.some(b => b.postArea === postArea);
                                            if (!exists) {
                                                buttons.push({
                                                    postArea: postArea,
                                                    x: rect.x + rect.width / 2,
                                                    y: rect.y + rect.height / 2,
                                                    top: rect.top,
                                                    absoluteTop: absoluteTop
                                                });
                                            }
                                        }
                                    }
                                });

                                return buttons.sort((a, b) => a.top - b.top);
                            })()
                        `)

                        // Find first un-processed comment button
                        if (commentButtons && commentButtons.length > 0) {
                            for (const btn of commentButtons) {
                                if (!processedCommentAreas.has(btn.postArea)) {
                                    commentBtnInfo = btn
                                    break
                                }
                            }
                        }
                    } catch (evalErr) {
                        console.log('[FeedEngagement] Comment evaluate error:', evalErr.message)
                    }

                    // If no comment button found, scroll and continue
                    if (!commentBtnInfo) {
                        try {
                            await page.evaluate(`window.scrollBy({ top: 700, behavior: 'smooth' })`)
                            await page.waitForTimeout(3000)
                        } catch (e) { /* ignore */ }
                        continue
                    }

                    // Click comment button using coordinates (same as scrip-old)
                    try {
                        await page.evaluate(`
                            (function() {
                                const el = document.elementFromPoint(${commentBtnInfo.x}, ${commentBtnInfo.y});
                                if (el) {
                                    const button = el.closest('[role="button"]') || el;
                                    button.click();
                                }
                            })()
                        `)
                        await page.waitForTimeout(2000)
                    } catch (e) {
                        try {
                            await page.evaluate(`window.scrollBy({ top: 500, behavior: 'smooth' })`)
                            await page.waitForTimeout(2000)
                        } catch (se) { /* ignore */ }
                        continue
                    }

                    // Get random comment template
                    const randomTemplate = commentTemplates[Math.floor(Math.random() * commentTemplates.length)]
                    const commentText = spinText(randomTemplate.text)

                    // Find comment box using ISHBrowser API (same pattern as auto-comment handler)
                    const commentBoxSelectors = [
                        'div[role="textbox"][contenteditable="true"][data-lexical-editor="true"]',
                        'div[role="textbox"][contenteditable="true"][aria-label*="Comment" i]',
                        'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
                        'div[role="textbox"][contenteditable="true"][aria-label*="Komentar" i]',
                        'div[role="textbox"][contenteditable="true"][placeholder*="Write" i]',
                        'div[role="textbox"][contenteditable="true"]',
                        '[role="textbox"][contenteditable="true"]'
                    ]

                    let boxFound = false
                    let activeBoxSelector = null
                    const MAX_RETRIES = 3

                    for (let retry = 1; retry <= MAX_RETRIES; retry++) {
                        sendProgress({ status: 'finding', message: `🔍 Looking for comment box (attempt ${retry}/${MAX_RETRIES})...` })

                        for (const sel of commentBoxSelectors) {
                            try {
                                await page.waitForSelector(sel, 3000)
                                await page.click(sel)
                                activeBoxSelector = sel
                                boxFound = true
                                break
                            } catch (e) { continue }
                        }

                        if (boxFound) break

                        // If not found, scroll slightly and re-click comment button
                        if (retry < MAX_RETRIES) {
                            try {
                                await page.evaluate(`window.scrollBy(0, 300)`)
                                await page.waitForTimeout(2000)
                                // Re-click comment button
                                await page.evaluate(`
                                    (function() {
                                        const el = document.elementFromPoint(${commentBtnInfo.x}, ${commentBtnInfo.y});
                                        if (el) {
                                            const button = el.closest('[role="button"]') || el;
                                            button.click();
                                        }
                                    })()
                                `)
                                await page.waitForTimeout(2000)
                            } catch (e) { /* ignore */ }
                        }
                    }

                    // Fallback: scroll down and retry (same as auto-comment handler)
                    if (!boxFound) {
                        try {
                            await page.evaluate(`window.scrollTo(0, document.body.scrollHeight)`)
                            await page.waitForTimeout(2000)
                            for (const sel of commentBoxSelectors) {
                                try {
                                    await page.waitForSelector(sel, 2000)
                                    await page.click(sel)
                                    activeBoxSelector = sel
                                    boxFound = true
                                    break
                                } catch (e) { continue }
                            }
                        } catch (e) { /* ignore */ }
                    }

                    if (!boxFound) {
                        commentFailCount++
                        console.log(`[FeedEngagement] Comment box NOT FOUND (Failure ${commentFailCount}/${MAX_CONSECUTIVE_FAILURES})`)
                        sendProgress({ status: 'warning', message: `⚠️ Comment box not found (${commentFailCount}/${MAX_CONSECUTIVE_FAILURES})` })
                        await closeCommentPopup(page)

                        if (commentFailCount >= MAX_CONSECUTIVE_FAILURES) {
                            sendProgress({ status: 'failed', message: `❌ Comment box not found ${MAX_CONSECUTIVE_FAILURES} times in a row, stopping comment phase` })
                            break
                        }

                        try {
                            await page.evaluate(`window.scrollBy({ top: 600, behavior: 'smooth' })`)
                            await page.waitForTimeout(2500)
                        } catch (e) { /* ignore */ }
                        continue
                    }

                    // Comment box FOUND — reset fail count
                    commentFailCount = 0

                    try {
                        // Clear and type comment (same pattern as auto-comment handler)
                        await page.waitForTimeout(500)
                        await page.focus(activeBoxSelector)
                        await page.waitForTimeout(300)
                        await page.keyboard.shortcut(['Control', 'a'])
                        await page.keyboard.press('Backspace')
                        await page.waitForTimeout(300)

                        // Multi-line support: split by \n and use Shift+Enter for new lines
                        const lines = commentText.split('\n')
                        for (let i = 0; i < lines.length; i++) {
                            if (lines[i].length > 0) {
                                const line = lines[i]
                                const chunkSize = 20
                                for (let c = 0; c < line.length; c += chunkSize) {
                                    const chunk = line.substring(c, Math.min(c + chunkSize, line.length))
                                    await page.keyboard.type(chunk, 30)
                                    await page.waitForTimeout(50 + Math.random() * 100)
                                }
                            }
                            if (i < lines.length - 1) {
                                await page.keyboard.shortcut(['Shift', 'Enter'])
                                await page.waitForTimeout(150)
                            }
                        }
                        await page.waitForTimeout(800)

                        // Upload image if template has one (same as auto-comment handler)
                        if (randomTemplate.imagePath && fs.existsSync(randomTemplate.imagePath)) {
                            console.log(`[FeedEngagement] Uploading image: ${path.basename(randomTemplate.imagePath)}`)
                            try {
                                const fileInputCount = await page.evaluate(`document.querySelectorAll('input[type="file"]').length`)
                                if (fileInputCount > 0) {
                                    const targetIndex = fileInputCount > 1 ? 1 : 0
                                    await page.uploadByIndex('input[type="file"]', targetIndex, randomTemplate.imagePath)
                                    console.log(`[FeedEngagement] Image uploaded to input[${targetIndex}] of ${fileInputCount}`)
                                    await page.waitForTimeout(3000)
                                }
                            } catch (uploadErr) {
                                console.log('[FeedEngagement] Image upload failed:', uploadErr.message)
                            }
                        }

                        // Submit comment (robust multi-strategy — same as auto-comment handler)
                        await page.waitForTimeout(500)
                        await submitComment(page, activeBoxSelector)
                        await page.waitForTimeout(2500)

                        // Mark as processed
                        processedCommentAreas.add(commentBtnInfo.postArea)
                        commentCount++
                        actionCount++
                        sendProgress({ status: 'commented', message: `💬 Comment #${commentCount}/${targetComments}: "${commentText.substring(0, 30)}..."` })

                        // Close comment popup/dialog
                        await closeCommentPopup(page)
                        await page.waitForTimeout(1000)

                        // Random human scroll after each comment (same as scrip-old)
                        await randomHumanScroll()

                        // Random delay (interruptible)
                        const delay = Math.floor((delayMin + Math.random() * (delayMax - delayMin)) * 1000)
                        sendProgress({ status: 'waiting', message: `⏱️ Waiting ${Math.round(delay / 1000)}s...` })
                        const continued = await iWait(page, delay, slot)
                        if (!continued) break

                        // Rest time check (interruptible)
                        if (restAfter > 0 && actionCount > 0 && actionCount % restAfter === 0) {
                            sendProgress({ status: 'resting', message: `💤 Resting ${restSeconds}s...` })
                            const restCont = await iWait(page, restSeconds * 1000, slot)
                            if (!restCont) break
                        }
                    } catch (commentErr) {
                        console.log('[FeedEngagement] Comment action error:', commentErr.message)
                        await closeCommentPopup(page)
                        try {
                            await page.evaluate(`window.scrollBy({ top: 500, behavior: 'smooth' })`)
                            await page.waitForTimeout(2000)
                        } catch (e) { /* ignore */ }
                    }
                }

                sendProgress({ status: 'phase-done', message: `✅ Comment phase done: ${commentCount}/${targetComments}` })
            }

            // Final summary
            sendProgress({ status: 'completed', message: `🎉 Done! ❤️${likeCount} likes 💬${commentCount} comments` })
            state[slot] = null
            runningSlots.delete(slot)
            sendDone({ status: 'completed' })
            return { ok: true, likeCount, commentCount }

        } catch (err) {
            console.error('[FeedEngagement] Main Loop Error:', err)
            const errMsg = err ? (err.message || String(err)) : 'Unknown error'
            sendDone({ status: 'error', error: errMsg })
            return { ok: false, error: errMsg }
        } finally {
            state[slot] = null
            runningSlots.delete(slot)
        }
    })

    ipcMain.handle('stop-feed-engagement', (e, slot) => {
        if (state[slot]) {
            state[slot].running = false
            state[slot] = null
        }
        runningSlots.delete(slot)
        if (!e.sender.isDestroyed()) {
            try {
                e.sender.send('feed-engagement-done', String(slot), {
                    status: 'stopped',
                    likeCount: 0,
                    commentCount: 0,
                    targetLikes: 0,
                    targetComments: 0
                })
            } catch (err) { /* ignore */ }
        }
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

// ============================================================
// Submit comment — robust multi-strategy (same as auto-comment handler)
// ============================================================
async function submitComment(page, activeBoxSelector) {
    let submitted = false

    // Try 1: Focused state composer submit button
    if (!submitted) {
        try {
            await page.click('#focused-state-composer-submit [role="button"]')
            submitted = true
        } catch (e) { /* try next */ }
    }

    // Try 2: aria-label based submit buttons
    const submitSelectors = [
        '[aria-label="Comment"][role="button"]',
        '[aria-label="Komentar"][role="button"]',
        '[aria-label="Post"][role="button"]',
        '[aria-label="Kirim"][role="button"]',
        '[aria-label="Comment"]',
        '[aria-label="Komentar"]',
        '[aria-label="Post"]',
    ]
    if (!submitted) {
        for (const sel of submitSelectors) {
            try {
                await page.click(sel)
                submitted = true
                break
            } catch (e) { continue }
        }
    }

    // Try 3: Evaluate to find a visible submit/comment button
    if (!submitted) {
        try {
            submitted = await page.evaluate(`
                (function() {
                    const btns = document.querySelectorAll('[role="button"]');
                    for (const btn of btns) {
                        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
                        const text = (btn.textContent || '').trim().toLowerCase();
                        if (label === 'comment' || label === 'komentar' || label === 'post' || label === 'kirim' ||
                            text === 'comment' || text === 'komentar' || text === 'post' || text === 'kirim') {
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                btn.click();
                                return true;
                            }
                        }
                    }
                    return false;
                })()
            `)
        } catch (e) { /* ignore */ }
    }

    // Try 4: Last resort — Enter key
    if (!submitted) {
        try {
            if (activeBoxSelector) {
                await page.focus(activeBoxSelector)
            }
            await page.keyboard.press('Enter')
            submitted = true
        } catch (e) { /* ignore */ }
    }
}

// ============================================================
// Close comment popup — multi-strategy
// ============================================================
async function closeCommentPopup(page) {
    // Try click Close button
    try { await page.click('div[aria-label="Close"][role="button"]') }
    catch (e) {
        try { await page.click('div[aria-label="Tutup"][role="button"]') }
        catch (e2) {
            // Try evaluate to find close button
            try {
                await page.evaluate(`
                    (function() {
                        const selectors = [
                            '[role="button"][aria-label="Close"]',
                            '[aria-label="Close"]',
                            '[aria-label="Tutup"]',
                            'div[aria-label="Close"]',
                            'div[aria-label="Tutup"]'
                        ];
                        for (const selector of selectors) {
                            const closeBtn = document.querySelector(selector);
                            if (closeBtn) { closeBtn.click(); return; }
                        }
                    })()
                `)
            } catch (e3) { /* ignore */ }
        }
    }

    // Also press Escape multiple times as fallback
    for (let i = 0; i < 3; i++) {
        try { await page.keyboard.press('Escape'); await page.waitForTimeout(300) } catch (e) { /* ignore */ }
    }
}
