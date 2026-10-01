import { defineCommand } from 'citty'

import { appTargetOptions } from '#cli/app-target'
import { runToolData } from '#cli/tool-data'

import { printDiffResult, type DiffResult } from './output'

export default defineCommand({
  meta: { description: 'Preview the patch that setting properties on a node would produce' },
  args: {
    id: { type: 'positional', description: 'Node ID', required: true },
    file: {
      type: 'positional',
      description: 'Document file path (omit to connect to running app)',
      required: false
    },
    props: {
      type: 'string',
      description: 'JSON object of properties, e.g. \'{"fill": "#FF0000", "width": 200}\'',
      required: true
    },
    ...appTargetOptions,
    json: { type: 'boolean', description: 'Output as JSON' }
  },
  async run({ args }) {
    const { result } = await runToolData(
      args.file,
      'diff_show',
      { id: args.id, props: args.props },
      args
    )
    printDiffResult(result as DiffResult, !!args.json)
  }
})
