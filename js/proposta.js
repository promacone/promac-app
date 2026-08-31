// Proposta comercial em PDF.
//
// Gera pelo mecanismo de impressão do próprio navegador, e não por uma
// biblioteca de PDF. O motivo é prático: no iPhone, "Imprimir" abre a
// folha de compartilhamento, de onde a proposta vai direto para o
// WhatsApp do cliente — que é como a PROMAC manda orçamento hoje. Uma
// biblioteca geraria um arquivo que ainda precisaria ser salvo e
// procurado nos Arquivos.
//
// Também não carrega nada de fora: funciona sem sinal, no meio da
// estrada, que é onde o vendedor costuma estar.

import { el, render } from './ui.js?v=20260831114030'
import { reais } from './frete.js?v=20260831114030'

/** Dados da PROMAC no rodapé. Ajustáveis no painel. */
export const EMPRESA_PADRAO = {
  nome: 'PROMAC TRANSPORTES',
  cnpj: '',
  endereco: '',
  telefone: '',
  email: 'comercial@promactransportes.com.br',
  validadeDias: 7,
}

/**
 * Monta a proposta e manda imprimir.
 *
 * @param dados.cliente     para quem é a proposta
 * @param dados.titulo      "Frete fracionado" ou similar
 * @param dados.rota        { origem, destino, km }
 * @param dados.carga       linhas de descrição da carga
 * @param dados.valores     linhas [rótulo, valor] do preço
 * @param dados.total       o número que fecha a conta
 * @param dados.prazo       texto do prazo
 * @param dados.observacoes texto livre
 * @param dados.empresa     dados da PROMAC
 */
export function gerarProposta(dados) {
  const empresa = { ...EMPRESA_PADRAO, ...(dados.empresa || {}) }
  const agora = new Date()

  // Um número por dia e por horário, curto o bastante para o cliente
  // repetir no telefone.
  const numero = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`
    + `${String(agora.getDate()).padStart(2, '0')}-`
    + `${String(agora.getHours()).padStart(2, '0')}${String(agora.getMinutes()).padStart(2, '0')}`

  const validade = new Date(agora.getTime() + (empresa.validadeDias || 7) * 86_400_000)

  const folha = el('div', { classe: 'proposta' }, [
    el('div', { classe: 'proposta__topo' }, [
      el('img', { classe: 'proposta__logo', src: 'icones/logo.png?v=20260831114030', alt: 'PROMAC Transportes' }),
      el('div', { classe: 'proposta__identificacao' }, [
        el('div', { classe: 'proposta__rotulo', texto: 'Proposta comercial' }),
        el('div', { classe: 'proposta__numero', texto: `Nº ${numero}` }),
        el('div', { classe: 'proposta__data', texto: dataLonga(agora) }),
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
      el('div', { classe: 'proposta__campo' }, [
        el('span', { classe: 'proposta__chave', texto: 'Modalidade' }),
        el('span', { classe: 'proposta__valor', texto: dados.titulo }),
      ]),
    ]),

    secao('Rota', [
      ['Origem', dados.rota.origem || '—'],
      ['Destino', dados.rota.destino || '—'],
      dados.rota.km ? ['Distância', `${Math.round(dados.rota.km).toLocaleString('pt-BR')} km`] : null,
      dados.prazo ? ['Prazo estimado', dados.prazo] : null,
    ]),

    secao('Carga', dados.carga),

    secao('Composição do frete', dados.valores),

    el('div', { classe: 'proposta__total' }, [
      el('span', { texto: 'Valor total do frete' }),
      el('strong', { texto: reais(dados.total) }),
    ]),

    el('div', { classe: 'proposta__condicoes' }, [
      el('div', { classe: 'proposta__secaoTitulo', texto: 'Condições' }),
      el('ul', {}, [
        el('li', { texto: `Proposta válida até ${dataCurta(validade)}.` }),
        el('li', { texto: 'Valores sujeitos a conferência de peso e cubagem no embarque.' }),
        el('li', { texto: 'Pedágio e GRIS conforme discriminado acima.' }),
        // Observações do vendedor: cada linha digitada vira um item, para
        // a lista sair alinhada com as condições fixas.
        ...listaDeObservacoes(dados.observacoes),
      ]),
    ]),

    el('div', { classe: 'proposta__rodape' }, [
      el('div', { texto: empresa.nome }),
      empresa.cnpj ? el('div', { texto: `CNPJ ${empresa.cnpj}` }) : null,
      empresa.endereco ? el('div', { texto: empresa.endereco }) : null,
      el('div', { texto: [empresa.telefone, empresa.email].filter(Boolean).join(' · ') }),
    ]),
  ])

  imprimir(folha)
}

/** Aceita texto (com quebras de linha) ou lista; devolve os <li>. */
function listaDeObservacoes(observacoes) {
  const linhas = (Array.isArray(observacoes) ? observacoes : [observacoes])
    .filter(Boolean)
    .flatMap((texto) => String(texto).split('\n'))
    .map((linha) => linha.trim())
    .filter(Boolean)

  return linhas.map((linha) => el('li', { texto: linha }))
}

function secao(titulo, linhas) {
  const validas = (linhas || []).filter(Boolean)
  if (!validas.length) return null

  return el('div', { classe: 'proposta__secao' }, [
    el('div', { classe: 'proposta__secaoTitulo', texto: titulo }),
    ...validas.map(([chave, valor, destaque]) =>
      el('div', { classe: `proposta__linha${destaque ? ' proposta__linha--destaque' : ''}` }, [
        el('span', { texto: chave }),
        el('span', { classe: 'proposta__numeroValor', texto: valor }),
      ])),
  ])
}

/**
 * Coloca a folha na página, imprime e limpa.
 *
 * A folha fica no documento (e não numa janela nova) porque o Safari do
 * iPhone bloqueia janelas abertas por código, e uma janela nova perderia
 * o estilo e a logo.
 */
function imprimir(folha) {
  const area = document.querySelector('#area-proposta')
    || el('div', { id: 'area-proposta' })

  if (!area.parentNode) document.body.append(area)
  render(area, folha)
  document.body.classList.add('imprimindo')

  const limpar = () => {
    document.body.classList.remove('imprimindo')
    render(area, null)
    window.removeEventListener('afterprint', limpar)
  }
  window.addEventListener('afterprint', limpar)

  // A logo precisa estar carregada antes de imprimir, senão sai em
  // branco no PDF.
  const logo = folha.querySelector('img')
  const seguir = () => setTimeout(() => window.print(), 60)

  if (logo && !logo.complete) {
    logo.addEventListener('load', seguir, { once: true })
    logo.addEventListener('error', seguir, { once: true })
  } else {
    seguir()
  }
}

function dataLonga(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function dataCurta(d) {
  return d.toLocaleDateString('pt-BR')
}
