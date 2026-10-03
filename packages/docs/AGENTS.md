# Docs site

Published VitePress site. `bun run docs:dev`, `bun run docs:build` for fast checks, and `bun run docs:build:production` for deployment output. `bun run check:docs` runs the integrity checks in `tools/checks/docs/` plus `check:authoring-reference`.

- Keep routes under `/getting-started`, `/overview/**`, `/user-guide/**`, `/programmable/**`, `/reference/**`, and `/development/**`; do not recreate `/guide/**`. Preserve moves in `packages/docs/public/_redirects`.
- Link untranslated locale navigation to canonical English pages rather than adding placeholders.
- `packages/docs/development/roadmap.md` tracks product direction, Figma compatibility gaps, raw metadata coverage, and the code map. `packages/docs/development/testing.md` is the canonical testing architecture. Explanations that would bloat an `AGENTS.md` belong under `packages/docs/development/`.
- SDK pages embed the demos colocated with `packages/vue` primitives, derive API tables from source and JSDoc with `vue-component-meta`, and process examples with Twoslash so imports and types stay aligned with the public package API. The docs Tailwind entry scans those demos.
- Generated authoring-reference copies under this site are checked, not edited; run `bun run generate:authoring-reference` (`packages/core/AGENTS.md`, Tools).
- CI runs documentation integrity and the docs build for docs-only changes, not engine, browser, Storybook, or native suites (`tools/AGENTS.md`).
- The landing page (`.vitepress/theme/landing/`) mounts the app's own components, so the site resolves `@/` and workspace packages through `vite/aliases.ts` and loads the app's icon plugins and design tokens (`.vitepress/app-source.ts`, `src/theme/tokens.css`). Server-rendered sections must not import from `landing/stage/`; they reach it through the client-only `ui/StageFrame.vue`.
- Each landing stage is one document pinned with `provideEditorStore()` and one WebGL canvas that mounts once and is never unmounted. Browsers cap WebGL contexts per page, so do not use the app's two-canvas `EditorCanvas` there or mount and unmount stages on scroll (`landing/stage/StageCanvas.vue`).
- Counts shown on the landing page come from source at build time through `landing/content/stats.data.ts`; do not hardcode them. Its roadmap (`landing/content/roadmap.ts`) is the short view of `development/roadmap.md` and changes with it.
