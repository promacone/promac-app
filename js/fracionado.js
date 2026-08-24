// Motor de preço do frete fracionado.
//
// A ideia central, desenhada pelo Pedro: não existe tabela fixa. O preço
// nasce da pergunta "quanto deste caminhão essa carga ocupa?" — e o
// caminhão de referência é um truck dedicado, cotado pela mesma conta do
// frete dedicado (piso ANTT no km real + tabela comercial da PROMAC).
//
//   frete = embarque fixo + (fatia do truck × preço do truck × fator)
//
// O embarque cobre coleta, manuseio e emissão — custa parecido para
// 30 kg ou 3 t, e é o que impede a carga pequena de sair de graça.
//
// O fator varia com a ocupação (ver FAIXAS_PADRAO): carga pequena paga
// proporcionalmente mais, porque o resto do caminhão ainda precisa ser
// vendido; carga que quase fecha o truck paga quase o rateio seco,
// porque ela é quem garante a viagem.
//
// Travas comerciais, nesta ordem:
//   piso   — nunca abaixo do custo da fatia (piso ANTT proporcional);
//   mínimo — nunca abaixo do frete mínimo por despacho;
//   teto   — nunca acima do truck dedicado inteiro: chegou lá, o certo
//            é vender o dedicado.
//
// Por enquanto o motor completo vale para o Sul/Sudeste; as outras
// regiões seguem na cubagem comercial simples até serem calibradas.

/** Quilos que 1 m³ representa no peso cubado. Padrão rodoviário. */
export const CUBAGEM_KG_POR_M3 = 300

/**
 * Margem por ocupação do truck, como o Pedro definiu:
 *
 *   até 10%  → fator mais alto (a carga pequena contribui mais)
 *   10–30%   → fator padrão
 *   30–60%   → fator reduzido, para competir
 *   acima    → fator mínimo (a carga fecha o caminhão)
 *
 * Entre os degraus o fator desce em linha reta, sem saltos: numa tabela
 * de degrau seco, 1 kg a mais faria o preço CAIR ao cruzar a faixa — e
 * cliente esperto descobriria isso rápido.
 */
export const FAIXAS_PADRAO = [
  { ate: 0.075, fator: 2.94 },
  { ate: 0.215, fator: 1.81 },
  { ate: 0.36, fator: 1.57 },
  { ate: 1.00, fator: 1.35 },
]
// Curva ajustada aos preços reais do Pedro (2026-08-24), rota Ponta
// Grossa -> São Paulo: 100 kg = 1.100 / 300 kg = 1.290 / 1 t = 1.980 /
// 3 t = 2.980 / 5 t = 3.980 — depois reduzida em 10% uniformes, e por
// fim com a ponta de até 300 kg abaixada mais um degrau: o embarque caiu
// para 700 e os fatores subiram na mesma medida, de um jeito que os
// preços de 1 t para cima não se moveram. Não é palpite de mercado: os fatores foram
// resolvidos para o motor reproduzir esses cinco pontos com o embarque
// de R$ 1.000. A cabeça do Pedro é quase linear — ~R$ 1.000 de base
// mais ~R$ 0,95/kg até 1 t, e ~R$ 0,50/kg dali em diante — e é isso que
// estas faixas desenham por cima da ocupação do truck.

/** O fator na ocupação dada, interpolando entre as faixas. */
export function fatorDeOcupacao(ocupacao, faixas = FAIXAS_PADRAO) {
  const o = Math.max(0, Math.min(1, ocupacao))
  if (!faixas.length) return 1
  if (o <= faixas[0].ate) return faixas[0].fator

  for (let i = 1; i < faixas.length; i++) {
    const anterior = faixas[i - 1]
    const atual = faixas[i]
    if (o <= atual.ate) {
      const posicao = (o - anterior.ate) / (atual.ate - anterior.ate)
      return anterior.fator + (atual.fator - anterior.fator) * posicao
    }
  }
  return faixas[faixas.length - 1].fator
}

export const REGIOES = [
  {
    id: 'sulSudeste',
    titulo: 'Sul e Sudeste',
    sigla: 'S/SE',
    ufs: ['PR', 'SC', 'RS', 'SP', 'RJ', 'MG', 'ES'],
    // O truck de referência, como o Pedro especificou: 14 t, 48 m³ de
    // cubagem útil, 14 posições de pallet, baú de 8,5 m. Os valores
    // podem ser sobrescritos pelo painel de Ajustes.
    caminhao: {
      nome: 'Truck', tipo: 'geral', eixos: 3,
      capacidadeKg: 14000,
      capacidadeM3: 48,
      posicoes: 14,
      bau: { comprimento: 8.5, largura: 2.4, altura: 2.8 },
    },
    // O embarque de R$ 1.000 veio dos números do Pedro: qualquer carga
    // PG -> SP começa em torno de R$ 1.100. É a parcela que a carga
    // pequena paga pela viagem existir.
    embarque: 700,
    faixas: FAIXAS_PADRAO,
    distanciaKm: 600,
    minimo: 700,
    motorCompleto: true,
  },
  {
    id: 'centroOeste',
    titulo: 'Centro-Oeste',
    sigla: 'CO',
    ufs: ['MT', 'MS', 'GO', 'DF'],
    caminhao: { nome: 'Carreta', tipo: 'geral', eixos: 5, capacidadeKg: 25000 },
    distanciaKm: 1200,
    minimo: 130,
  },
  {
    id: 'norteNordeste',
    titulo: 'Norte e Nordeste',
    sigla: 'N/NE',
    ufs: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA',
          'PA', 'AP', 'AM', 'RR', 'RO', 'AC', 'TO'],
    caminhao: { nome: 'Carreta', tipo: 'geral', eixos: 5, capacidadeKg: 25000 },
    distanciaKm: 2500,
    minimo: 220,
  },
]

export function regiao(id) {
  return REGIOES.find((r) => r.id === id) || REGIOES[0]
}

/** Espaço útil declarado do caminhão, ou o do baú, ou nada. */
export function capacidadeM3(caminhao) {
  if (caminhao?.capacidadeM3) return caminhao.capacidadeM3
  const b = caminhao?.bau
  if (!b) return null
  return b.comprimento * b.largura * b.altura
}

/** Peso real, cubado e o faturado (o maior dos dois). */
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
 * Prazo estimado de entrega, em dias úteis.
 *
 * Uns 500 km rodados por dia, mais um dia de consolidação — fracionado
 * espera fechar caminhão antes de sair.
 */
export function prazoEstimado(distanciaKm) {
  const rodagem = Math.max(1, Math.ceil(Math.max(0, distanciaKm) / 500))
  return { de: rodagem, ate: rodagem + 1 }
}

/**
 * A cotação do fracionado.
 *
 * @param ajustes     valores do painel de Ajustes que sobrescrevem os da
 *                    região (capacidades, embarque, mínimo, faixas)
 * @param ocupadoM3   espaço do truck já vendido para outras cargas —
 *                    liga a inteligência de consolidação
 * @param calcularFreteDedicado / coeficientes — vêm de frete.js; o motor
 *                    não conhece a tabela ANTT diretamente.
 */
export function calcularFracionado({
  regiaoId,
  distanciaKm = 0,
  pedagioCaminhao = 0,
  pesoKg = 0,
  volumeM3 = 0,
  valorNFe = 0,
  taxasFixas = 0,
  ocupadoM3 = 0,
  ajustes = null,
  parametros,
  calcularFreteDedicado,
  coeficientes,
}) {
  const base = regiao(regiaoId)

  // O painel de Ajustes manda por cima do padrão da região.
  const r = ajustes
    ? {
        ...base,
        caminhao: { ...base.caminhao, ...(ajustes.caminhao || {}) },
        embarque: ajustes.embarque ?? base.embarque,
        minimo: ajustes.minimo ?? base.minimo,
        faixas: ajustes.faixas ?? base.faixas,
      }
    : base

  const peso = pesoCobravel({ pesoKg, volumeM3 })
  const espacoDoBau = capacidadeM3(r.caminhao)
  const km = distanciaKm > 0 ? distanciaKm : r.distanciaKm

  // 1) O caminhão de referência, cheio, na rota real.
  const cheio = calcularFreteDedicado({
    distanciaKm: km,
    valorNFe: 0,
    eixos: r.caminhao.eixos,
    tarifaPedagioPorEixo: 0,
    coeficientes: coeficientes(r.caminhao.tipo, r.caminhao.eixos),
    parametros,
  })
  const pedagio = Math.max(0, pedagioCaminhao)
  const cheioComPedagio = cheio.total + pedagio
  const custoCheio = cheio.custo + pedagio

  // 2) Quanto a carga ocupa, por peso e por espaço.
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

  const temCarga = peso.cobravel > 0

  // 3) Consolidação: com parte do truck já vendida, o fator é avaliado
  // na ocupação do caminhão como um todo — a carga nova aproveita uma
  // viagem que já está paga em parte, e o preço dela cai de faixa.
  const jaOcupado = espacoDoBau ? Math.max(0, ocupadoM3) / espacoDoBau : 0
  const ocupacaoParaFator = Math.min(1, Math.max(fatia, fatia + jaOcupado))

  const consolidacao = espacoDoBau
    ? {
        ocupadoM3: Math.max(0, ocupadoM3),
        totalM3: Math.max(0, ocupadoM3) + Math.max(0, volumeM3),
        restanteM3: Math.max(0, espacoDoBau - Math.max(0, ocupadoM3) - Math.max(0, volumeM3)),
        cabe: Math.max(0, ocupadoM3) + Math.max(0, volumeM3) <= espacoDoBau + 1e-9,
      }
    : null

  // 4) O preço.
  const fator = r.motorCompleto
    ? fatorDeOcupacao(ocupacaoParaFator, r.faixas)
    : (r.fatorFracionado || 1)

  const rateio = cheioComPedagio * fatia * fator
  const embarque = temCarga ? (r.embarque || 0) : 0
  const proposto = rateio + embarque

  // 5) As travas, do chão ao teto.
  const pisoDeCusto = custoCheio * fatia
  const bateuNoTeto = temCarga && proposto > cheioComPedagio

  let fretePeso = Math.max(proposto, pisoDeCusto)
  if (bateuNoTeto) fretePeso = cheioComPedagio
  const usouMinimo = temCarga && fretePeso < r.minimo
  if (temCarga) fretePeso = Math.max(fretePeso, r.minimo)

  const gris = Math.max(0, valorNFe) * (parametros.gris || 0)
  const taxas = Math.max(0, taxasFixas)
  const total = fretePeso + gris + taxas

  // Margem estimada: o que sobra depois do imposto e do custo ANTT da
  // fatia. O custo real do embarque não está aqui — é estimativa para
  // leitura, não contabilidade.
  const margemEstimada = fretePeso * (1 - (parametros.imposto || 0)) - pisoDeCusto

  return {
    regiao: r,
    distanciaKm: km,
    usouViagemTipica: !(distanciaKm > 0),
    prazo: prazoEstimado(km),
    peso,
    capacidadeM3: espacoDoBau,
    freteCaminhaoCheio: cheioComPedagio,
    custoCaminhaoCheio: custoCheio,
    valorPorKm: km > 0 ? cheioComPedagio / km : 0,
    pedagioDaFatia: pedagio * fatia,
    fatia,
    fatiaPeso,
    fatiaEspaco,
    cobrouPorEspaco: espacoDoBau ? fatiaEspaco > fatiaPeso : peso.cubou,
    ocupacaoParaFator,
    consolidacao,
    fator,
    rateio,
    embarque,
    pisoDeCusto,
    margemEstimada,
    fretePeso,
    usouMinimo,
    bateuNoTeto,
    gris,
    taxas,
    total,
  }
}

/** Em qual região cai uma UF? Para o campo de cidade sugerir sozinho. */
export function regiaoDaUF(uf) {
  const alvo = String(uf || '').trim().toUpperCase()
  return REGIOES.find((r) => r.ufs.includes(alvo)) || null
}
