import { describe, expect, test } from 'bun:test'

import type { SceneGraph } from '@open-pencil/scene-graph'

import { CENA_FORMATO, MOTOR_VERSAO, validarCena } from '../src'
import { bytesParaBase64 } from '../src/json-safe'

import { renderPNG, sha256 } from './helpers/render'
import { buildRichScene } from './helpers/rich-scene'
import { assertPlainJSON, FakeStorage, load, save, throughJSON } from './helpers/scene-io'

function expectSameGraph(actual: SceneGraph, expected: SceneGraph): void {
  expect(actual.rootId).toBe(expected.rootId)
  expect([...actual.nodes.keys()]).toEqual([...expected.nodes.keys()])
  for (const [id, node] of expected.nodes) {
    // Strict: an own `undefined` property and a missing one must not compare equal.
    expect(actual.nodes.get(id)).toStrictEqual(node)
  }
  expect(actual.variables).toStrictEqual(expected.variables)
  expect(actual.variableCollections).toStrictEqual(expected.variableCollections)
  expect(actual.activeMode).toStrictEqual(expected.activeMode)
  expect(actual.instanceIndex).toStrictEqual(expected.instanceIndex)
  expect(actual.enabledLibraries).toStrictEqual(expected.enabledLibraries)
  expect(actual.documentColorSpace).toBe(expected.documentColorSpace)
  expect(actual.images).toStrictEqual(expected.images)
}

describe('rich scene round trip', () => {
  test('graph → cena → JSON text → cena → graph renders the same PNG, byte for byte', async () => {
    const scene = buildRichScene()
    const { graph, pageId, ids } = scene
    const original = await renderPNG(graph, pageId, [ids.frame])

    // The scene really is the rich one: wrapped title, instance override, dark mode, image.
    expect(graph.getNode(ids.title)?.height).toBeGreaterThan(90)
    expect(graph.getNode(ids.instanceLabel)?.text).toBe('Aproveitar')
    expect(graph.resolveColorVariableForNode(ids.themed, scene.variableId)).toEqual({
      r: 0.1,
      g: 0.8,
      b: 0.9,
      a: 1
    })

    const storage = new FakeStorage()
    const cena = await save(graph, storage)
    expect(cena.formato).toBe(CENA_FORMATO)
    expect(cena.motor).toEqual({ nome: 'open-pencil', versao: MOTOR_VERSAO })
    expect(validarCena(cena)).toEqual([])

    assertPlainJSON(cena)
    const text = JSON.stringify(cena)
    const parsed: unknown = JSON.parse(text)
    expect(parsed).toStrictEqual(cena)

    const loaded = await load(parsed, storage)
    expect(loaded.avisos).toEqual([])
    expectSameGraph(loaded.grafo, graph)

    const restored = await renderPNG(loaded.grafo, pageId, [ids.frame])
    expect(sha256(restored)).toBe(sha256(original))
    expect(restored.length).toBeGreaterThan(20_000)

    // Rendering lays the graph out; the restored graph must settle on the same layout.
    expectSameGraph(loaded.grafo, graph)
  })

  test('a scene saved before any layout pass renders like the original', async () => {
    const reference = buildRichScene()
    const expected = await renderPNG(reference.graph, reference.pageId, [reference.ids.frame])

    const scene = buildRichScene()
    const storage = new FakeStorage()
    const loaded = await load(throughJSON(await save(scene.graph, storage)), storage)
    const restored = await renderPNG(loaded.grafo, scene.pageId, [scene.ids.frame])

    expect(sha256(restored)).toBe(sha256(expected))
  })

  test('the component page renders the same too', async () => {
    const { graph, pageId, ids } = buildRichScene()
    const original = await renderPNG(graph, pageId, [ids.component, ids.frame], 2)
    const storage = new FakeStorage()
    const loaded = await load(throughJSON(await save(graph, storage)), storage)

    const restored = await renderPNG(loaded.grafo, pageId, [ids.component, ids.frame], 2)
    expect(sha256(restored)).toBe(sha256(original))
  })

  test('saving the restored graph again yields the same scene', async () => {
    const { graph } = buildRichScene()
    const storage = new FakeStorage()
    const first = await save(graph, storage)
    const loaded = await load(throughJSON(first), storage)

    const second = await save(loaded.grafo, storage, loaded.imagens)
    expect(second).toStrictEqual(first)
    expect(storage.uploads).toBe(1)
  })

  test('image bytes stay out of the JSON; only the storage reference is written', async () => {
    const { graph, imageHash, imageBytes } = buildRichScene()
    const storage = new FakeStorage()
    const cena = await save(graph, storage)

    expect(cena.imagens).toEqual({ [imageHash]: { arquivo: 100, tipo: 'image/png' } })
    expect(storage.get(100)).toEqual(imageBytes)
    const text = JSON.stringify(cena)
    expect(text).not.toContain(bytesParaBase64(imageBytes))
    expect(text).not.toContain('iVBORw0KGgo')
  })

  test('instance index and overrides come back as the engine structures', async () => {
    const { graph, ids } = buildRichScene()
    const storage = new FakeStorage()
    const loaded = await load(throughJSON(await save(graph, storage)), storage)

    expect(loaded.grafo.instanceIndex.get(ids.component)).toEqual(new Set([ids.instance]))
    expect(loaded.grafo.getInstances(ids.component).map((node) => node.id)).toEqual([ids.instance])
    const overrides = loaded.grafo.getNode(ids.instance)?.instanceOverrides
    expect(overrides?.self).toBeInstanceOf(Map)
    expect(overrides?.descendants.get(ids.instanceLabel)).toEqual(
      new Map([
        ['text', true],
        ['fills', true]
      ])
    )

    // The override survives a component edit after the reload, as it did before saving.
    const componentLabel = loaded.grafo.getChildren(ids.component)[0]
    loaded.grafo.updateNode(componentLabel.id, { text: 'Novo rótulo' })
    loaded.grafo.syncInstances(ids.component)
    expect(loaded.grafo.getNode(ids.instanceLabel)?.text).toBe('Aproveitar')
  })

  test('new nodes on a restored graph never reuse a stored id', async () => {
    const { graph, pageId } = buildRichScene()
    const storage = new FakeStorage()
    const loaded = await load(throughJSON(await save(graph, storage)), storage)
    const before = new Set(loaded.grafo.nodes.keys())

    const created = loaded.grafo.createNode('RECTANGLE', pageId, { width: 10, height: 10 })
    expect(before.has(created.id)).toBe(false)
  })
})
