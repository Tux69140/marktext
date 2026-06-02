import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'

interface MockI18nUtils {
  loadTranslations: Mock
}

// Window.i18nUtils is required in the runtime contextBridge typing, but in
// this unit test we install a mock with `vi.fn` and remove it between specs.
const win = window as unknown as { i18nUtils?: MockI18nUtils }
const getI18nUtils = (): MockI18nUtils => {
  if (!win.i18nUtils) {
    throw new Error('Expected i18nUtils mock to be installed')
  }
  return win.i18nUtils
}

describe('renderer i18n language loading', () => {
  beforeEach(() => {
    vi.resetModules()
    win.i18nUtils = {
      loadTranslations: vi.fn((locale: string) => ({
        locale,
        menu: {
          file: {
            file: 'File'
          }
        }
      }))
    }
  })

  afterEach(() => {
    delete win.i18nUtils
  })

  it('does not reload the default English locale', async() => {
    const { setLanguage, getCurrentLanguage } = await import('../../../src/renderer/src/i18n')

    setLanguage('en')

    expect(getI18nUtils().loadTranslations).not.toHaveBeenCalled()
    expect(getCurrentLanguage()).to.equal('en')
  })

  it('loads an unavailable locale only once', async() => {
    const { setLanguage } = await import('../../../src/renderer/src/i18n')

    setLanguage('zh-CN')
    setLanguage('zh-CN')

    expect(getI18nUtils().loadTranslations).toHaveBeenCalledTimes(1)
    expect(getI18nUtils().loadTranslations).toHaveBeenCalledWith('zh-CN')
  })
})
