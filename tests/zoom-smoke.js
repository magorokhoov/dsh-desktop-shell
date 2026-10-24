'use strict'

/** Headless smoke test: synthesizes Ctrl shortcuts and asserts the zoom level. */
const { app, BrowserWindow } = require('electron')
const { installZoom } = require('../src/zoom')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 400, height: 300 })
  await win.loadURL('data:text/html,<h1>zoom smoke test</h1>')
  let saved = null
  const current = installZoom(win.webContents, { read: () => 0, save: (level) => { saved = level } })

  win.webContents.on('before-input-event', (_event, input) => {
    console.log('input', JSON.stringify({ type: input.type, key: input.key, control: input.control, alt: input.alt, meta: input.meta }))
  })

  const press = async (keyCode) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['control'] })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers: ['control'] })
    await wait(250)
  }

  const levels = { start: win.webContents.getZoomLevel() }
  await press('=')
  levels.zoomIn = win.webContents.getZoomLevel()
  await press('-')
  levels.zoomOut = win.webContents.getZoomLevel()
  await press('=')
  await press('=')
  levels.zoomInTwice = win.webContents.getZoomLevel()
  await press('0')
  levels.reset = win.webContents.getZoomLevel()

  const ok = levels.zoomIn > levels.start
    && levels.zoomOut === levels.start
    && levels.zoomInTwice > levels.zoomIn
    && levels.reset === 0
    && saved === 0
  console.log('result', JSON.stringify({ ...levels, saved, ok }, null, 2))
  app.exit(ok ? 0 : 1)
})
