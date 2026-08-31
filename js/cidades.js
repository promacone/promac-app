// Busca de cidades brasileiras.
//
// A lista é a oficial do IBGE, com os 5.571 municípios. Digitar a cidade
// à mão no celular, em movimento, é onde o erro acontece — e um "Sao
// Paulo" sem acento ou um "Brasilia" digitado errado fazem a consulta de
// rota falhar depois de já ter gasto um crédito da Qualp.

import { el } from './ui.js?v=20260831110342'

let cidades = null
let carregando = null

/**
 * Carrega a lista uma vez e reaproveita.
 *
 * São 200 KB — pesado demais para vir junto com o app, leve demais para
 * incomodar quando o vendedor abre a cotação.
 */
async function carregar() {
  if (cidades) return cidades
  if (carregando) return carregando

  carregando = fetch('dados/cidades.json?v=20260831110342')
    .then((r) => r.json())
    .then((lista) => {
      cidades = lista.map(([nome, uf, busca]) => ({ nome, uf, busca }))
      return cidades
    })
    .catch(() => {
      // Sem a lista, o campo continua aceitando texto livre.
      cidades = []
      return cidades
    })

  return carregando
}

/** Tira acentos, para "sao" encontrar "São". */
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Procura cidades que combinam com o que foi digitado.
 *
 * Quem começa com o termo vem antes de quem só o contém: digitando "sao",
 * "São Paulo" deve aparecer antes de "Bom Jesus dos Perdões".
 */
export function procurar(termo, limite = 8, apenasUFs = null) {
  const alvo = normalizar(termo)
  if (!cidades || alvo.length < 2) return []

  // Permite digitar "sao paulo, sp" ou "sao paulo sp" e filtrar pela UF.
  const partes = alvo.split(/[,\s]+/)
  const possivelUF = partes.length > 1 && partes[partes.length - 1].length === 2
    ? partes.pop()
    : null
  const nomeBuscado = partes.join(' ')

  const comecam = []
  const contem = []

  for (const cidade of cidades) {
    // Restrição por região: a cotação fracionada só sugere destinos da
    // aba escolhida, senão o vendedor cota Manaus com preço de Curitiba.
    if (apenasUFs && !apenasUFs.includes(cidade.uf)) continue
    if (possivelUF && cidade.uf.toLowerCase() !== possivelUF) continue

    const posicao = cidade.busca.indexOf(nomeBuscado)
    if (posicao === 0) comecam.push(cidade)
    else if (posicao > 0) contem.push(cidade)

    if (comecam.length >= limite) break
  }

  return [...comecam, ...contem].slice(0, limite)
}

/**
 * Campo de cidade com sugestões.
 *
 * A escolha grava sempre "Cidade, UF" — formato que a Qualp entende sem
 * ambiguidade. Cidades de mesmo nome em estados diferentes são comuns no
 * Brasil, e sem a UF a rota sai errada.
 */
export function campoDeCidade({ valorInicial = '', placeholder, aoEscolher, apenasUFs = null }) {
  const entrada = el('input', {
    type: 'text',
    placeholder,
    value: valorInicial,
    autocapitalize: 'words',
    autocorrect: 'off',
    autocomplete: 'off',
    spellcheck: 'false',
  })

  const listaEl = el('div', { classe: 'sugestoes oculto' })
  let selecionado = -1
  let sugestoes = []

  carregar()

  function fechar() {
    listaEl.classList.add('oculto')
    selecionado = -1
  }

  function escolher(cidade) {
    const texto = `${cidade.nome}, ${cidade.uf}`
    entrada.value = texto
    fechar()
    if (aoEscolher) aoEscolher(texto)
  }

  function desenhar() {
    listaEl.replaceChildren()

    if (!sugestoes.length) {
      fechar()
      return
    }

    sugestoes.forEach((cidade, indice) => {
      listaEl.append(el('button', {
        type: 'button',
        classe: `sugestao${indice === selecionado ? ' sugestao--ativa' : ''}`,
        // mousedown em vez de click: o clique chega depois do blur, e o
        // campo já teria fechado a lista.
        onmousedown: (e) => { e.preventDefault(); escolher(cidade) },
      }, [
        el('span', { classe: 'sugestao__nome', texto: cidade.nome }),
        el('span', { classe: 'sugestao__uf', texto: cidade.uf }),
      ]))
    })

    listaEl.classList.remove('oculto')
  }

  entrada.addEventListener('input', async () => {
    await carregar()
    sugestoes = procurar(entrada.value, 8, apenasUFs)
    selecionado = -1
    desenhar()
    if (aoEscolher) aoEscolher(entrada.value)
  })

  entrada.addEventListener('focus', async () => {
    await carregar()
    sugestoes = procurar(entrada.value, 8, apenasUFs)
    desenhar()
  })

  entrada.addEventListener('blur', () => setTimeout(fechar, 120))

  entrada.addEventListener('keydown', (evento) => {
    if (listaEl.classList.contains('oculto')) return

    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault()
      const passo = evento.key === 'ArrowDown' ? 1 : -1
      selecionado = (selecionado + passo + sugestoes.length) % sugestoes.length
      desenhar()
    } else if (evento.key === 'Enter' && selecionado >= 0) {
      evento.preventDefault()
      escolher(sugestoes[selecionado])
    } else if (evento.key === 'Escape') {
      fechar()
    }
  })

  const raiz = el('div', { classe: 'campo-cidade' }, [entrada, listaEl])
  raiz.valor = () => entrada.value
  raiz.definir = (texto) => { entrada.value = texto }
  return raiz
}
