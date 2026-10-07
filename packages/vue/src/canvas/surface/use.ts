import type { CanvasKit } from 'canvaskit-wasm'
import { readonly, shallowRef } from 'vue'
import type { Ref } from 'vue'

import type { Editor } from '@open-pencil/core/editor'

import {
  createCanvasSurfaceManager,
  useCanvasSurfaceLifecycle
} from '#vue/canvas/surface/lifecycle'
import { createCanvasHitTests, createRulerVisibility } from '#vue/canvas/surface/overlays'
import type {
  CanvasSurfaceError,
  CanvasSurfaceStatus,
  UseCanvasOptions
} from '#vue/canvas/surface/types'

export type {
  CanvasSurfaceError,
  CanvasSurfaceStatus,
  UseCanvasOptions
} from '#vue/canvas/surface/types'

/**
 * Connects an OpenPencil editor to a real canvas element using CanvasKit.
 *
 * This composable owns renderer creation, surface recreation on resize,
 * render scheduling, and renderer-backed hit testing helpers used by higher-
 * level canvas interaction code.
 */
export function useCanvas(
  canvasRef: Ref<HTMLCanvasElement | null>,
  editor: Editor,
  options?: UseCanvasOptions
) {
  let ck: CanvasKit | null = null
  const lifecycle: { destroyed: boolean } = { destroyed: false }
  const isDestroyed = () => lifecycle.destroyed
  const shouldShowRulers = createRulerVisibility(options)
  const status = shallowRef<CanvasSurfaceStatus>('loading')
  const error = shallowRef<CanvasSurfaceError | null>(null)

  const surface = createCanvasSurfaceManager({
    editor,
    canvasRef,
    options,
    getCanvasKit: () => ck,
    isDestroyed,
    shouldShowRulers
  })

  useCanvasSurfaceLifecycle({
    canvasRef,
    surface,
    lifecycle,
    getCanvasKitValue: () => ck,
    setCanvasKit: (value) => {
      ck = value
    },
    onReady: () => {
      status.value = 'ready'
      options?.onReady?.()
    },
    onError: (failure) => {
      error.value = failure
      status.value = 'error'
      options?.onError?.(failure)
    }
  })

  const { hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle } = createCanvasHitTests(
    editor,
    surface.getRenderer
  )

  return {
    render: surface.markDirty,
    renderNow: surface.renderNow,
    /** `loading` until the first frame is drawn, then `ready`, or `error` if it never can be. */
    status: readonly(status),
    /** Why the canvas could not start rendering, once `status` is `error`. */
    error: readonly(error),
    hitTestSectionTitle,
    hitTestComponentLabel,
    hitTestFrameTitle
  }
}
