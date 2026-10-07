import {
  attachInstruction,
  extractInstruction,
  type ItemMode
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item'
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine'
import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { onScopeDispose, ref, watchEffect, type Ref } from 'vue'

import type { Editor } from '@open-pencil/core/editor'

import type { LayerDragInstruction } from '#vue/primitives/LayerTree/context'
import { applyLayerDrop } from '#vue/primitives/LayerTree/drop'

interface DragItem {
  id: string
  level: number
  hasChildren: boolean
  parentId: string | null
}

type TreeInstruction = LayerDragInstruction

export function useLayerDrag(
  editor: Editor,
  indentPerLevel = 16,
  onMakeChildDrop?: (targetId: string) => void,
  frontOnTop: () => boolean = () => false
) {
  const draggingId = ref<string | null>(null)
  const instruction = ref<TreeInstruction | null>(null)
  const instructionTargetId = ref<string | null>(null)

  function setupItem(el: Ref<HTMLElement | null>, item: () => DragItem) {
    watchEffect((onCleanup) => {
      const element = el.value
      if (!element) return

      const data = item()

      const isContainer = editor.graph.isContainer(data.id)
      const mode: ItemMode = data.hasChildren ? 'expanded' : 'standard'

      const cleanup = combine(
        draggable({
          element,
          getInitialData: () => ({ id: data.id }),
          onDragStart: () => {
            draggingId.value = data.id
          },
          onDrop: () => {
            draggingId.value = null
          }
        }),
        dropTargetForElements({
          element,
          getData: ({ input, element: el }) =>
            attachInstruction(
              { id: data.id },
              {
                input,
                element: el,
                indentPerLevel,
                currentLevel: data.level,
                mode,
                block: isContainer ? ['reparent'] : ['make-child', 'reparent']
              }
            ),
          canDrop: ({ source }) => source.data.id !== data.id,
          onDrag: ({ self }) => {
            const inst = extractInstruction(self.data)
            if (!inst || inst.type === 'instruction-blocked') {
              instruction.value = null
              instructionTargetId.value = null
              return
            }
            instruction.value = inst as TreeInstruction
            instructionTargetId.value = data.id
          },
          onDragLeave: () => {
            instruction.value = null
            instructionTargetId.value = null
          },
          onDrop: () => {
            instruction.value = null
            instructionTargetId.value = null
          },
          getIsSticky: () => true
        })
      )

      onCleanup(cleanup)
    })
  }

  const cleanupMonitor = monitorForElements({
    onDrop: ({ source, location }) => {
      const target = location.current.dropTargets.at(0)
      if (!target) return

      const sourceId = source.data.id as string
      const targetId = target.data.id as string
      const rawInstruction = extractInstruction(target.data)
      if (!rawInstruction || rawInstruction.type === 'instruction-blocked') return
      const nestedInto = applyLayerDrop(
        editor,
        sourceId,
        targetId,
        rawInstruction as TreeInstruction,
        frontOnTop()
      )
      if (nestedInto) onMakeChildDrop?.(nestedInto)

      draggingId.value = null
      instruction.value = null
      instructionTargetId.value = null
    }
  })
  onScopeDispose(cleanupMonitor)

  return {
    draggingId,
    instruction,
    instructionTargetId,
    setupItem
  }
}
