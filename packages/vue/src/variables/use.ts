import { ref, computed, watch } from 'vue'

import type { Variable, VariableCollection } from '@open-pencil/scene-graph'

import { useEditor } from '#vue/editor/context'
import { useSceneComputed } from '#vue/internal/scene-computed/use'
import { createVariableCollectionActions, createVariableValueActions } from '#vue/variables/helpers'

export function useVariables() {
  const editor = useEditor()
  const searchTerm = ref('')

  function setSearchTerm(term: string) {
    searchTerm.value = term
  }

  const collections = useSceneComputed(() => editor.getCollections())

  const activeCollectionId = ref(collections.value[0]?.id ?? '')
  watch(collections, (cols) => {
    if (!activeCollectionId.value && cols[0]) activeCollectionId.value = cols[0].id
  })

  // The editor mutates collections in place: hand out a fresh snapshot per scene version, or
  // whatever reads the name or the modes would never see a rename or a new mode.
  const activeCollection = useSceneComputed<VariableCollection | null>(() => {
    const collection = editor.getCollection(activeCollectionId.value)
    if (!collection) return null
    return {
      ...collection,
      modes: collection.modes.map((mode) => ({ ...mode })),
      variableIds: [...collection.variableIds]
    }
  })
  const activeModes = computed(() => activeCollection.value?.modes ?? [])

  const variables = useSceneComputed(() => {
    if (!activeCollectionId.value) return [] as Variable[]
    const all = editor.getVariablesForCollection(activeCollectionId.value)
    if (!searchTerm.value) return all
    const q = searchTerm.value.toLowerCase()
    return all.filter((v) => v.name.toLowerCase().includes(q))
  })

  const collectionActions = createVariableCollectionActions(editor, activeCollectionId)
  const variableActions = createVariableValueActions(editor, () => activeCollection.value)

  return {
    editor,
    collections,
    activeCollectionId,
    activeCollection,
    activeModes,
    variables,
    searchTerm,
    setSearchTerm,
    ...collectionActions,
    ...variableActions
  }
}
