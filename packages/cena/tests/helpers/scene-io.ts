import type { SceneGraph } from '@open-pencil/scene-graph'

import { cenaParaGrafo, grafoParaCena } from '../../src'
import type { Cena, CenaCarregada, CenaImagemRef } from '../../src'

/** In-memory stand-in for the host's file storage: bytes in, numeric id out. */
export class FakeStorage {
  readonly files = new Map<number, Uint8Array>()
  uploads = 0
  private nextId = 100

  put(bytes: Uint8Array): number {
    const id = this.nextId++
    this.files.set(id, bytes)
    this.uploads++
    return id
  }

  get(id: number): Uint8Array | null {
    return this.files.get(id) ?? null
  }
}

export async function save(
  graph: SceneGraph,
  storage: FakeStorage,
  conhecidas?: Record<string, CenaImagemRef>
): Promise<Cena> {
  return grafoParaCena(graph, {
    imagensConhecidas: conhecidas,
    resolverArquivo: ({ bytes }) => (bytes ? storage.put(bytes) : null)
  })
}

export async function load(cena: unknown, storage: FakeStorage): Promise<CenaCarregada> {
  return cenaParaGrafo(cena, { carregarImagem: ({ arquivo }) => storage.get(arquivo) })
}

/** What the database does to a scene: text out, text in. */
export function throughJSON<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Fails on anything `JSON.stringify` would silently alter. */
export function assertPlainJSON(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path}: non-finite number`)
    if (Object.is(value, -0)) throw new Error(`${path}: negative zero`)
    return
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      if (!(index in value)) throw new Error(`${path}[${index}]: array hole`)
      assertPlainJSON(value[index], `${path}[${index}]`)
    }
    return
  }
  if (typeof value !== 'object') throw new Error(`${path}: ${typeof value}`)
  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${path}: instance of ${value.constructor.name}`)
  }
  for (const [key, item] of Object.entries(value)) assertPlainJSON(item, `${path}.${key}`)
}
