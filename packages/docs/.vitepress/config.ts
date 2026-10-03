import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'

import { ensureBrandAssets } from '@open-pencil/brand-tools'

import rootPackage from '../../../package.json' with { type: 'json' }
import { createOpenPencilAliases } from '../../../vite/aliases.ts'
import { appSourceDefines, appSourcePlugins } from './app-source.ts'
import { copyLandingAssets, serveLandingAssets } from './landing-assets.ts'
import { docsLocales } from './locales.ts'
import { rootThemeConfig } from './root-theme.ts'
import { BASE, LOCALE_PREFIXES, applyPageSeo, siteHead, withAlternateSitemapLinks } from './seo.ts'

await ensureBrandAssets(['docs'])

const configDir = dirname(fileURLToPath(import.meta.url))
const docsRoot = dirname(configDir)
const packagesRoot = dirname(docsRoot)
const repoRoot = dirname(packagesRoot)
// The landing page runs DOM/CSS export in the browser. `@acemir/cssom` advertises a `browser`
// build that is a global script with no exports, so resolve its CommonJS entry instead.
const cssomEntry = createRequire(resolve(packagesRoot, 'dom-css/package.json')).resolve(
  '@acemir/cssom'
)
const fastBuild = process.env.OPENPENCIL_DOCS_FAST_BUILD === '1'

const llmsPlugin = llmstxt({
  domain: BASE,
  ignoreFiles: LOCALE_PREFIXES.map((locale) => `${locale}/**`),
  generateLLMsTxt: !fastBuild,
  generateLLMsFullTxt: !fastBuild,
  generateLLMFriendlyDocsForEachPage: !fastBuild,
  injectLLMHint: false,
  customTemplateVariables: {
    title: 'OpenPencil',
    description:
      'Open-source, AI-native design editor and toolkit. Opens Figma .fig files, provides a programmable scene graph, CLI, MCP server, and Vue SDK for custom editor shells.',
    details:
      'Use this file as the compact map for agents. For complete Markdown content, fetch https://openpencil.dev/llms-full.txt.'
  }
})

export default defineConfig({
  title: 'OpenPencil',
  description:
    'Open-source, AI-native design editor. Figma alternative built from scratch with full .fig file compatibility.',
  cleanUrls: true,
  lastUpdated: true,
  appearance: 'dark',

  sitemap: {
    hostname: BASE,
    transformItems: withAlternateSitemapLinks
  },

  head: siteHead,

  transformPageData: applyPageSeo,

  markdown: {
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache({
          dir: resolve(configDir, 'cache/twoslash')
        }),
        twoslashOptions: {
          compilerOptions: {
            baseUrl: repoRoot,
            paths: {
              '@open-pencil/vue': ['packages/vue/src/index.ts'],
              '#vue/*': ['packages/vue/src/*']
            }
          }
        }
      })
    ]
  },

  vite: {
    resolve: {
      // The landing page mounts the app's own components, so the site resolves workspace
      // packages and `@/` exactly as the app build does.
      alias: [
        { find: '#docs-api', replacement: resolve(docsRoot, 'programmable/sdk/api') },
        { find: '#docs', replacement: configDir },
        { find: '@acemir/cssom', replacement: cssomEntry },
        ...createOpenPencilAliases(repoRoot)
      ]
    },
    define: appSourceDefines(rootPackage.version),
    plugins: [
      ...appSourcePlugins(repoRoot),
      tailwindcss(),
      llmsPlugin,
      serveLandingAssets(repoRoot)
    ]
  },

  buildEnd: (siteConfig) => copyLandingAssets(repoRoot, siteConfig.outDir),

  locales: docsLocales,

  themeConfig: rootThemeConfig()
})
