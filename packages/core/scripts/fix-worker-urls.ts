// Reducess: tsdown keeps `new URL('./worker.ts', import.meta.url)` verbatim while emitting
// only the .js file next to it, which breaks any downstream Vite/Rollup build.
import { Glob } from 'bun'

const pattern = /new URL\((["'])(\.\/[\w-]*worker)\.ts\1,\s*import\.meta\.url\)/g
let rewritten = 0

for await (const path of new Glob('dist/**/*.js').scan({ cwd: import.meta.dir + '/..', absolute: true })) {
  const source = await Bun.file(path).text()
  const fixed = source.replace(pattern, 'new URL($1$2.js$1, import.meta.url)')
  if (fixed === source) continue
  await Bun.write(path, fixed)
  rewritten++
}

if (rewritten === 0) throw new Error('fix-worker-urls: no worker URL found; upstream layout changed')
console.log(`fix-worker-urls: ${rewritten} file(s)`)
