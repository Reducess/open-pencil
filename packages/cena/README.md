# @open-pencil/cena

`mineer.design/v2` — the JSON persistence format of the Mineer design studio. An envelope around
the engine's `SceneGraph`: nodes are stored as the engine keeps them, stamped with the engine
version, and image bytes are replaced by references to the host's storage.

This package exists only in the Reducess fork. It is not published to npm; consumers take it from
a tarball (`bun pm pack`). It is a public workspace package only so that `bun run build:packages`
builds it.

```json
{
  "formato": "mineer.design/v2",
  "motor": { "nome": "open-pencil", "versao": "0.15.1" },
  "raiz": "0:0",
  "nos": [["0:1", { "id": "0:1", "type": "CANVAS", "...": "SceneNode as the engine keeps it" }]],
  "variaveis": [],
  "colecoes": [],
  "modoAtivo": [],
  "instancias": [["0:11", ["0:13"]]],
  "espacoDeCor": "srgb",
  "imagens": { "<engine image hash>": { "arquivo": 123, "tipo": "image/png" } },
  "meta": {}
}
```

`bibliotecas` (`[libraryId, EnabledLibraryBinding][]`) is added only when the document links a
component library.

## API

```ts
import { cenaParaGrafo, grafoParaCena, migrarCena, validarCena } from '@open-pencil/cena'

// Save: bytes go to storage, the scene gets the reference.
const cena = await grafoParaCena(graph, {
  resolverArquivo: async ({ hash, bytes, tipo }) => ({ arquivo: await upload(bytes, tipo) }),
  imagensConhecidas // from the last load: unchanged images are not uploaded again
})
await save(JSON.stringify(cena))

// Load: never throws for a missing image, only for a structurally broken scene.
const { grafo, avisos, imagens } = await cenaParaGrafo(JSON.parse(text), {
  carregarImagem: ({ arquivo }) => download(arquivo)
})
```

| Export | What it does |
|---|---|
| `grafoParaCena(graph, options)` | Graph → scene. Async because the host stores image bytes. |
| `cenaParaGrafo(cena, options)` | Scene → `{ grafo, avisos, imagens }`. Migrates and validates first. |
| `validarCena(cena)` | Structural problems as a list (`codigo`, `gravidade`, `caminho`, `mensagem`). Never throws. |
| `cenaValida(problemas)` | `true` when no problem has `gravidade: 'erro'`. |
| `migrarCena(cena)` | Brings a stored scene to `MOTOR_VERSAO`. Unknown version → `CenaError`. |
| `CENA_FORMATO`, `MOTOR_NOME`, `MOTOR_VERSAO` | Format id and the engine version the nodes follow. |
| `CenaError` | Every failure: `codigo` is `cena-invalida`, `formato-desconhecido`, `motor-desconhecido`, `imagem-sem-arquivo` or `valor-nao-serializavel`. |

## Rules

**Images.** `graph.images` never reaches the JSON. Each hash a node references is handed to
`resolverArquivo`, which returns the storage id. Returning nothing throws `imagem-sem-arquivo`:
a scene is never written with an unmapped image. Images no node uses any more (the graph keeps
them for undo) are skipped. On load, an image that cannot be fetched — or that `imagens` does not
map — leaves the document usable: the node keeps its `imageHash`, the fill simply does not paint
(or paints `imagemSubstituta`), and an `imagem-ausente` warning names the nodes. Pass the returned
`imagens` back as `imagensConhecidas` on the next save so the reference survives.

**JSON safety.** `JSON.parse(JSON.stringify(cena))` is deeply equal to `cena`. Values JSON cannot
carry become `{ "$cena": kind }` markers (`src/json-safe.ts`):

| In the engine | Where | Stored as |
|---|---|---|
| `Uint8Array` | `fillGeometry[].commandsBlob`, `strokeGeometry[].commandsBlob`, `derivedTextGlyphs[].commandsBlob`, anything inside `source.fig.rawNodeFields` | `{ "$cena": "u8", "v": base64 }` |
| `Map` | `instanceOverrides.self`, `instanceOverrides.descendants` (and its inner maps) | `{ "$cena": "map", "v": [[k, v]] }` |
| `undefined` as a value | override values, free-form `.fig` source fields | `{ "$cena": "undef" }` |
| `NaN`, `±Infinity`, `-0` | any number (`rotation: -0` is common) | `{ "$cena": "num", "v": "-0" }` |
| `bigint`, `Set`, other typed arrays, `ArrayBuffer` | free-form `.fig` source fields | `big`, `set`, `ta`, `ab` markers |
| Functions, symbols, class instances | — | refused with `valor-nao-serializavel` and the path |

`SceneNode.textPicture` is the one field dropped (stored as `null`): it is a Skia snapshot the
renderer replays only while the node's font cannot be loaded, and the engine itself discards it
when the font resolves. With the font available the paragraph is laid out again from the node —
`tests/node-fields.test.ts` renders both ways and compares the bytes. Pass
`manterTextPicture: true` to keep it (base64) when documents must survive without their fonts.

Not stored because they are derived or `.fig`-only: the graph's absolute-position cache and
event emitter, `figKiwiVersion`, `figSchemaDeflated` and the lazy `.fig` import context.

**Lazy `.fig` imports.** A graph imported with `populate: 'first-page'` holds unpopulated pages.
`grafoParaCena` calls `populateAllLazyFigImportRoots` first, so the scene always carries the full
document and the loaded graph is a plain one. This mutates the caller's graph exactly as opening
every page in the editor would.

**Instance index.** `graph.instanceIndex` is stored in `instancias` and restored as stored. It is
not rebuilt from the nodes: the engine itself has two different rebuild rules (INSTANCE nodes only
when creating nodes; any node with a `componentId` when loading a library), so a rebuild could not
be shown to match in every case. `validarCena` reports entries that disagree with the nodes as
warnings.

**Libraries.** `graph.enabledLibraries` is not needed to render — library components are
materialized into the document — but dropping it would unlink the document from its library
revision, so it is kept in `bibliotecas`.

**Engine upgrades.** Nodes are stored in the engine's own layout, so a scene is only readable by
the engine version it names, or through a migration. To upgrade: bump `MOTOR_VERSAO`, add the step
to `MIGRACOES` in `src/migrate.ts` (an identity step still records that the node layout was
checked), and add a fixture of the old version. A test pins `MOTOR_VERSAO` to
`@open-pencil/core`'s version, so the bump cannot be forgotten.

## Tests

```bash
bun test packages/cena/tests          # from the repository root
bun tools/unit-tests/src/run.ts cena  # same, through the shard runner
```

The round-trip test builds a rich scene (auto-layout frame, wrapped text with style runs,
gradient, shadow, group, pen vector, component + instance with overrides, colour variable with
two modes, image fill), sends it through `JSON.stringify`/`JSON.parse`, and requires the restored
graph to deep-equal the original and to render a **byte-identical PNG** headlessly.
