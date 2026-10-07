import { beforeAll, describe, expect, test } from 'bun:test'

import { cenaParaGrafo, CenaError, MIGRACOES, migrarCena, MOTOR_VERSAO } from '../src'
import type { Cena, Migracao } from '../src'

import { buildRichScene } from './helpers/rich-scene'
import { FakeStorage, save, throughJSON } from './helpers/scene-io'

let current: Cena

beforeAll(async () => {
  current = throughJSON(await save(buildRichScene().graph, new FakeStorage()))
})

function failure(run: () => unknown): CenaError {
  try {
    run()
  } catch (error) {
    if (error instanceof CenaError) return error
    throw error
  }
  throw new Error('Expected CenaError')
}

describe('migrarCena', () => {
  test('the current engine version is returned as it is', () => {
    expect(migrarCena(current)).toBe(current)
    expect(Object.keys(MIGRACOES)).toEqual([])
  })

  test.each(['0.14.0', '0.15.0', '0.16.0', '99.0.0', ''])(
    'engine version "%s" has no path and is refused by name',
    (versao) => {
      const error = failure(() => migrarCena({ ...current, motor: { nome: 'open-pencil', versao } }))
      expect(error.codigo).toBe('motor-desconhecido')
      expect(error.message).toContain(`"${versao}"`)
      expect(error.message).toContain(MOTOR_VERSAO)
    }
  )

  test('another engine, a missing engine and another format are refused', () => {
    expect(failure(() => migrarCena({ ...current, motor: { nome: 'figma', versao: MOTOR_VERSAO } })).codigo).toBe(
      'motor-desconhecido'
    )
    expect(failure(() => migrarCena({ ...current, motor: undefined })).codigo).toBe('motor-desconhecido')
    expect(failure(() => migrarCena({ ...current, motor: { nome: 'open-pencil', versao: 15 } })).codigo).toBe(
      'motor-desconhecido'
    )
    expect(failure(() => migrarCena({ ...current, formato: 'mineer.design/v1' })).codigo).toBe(
      'formato-desconhecido'
    )
    expect(failure(() => migrarCena(null)).codigo).toBe('cena-invalida')
    expect(failure(() => migrarCena([])).codigo).toBe('cena-invalida')
  })

  test('registered steps chain up to the current version and stamp it', () => {
    const steps: Record<string, Migracao> = {
      '0.13.0': { para: '0.14.0', migrar: (cena) => ({ ...cena, meta: { ...cena.meta, a: 1 } }) },
      '0.14.0': { para: MOTOR_VERSAO, migrar: (cena) => ({ ...cena, meta: { ...cena.meta, b: 2 } }) }
    }
    const old = { ...current, motor: { nome: 'open-pencil', versao: '0.13.0' } }
    const migrated = migrarCena(old, steps)
    expect(migrated.motor).toEqual({ nome: 'open-pencil', versao: MOTOR_VERSAO })
    expect(migrated.meta).toEqual({ a: 1, b: 2 })
    expect(old.motor.versao).toBe('0.13.0')
    expect(migrated.nos).toBe(current.nos)
  })

  test('steps that loop are refused instead of spinning', () => {
    const steps: Record<string, Migracao> = {
      '0.1.0': { para: '0.2.0', migrar: (cena) => cena },
      '0.2.0': { para: '0.1.0', migrar: (cena) => cena }
    }
    const error = failure(() => migrarCena({ ...current, motor: { nome: 'open-pencil', versao: '0.1.0' } }, steps))
    expect(error.codigo).toBe('motor-desconhecido')
  })

  test('cenaParaGrafo goes through the migration gate', async () => {
    const newer = { ...current, motor: { nome: 'open-pencil', versao: '0.16.0' } }
    const load = cenaParaGrafo(newer, { carregarImagem: () => null })
    await expect(load).rejects.toMatchObject({ codigo: 'motor-desconhecido' })
  })
})
