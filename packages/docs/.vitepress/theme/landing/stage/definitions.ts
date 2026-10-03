import type { Component } from 'vue'

import AssetsPanel from '@/components/assets-panel/AssetsPanel.vue'
import CodePanel from '@/components/CodePanel.vue'
import DesignPanel from '@/components/DesignPanel.vue'
import LayerTree from '@/components/LayerTree/LayerTree.vue'

import type { StageKind } from './kinds'
import AiTranscriptPanel from './panels/AiTranscriptPanel.vue'
import SdkSnippetPanel from './panels/SdkSnippetPanel.vue'
import TerminalPanel from './panels/TerminalPanel.vue'
import { SCENES, type SceneBuilder } from './scenes'

export interface StageDefinition {
  scene: SceneBuilder
  panel?: Component
  /** Heading for panels the app nests under its own header. */
  panelTitle?: string
  toolbar?: boolean
}

export const STAGES: Record<StageKind, StageDefinition> = {
  hero: { scene: SCENES.announcement, toolbar: true },
  figma: { scene: SCENES.figma, panel: LayerTree, panelTitle: 'Layers' },
  design: { scene: SCENES.pricingSelected, panel: DesignPanel, toolbar: true },
  components: { scene: SCENES.components, panel: AssetsPanel },
  ai: { scene: SCENES.pricingWithGuarantees, panel: AiTranscriptPanel },
  code: { scene: SCENES.pricingSelected, panel: CodePanel },
  script: { scene: SCENES.pricing, panel: TerminalPanel },
  sdk: { scene: SCENES.pricing, panel: SdkSnippetPanel, toolbar: true }
}
