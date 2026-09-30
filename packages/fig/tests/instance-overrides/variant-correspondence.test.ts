import { expect, test } from 'bun:test'

import { guid } from '#fig-tests/helpers/guid'
import { interpretInstance } from '#fig/instance-overrides/interpret'

import type { NodeChange } from '@open-pencil/kiwi/fig/codec'

const set = guid(1)
const soft = guid(2)
const softLabel = guid(3)
const solid = guid(4)
const solidLabel = guid(5)
const placed = guid(6)

/**
 * A component set whose two variants hold the same layer, each with its own identity, and
 * an instance of the second carrying an override written against the first.
 */
function fixture(path: readonly ReturnType<typeof guid>[]): NodeChange[] {
  return [
    { guid: set, type: 'FRAME', isStateGroup: true },
    { guid: soft, type: 'SYMBOL', name: 'Type=Soft', parentIndex: { guid: set, position: '!' } },
    {
      guid: softLabel,
      type: 'TEXT',
      name: 'Label',
      parentIndex: { guid: soft, position: '!' },
      textData: { characters: 'Soft' }
    },
    { guid: solid, type: 'SYMBOL', name: 'Type=Solid', parentIndex: { guid: set, position: '"' } },
    {
      guid: solidLabel,
      type: 'TEXT',
      name: 'Label',
      parentIndex: { guid: solid, position: '!' },
      textData: { characters: 'Solid' }
    },
    {
      guid: placed,
      type: 'INSTANCE',
      symbolData: {
        symbolID: solid,
        symbolOverrides: [{ guidPath: { guids: path }, textData: { characters: 'Edited' } }]
      }
    }
  ] as NodeChange[]
}

test('an override written against a sibling variant addresses the corresponding layer', () => {
  const result = interpretInstance(fixture([softLabel]), '1:6')
  expect(result.children[0].sourceId).toBe('1:5')
  expect(result.children[0].properties.textData?.characters).toBe('Edited')
  expect(result.propertyClaims).toEqual([
    {
      declaredBy: '1:6',
      path: [solidLabel],
      properties: { textData: { characters: 'Edited' } }
    }
  ])
})

test('an override written against the expanded variant still addresses it directly', () => {
  const result = interpretInstance(fixture([solidLabel]), '1:6')
  expect(result.children[0].properties.textData?.characters).toBe('Edited')
})

test('a sibling variant that holds no such layer leaves the override unresolved', () => {
  const diagnostics: unknown[] = []
  const changes = fixture([guid(99)])
  interpretInstance(changes, '1:6', {
    onUnresolvedProperty: (diagnostic) => diagnostics.push(diagnostic)
  })
  expect(diagnostics).toHaveLength(1)
})
