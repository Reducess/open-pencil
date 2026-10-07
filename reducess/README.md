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
| 07 | `packages/core/src/editor/structure/state.ts` | `toggleNodeVisibility` / `toggleNodeLock` (layer tree eye and padlock) and the selection-wide `toggleVisibility` / `toggleLock` changed the node without an undo entry |
| 08 | `packages/vue/src/primitives/LayerTree/useLayerTreeModel.ts` (state moved out of `LayerTreeRoot.vue` so it can be unit tested) | the tree patched raw objects indexed outside Vue reactivity, so rows kept the old name, eye and padlock until a rebuild; and a selected layer reparented into a collapsed container (`node:reparented`) vanished from the visible rows |
| 09 | `packages/vue/src/primitives/LayerTree/` (`LayerTreeRoot.vue` prop `frontOnTop`, `model.ts`, `drop.ts`, `useLayerDrag.ts`) | the tree could only list layers in `childIds` order (back to front); `front-on-top` lists the front layer first, default unchanged. The drop index is now computed without the dragged layer, which also fixes an upstream off-by-one when a row was dragged down inside the same parent |
| 10 | `packages/vue/src/canvas/surface/kit-loader.ts`, `lifecycle.ts`, `use.ts`, `types.ts` | `onReady` fired even when no WebGL surface could be created, and a CanvasKit load failure was an unhandled rejection. `useCanvas` now takes `onError({ reason: 'canvaskit' \| 'surface', cause? })`, returns `status` / `error` refs, and calls `onReady` only when a surface exists |
| 11 | `packages/core/src/editor/types.ts` (`EditorOptions.naming`), `shapes.ts`, `shapes/pen.ts`, `structure/container-wrap.ts`, `structure/auto-layout-wrap.ts`, `clipboard.ts`, `packages/vue/src/shared/input/duplicate-drag.ts` | layer names were hard-coded in English (`Rectangle`, `Frame`, `Group`, the `Vector` that `penCommit` wrote after creating the node, the ` copy` suffix). `createEditor({ naming: { defaultName(type), copyName(name) } })` lets the host supply them; without it nothing changes. Not covered: boolean operation and flatten labels |
| 12 | `packages/core/src/canvas/renderer/lifecycle.ts` (`SkiaRenderer.clearDocumentCaches`), `packages/core/src/io/formats/raster/headless.ts` | `headlessRenderNodes` / `headlessRenderThumbnail` reuse one renderer per process and `invalidateAllPictures` keeps its image cache (by hash) and path caches (by node id), so a document was painted from the previous one's content. The headless entry points now start from `clearDocumentCaches()`, which is public for anyone holding a renderer |
| 13 | `packages/core/src/canvas/text/render-issues.ts` (`SkiaRenderer.textRenderIssues`, `headlessRenderNodes({ onTextIssues })`) | text whose font or glyph coverage is missing is substituted or left out of the render without an error. The renderer now lists those nodes with their readiness (`pending`, `substituted`, `exhausted`) and the faces they ask for; rendering itself is unchanged |
| 14 | `packages/core/src/editor/layout-mode.ts` | undoing "add auto layout" (`setLayoutMode`) restored the frame fields only, so the children stayed where the layout had put them (and at the size it gave them). The undo entry now keeps each child's `x`, `y`, `width`, `height` and puts them back before the frame is laid out again |
| 15 | `packages/vue/src/controls/layout/helpers.ts` (`axisSizingPatchForNode`, `widthSizingForNode`, `heightSizingForNode`, `createLayoutSizingState`, `createLayoutActions`) | "fill" always wrote `layoutGrow` for width and `layoutAlignSelf: STRETCH` for height, but the layout engine reads `layoutGrow` along the parent's primary axis: in a vertical parent "fill width" grew the height. The helpers take the parent's `layoutMode` (optional last argument, horizontal when omitted) and pick the field by axis; reading the sizing back follows the same rule |
| 16 | `packages/core/src/editor/variables.ts`, `packages/core/src/editor/types.ts` (`EditorEvents['variables:changed']`) | variable, collection and mode actions changed the document without any editor event (a host could only poll or listen to `history:changed`), and `setActiveMode` left no undo entry. Every action, its undo and its redo now emit `variables:changed`; `setActiveMode` records the previous mode, and is a no-op for the mode already active or an unknown collection |
| 17 | `packages/scene-graph/src/variables.ts` (`boundScalarChanges`, `SceneGraph.boundScalarChanges`), `packages/core/src/layout/variable-bindings.ts` (`applyVariableBindings`), `packages/core/src/editor/create.ts` (`editor.syncVariableBindings`), `graph-events.ts`, `variables.ts`, `variable-bindings.ts`, `packages/core/src/canvas/renderer/fonts.ts` (`prepareForExport`) | a FLOAT variable bound to a scalar field (radius, gap, padding, size, font size, line height, letter spacing, stroke weight, opacity…) was only a record in `boundVariables`: layout and rendering read the node field, which nobody updated. Fields keep holding resolved values (as in a .fig), and the engine now rewrites the stale ones and lays out again when a variable value changes, the active mode changes, a node pins or drops a mode, a node is reparented, and when a variable is bound (undo gives the old value back). The headless render does the same before layout, so a graph built outside an editor renders in its current mode. Variable changes also drop the picture cache, which colour bindings needed. A size or position the layout computes (hug, fill, text auto-resize, in-flow x/y) is left alone. Not covered: STRING (`fontFamily`) and BOOLEAN (`visible`) bindings, nodes created by paste or duplicate under another mode scope, and variables changed straight on the graph without an editor (call `editor.syncVariableBindings()` or `applyVariableBindings(graph)`) |
| 18 | `packages/vue/src/variables/use.ts` | `useVariables().activeCollection` and `activeModes` were plain computeds over an object the editor mutates in place, so nothing reading a collection name or its modes re-rendered after a rename, a new or removed mode, or an undo. They are now scene-computed snapshots |
| 19 | `packages/core/src/text/editor.ts` (`currentLineMetrics`) | Home (and Shift+Home) did nothing with the caret after the last character, where it sits when editing starts: CanvasKit's `getLineNumberAt(text.length)` returns -1 and the move was dropped. That position now resolves to the last line, or to the empty line opened by a trailing line break |
| 20 | `packages/core/src/io/formats/html/` (`selectionToHTML`, exported from `@open-pencil/core` and `@open-pencil/core/io`), `packages/core/src/io/formats/jsx/tailwind-classes.ts` (`nodeToStyle` exported, `collectTailwindClasses` takes extra declarations) | the engine could only describe a selection as JSX (`className`, self-closing tags); there was no HTML and no plain-CSS output. `selectionToHTML(ids, graph, 'tailwind' \| 'css')` returns static markup with utility classes, or one class per element plus a stylesheet, from the same declarations the JSX exporter derives. On top of those it positions layers inside free-form frames and writes line height, letter spacing, italic and decoration. Still not exported: gradients, image fills, vector shapes, per-range text styles, masks |

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

No engine source was patched for this. Engine behaviour found along the way that a server still
has to work around (the renderer cache leak and the silent text skip are now patches 12 and 13):

| Where | What |
|---|---|
| `packages/core/src/canvas/renderer/fonts.ts` (`loadFonts`) | The `Typeface` from `MakeFreeTypeFaceFromData` is never deleted: ~0.4 MB of WASM memory leaks per `SkiaRenderer` created and destroyed |
| `packages/core/src/text/fonts.ts` (`FontManager`) | Fonts can be registered but not unregistered; a second file for the same family and style is added next to the first instead of replacing it |
