# Reducess fork

Base: upstream tag `v0.15.1`. Branch `reducess/v0.15.1`.

Patches carried on top of upstream:

| # | Where | Why |
|---|---|---|
| 01 | `packages/core/scripts/fix-worker-urls.ts` (runs after the core build) | `dist` referenced `./worker.ts` while only `.js` is emitted; any Vite/Rollup consumer failed to build |
| 02 | `packages/vue/src/canvas/CanvasSurface.vue` | canvas ref was handed over after `useCanvas` mounted, so `CanvasRoot`/`CanvasSurface` never initialised |
| 03 | `packages/core/src/io/formats/svg/export.ts` | exported groups carry `id` and `data-name` |
| 04 | `packages/core/src/io/formats/svg/defs.ts` | linear gradient start/end were mirrored relative to the canvas renderer |

Building needs Node >= 22 on PATH (tsdown) even when driven by bun.

`gate-*` folders hold the adoption gate run on 2026-10-07 against a Nuxt 4 app served under a
base path: the throwaway app, the Playwright probes, the dist-level diffs and the measured output.
