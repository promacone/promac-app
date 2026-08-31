// Proposta comercial em PDF.
//
// Gera um arquivo PDF de verdade, com a biblioteca guardada dentro do
// próprio app (js/vendor) — funciona sem sinal, no meio da estrada.
//
// A primeira versão usava a impressão do navegador, mas o "Salvar como
// PDF" fica escondido num menu que ninguém acha, e no iPhone pior
// ainda. Com o arquivo pronto, o iPhone abre a folha de compartilhar
// (direto para o WhatsApp do cliente) e o computador baixa o PDF.
//
// A impressão continua aqui como plano B: se a biblioteca não carregar
// por qualquer motivo, a proposta ainda sai.

import { el, render } from './ui.js?v=20260831115307'
import { reais } from './frete.js?v=20260831115307'

/** Dados da PROMAC no rodapé. Ajustáveis no painel. */
export const EMPRESA_PADRAO = {
  nome: 'PROMAC TRANSPORTES',
  cnpj: '',
  endereco: '',
  telefone: '',
  email: 'comercial@promactransportes.com.br',
  validadeDias: 7,
}

// Cores da identidade, em RGB para o PDF.
const AZUL = [34, 166, 232]
const MARINHO = [15, 23, 48]
const TEXTO = [20, 24, 31]
const CINZA = [106, 115, 133]
const LINHA = [219, 227, 238]
const FUNDO_SUAVE = [244, 247, 251]

let bibliotecaPronta = null
let logoPronta = null

/**
 * Adianta o carregamento da biblioteca e da logo.
 *
 * As telas chamam isto ao montar. O motivo é o iPhone: a folha de
 * compartilhar só abre logo depois do toque no botão — se o toque ainda
 * tiver que baixar 360 KB de biblioteca, o navegador desiste do
 * compartilhamento.
 */
export function prepararProposta() {
  if (!bibliotecaPronta) {
    bibliotecaPronta = import('./vendor/jspdf.umd.min.js?v=20260831115307')
      .then(() => globalThis.jspdf)
      .catch(() => null)
  }

  if (!logoPronta) {
    logoPronta = new Promise((resolver) => {
      const imagem = new Image()
      imagem.onload = () => {
        // Achata a transparência sobre branco e vira JPEG: PNG com canal
        // alfa às vezes sai com fundo preto dentro do PDF.
        const tela = document.createElement('canvas')
        tela.width = imagem.naturalWidth
        tela.height = imagem.naturalHeight
        const pincel = tela.getContext('2d')
        pincel.fillStyle = '#ffffff'
        pincel.fillRect(0, 0, tela.width, tela.height)
        pincel.drawImage(imagem, 0, 0)
        resolver({
          dados: tela.toDataURL('image/jpeg', 0.92),
          proporcao: imagem.naturalHeight / imagem.naturalWidth,
        })
      }
      imagem.onerror = () => resolver(null)
      imagem.src = 'icones/logo.png?v=20260831114030'
    })
  }

  return Promise.all([bibliotecaPronta, logoPronta])
}

/** Monta a proposta e entrega: compartilhar no celular, baixar no computador. */
export async function gerarProposta(dados) {
  const empresa = { ...EMPRESA_PADRAO, ...(dados.empresa || {}) }
  const agora = new Date()

  const numero = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`
    + `${String(agora.getDate()).padStart(2, '0')}-`
    + `${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`

  const validade = new Date(agora.getTime() + (empresa.validadeDias || 7) * 86_400_000)

  const [biblioteca, logo] = await prepararProposta()

  if (!biblioteca) {
    imprimirComoAntes(dados, empresa, numero, validade)
    return
  }

  const pdf = desenharPdf(biblioteca, { dados, empresa, numero, validade, logo, agora })
  await entregar(pdf, numero)
}

// ---------- O desenho do PDF ----------

function desenharPdf(jspdf, { dados, empresa, numero, validade, logo, agora }) {
  const doc = new jspdf.jsPDF({ unit: 'mm', format: 'a4' })
  const MARGEM = 14
  const LARGURA = 210 - MARGEM * 2
  let y = 16

  const quebraSePrecisar = (altura) => {
    if (y + altura > 280) {
      doc.addPage()
      y = 16
    }
  }

  // Cabeçalho: logo à esquerda, identificação à direita.
  if (logo) {
    const larguraLogo = 58
    doc.addImage(logo.dados, 'JPEG', MARGEM, y, larguraLogo, larguraLogo * logo.proporcao)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...CINZA)
  doc.text('PROPOSTA COMERCIAL', 210 - MARGEM, y + 3, { align: 'right' })

  doc.setFontSize(14)
  doc.setTextColor(...TEXTO)
  doc.text(`Nº ${numero}`, 210 - MARGEM, y + 9.5, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text(agora.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }),
    210 - MARGEM, y + 14.5, { align: 'right' })

  y += 20
  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.8)
  doc.line(MARGEM, y, 210 - MARGEM, y)
  y += 6

  // Bloco do contratante.
  const linhasCliente = [
    ['CONTRATANTE', dados.cliente || '—'],
    dados.clienteCnpj ? ['CNPJ', dados.clienteCnpj] : null,
    ['MODALIDADE', dados.titulo],
  ].filter(Boolean)

  const alturaBloco = linhasCliente.length * 6 + 6
  doc.setFillColor(...FUNDO_SUAVE)
  doc.roundedRect(MARGEM, y, LARGURA, alturaBloco, 2, 2, 'F')

  let yBloco = y + 6.5
  for (const [chave, valor] of linhasCliente) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...CINZA)
    doc.text(chave, MARGEM + 5, yBloco)
    doc.setFontSize(10.5)
    doc.setTextColor(...TEXTO)
    doc.text(String(valor), MARGEM + 33, yBloco)
    yBloco += 6
  }
  y += alturaBloco + 7

  const secao = (titulo, linhas) => {
    const validas = (linhas || []).filter(Boolean)
    if (!validas.length) return

    quebraSePrecisar(10 + validas.length * 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...AZUL)
    doc.text(titulo.toUpperCase(), MARGEM, y)
    y += 1.8
    doc.setDrawColor(...LINHA)
    doc.setLineWidth(0.25)
    doc.line(MARGEM, y, 210 - MARGEM, y)
    y += 5.5

    doc.setFontSize(10)
    for (const [chave, valor, destaque] of validas) {
      doc.setFont('helvetica', destaque ? 'bold' : 'normal')
      doc.setTextColor(...TEXTO)
      doc.text(String(chave), MARGEM, y)
      doc.text(String(valor), 210 - MARGEM, y, { align: 'right' })
      y += 6
    }
    y += 3
  }

  secao('Rota', [
    ['Origem', dados.rota.origem || '—'],
    ['Destino', dados.rota.destino || '—'],
    dados.rota.km ? ['Distância', `${Math.round(dados.rota.km).toLocaleString('pt-BR')} km`] : null,
    dados.prazo ? ['Prazo estimado', dados.prazo] : null,
  ])

  secao('Carga', dados.carga)
  secao('Composição do frete', dados.valores)

  // A tarja do total.
  quebraSePrecisar(18)
  doc.setFillColor(...MARINHO)
  doc.roundedRect(MARGEM, y, LARGURA, 14, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('Valor total do frete', MARGEM + 6, y + 8.8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(reais(dados.total), 210 - MARGEM - 6, y + 9.4, { align: 'right' })
  y += 21

  // Condições.
  const condicoes = [
    `Proposta válida até ${validade.toLocaleDateString('pt-BR')}.`,
    'Valores sujeitos a conferência de peso e cubagem no embarque.',
    'Pedágio e GRIS conforme discriminado acima.',
    ...linhasDeObservacoes(dados.observacoes),
  ]

  quebraSePrecisar(10 + condicoes.length * 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...AZUL)
  doc.text('CONDIÇÕES', MARGEM, y)
  y += 1.8
  doc.setDrawColor(...LINHA)
  doc.line(MARGEM, y, 210 - MARGEM, y)
  y += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXTO)
  for (const item of condicoes) {
    const quebrado = doc.splitTextToSize(item, LARGURA - 6)
    quebraSePrecisar(quebrado.length * 4.4 + 1)
    doc.text('•', MARGEM + 1, y)
    doc.text(quebrado, MARGEM + 5, y)
    y += quebrado.length * 4.4 + 1.2
  }

  // Rodapé na base da página.
  const rodape = [
    empresa.nome,
    empresa.cnpj ? `CNPJ ${empresa.cnpj}` : null,
    empresa.endereco || null,
    [empresa.telefone, empresa.email].filter(Boolean).join(' · ') || null,
  ].filter(Boolean)

  let yRodape = 288 - rodape.length * 4
  doc.setDrawColor(...LINHA)
  doc.line(MARGEM, yRodape - 3.5, 210 - MARGEM, yRodape - 3.5)
  rodape.forEach((linha, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...(i === 0 ? TEXTO : CINZA))
    doc.text(linha, 105, yRodape, { align: 'center' })
    yRodape += 4
  })

  return doc
}

function linhasDeObservacoes(observacoes) {
  return (Array.isArray(observacoes) ? observacoes : [observacoes])
    .filter(Boolean)
    .flatMap((texto) => String(texto).split('\n'))
    .map((linha) => linha.trim())
    .filter(Boolean)
}

// ---------- A entrega ----------

async function entregar(doc, numero) {
  const nomeDoArquivo = `Proposta PROMAC ${numero}.pdf`
  const conteudo = doc.output('blob')
  const arquivo = new File([conteudo], nomeDoArquivo, { type: 'application/pdf' })

  // Guardado para diagnóstico: dá para inspecionar o último PDF gerado.
  window.__ultimaProposta = arquivo

  // No celular, a folha de compartilhar — de onde vai direto ao WhatsApp.
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nomeDoArquivo })
      return
    } catch (erro) {
      // Cancelar o compartilhamento não é erro; qualquer outra falha cai
      // para o download.
      if (erro && erro.name === 'AbortError') return
    }
  }

  // No computador, baixa o arquivo.
  const endereco = URL.createObjectURL(conteudo)
  const atalho = el('a', { href: endereco, download: nomeDoArquivo })
  document.body.append(atalho)
  atalho.click()
  atalho.remove()
  setTimeout(() => URL.revokeObjectURL(endereco), 30_000)
}

// ---------- Plano B: a impressão de antes ----------

function imprimirComoAntes(dados, empresa, numero, validade) {
  const folha = el('div', { classe: 'proposta' }, [
    el('div', { classe: 'proposta__topo' }, [
      el('img', { classe: 'proposta__logo', src: 'icones/logo.png?v=20260831115307', alt: 'PROMAC Transportes' }),
      el('div', { classe: 'proposta__identificacao' }, [
        el('div', { classe: 'proposta__rotulo', texto: 'Proposta comercial' }),
        el('div', { classe: 'proposta__numero', texto: `Nº ${numero}` }),
      ]),
    ]),
    el('div', { classe: 'proposta__cliente' }, [
      el('div', { classe: 'proposta__campo' }, [
        el('span', { classe: 'proposta__chave', texto: 'Contratante' }),
        el('span', { classe: 'proposta__valor', texto: dados.cliente || '—' }),
      ]),
      dados.clienteCnpj
        ? el('div', { classe: 'proposta__campo' }, [
            el('span', { classe: 'proposta__chave', texto: 'CNPJ' }),
            el('span', { classe: 'proposta__valor', texto: dados.clienteCnpj }),
          ])
        : null,
    ]),
    ...[['Rota', [
      ['Origem', dados.rota.origem || '—'],
      ['Destino', dados.rota.destino || '—'],
    ]], ['Carga', dados.carga], ['Composição do frete', dados.valores]].map(([titulo, linhas]) => {
      const validas = (linhas || []).filter(Boolean)
      if (!validas.length) return null
      return el('div', { classe: 'proposta__secao' }, [
        el('div', { classe: 'proposta__secaoTitulo', texto: titulo }),
        ...validas.map(([chave, valor]) => el('div', { classe: 'proposta__linha' }, [
          el('span', { texto: chave }),
          el('span', { classe: 'proposta__numeroValor', texto: valor }),
        ])),
      ])
    }),
    el('div', { classe: 'proposta__total' }, [
      el('span', { texto: 'Valor total do frete' }),
      el('strong', { texto: reais(dados.total) }),
    ]),
    el('div', { classe: 'proposta__rodape' }, [
      el('div', { texto: empresa.nome }),
      el('div', { texto: [empresa.telefone, empresa.email].filter(Boolean).join(' · ') }),
    ]),
  ])

  const area = document.querySelector('#area-proposta') || el('div', { id: 'area-proposta' })
  if (!area.parentNode) document.body.append(area)
  render(area, folha)
  document.body.classList.add('imprimindo')
  const limpar = () => {
    document.body.classList.remove('imprimindo')
    render(area, null)
    window.removeEventListener('afterprint', limpar)
  }
  window.addEventListener('afterprint', limpar)
  setTimeout(() => window.print(), 80)
}
