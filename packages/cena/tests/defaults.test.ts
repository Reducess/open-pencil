import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'

import { SceneGraph } from '@open-pencil/scene-graph'
import type { NodeType } from '@open-pencil/scene-graph'
import { createDefaultNode } from '@open-pencil/scene-graph/node-defaults'

import {
  cenaParaGrafo,
  CenaError,
  compactarNos,
  expandirCena,
  grafoParaCena,
  migrarCena,
  MOTOR_VERSAO,
  TABELA_DE_PADROES_ATUAL,
  TABELAS_DE_PADROES,
  validarCena
} from '../src'
import type { Cena, JSONObjeto, Migracao, TabelaDePadroes } from '../src'
import { CAMPOS_SEMPRE_GRAVADOS, expandirNo, lerCompactacao } from '../src/defaults'
import { codificarValor } from '../src/json-safe'

import { renderPNG, sha256 } from './helpers/render'
import { buildRichScene } from './helpers/rich-scene'
import { FakeStorage, load, save, throughJSON } from './helpers/scene-io'

const TIPOS: NodeType[] = [
  'CANVAS',
  'FRAME',
  'RECTANGLE',
  'ROUNDED_RECTANGLE',
  'ELLIPSE',
  'TEXT',
  'LINE',
  'STAR',
  'POLYGON',
  'VECTOR',
  'BOOLEAN_OPERATION',
  'GROUP',
  'SECTION',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'CONNECTOR',
  'SHAPE_WITH_TEXT'
]

async function saveFull(graph: SceneGraph, storage: FakeStorage): Promise<Cena> {
  return grafoParaCena(graph, {
    compactar: false,
    resolverArquivo: ({ bytes }) => (bytes ? storage.put(bytes) : null)
  })
}

function failure(run: () => unknown): CenaError {
  try {
    run()
  } catch (error) {
    if (error instanceof CenaError) return error
    throw error
  }
  throw new Error('Expected CenaError')
}

describe('defaults table', () => {
  test.each(TIPOS)('the current table holds what the engine creates for %s', (tipo) => {
    // Fails when a default changes in the engine. Do NOT edit the table: scenes already stamped
    // with it must keep reading the old value. Generate a new table (scripts/gerar-padroes.ts),
    // register it in TABELAS_DE_PADROES and make it TABELA_DE_PADROES_ATUAL.
    const doMotor = codificarValor(createDefaultNode(() => 'x', tipo)) as JSONObjeto
    const identidade = Object.fromEntries(CAMPOS_SEMPRE_GRAVADOS.map((campo) => [campo, doMotor[campo]]))
    expect(expandirNo(identidade, TABELA_DE_PADROES_ATUAL)).toStrictEqual(doMotor)
    expect(Object.keys(expandirNo(identidade, TABELA_DE_PADROES_ATUAL))).toEqual(Object.keys(doMotor))
  })

  test('table 0.15.1 is frozen: its content hash never changes', () => {
    const tabela = TABELAS_DE_PADROES['0.15.1']
    expect(tabela.id).toBe('0.15.1')
    expect(createHash('sha256').update(JSON.stringify(tabela)).digest('hex')).toBe(
      '901a8809315e3a7ed3ce9c3b9914dbb9234cbab2f2b84937fe10aae348ebfc67'
    )
  })

  test('the current table is registered under its own id', () => {
    expect(TABELAS_DE_PADROES[TABELA_DE_PADROES_ATUAL.id]).toBe(TABELA_DE_PADROES_ATUAL)
  })
})

describe('compact scenes', () => {
  test('fields at their default are left out; identity fields never are', async () => {
    const { graph, ids } = buildRichScene()
    const storage = new FakeStorage()
    const compacta = await save(graph, storage)
    const completa = await saveFull(graph, new FakeStorage())

    expect(compacta.compactacao).toEqual({ modo: 'padroes-omitidos', tabela: TABELA_DE_PADROES_ATUAL.id })
    expect(completa.compactacao).toBeUndefined()
    for (const [id, no] of compacta.nos) {
      expect(no['id']).toBe(id)
      expect(typeof no['type']).toBe('string')
      expect(typeof no['name']).toBe('string')
    }
    const titulo = compacta.nos.find(([id]) => id === ids.title)?.[1]
    expect(titulo && Object.hasOwn(titulo, 'childIds')).toBe(false)
    expect(titulo && Object.hasOwn(titulo, 'strokes')).toBe(false)
    expect(titulo?.['parentId']).toBe(ids.frame)

    const bytesCompacta = JSON.stringify(compacta).length
    const bytesCompleta = JSON.stringify(completa).length
    expect(bytesCompacta).toBeLessThan(bytesCompleta / 3)
    expect(expandirCena(compacta)).toStrictEqual(completa)
    expect(expandirCena(completa)).toBe(completa)
  })

  test('a scene stored with every field still opens, renders the same and is saved compact', async () => {
    const reference = buildRichScene()
    const expected = await renderPNG(reference.graph, reference.pageId, [reference.ids.frame])

    const scene = buildRichScene()
    const storage = new FakeStorage()
    const antiga = throughJSON(await saveFull(scene.graph, storage))
    expect(validarCena(antiga)).toEqual([])
    expect(migrarCena(antiga)).toBe(antiga)

    const aberta = await load(antiga, storage)
    for (const [id, node] of scene.graph.nodes) expect(aberta.grafo.nodes.get(id)).toStrictEqual(node)

    const regravada = throughJSON(await save(aberta.grafo, storage, aberta.imagens))
    expect(regravada.compactacao?.modo).toBe('padroes-omitidos')
    expect(regravada).toStrictEqual(throughJSON(await save(scene.graph, storage, aberta.imagens)))

    const reaberta = await load(regravada, storage)
    const restored = await renderPNG(reaberta.grafo, scene.pageId, [scene.ids.frame])
    expect(sha256(restored)).toBe(sha256(expected))
  })

  test('a node that lacks a field of the table is stored whole and comes back without it', async () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const legado = graph.createNode('RECTANGLE', pageId, { name: 'Legado', width: 10, height: 10 })
    const normal = graph.createNode('RECTANGLE', pageId, { name: 'Normal', width: 10, height: 10 })
    delete (legado as unknown as Record<string, unknown>)['textTruncation']

    const storage = new FakeStorage()
    const cena = throughJSON(await save(graph, storage))
    expect(cena.compactacao?.completos).toEqual([legado.id])
    expect(validarCena(cena)).toEqual([])

    const { grafo } = await load(cena, storage)
    expect(grafo.getNode(legado.id)).toStrictEqual(legado)
    expect(Object.hasOwn(grafo.getNode(legado.id) ?? {}, 'textTruncation')).toBe(false)
    expect(grafo.getNode(normal.id)).toStrictEqual(normal)
  })

  test('default values are never shared between nodes after loading', async () => {
    const graph = new SceneGraph()
    const pageId = graph.getPages()[0].id
    const a = graph.createNode('RECTANGLE', pageId, { width: 10, height: 10 })
    const b = graph.createNode('RECTANGLE', pageId, { width: 10, height: 10 })
    const storage = new FakeStorage()
    const { grafo } = await load(throughJSON(await save(graph, storage)), storage)

    const lidoA = grafo.getNode(a.id)
    const lidoB = grafo.getNode(b.id)
    expect(lidoA?.fills).not.toBe(lidoB?.fills)
    expect(lidoA?.instanceOverrides.self).not.toBe(lidoB?.instanceOverrides.self)
    expect(lidoA?.source.fig).not.toBe(lidoB?.source.fig)
    lidoA?.strokes.push({ color: { r: 0, g: 0, b: 0, a: 1 }, weight: 1, opacity: 1, visible: true, align: 'CENTER' })
    expect(lidoB?.strokes).toEqual([])
    expect(TABELA_DE_PADROES_ATUAL.campos['strokes']).toEqual([])
  })

  test('validarCena still finds structural problems in a compact scene', async () => {
    const { graph, ids } = buildRichScene()
    const cena = throughJSON(await save(graph, new FakeStorage()))
    const semTitulo = { ...cena, nos: cena.nos.filter(([id]) => id !== ids.title) }
    expect(validarCena(semTitulo).map((problema) => problema.codigo)).toContain('filho-inexistente')
  })

  test('an unknown compaction mode or table is refused, never guessed', async () => {
    const cena = throughJSON(await save(buildRichScene().graph, new FakeStorage()))
    const outroModo = { ...cena, compactacao: { modo: 'delta', tabela: '0.15.1' } }
    const outraTabela = { ...cena, compactacao: { modo: 'padroes-omitidos', tabela: '9.9.9' } }
    const semObjeto = { ...cena, compactacao: 'padroes-omitidos' }

    for (const invalida of [outroModo, outraTabela, semObjeto]) {
      expect(failure(() => migrarCena(invalida)).codigo).toBe('compactacao-desconhecida')
      expect(validarCena(invalida).map((problema) => problema.codigo)).toContain('compactacao-invalida')
      await expect(cenaParaGrafo(invalida, { carregarImagem: () => null })).rejects.toMatchObject({
        codigo: 'compactacao-desconhecida'
      })
    }
    expect(failure(() => migrarCena(outraTabela)).message).toContain('"9.9.9"')
  })
})

describe('defaults are fixed by the table the scene names', () => {
  // A later engine where a rectangle is born half transparent and text is born at 16 px.
  const FUTURA: TabelaDePadroes = {
    id: '0.16.0',
    campos: { ...TABELA_DE_PADROES_ATUAL.campos, opacity: 0.5, fontSize: 16 },
    porTipo: TABELA_DE_PADROES_ATUAL.porTipo
  }
  const TABELAS = { ...TABELAS_DE_PADROES, [FUTURA.id]: FUTURA }

  function cenaDeUmRetangulo(): { completo: JSONObjeto; id: string } {
    const graph = new SceneGraph()
    const node = graph.createNode('RECTANGLE', graph.getPages()[0].id, { width: 10, height: 10 })
    return { completo: codificarValor(node) as JSONObjeto, id: node.id }
  }

  test('a scene written with the old table reads the old default even when a newer table exists', () => {
    const { completo, id } = cenaDeUmRetangulo()
    const antiga = compactarNos([[id, completo]], TABELA_DE_PADROES_ATUAL)
    expect(Object.hasOwn(antiga.nos[0][1], 'opacity')).toBe(false)

    const carimbo = lerCompactacao({ compactacao: antiga.compactacao }, TABELAS)
    expect(carimbo?.tabela).toBe(TABELA_DE_PADROES_ATUAL)
    const lido = expandirNo(antiga.nos[0][1], carimbo?.tabela ?? FUTURA)
    expect(lido['opacity']).toBe(1)
    expect(lido['fontSize']).toBe(14)
    expect(lido).toStrictEqual(completo)
  })

  test('written with the newer table, a value equal only to the OLD default is stored', () => {
    const { completo, id } = cenaDeUmRetangulo()
    const nova = compactarNos([[id, completo]], FUTURA)
    expect(nova.compactacao.tabela).toBe('0.16.0')
    expect(nova.nos[0][1]['opacity']).toBe(1)
    expect(nova.nos[0][1]['fontSize']).toBe(14)
    expect(expandirNo(nova.nos[0][1], FUTURA)).toStrictEqual(completo)

    const meioTransparente = { ...completo, opacity: 0.5 }
    const omitida = compactarNos([[id, meioTransparente]], FUTURA)
    expect(Object.hasOwn(omitida.nos[0][1], 'opacity')).toBe(false)
    expect(expandirNo(omitida.nos[0][1], FUTURA)['opacity']).toBe(0.5)
  })

  test('expandirCena picks the table by the stamp', async () => {
    const cena = throughJSON(await save(buildRichScene().graph, new FakeStorage()))
    const comAAtual = expandirCena(cena, TABELAS)
    const fingindoFutura = expandirCena({ ...cena, compactacao: { modo: 'padroes-omitidos', tabela: '0.16.0' } }, TABELAS)
    const opacidades = (lida: Cena) => new Set(lida.nos.map(([, no]) => no['opacity']))
    expect(opacidades(comAAtual).has(0.5)).toBe(false)
    expect(opacidades(fingindoFutura).has(0.5)).toBe(true)
  })

  test('an engine migration receives the nodes expanded with the table of the old scene', async () => {
    const cena = throughJSON(await save(buildRichScene().graph, new FakeStorage()))
    const antiga: Cena = { ...cena, motor: { nome: 'open-pencil', versao: '0.14.0' } }
    let recebidos: Cena['nos'] = []
    const passos: Record<string, Migracao> = {
      '0.14.0': {
        para: MOTOR_VERSAO,
        migrar: (entrada) => {
          recebidos = entrada.nos
          return entrada
        }
      }
    }
    const migrada = migrarCena(antiga, passos)
    expect(recebidos).toStrictEqual(expandirCena(cena).nos)
    expect(recebidos.every(([, no]) => Object.hasOwn(no, 'opacity') && Object.hasOwn(no, 'childIds'))).toBe(true)
    expect(migrada.compactacao).toBeUndefined()
    expect(migrada.motor.versao).toBe(MOTOR_VERSAO)
  })
})
