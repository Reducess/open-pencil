import type { SkiaRenderer } from '#core/canvas/renderer'
import { clearSubtreePictureCache, invalidateAllPictures } from '#core/canvas/renderer/state'
import { fontManager } from '#core/text/fonts'

function clearRetainedSceneState(r: SkiaRenderer): void {
  r.scenePicture?.delete()
  r.sceneBacking?.image.delete()
  r.sceneBacking = null
  r.sceneBackingBuild?.surface.delete()
  r.sceneBackingBuild = null
}

function disposePathCaches(r: SkiaRenderer): void {
  for (const cache of [
    r.vectorPathCache,
    r.vectorStrokePathCache,
    r.vectorStrokeOutlineCache,
    r.fillGeometryCache,
    r.strokeGeometryCache
  ]) {
    for (const paths of cache.values()) {
      for (const p of paths) p.delete()
    }
    cache.clear()
  }
  r.glyphSilhouetteCache.clear()
}

function disposeImageCache(r: SkiaRenderer): void {
  for (const img of r.imageCache.values()) img.delete()
  r.imageCache.clear()
}

/**
 * Drops everything derived from the documents rendered so far. `invalidateAllPictures` keeps
 * the decoded images (keyed by image hash) and the vector and geometry paths (keyed by node
 * id); a renderer reused for another document would paint it from them.
 */
export function clearDocumentCaches(r: SkiaRenderer): void {
  if (r.destroyed) return
  invalidateAllPictures(r)
  disposeImageCache(r)
  disposePathCaches(r)
  r.textPictureGenerations.clear()
  r.pendingFontNodes.clear()
}

export function destroyRenderer(r: SkiaRenderer): void {
  if (r.destroyed) return
  r.destroyed = true

  disposeImageCache(r)
  disposePathCaches(r)
  r.fillPaint.delete()
  r.diamondGradientEffect?.delete()
  r.diamondGradientEffect = null
  r.strokePaint.delete()
  r.selectionPaint.delete()
  r.parentOutlinePaint.delete()
  r.snapPaint.delete()
  r.auxFill.delete()
  r.auxStroke.delete()
  r.opacityPaint.delete()
  r.textFont?.delete()
  r.labelFont?.delete()
  r.sizeFont?.delete()
  r.sectionTitleFont?.delete()
  r.componentLabelFont?.delete()
  r.fontMgr?.delete()
  const fontProvider = r.fontProvider
  fontProvider?.delete()
  r.fontProvider = null
  r.fontsLoaded = false
  fontManager.detachProvider(fontProvider)
  r.rulerBgPaint.delete()
  r.rulerTickPaint.delete()
  r.rulerTextPaint.delete()
  r.rulerHlPaint.delete()
  r.rulerBadgePaint.delete()
  r.rulerLabelPaint.delete()
  r.penPathPaint.delete()
  r.penLiveStrokePaint.delete()
  r.penHandlePaint.delete()
  r.penVertexFill.delete()
  r.penVertexStroke.delete()
  r.effectLayerPaint.delete()
  for (const filter of r.imageFilterCache.values()) filter?.delete()
  r.imageFilterCache.clear()
  for (const filter of r.maskFilterCache.values()) filter?.delete()
  r.maskFilterCache.clear()
  for (const pic of r.nodePictureCache.values()) pic?.delete()
  r.nodePictureCache.clear()
  r.labelParagraphCache.clear()
  r.textPreparationCache.clear()
  r.effectRasterCache.clear()
  r.tiledScene.destroy()
  clearSubtreePictureCache(r)
  clearRetainedSceneState(r)
  r._flashPaint?.delete()
  r.profiler.destroy()
  r.surface.delete()
}
