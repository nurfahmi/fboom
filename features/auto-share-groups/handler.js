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

    ipcMain.handle('start-auto-share-groups', async (e, slot, config) => {
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { groups, postUrl, caption, delayMin, delayMax, restAfter, restSeconds } = config
        if (!groups || groups.length === 0) return { ok: false, error: 'No target groups' }
        if (!postUrl) return { ok: false, error: 'No post URL' }

        state[slot] = { running: true }
        let successCount = 0
        let failCount = 0

        for (let i = 0; i < groups.length; i++) {
            if (!state[slot] || !state[slot].running) break

            const group = groups[i]
            e.sender.send('share-groups-progress', slot, { index: i, status: 'processing', total: groups.length, groupName: group.name, successCount, failCount })

            try {
                const finalCaption = spinText(caption)
                const success = await shareToGroup(page, postUrl, group, finalCaption)

                if (success) {
                    successCount++
                    e.sender.send('share-groups-progress', slot, { index: i, status: 'success', total: groups.length, groupName: group.name, successCount, failCount })
                } else {
                    failCount++
                    e.sender.send('share-groups-progress', slot, { index: i, status: 'error', error: 'Failed to share', total: groups.length, groupName: group.name, successCount, failCount })
                }
            } catch (err) {
                failCount++
                e.sender.send('share-groups-progress', slot, { index: i, status: 'error', error: err.message, total: groups.length, groupName: group.name, successCount, failCount })
            }

            // Delay between shares
            if (i < groups.length - 1 && state[slot] && state[slot].running) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                e.sender.send('share-groups-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: groups.length, successCount, failCount })
                await page.waitForTimeout(delay)

                // Rest time
                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    e.sender.send('share-groups-progress', slot, { index: i, status: 'resting', restSeconds, total: groups.length, successCount, failCount })
                    await page.waitForTimeout(restSeconds * 1000)
                }
            }
        }

        state[slot] = null
        e.sender.send('share-groups-done', slot, { successCount, failCount, total: groups.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-auto-share-groups', (e, slot) => {
        if (state[slot]) state[slot].running = false
        return { ok: true }
    })

    ipcMain.handle('load-share-groups-txt', async (e) => {
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

    ipcMain.handle('save-share-groups-txt', async (e, groups) => {
        const result = await dialog.showSaveDialog({
            title: 'Save Groups to TXT',
            defaultPath: 'share_target_groups.txt',
            filters: [{ name: 'Text Files', extensions: ['txt'] }]
        })
        if (result.canceled) return { ok: false }
        const lines = groups.map(g => `${g.name},${g.groupId}`).join('\n')
        fs.writeFileSync(result.filePath, lines, 'utf8')
        return { ok: true, path: result.filePath }
    })
}

// Share logic using ISHBrowser API only
async function shareToGroup(page, postUrl, group, caption) {
    try {
        // Clean group name
        let cleanName = group.name
            .replace(/\s*Last active.*/i, '')
            .replace(/\s*Active.*/i, '')
            .replace(/\s*about an hour ago.*/i, '')
            .replace(/\s*ago.*/i, '')
            .replace(/\s*\d+\s*(minutes?|hours?|days?)\s*ago/gi, '')
            .replace(/\s+/g, ' ')
            .trim()

        console.log(`[ShareToGroup] Starting share to: "${cleanName}"`)

        // STEP 1: Navigate to post
        await page.goto(postUrl)
        await page.waitForTimeout(5000)

        // STEP 2: Click Share button — try multiple selectors
        let shareClicked = false
        const shareSelectors = [
            '[role="dialog"] div[aria-label*="Send this to friends or post it on your profile."][role="button"]',
            'div[aria-label*="Send this to friends or post it on your profile."][role="button"]',
            'div[aria-label*="Send this to friends"][role="button"]',
            'div[aria-label="Share"][role="button"]',
            'div[aria-label="Bagikan"][role="button"]'
        ]
        for (const sel of shareSelectors) {
            if (shareClicked) break
            try {
                await page.scrollIntoView(sel)
                await page.waitForTimeout(1000)
                await page.click(sel)
                shareClicked = true
            } catch (e) { /* try next */ }
        }
        if (!shareClicked) {
            // XPath fallback
            try { await page.clickByXpath("//div[@role='button']//span[text()='Share']"); shareClicked = true }
            catch (e) {
                try { await page.clickByXpath("//div[@role='button']//span[text()='Bagikan']"); shareClicked = true }
                catch (e2) { /* failed */ }
            }
        }
        if (!shareClicked) return false
        await page.waitForTimeout(5000)

        // STEP 3: Click "Group" option — using page.evaluate to find span with exact text and click parent
        let groupOptionClicked = false
        try {
            groupOptionClicked = await page.evaluate(`
                (function() {
                    // Strategy 1: Find span with exact text "Group"
                    const groupSpan = [...document.querySelectorAll('span')]
                        .find(s => s.textContent.trim() === 'Group');
                    if (groupSpan) {
                        const groupButton = groupSpan.parentElement?.parentElement;
                        if (groupButton) { groupButton.click(); return true; }
                        groupSpan.click(); return true;
                    }
                    // Strategy 2: Find span with text "Grup" (Indonesian)
                    const grupSpan = [...document.querySelectorAll('span')]
                        .find(s => s.textContent.trim() === 'Grup');
                    if (grupSpan) {
                        const grupButton = grupSpan.parentElement?.parentElement;
                        if (grupButton) { grupButton.click(); return true; }
                        grupSpan.click(); return true;
                    }
                    return false;
                })()
            `)
        } catch (e) { /* evaluate failed */ }

        // Fallback: XPath click
        if (!groupOptionClicked) {
            try { await page.clickByXpath("//div[@role='button']//span[text()='Group']"); groupOptionClicked = true }
            catch (e) {
                try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'Group')]"); groupOptionClicked = true }
                catch (e2) {
                    try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'Grup')]"); groupOptionClicked = true }
                    catch (e3) { /* failed */ }
                }
            }
        }

        if (!groupOptionClicked) {
            console.log('[ShareToGroup] Group option not found')
            return false
        }
        await page.waitForTimeout(3000)

        // STEP 4: Search group name — using page.evaluate to find input, clear, and focus it
        let searchReady = false
        try {
            searchReady = await page.evaluate(`
                (function() {
                    const input = document.querySelector('input[aria-label="Search for groups"]');
                    if (input) {
                        input.value = '';
                        input.focus();
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    }
                    return false;
                })()
            `)
        } catch (e) { /* evaluate failed */ }

        // Fallback: try using ISHBrowser focus
        if (!searchReady) {
            try {
                await page.focus('input[aria-label="Search for groups"]')
                searchReady = true
            } catch (e) {
                console.log('[ShareToGroup] Search input not found')
                return false
            }
        }

        await page.waitForTimeout(500)
        await page.keyboard.type(cleanName, 15)
        await page.waitForTimeout(2500)

        // STEP 5: Select matching group from search results
        let groupSelected = false

        // Strategy A: page.evaluate with multiple strategies (from facebook-share-poster.js)
        try {
            groupSelected = await page.evaluate(`
                (function() {
                    const searchText = ${JSON.stringify(cleanName)};
                    // Strategy 1: Exact XPath match
                    try {
                        const xpath = '//span[text()="' + searchText + '"]/ancestor::div[@role="button"]';
                        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                        if (result.singleNodeValue) {
                            result.singleNodeValue.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            result.singleNodeValue.click();
                            return true;
                        }
                    } catch(e) {}
                    // Strategy 2: Partial span text match, walk up to role=button
                    try {
                        const spans = document.querySelectorAll('span');
                        for (const span of spans) {
                            if (span.textContent.trim().toLowerCase().includes(searchText.toLowerCase())) {
                                let el = span;
                                while (el && el !== document.body) {
                                    if (el.getAttribute('role') === 'button') {
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                        el.click();
                                        return true;
                                    }
                                    el = el.parentElement;
                                }
                            }
                        }
                    } catch(e) {}
                    // Strategy 3: Button textContent match
                    try {
                        const buttons = document.querySelectorAll('div[role="button"]');
                        for (const button of buttons) {
                            if (button.textContent.toLowerCase().includes(searchText.toLowerCase())) {
                                button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                button.click();
                                return true;
                            }
                        }
                    } catch(e) {}
                    return false;
                })()
            `)
        } catch (e) { /* evaluate failed */ }

        // Strategy B: ISHBrowser API fallback using $$() + innerText()
        if (!groupSelected) {
            try {
                const spans = await page.$$('span')
                for (const span of spans) {
                    try {
                        const text = await span.innerText()
                        if ((text || '').trim().toLowerCase().includes(cleanName.toLowerCase()) && (text || '').length < cleanName.length * 3) {
                            await span.scrollIntoView()
                            await page.waitForTimeout(300)
                            await span.click()
                            groupSelected = true
                            await span.dispose()
                            break
                        }
                        await span.dispose()
                    } catch (e) { continue }
                }
            } catch (e) { /* fallback failed */ }
        }

        if (!groupSelected) {
            console.log(`[ShareToGroup] Group "${cleanName}" not found in search results`)
            return false
        }
        await page.waitForTimeout(2000)

        // STEP 6: Fill caption AFTER group is selected (correct order from facebook-share-poster.js)
        if (caption && caption.trim()) {
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
                await page.waitForTimeout(500)


                // Type caption with line breaks support
                const lines = caption.split('\n')
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].length > 0) {
                        await page.keyboard.type(lines[i], 30)
                    }
                    if (i < lines.length - 1) {
                        await page.keyboard.shortcut(['Shift', 'Enter'])
                        await page.waitForTimeout(100)
                    }
                }
                await page.waitForTimeout(1000)
                console.log('[ShareToGroup] Caption typed successfully')
            } else {
                console.log('[ShareToGroup] Caption textbox not found, continuing without caption')
            }
        }

        // STEP 7: Click Post button
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
        console.log(`[ShareToGroup] Share completed for: "${cleanName}"`)
        return true

    } catch (err) {
        console.log(`[ShareToGroup] Error: ${err.message}`)
        return false
    }
}
