import { expect, test } from '@playwright/test'

import { CanvasHelper } from '#tests/helpers/canvas'

test('undo and redo follow the active document rather than the first tab', async ({ page }) => {
  await page.goto('/?test')
  const canvas = new CanvasHelper(page)
  await canvas.waitForInit()
  await page.getByTestId('tabbar-new').click()
  await page.getByRole('button', { name: 'New design', exact: true }).click()
  await canvas.waitForInit()
  const tabs = page.getByTestId('tabbar-tab')
  const layers = page.getByRole('tree').getByRole('treeitem')

  await canvas.drawRect(100, 100, 80, 60)
  await expect(layers).toHaveCount(1)
  await page.keyboard.press('ControlOrMeta+KeyZ')
  await expect(layers).toHaveCount(0)

  await tabs.first().click()
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ')
  await expect(layers).toHaveCount(0)
  await tabs.last().click()
  await page.keyboard.press('ControlOrMeta+Shift+KeyZ')
  await expect(layers).toHaveCount(1)
  canvas.assertNoErrors()
})
