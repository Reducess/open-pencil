export { CENA_FORMATO, MOTOR_NOME, MOTOR_VERSAO } from './types'
export type {
  AvisoCena,
  Cena,
  CenaCompactacao,
  CenaImagemRef,
  CenaMotor,
  GravidadeProblema,
  ImagemParaResolver,
  ImagemResolvida,
  JSONObjeto,
  JSONValor,
  OpcoesCenaParaGrafo,
  OpcoesGrafoParaCena,
  ProblemaCena
} from './types'
export { CenaError, type CodigoErroCena } from './errors'
export { grafoParaCena } from './graph-to-scene'
export { cenaParaGrafo, type CenaCarregada } from './scene-to-graph'
export { cenaValida, validarCena } from './validate'
export { MIGRACOES, migrarCena, type Migracao } from './migrate'
export { coletarHashesDeImagem, imagensReferenciadas, tipoDeImagem } from './images'
export { codificarValor, decodificarValor } from './json-safe'
export {
  compactarNos,
  expandirCena,
  MODO_PADROES_OMITIDOS,
  TABELA_DE_PADROES_ATUAL,
  TABELAS_DE_PADROES,
  type TabelaDePadroes
} from './defaults'
