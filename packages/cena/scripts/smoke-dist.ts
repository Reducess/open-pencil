export {}

const { SceneGraph } = await import('@open-pencil/scene-graph')
const mod = await import('../dist/index.js')

if (mod.CENA_FORMATO !== 'mineer.design/v2' || typeof mod.MOTOR_VERSAO !== 'string') {
  throw new Error('Expected the built @open-pencil/cena package to export the format constants')
}

const graph = new SceneGraph()
const page = graph.getPages()[0]
graph.createNode('RECTANGLE', page.id, { width: 10, height: 20, rotation: -0 })

const cena = await mod.grafoParaCena(graph, { resolverArquivo: () => null })
const problems = mod.validarCena(cena)
if (problems.length > 0) {
  throw new Error(`Expected a valid scene from the built package: ${JSON.stringify(problems)}`)
}

const { grafo } = await mod.cenaParaGrafo(JSON.parse(JSON.stringify(cena)), {
  carregarImagem: () => null
})
if (grafo.nodes.size !== graph.nodes.size) {
  throw new Error('Expected the built @open-pencil/cena package to round-trip a graph')
}
