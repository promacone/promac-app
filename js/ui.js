// Ajudantes para montar tela sem repetir código de DOM.

/** Cria um elemento com classe, texto, atributos e filhos. */
export function el(tag, opcoes = {}, filhos = []) {
  const node = document.createElement(tag)
  const { classe, texto, html, ...atributos } = opcoes

  if (classe) node.className = classe
  if (texto !== undefined) node.textContent = texto
  if (html !== undefined) node.innerHTML = html

  for (const [chave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue
    if (chave.startsWith('on') && typeof valor === 'function') {
      node.addEventListener(chave.slice(2).toLowerCase(), valor)
    } else if (chave === 'dataset') {
      Object.assign(node.dataset, valor)
    } else {
      node.setAttribute(chave, valor === true ? '' : valor)
    }
  }

  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined || filho === false) continue
    node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)))
  }

  return node
}

export const $ = (seletor) => document.querySelector(seletor)

/** Troca o conteúdo de um container. */
export function render(container, ...conteudo) {
  container.replaceChildren(...conteudo.flat().filter(Boolean))
}

/** Caixa de aviso colorida. */
export function aviso(texto, tipo = 'erro') {
  return el('div', { classe: `aviso aviso--${tipo}`, texto })
}

/** Mostra um aviso dentro de um container, ou limpa se texto for vazio. */
export function mostrarAviso(container, texto, tipo = 'erro') {
  if (!container) return
  render(container, texto ? aviso(texto, tipo) : null)
}

/** Campo de formulário com rótulo. */
export function campo(rotulo, input, ajuda) {
  return el('div', { classe: 'campo' }, [
    el('label', { texto: rotulo }),
    input,
    ajuda ? el('span', { classe: 'campo__ajuda', texto: ajuda }) : null,
  ])
}

/** Linha de rótulo e valor, como as do resumo de preço. */
export function linha(rotulo, valor, destaque = false) {
  return el('div', { classe: `linha${destaque ? ' linha--destaque' : ''}` }, [
    el('span', { classe: 'linha__rotulo', texto: rotulo }),
    el('span', { classe: 'linha__valor', texto: valor }),
  ])
}

/** Seletor com opções. */
export function seletor(valorAtual, opcoes, aoMudar) {
  const select = el('select', { onchange: (e) => aoMudar(e.target.value) })
  for (const { valor, titulo } of opcoes) {
    select.append(el('option', {
      value: valor,
      texto: titulo,
      selected: String(valor) === String(valorAtual),
    }))
  }
  return select
}

/** Deixa um botão em estado de carregando enquanto a tarefa roda. */
export async function comCarregamento(botao, tarefa) {
  const original = botao.textContent
  botao.disabled = true
  render(botao, el('span', { classe: 'carregando' }))
  try {
    return await tarefa()
  } finally {
    botao.disabled = false
    botao.textContent = original
  }
}

/** Ícone da barra de abas. */
export function icone(caminho) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'currentColor')
  svg.innerHTML = `<path d="${caminho}"/>`
  return svg
}

export const ICONES = {
  cotacao: 'M12 2a10 10 0 100 20 10 10 0 000-20zm1 15.5v1.5h-2v-1.46c-1.4-.2-2.6-1.05-2.9-2.54h1.9c.2.7.9 1.2 2 1.2 1.15 0 1.7-.5 1.7-1.15 0-.6-.4-1-1.8-1.35-2.2-.5-3.4-1.3-3.4-2.9 0-1.4 1.05-2.35 2.5-2.6V6.5h2v1.7c1.35.28 2.3 1.15 2.5 2.5h-1.9c-.15-.7-.7-1.15-1.6-1.15-1 0-1.5.45-1.5 1.05 0 .55.45.95 1.9 1.3 2.2.5 3.3 1.35 3.3 2.95 0 1.5-1.1 2.4-2.7 2.65z',
  contratacoes: 'M3 4h5v16H3V4zm6.5 0h5v16h-5V4zM16 4h5v16h-5V4z',
  equipe: 'M16 11a3 3 0 100-6 3 3 0 000 6zm-8 0a3 3 0 100-6 3 3 0 000 6zm0 2c-2.7 0-8 1.34-8 4v3h10v-3c0-.9.35-2.05 1.2-3-1.1-.65-2.4-1-3.2-1zm8 0c-.6 0-1.35.1-2.15.3C15.1 14.4 16 15.8 16 17v3h8v-3c0-2.66-5.3-4-8-4z',
  configuracoes: 'M19.14 12.94a7.07 7.07 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.58.24-1.12.56-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.67 8.84a.5.5 0 00.12.64l2.03 1.58a7.07 7.07 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.12-.56 1.62-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 1112 8.5a3.5 3.5 0 010 7z',
  conta: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z',
}
