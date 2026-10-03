import type { StageKind } from '../stage/kinds'

export interface FeatureBlock {
  /** Selects the scene and panel in `stage/definitions.ts`. */
  kind: Exclude<StageKind, 'hero'>
  title: string
  detail: string
  /** What to try in the live stage. */
  hint: string
}

export const FEATURE_BLOCKS: FeatureBlock[] = [
  {
    kind: 'figma',
    title: 'Open your Figma files',
    detail:
      'OpenPencil reads .fig files directly: pages, components, instances, variables, and auto layout arrive as editable layers. Copy and paste works in both directions, and you can save back to .fig.',
    hint: 'This is a real .fig file. Expand the layers and click around.'
  },
  {
    kind: 'design',
    title: 'Design with real tools',
    detail:
      'Auto layout, constraints, fills, strokes, effects, and typography, with the controls where you expect them. Everything is undoable, and nothing waits on a server.',
    hint: 'Select a layer and change its fill, radius, or padding.'
  },
  {
    kind: 'components',
    title: 'Components and variables',
    detail:
      'Build a library with variants and component properties, bind colours and spacing to variables, and switch modes. Instances follow their source as you edit it.',
    hint: 'Search the assets, then drag a component onto the canvas.'
  },
  {
    kind: 'ai',
    title: 'Design with AI, on your keys',
    detail:
      'Ask in plain language and the agent edits the document with the same tools you use, previewing its work on the canvas as it streams. Connect any provider with your own key, or bring the coding agent you already use.',
    hint: 'The transcript is a recorded turn; the canvas shows what it built.'
  },
  {
    kind: 'code',
    title: 'From design to code',
    detail:
      'Every selection is available as Tailwind JSX, HTML, or design JSX, and components export as Storybook stories. Edit the JSX and the canvas follows.',
    hint: 'Select another layer and watch the code change.'
  },
  {
    kind: 'script',
    title: 'Script everything',
    detail:
      'The openpencil CLI works on a file with no app running, or drives the app you have open. Inspect a document, query it with XPath, lint it, export it, or run Figma plugin code against it with eval. The MCP server gives agents the same reach over stdio or HTTP.',
    hint: 'Run a command and watch the canvas.'
  },
  {
    kind: 'sdk',
    title: 'Build it into your own product',
    detail:
      'OpenPencil is a toolkit as much as an app: a framework-neutral engine, a headless Vue SDK, and separate packages for the scene graph and file formats. Embed a canvas in your product, render and check designs in CI, or build a different editor on the same engine. Every canvas on this page is that SDK running inside a documentation site.',
    hint: 'The code beside the canvas is all it takes to mount one.'
  }
]

/** Coding agents documented for the MCP server, the agent skill, or as built-in ACP agents. */
export const AGENTS = ['Claude Code', 'Cursor', 'Windsurf', 'Codex', 'Gemini CLI'] as const
