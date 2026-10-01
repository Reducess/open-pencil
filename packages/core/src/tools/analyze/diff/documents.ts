import type { SceneGraph } from '@open-pencil/scene-graph'

import type { TreeArgs } from '#core/rpc'

import { collectNodeTree, diffTrees } from './patch'

/** `page` limits the diff to one page by name; `depth` bounds each page tree (default: unlimited). */
export type DocumentDiffOptions = TreeArgs

export interface DocumentDiff {
  pages: {
    name: string
    status: 'added' | 'removed' | 'changed' | 'unchanged'
    diff: string | null
  }[]
  /** All page patches joined, or `null` when the documents match. */
  diff: string | null
}

type PageStatus = DocumentDiff['pages'][number]['status']

function pageStatus(before: boolean, after: boolean, diff: string | null): PageStatus {
  if (!before) return 'added'
  if (!after) return 'removed'
  return diff ? 'changed' : 'unchanged'
}

/**
 * Structural diff of two documents, page by page. Pages match by name and nodes by name path,
 * so two versions of a file compare even though their node IDs differ.
 */
export function diffDocuments(
  before: SceneGraph,
  after: SceneGraph,
  options: DocumentDiffOptions = {}
): DocumentDiff {
  const depth = options.depth ?? Number.POSITIVE_INFINITY
  const beforePages = new Map(before.getPages().map((page) => [page.name, page]))
  const afterPages = new Map(after.getPages().map((page) => [page.name, page]))
  const names = [...new Set([...beforePages.keys(), ...afterPages.keys()])].filter(
    (name) => options.page === undefined || name === options.page
  )

  const pages = names.map((name) => {
    const beforePage = beforePages.get(name)
    const afterPage = afterPages.get(name)
    const diff = diffTrees(
      beforePage ? collectNodeTree(before, beforePage.id, depth) : new Map(),
      afterPage ? collectNodeTree(after, afterPage.id, depth) : new Map()
    )
    return { name, status: pageStatus(Boolean(beforePage), Boolean(afterPage), diff), diff }
  })

  const patches = pages.flatMap((page) => (page.diff ? [page.diff] : []))
  return { pages, diff: patches.length > 0 ? patches.join('\n') : null }
}
