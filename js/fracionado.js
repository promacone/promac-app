// Frete fracionado: a carga divide o caminhão com outras.
//
// Não existe piso da ANTT para fração de caminhão — a lei só fala do
// veículo inteiro. A ideia da PROMAC, então, é ratear: calcula-se o
// frete do caminhão cheio pela tabela ANTT, na distância real da rota,
// e cobra-se da carga a fatia que ela ocupa.
//
// A fatia é o maior entre dois pesos:
// - o peso real da balança;
// - o "peso cubado", que traduz volume em quilos (300 kg por m³, o
//   padrão rodoviário). Sem ele, 500 kg de isopor ocupariam o caminhão
//   inteiro pagando quase nada.
//
// Este arquivo guarda o desenho da cobrança por região. Os números de
// cada região são um ponto de partida para o Pedro calibrar — o desenho
// veio primeiro, os valores vêm da prática.

/** Quilos que 1 m³ representa na cobrança. Padrão do setor rodoviário. */
export const CUBAGEM_KG_POR_M3 = 300

/**
 * As três frentes de venda do fracionado.
 *
 * Cada região carrega o caminhão de referência do rateio e a viagem
 * típica. A referência é a carreta de 25 t em todas — o que muda entre
 * as regiões é a distância típica e o mínimo por despacho.
 *
 * `capacidadeKg` é quanto o caminhão de referência leva; `distanciaKm`
 * é a viagem típica da região — usada só enquanto a rota real não foi
 * buscada; `minimo` é o piso por despacho,
 * para uma caixa de 5 kg não sair de graça.
 */
export const REGIOES = [
  {
    id: 'sulSudeste',
    titulo: 'Sul e Sudeste',
    sigla: 'S/SE',
    ufs: ['PR', 'SC', 'RS', 'SP', 'RJ', 'MG', 'ES'],
    caminhao: { tipo: 'geral', eixos: 5, capacidadeKg: 25000 },
    distanciaKm: 600,
    minimo: 90,
  },
  {
    id: 'centroOeste',
    titulo: 'Centro-Oeste',
    sigla: 'CO',
    ufs: ['MT', 'MS', 'GO', 'DF'],
    caminhao: { tipo: 'geral', eixos: 5, capacidadeKg: 25000 },
    distanciaKm: 1200,
    minimo: 130,
  },
  {
    id: 'norteNordeste',
    titulo: 'Norte e Nordeste',
    sigla: 'N/NE',
    ufs: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA',
          'PA', 'AP', 'AM', 'RR', 'RO', 'AC', 'TO'],
    caminhao: { tipo: 'geral', eixos: 5, capacidadeKg: 25000 },
    distanciaKm: 2500,
    minimo: 220,
  },
]

export function regiao(id) {
  return REGIOES.find((r) => r.id === id) || REGIOES[0]
}

/** O peso que vale para a cobrança: o real ou o cubado, o maior. */
export function pesoCobravel({ pesoKg = 0, volumeM3 = 0 }) {
  const cubado = Math.max(0, volumeM3) * CUBAGEM_KG_POR_M3
  return {
    real: Math.max(0, pesoKg),
    cubado,
    cobravel: Math.max(Math.max(0, pesoKg), cubado),
    cubou: cubado > Math.max(0, pesoKg),
  }
}

/**
 * A conta do fracionado.
 *
 * 1. Frete do caminhão de referência cheio, na viagem típica da região,
 *    pela mesma função do dedicado (piso ANTT + imposto + margem "por
 *    dentro").
 * 2. Fatia da carga: peso cobrável ÷ capacidade do caminhão.
 * 3. Frete-peso = frete cheio × fatia, nunca abaixo do mínimo da região.
 * 4. GRIS sobre a nota + taxas fixas por fora.
 *
 * @param calcularFreteDedicado a função `calcularFrete` de frete.js —
 *        vem por parâmetro para este módulo não conhecer a tabela ANTT.
 * @param coeficientes          idem, `coeficientes` de frete.js.
 */
export function calcularFracionado({
  regiaoId,
  distanciaKm = 0,
  pedagioCaminhao = 0,
  pesoKg = 0,
  volumeM3 = 0,
  valorNFe = 0,
  taxasFixas = 0,
  parametros,
  calcularFreteDedicado,
  coeficientes,
}) {
  const r = regiao(regiaoId)
  const peso = pesoCobravel({ pesoKg, volumeM3 })

  // Sem rota buscada, a viagem típica da região segura a estimativa.
  const km = distanciaKm > 0 ? distanciaKm : r.distanciaKm

  // O frete do caminhão inteiro, sem GRIS (o GRIS é da nota desta carga,
  // não do caminhão de referência).
  const cheio = calcularFreteDedicado({
    distanciaKm: km,
    valorNFe: 0,
    eixos: r.caminhao.eixos,
    tarifaPedagioPorEixo: 0,
    coeficientes: coeficientes(r.caminhao.tipo, r.caminhao.eixos),
    parametros,
  })

  // O pedágio do caminhão entra no valor cheio antes do rateio: cada
  // carga paga sua fração da estrada, como paga sua fração do diesel.
  const cheioComPedagio = cheio.total + Math.max(0, pedagioCaminhao)

  const fatia = r.caminhao.capacidadeKg > 0
    ? peso.cobravel / r.caminhao.capacidadeKg
    : 0

  const proporcional = cheioComPedagio * fatia
  const fretePeso = Math.max(proporcional, peso.cobravel > 0 ? r.minimo : 0)
  const usouMinimo = peso.cobravel > 0 && proporcional < r.minimo

  const gris = Math.max(0, valorNFe) * (parametros.gris || 0)
  const taxas = Math.max(0, taxasFixas)

  return {
    regiao: r,
    distanciaKm: km,
    usouViagemTipica: !(distanciaKm > 0),
    peso,
    freteCaminhaoCheio: cheioComPedagio,
    fatia,
    fretePeso,
    usouMinimo,
    gris,
    taxas,
    total: fretePeso + gris + taxas,
  }
}

/** Em qual região cai uma UF? Para o campo de cidade sugerir sozinho. */
export function regiaoDaUF(uf) {
  const alvo = String(uf || '').trim().toUpperCase()
  return REGIOES.find((r) => r.ufs.includes(alvo)) || null
}
