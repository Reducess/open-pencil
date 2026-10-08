/**
 * Prints the defaults table of the engine in this checkout, in the layout of `src/padroes/*.ts`.
 *
 *   bun packages/cena/scripts/gerar-padroes.ts <table id> > packages/cena/src/padroes/<id>.ts
 *
 * A table is written ONCE, when its id is introduced. Never regenerate an existing file: scenes
 * stamped with that id are expanded with exactly the values it holds.
 */
import { createDefaultNode } from '@open-pencil/scene-graph/node-defaults'
import type { NodeType } from '@open-pencil/scene-graph'

import { CAMPOS_SEMPRE_GRAVADOS, jsonIgual } from '../src/defaults'
import { codificarValor } from '../src/json-safe'
import type { JSONObjeto, JSONValor } from '../src/types'

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

function padroesDoTipo(tipo: NodeType): JSONObjeto {
  const codificado = codificarValor(createDefaultNode(() => 'x', tipo)) as JSONObjeto
  for (const campo of CAMPOS_SEMPRE_GRAVADOS) delete codificado[campo]
  return codificado
}

const id = process.argv[2]
if (!id) throw new Error('Usage: gerar-padroes.ts <table id>')

const campos = padroesDoTipo('FRAME')
const porTipo: Record<string, Record<string, JSONValor>> = {}
for (const tipo of TIPOS) {
  const doTipo = padroesDoTipo(tipo)
  if (Object.keys(doTipo).join() !== Object.keys(campos).join()) {
    throw new Error(`${tipo} does not have the same fields as FRAME; the table layout needs a rethink`)
  }
  const diferentes = Object.entries(doTipo).filter(([campo, valor]) => !jsonIgual(valor, campos[campo]))
  if (diferentes.length > 0) porTipo[tipo] = Object.fromEntries(diferentes)
}

const nome = `PADROES_${id.replace(/\W/g, '_')}`
process.stdout.write(`import type { TabelaDePadroes } from '../defaults'

/**
 * Engine defaults of table "${id}", as \`createDefaultNode\` returned them when it was written
 * (values in the scene's JSON encoding). FROZEN: scenes stamped with this id are expanded with
 * exactly these values. If the engine's defaults change, add a new table; never edit this one.
 */
export const ${nome}: TabelaDePadroes = ${JSON.stringify({ id, campos, porTipo }, null, 2)}
`)
