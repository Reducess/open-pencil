import { expect, test, useEditorSetup } from '#tests/e2e/fixtures'

const editor = useEditorSetup()

function commandPaletteShortcut() {
  return process.platform === 'darwin' ? 'Meta+KeyK' : 'Control+KeyK'
}

test('command palette opens, searches, and closes', async () => {
  await editor.page.keyboard.press(commandPaletteShortcut())

  const palette = editor.page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()

  const search = palette.getByRole('searchbox', { name: 'Search commands' })
  await expect(search).toBeFocused()
  await search.fill('zoom')
  await expect(palette.getByRole('option', { name: /Zoom to fit/ })).toBeVisible()
  await expect(palette.getByRole('option', { name: 'New' })).not.toBeVisible()

  await editor.page.keyboard.press('Escape')
  await expect(palette).not.toBeVisible()
})

test('command palette exposes contextual export labels', async () => {
  await editor.page.keyboard.press(commandPaletteShortcut())

  const palette = editor.page.getByRole('dialog', { name: 'Command palette' })
  await palette.getByRole('searchbox', { name: 'Search commands' }).fill('export')
  await expect(palette.getByText('Export selection as PNG')).toBeVisible()
  await expect(palette.getByText('Export selection as SVG')).toBeVisible()

  await editor.page.keyboard.press('Escape')
})

function addPages(names: string[]) {
  return editor.page.evaluate((pageNames) => {
    const store = window.openPencil?.getStore?.()
    if (!store) throw new Error('OpenPencil store not initialized')
    for (const name of pageNames) store.graph.addPage(name)
    store.requestRender()
  }, names)
}

function currentPageName() {
  return editor.page.evaluate(() => {
    const store = window.openPencil?.getStore?.()
    return store?.graph.getNode(store.state.currentPageId)?.name
  })
}

async function visitPage(name: string) {
  await editor.page.getByTestId('pages-row').filter({ hasText: name }).click()
  await expect.poll(currentPageName).toBe(name)
}

function openPalette() {
  return editor.page.keyboard
    .press(commandPaletteShortcut())
    .then(() => editor.page.getByRole('dialog', { name: 'Command palette' }))
}

test('command palette lists recent pages and finds other pages by name', async () => {
  await addPages(['Alpha', 'Beta', 'Gamma'])
  await visitPage('Alpha')
  await visitPage('Beta')

  const palette = await openPalette()
  await expect(palette.getByRole('option', { name: 'Alpha Recent' })).toBeVisible()
  await expect(palette.getByRole('option', { name: 'Page 1 Recent' })).toBeVisible()
  await expect(palette.getByRole('option', { name: /^Beta/ })).toHaveCount(0)
  await expect(palette.getByRole('option', { name: /^Gamma/ })).toHaveCount(0)

  await palette.getByRole('searchbox', { name: 'Search commands' }).fill('gamma')
  await palette.getByRole('option', { name: 'Gamma' }).click()
  await expect(palette).not.toBeVisible()
  await expect.poll(currentPageName).toBe('Gamma')
})

test('command palette goes to any page in a page step', async () => {
  await addPages(['Delta', 'Epsilon'])
  const current = await currentPageName()

  const palette = await openPalette()
  await palette.getByRole('option', { name: 'Go to page…' }).click()
  await expect(palette.getByRole('option', { name: `${current} Current page` })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await palette.getByRole('button', { name: 'Back' }).click()
  await expect(palette.getByRole('option', { name: 'Go to page…' })).toBeVisible()

  await palette.getByRole('option', { name: 'Go to page…' }).click()
  await palette.getByRole('option', { name: 'Epsilon' }).click()
  await expect(palette).not.toBeVisible()
  await expect.poll(currentPageName).toBe('Epsilon')
})
