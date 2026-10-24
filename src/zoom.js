'use strict'

/** Electron zoom levels are log1.2 of the zoom factor. */
const ZOOM_STEP = 0.5
const ZOOM_MIN = -5
const ZOOM_MAX = 5

function clamp(level) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level))
}

/**
 * Install Ctrl-based zoom on one webContents.
 * Uses the captured webContents: a `before-input-event` event has no `sender`.
 * @param {Electron.WebContents} webContents - target page.
 * @param {{ read: () => number, save: (level: number) => void }} storage - level persistence.
 * @returns {() => number} getter for the current level.
 */
function installZoom(webContents, storage) {
  let level = clamp(Number(storage.read()) || 0)
  const apply = () => {
    try { webContents.setZoomLevel(level) } catch { /* window already gone */ }
  }

  webContents.on('did-finish-load', apply)
  webContents.on('before-input-event', (event, input) => {
    try {
      if (input.type !== 'keyDown' || input.control !== true || input.alt === true || input.meta === true) return
      let next
      if (input.key === '=' || input.key === '+' || input.key === 'Add') next = level + ZOOM_STEP
      else if (input.key === '-' || input.key === '_' || input.key === 'Subtract') next = level - ZOOM_STEP
      else if (input.key === '0') next = 0
      else return
      event.preventDefault()
      level = clamp(next)
      webContents.setZoomLevel(level)
      storage.save(level)
    } catch (error) {
      console.error('zoom shortcut failed:', error)
    }
  })

  apply()
  return () => level
}

module.exports = { installZoom, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX }
