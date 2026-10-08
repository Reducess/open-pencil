import { expandirCena, lerCompactacao } from './defaults'
import { CenaError } from './errors'
import { CENA_FORMATO, MOTOR_NOME, MOTOR_VERSAO } from './types'
import type { Cena } from './types'

export interface Migracao {
  /** Engine version the step produces. */
  para: string
  /** Must return a new scene; the input belongs to the caller. */
  migrar: (cena: Cena) => Cena
}

/**
 * One entry per engine version that was ever persisted, keyed by the version it migrates *from*.
 * Steps chain until `MOTOR_VERSAO` is reached. Upgrading the engine means: bump `MOTOR_VERSAO`,
 * add `'<old version>': { para: '<new version>', migrar }` here, and cover it with a fixture of
 * the old version in `tests/migrate.test.ts`. An identity step is still a step — it records that
 * someone checked the node layout did not change.
 */
export const MIGRACOES: Readonly<Record<string, Migracao>> = {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Only the header is checked here; the body is `validarCena`'s job. */
function temMotor(cena: Record<string, unknown>): cena is Record<string, unknown> & Cena {
  const motor = cena['motor']
  return isRecord(motor) && typeof motor['versao'] === 'string' && motor['nome'] === MOTOR_NOME
}

/**
 * Brings a stored scene to the current engine version. Today that is the identity for
 * `MOTOR_VERSAO` (a compact scene stays compact, a full one stays full — both are read); any
 * other version without a registered path is refused rather than guessed, and so is a
 * `compactacao` stamp this package does not know.
 * `migracoes` exists so the chaining can be tested before the first real step is written.
 */
export function migrarCena(
  cena: unknown,
  migracoes: Readonly<Record<string, Migracao>> = MIGRACOES
): Cena {
  if (!isRecord(cena)) {
    throw new CenaError('cena-invalida', 'The scene must be a JSON object')
  }
  if (cena['formato'] !== CENA_FORMATO) {
    throw new CenaError(
      'formato-desconhecido',
      `Unknown scene format ${JSON.stringify(cena['formato'])}; expected "${CENA_FORMATO}"`
    )
  }
  if (!temMotor(cena)) {
    throw new CenaError(
      'motor-desconhecido',
      `Unknown scene engine ${JSON.stringify(cena['motor'])}; expected "${MOTOR_NOME}"`
    )
  }

  // An unknown compaction mode or defaults table is refused here, before anything reads a node.
  lerCompactacao(cena)

  // Steps rewrite nodes of the version they come from, so they are handed full nodes: the fields
  // a compact scene omits are filled in from the table *it* names. The result stays expanded; it
  // is compacted again, against the current table, the next time the document is saved.
  let atual: Cena = cena.motor.versao === MOTOR_VERSAO ? cena : expandirCena(cena)
  const visited = new Set<string>()
  while (atual.motor.versao !== MOTOR_VERSAO) {
    const versao = atual.motor.versao
    const passo = Object.hasOwn(migracoes, versao) ? migracoes[versao] : undefined
    if (!passo || visited.has(versao)) {
      throw new CenaError(
        'motor-desconhecido',
        `No migration from engine version "${versao}" to "${MOTOR_VERSAO}". ` +
          'Scenes written by a newer engine cannot be opened by an older one.'
      )
    }
    visited.add(versao)
    atual = { ...passo.migrar(atual), motor: { nome: MOTOR_NOME, versao: passo.para } }
  }
  return atual
}
