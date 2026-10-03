import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALL_TOOLS, isToolExposed } from '@open-pencil/core/tools'

export interface LandingStats {
  /** Top-level `openpencil` commands, in the order `--help` lists them. */
  cliCommands: string[]
  /** Tools the MCP server exposes. */
  mcpTools: number
  /** Tools the built-in AI agent can call. */
  aiTools: number
}

declare const data: LandingStats
export { data }

const commandsDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../cli/src/commands'
)

/** Counted from the source at build time, so the page cannot drift from the product. */
export default {
  load(): LandingStats {
    return {
      cliCommands: readdirSync(commandsDir)
        .map((entry) => entry.replace(/\.ts$/, ''))
        .sort(),
      mcpTools: ALL_TOOLS.filter((tool) => isToolExposed(tool, 'mcp')).length,
      aiTools: ALL_TOOLS.filter((tool) => isToolExposed(tool, 'ai')).length
    }
  }
}
