const { ipcMain } = require('electron')

module.exports = function (getPage) {
  ipcMain.handle('fill-form', async (e, slot, data) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }
    try {
      if (data.email) {
        await page.click('input[name="email"]')
        await page.type('input[name="email"]', data.email, 30)
      }
      if (data.password) {
        await page.click('input[name="pass"]')
        await page.type('input[name="pass"]', data.password, 30)
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('click-login', async (e, slot) => {
    const page = getPage(slot)
    if (!page) return { ok: false, error: 'No browser open' }
    try {
      await page.click('button[name="login"]')
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}
