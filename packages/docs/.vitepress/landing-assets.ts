import { createReadStream, existsSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import type { Plugin } from 'vite'

/**
 * The landing page mounts the real editor, whose engine fetches CanvasKit and the bundled
 * Inter faces from the site root. They are served from their canonical locations instead of
 * being committed a second time under `public/`.
 */
function landingAssets(repoRoot: string): Record<string, string> {
  const assets: Record<string, string> = {
    '/canvaskit.wasm': resolve(repoRoot, 'node_modules/canvaskit-wasm/bin/canvaskit.wasm'),
    // A real Figma file for the "open your Figma files" block.
    '/landing/sample.fig': resolve(repoRoot, 'tests/fixtures/gold-preview.fig')
  }
  for (const style of ['Regular', 'Medium', 'SemiBold', 'Bold']) {
    assets[`/Inter-${style}.ttf`] = resolve(repoRoot, `public/Inter-${style}.ttf`)
  }
  return assets
}

const CONTENT_TYPES: Record<string, string> = {
  wasm: 'application/wasm',
  ttf: 'font/ttf',
  fig: 'application/octet-stream'
}

export function serveLandingAssets(repoRoot: string): Plugin {
  const assets = landingAssets(repoRoot)
  return {
    name: 'open-pencil-landing-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        const file = assets[pathname]
        if (!file || !existsSync(file)) {
          next()
          return
        }
        const extension = pathname.slice(pathname.lastIndexOf('.') + 1)
        res.setHeader('Content-Type', CONTENT_TYPES[extension] ?? 'application/octet-stream')
        createReadStream(file).on('error', next).pipe(res)
      })
    }
  }
}

export async function copyLandingAssets(repoRoot: string, outDir: string): Promise<void> {
  await Promise.all(
    Object.entries(landingAssets(repoRoot)).map(async ([pathname, file]) => {
      const target = resolve(outDir, pathname.slice(1))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(file, target)
    })
  )
}
