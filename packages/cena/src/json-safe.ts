import { CenaError } from './errors'
import type { JSONValor } from './types'

/**
 * Lossless JSON encoding of engine values.
 *
 * Anything JSON cannot carry becomes `{ "$cena": <kind>, ... }`:
 *
 * | value                         | encoded as                                   |
 * |-------------------------------|----------------------------------------------|
 * | `Uint8Array`                  | `{ "$cena": "u8", "v": "<base64>" }`         |
 * | other typed array / DataView  | `{ "$cena": "ta", "t": "<ctor>", "v": b64 }` |
 * | `ArrayBuffer`                 | `{ "$cena": "ab", "v": "<base64>" }`         |
 * | `Map`                         | `{ "$cena": "map", "v": [[k, v], ...] }`     |
 * | `Set`                         | `{ "$cena": "set", "v": [...] }`             |
 * | `NaN`, `±Infinity`, `-0`      | `{ "$cena": "num", "v": "NaN" }`             |
 * | `undefined` (property / slot) | `{ "$cena": "undef" }`                       |
 * | `bigint`                      | `{ "$cena": "big", "v": "123" }`             |
 * | object that owns a `$cena` key| `{ "$cena": "obj", "v": { ... } }`           |
 *
 * Functions, symbols and class instances are refused: silently dropping them is how documents rot.
 */
export const MARCADOR = '$cena'

const TYPED_ARRAYS = {
  Int8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
  DataView
} as const

type TypedArrayName = keyof typeof TYPED_ARRAYS

const BASE64_CHUNK = 0x8000

export function bytesParaBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK))
  }
  return btoa(binary)
}

export function base64ParaBytes(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

function viewBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
}

function refuse(path: string, what: string): never {
  throw new CenaError(
    'valor-nao-serializavel',
    `Cannot store ${what} at "${path}": the scene format only carries data`
  )
}

/** Plain assignment to `__proto__` would swap the prototype instead of creating the key. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true })
  } else {
    target[key] = value
  }
}

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function encodeNumber(value: number): JSONValor {
  if (Number.isNaN(value)) return { [MARCADOR]: 'num', v: 'NaN' }
  if (value === Infinity) return { [MARCADOR]: 'num', v: 'Infinity' }
  if (value === -Infinity) return { [MARCADOR]: 'num', v: '-Infinity' }
  if (Object.is(value, -0)) return { [MARCADOR]: 'num', v: '-0' }
  return value
}

function encodeBinary(value: ArrayBufferView | ArrayBuffer, path: string): JSONValor {
  if (value instanceof ArrayBuffer) {
    return { [MARCADOR]: 'ab', v: bytesParaBase64(new Uint8Array(value)) }
  }
  // Buffer and friends are Uint8Array subclasses; they come back as plain Uint8Array.
  if (value instanceof Uint8Array) return { [MARCADOR]: 'u8', v: bytesParaBase64(value) }
  const name = (Object.keys(TYPED_ARRAYS) as TypedArrayName[]).find(
    (candidate) => value instanceof TYPED_ARRAYS[candidate]
  )
  if (!name) refuse(path, 'a binary view of an unknown kind')
  return { [MARCADOR]: 'ta', t: name, v: bytesParaBase64(viewBytes(value)) }
}

/** Encodes one engine value into plain JSON. `path` only feeds error messages. */
export function codificarValor(value: unknown, path = ''): JSONValor {
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value
    case 'number':
      return encodeNumber(value)
    case 'undefined':
      return { [MARCADOR]: 'undef' }
    case 'bigint':
      return { [MARCADOR]: 'big', v: value.toString() }
    case 'function':
      return refuse(path, 'a function')
    case 'symbol':
      return refuse(path, 'a symbol')
    default:
      break
  }
  if (value === null) return null
  const object = value as object
  if (Array.isArray(object)) {
    // Array.from visits holes, which `map` would skip and JSON would turn into null.
    return Array.from(object, (item, index) => codificarValor(item, `${path}/${index}`))
  }
  if (ArrayBuffer.isView(object) || object instanceof ArrayBuffer) {
    return encodeBinary(object, path)
  }
  if (object instanceof Map) {
    return {
      [MARCADOR]: 'map',
      v: Array.from(object, ([key, item], index) => [
        codificarValor(key, `${path}/${index}/0`),
        codificarValor(item, `${path}/${index}/1`)
      ])
    }
  }
  if (object instanceof Set) {
    return {
      [MARCADOR]: 'set',
      v: Array.from(object, (item, index) => codificarValor(item, `${path}/${index}`))
    }
  }
  if (!isPlainObject(object)) {
    return refuse(path, `an instance of ${object.constructor.name || 'an unnamed class'}`)
  }
  const encoded: { [key: string]: JSONValor } = {}
  for (const [key, item] of Object.entries(object)) {
    setOwn(encoded, key, codificarValor(item, `${path}/${key}`))
  }
  return Object.hasOwn(encoded, MARCADOR) ? { [MARCADOR]: 'obj', v: encoded } : encoded
}

function invalid(path: string, detail: string): never {
  throw new CenaError('cena-invalida', `Malformed "${MARCADOR}" marker at "${path}": ${detail}`)
}

function markerText(marker: { [key: string]: JSONValor }, path: string): string {
  const text = marker['v']
  if (typeof text !== 'string') invalid(path, 'expected a string payload')
  return text
}

function markerList(marker: { [key: string]: JSONValor }, path: string): JSONValor[] {
  const list = marker['v']
  if (!Array.isArray(list)) invalid(path, 'expected an array payload')
  return list
}

function decodeNumber(text: string, path: string): number {
  switch (text) {
    case 'NaN':
      return Number.NaN
    case 'Infinity':
      return Infinity
    case '-Infinity':
      return -Infinity
    case '-0':
      return -0
    default:
      return invalid(path, `unknown number "${text}"`)
  }
}

function decodeTypedArray(marker: { [key: string]: JSONValor }, path: string): unknown {
  const name = marker['t']
  if (typeof name !== 'string' || !(name in TYPED_ARRAYS)) invalid(path, 'unknown typed array')
  const bytes = base64ParaBytes(markerText(marker, path))
  const constructor = TYPED_ARRAYS[name as TypedArrayName]
  if (constructor === DataView) return new DataView(bytes.buffer)
  const elementSize = (constructor as typeof Float32Array).BYTES_PER_ELEMENT
  if (bytes.byteLength % elementSize !== 0) invalid(path, 'byte length does not fit the type')
  return new (constructor as typeof Float32Array)(bytes.buffer, 0, bytes.byteLength / elementSize)
}

function decodeMarker(marker: { [key: string]: JSONValor }, path: string): unknown {
  switch (marker[MARCADOR]) {
    case 'u8':
      return base64ParaBytes(markerText(marker, path))
    case 'ab':
      return base64ParaBytes(markerText(marker, path)).buffer
    case 'ta':
      return decodeTypedArray(marker, path)
    case 'map':
      return new Map(
        markerList(marker, path).map((entry, index) => {
          if (!Array.isArray(entry) || entry.length !== 2) invalid(path, 'expected [key, value]')
          return [
            decodificarValor(entry[0], `${path}/${index}/0`),
            decodificarValor(entry[1], `${path}/${index}/1`)
          ]
        })
      )
    case 'set':
      return new Set(
        markerList(marker, path).map((item, index) => decodificarValor(item, `${path}/${index}`))
      )
    case 'num':
      return decodeNumber(markerText(marker, path), path)
    case 'undef':
      return undefined
    case 'big':
      return BigInt(markerText(marker, path))
    case 'obj': {
      const inner = marker['v']
      if (inner === null || typeof inner !== 'object' || Array.isArray(inner)) {
        invalid(path, 'expected an object payload')
      }
      return decodeObject(inner, path)
    }
    default:
      return invalid(path, `unknown kind ${JSON.stringify(marker[MARCADOR])}`)
  }
}

function decodeObject(object: { [key: string]: JSONValor }, path: string): Record<string, unknown> {
  const decoded: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(object)) {
    setOwn(decoded, key, decodificarValor(item, `${path}/${key}`))
  }
  return decoded
}

/** Inverse of `codificarValor`. Always returns fresh objects, never aliases of the input. */
export function decodificarValor(value: JSONValor, path = ''): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return value.map((item, index) => decodificarValor(item, `${path}/${index}`))
  }
  return Object.hasOwn(value, MARCADOR) ? decodeMarker(value, path) : decodeObject(value, path)
}
