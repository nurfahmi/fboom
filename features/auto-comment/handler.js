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

// Comment logic using electron-automation-core API
// Adapted from facebook-comment-poster.js with robust file upload and multiline support
async function commentOnPost(page, commentText, imagePath) {
  await page.waitForTimeout(2000)

  // ============================================================
  // STEP 1: CLICK COMMENT BUTTON TO OPEN COMMENT BOX
  // ============================================================
  const commentButtonSelectors = [
    '[aria-label="Comment"]',
    '[role="button"][aria-label="Comment"]',
    '[aria-label="Komentar"]',
    '[role="button"][aria-label="Komentar"]',
    '[aria-label="Tulis komentar"]',
    'div[role="textbox"][data-lexical-editor="true"]',
    'div[role="textbox"][aria-label*="Comment" i]',
    'div[role="textbox"][aria-label*="comment" i]',
    'div[role="textbox"][contenteditable="true"]',
  ]

  let commentButtonClicked = false
  for (const selector of commentButtonSelectors) {
    try {
      await page.waitForSelector(selector, 3000)
      await page.click(selector)
      commentButtonClicked = true
      await page.waitForTimeout(1500)
      break
    } catch (e) { continue }
  }

  if (!commentButtonClicked) {
    console.log('[AutoComment] Comment button not found')
    return false
  }

  // ============================================================
  // STEP 2: FIND AND FOCUS COMMENT BOX
  // ============================================================
  await page.waitForTimeout(2000)

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
  for (const sel of commentBoxSelectors) {
    try {
      await page.waitForSelector(sel, 3000)
      await page.click(sel)
      activeBoxSelector = sel
      boxFound = true
      break
    } catch (e) { continue }
  }

  if (!boxFound) {
    // Fallback: scroll down and retry
    try {
      await page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
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
    console.log('[AutoComment] Comment box not found')
    return false
  }

  // ============================================================
  // STEP 3: CLEAR AND TYPE COMMENT WITH MULTI-LINE SUPPORT
  // ============================================================
  await page.waitForTimeout(500)
  await page.focus(activeBoxSelector)
  await page.waitForTimeout(300)
  await page.keyboard.shortcut(['Control', 'a'])
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)

  // Multi-line: split by \n and use Shift+Enter for new lines
  const lines = commentText.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      // Type in small chunks for reliability
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

  // ============================================================
  // STEP 4: UPLOAD IMAGE/FILE IF PROVIDED
  // Same logic as facebook-comment-poster.js:
  //   const fileInputs = await page.locator('input[type="file"]').all();
  //   const fileInput = fileInputs.length > 1 ? fileInputs[1] : fileInputs[0];
  //   await fileInput.setInputFiles(filePath);
  // ============================================================
  if (imagePath && fs.existsSync(imagePath)) {
    console.log(`[AutoComment] Uploading file: ${path.basename(imagePath)}`)
    try {
      // Count file inputs on page
      const fileInputCount = await page.evaluate(`document.querySelectorAll('input[type="file"]').length`)

      if (fileInputCount > 0) {
        // Use second input if available (for attachments), otherwise first — same as old script
        const targetIndex = fileInputCount > 1 ? 1 : 0
        await page.uploadByIndex('input[type="file"]', targetIndex, imagePath)
        console.log(`[AutoComment] File uploaded to input[${targetIndex}] of ${fileInputCount}`)
        await page.waitForTimeout(3000)
      } else {
        console.log('[AutoComment] No file input found for attachments')
      }
    } catch (e) {
      console.log('[AutoComment] File upload failed:', e.message)
    }
  }

  // ============================================================
  // STEP 5: SUBMIT COMMENT
  // ============================================================
  await page.waitForTimeout(500)

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
      await page.focus(activeBoxSelector)
      await page.keyboard.press('Enter')
      submitted = true
    } catch (e) { /* ignore */ }
  }

  await page.waitForTimeout(3000)
  return true
}

