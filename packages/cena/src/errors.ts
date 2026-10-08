import type { ProblemaCena } from './types'

export type CodigoErroCena =
  | 'cena-invalida'
  | 'formato-desconhecido'
  | 'motor-desconhecido'
  | 'compactacao-desconhecida'
  | 'imagem-sem-arquivo'
  | 'valor-nao-serializavel'

/** Every failure of this package. `codigo` is stable; `problemas` carries validation detail. */
export class CenaError extends Error {
  readonly codigo: CodigoErroCena
  readonly problemas: ProblemaCena[]

  constructor(codigo: CodigoErroCena, mensagem: string, problemas: ProblemaCena[] = []) {
    super(mensagem)
    this.name = 'CenaError'
    this.codigo = codigo
    this.problemas = problemas
  }
}
