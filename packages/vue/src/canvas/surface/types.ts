import type { EditorState } from '@open-pencil/core/editor'

import type { PresentationColorSpace } from '#vue/canvas/surface/color-space'

/**
 * Options for {@link useCanvas}.
 */
export type CanvasRenderLayer = 'full' | 'scene' | 'overlays'

/**
 * Why a canvas could not start rendering.
 *
 * - `canvaskit`: the CanvasKit runtime failed to load; `cause` carries the rejection.
 * - `surface`: no WebGL surface could be created for the canvas.
 */
export interface CanvasSurfaceError {
  reason: 'canvaskit' | 'surface'
  cause?: unknown
}

export type CanvasSurfaceStatus = 'loading' | 'ready' | 'error'

export interface UseCanvasOptions {
  shouldSuspendRender?: () => boolean
  onPresented?: (versions: { renderVersion: number; sceneVersion: number }) => void
  /**
   * Selects which render layer this canvas owns.
   */
  layer?: CanvasRenderLayer
  /**
   * Enables the experimental tiled scene renderer for this surface.
   */
  sceneRenderer?: 'retained' | 'tiled'
  /**
   * Forces ruler visibility on or off for this canvas.
   *
   * When omitted, the composable falls back to viewport and URL-param logic.
   */
  showRulers?: boolean
  /**
   * Keeps the drawing buffer after presenting frames.
   *
   * Useful for screenshot or pixel-readback workflows, but may increase memory
   * usage depending on the browser and GPU backend.
   */
  preserveDrawingBuffer?: boolean
  /**
   * Called once the rendering surface is ready and the first frame is drawn. Not called when
   * the surface could not be created; see `onError`.
   */
  onReady?: () => void
  /**
   * Called when the canvas cannot start rendering.
   */
  onError?: (error: CanvasSurfaceError) => void
  /**
   * Reports the color space the canvas actually presents, including fallbacks, or null
   * when no surface could be configured.
   */
  onPresentation?: (colorSpace: PresentationColorSpace | null) => void
  /**
   * Supplies the view state rendered by this canvas. Defaults to `editor.state`.
   *
   * Multiple canvas surfaces can use independent view state while sharing one
   * document graph, history, and editor event bus.
   */
  getRenderState?: () => EditorState
  /**
   * Receives this canvas surface's CSS viewport size after creation and resize.
   */
  onViewportResize?: (width: number, height: number) => void
}
