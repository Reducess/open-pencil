import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { CanvasKit } from 'canvaskit-wasm'
import { ref } from 'vue'

import { initCanvasSurface } from '#vue/canvas/surface/kit-loader'
import type { CanvasSurfaceError } from '#vue/canvas/surface/types'

const originalRequestAnimationFrame = globalThis.requestAnimationFrame

beforeEach(() => {
  globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(0))
    return 1
  }) as typeof requestAnimationFrame
})

afterEach(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame
})

function harness(overrides: { surface?: boolean; canvasKit?: () => Promise<CanvasKit> } = {}) {
  const calls: string[] = []
  const errors: CanvasSurfaceError[] = []
  const lifecycle = { destroyed: false }
  const options = {
    canvasRef: ref({} as HTMLCanvasElement),
    lifecycle,
    setCanvasKit: () => calls.push('canvaskit'),
    createSurface: () => {
      calls.push('surface')
      return overrides.surface ?? true
    },
    loadFonts: () => {
      calls.push('fonts')
      return Promise.resolve()
    },
    renderNow: () => calls.push('render'),
    onReady: () => calls.push('ready'),
    onError: (error: CanvasSurfaceError) => {
      calls.push('error')
      errors.push(error)
    },
    loadCanvasKit: overrides.canvasKit ?? (() => Promise.resolve({} as CanvasKit))
  }
  return { calls, errors, lifecycle, options }
}

describe('canvas surface initialisation', () => {
  test('reports ready once the surface exists and the first frame is drawn', async () => {
    const { calls, errors, options } = harness()
    expect(await initCanvasSurface(options)).toBe('ready')
    expect(calls).toEqual(['canvaskit', 'surface', 'fonts', 'render', 'ready'])
    expect(errors).toEqual([])
  })

  test('reports an error instead of ready when no surface could be created', async () => {
    const { calls, errors, options } = harness({ surface: false })
    expect(await initCanvasSurface(options)).toBe('error')
    expect(calls).toEqual(['canvaskit', 'surface', 'error'])
    expect(errors).toEqual([{ reason: 'surface' }])
  })

  test('reports an error when CanvasKit fails to load', async () => {
    const cause = new Error('wasm missing')
    const { calls, errors, options } = harness({ canvasKit: () => Promise.reject(cause) })
    expect(await initCanvasSurface(options)).toBe('error')
    expect(calls).toEqual(['error'])
    expect(errors).toEqual([{ reason: 'canvaskit', cause }])
  })

  test('stays silent when the canvas is destroyed while loading', async () => {
    const { calls, lifecycle, options } = harness({
      canvasKit: () => {
        lifecycle.destroyed = true
        return Promise.resolve({} as CanvasKit)
      }
    })
    expect(await initCanvasSurface(options)).toBe('cancelled')
    expect(calls).toEqual(['canvaskit'])
  })

  test('a failure without an error handler does not report ready', async () => {
    const { calls, options } = harness({ surface: false })
    expect(await initCanvasSurface({ ...options, onError: undefined })).toBe('error')
    expect(calls).not.toContain('ready')
  })
})
