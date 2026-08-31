// Motor de preço do frete fracionado.
//
// A ideia central, desenhada pelo Pedro: não existe tabela fixa. O preço
// nasce da pergunta "quanto deste caminhão essa carga ocupa?" — e o
// caminhão de referência é um truck dedicado, cotado pela mesma conta do
// frete dedicado (piso ANTT no km real + tabela comercial da PROMAC).
//
//   preço por kg = venda do truck cheio ÷ (capacidade × aproveitamento)
//   frete        = peso faturável × preço por kg + despacho
//
// É o método que o setor ensina: pega-se o valor da carga lotação e
// divide-se pela capacidade do veículo, descontando a ociosidade. O
// truck não roda cheio todo dia — o aproveitamento médio é o que
// transforma o preço do caminhão inteiro no preço do quilo.
//
// O peso faturável é o maior entre balança, cubagem e um piso mínimo
// (100 kg): é assim que uma caixa de 5 kg não viaja de graça, sem
// precisar de fator nenhum.
//
// A versão anterior multiplicava a fatia por fatores de 1,3 a 2,9. Dava
// para calibrar num ponto, mas nunca na curva inteira — e produzia
// R$ 700 para 30 kg, sete vezes o mercado.
//
// Travas: nunca abaixo do custo ANTT da fatia; nunca abaixo do frete
// mínimo; nunca acima do truck dedicado inteiro.
//
// Por enquanto o motor completo vale para o Sul/Sudeste; as outras
// regiões seguem na cubagem comercial simples até serem calibradas.

/** Quilos que 1 m³ representa no peso cubado. Padrão rodoviário. */
export const CUBAGEM_KG_POR_M3 = 300


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
    // Quanto do truck viaja vendido, na média do mês. É o desconto de
    // ociosidade que o setor manda aplicar: o caminhão não fecha lotado
    // todo dia, e quem paga essa folga é a tabela.
    aproveitamento: 0.62,
    // Nenhum despacho é faturado abaixo disto, por menor que seja a
    // caixa — é o que substitui os antigos fatores por faixa.
    //
    // 1.800 kg, escolhido pelo Pedro em 2026-08-31.
    //
    // É muito acima do que transportadora grande pratica, e de propósito.
    // Quem tem rede de consolidação junta carga de dezenas de clientes e
    // dilui o custo do despacho pequeno; a PROMAC ainda não tem essa
    // rede, então cada carga pequena consome coleta, planejamento e
    // espaço quase como uma grande. O preço reflete o custo real dela,
    // não a média do mercado.
    //
    // É neste número que se mexe quando o problema é só a ponta pequena.
    pesoMinimoFaturavel: 1800,
    // Escalonamento do preço por quilo, como nas tabelas do setor: os
    // primeiros quilos custam mais caro e o preço cai por faixa.
    //
    // A conta é progressiva, igual imposto de renda: cada faixa cobra
    // só a parte do peso que cai dentro dela. Por isso a curva não tem
    // degrau — atravessar uma faixa nunca faz o preço saltar nem cair.
    //
    // Ajustado em 2026-08-31 a pedido do Pedro: o trecho de 500 kg a
    // 3 t estava barato demais.
    escalonamento: [
      { ate: 3000, fator: 1.30 },
      { ate: 6000, fator: 0.80 },
      { ate: Infinity, fator: 0.68 },
    ],
    // Papelada e manuseio, por despacho.
    despacho: 45,
    minimo: 900,
    distanciaKm: 600,
    motorCompleto: true,
  },
  // Centro-Oeste e Norte/Nordeste usam o mesmo motor e o mesmo truck de
  // referência do Sul/Sudeste. O que muda entre as regiões não é a
  // fórmula — é o aproveitamento.
  //
  // Aproveitamento é quanto do caminhão viaja vendido. No Sul/Sudeste
  // sobra carga de retorno e o truck raramente volta vazio. Quanto mais
  // longe e mais isolada a região, mais difícil fechar a volta, e o
  // frete de ida precisa pagar as duas pernas. É por isso que o número
  // cai de 62% para 50% e depois 40%: não é margem maior, é caminhão
  // voltando com menos carga.
  {
    id: 'centroOeste',
    titulo: 'Centro-Oeste',
    sigla: 'CO',
    ufs: ['MT', 'MS', 'GO', 'DF'],
    caminhao: {
      nome: 'Truck', tipo: 'geral', eixos: 3,
      capacidadeKg: 14000,
      capacidadeM3: 48,
      posicoes: 14,
      bau: { comprimento: 8.5, largura: 2.4, altura: 2.8 },
    },
    // 62%, o mesmo do Sul/Sudeste — e não menos, como cheguei a supor.
    //
    // O Centro-Oeste é a melhor região do país para carga de retorno: o
    // caminhão sobe com carga geral e desce carregado de grão. Tratar a
    // região como "difícil de encher" era o que deixava tudo caro.
    aproveitamento: 0.62,
    // O peso mínimo faturável multiplica junto com a distância: manter
    // os 1.800 kg do Sul/Sudeste aqui fazia 500 kg até Goiânia custar
    // R$ 4.060. O custo fixo de manusear um despacho pequeno não cresce
    // com o km, então o piso precisa ser menor onde a viagem é longa.
    pesoMinimoFaturavel: 600,
    escalonamento: [
      { ate: 3000, fator: 1.25 },
      { ate: 6000, fator: 0.80 },
      { ate: Infinity, fator: 0.68 },
    ],
    despacho: 45,
    minimo: 900,
    distanciaKm: 1200,
    motorCompleto: true,
  },
  {
    id: 'norteNordeste',
    titulo: 'Norte e Nordeste',
    sigla: 'N/NE',
    ufs: ['BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA',
          'PA', 'AP', 'AM', 'RR', 'RO', 'AC', 'TO'],
    caminhao: {
      nome: 'Truck', tipo: 'geral', eixos: 3,
      capacidadeKg: 14000,
      capacidadeM3: 48,
      posicoes: 14,
      bau: { comprimento: 8.5, largura: 2.4, altura: 2.8 },
    },
    // Opção A, escolhida pelo Pedro em 2026-08-31. Os 40% anteriores
    // punham 500 kg até Salvador em R$ 8.054 — perto de metade de um
    // truck dedicado, o que não se vende.
    aproveitamento: 0.50,
    pesoMinimoFaturavel: 800,
    escalonamento: [
      { ate: 3000, fator: 1.25 },
      { ate: 6000, fator: 0.80 },
      { ate: Infinity, fator: 0.68 },
    ],
    despacho: 45,
    minimo: 1200,
    distanciaKm: 2500,
    motorCompleto: true,
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
        aproveitamento: ajustes.aproveitamento ?? base.aproveitamento,
        pesoMinimoFaturavel: ajustes.pesoMinimoFaturavel ?? base.pesoMinimoFaturavel,
        escalonamento: ajustes.escalonamento ?? base.escalonamento,
        despacho: ajustes.despacho ?? base.despacho,
        minimo: ajustes.minimo ?? base.minimo,
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

  // 4) O preço, pelo método do setor.
  //
  // A consolidação entra aqui: com parte do truck já vendida, o
  // aproveitamento sobe, o quilo fica mais barato e a carga nova
  // aproveita a viagem — sem precisar de regra à parte.
  // Só a consolidação levanta o aproveitamento — espaço já vendido a
  // outro cliente preenche o caminhão e barateia o quilo.
  //
  // Chegou a entrar aqui também a fatia da própria carga, com o
  // raciocínio de que um despacho grande não deixa espaço vazio. A ideia
  // é correta, mas a conta não fecha: o preço por quilo cai na mesma
  // proporção em que o peso sobe, os dois se cancelam, e acima de
  // ~8.700 kg o frete passava a DIMINUIR com mais carga. Quem controla
  // essa ponta é o teto do dedicado, mais abaixo.
  const aproveitamento = r.motorCompleto
    ? Math.min(0.98, (r.aproveitamento || 0.7) + jaOcupado)
    : 1

  const pesoMinimo = r.motorCompleto ? (r.pesoMinimoFaturavel || 0) : 0
  const pesoFaturavel = temCarga ? Math.max(peso.cobravel, pesoMinimo) : 0
  const usouPesoMinimo = temCarga && peso.cobravel < pesoMinimo

  const precoPorKg = r.caminhao.capacidadeKg > 0
    ? cheioComPedagio / (r.caminhao.capacidadeKg * aproveitamento)
    : 0

  const despacho = temCarga && r.motorCompleto ? (r.despacho || 0) : 0
  const rateio = freteEscalonado(pesoFaturavel, precoPorKg, r.escalonamento)
  const proposto = rateio + despacho

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
    aproveitamento,
    precoPorKg,
    pesoFaturavel,
    usouPesoMinimo,
    rateio,
    despacho,
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

/**
 * Frete-peso cobrando cada faixa pela parte do peso que cai nela.
 *
 * Sem escalonamento (regiões ainda não calibradas), é peso × preço.
 */
export function freteEscalonado(pesoKg, precoPorKg, escalonamento) {
  if (!escalonamento || !escalonamento.length) return pesoKg * precoPorKg

  let restante = Math.max(0, pesoKg)
  let anterior = 0
  let total = 0

  for (const faixa of escalonamento) {
    if (restante <= 0) break
    const largura = faixa.ate - anterior
    const dentro = Math.min(restante, largura)
    total += dentro * precoPorKg * faixa.fator
    restante -= dentro
    anterior = faixa.ate
  }

  return total
}

/** Em qual região cai uma UF? Para o campo de cidade sugerir sozinho. */
export function regiaoDaUF(uf) {
  const alvo = String(uf || '').trim().toUpperCase()
  return REGIOES.find((r) => r.ufs.includes(alvo)) || null
}
