import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import IconsResolver from 'unplugin-icons/resolver'
import Icons from 'unplugin-icons/vite'
import Components from 'unplugin-vue-components/vite'
import type { Plugin, PluginOption } from 'vite'

const RAW_TEXT_PREFIX = '\0app-raw-text:'
// The virtual id must not end in `.md`, or VitePress renders the module as a page.
const RAW_TEXT_SUFFIX = '.js'
const RAW_TEXT_EXTENSIONS = ['.md', '.kiwi']

/**
 * The app imports Markdown and Kiwi schemas as strings (`vite/raw-markdown.ts`). VitePress
 * treats every `.md` module as a page, so app-side text imports are redirected to a virtual
 * module before its Markdown transform can see them.
 */
function appRawText(docsRoot: string): Plugin {
  return {
    name: 'open-pencil-app-raw-text',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !RAW_TEXT_EXTENSIONS.some((extension) => source.endsWith(extension))) {
        return null
      }
      if (importer.startsWith(docsRoot)) return null
      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (!resolved || resolved.id.startsWith(docsRoot)) return null
      return `${RAW_TEXT_PREFIX}${resolved.id}${RAW_TEXT_SUFFIX}`
    },
    async load(id) {
      if (!id.startsWith(RAW_TEXT_PREFIX)) return null
      const file = id.slice(RAW_TEXT_PREFIX.length, -RAW_TEXT_SUFFIX.length)
      const text = await readFile(file, 'utf8')
      return `export default ${JSON.stringify(text)}`
    }
  }
}

/** Vite plugins the app's components need: Lucide icon imports and `icon-lucide-*` tags. */
export function appSourcePlugins(repoRoot: string): PluginOption[] {
  return [
    appRawText(resolve(repoRoot, 'packages/docs')),
    Icons({ compiler: 'vue3' }),
    Components({ dirs: [], dts: false, resolvers: [IconsResolver({ prefix: 'icon' })] })
  ]
}

/** Build-time constants the app reads; the landing page has no local automation server. */
export function appSourceDefines(appVersion: string): Record<string, string> {
  return {
    __OPENPENCIL_APP_VERSION__: JSON.stringify(appVersion),
    __OPENPENCIL_LOCAL_AUTOMATION_TOKEN__: JSON.stringify(''),
    __OPENPENCIL_LOCAL_AUTOMATION_URL__: JSON.stringify(''),
    __OPENPENCIL_LOCAL_AUTOMATION_HTTP_URL__: JSON.stringify('')
  }
}
