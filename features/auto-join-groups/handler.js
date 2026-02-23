const { ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')

module.exports = function (getPage) {
    const state = {} // per-slot state: { searching, joining }

    // ========================
    // START SEARCH GROUPS
    // ========================
    ipcMain.handle('start-search-groups', async (e, slot, config) => {
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { keyword, limit } = config
        if (!keyword) return { ok: false, error: 'No keyword' }

        state[slot] = state[slot] || {}
        state[slot].searching = true

        try {
            const encodedKeyword = encodeURIComponent(keyword)
            const searchUrl = `https://www.facebook.com/groups/search/groups_home?q=${encodedKeyword}`

            e.sender.send('join-groups-search-progress', slot, { status: 'navigating', message: `Searching for "${keyword}"...` })
            await page.goto(searchUrl)
            await page.waitForTimeout(5000)

            // Smart scroll to collect groups
            const maxGroups = limit || 20
            const maxScrollsWithoutNew = 5
            const maxTotalScrolls = 200
            const foundGroupIds = new Set()
            const allGroups = {}
            let scrollsWithoutNew = 0
            let totalScrolls = 0

            while (totalScrolls < maxTotalScrolls && state[slot] && state[slot].searching) {
                totalScrolls++

                // Scroll down
                await page.mouse.wheel(0, 5000)
                await page.waitForTimeout(2000)

                // Double scroll technique every 3rd scroll
                if (totalScrolls % 3 === 0) {
                    await page.mouse.wheel(0, -500)
                    await page.waitForTimeout(500)
                }

                // Extract groups from page (uses evaluate for DOM extraction — necessary)
                const groupsData = await extractGroupsFromPage(page)

                let newGroupsCount = 0
                for (const [id, groupData] of Object.entries(groupsData)) {
                    if (!foundGroupIds.has(id)) {
                        foundGroupIds.add(id)
                        allGroups[id] = groupData
                        newGroupsCount++
                    }
                }

                const totalFound = foundGroupIds.size
                const percentage = Math.min(100, Math.round((totalFound / maxGroups) * 100))

                e.sender.send('join-groups-search-progress', slot, {
                    status: 'scrolling',
                    message: `Scroll #${totalScrolls}: Found ${totalFound}/${maxGroups} groups (${percentage}%)`,
                    totalFound, target: maxGroups, percentage
                })

                if (totalFound >= maxGroups) {
                    e.sender.send('join-groups-search-progress', slot, {
                        status: 'target_reached',
                        message: `✅ Target reached! Found ${totalFound} groups.`,
                        totalFound, target: maxGroups
                    })
                    break
                }

                if (newGroupsCount > 0) {
                    scrollsWithoutNew = 0
                } else {
                    scrollsWithoutNew++
                    if (scrollsWithoutNew >= maxScrollsWithoutNew) {
                        e.sender.send('join-groups-search-progress', slot, {
                            status: 'no_more',
                            message: `No more groups found after ${maxScrollsWithoutNew} scrolls. Total: ${totalFound}`,
                            totalFound, target: maxGroups
                        })
                        break
                    }

                    // Try clicking "See More" after 3 scrolls with no new
                    if (scrollsWithoutNew === 3) {
                        try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'See more')]") }
                        catch (e) {
                            try { await page.clickByXpath("//div[@role='button']//span[contains(text(),'Lihat selengkapnya')]") }
                            catch (e2) { /* no see more button */ }
                        }
                        await page.waitForTimeout(1500)
                    }
                }

                if (totalScrolls >= 30 && totalFound === 0) {
                    e.sender.send('join-groups-search-progress', slot, {
                        status: 'error',
                        message: 'No groups found after 30 scrolls. Check keyword or login.',
                        totalFound: 0, target: maxGroups
                    })
                    break
                }
            }

            // Final extraction
            const finalGroups = await collectPublicGroups(page, maxGroups)
            const mergedGroups = {}
            for (const g of Object.values(allGroups)) mergedGroups[g.id] = g
            for (const g of finalGroups) mergedGroups[g.id] = g

            const resultGroups = Object.values(mergedGroups).slice(0, maxGroups)

            state[slot].searching = false
            e.sender.send('join-groups-search-done', slot, { groups: resultGroups, total: resultGroups.length })
            return { ok: true, groups: resultGroups }

        } catch (err) {
            state[slot].searching = false
            e.sender.send('join-groups-search-progress', slot, { status: 'error', message: err.message })
            return { ok: false, error: err.message }
        }
    })

    ipcMain.handle('stop-search-groups', (e, slot) => {
        if (state[slot]) state[slot].searching = false
        return { ok: true }
    })

    // ========================
    // START JOIN GROUPS
    // ========================
    ipcMain.handle('start-join-groups', async (e, slot, config) => {
        const page = getPage(slot)
        if (!page) return { ok: false, error: 'No browser open' }

        const { groups, delayMin, delayMax, restAfter, restSeconds } = config
        if (!groups || groups.length === 0) return { ok: false, error: 'No groups to join' }

        state[slot] = state[slot] || {}
        state[slot].joining = true

        let successCount = 0
        let failCount = 0

        for (let i = 0; i < groups.length; i++) {
            if (!state[slot] || !state[slot].joining) break

            const group = groups[i]
            e.sender.send('join-groups-progress', slot, { index: i, status: 'joining', total: groups.length, groupName: group.name, successCount, failCount })

            try {
                const groupUrl = group.url || `https://www.facebook.com/groups/${group.groupId || group.id}`
                await page.goto(groupUrl)
                await page.waitForTimeout(3000)

                const joinResult = await joinGroupFromPage(page)

                if (joinResult.success) {
                    successCount++
                    e.sender.send('join-groups-progress', slot, { index: i, status: 'joined', total: groups.length, groupName: group.name, successCount, failCount })
                } else {
                    failCount++
                    e.sender.send('join-groups-progress', slot, { index: i, status: 'failed', error: joinResult.error, total: groups.length, groupName: group.name, successCount, failCount })
                }
            } catch (err) {
                failCount++
                e.sender.send('join-groups-progress', slot, { index: i, status: 'error', error: err.message, total: groups.length, groupName: group.name, successCount, failCount })
            }

            // Delay between joins
            if (i < groups.length - 1 && state[slot] && state[slot].joining) {
                const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
                e.sender.send('join-groups-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: groups.length, successCount, failCount })
                await page.waitForTimeout(delay)

                if (restAfter > 0 && (i + 1) % restAfter === 0) {
                    e.sender.send('join-groups-progress', slot, { index: i, status: 'resting', restSeconds, total: groups.length, successCount, failCount })
                    await page.waitForTimeout(restSeconds * 1000)
                }
            }
        }

        state[slot].joining = false
        e.sender.send('join-groups-done', slot, { successCount, failCount, total: groups.length })
        return { ok: true, successCount, failCount }
    })

    ipcMain.handle('stop-join-groups', (e, slot) => {
        if (state[slot]) state[slot].joining = false
        return { ok: true }
    })

    ipcMain.handle('load-join-groups-txt', async (e) => {
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
                return { name: parts[0] || '', groupId: parts[1] || parts[0], id: parts[1] || parts[0], url: parts[2] || '' }
            })
        return { ok: true, groups }
    })

    ipcMain.handle('save-join-groups-txt', async (e, groups) => {
        const result = await dialog.showSaveDialog({
            title: 'Save Groups to TXT',
            defaultPath: 'join_target_groups.txt',
            filters: [{ name: 'Text Files', extensions: ['txt'] }]
        })
        if (result.canceled) return { ok: false }
        const lines = groups.map(g => `${g.name},${g.groupId || g.id},${g.url || ''}`).join('\n')
        fs.writeFileSync(result.filePath, lines, 'utf8')
        return { ok: true, path: result.filePath }
    })
}

// DOM extraction — evaluate() is appropriate here (bulk DOM scraping)
async function extractGroupsFromPage(page) {
    try {
        return await page.evaluate(`
      (function() {
        try {
          var groups = {};
          var allLinks = document.querySelectorAll('a[href*="/groups/"]');
          allLinks.forEach(function(link) {
            try {
              var href = link.getAttribute('href');
              if (!href) return;
              var cleanHref = href.split('?')[0].split('#')[0];
              var match = cleanHref.match(/\\/groups\\/([^/]+)/);
              if (!match) return;
              var groupId = match[1];
              if (groups[groupId]) return;
              var skipIds = ['discover', 'feed', 'joins', 'search', 'groups_home', 'your_groups'];
              if (skipIds.includes(groupId)) return;
              if (!/^\\d+$/.test(groupId) && groupId.length < 5) return;
              var groupName = '';
              if (link.textContent && link.textContent.trim().length > 2) {
                groupName = link.textContent.trim();
              } else {
                var possibleName = link.querySelector('span, div, strong');
                if (possibleName && possibleName.textContent) groupName = possibleName.textContent.trim();
              }
              if (!groupName || groupName.length < 3) return;
              var skipNames = ['Facebook', 'Groups', 'Join', 'Members', 'Discover', 'Your groups', 'Create', 'Settings'];
              if (skipNames.indexOf(groupName) !== -1) return;
              groupName = groupName.replace(/Public·/gi, '').replace(/Public group/gi, '')
                .replace(/Public/gi, '').replace(/Publik/gi, '')
                .replace(/Grup Publik/gi, '').replace(/Join group/gi, '')
                .replace(/Joined/gi, '').replace(/Members?/gi, '')
                .replace(/\\d+\\.?\\d*[KkMm]?\\s*(members?|Members)?/gi, '')
                .replace(/·/g, '').trim();
              if (groupName.length > 2) {
                var fullUrl = cleanHref.startsWith('http') ? cleanHref : 'https://www.facebook.com' + cleanHref;
                groups[groupId] = { id: groupId, groupId: groupId, name: groupName, url: fullUrl };
              }
            } catch(e) {}
          });
          return groups;
        } catch(e) { return {}; }
      })()
    `) || {}
    } catch (err) { return {} }
}

async function collectPublicGroups(page, maxGroups) {
    try {
        const groups = await page.evaluate(`
      (function() {
        try {
          var groupsObj = {};
          var maxCount = ${maxGroups};
          var publicSpans = [];
          document.querySelectorAll('span, div, a').forEach(function(el) {
            var text = el.textContent || '';
            if ((text.includes('Public') || text.includes('Publik')) && text.length < 50) {
              publicSpans.push(el);
            }
          });
          publicSpans.forEach(function(el) {
            var container = el;
            for (var i = 0; i < 20; i++) {
              if (!container) break;
              container.querySelectorAll('a[href*="/groups/"]').forEach(function(link) {
                var href = link.getAttribute('href');
                var name = link.textContent.trim();
                if (href && href.includes('/groups/') && name && name.length > 2 &&
                    name.indexOf('Join') === -1 && name.indexOf('Members') === -1) {
                  var cleanLink = href.split('?')[0].split('#')[0];
                  var slugMatch = cleanLink.match(/\\/groups\\/([^/]+)/);
                  if (slugMatch) {
                    var groupId = slugMatch[1];
                    if (!groupsObj[groupId]) {
                      var cleanName = name.replace(/Public·/gi, '').replace(/Public group/gi, '')
                        .replace(/Public/gi, '').replace(/Publik/gi, '')
                        .replace(/Grup Publik/gi, '').replace(/Join group/gi, '')
                        .replace(/Joined/gi, '').replace(/Members?/gi, '')
                        .replace(/\\d+\\.?\\d*[KkMm]?\\s*(members?|Members)?/gi, '')
                        .replace(/·/g, '').trim();
                      if (cleanName.length > 2) {
                        var fullUrl = cleanLink.startsWith('http') ? cleanLink : 'https://www.facebook.com' + cleanLink;
                        groupsObj[groupId] = { id: groupId, groupId: groupId, name: cleanName, url: fullUrl };
                      }
                    }
                  }
                }
              });
              container = container.parentElement;
              if (Object.keys(groupsObj).length >= maxCount) return;
            }
          });
          return Object.values(groupsObj);
        } catch(e) { return []; }
      })()
    `)
        return (groups || []).slice(0, maxGroups)
    } catch (err) { return [] }
}

// Join logic using ISHBrowser API
async function joinGroupFromPage(page) {
    try {
        await page.waitForTimeout(2000)

        // Try clicking Join button
        try { await page.click('div[aria-label="Join group"][role="button"]') }
        catch (e) {
            try { await page.click('div[aria-label="Gabung ke grup"][role="button"]') }
            catch (e2) {
                try { await page.click('div[aria-label="Gabung"][role="button"]') }
                catch (e3) {
                    try { await page.clickByXpath("//div[@role='button']//span[text()='Join group']") }
                    catch (e4) {
                        try { await page.clickByXpath("//div[@role='button']//span[text()='Gabung']") }
                        catch (e5) { return { success: false, error: 'Join button not found' } }
                    }
                }
            }
        }

        await page.waitForTimeout(3000)

        // Try to close any dialog that pops up
        try { await page.click('div[aria-label="Close"][role="button"]') }
        catch (e) {
            try { await page.click('div[aria-label="Tutup"][role="button"]') }
            catch (e2) { await page.keyboard.press('Escape') }
        }

        return { success: true }
    } catch (err) {
        return { success: false, error: err.message }
    }
}
