import path from 'path'
import { BrowserWindow, ipcMain } from 'electron'
import type { BrowserWindowConstructorOptions } from 'electron'
import { electronLocalshortcut } from '@hfelix/electron-localshortcut'
import BaseWindow, { WindowLifecycle, WindowType } from './base'
import { centerWindowOptions } from './utils'
import { TITLE_BAR_HEIGHT, preferencesWinOptions, isLinux, isOsx } from '../config'
import log from 'electron-log'

class SettingWindow extends BaseWindow {
  /**
   * @param accessor The application accessor for application instances.
   */
  constructor(accessor: unknown) {
    super(accessor)
    this.type = WindowType.SETTINGS
  }

  /**
   * Creates a new setting window.
   *
   * @param category The settings category tab name.
   */
  createWindow(category: string | null = null): BrowserWindow {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accessor = this._accessor as any
    const { menu: appMenu, env, keybindings, preferences } = accessor
    const winOptions: BrowserWindowConstructorOptions = Object.assign({}, preferencesWinOptions)
    centerWindowOptions(
      winOptions as BrowserWindowConstructorOptions & {
        width: number
        height: number
        x?: number
        y?: number
      }
    )
    if (isLinux) {
      winOptions.icon = path.join(
        (global as unknown as { __static: string }).__static,
        'logo-96px.png'
      )
    }

    // WORKAROUND: Electron has issues with different DPI per monitor when
    // setting a fixed window size.
    winOptions.resizable = true

    // Enable native or custom/frameless window and titlebar
    const { titleBarStyle, theme } = preferences.getAll()
    if (!isOsx) {
      winOptions.titleBarStyle = 'default'
      if (titleBarStyle === 'native') {
        winOptions.frame = true
      }
    }

    winOptions.backgroundColor = this._getPreferredBackgroundColor(theme)
    const browserWindow = (this.browserWindow = new BrowserWindow(winOptions))

    browserWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
      log.error(`did-fail-load ${code} ${desc} @ ${url}`)
    })
    browserWindow.webContents.on('render-process-gone', (_event, details) => {
      log.error(`render-process-gone: ${details.reason} (${details.exitCode})`)
    })

    this.id = browserWindow.id

    // Create a menu for the current window
    appMenu.addSettingMenu(browserWindow)

    browserWindow.once('ready-to-show', () => {
      this.lifecycle = WindowLifecycle.READY
      this.emit('window-ready')
    })

    browserWindow.on('focus', () => {
      this.emit('window-focus')
      browserWindow.webContents.send('mt::window-active-status', { status: true })
    })

    // Lost focus
    browserWindow.on('blur', () => {
      this.emit('window-blur')
      browserWindow.webContents.send('mt::window-active-status', { status: false })
    })

    browserWindow.on('close', (event) => {
      this.emit('window-close')

      event.preventDefault()
      ipcMain.emit('window-close-by-id', browserWindow.id)
    })

    // The window is now destroyed.
    browserWindow.on('closed', () => {
      this.emit('window-closed')

      this.browserWindow = null
    })

    this.lifecycle = WindowLifecycle.LOADING
    browserWindow.loadURL(this._buildUrlString(this.id, env, preferences, category))
    browserWindow.setSheetOffset(TITLE_BAR_HEIGHT)

    const devToolsAccelerator = keybindings.getAccelerator('view.toggle-dev-tools')
    if (env.debug && devToolsAccelerator) {
      electronLocalshortcut.register(browserWindow, devToolsAccelerator, () => {
        browserWindow.webContents.toggleDevTools()
      })
    }
    return browserWindow
  }

  protected override _buildUrlString(
    windowId: number | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    env: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userPreference: any,
    category?: string | null
  ): string {
    const url = this._buildUrlWithSettings(windowId, env, userPreference)
    if (category) {
      // Overwrite type to add category name
      url.searchParams.set('type', `${WindowType.SETTINGS}/${category}`)
    }
    return url.toString()
  }
}

export default SettingWindow
