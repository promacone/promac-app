// Intermediário entre o site da PROMAC e a Qualp.
//
// Roda na Cloudflare, não no navegador. Existe por um motivo só: o token
// da Qualp não pode viajar para o celular de ninguém. Num site, todo o
// código chega ao navegador de quem abre a página — quem lesse o token
// gastaria os créditos do plano.
//
// Aqui o token fica guardado no servidor, como variável secreta. O site
// pede "quanto custa São Paulo → Curitiba com 5 eixos" e recebe de volta
// só a distância e o pedágio.

/** Só o site da PROMAC pode usar este intermediário. */
const ORIGENS_PERMITIDAS = [
  'https://promacone.github.io',
  // Mantido para eu conseguir testar durante o desenvolvimento.
  'http://127.0.0.1:8747',
  'http://localhost:8747',
]

export default {
  async fetch(pedido, ambiente) {
    const origem = pedido.headers.get('Origin') || ''
    const liberada = ORIGENS_PERMITIDAS.includes(origem)

    // O navegador pergunta antes se pode chamar; respondemos aqui.
    if (pedido.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabecalhos(origem, liberada) })
    }

    if (!liberada) {
      return responder({ erro: 'Origem não autorizada.' }, 403, origem, false)
    }

    if (pedido.method !== 'POST') {
      return responder({ erro: 'Use POST.' }, 405, origem, liberada)
    }

    if (!ambiente.QUALP_TOKEN) {
      return responder(
        { erro: 'O token da Qualp não foi configurado neste intermediário.' },
        500, origem, liberada
      )
    }

    let corpo
    try {
      corpo = await pedido.json()
    } catch {
      return responder({ erro: 'Pedido inválido.' }, 400, origem, liberada)
    }

    const cidadeOrigem = String(corpo.origem || '').trim()
    const cidadeDestino = String(corpo.destino || '').trim()
    const eixos = Number(corpo.eixos) || 5

    if (!cidadeOrigem || !cidadeDestino) {
      return responder({ erro: 'Informe a cidade de coleta e a de entrega.' }, 400, origem, liberada)
    }

    // Recusamos eixos fora da tabela antes de gastar um crédito.
    if (eixos < 2 || eixos > 15) {
      return responder({ erro: 'Número de eixos fora da tabela.' }, 400, origem, liberada)
    }

    let resposta
    try {
      resposta = await fetch('https://api.qualp.com.br/rotas/v4', {
        method: 'POST',
        headers: {
          'Access-Token': ambiente.QUALP_TOKEN,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(pedidoParaQualp(cidadeOrigem, cidadeDestino, eixos)),
      })
    } catch {
      return responder({ erro: 'Não consegui falar com a Qualp agora.' }, 502, origem, liberada)
    }

    if (!resposta.ok) {
      const motivo = resposta.status === 401 || resposta.status === 403
        ? 'A Qualp recusou o token. Confira se ele ainda é válido no painel.'
        : resposta.status === 402 || resposta.status === 429
          ? 'Os créditos da Qualp acabaram neste ciclo.'
          : `A Qualp respondeu de forma inesperada (código ${resposta.status}).`
      return responder({ erro: motivo }, 502, origem, liberada)
    }

    const dados = await resposta.json()
    return responder(resumir(dados, eixos), 200, origem, liberada)
  },
}

/**
 * Monta o pedido para a Qualp.
 *
 * Pedimos só pedágios: a tabela ANTT o próprio site já calcula, e cada
 * bloco extra engorda a resposta sem servir ao orçamento.
 */
function pedidoParaQualp(origem, destino, eixos) {
  return {
    locations: [origem, destino],
    config: {
      route: {
        type_route: 'efficient',
        calculate_return: false,
        alternative_routes: '0',
        optimized_route: false,
        avoid_locations: false,
      },
      vehicle: { type: 'truck', axis: String(eixos) },
      tolls: { retroactive_date: '' },
    },
    show: {
      tolls: true,
      freight_table: false,
      fuel_consumption: false,
      maneuvers: false,
      truck_scales: false,
      ufs: false,
      segments_information: false,
      private_places: false,
      static_image: false,
      polyline: false,
    },
  }
}

/**
 * Reduz a resposta da Qualp ao que o orçamento precisa.
 *
 * A resposta bruta traz dezenas de campos por praça. Devolver só o
 * essencial deixa o app mais leve e evita mandar ao navegador informação
 * que ele não usa.
 */
function resumir(dados, eixos) {
  const chave = String(eixos)
  const pracas = Array.isArray(dados.pedagios) ? dados.pedagios : []

  const somar = (campo) => pracas.reduce(
    (total, praca) => total + (Number(praca?.[campo]?.[chave]) || 0),
    0
  )

  return {
    distanciaKm: Number(dados?.distancia?.valor) || 0,
    duracaoSegundos: Number(dados?.duracao?.valor) || 0,
    pedagioDinheiro: somar('tarifa'),
    pedagioTag: somar('tarifa_tag'),
    quantidadeDePracas: pracas.length,
    pracas: pracas.map((praca) => ({
      nome: praca?.nome || '',
      rodovia: praca?.rodovia || '',
      uf: praca?.uf || '',
      valor: Number(praca?.tarifa?.[chave]) || 0,
    })),
  }
}

function cabecalhos(origem, liberada) {
  return {
    'Access-Control-Allow-Origin': liberada ? origem : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
  }
}

function responder(dados, status, origem, liberada) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: cabecalhos(origem, liberada),
  })
}
