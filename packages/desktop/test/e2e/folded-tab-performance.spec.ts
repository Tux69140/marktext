import { expect, test } from '@playwright/test'
import type { Page } from 'playwright'
import { launchWithMarkdown, sendIpcToRenderer } from './helpers'

const tabSelector = '.tabs-container > li'

const createLongFoldableDocument = (): string => {
  const lines = [
    '# Folded heavy chapter',
    '',
    'This chapter is intentionally long so restoring its folded state exercises the renderer.',
    ''
  ]

  for (let i = 0; i < 450; i += 1) {
    lines.push(
      `Paragraph ${i.toString().padStart(4, '0')} with enough text to produce a real block during rendering.`
    )
    lines.push('')
  }

  lines.push('# Final visible chapter', '', 'Tail paragraph.')
  return lines.join('\n')
}

const foldFirstHeading = async(page: Page): Promise<void> => {
  await page.evaluate(() => {
    const heading = document.querySelector('.editor-component h1')
    const toggle = heading?.querySelector('.ag-heading-fold-toggle') as HTMLElement | null
    if (!toggle) throw new Error('Heading fold toggle not found')

    const rect = toggle.getBoundingClientRect()
    toggle.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    )
  })

  await page.waitForFunction(
    () => !!document.querySelector('.editor-component h1.ag-heading-folded-block'),
    null,
    { timeout: 5000 }
  )
}

test.describe('Folded tab performance', () => {
  test('switching back to a long folded WYSIWYG tab stays responsive', async() => {
    const { app, page } = await launchWithMarkdown(createLongFoldableDocument())

    try {
      await foldFirstHeading(page)

      await sendIpcToRenderer(app, 'mt::new-untitled-tab', true, '# Other tab\n\nSmall body.\n')
      await page.waitForFunction(
        () => document.querySelector('.editor-component h1')?.textContent?.includes('Other tab'),
        null,
        { timeout: 5000 }
      )

      const startedAt = await page.evaluate(() => performance.now())
      await page.locator(tabSelector).first().click()
      await page.waitForFunction(
        () =>
          document.querySelector('.editor-component h1')?.textContent?.includes('Folded heavy chapter') &&
          !!document.querySelector('.editor-component h1.ag-heading-folded-block'),
        null,
        { timeout: 5000 }
      )
      const elapsed = await page.evaluate((start) => performance.now() - start, startedAt)

      expect(elapsed).toBeLessThan(1200)
    } finally {
      await app.close()
    }
  })
})
