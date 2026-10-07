import type { CanvasKit } from 'canvaskit-wasm'
import { onMounted, onScopeDispose } from 'vue'
import type { Ref } from 'vue'

import { getCanvasKit } from '@open-pencil/core/canvaskit'

import type { CanvasSurfaceError } from '#vue/canvas/surface/types'

type CanvasKitLoaderOptions = {
  canvasRef: Ref<HTMLCanvasElement | null>
  lifecycle: { destroyed: boolean }
  setCanvasKit: (ck: CanvasKit | null) => void
  /** Returns false when no rendering surface could be created for the canvas. */
  createSurface: (canvas: HTMLCanvasElement) => boolean
  loadFonts: () => Promise<unknown> | undefined
  renderNow: () => void
  onReady?: () => void
  onError?: (error: CanvasSurfaceError) => void
  /** Overrides the shared CanvasKit loader. */
  loadCanvasKit?: () => Promise<CanvasKit>
}

export type CanvasSurfaceInitResult = 'ready' | 'error' | 'cancelled'

export async function initCanvasSurface({
  canvasRef,
  lifecycle,
  setCanvasKit,
  createSurface,
  loadFonts,
  renderNow,
  onReady,
  onError,
  loadCanvasKit = getCanvasKit
}: CanvasKitLoaderOptions): Promise<CanvasSurfaceInitResult> {
  const isDestroyed = () => lifecycle.destroyed
  const canvas = canvasRef.value
  if (!canvas || isDestroyed()) return 'cancelled'

  let ck: CanvasKit
  try {
    ck = await loadCanvasKit()
  } catch (cause) {
    if (isDestroyed()) return 'cancelled'
    onError?.({ reason: 'canvaskit', cause })
    return 'error'
  }
  setCanvasKit(ck)
  if (isDestroyed()) return 'cancelled'

  await new Promise((resolve) => {
    requestAnimationFrame(resolve)
  })
  if (isDestroyed()) return 'cancelled'
  // Without a surface there is nothing to draw on: a ready signal would leave a blank canvas.
  if (!createSurface(canvas)) {
    onError?.({ reason: 'surface' })
    return 'error'
  }
  await loadFonts()
  if (isDestroyed()) return 'cancelled'
  renderNow()
  onReady?.()
  return 'ready'
}

export function useCanvasKitLoader(options: CanvasKitLoaderOptions) {
  onMounted(() => {
    void initCanvasSurface(options)
  })

  onScopeDispose(() => {
    options.lifecycle.destroyed = true
  })
}
