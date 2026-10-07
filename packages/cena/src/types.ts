import type { DocumentColorSpace } from '@open-pencil/scene-graph'

/** Persistence format identifier. Changes only when the envelope itself changes shape. */
export const CENA_FORMATO = 'mineer.design/v2'

/** Engine name stamped on every scene. */
export const MOTOR_NOME = 'open-pencil'

/**
 * Engine version whose `SceneNode` layout the `nos` entries follow. Bump it together with the
 * engine and register the step in `migrate.ts`; a test pins it to `@open-pencil/core`'s version.
 */
export const MOTOR_VERSAO = '0.15.1'

/** JSON value: what survives `JSON.parse(JSON.stringify(x))` unchanged. */
export type JSONValor =
  | string
  | number
  | boolean
  | null
  | JSONValor[]
  | { [chave: string]: JSONValor }

export type JSONObjeto = { [chave: string]: JSONValor }

/** Where the bytes of an image live in the host's storage. Bytes never enter the scene. */
export interface CenaImagemRef {
  /** Host storage id (Mineer `arquivo`), never a bucket key. */
  arquivo: number
  /** MIME type of the stored bytes. */
  tipo: string
}

export interface CenaMotor {
  nome: string
  versao: string
}

/**
 * `mineer.design/v2`: an envelope around the engine's scene graph. Node objects are stored as the
 * engine keeps them, with non-JSON values replaced by `{ "$cena": ... }` markers (see
 * `json-safe.ts`).
 */
export interface Cena {
  formato: typeof CENA_FORMATO
  motor: CenaMotor
  /** Id of the document root node. */
  raiz: string
  /** `[id, SceneNode]` in the engine's own order. */
  nos: Array<[string, JSONObjeto]>
  /** `[id, Variable]`. */
  variaveis: Array<[string, JSONObjeto]>
  /** `[id, VariableCollection]`. */
  colecoes: Array<[string, JSONObjeto]>
  /** `[collectionId, modeId]`. */
  modoAtivo: Array<[string, string]>
  /** `[componentId, instanceIds]` — the engine's instance index, stored as it was. */
  instancias: Array<[string, string[]]>
  espacoDeCor: DocumentColorSpace
  /** Engine image hash → host storage reference. */
  imagens: Record<string, CenaImagemRef>
  /** `[libraryId, EnabledLibraryBinding]`; present only when the document links a library. */
  bibliotecas?: Array<[string, JSONObjeto]>
  /** Free for the host. Never read by this package. */
  meta: JSONObjeto
}

export type GravidadeProblema = 'erro' | 'aviso'

export interface ProblemaCena {
  /** Stable machine-readable code, e.g. `filho-inexistente`. */
  codigo: string
  gravidade: GravidadeProblema
  /** JSON-pointer-like location inside the scene, e.g. `nos/3/1/childIds/0`. */
  caminho: string
  mensagem: string
}

/** What the host hands back for an image: the storage reference, or just the storage id. */
export type ImagemResolvida = CenaImagemRef | { arquivo: number; tipo?: string } | number

export interface ImagemParaResolver {
  hash: string
  /** `null` when the graph references the hash but does not hold its bytes. */
  bytes: Uint8Array | null
  /** MIME type sniffed from the bytes; `application/octet-stream` when unknown. */
  tipo: string
}

export interface OpcoesGrafoParaCena {
  /**
   * Stores the image bytes (or looks them up) and returns the storage reference. Called once per
   * hash referenced by the document that is not in `imagensConhecidas`. Returning nothing is an
   * error: a scene never ships with an unmapped image.
   */
  resolverArquivo: (
    imagem: ImagemParaResolver
  ) => ImagemResolvida | null | undefined | Promise<ImagemResolvida | null | undefined>
  /**
   * References already known for this document — normally the `imagens` returned by
   * `cenaParaGrafo`. Hashes found here are written as they are and never reach `resolverArquivo`.
   */
  imagensConhecidas?: Readonly<Record<string, CenaImagemRef>>
  /** Stored verbatim in `meta`. Must be plain JSON. */
  meta?: JSONObjeto
  /**
   * Keep `SceneNode.textPicture` (base64). Off by default: it is a cache the renderer only reads
   * when the node's font cannot be loaded, and it embeds font data.
   */
  manterTextPicture?: boolean
}

export interface OpcoesCenaParaGrafo {
  /** Loads the bytes of one image. Returning `null` or throwing leaves the image missing. */
  carregarImagem: (
    imagem: CenaImagemRef & { hash: string }
  ) => Uint8Array | null | undefined | Promise<Uint8Array | null | undefined>
  /**
   * Bytes painted in place of an image that could not be loaded. Without it the node simply
   * renders without that fill. Hand `imagens` back to `grafoParaCena` as `imagensConhecidas` so
   * these bytes are never uploaded as if they were the original.
   */
  imagemSubstituta?: Uint8Array
}

export interface AvisoCena {
  codigo: 'imagem-ausente'
  hash: string
  /** `null` when the scene references the hash but `imagens` has no entry for it. */
  arquivo: number | null
  /** Ids of the nodes that reference the image. */
  nos: string[]
  mensagem: string
}
