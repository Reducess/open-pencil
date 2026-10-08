import { nosExpandidos } from './defaults'
import { CenaError } from './errors'
import { imagensReferenciadas } from './images'
import { CENA_FORMATO, MOTOR_NOME } from './types'
import type { GravidadeProblema, ProblemaCena } from './types'

const ESPACOS_DE_COR = new Set(['srgb', 'display-p3'])

type Registro = Record<string, unknown>

function isRecord(value: unknown): value is Registro {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

class Relatorio {
  readonly problemas: ProblemaCena[] = []

  add(gravidade: GravidadeProblema, codigo: string, caminho: string, mensagem: string): void {
    this.problemas.push({ codigo, gravidade, caminho, mensagem })
  }

  erro(codigo: string, caminho: string, mensagem: string): void {
    this.add('erro', codigo, caminho, mensagem)
  }

  aviso(codigo: string, caminho: string, mensagem: string): void {
    this.add('aviso', codigo, caminho, mensagem)
  }
}

/**
 * Reads `[id, value]` pairs, reporting each malformed entry. Returns only the well-formed ones,
 * with the index they had, so later checks can keep pointing at the right place.
 */
function lerPares<T>(
  relatorio: Relatorio,
  cena: Registro,
  campo: string,
  valorValido: (value: unknown) => value is T,
  descricao: string
): Array<{ id: string; valor: T; indice: number }> {
  const lista = cena[campo]
  if (!Array.isArray(lista)) {
    relatorio.erro('campo-invalido', campo, `"${campo}" must be an array of [id, ${descricao}]`)
    return []
  }
  const pares: Array<{ id: string; valor: T; indice: number }> = []
  const vistos = new Set<string>()
  lista.forEach((par: unknown, indice) => {
    const caminho = `${campo}/${indice}`
    if (!Array.isArray(par) || par.length !== 2 || typeof par[0] !== 'string' || !par[0]) {
      relatorio.erro('par-malformado', caminho, `Expected [id, ${descricao}]`)
      return
    }
    const [id, valor] = par as [string, unknown]
    if (!valorValido(valor)) {
      relatorio.erro('par-malformado', `${caminho}/1`, `Expected ${descricao} for "${id}"`)
      return
    }
    if (vistos.has(id)) {
      relatorio.erro('id-duplicado', `${caminho}/0`, `"${id}" appears more than once in "${campo}"`)
      return
    }
    vistos.add(id)
    pares.push({ id, valor, indice })
  })
  return pares
}

function validarCabecalho(relatorio: Relatorio, cena: Registro): void {
  if (cena['formato'] !== CENA_FORMATO) {
    relatorio.erro('formato-invalido', 'formato', `Expected "${CENA_FORMATO}"`)
  }
  const motor = cena['motor']
  if (!isRecord(motor) || motor['nome'] !== MOTOR_NOME) {
    relatorio.erro('motor-invalido', 'motor/nome', `Expected engine "${MOTOR_NOME}"`)
  } else if (typeof motor['versao'] !== 'string' || !motor['versao']) {
    relatorio.erro('motor-invalido', 'motor/versao', 'Expected the engine version as a string')
  }
  if (typeof cena['espacoDeCor'] !== 'string' || !ESPACOS_DE_COR.has(cena['espacoDeCor'])) {
    relatorio.erro('espaco-de-cor-invalido', 'espacoDeCor', 'Expected "srgb" or "display-p3"')
  }
  if (!isRecord(cena['meta'])) {
    relatorio.erro('campo-invalido', 'meta', '"meta" must be an object')
  }
}

function validarNos(
  relatorio: Relatorio,
  cena: Registro
): Array<{ id: string; valor: Registro; indice: number }> {
  const nos = lerPares(relatorio, cena, 'nos', isRecord, 'a node object')
  const porId = new Map(nos.map((no) => [no.id, no.valor]))

  for (const { id, valor: no, indice } of nos) {
    const caminho = `nos/${indice}/1`
    if (no['id'] !== id) {
      relatorio.erro('id-divergente', `${caminho}/id`, `Node stored under "${id}" has another id`)
    }
    if (typeof no['type'] !== 'string' || !no['type']) {
      relatorio.erro('no-malformado', `${caminho}/type`, `Node "${id}" has no type`)
    }
    const parentId = no['parentId']
    if (parentId !== null && typeof parentId !== 'string') {
      relatorio.erro('no-malformado', `${caminho}/parentId`, `Node "${id}" has an invalid parent`)
    } else if (typeof parentId === 'string') {
      const pai = porId.get(parentId)
      if (!pai) {
        relatorio.erro('pai-inexistente', `${caminho}/parentId`, `Parent "${parentId}" is missing`)
      } else if (isStringArray(pai['childIds']) && !pai['childIds'].includes(id)) {
        relatorio.erro(
          'pai-divergente',
          `${caminho}/parentId`,
          `Parent "${parentId}" does not list "${id}" among its children`
        )
      }
    }
    const childIds = no['childIds']
    if (!isStringArray(childIds)) {
      relatorio.erro('no-malformado', `${caminho}/childIds`, `Node "${id}" has invalid children`)
      continue
    }
    const filhosVistos = new Set<string>()
    childIds.forEach((filhoId, posicao) => {
      const caminhoFilho = `${caminho}/childIds/${posicao}`
      const filho = porId.get(filhoId)
      if (!filho) {
        relatorio.erro('filho-inexistente', caminhoFilho, `Child "${filhoId}" is missing`)
      } else if (filho['parentId'] !== id) {
        relatorio.erro('pai-divergente', caminhoFilho, `Child "${filhoId}" names another parent`)
      }
      if (filhosVistos.has(filhoId)) {
        relatorio.erro('filho-duplicado', caminhoFilho, `Child "${filhoId}" is listed twice`)
      }
      filhosVistos.add(filhoId)
    })
  }

  validarRaiz(relatorio, cena, nos, porId)
  return nos
}

function validarRaiz(
  relatorio: Relatorio,
  cena: Registro,
  nos: Array<{ id: string; valor: Registro; indice: number }>,
  porId: Map<string, Registro>
): void {
  const raiz = cena['raiz']
  if (typeof raiz !== 'string' || !raiz) {
    relatorio.erro('raiz-invalida', 'raiz', '"raiz" must be the id of the root node')
    return
  }
  if (!porId.has(raiz)) {
    relatorio.erro('raiz-inexistente', 'raiz', `Root node "${raiz}" is missing from "nos"`)
    return
  }

  // Walk down from the root; a node met twice means a cycle or a node with two parents.
  const alcancados = new Set<string>()
  const pilha = [raiz]
  while (pilha.length > 0) {
    const id = pilha.pop()
    if (id === undefined) break
    if (alcancados.has(id)) {
      relatorio.erro('ciclo', 'nos', `Node "${id}" is reachable more than once from the root`)
      continue
    }
    alcancados.add(id)
    const childIds = porId.get(id)?.['childIds']
    if (isStringArray(childIds)) for (const filhoId of childIds) pilha.push(filhoId)
  }
  for (const { id, indice } of nos) {
    if (!alcancados.has(id)) {
      relatorio.aviso('no-orfao', `nos/${indice}/0`, `Node "${id}" is not reachable from the root`)
    }
  }
}

function validarImagens(
  relatorio: Relatorio,
  cena: Registro,
  nos: Array<{ id: string; valor: Registro }>
): void {
  const imagens = cena['imagens']
  if (!isRecord(imagens)) {
    relatorio.erro('campo-invalido', 'imagens', '"imagens" must map image hashes to references')
    return
  }
  for (const [hash, ref] of Object.entries(imagens)) {
    const caminho = `imagens/${hash}`
    if (!isRecord(ref)) {
      relatorio.erro('imagem-malformada', caminho, 'Expected { arquivo, tipo }')
      continue
    }
    const arquivo = ref['arquivo']
    if (typeof arquivo !== 'number' || !Number.isSafeInteger(arquivo) || arquivo <= 0) {
      relatorio.erro('imagem-malformada', `${caminho}/arquivo`, 'Expected a positive integer id')
    }
    if (typeof ref['tipo'] !== 'string' || !ref['tipo']) {
      relatorio.erro('imagem-malformada', `${caminho}/tipo`, 'Expected a MIME type')
    }
    // Bytes belong in storage. A data URI or base64 blob here is a host bug worth stopping.
    for (const chave of Object.keys(ref)) {
      if (chave !== 'arquivo' && chave !== 'tipo') {
        relatorio.erro('imagem-malformada', `${caminho}/${chave}`, `Unexpected field "${chave}"`)
      }
    }
  }
  const referencias = imagensReferenciadas(nos.map((no) => [no.id, no.valor] as const))
  for (const [hash, ids] of referencias) {
    if (!Object.hasOwn(imagens, hash)) {
      relatorio.erro(
        'imagem-sem-arquivo',
        `imagens/${hash}`,
        `Image "${hash}" is used by ${ids.join(', ')} but has no entry in "imagens"`
      )
    }
  }
  for (const hash of Object.keys(imagens)) {
    if (!referencias.has(hash)) {
      relatorio.aviso('imagem-sem-uso', `imagens/${hash}`, `Image "${hash}" is not used by any node`)
    }
  }
}

function validarInstancias(
  relatorio: Relatorio,
  cena: Registro,
  nos: Array<{ id: string; valor: Registro }>
): void {
  const porId = new Map(nos.map((no) => [no.id, no.valor]))
  const instancias = lerPares(relatorio, cena, 'instancias', isStringArray, 'an array of node ids')
  const indexadas = new Set<string>()
  for (const { id: componenteId, valor: ids, indice } of instancias) {
    ids.forEach((instanciaId, posicao) => {
      const caminho = `instancias/${indice}/1/${posicao}`
      const instancia = porId.get(instanciaId)
      if (!instancia) {
        relatorio.aviso('instancia-inexistente', caminho, `Node "${instanciaId}" is missing`)
      } else if (instancia['componentId'] !== componenteId) {
        relatorio.aviso(
          'instancia-divergente',
          caminho,
          `Node "${instanciaId}" is not an instance of "${componenteId}"`
        )
      }
      indexadas.add(instanciaId)
    })
  }
  // The engine indexes INSTANCE nodes as it creates them; one it does not know about would be
  // skipped when its component changes.
  for (const { id, valor: no } of nos) {
    if (no['type'] !== 'INSTANCE' || typeof no['componentId'] !== 'string') continue
    if (!no['componentId'] || indexadas.has(id)) continue
    relatorio.aviso(
      'instancia-nao-indexada',
      'instancias',
      `Instance "${id}" of "${no['componentId']}" is missing from the instance index`
    )
  }
}

function validarVariaveis(relatorio: Relatorio, cena: Registro): void {
  const variaveis = lerPares(relatorio, cena, 'variaveis', isRecord, 'a variable object')
  const colecoes = lerPares(relatorio, cena, 'colecoes', isRecord, 'a collection object')
  const modos = lerPares(
    relatorio,
    cena,
    'modoAtivo',
    (value): value is string => typeof value === 'string',
    'a mode id'
  )
  const idsDeColecao = new Set(colecoes.map((colecao) => colecao.id))
  for (const { id, valor: variavel, indice } of variaveis) {
    const colecaoId = variavel['collectionId']
    if (typeof colecaoId !== 'string' || !idsDeColecao.has(colecaoId)) {
      relatorio.erro(
        'colecao-inexistente',
        `variaveis/${indice}/1/collectionId`,
        `Variable "${id}" belongs to a collection that is missing`
      )
    }
  }
  for (const { id, indice } of modos) {
    if (!idsDeColecao.has(id)) {
      relatorio.aviso('colecao-inexistente', `modoAtivo/${indice}/0`, `Collection "${id}" is missing`)
    }
  }
  if (cena['bibliotecas'] !== undefined) {
    lerPares(relatorio, cena, 'bibliotecas', isRecord, 'a library binding')
  }
}

/**
 * The checks below read `parentId`, `childIds` and `componentId`, which a compact scene omits
 * when they hold the default. They run on a view with the nodes expanded; positions in `nos` are
 * the same, so the reported paths still point into the stored scene.
 */
function verComNosCompletos(relatorio: Relatorio, cena: Registro): Registro {
  if (cena['compactacao'] === undefined) return cena
  try {
    return { ...cena, nos: nosExpandidos(cena) }
  } catch (error) {
    if (!(error instanceof CenaError)) throw error
    relatorio.erro('compactacao-invalida', 'compactacao', error.message)
    return cena
  }
}

/**
 * Structural checks on a stored scene. Never throws: whatever it is handed, it answers with the
 * list of problems. Only `gravidade: 'erro'` entries make the scene unusable; `'aviso'` entries
 * describe things the engine tolerates.
 *
 * It does not validate individual node fields against the engine's types — nodes are stored as
 * the engine writes them and read back as they are.
 */
export function validarCena(cena: unknown): ProblemaCena[] {
  const relatorio = new Relatorio()
  if (!isRecord(cena)) {
    relatorio.erro('cena-invalida', '', 'The scene must be a JSON object')
    return relatorio.problemas
  }
  try {
    validarCabecalho(relatorio, cena)
    const nos = validarNos(relatorio, verComNosCompletos(relatorio, cena))
    validarVariaveis(relatorio, cena)
    validarInstancias(relatorio, cena, nos)
    validarImagens(relatorio, cena, nos)
  } catch (error) {
    // Hostile input (getters, proxies) must not turn a validator into a crash.
    relatorio.erro('cena-invalida', '', `Could not inspect the scene: ${String(error)}`)
  }
  return relatorio.problemas
}

/** True when `validarCena` found nothing that makes the scene unusable. */
export function cenaValida(problemas: readonly ProblemaCena[]): boolean {
  return problemas.every((problema) => problema.gravidade !== 'erro')
}
