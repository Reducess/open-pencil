import { createHash } from 'node:crypto'

import { SkiaRenderer } from '@open-pencil/core/canvas'
import { initCanvasKit, renderNodesToImage } from '@open-pencil/core/io/formats/raster'
import { documentFontStatus } from '@open-pencil/core/text'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function withRenderer<T>(
  run: (renderer: SkiaRenderer, ck: Awaited<ReturnType<typeof initCanvasKit>>) => Promise<T> | T
): Promise<T> {
  const ck = await initCanvasKit()
  const surface = ck.MakeSurface(1, 1)
  if (!surface) throw new Error('Failed to create a CanvasKit surface')
  const renderer = new SkiaRenderer(ck, surface)
  try {
    renderer.viewportWidth = 1
    renderer.viewportHeight = 1
    renderer.dpr = 1
    await renderer.loadFonts()
    return await run(renderer, ck)
  } finally {
    renderer.destroy()
  }
}

/**
 * Renders with a renderer of its own. `headlessRenderNodes` keeps one renderer for the whole
 * process, and its image and path caches are keyed by image hash and node id — a second graph
 * with the same ids would be painted from the first graph's caches and compare equal for free.
 */
export async function renderPNG(
  graph: SceneGraph,
  pageId: string,
  nodeIds: string[],
  scale = 1
): Promise<Uint8Array> {
  return withRenderer(async (renderer, ck) => {
    const restore = await renderer.prepareForExport(graph, pageId, nodeIds)
    try {
      const status = documentFontStatus(graph, nodeIds)
      if (!status.faithful) {
        const faces = status.issues.map((issue) => `${issue.family} ${issue.style}`)
        throw new Error(`Fonts missing for the render: ${faces.join(', ')}`)
      }
      const png = renderNodesToImage(ck, renderer, graph, pageId, nodeIds, { scale, format: 'PNG' })
      if (!png) throw new Error('Render returned no image')
      return png
    } finally {
      restore()
    }
  })
}

/** The Skia paragraph snapshot the editor caches on a text node (`SceneNode.textPicture`). */
export async function buildTextPicture(node: SceneNode): Promise<Uint8Array | null> {
  return withRenderer((renderer) => renderer.buildTextPicture(node))
}
