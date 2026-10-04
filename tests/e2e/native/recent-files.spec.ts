import { strict as assert } from 'node:assert'
import { join } from 'node:path'

import { invokeNative } from '#tests/helpers/tauri/invoke'

const fixture = join(process.cwd(), 'tests', 'fixtures', 'gold-preview.fig')

describe('recent file thumbnails', () => {
  it('reads a .fig file the way the thumbnail loader does', async () => {
    const info = await invokeNative<{ size: number }>('plugin:fs|stat', { path: fixture })
    assert.ok(info.size > 0, 'stat returned no size')

    const rid = await invokeNative<number>('plugin:fs|open', {
      path: fixture,
      options: { read: true }
    })
    try {
      const handle = await invokeNative<{ size: number }>('plugin:fs|fstat', { rid })
      assert.equal(handle.size, info.size)
      await invokeNative('plugin:fs|seek', { rid, offset: 0, whence: 0 })
      await invokeNative('plugin:fs|read', { rid, len: 4 })
    } finally {
      await invokeNative('plugin:resources|close', { rid })
    }
  })
})
