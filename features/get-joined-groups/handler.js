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
      // Extract group links using robust 4-strategy name extraction (from facebook-groups-poster.js)
      const rawGroups = await page.evaluate(`
        (() => {
          const results = [];
          const groupsObj = {};

          // Strategy: Use "Preview of a group" section with listitem structure (robust approach)
          const groupPreviewSection = document.querySelector('[aria-label="Preview of a group"]');

          if (groupPreviewSection) {
            // Find all group items in the preview section
            const groupItems = groupPreviewSection.querySelectorAll('[role="listitem"]');

            groupItems.forEach((item, index) => {
              const groupLinks = item.querySelectorAll('a[href*="/groups/"]');

              groupLinks.forEach(a => {
                const link = (a.href || '').split('?')[0];
                const match = link.match(/\\/groups\\/(\\d+)/);
                if (!match) return;
                const groupId = match[1];
                if (groupsObj[groupId]) return; // already processed

                let groupName = '';

                // STRATEGY 1: Collect leaf text nodes recursively, pick the longest
                const allTexts = [];
                const collectTexts = (element) => {
                  // Skip noise elements
                  const t = element.textContent || '';
                  if (t.includes('last visited') || t.includes('View group') || t.includes('ago') ||
                      t.match(/\\d+\\s*(minute|hour|day)s?\\s*ago/i)) return;

                  if (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3) {
                    const text = element.textContent.trim();
                    if (text && text.length > 2 && !text.includes('View group')) {
                      allTexts.push(text);
                    }
                  }
                  element.childNodes.forEach(child => {
                    if (child.nodeType === 1) collectTexts(child);
                  });
                };
                collectTexts(a);
                if (allTexts.length > 0) {
                  groupName = allTexts.reduce((longest, cur) => cur.length > longest.length ? cur : longest, '');
                }

                // STRATEGY 2: Scan span/div elements with noise filtering
                if (!groupName) {
                  const possibleEls = a.querySelectorAll('span, div, h1, h2, h3, h4, h5, h6');
                  for (const el of possibleEls) {
                    const text = el.textContent.trim();
                    if (text.length >= 3 &&
                        !text.includes('View group') && !text.includes('last visited') &&
                        !text.match(/^\\d+\\s*(minute|hour|day)s?\\s*ago$/i) &&
                        !text.match(/^\\d+[mhd]$/i) && !text.match(/^\\d+$/)) {
                      groupName = text;
                      break;
                    }
                  }
                }

                // STRATEGY 3: SVG aria-label fallback
                if (!groupName) {
                  const svg = a.querySelector('svg[aria-label]');
                  if (svg) groupName = svg.getAttribute('aria-label').trim();
                }

                // STRATEGY 4: Parent listitem container fallback
                if (!groupName) {
                  const parentContainer = a.closest('div[role="listitem"]');
                  if (parentContainer) {
                    const lines = parentContainer.textContent.split('\\n').map(l => l.trim()).filter(l => l);
                    for (const line of lines) {
                      if (line.length >= 3 && !line.includes('View group') &&
                          !line.includes('last visited') &&
                          !line.match(/^\\d+\\s*(minute|hour|day)s?\\s*ago$/i) &&
                          !line.match(/^You\\s/) && line !== 'Sort') {
                        groupName = line;
                        break;
                      }
                    }
                  }
                }

                // CLEANING: Remove noise text patterns from group name
                if (groupName) {
                  groupName = groupName
                    .replace(/You last visited.*/i, '')
                    .replace(/View group/gi, '')
                    .replace(/^\\s*Welcome to\\s*/i, '')
                    .replace(/\\s*Mark as read\\s*$/i, '')
                    .replace(/\\s*\\d+\\s*(minute|hour|day)s?\\s*ago/gi, '')
                    .replace(/\\s*mentioned you.*/i, '')
                    .replace(/^\\s*Unread\\s*/i, '')
                    .replace(/^[^\\w&]+|[^\\w&]+$/g, '')
                    .replace(/\\s+/g, ' ')
                    .trim();

                  // Remove trailing time shorthand (e.g. "Group Name 3h")
                  if (groupName.match(/\\d+\\s*(m|h|d)$/)) {
                    groupName = groupName.replace(/\\s*\\d+\\s*(m|h|d)$/, '').trim();
                  }
                }

                // VALIDATION: Only accept clean names
                if (groupName && groupName.length >= 3 &&
                    !groupName.match(/^\\d+$/) &&
                    !groupName.includes('View group') &&
                    !groupName.includes('last visited') &&
                    !groupName.match(/^\\d+\\s*(minute|hour|day)/i)) {
                  groupsObj[groupId] = groupName;
                  results.push({ name: groupName, groupId: groupId });
                }
              });
            });
          }

          // FALLBACK: If "Preview of a group" section not found, use simple link scanning
          if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/groups/"][role="link"]');
            links.forEach(a => {
              const href = a.href || '';
              const match = href.match(/\\/groups\\/([\\w.-]+)\\/?/);
              if (match && match[1] !== 'joins' && match[1] !== 'feed' && match[1] !== 'discover') {
                const groupId = match[1];
                if (groupsObj[groupId]) return;

                // Try to get clean text
                let name = '';
                const spans = a.querySelectorAll('span');
                for (const span of spans) {
                  const t = span.textContent.trim();
                  if (t.length >= 3 && !t.includes('View group') && !t.includes('last visited') &&
                      !t.match(/^\\d+\\s*(minute|hour|day)/i) && !t.match(/^\\d+$/)) {
                    if (t.length > name.length) name = t;
                  }
                }
                if (!name) name = a.textContent.trim().split('\\n')[0].trim();

                // Clean
                name = name
                  .replace(/You last visited.*/i, '')
                  .replace(/View group/gi, '')
                  .replace(/\\s*\\d+\\s*(minute|hour|day)s?\\s*ago/gi, '')
                  .replace(/^[^\\w&]+|[^\\w&]+$/g, '')
                  .replace(/\\s+/g, ' ')
                  .trim();

                if (name && name.length >= 3 && name.length < 200 && !name.match(/^\\d+$/)) {
                  groupsObj[groupId] = name;
                  results.push({ name, groupId });
                }
              }
            });
          }

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
    if (scraping[slot]) {
      scraping[slot].running = false
    }
    if (!e.sender.isDestroyed()) {
      e.sender.send('groups-done', slot)
    }
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
