// Intermediário entre o site da PROMAC e os serviços externos.
//
// Roda na Cloudflare, não no navegador. Existe por um motivo só: chaves
// de API não podem viajar para o celular de ninguém — num site, todo o
// código chega ao navegador de quem abre a página.
//
// Dois serviços passam por aqui:
//
//   POST /               → Qualp (rota e pedágio). Só exige vir do site.
//   POST /omie/contas    → OMIE (contas a pagar e a receber).
//   POST /omie/clientes  → OMIE (nomes dos clientes/fornecedores).
//
// As rotas do OMIE exigem mais que a origem: o pedido precisa trazer o
// login do Firebase de um administrador da PROMAC. Pedágio é público;
// o financeiro da empresa não. A assinatura do login é conferida aqui,
// contra as chaves públicas do Google — um curl com Origin forjado não
// passa.
//
// Segredos esperados (Settings → Variables, criptografados):
//   QUALP_TOKEN      — token da Qualp
//   OMIE_APP_KEY     — chave do aplicativo no OMIE
//   OMIE_APP_SECRET  — segredo do aplicativo no OMIE

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

    const caminho = new URL(pedido.url).pathname
    if (caminho.startsWith('/omie/')) {
      return atenderOmie(caminho, pedido, ambiente, origem, liberada)
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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

// ---------------------------------------------------------------------
// OMIE — contas a pagar e a receber
// ---------------------------------------------------------------------

/** Quem pode ver o financeiro. Igual ao "master" do app. */
const ADMINISTRADORES = ['comercial@promactransportes.com.br']

const PROJETO_FIREBASE = 'promac-transportes'

async function atenderOmie(caminho, pedido, ambiente, origem, liberada) {
  if (!ambiente.OMIE_APP_KEY || !ambiente.OMIE_APP_SECRET) {
    return responder({ erro: 'OMIE_NAO_CONFIGURADO' }, 500, origem, liberada)
  }

  // Só administrador logado. A origem sozinha não basta: um curl forja
  // o cabeçalho Origin em um segundo, mas não forja a assinatura RSA do
  // Google no token de login.
  const quem = await verificarLogin(pedido.headers.get('Authorization'))
  if (!quem || !ADMINISTRADORES.includes(quem)) {
    return responder({ erro: 'SEM_PERMISSAO' }, 401, origem, liberada)
  }

  let corpo = {}
  try {
    corpo = await pedido.json()
  } catch {
    // Corpo vazio é aceitável; os padrões abaixo assumem.
  }

  const pagina = Math.max(1, Math.min(50, Number(corpo.pagina) || 1))

  if (caminho === '/omie/contas') {
    const tipo = corpo.tipo === 'pagar' ? 'pagar' : 'receber'
    const endereco = tipo === 'pagar'
      ? 'https://app.omie.com.br/api/v1/financas/contapagar/'
      : 'https://app.omie.com.br/api/v1/financas/contareceber/'
    const chamada = tipo === 'pagar' ? 'ListarContasPagar' : 'ListarContasReceber'

    const dados = await chamarOmie(ambiente, endereco, chamada, {
      pagina,
      registros_por_pagina: 500,
      apenas_importado_api: 'N',
    })
    if (dados.erro) return responder(dados, 502, origem, liberada)

    const lista = dados.conta_pagar_cadastro || dados.conta_receber_cadastro || []
    return responder({
      pagina: dados.pagina || pagina,
      totalDePaginas: dados.total_de_paginas || 1,
      titulos: lista.map((titulo) => ({
        id: titulo.codigo_lancamento_omie,
        documento: titulo.numero_documento || '',
        clienteCodigo: titulo.codigo_cliente_fornecedor || 0,
        valor: Number(titulo.valor_documento) || 0,
        vencimento: dataOmie(titulo.data_vencimento),
        emissao: dataOmie(titulo.data_emissao),
        status: String(titulo.status_titulo || '').trim(),
      })),
    }, 200, origem, liberada)
  }

  if (caminho === '/omie/clientes') {
    const dados = await chamarOmie(ambiente,
      'https://app.omie.com.br/api/v1/geral/clientes/', 'ListarClientesResumido', {
        pagina,
        registros_por_pagina: 500,
      })
    if (dados.erro) return responder(dados, 502, origem, liberada)

    return responder({
      pagina: dados.pagina || pagina,
      totalDePaginas: dados.total_de_paginas || 1,
      clientes: (dados.clientes_cadastro_resumido || []).map((c) => ({
        codigo: c.codigo_cliente,
        nome: c.razao_social || c.nome_fantasia || '',
      })),
    }, 200, origem, liberada)
  }

  return responder({ erro: 'Rota desconhecida.' }, 404, origem, liberada)
}

async function chamarOmie(ambiente, endereco, chamada, parametros) {
  let resposta
  try {
    resposta = await fetch(endereco, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: chamada,
        app_key: ambiente.OMIE_APP_KEY,
        app_secret: ambiente.OMIE_APP_SECRET,
        param: [parametros],
      }),
    })
  } catch {
    return { erro: 'Não consegui falar com o OMIE agora.' }
  }

  const dados = await resposta.json().catch(() => null)

  // O OMIE devolve erro como {faultstring} mesmo com HTTP 500.
  if (!dados || dados.faultstring) {
    return { erro: dados?.faultstring || `O OMIE respondeu de forma inesperada (${resposta.status}).` }
  }
  return dados
}

/** "dd/mm/aaaa" → carimbo em milissegundos (meio-dia, contra fusos). */
function dataOmie(texto) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(texto || ''))
  if (!m) return null
  return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 15)
}

// ---------- Verificação do login do Firebase ----------

let chavesGoogle = null
let chavesValidasAte = 0

/**
 * Confere o token de login e devolve o e-mail de quem pediu.
 *
 * O token é um JWT assinado pelo Google (RS256). A verificação baixa as
 * chaves públicas do Google, valida a assinatura e confere que o token é
 * do projeto da PROMAC e ainda não venceu. Nada disso depende de
 * segredo: só de matemática.
 */
async function verificarLogin(autorizacao) {
  const token = String(autorizacao || '').replace(/^Bearer\s+/i, '')
  const partes = token.split('.')
  if (partes.length !== 3) return null

  let cabecalho, corpo
  try {
    cabecalho = JSON.parse(decodificarBase64Url(partes[0]))
    corpo = JSON.parse(decodificarBase64Url(partes[1]))
  } catch {
    return null
  }

  const agora = Math.floor(Date.now() / 1000)
  if (
    cabecalho.alg !== 'RS256'
    || corpo.aud !== PROJETO_FIREBASE
    || corpo.iss !== `https://securetoken.google.com/${PROJETO_FIREBASE}`
    || !corpo.email
    || Number(corpo.exp) < agora
  ) {
    return null
  }

  const chave = await chavePublica(cabecalho.kid)
  if (!chave) return null

  const dados = new TextEncoder().encode(`${partes[0]}.${partes[1]}`)
  const assinatura = bytesBase64Url(partes[2])

  const valida = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' }, chave, assinatura, dados
  )
  return valida ? String(corpo.email).toLowerCase() : null
}

async function chavePublica(kid) {
  if (!chavesGoogle || Date.now() > chavesValidasAte) {
    const resposta = await fetch(
      'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
    )
    if (!resposta.ok) return null
    chavesGoogle = (await resposta.json()).keys || []
    // O cabeçalho manda o prazo real; uma hora é um teto seguro.
    chavesValidasAte = Date.now() + 60 * 60 * 1000
  }

  const jwk = chavesGoogle.find((k) => k.kid === kid)
  if (!jwk) return null

  return crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  )
}

function decodificarBase64Url(texto) {
  return atob(texto.replace(/-/g, '+').replace(/_/g, '/'))
}

function bytesBase64Url(texto) {
  const cru = decodificarBase64Url(texto)
  const bytes = new Uint8Array(cru.length)
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i)
  return bytes
}
