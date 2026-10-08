import { SceneGraph } from '@open-pencil/scene-graph'
import type {
  EnabledLibraryBinding,
  SceneNode,
  Variable,
  VariableCollection
} from '@open-pencil/scene-graph'

import { expandirCena } from './defaults'
import { CenaError } from './errors'
import { imagensReferenciadas } from './images'
import { decodificarValor } from './json-safe'
import { migrarCena } from './migrate'
import type { AvisoCena, Cena, CenaImagemRef, JSONObjeto, OpcoesCenaParaGrafo } from './types'
import { validarCena } from './validate'

export interface CenaCarregada {
  grafo: SceneGraph
  /** Things that did not stop the document from opening. Empty when everything loaded. */
  avisos: AvisoCena[]
  /**
   * Image references of the stored scene. Pass them to `grafoParaCena` as `imagensConhecidas` so
   * images that were not edited are neither re-uploaded nor lost when their bytes failed to load.
   */
  imagens: Record<string, CenaImagemRef>
}

function decodePairs<T>(pairs: Array<[string, JSONObjeto]>, campo: string): Map<string, T> {
  return new Map(pairs.map(([id, value]) => [id, decodificarValor(value, `${campo}/${id}`) as T]))
}

function decodeNode(id: string, value: JSONObjeto): SceneNode {
  const node = decodificarValor(value, `nos/${id}`) as SceneNode
  // Same repair the engine applies when it deserializes a graph (kiwi/fig/parse/transfer.ts).
  return Array.isArray(node.guides) ? node : { ...node, guides: [] }
}

async function carregarImagens(
  cena: Cena,
  graph: SceneGraph,
  options: OpcoesCenaParaGrafo
): Promise<AvisoCena[]> {
  const avisos: AvisoCena[] = []
  const ausente = (hash: string, arquivo: number | null, nos: string[], motivo: string) => {
    if (options.imagemSubstituta) graph.images.set(hash, options.imagemSubstituta)
    const origem = arquivo === null ? 'no entry in "imagens"' : `arquivo ${arquivo}`
    avisos.push({
      codigo: 'imagem-ausente',
      hash,
      arquivo,
      nos,
      mensagem: `Image "${hash}" (${origem}) could not be loaded: ${motivo}`
    })
  }

  // Only what the document still uses; an unused entry is not worth a download.
  await Promise.all(
    Array.from(imagensReferenciadas(graph.nodes), async ([hash, nos]) => {
      const ref = Object.hasOwn(cena.imagens, hash) ? cena.imagens[hash] : undefined
      if (!ref) {
        ausente(hash, null, nos, 'the scene does not say where its bytes are stored')
        return
      }
      let bytes: Uint8Array | null | undefined
      let motivo = 'the host returned no bytes'
      try {
        bytes = await options.carregarImagem({ hash, arquivo: ref.arquivo, tipo: ref.tipo })
      } catch (error) {
        motivo = error instanceof Error ? error.message : String(error)
      }
      if (bytes instanceof Uint8Array && bytes.byteLength > 0) graph.images.set(hash, bytes)
      else ausente(hash, ref.arquivo, nos, motivo)
    })
  )
  // Promise.all settles in completion order; keep the report stable for the caller.
  return avisos.sort((a, b) => a.hash.localeCompare(b.hash))
}

/**
 * Rebuilds a scene graph from a stored scene.
 *
 * The scene is migrated to the current engine version and validated first; a structurally broken
 * scene throws `CenaError` (`codigo: 'cena-invalida'`, details in `problemas`). An image that
 * cannot be loaded — or that `imagens` does not map at all — does not: the document opens, the
 * affected nodes keep their `imageHash`, and the miss is reported in `avisos`.
 */
export async function cenaParaGrafo(
  entrada: unknown,
  options: OpcoesCenaParaGrafo
): Promise<CenaCarregada> {
  const cena = migrarCena(entrada)
  const problemas = validarCena(cena)
  // An unmapped image is an error for whoever stores the scene, not a reason to lose the document.
  const erros = problemas.filter(
    (problema) => problema.gravidade === 'erro' && problema.codigo !== 'imagem-sem-arquivo'
  )
  if (erros.length > 0) {
    throw new CenaError(
      'cena-invalida',
      `The scene has ${erros.length} structural problem(s); first: ${erros[0].mensagem}`,
      problemas
    )
  }

  const graph = new SceneGraph()
  graph.rootId = cena.raiz
  // Omitted fields come back from the defaults table the scene names, not the running engine's.
  graph.nodes = new Map(expandirCena(cena).nos.map(([id, node]) => [id, decodeNode(id, node)]))
  graph.variables = decodePairs<Variable>(cena.variaveis, 'variaveis')
  graph.variableCollections = decodePairs<VariableCollection>(cena.colecoes, 'colecoes')
  graph.activeMode = new Map(cena.modoAtivo)
  // Stored as the engine had it rather than rebuilt: the engine has two rebuild rules of its own
  // (INSTANCE nodes only when creating nodes, any node with a componentId when loading a
  // library), so a reconstruction could not be shown to match the original in every case.
  graph.instanceIndex = new Map(cena.instancias.map(([id, ids]) => [id, new Set(ids)]))
  graph.documentColorSpace = cena.espacoDeCor
  graph.enabledLibraries = decodePairs<EnabledLibraryBinding>(cena.bibliotecas ?? [], 'bibliotecas')
  graph.images = new Map()

  const avisos = await carregarImagens(cena, graph, options)
  return { grafo: graph, avisos, imagens: structuredClone(cena.imagens) }
}
