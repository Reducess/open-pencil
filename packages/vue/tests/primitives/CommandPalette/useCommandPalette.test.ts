import { describe, expect, test } from 'bun:test'

import { useCommandPalette } from '@open-pencil/vue'

const palette = () =>
  useCommandPalette({
    groups: [
      {
        id: 'pages',
        items: [
          { id: 'recent', label: 'Checkout' },
          { id: 'hidden', label: 'Settings archive', searchOnly: true }
        ]
      }
    ]
  })

const labels = (groups: ReturnType<typeof palette>['filteredGroups']['value']) =>
  groups.flatMap((group) => group.items.map((item) => item.label))

describe('search-only items', () => {
  test('stay out of the unfiltered list', () => {
    expect(labels(palette().filteredGroups.value)).toEqual(['Checkout'])
  })

  test('appear when the query matches them', () => {
    const { searchTerm, filteredGroups } = palette()
    searchTerm.value = 'archive'
    expect(labels(filteredGroups.value)).toEqual(['Settings archive'])
  })
})

describe('select', () => {
  test('opens children without running a command', () => {
    let ran = false
    const { select, filteredGroups, isNested } = useCommandPalette({
      groups: [
        {
          id: 'pages',
          items: [
            {
              id: 'go-to',
              label: 'Go to page',
              children: [{ id: 'page', label: 'Checkout', onSelect: () => (ran = true) }]
            }
          ]
        }
      ]
    })
    const [goTo] = filteredGroups.value[0]?.items ?? []
    expect(goTo && select(goTo)).toBe(false)
    expect(isNested.value).toBe(true)
    const [page] = filteredGroups.value[0]?.items ?? []
    expect(page && select(page)).toBe(true)
    expect(ran).toBe(true)
  })
})
