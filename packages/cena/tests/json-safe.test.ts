import { describe, expect, test } from 'bun:test'

import { codificarValor, decodificarValor, CenaError } from '../src'

import { assertPlainJSON, throughJSON } from './helpers/scene-io'

function roundTrip(value: unknown): unknown {
  const encoded = codificarValor(value)
  assertPlainJSON(encoded)
  expect(throughJSON(encoded)).toStrictEqual(encoded)
  return decodificarValor(throughJSON(encoded))
}

describe('JSON-safe codec', () => {
  test('plain JSON passes through untouched', () => {
    const value = { a: [1, 'two', true, null, { b: 0.1 }], c: '' }
    expect(codificarValor(value)).toStrictEqual(value)
    expect(roundTrip(value)).toStrictEqual(value)
  })

  test.each([
    ['Uint8Array', new Uint8Array([0, 1, 254, 255])],
    ['empty Uint8Array', new Uint8Array()],
    ['Float32Array', new Float32Array([1.5, -2.25, 0])],
    ['Uint16Array', new Uint16Array([1, 65535])],
    ['Float64Array', new Float64Array([Math.PI])],
    ['BigInt64Array', new BigInt64Array([1n, -2n])],
    ['ArrayBuffer', new Uint8Array([9, 8, 7]).buffer],
    ['Map', new Map<unknown, unknown>([['a', 1], ['b', new Map([['c', undefined]])]])],
    ['Set', new Set([1, 'x', null])],
    ['NaN', Number.NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['negative zero', -0],
    ['bigint', 12345678901234567890n],
    ['undefined', undefined]
  ])('%s survives the JSON round trip', (_name, value) => {
    const restored = roundTrip(value)
    expect(restored).toStrictEqual(value)
    expect(Object.is(restored, value) || typeof value === 'object').toBe(true)
  })

  test('a large byte array is encoded in chunks without overflowing the stack', () => {
    const bytes = new Uint8Array(3_000_001)
    for (let index = 0; index < bytes.length; index += 4099) bytes[index] = index % 251
    expect(roundTrip(bytes)).toStrictEqual(bytes)
  })

  test('a view over part of a buffer keeps only its own bytes', () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6])
    const restored = roundTrip(backing.subarray(2, 4)) as Uint8Array
    expect(restored).toStrictEqual(new Uint8Array([3, 4]))
    expect(restored.buffer.byteLength).toBe(2)
  })

  test('undefined is kept apart from a missing key and from null', () => {
    const value = { present: undefined, list: [undefined, null, 1], nothing: null }
    const restored = roundTrip(value) as typeof value
    expect(restored).toStrictEqual(value)
    expect('present' in restored).toBe(true)
    expect(restored.list[0]).toBeUndefined()
    expect(restored.list[1]).toBeNull()
  })

  test('array holes become explicit undefined instead of null', () => {
    // eslint-disable-next-line no-sparse-arrays -- the hole is the case under test
    const restored = roundTrip([1, , 3]) as unknown[]
    expect(restored).toHaveLength(3)
    expect(restored[1]).toBeUndefined()
  })

  test('an object that owns a "$cena" key is escaped, not mistaken for a marker', () => {
    const value = { $cena: 'u8', v: 'not base64 at all', nested: { $cena: 1 } }
    expect(roundTrip(value)).toStrictEqual(value)
  })

  test('a "__proto__" key stays an own property and never changes the prototype', () => {
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "ok": 1}') as object
    const restored = decodificarValor(codificarValor(parsed)) as Record<string, unknown>
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype)
    expect(Object.hasOwn(restored, '__proto__')).toBe(true)
    expect(restored['polluted']).toBeUndefined()
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined()
  })

  test('decoding never aliases the encoded input', () => {
    const encoded = codificarValor({ list: [{ x: 1 }] }) as { list: Array<{ x: number }> }
    const decoded = decodificarValor(encoded) as { list: Array<{ x: number }> }
    decoded.list[0].x = 2
    expect(encoded.list[0].x).toBe(1)
  })

  test.each([
    ['a function', () => 1, /function/],
    ['a symbol', Symbol('s'), /symbol/],
    ['a class instance', new Date(0), /instance of Date/]
  ])('%s is refused with the path where it was found', (_name, value, message) => {
    let error: unknown
    try {
      codificarValor({ a: [value] }, 'nos/0:1')
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(CenaError)
    expect((error as CenaError).codigo).toBe('valor-nao-serializavel')
    expect((error as CenaError).message).toMatch(message)
    expect((error as CenaError).message).toContain('nos/0:1/a/0')
  })

  test.each([
    ['unknown kind', { $cena: 'nope' }],
    ['bytes without payload', { $cena: 'u8' }],
    ['unknown number', { $cena: 'num', v: '7' }],
    ['unknown typed array', { $cena: 'ta', t: 'Function', v: '' }],
    ['typed array with a ragged length', { $cena: 'ta', t: 'Float32Array', v: 'AAAA' }],
    ['map entry that is not a pair', { $cena: 'map', v: [['only-key']] }]
  ])('a malformed marker (%s) is an explicit error', (_name, marker) => {
    expect(() => decodificarValor({ nested: marker }, 'nos/0:1')).toThrow(CenaError)
    expect(() => decodificarValor({ nested: marker }, 'nos/0:1')).toThrow(/nos\/0:1\/nested/)
  })
})
