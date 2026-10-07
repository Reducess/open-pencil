# Reducess fork

Base: upstream tag `v0.15.1`. Branch `reducess/v0.15.1`.

Patches carried on top of upstream:

| # | Where | Why |
|---|---|---|
| 01 | `packages/core/scripts/fix-worker-urls.ts` (runs after the core build) | `dist` referenced `./worker.ts` while only `.js` is emitted; any Vite/Rollup consumer failed to build |
| 02 | `packages/vue/src/canvas/CanvasSurface.vue` | canvas ref was handed over after `useCanvas` mounted, so `CanvasRoot`/`CanvasSurface` never initialised |
| 03 | `packages/core/src/io/formats/svg/export.ts` | exported groups carry `id` and `data-name` |
| 04 | `packages/core/src/io/formats/svg/defs.ts` | linear gradient start/end were mirrored relative to the canvas renderer |
| 05 | `packages/core/src/editor/shapes/draw-parent.ts`, `packages/vue/src/shared/input/draw.ts`, `packages/core/src/editor/shapes/pen.ts` | a shape, text, frame or pen path drawn over a frame was created as a page child; it is now created inside the innermost unlocked, visible frame of the frontmost stack under the start point, with geometry in that parent's space (`editor.resolveDrawParent`) |
| 06 | `packages/vue/src/shared/input/draw.ts`, `packages/core/src/editor/shapes/pen.ts` | drawing ignored `snappingPreferences.pixelGrid`: created nodes got fractional position and size at any zoom other than 100%; creation points and pen anchors now land on whole pixels while the preference is on |

Building needs Node >= 22 on PATH (tsdown) even when driven by bun.

`gate-*` folders hold the adoption gate run on 2026-10-07 against a Nuxt 4 app served under a
base path: the throwaway app, the Playwright probes, the dist-level diffs and the measured output.

## `packages/cena` — persistence format (`mineer.design/v2`)

Fork-only package `@open-pencil/cena`: the JSON envelope Mineer stores for a design document, plus
`grafoParaCena` / `cenaParaGrafo`, `validarCena` and `migrarCena`. See `packages/cena/README.md`.

- It is a public workspace package (not `private`) because `bun run build:packages` only builds
  those; it is never published. Consumers take a tarball: Mineer's `design-render` vendors the six
  packages it needs with `design-render/scripts/vendor-open-pencil.sh`.
- Wiring outside the package: the `packages/cena` entry in the root `package.json` workspaces, the
  `cena` shard in `tools/unit-tests/src/shards.ts` and the matching entry in the CI matrix.
- Tests: `bun test packages/cena/tests` (118 tests). The round trip requires a byte-identical
  headless PNG.
- On an engine upgrade, `packages/cena/tests/node-fields.test.ts` fails until `MOTOR_VERSAO` is
  bumped and the migration step is written in `packages/cena/src/migrate.ts`.

No engine source was patched for this. Engine behaviour found along the way that a server has to
work around (candidates for patches 05+):

| Where | What |
|---|---|
| `packages/core/src/canvas/renderer/fonts.ts` (`loadFonts`) | The `Typeface` from `MakeFreeTypeFaceFromData` is never deleted: ~0.4 MB of WASM memory leaks per `SkiaRenderer` created and destroyed |
| `packages/core/src/io/formats/raster/headless.ts` | The process-wide renderer keeps `imageCache` (by image hash) and the vector/geometry path caches (by node id) between calls; `invalidateAllPictures` does not clear them, so a second document with the same ids or hashes is painted from the first one's caches |
| `packages/core/src/text/fonts.ts` (`FontManager`) | Fonts can be registered but not unregistered; a second file for the same family and style is added next to the first instead of replacing it |
| `packages/core/src/canvas/scene.ts` (`renderText`) | A text node whose font or glyph coverage is missing is skipped without any error |
