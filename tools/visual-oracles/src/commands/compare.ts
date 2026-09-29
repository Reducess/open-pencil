import { defineCommand } from 'citty'

import { operationCommand } from './operation'

export default defineCommand({
  meta: { name: 'compare', description: 'Compare Figma and OpenPencil rendering' },
  subCommands: {
    node: operationCommand(
      'node',
      'Compare one Figma node or clipboard selection',
      'tools/visual-oracles/src/operations/compare/node.ts'
    ),
    document: operationCommand(
      'document',
      'Compare exact imported-document targets from a manifest',
      'tools/visual-oracles/src/operations/compare/document.ts'
    ),
    'interpreted-document': operationCommand(
      'interpreted-document',
      'Compare an interpreted archive with the same document opened in Figma',
      'tools/visual-oracles/src/operations/compare/interpreted-document.ts'
    )
  }
})
