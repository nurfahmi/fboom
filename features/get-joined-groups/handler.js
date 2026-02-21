const { ipcMain, dialog } = require('electron')
const fs = require('fs')

module.exports = function (getPage) {
  const scraping = {} // per-slot state

  ipcMain.handle('start-get-groups', async (e, slot) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }

    scraping[slot] = { running: true, groups: new Map() }

    // Navigate to joined groups page
    await page.goto('https://www.facebook.com/groups/joins/?nav_source=tab&ordering=viewer_added')
    await page.waitForTimeout(4000) // wait for React render

    let noNewCount = 0

    while (scraping[slot] && scraping[slot].running) {
      // Extract group links from the page
      const rawGroups = await page.evaluate(`
        (() => {
          const results = [];
          const links = document.querySelectorAll('a[href*="/groups/"][role="link"]');
          links.forEach(a => {
            const href = a.href || '';
            const match = href.match(/\\/groups\\/([\\w.-]+)\\/?/);
            if (match && match[1] !== 'joins' && match[1] !== 'feed' && match[1] !== 'discover') {
              const name = a.textContent.trim();
              if (name && name.length > 0 && name.length < 200) {
                results.push({ name, groupId: match[1], href });
              }
            }
          });
          return results;
        })()
      `)

      // Deduplicate and add new groups
      let addedThisRound = 0
      for (const g of rawGroups) {
        if (!scraping[slot].groups.has(g.groupId)) {
          scraping[slot].groups.set(g.groupId, { name: g.name, groupId: g.groupId })
          addedThisRound++
        }
      }

      // Send current results to renderer
      const allGroups = Array.from(scraping[slot].groups.values())
      e.sender.send('groups-found', slot, allGroups)

      if (addedThisRound === 0) {
        noNewCount++
        if (noNewCount >= 5) {
          scraping[slot].running = false
          e.sender.send('groups-done', slot)
          break
        }
      } else {
        noNewCount = 0
      }

      // Scroll — find the actual scrollable container
      await page.evaluate(`
        (() => {
          // Try to find scrollable parent of the groups list
          function findScrollable(el) {
            while (el && el !== document.body) {
              const style = getComputedStyle(el);
              const overflow = style.overflowY;
              if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
                return el;
              }
              el = el.parentElement;
            }
            return null;
          }

          const groupLink = document.querySelector('a[href*="/groups/"][role="link"]');
          const scrollable = groupLink ? findScrollable(groupLink) : null;

          if (scrollable) {
            scrollable.scrollTop = scrollable.scrollHeight;
          } else {
            // Fallback: scroll the whole page
            window.scrollTo(0, document.body.scrollHeight);
          }
        })()
      `)
      await page.waitForTimeout(3000)
    }

    const finalGroups = scraping[slot] ? Array.from(scraping[slot].groups.values()) : []
    return { ok: true, groups: finalGroups }
  })

  ipcMain.handle('stop-get-groups', (e, slot) => {
    if (scraping[slot]) scraping[slot].running = false
    return { ok: true }
  })

  ipcMain.handle('save-groups-txt', async (e, slot, groups) => {
    const result = await dialog.showSaveDialog({
      title: 'Save Groups',
      defaultPath: 'joined_groups.txt',
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (result.canceled) return { ok: false }

    const lines = groups.map(g => `${g.name},${g.groupId}`).join('\n')
    fs.writeFileSync(result.filePath, lines, 'utf8')
    return { ok: true, path: result.filePath }
  })

  ipcMain.handle('import-groups-txt', async (e, slot) => {
    const result = await dialog.showOpenDialog({
      title: 'Import Groups',
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
}
