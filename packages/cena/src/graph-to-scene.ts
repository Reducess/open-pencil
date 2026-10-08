import { populateAllLazyFigImportRoots } from '@open-pencil/core/kiwi'
import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'

import { compactarNos } from './defaults'
import { CenaError } from './errors'
import { imagensReferenciadas, tipoDeImagem } from './images'
import { codificarValor } from './json-safe'
import { CENA_FORMATO, MOTOR_NOME, MOTOR_VERSAO } from './types'
import type {
  Cena,
  CenaImagemRef,
  ImagemResolvida,
  JSONObjeto,
  OpcoesGrafoParaCena
} from './types'

function encodeObject(value: unknown, path: string): JSONObjeto {
  const encoded = codificarValor(value, path)
  if (encoded === null || typeof encoded !== 'object' || Array.isArray(encoded)) {
    throw new CenaError('valor-nao-serializavel', `Expected an object at "${path}"`)
  }
  return encoded
}

function encodeNode(node: SceneNode, manterTextPicture: boolean): JSONObjeto {
  // textPicture is a Skia snapshot the renderer only replays while the node's font is missing
  // (canvas/scene.ts, `fontReadiness === 'exhausted'`), and the engine itself drops it as soon as
  // the font resolves. With the font available the paragraph is laid out again from the node.
  const stored = manterTextPicture || node.textPicture === null ? node : { ...node, textPicture: null }
  return encodeObject(stored, `nos/${node.id}`)
}

function normalizarReferencia(
  hash: string,
  resolvida: ImagemResolvida | null | undefined,
  tipoDetectado: string
): CenaImagemRef {
  const arquivo = typeof resolvida === 'number' ? resolvida : resolvida?.arquivo
  if (typeof arquivo !== 'number' || !Number.isSafeInteger(arquivo) || arquivo <= 0) {
    throw new CenaError(
      'imagem-sem-arquivo',
      `Image "${hash}" has no storage reference: resolverArquivo must return its "arquivo" id`
    )
  }
  const tipo = typeof resolvida === 'object' && resolvida?.tipo ? resolvida.tipo : tipoDetectado
  return { arquivo, tipo }
}

async function mapearImagens(
  graph: SceneGraph,
  options: OpcoesGrafoParaCena
): Promise<Record<string, CenaImagemRef>> {
  const conhecidas = options.imagensConhecidas ?? {}
  // Only images some node still uses: the graph keeps the bytes of deleted layers around for
  // undo, and those must not be uploaded on every save.
  const hashes = [...imagensReferenciadas(graph.nodes).keys()]
  const referencias = await Promise.all(
    hashes.map(async (hash): Promise<[string, CenaImagemRef]> => {
      if (Object.hasOwn(conhecidas, hash)) {
        return [hash, normalizarReferencia(hash, conhecidas[hash], conhecidas[hash].tipo)]
      }
      const bytes = graph.images.get(hash) ?? null
      const tipo = bytes ? tipoDeImagem(bytes) : 'application/octet-stream'
      return [hash, normalizarReferencia(hash, await options.resolverArquivo({ hash, bytes, tipo }), tipo)]
    })
  )
  return Object.fromEntries(referencias)
}

/**
 * Serializes a scene graph into the `mineer.design/v2` envelope.
 *
 * - A graph still holding lazily imported `.fig` pages is materialized first (this mutates the
 *   graph the same way opening every page in the editor would). The lazy import context — source
 *   node changes, blobs — is not stored, so nothing is left to populate after loading.
 * - Image bytes go through `resolverArquivo`; only the returned storage references are written.
 * - `.fig`-only state (`figKiwiVersion`, `figSchemaDeflated`) is dropped.
 * - Node fields holding the engine default are omitted and `compactacao` is stamped, unless
 *   `compactar: false`.
 *
 * The result is plain JSON: `JSON.parse(JSON.stringify(cena))` is deeply equal to `cena`.
 */
export async function grafoParaCena(graph: SceneGraph, options: OpcoesGrafoParaCena): Promise<Cena> {
  populateAllLazyFigImportRoots(graph)

  const imagens = await mapearImagens(graph, options)
  const pares = (entries: Iterable<[string, unknown]>, campo: string): Array<[string, JSONObjeto]> =>
    Array.from(entries, ([id, value]) => [id, encodeObject(value, `${campo}/${id}`)])

  const completos: Array<[string, JSONObjeto]> = Array.from(graph.nodes, ([id, node]) => [
    id,
    encodeNode(node, options.manterTextPicture === true)
  ])
  const armazenados = options.compactar === false ? { nos: completos } : compactarNos(completos)

  const cena: Cena = {
    formato: CENA_FORMATO,
    motor: { nome: MOTOR_NOME, versao: MOTOR_VERSAO },
    ...('compactacao' in armazenados ? { compactacao: armazenados.compactacao } : {}),
    raiz: graph.rootId,
    nos: armazenados.nos,
    variaveis: pares(graph.variables, 'variaveis'),
    colecoes: pares(graph.variableCollections, 'colecoes'),
    modoAtivo: [...graph.activeMode],
    instancias: Array.from(graph.instanceIndex, ([componentId, ids]) => [componentId, [...ids]]),
    espacoDeCor: graph.documentColorSpace,
    imagens,
    meta: options.meta ? encodeObject(options.meta, 'meta') : {}
  }
  if (graph.enabledLibraries.size > 0) {
    cena.bibliotecas = pares(graph.enabledLibraries, 'bibliotecas')
  }
  return cena
}
