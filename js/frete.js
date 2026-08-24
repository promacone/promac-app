// Cálculo de frete dedicado, traduzido do aplicativo iOS.
//
// A lógica é a mesma que já rodava com 54 testes no app nativo: piso ANTT
// como custo, imposto e margem como fatias do preço de venda, e pedágio
// por fora.

/** Tipos de carga da Tabela A da ANTT (transporte de carga lotação). */
export const TIPOS_DE_CARGA = [
  { id: 'geral', titulo: 'Carga geral' },
  { id: 'granelSolido', titulo: 'Granel sólido' },
  { id: 'granelLiquido', titulo: 'Granel líquido' },
  { id: 'frigorificada', titulo: 'Frigorificada / aquecida' },
  { id: 'conteinerizada', titulo: 'Conteinerizada' },
  { id: 'neogranel', titulo: 'Neogranel' },
  { id: 'granelPressurizada', titulo: 'Granel pressurizada' },
  { id: 'perigosaGeral', titulo: 'Perigosa — carga geral' },
  { id: 'perigosaGranelSolido', titulo: 'Perigosa — granel sólido' },
  { id: 'perigosaGranelLiquido', titulo: 'Perigosa — granel líquido' },
  { id: 'perigosaFrigorificada', titulo: 'Perigosa — frigorificada' },
  { id: 'perigosaConteinerizada', titulo: 'Perigosa — conteinerizada' },
]

export const RESOLUCAO_ANTT = {
  nome: 'Resolução ANTT nº 6.084/2026',
  vigenteDesde: '17/07/2026',
}

/**
 * Tabela A do Anexo II da Resolução ANTT nº 6.084, de 16/07/2026.
 *
 * Cada entrada é [eixos, custo por km, custo de carga e descarga].
 *
 * ⚠️ A ANTT republica esses valores algumas vezes por ano. Quando sair
 * resolução nova, trocar os números aqui e atualizar RESOLUCAO_ANTT — o
 * número aparece na tela para o vendedor saber com que tabela cotou.
 */
const TABELA_A = {
  geral: [
    [2, 3.9826, 451.84], [3, 5.0977, 541.86], [4, 5.7822, 588.86],
    [5, 6.6718, 657.56], [6, 7.3547, 671.93], [7, 8.0927, 831.66],
    [9, 9.2027, 903.32],
  ],
  granelSolido: [
    [2, 4.0144, 460.59], [3, 5.1355, 552.24], [4, 5.8118, 597.00],
    [5, 6.6983, 664.83], [6, 7.3841, 680.01], [7, 8.0516, 820.34],
    [9, 9.2231, 908.91],
  ],
  granelLiquido: [
    [2, 4.0884, 471.98], [3, 5.2311, 569.57], [4, 5.9661, 621.52],
    [5, 6.8661, 693.08], [6, 7.5572, 709.72], [7, 8.1900, 840.50],
    [9, 9.3822, 934.76],
  ],
  frigorificada: [
    [2, 4.7095, 520.07], [3, 6.0159, 623.27], [4, 6.8646, 686.63],
    [5, 7.8666, 757.98], [6, 8.6661, 772.35], [7, 9.5884, 982.76],
    [9, 10.8870, 1067.06],
  ],
  conteinerizada: [
    [2, 5.1082, 544.75], [3, 5.7396, 577.15], [4, 6.6345, 647.29],
    [5, 7.3186, 662.01], [6, 8.0492, 819.69], [7, 9.1399, 886.05],
  ],
  neogranel: [
    [2, 3.6023, 451.84], [3, 5.0962, 541.44], [4, 5.8094, 596.35],
    [5, 6.6718, 657.56], [6, 7.3547, 671.93], [7, 8.0927, 831.66],
    [9, 9.2027, 903.32],
  ],
  granelPressurizada: [
    [2, 7.0364, 757.81], [3, 7.7652, 784.82], [4, 9.7444, 1052.26],
  ],
  perigosaGeral: [
    [2, 4.3571, 549.81], [3, 5.4821, 642.55], [4, 6.2033, 694.66],
    [5, 7.0930, 763.36], [6, 7.7758, 777.73], [7, 8.5321, 942.48],
    [9, 9.6501, 1016.33],
  ],
  perigosaGranelSolido: [
    [2, 4.7845, 608.79], [3, 5.9154, 703.16], [4, 6.6285, 753.03],
    [5, 7.5150, 820.86], [6, 8.2008, 836.04], [7, 8.8866, 981.39],
    [9, 10.0660, 1072.15],
  ],
  perigosaGranelLiquido: [
    [2, 4.8710, 632.58], [3, 6.0236, 732.90], [4, 6.7628, 789.96],
    [5, 7.6628, 861.51], [6, 8.3539, 878.16], [7, 9.0049, 1013.95],
    [9, 10.2051, 1110.41],
  ],
  perigosaFrigorificada: [
    [2, 5.3176, 630.88], [3, 6.6369, 737.63], [4, 7.5020, 807.63],
    [5, 8.5039, 878.98], [6, 9.3034, 893.35], [7, 10.2495, 1110.28],
    [9, 11.5584, 1197.43],
  ],
  perigosaConteinerizada: [
    [2, 5.4926, 645.45], [3, 6.1608, 682.95], [4, 7.0556, 753.10],
    [5, 7.7398, 767.81], [6, 8.4886, 930.51], [7, 9.5873, 999.06],
  ],
}

/** Coeficientes de um tipo de carga para uma quantidade de eixos. */
export function coeficientes(tipo, eixos) {
  const linha = (TABELA_A[tipo] || []).find(([e]) => e === eixos)
  return linha ? { ccd: linha[1], cc: linha[2] } : null
}

/** Quantidades de eixos que a ANTT publica para esse tipo de carga. */
export function eixosDisponiveis(tipo) {
  return (TABELA_A[tipo] || []).map(([e]) => e)
}

/**
 * Valores de partida, usados só enquanto os percentuais da empresa não
 * chegam do Firestore.
 *
 * São zerados de propósito: os percentuais reais da PROMAC ficam no
 * servidor, e num site o código é visível para qualquer um que abra a
 * página. Se o carregamento falhar, o vendedor vê zero e percebe que
 * algo está errado — melhor do que cotar com um número inventado.
 */
export const PARAMETROS_PADRAO = { imposto: 0, margem: 0, gris: 0 }

/**
 * Monta o preço de um frete dedicado a partir do piso ANTT.
 *
 * O piso é o **custo**: é o que a transportadora paga ao motorista
 * terceiro, conforme os eixos do caminhão dele. Sobre esse custo ainda
 * precisam caber o imposto e o lucro, e ambos são fatias do preço final —
 * não do custo. Por isso o custo é dividido, e não multiplicado.
 *
 * O pedágio fica de fora: pelo Vale-Pedágio Obrigatório (Lei 10.209/2001),
 * quem contrata o frete adianta o pedágio ao transportador. Não é receita
 * da transportadora, então não leva imposto nem margem.
 */
export function calcularFrete({
  distanciaKm = 0,
  valorNFe = 0,
  eixos = 5,
  tarifaPedagioPorEixo = 0,
  coeficientes: coef,
  parametros = PARAMETROS_PADRAO,
}) {
  const ccd = coef?.ccd ?? 0
  const cc = coef?.cc ?? 0

  const deslocamento = ccd * Math.max(0, distanciaKm)
  const cargaEDescarga = cc
  const gris = Math.max(0, valorNFe) * parametros.gris
  const custo = deslocamento + cargaEDescarga + gris
  const pedagio = Math.max(0, tarifaPedagioPorEixo) * Math.max(0, eixos)

  const fracaoDeCusto = 1 - parametros.imposto - parametros.margem

  // Percentuais impossíveis (imposto + margem ≥ 100%) não geram preço:
  // devolvemos só o custo, sem inventar um valor.
  if (fracaoDeCusto <= 0) {
    return resultado({ deslocamento, cargaEDescarga, gris, imposto: 0, margem: 0, pedagio })
  }

  const total = custo / fracaoDeCusto

  return resultado({
    deslocamento,
    cargaEDescarga,
    gris,
    imposto: total * parametros.imposto,
    margem: total * parametros.margem,
    pedagio,
  })
}

function resultado({ deslocamento, cargaEDescarga, gris, imposto, margem, pedagio }) {
  const pisoANTT = deslocamento + cargaEDescarga
  const custo = pisoANTT + gris
  const total = custo + imposto + margem

  return {
    deslocamento,
    cargaEDescarga,
    pisoANTT,
    gris,
    imposto,
    margem,
    pedagio,
    custo,
    total,
    totalComPedagio: total + pedagio,
  }
}

/** Formata em reais. */
export function reais(valor) {
  return (valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

/** Mostra 0,16 como "16%" e 0,0025 como "0,25%". */
export function percentual(fracao) {
  return (fracao || 0).toLocaleString('pt-BR', {
    style: 'percent',
    maximumFractionDigits: 2,
  })
}

/** Aceita tanto "1234,5" quanto "1234.5" — o teclado do iPhone usa vírgula. */
export function numero(texto) {
  const limpo = String(texto ?? '').replace(/\./g, '').replace(',', '.')
  const valor = parseFloat(limpo)
  return Number.isFinite(valor) ? valor : 0
}
