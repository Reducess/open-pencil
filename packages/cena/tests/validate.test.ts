import { beforeAll, describe, expect, test } from 'bun:test'

import { cenaParaGrafo, cenaValida, CenaError, validarCena } from '../src'
import type { Cena, ProblemaCena } from '../src'

import { buildRichScene } from './helpers/rich-scene'
import type { RichScene } from './helpers/rich-scene'
import { FakeStorage, save, throughJSON } from './helpers/scene-io'

let scene: RichScene
let valid: Cena

beforeAll(async () => {
  scene = buildRichScene()
  valid = throughJSON(await save(scene.graph, new FakeStorage()))
})

function broken(change: (cena: Cena) => void): ProblemaCena[] {
  const cena = structuredClone(valid)
  change(cena)
  return validarCena(cena)
}

function codes(problemas: ProblemaCena[], gravidade: 'erro' | 'aviso' = 'erro'): string[] {
  return problemas.filter((problema) => problema.gravidade === gravidade).map((p) => p.codigo)
}

function node(cena: Cena, id: string): Record<string, unknown> {
  const found = cena.nos.find(([nodeId]) => nodeId === id)
  if (!found) throw new Error(`Node ${id} not in the scene`)
  return found[1]
}

describe('validarCena', () => {
  test('a scene written by grafoParaCena has no problems at all', () => {
    expect(validarCena(valid)).toEqual([])
    expect(cenaValida(validarCena(valid))).toBe(true)
  })

  test.each([
    ['null', null],
    ['a string', 'cena'],
    ['an array', []],
    ['a number', 3]
  ])('%s is reported, not thrown', (_name, value) => {
    const problemas = validarCena(value)
    expect(codes(problemas)).toEqual(['cena-invalida'])
    expect(cenaValida(problemas)).toBe(false)
  })

  test('an empty object lists every missing part without throwing', () => {
    const found = codes(validarCena({}))
    expect(found).toContain('formato-invalido')
    expect(found).toContain('motor-invalido')
    expect(found).toContain('espaco-de-cor-invalido')
    expect(found).toContain('raiz-invalida')
    expect(found.filter((code) => code === 'campo-invalido').length).toBeGreaterThanOrEqual(6)
  })

  test('input that throws while being read is reported', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('boom')
        }
      }
    )
    expect(codes(validarCena(hostile))).toEqual(['cena-invalida'])
  })

  test.each<[string, (cena: Cena) => void, string, string]>([
    ['wrong format', (c) => ((c as { formato: string }).formato = 'mineer.design/v1'), 'formato-invalido', 'formato'],
    ['wrong engine', (c) => (c.motor.nome = 'figma'), 'motor-invalido', 'motor/nome'],
    ['engine without version', (c) => (c.motor.versao = ''), 'motor-invalido', 'motor/versao'],
    ['unknown colour space', (c) => ((c as { espacoDeCor: string }).espacoDeCor = 'cmyk'), 'espaco-de-cor-invalido', 'espacoDeCor'],
    ['root that is not a node', (c) => (c.raiz = '9:999'), 'raiz-inexistente', 'raiz'],
    ['root of the wrong type', (c) => ((c as { raiz: unknown }).raiz = 1), 'raiz-invalida', 'raiz'],
    ['nodes that are not a list', (c) => ((c as { nos: unknown }).nos = {}), 'campo-invalido', 'nos'],
    ['a node pair with three items', (c) => (c.nos[2] as unknown[]).push('extra'), 'par-malformado', 'nos/2'],
    ['a node that is not an object', (c) => ((c.nos[2] as unknown[])[1] = 'x'), 'par-malformado', 'nos/2/1'],
    ['a duplicated node id', (c) => c.nos.push(structuredClone(c.nos[2])), 'id-duplicado', 'nos'],
    ['variables that are not pairs', (c) => ((c as { variaveis: unknown }).variaveis = [['only-id']]), 'par-malformado', 'variaveis/0'],
    ['an active mode that is not a string', (c) => ((c.modoAtivo[0] as unknown[])[1] = 4), 'par-malformado', 'modoAtivo/0/1'],
    ['instances that are not id lists', (c) => ((c.instancias[0] as unknown[])[1] = 'x'), 'par-malformado', 'instancias/0/1'],
    ['meta that is not an object', (c) => ((c as { meta: unknown }).meta = []), 'campo-invalido', 'meta'],
    ['images that are not a map', (c) => ((c as { imagens: unknown }).imagens = []), 'campo-invalido', 'imagens']
  ])('%s', (_name, change, code, pathPrefix) => {
    const problemas = broken(change)
    const match = problemas.find(
      (problema) => problema.codigo === code && problema.caminho.startsWith(pathPrefix.replace(/\/0$/, ''))
    )
    expect(match).toBeDefined()
    expect(match?.gravidade).toBe('erro')
    expect(match?.mensagem.length).toBeGreaterThan(5)
  })

  test('a child id that does not exist', () => {
    const problemas = broken((cena) => (node(cena, scene.ids.frame)['childIds'] as string[]).push('9:404'))
    expect(codes(problemas)).toEqual(['filho-inexistente'])
    expect(problemas[0].caminho).toMatch(/^nos\/\d+\/1\/childIds\/\d+$/)
    expect(problemas[0].mensagem).toContain('9:404')
  })

  test('a parent id that does not exist', () => {
    const problemas = broken((cena) => (node(cena, scene.ids.band)['parentId'] = '9:404'))
    expect(codes(problemas)).toContain('pai-inexistente')
  })

  test('a child that names another parent, and a parent that forgot a child', () => {
    expect(
      codes(broken((cena) => (node(cena, scene.ids.band)['parentId'] = scene.ids.badge)))
    ).toContain('pai-divergente')
    const forgotten = broken((cena) => {
      const frame = node(cena, scene.ids.frame)
      frame['childIds'] = (frame['childIds'] as string[]).filter((id) => id !== scene.ids.band)
    })
    expect(codes(forgotten)).toEqual(['pai-divergente'])
    expect(codes(forgotten, 'aviso')).toEqual(['no-orfao'])
  })

  test('a cycle is an error', () => {
    const problemas = broken((cena) => {
      ;(node(cena, scene.ids.badge)['childIds'] as string[]).push(scene.ids.frame)
    })
    expect(codes(problemas)).toContain('ciclo')
  })

  test('a child listed twice, a node stored under the wrong id, a node without type', () => {
    expect(
      codes(broken((cena) => (node(cena, scene.ids.frame)['childIds'] as string[]).push(scene.ids.band)))
    ).toContain('filho-duplicado')
    expect(codes(broken((cena) => (node(cena, scene.ids.band)['id'] = 'other')))).toEqual([
      'id-divergente'
    ])
    expect(codes(broken((cena) => delete node(cena, scene.ids.band)['type']))).toEqual(['no-malformado'])
    expect(codes(broken((cena) => (node(cena, scene.ids.band)['childIds'] = null)))).toContain(
      'no-malformado'
    )
  })

  test('an image used by a fill must be mapped; an unused mapping is only a warning', () => {
    const missing = broken((cena) => (cena.imagens = {}))
    expect(codes(missing)).toEqual(['imagem-sem-arquivo'])
    expect(missing[0].caminho).toBe(`imagens/${scene.imageHash}`)
    expect(missing[0].mensagem).toContain(scene.ids.photo)

    const unused = broken((cena) => (cena.imagens['spare'] = { arquivo: 5, tipo: 'image/png' }))
    expect(codes(unused)).toEqual([])
    expect(codes(unused, 'aviso')).toEqual(['imagem-sem-uso'])
  })

  test.each<[string, unknown]>([
    ['arquivo as text', { arquivo: '12', tipo: 'image/png' }],
    ['arquivo zero', { arquivo: 0, tipo: 'image/png' }],
    ['fractional arquivo', { arquivo: 1.5, tipo: 'image/png' }],
    ['no type', { arquivo: 12 }],
    ['inline bytes', { arquivo: 12, tipo: 'image/png', dados: 'iVBORw0KGgo=' }],
    ['a bare id', 12]
  ])('a malformed image reference (%s)', (_name, ref) => {
    const problemas = broken((cena) => ((cena.imagens as Record<string, unknown>)[scene.imageHash] = ref))
    expect(codes(problemas)).toContain('imagem-malformada')
  })

  test('instance index entries that do not match the nodes are warnings', () => {
    const stale = broken((cena) => cena.instancias[0][1].push('9:404'))
    expect(codes(stale)).toEqual([])
    expect(codes(stale, 'aviso')).toEqual(['instancia-inexistente'])

    const wrong = broken((cena) => cena.instancias[0][1].push(scene.ids.band))
    expect(codes(wrong, 'aviso')).toEqual(['instancia-divergente'])

    const unindexed = broken((cena) => (cena.instancias = []))
    expect(codes(unindexed, 'aviso')).toEqual(['instancia-nao-indexada'])
    expect(cenaValida(unindexed)).toBe(true)
  })

  test('a variable whose collection is gone', () => {
    expect(codes(broken((cena) => (cena.colecoes = [])))).toEqual(['colecao-inexistente'])
  })

  test('libraries, when present, must be pairs', () => {
    expect(codes(broken((cena) => ((cena as { bibliotecas: unknown }).bibliotecas = 'x')))).toEqual([
      'campo-invalido'
    ])
    expect(
      broken((cena) => (cena.bibliotecas = [['lib', { libraryId: 'lib', revisionId: 'r', enabled: true }]]))
    ).toEqual([])
  })
})

describe('cenaParaGrafo refuses broken scenes', () => {
  test('structural errors come back as CenaError with the full problem list', async () => {
    const cena = structuredClone(valid)
    ;(node(cena, scene.ids.frame)['childIds'] as string[]).push('9:404')
    let error: unknown
    try {
      await cenaParaGrafo(cena, { carregarImagem: () => null })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(CenaError)
    expect((error as CenaError).codigo).toBe('cena-invalida')
    expect((error as CenaError).problemas.map((problema) => problema.codigo)).toEqual([
      'filho-inexistente'
    ])
    expect((error as CenaError).message).toContain('9:404')
  })

  test('warnings alone do not stop the load', async () => {
    const cena = structuredClone(valid)
    cena.instancias = []
    const loaded = await cenaParaGrafo(cena, { carregarImagem: () => scene.imageBytes })
    expect(loaded.grafo.nodes.size).toBe(scene.graph.nodes.size)
  })
})
