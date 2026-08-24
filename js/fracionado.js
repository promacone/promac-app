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
    // O baú é o da carreta que a PROMAC contrata: 15 m de comprimento,
    // 2,40 de largura, 2,80 de altura — 100,8 m³ para 25 toneladas.
    // Com o baú declarado, a fatia da carga é medida contra o espaço
    // real, não contra a cubagem genérica de 300 kg/m³.
    caminhao: {
      tipo: 'geral', eixos: 5, capacidadeKg: 25000,
      bau: { comprimento: 15, largura: 2.4, altura: 2.8 },
    },
    // O rateio seco supõe a carreta 100% cheia e de graça para operar.
    // O fracionado real tem coleta, manuseio no terminal e espaço que
    // sobra vazio — o mercado cobra em torno de 3x o rateio para cobrir
    // isso. É o número a calibrar com os fretes que a PROMAC já fechou.
    fatorFracionado: 3,
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

/** Espaço útil do baú, em m³ — ou null se a região não o declarou. */
export function capacidadeM3(caminhao) {
  const b = caminhao?.bau
  if (!b) return null
  return b.comprimento * b.largura * b.altura
}

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
  const espacoDoBau = capacidadeM3(r.caminhao)

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

  // A fatia que a carga ocupa do caminhão.
  //
  // Com o baú declarado, mede-se contra o caminhão real: a carga esgota
  // ou o peso (25 t) ou o espaço (100,8 m³), e paga pela dimensão que
  // esgota primeiro. É o que acontece na prática — uma carreta lotada de
  // isopor viaja leve, mas ninguém mais embarca nela.
  //
  // Sem o baú, vale a cubagem comercial de pesoCobravel (300 kg/m³).
  let fatiaPeso = null
  let fatiaEspaco = null
  let fatia

  if (espacoDoBau) {
    fatiaPeso = r.caminhao.capacidadeKg > 0 ? peso.real / r.caminhao.capacidadeKg : 0
    fatiaEspaco = Math.max(0, volumeM3) / espacoDoBau
    fatia = Math.max(fatiaPeso, fatiaEspaco)
  } else {
    fatia = r.caminhao.capacidadeKg > 0 ? peso.cobravel / r.caminhao.capacidadeKg : 0
  }

  // O fator do fracionado transforma o rateio ideal em preço de
  // operação real (ver comentário na região).
  const fator = r.fatorFracionado || 1
  const proporcional = cheioComPedagio * fatia * fator

  // Teto: fracionado nunca custa mais que a carreta inteira. Com o
  // fator de 3, uma carga acima de um terço da carreta passaria do
  // preço do dedicado — e aí o certo é oferecer o dedicado, não cobrar
  // mais caro pelo serviço pior.
  const bateuNoTeto = proporcional > cheioComPedagio && peso.cobravel > 0
  const comTeto = bateuNoTeto ? cheioComPedagio : proporcional

  const fretePeso = Math.max(comTeto, peso.cobravel > 0 ? r.minimo : 0)
  const usouMinimo = peso.cobravel > 0 && comTeto < r.minimo

  const gris = Math.max(0, valorNFe) * (parametros.gris || 0)
  const taxas = Math.max(0, taxasFixas)

  return {
    regiao: r,
    distanciaKm: km,
    usouViagemTipica: !(distanciaKm > 0),
    peso,
    capacidadeM3: espacoDoBau,
    freteCaminhaoCheio: cheioComPedagio,
    valorPorKm: km > 0 ? cheioComPedagio / km : 0,
    fatia,
    fator,
    fatiaPeso,
    fatiaEspaco,
    cobrouPorEspaco: espacoDoBau ? fatiaEspaco > fatiaPeso : peso.cubou,
    fretePeso,
    usouMinimo,
    bateuNoTeto,
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
