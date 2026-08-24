// Consulta de rota e pedágio.
//
// O site nunca fala direto com a Qualp: quem faz isso é um intermediário
// nosso, hospedado na Cloudflare, que guarda o token. Se o token viesse
// para cá, qualquer pessoa que abrisse a página poderia lê-lo e gastar
// os créditos do plano.

const INTERMEDIARIO = 'https://orange-leaf-09cd.pedrinho0999989.workers.dev'

/**
 * Descobre distância e pedágio entre duas cidades.
 *
 * Cada chamada gasta um crédito do plano da Qualp, então o resultado é
 * guardado e reaproveitado enquanto o vendedor mexe nos outros campos do
 * orçamento.
 */
export async function consultarRota({ origem, destino, eixos }) {
  const resposta = await fetch(INTERMEDIARIO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origem, destino, eixos }),
  })

  const dados = await resposta.json().catch(() => ({}))

  if (!resposta.ok) {
    throw new Error(dados.erro || 'Não consegui consultar a rota agora.')
  }

  return dados
}

/**
 * Guarda as rotas já consultadas nesta sessão.
 *
 * Cotar a mesma rota trocando só o valor da nota não deve gastar crédito
 * de novo — e a resposta volta instantânea.
 */
const memoria = new Map()

export async function rotaComMemoria({ origem, destino, eixos }) {
  const chave = `${origem.trim().toLowerCase()}|${destino.trim().toLowerCase()}|${eixos}`

  if (memoria.has(chave)) {
    return { ...memoria.get(chave), veioDaMemoria: true }
  }

  const rota = await consultarRota({ origem, destino, eixos })
  memoria.set(chave, rota)
  return { ...rota, veioDaMemoria: false }
}
