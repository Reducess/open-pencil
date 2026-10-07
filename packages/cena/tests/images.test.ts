import { describe, expect, test } from 'bun:test'

import { cenaParaGrafo, CenaError, grafoParaCena, tipoDeImagem, validarCena } from '../src'

import { renderPNG, sha256 } from './helpers/render'
import { buildRichScene, checkerPNG } from './helpers/rich-scene'
import { FakeStorage, load, save, throughJSON } from './helpers/scene-io'

async function caught(run: () => Promise<unknown>): Promise<CenaError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof CenaError) return error
    throw error
  }
  throw new Error('Expected CenaError')
}

describe('saving images', () => {
  test('an image the host does not map is an explicit error', async () => {
    const { graph, imageHash } = buildRichScene()
    for (const answer of [null, undefined, 0, -3, 1.5, { arquivo: Number.NaN }]) {
      const error = await caught(() =>
        grafoParaCena(graph, { resolverArquivo: () => answer as never })
      )
      expect(error.codigo).toBe('imagem-sem-arquivo')
      expect(error.message).toContain(imageHash)
    }
  })

  test('a failing upload propagates instead of producing a scene', async () => {
    const { graph } = buildRichScene()
    const upload = grafoParaCena(graph, {
      resolverArquivo: () => Promise.reject(new Error('storage offline'))
    })
    await expect(upload).rejects.toThrow('storage offline')
  })

  test('the host sees the hash, the bytes and the sniffed type, once per image', async () => {
    const { graph, imageHash, imageBytes, ids } = buildRichScene()
    // A second node using the same image must not trigger a second upload.
    graph.updateNode(ids.band, { fills: graph.getNode(ids.photo)?.fills })
    const calls: unknown[] = []
    const cena = await grafoParaCena(graph, {
      resolverArquivo: (imagem) => {
        calls.push(imagem)
        return { arquivo: 7 }
      }
    })
    expect(calls).toEqual([{ hash: imageHash, bytes: imageBytes, tipo: 'image/png' }])
    expect(cena.imagens).toEqual({ [imageHash]: { arquivo: 7, tipo: 'image/png' } })
  })

  test('the host may override the type; an async resolver is awaited', async () => {
    const { graph, imageHash } = buildRichScene()
    const cena = await grafoParaCena(graph, {
      resolverArquivo: async () => {
        await Bun.sleep(1)
        return { arquivo: 9, tipo: 'image/webp' }
      }
    })
    expect(cena.imagens[imageHash]).toEqual({ arquivo: 9, tipo: 'image/webp' })
  })

  test('images no node uses any more are neither uploaded nor written', async () => {
    const { graph, imageHash } = buildRichScene()
    graph.images.set('orphan', checkerPNG(8, 1))
    const storage = new FakeStorage()
    const cena = await save(graph, storage)
    expect(Object.keys(cena.imagens)).toEqual([imageHash])
    expect(storage.uploads).toBe(1)
  })

  test('images inside style runs and instance overrides are found too', async () => {
    const { graph, ids } = buildRichScene()
    const imageFill = (hash: string) => ({
      type: 'IMAGE' as const,
      color: { r: 0, g: 0, b: 0, a: 1 },
      opacity: 1,
      visible: true,
      imageHash: hash
    })
    graph.images.set('run-image', checkerPNG(8, 1))
    graph.images.set('override-image', checkerPNG(8, 2))
    graph.updateNode(ids.title, {
      styleRuns: [{ start: 0, length: 3, style: { fills: [imageFill('run-image')] } }]
    })
    graph.getNode(ids.instance)?.instanceOverrides.self.set('fills', [imageFill('override-image')])

    const cena = await save(graph, new FakeStorage())
    expect(Object.keys(cena.imagens).sort()).toContain('run-image')
    expect(Object.keys(cena.imagens)).toContain('override-image')
    expect(validarCena(cena)).toEqual([])
  })

  test('known references are written as they are and never reach the host', async () => {
    const { graph, imageHash } = buildRichScene()
    let calls = 0
    const cena = await grafoParaCena(graph, {
      imagensConhecidas: { [imageHash]: { arquivo: 55, tipo: 'image/png' } },
      resolverArquivo: () => {
        calls++
        return 1
      }
    })
    expect(calls).toBe(0)
    expect(cena.imagens).toEqual({ [imageHash]: { arquivo: 55, tipo: 'image/png' } })
  })

  test('a referenced hash without bytes is offered to the host with bytes: null', async () => {
    const { graph, imageHash } = buildRichScene()
    graph.images.delete(imageHash)
    const error = await caught(() => save(graph, new FakeStorage()))
    expect(error.codigo).toBe('imagem-sem-arquivo')

    const cena = await grafoParaCena(graph, {
      resolverArquivo: ({ bytes, tipo }) => (bytes === null && tipo ? { arquivo: 3, tipo: 'image/png' } : null)
    })
    expect(cena.imagens[imageHash]).toEqual({ arquivo: 3, tipo: 'image/png' })
  })
})

describe('loading images', () => {
  test('an image that cannot be loaded leaves a warning, not a broken document', async () => {
    const scene = buildRichScene()
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))

    for (const carregarImagem of [
      () => null,
      () => new Uint8Array(),
      () => Promise.reject(new Error('403 from storage'))
    ]) {
      const loaded = await cenaParaGrafo(cena, { carregarImagem })
      expect(loaded.avisos).toHaveLength(1)
      expect(loaded.avisos[0]).toMatchObject({
        codigo: 'imagem-ausente',
        hash: scene.imageHash,
        arquivo: 100,
        nos: [scene.ids.photo]
      })
      expect(loaded.grafo.nodes.size).toBe(scene.graph.nodes.size)
      expect(loaded.grafo.images.has(scene.imageHash)).toBe(false)
      // The node still points at the image, so a later load can bring it back.
      expect(loaded.grafo.getNode(scene.ids.photo)?.fills[0].imageHash).toBe(scene.imageHash)
    }
    const failed = await cenaParaGrafo(cena, {
      carregarImagem: () => Promise.reject(new Error('403 from storage'))
    })
    expect(failed.avisos[0].mensagem).toContain('403 from storage')
  })

  test('the document still renders without the image, and differently from the original', async () => {
    const scene = buildRichScene()
    const original = await renderPNG(scene.graph, scene.pageId, [scene.ids.frame])
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))

    const loaded = await cenaParaGrafo(cena, { carregarImagem: () => null })
    const withoutImage = await renderPNG(loaded.grafo, scene.pageId, [scene.ids.frame])
    // Control for the round-trip test: the hash comparison does see the image.
    expect(sha256(withoutImage)).not.toBe(sha256(original))

    const substitute = checkerPNG(8, 1)
    const withSubstitute = await cenaParaGrafo(cena, {
      carregarImagem: () => null,
      imagemSubstituta: substitute
    })
    expect(withSubstitute.avisos).toHaveLength(1)
    expect(withSubstitute.grafo.images.get(scene.imageHash)).toBe(substitute)
    const placeholder = await renderPNG(withSubstitute.grafo, scene.pageId, [scene.ids.frame])
    expect(sha256(placeholder)).not.toBe(sha256(withoutImage))
    expect(sha256(placeholder)).not.toBe(sha256(original))
  })

  test('saving after a failed load keeps the original reference and uploads nothing', async () => {
    const scene = buildRichScene()
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))
    const loaded = await cenaParaGrafo(cena, {
      carregarImagem: () => null,
      imagemSubstituta: checkerPNG(8, 1)
    })

    const again = await save(loaded.grafo, storage, loaded.imagens)
    expect(again.imagens).toEqual(cena.imagens)
    expect(storage.uploads).toBe(1)
    expect(loaded.imagens).toEqual(cena.imagens)
    expect(loaded.imagens).not.toBe(cena.imagens)
  })

  test('a hash the scene does not map opens with a warning; the validator calls it an error', async () => {
    const scene = buildRichScene()
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))
    cena.imagens = {}

    expect(validarCena(cena).map((problema) => [problema.codigo, problema.gravidade])).toEqual([
      ['imagem-sem-arquivo', 'erro']
    ])
    let requested = 0
    const loaded = await cenaParaGrafo(cena, {
      carregarImagem: () => {
        requested++
        return null
      }
    })
    expect(requested).toBe(0)
    expect(loaded.avisos).toEqual([
      expect.objectContaining({ codigo: 'imagem-ausente', hash: scene.imageHash, arquivo: null })
    ])
  })

  test('each stored reference is requested once, with its hash, id and type', async () => {
    const scene = buildRichScene()
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))
    cena.imagens['unused'] = { arquivo: 999, tipo: 'image/png' }
    const requests: unknown[] = []
    await cenaParaGrafo(cena, {
      carregarImagem: (imagem) => {
        requests.push(imagem)
        return storage.get(imagem.arquivo)
      }
    })
    expect(requests).toEqual([{ hash: scene.imageHash, arquivo: 100, tipo: 'image/png' }])
  })

  test('loading does not keep references into the stored scene', async () => {
    const scene = buildRichScene()
    const storage = new FakeStorage()
    const cena = throughJSON(await save(scene.graph, storage))
    const snapshot = JSON.stringify(cena)

    const { grafo } = await load(cena, storage)
    grafo.updateNode(scene.ids.band, { name: 'Renamed', fills: [] })
    grafo.getNode(scene.ids.frame)?.childIds.pop()
    expect(JSON.stringify(cena)).toBe(snapshot)
  })
})

describe('image type sniffing', () => {
  test.each([
    ['image/png', checkerPNG(4)],
    ['image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])],
    ['image/gif', new TextEncoder().encode('GIF89a....')],
    ['image/webp', new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')],
    ['image/avif', new TextEncoder().encode('\0\0\0\u001cftypavif')],
    ['image/svg+xml', new TextEncoder().encode('  <svg xmlns="http://www.w3.org/2000/svg"/>')],
    ['image/svg+xml', new TextEncoder().encode('<?xml version="1.0"?><svg/>')],
    ['application/octet-stream', new Uint8Array([1, 2, 3])],
    ['application/octet-stream', new Uint8Array()]
  ])('%s', (tipo, bytes) => {
    expect(tipoDeImagem(bytes)).toBe(tipo)
  })
})
