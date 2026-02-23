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

  ipcMain.handle('start-auto-comment', async (e, slot, config) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }

    const { urls, commentText, imagePath, delayMin, delayMax, restAfter, restSeconds } = config
    if (!urls || urls.length === 0) return { ok: false, error: 'No target URLs' }
    if (!commentText) return { ok: false, error: 'No comment text' }

    state[slot] = { running: true }
    let successCount = 0
    let failCount = 0

    for (let i = 0; i < urls.length; i++) {
      if (!state[slot] || !state[slot].running) break

      const url = urls[i]
      e.sender.send('comment-progress', slot, { index: i, status: 'processing', total: urls.length })

      try {
        // Navigate to post
        await page.goto(url)
        await page.waitForTimeout(5000)

        // Apply spintax
        const finalText = spinText(commentText)

        // Comment on the post
        const success = await commentOnPost(page, finalText, imagePath)

        if (success) {
          successCount++
          e.sender.send('comment-progress', slot, { index: i, status: 'success', total: urls.length, successCount, failCount })
        } else {
          failCount++
          e.sender.send('comment-progress', slot, { index: i, status: 'error', error: 'Comment box not found', total: urls.length, successCount, failCount })
        }
      } catch (err) {
        failCount++
        e.sender.send('comment-progress', slot, { index: i, status: 'error', error: err.message, total: urls.length, successCount, failCount })
      }

      // Delay between comments
      if (i < urls.length - 1 && state[slot] && state[slot].running) {
        const delay = (delayMin + Math.random() * (delayMax - delayMin)) * 1000
        e.sender.send('comment-progress', slot, { index: i, status: 'waiting', delay: Math.round(delay / 1000), total: urls.length, successCount, failCount })
        await page.waitForTimeout(delay)

        // Rest time
        if (restAfter > 0 && successCount > 0 && successCount % restAfter === 0) {
          e.sender.send('comment-progress', slot, { index: i, status: 'resting', restSeconds, total: urls.length, successCount, failCount })
          await page.waitForTimeout(restSeconds * 1000)
        }
      }
    }

    state[slot] = null
    e.sender.send('comment-done', slot, { successCount, failCount, total: urls.length })
    return { ok: true, successCount, failCount }
  })

  ipcMain.handle('stop-auto-comment', (e, slot) => {
    if (state[slot]) state[slot].running = false
    return { ok: true }
  })

  ipcMain.handle('import-comment-urls', async (e) => {
    const result = await dialog.showOpenDialog({
      title: 'Import Post URLs',
      filters: [{ name: 'Text Files', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (result.canceled) return { ok: false }
    const content = fs.readFileSync(result.filePaths[0], 'utf8')
    const urls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'))
    return { ok: true, urls }
  })

  ipcMain.handle('export-comment-urls', async (e, urls) => {
    const result = await dialog.showSaveDialog({
      title: 'Export Post URLs',
      defaultPath: 'comment_targets.txt',
      filters: [{ name: 'Text Files', extensions: ['txt'] }]
    })
    if (result.canceled) return { ok: false }
    fs.writeFileSync(result.filePath, urls.join('\n'), 'utf8')
    return { ok: true }
  })

  ipcMain.handle('pick-comment-image', async (e) => {
    const result = await dialog.showOpenDialog({
      title: 'Select Image',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      properties: ['openFile']
    })
    if (result.canceled) return { ok: false }
    return { ok: true, path: result.filePaths[0] }
  })
}

// Comment logic using electron-automation-core API only
async function commentOnPost(page, commentText, imagePath) {
  await page.waitForTimeout(2000)

  // STEP 1: Click Comment button
  try { await page.click('[aria-label="Comment"]') }
  catch (e) { try { await page.click('div[role="textbox"][contenteditable="true"]') } catch (e2) { return false } }
  await page.waitForTimeout(1500)

  // STEP 2: Focus comment textbox
  const boxSel = 'div[role="textbox"][contenteditable="true"]'
  try { await page.waitForSelector(boxSel, 5000) } catch (e) { return false }
  await page.focus(boxSel)
  await page.waitForTimeout(300)

  // STEP 3: Clear and type
  await page.keyboard.shortcut(['Control', 'a'])
  await page.keyboard.press('Backspace')
  await page.keyboard.type(commentText, 50)
  await page.waitForTimeout(500)

  // STEP 4: Upload image if provided
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      // await page.click('[aria-label*="photo"]')
      // await page.waitForTimeout(1000)
      await page.interceptFileChooser(imagePath, { persistent: true })
await page.click('[aria-label*="Attach a photo"]')
      await page.stopInterceptFileChooser()  // stop when done
      await page.waitForTimeout(3000)
    } catch (e) { /* optional */ }
  }

  // STEP 5: Submit
  try { await page.click('#focused-state-composer-submit [role="button"]') }
  catch (e) {
    try { await page.click('[aria-label="Comment"]') }
    catch (e2) {
      await page.focus(boxSel)
      await page.keyboard.press('Enter')
    }
  }

  await page.waitForTimeout(3000)
  return true
}

