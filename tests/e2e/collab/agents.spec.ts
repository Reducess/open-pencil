import { expect, test } from '@playwright/test'

import { startAgent } from '#tests/helpers/collab/agent'
import {
  collaborationErrors,
  connect,
  createPeer,
  startRelay,
  type Peer
} from '#tests/helpers/collab/room'

function pageNames(peer: Peer) {
  return peer.page.evaluate(
    () =>
      window.openPencil
        ?.getStore?.()
        .graph.getPages()
        .map((page) => page.name) ?? []
  )
}

test("a guest's agent appears in the host's share panel and can be followed", async ({
  browser
}) => {
  const relay = await startRelay()
  let host: Peer | null = null
  let guest: Peer | null = null
  try {
    host = await createPeer(browser, 'Host', relay.url)
    guest = await createPeer(browser, 'Guest', relay.url)
    await connect(host)
    await connect(guest)
    await expect
      .poll(() => host?.page.evaluate(() => window.openPencil?.test?.collab?.peerCount()))
      .toBe(1)

    await host.page.evaluate(() => {
      const store = window.openPencil?.getStore?.()
      if (!store) throw new Error('OpenPencil store not initialized')
      store.graph.addPage('Checkout')
    })
    const peer = guest
    await expect.poll(() => pageNames(peer)).toContain('Checkout')
    const agent = await startAgent(guest.page, 'Checkout', 300, 200)

    await host.page.getByTestId('collab-share-button').click()
    const popover = host.page.getByTestId('collab-popover')
    await expect(popover.getByText(agent.name)).toBeVisible()
    await expect(popover.getByText('Editing · Checkout')).toBeVisible()

    await popover.getByRole('button', { name: `Follow ${agent.name}` }).click()
    await expect
      .poll(() => host?.page.evaluate(() => window.openPencil?.getStore?.().state.currentPageId))
      .toBe(agent.pageId)
    await expect(
      popover.getByRole('button', { name: `Stop following ${agent.name}` })
    ).toBeVisible()
    expect(collaborationErrors(host)).toEqual([])
  } finally {
    await host?.context.close()
    await guest?.context.close()
    await relay.close()
  }
})
