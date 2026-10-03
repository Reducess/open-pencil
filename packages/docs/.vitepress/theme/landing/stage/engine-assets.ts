/// <reference types="vite/client" />
import interBold from '@open-pencil/core/assets/Inter-Bold.ttf?url'
import interExtraBold from '@open-pencil/core/assets/Inter-ExtraBold.ttf?url'
import interMedium from '@open-pencil/core/assets/Inter-Medium.ttf?url'
import interRegular from '@open-pencil/core/assets/Inter-Regular.ttf?url'
import interSemiBold from '@open-pencil/core/assets/Inter-SemiBold.ttf?url'
import notoNaskhArabic from '@open-pencil/core/assets/NotoNaskhArabic-Regular.ttf?url'
import { getCanvasKit } from '@open-pencil/core/canvaskit'
import { fontManager } from '@open-pencil/core/text'
import canvasKitWasm from 'canvaskit-wasm/bin/canvaskit.wasm?url'

/**
 * Core expects its CanvasKit binary and bundled fonts at the site root, which the app
 * arranges by copying them into `public/`. The landing imports them as assets instead, so
 * Vite serves them in development, emits them with the build, and keeps them in step with
 * the installed packages; core is told where they landed.
 */
const BUNDLED_FONTS: Record<string, string> = {
  'Inter-Regular.ttf': interRegular,
  'Inter-Medium.ttf': interMedium,
  'Inter-SemiBold.ttf': interSemiBold,
  'Inter-Bold.ttf': interBold,
  'Inter-ExtraBold.ttf': interExtraBold,
  'NotoNaskhArabic-Regular.ttf': notoNaskhArabic
}

let ready: Promise<void> | null = null

/** Loads CanvasKit from the emitted binary. Stages await it before mounting a canvas. */
export function prepareEngine(): Promise<void> {
  ready ??= (async () => {
    fontManager.setBundledFontLocator((file) => BUNDLED_FONTS[file] ?? `/${file}`)
    await getCanvasKit({ locateFile: () => canvasKitWasm })
  })()
  return ready
}
