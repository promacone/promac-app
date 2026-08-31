// Conversa com o OMIE, sempre pelo intermediário da Cloudflare.
//
// O app nunca fala com o OMIE direto: as chaves ficam no intermediário,
// e ele só atende administrador logado — manda junto o comprovante de
// login do Firebase, que o intermediário confere com o Google.

import { auth } from './firebase.js?v=20260831170046'

const INTERMEDIARIO = 'https://orange-leaf-09cd.pedrinho0999989.workers.dev'

async function chamar(rota, corpo) {
  const usuario = auth.currentUser
  if (!usuario) throw new Error('SEM_LOGIN')

  const token = await usuario.getIdToken()
  let resposta
  try {
    resposta = await fetch(`${INTERMEDIARIO}${rota}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(corpo || {}),
    })
  } catch {
    throw new Error('SEM_REDE')
  }

  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok || dados.erro) {
    throw new Error(dados.erro || `FALHA_${resposta.status}`)
  }
  return dados
}

/**
 * Todas as contas de um tipo, juntando as páginas.
 *
 * O teto de páginas é um guarda-corpo: 10 páginas são 5.000 títulos —
 * muito acima do movimento real — e um laço sem teto viraria espera
 * infinita se o OMIE devolvesse contagem errada.
 */
export async function listarContas(tipo) {
  const titulos = []
  let pagina = 1
  let totalDePaginas = 1

  while (pagina <= totalDePaginas && pagina <= 10) {
    const dados = await chamar('/omie/contas', { tipo, pagina })
    titulos.push(...(dados.titulos || []))
    totalDePaginas = dados.totalDePaginas || 1
    pagina += 1
  }

  return titulos
}

let clientesEmMemoria = null

/** Código → nome, para dar nome aos títulos. Uma busca por sessão. */
export async function mapaDeClientes() {
  if (clientesEmMemoria) return clientesEmMemoria

  const mapa = new Map()
  let pagina = 1
  let totalDePaginas = 1

  try {
    while (pagina <= totalDePaginas && pagina <= 10) {
      const dados = await chamar('/omie/clientes', { pagina })
      for (const c of dados.clientes || []) mapa.set(c.codigo, c.nome)
      totalDePaginas = dados.totalDePaginas || 1
      pagina += 1
    }
  } catch {
    // Sem os nomes a tela ainda funciona; mostra o número do documento.
  }

  clientesEmMemoria = mapa
  return mapa
}

/** Explica as falhas na língua de quem usa. */
export function erroDoOmie(erro) {
  const mensagens = {
    SEM_LOGIN: 'Entre de novo no app para consultar o OMIE.',
    SEM_REDE: 'Sem conexão com o intermediário. Confira a internet.',
    OMIE_NAO_CONFIGURADO: 'As chaves do OMIE ainda não foram guardadas no intermediário. O passo a passo está no arquivo ATIVAR-OMIE.md.',
    SEM_PERMISSAO: 'O intermediário recusou seu login. Só o administrador consulta o OMIE.',
  }
  return mensagens[erro?.message] || `O OMIE devolveu um erro: ${erro?.message || erro}`
}
