import { CenaError } from './errors'
import { MARCADOR } from './json-safe'
import { PADROES_0_15_1 } from './padroes/0.15.1'
import type { Cena, CenaCompactacao, JSONObjeto, JSONValor } from './types'

/**
 * Compaction of the stored nodes: a field whose value is the engine default for the node's type is
 * left out of the JSON and put back on load.
 *
 * The defaults used to expand a scene are the ones of the table the scene names in
 * `compactacao.tabela`, never the running engine's: when a default changes in a later engine, a
 * new table is added and old scenes keep reading the old one, so they do not change appearance.
 */
export interface TabelaDePadroes {
  /** Stamped in `compactacao.tabela`. */
  id: string
  /** Field → default, in the engine's field order, JSON-encoded as in the scene. */
  campos: JSONObjeto
  /** Node type → the fields whose default differs from `campos` for that type. */
  porTipo: Record<string, JSONObjeto>
}

export const MODO_PADROES_OMITIDOS = 'padroes-omitidos'

/**
 * Identity fields: always written, whatever their value, and not part of any table. They keep a
 * compact node readable on its own (`name` also has a per-type default not worth a table entry).
 */
export const CAMPOS_SEMPRE_GRAVADOS: readonly string[] = ['id', 'type', 'name']

/** Every table that was ever written to a scene. Entries are never edited or removed. */
export const TABELAS_DE_PADROES: Readonly<Record<string, TabelaDePadroes>> = {
  [PADROES_0_15_1.id]: PADROES_0_15_1
}

/** The table new scenes are written with. */
export const TABELA_DE_PADROES_ATUAL: TabelaDePadroes = PADROES_0_15_1

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Deep equality of two JSON values. Object key order does not matter. */
export function jsonIgual(a: JSONValor | undefined, b: JSONValor | undefined): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, index) => jsonIgual(item, b[index]))
  }
  const chaves = Object.keys(a)
  if (chaves.length !== Object.keys(b).length) return false
  return chaves.every((chave) => Object.hasOwn(b, chave) && jsonIgual(a[chave], b[chave]))
}

function padraoDoCampo(tabela: TabelaDePadroes, tipo: unknown, campo: string): JSONValor {
  const doTipo = typeof tipo === 'string' && Object.hasOwn(tabela.porTipo, tipo) ? tabela.porTipo[tipo] : undefined
  return doTipo && Object.hasOwn(doTipo, campo) ? doTipo[campo] : tabela.campos[campo]
}

/**
 * Drops the fields that hold the default. Returns `null` when the node cannot be compacted without
 * loss: a node that lacks a field of the table would come back *with* that field, so it is stored
 * whole and listed in `compactacao.completos` instead.
 */
export function compactarNo(no: JSONObjeto, tabela: TabelaDePadroes): JSONObjeto | null {
  if (Object.hasOwn(no, MARCADOR)) return null
  for (const campo of Object.keys(tabela.campos)) {
    if (!Object.hasOwn(no, campo)) return null
  }
  const compacto: JSONObjeto = {}
  for (const [campo, valor] of Object.entries(no)) {
    if (Object.hasOwn(tabela.campos, campo) && jsonIgual(valor, padraoDoCampo(tabela, no['type'], campo))) {
      continue
    }
    compacto[campo] = valor
  }
  return compacto
}

/**
 * Inverse of `compactarNo`. Default values are shared with the table, not copied: the result is
 * JSON to be decoded (`decodificarValor` always builds fresh objects) or inspected, never mutated.
 */
export function expandirNo(no: JSONObjeto, tabela: TabelaDePadroes): JSONObjeto {
  const completo: JSONObjeto = {}
  for (const campo of CAMPOS_SEMPRE_GRAVADOS) {
    if (Object.hasOwn(no, campo)) completo[campo] = no[campo]
  }
  for (const campo of Object.keys(tabela.campos)) {
    completo[campo] = Object.hasOwn(no, campo) ? no[campo] : padraoDoCampo(tabela, no['type'], campo)
  }
  for (const [campo, valor] of Object.entries(no)) {
    if (!Object.hasOwn(completo, campo)) completo[campo] = valor
  }
  return completo
}

export function compactarNos(
  nos: Array<[string, JSONObjeto]>,
  tabela: TabelaDePadroes = TABELA_DE_PADROES_ATUAL
): { nos: Array<[string, JSONObjeto]>; compactacao: CenaCompactacao } {
  const completos: string[] = []
  const compactos = nos.map(([id, no]): [string, JSONObjeto] => {
    const compacto = compactarNo(no, tabela)
    if (compacto) return [id, compacto]
    completos.push(id)
    return [id, no]
  })
  const compactacao: CenaCompactacao = { modo: MODO_PADROES_OMITIDOS, tabela: tabela.id }
  if (completos.length > 0) compactacao.completos = completos
  return { nos: compactos, compactacao }
}

/**
 * Reads the `compactacao` stamp of a scene. `null` means the scene stores full nodes (every scene
 * written before compaction existed). An unknown mode or table throws: it was written by a newer
 * version of this package, and guessing its defaults would silently change the document.
 */
export function lerCompactacao(
  cena: Record<string, unknown>,
  tabelas: Readonly<Record<string, TabelaDePadroes>> = TABELAS_DE_PADROES
): { tabela: TabelaDePadroes; completos: Set<string> } | null {
  const carimbo = cena['compactacao']
  if (carimbo === undefined) return null
  if (!isRecord(carimbo) || carimbo['modo'] !== MODO_PADROES_OMITIDOS) {
    throw new CenaError(
      'compactacao-desconhecida',
      `Unknown scene compaction ${JSON.stringify(isRecord(carimbo) ? carimbo['modo'] : carimbo)}; ` +
        `expected "${MODO_PADROES_OMITIDOS}"`
    )
  }
  const id = carimbo['tabela']
  if (typeof id !== 'string' || !Object.hasOwn(tabelas, id)) {
    throw new CenaError(
      'compactacao-desconhecida',
      `Unknown defaults table ${JSON.stringify(id)}; this package knows ${Object.keys(tabelas).join(', ')}. ` +
        'Scenes written by a newer engine cannot be opened by an older one.'
    )
  }
  const completos = carimbo['completos']
  if (completos !== undefined && !(Array.isArray(completos) && completos.every((item) => typeof item === 'string'))) {
    throw new CenaError('compactacao-desconhecida', '"compactacao.completos" must be an array of node ids')
  }
  return { tabela: tabelas[id], completos: new Set((completos as string[] | undefined) ?? []) }
}

/**
 * The nodes of a scene with every field present, whatever way they were stored. Entries that are
 * not `[id, object]` pairs are passed through for the validator to report.
 */
export function nosExpandidos(
  cena: Record<string, unknown>,
  tabelas: Readonly<Record<string, TabelaDePadroes>> = TABELAS_DE_PADROES
): unknown {
  const compactacao = lerCompactacao(cena, tabelas)
  const nos = cena['nos']
  if (!compactacao || !Array.isArray(nos)) return nos
  return nos.map((par: unknown) => {
    if (!Array.isArray(par) || par.length !== 2 || typeof par[0] !== 'string' || !isRecord(par[1])) return par
    if (compactacao.completos.has(par[0]) || Object.hasOwn(par[1], MARCADOR)) return par
    return [par[0], expandirNo(par[1] as JSONObjeto, compactacao.tabela)]
  })
}

/**
 * The scene with full nodes and no `compactacao` stamp — the layout every scene had before
 * compaction. Returns the same object when the scene is already stored that way. For hosts and
 * tools that read node fields straight from the JSON; `cenaParaGrafo` does this by itself.
 */
export function expandirCena(
  cena: Cena,
  tabelas: Readonly<Record<string, TabelaDePadroes>> = TABELAS_DE_PADROES
): Cena {
  if (cena.compactacao === undefined) return cena
  const { compactacao: _carimbo, ...resto } = cena
  return { ...resto, nos: nosExpandidos(cena as unknown as Record<string, unknown>, tabelas) as Cena['nos'] }
}
