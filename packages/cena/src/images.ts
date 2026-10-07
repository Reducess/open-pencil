/**
 * Image hashes referenced anywhere inside one node: fills, style-run fills, text-decoration fills,
 * per-region geometry fills and the paint values stored inside instance overrides. The walk is
 * structural — any object carrying a string `imageHash` — so it holds for raw engine nodes and for
 * their JSON-encoded form alike, and keeps holding when the engine grows a new paint slot.
 */
export function coletarHashesDeImagem(value: unknown, found = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return found
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return found
  if (Array.isArray(value) || value instanceof Set) {
    for (const item of value) coletarHashesDeImagem(item, found)
    return found
  }
  if (value instanceof Map) {
    for (const item of value.values()) coletarHashesDeImagem(item, found)
    return found
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === 'imageHash' && typeof item === 'string' && item) found.add(item)
    else coletarHashesDeImagem(item, found)
  }
  return found
}

/** Hash → ids of the nodes that reference it, in document order. */
export function imagensReferenciadas(
  nodes: Iterable<readonly [string, unknown]>
): Map<string, string[]> {
  const references = new Map<string, string[]>()
  for (const [id, node] of nodes) {
    for (const hash of coletarHashesDeImagem(node)) {
      const ids = references.get(hash)
      if (ids) ids.push(id)
      else references.set(hash, [id])
    }
  }
  return references
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((byte, index) => bytes[offset + index] === byte)
}

function ascii(text: string): number[] {
  return Array.from(text, (character) => character.charCodeAt(0))
}

export const TIPO_DESCONHECIDO = 'application/octet-stream'

/** MIME type from the leading bytes. Only the raster formats the renderer can decode, plus SVG. */
export function tipoDeImagem(bytes: Uint8Array): string {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, ascii('GIF8'))) return 'image/gif'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  if (startsWith(bytes, ascii('ftypavif'), 4)) return 'image/avif'
  if (startsWith(bytes, ascii('BM'))) return 'image/bmp'
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart()
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
    return 'image/svg+xml'
  }
  return TIPO_DESCONHECIDO
}
