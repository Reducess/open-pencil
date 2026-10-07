import { writeFileSync } from 'node:fs'

const STUB = process.env.GATE_STUB_FIG === '1'
const STUB_RE = /@open-pencil\/(fig|kiwi)\/dist\/|@open-pencil\/core\/dist\/(kiwi|io\/formats\/fig)\//

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  telemetry: false,
  app: { baseURL: '/demo/' },
  vite: {
    plugins: [
      {
        // teste opcional: troca fig/kiwi por stub (Proxy) para medir o que sai do bundle
        name: 'gate-stub-fig-kiwi',
        enforce: 'pre',
        load(id: string) {
          if (!STUB || !STUB_RE.test(id) || !/\.js$/.test(id.split('?')[0]!)) return null
          return {
            code: `const h={get:(t,k)=>k==='then'?undefined:k===Symbol.toPrimitive?()=>'':new Proxy(function(){},h),apply:()=>new Proxy(function(){},h),construct:()=>new Proxy(function(){},h)};export const __stub=new Proxy(function(){},h);export default __stub;`,
            syntheticNamedExports: '__stub',
            map: null,
          }
        },
      },
      {
        name: 'gate-bundle-stats',
        generateBundle(_o: unknown, bundle: Record<string, any>) {
          const out: Record<string, unknown> = {}
          for (const [file, c] of Object.entries(bundle)) {
            if (c.type !== 'chunk') continue
            out[file] = { size: c.code.length, imports: c.imports, dynamicImports: c.dynamicImports, modules: Object.fromEntries(Object.entries(c.modules).map(([id, m]: [string, any]) => [id.replace(/^.*node_modules\//, ''), m.renderedLength])) }
          }
          if (Object.keys(out).length > 5) writeFileSync(process.env.GATE_STATS ?? 'bundle-stats.json', JSON.stringify(out))
        },
      },
    ],
  },
})
