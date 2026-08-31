// Módulo Contabilidade — primeira versão, ligada ao OMIE.
//
// O Pedro ainda vai desenhar este quadro do jeito dele; o que existe
// aqui é o encanamento funcionando e uma leitura simples: as contas a
// pagar e a receber do OMIE, ao vivo, separadas em atrasadas, de hoje e
// próximas. Nada é gravado — o OMIE continua sendo o dono dos dados.

import { listarContas, mapaDeClientes, erroDoOmie } from '../omie.js?v=20260831170046'
import { reais } from '../frete.js?v=20260831170046'
import { el, render, mostrarAviso } from '../ui.js?v=20260831170046'

// Um título é "aberto" quando o OMIE não o marca como liquidado.
const FECHADOS = new Set(['PAGO', 'RECEBIDO', 'LIQUIDADO', 'CANCELADO'])

export function telaContabilidade() {
  const estado = {
    aba: 'receber',
    titulos: { receber: null, pagar: null },
    clientes: new Map(),
    erro: null,
    carregando: true,
  }

  const raiz = el('div', { style: 'display:grid;gap:14px' })

  async function carregar() {
    estado.carregando = true
    estado.erro = null
    desenhar()

    try {
      const [receber, pagar, clientes] = await Promise.all([
        listarContas('receber'),
        listarContas('pagar'),
        mapaDeClientes(),
      ])
      estado.titulos = { receber, pagar }
      estado.clientes = clientes
    } catch (erro) {
      estado.erro = erroDoOmie(erro)
    }

    estado.carregando = false
    desenhar()
  }

  function abertas(tipo) {
    return (estado.titulos[tipo] || [])
      .filter((t) => !FECHADOS.has(t.status.toUpperCase()))
      .sort((a, b) => (a.vencimento || 0) - (b.vencimento || 0))
  }

  function desenhar() {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const inicioDeHoje = hoje.getTime()
    const fimDeHoje = inicioDeHoje + 86_400_000

    const lista = abertas(estado.aba)
    const grupos = {
      atrasadas: lista.filter((t) => t.vencimento && t.vencimento < inicioDeHoje),
      hoje: lista.filter((t) => t.vencimento >= inicioDeHoje && t.vencimento < fimDeHoje),
      proximas: lista.filter((t) => !t.vencimento || t.vencimento >= fimDeHoje),
    }
    const soma = (grupo) => grupo.reduce((total, t) => total + t.valor, 0)

    render(raiz,
      estado.erro
        ? el('div', { classe: 'aviso aviso--atencao', texto: estado.erro })
        : null,

      estado.carregando
        ? el('p', { classe: 'campo__ajuda', texto: 'Consultando o OMIE…' })
        : null,

      // A pagar / a receber.
      el('div', { classe: 'abas' }, [
        ['receber', 'A receber'], ['pagar', 'A pagar'],
      ].map(([id, titulo]) => el('button', {
        classe: `aba${estado.aba === id ? ' aba--ativa' : ''}`,
        texto: titulo,
        onclick: () => { estado.aba = id; desenhar() },
      }))),

      !estado.carregando && !estado.erro
        ? el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px' }, [
            cartao('Atrasadas', soma(grupos.atrasadas), grupos.atrasadas.length, 'var(--vermelho)'),
            cartao('Vencem hoje', soma(grupos.hoje), grupos.hoje.length, 'var(--amarelo)'),
            cartao('Próximas', soma(grupos.proximas), grupos.proximas.length, 'var(--azul-vivo)'),
          ])
        : null,

      bloco('Atrasadas', grupos.atrasadas, 'var(--vermelho)'),
      bloco('Vencem hoje', grupos.hoje, 'var(--amarelo)'),
      bloco('Próximas', grupos.proximas, 'var(--azul-vivo)'),

      !estado.carregando && !estado.erro && !lista.length
        ? el('p', { classe: 'campo__ajuda', style: 'text-align:center', texto: 'Nenhum título em aberto neste lado. 🎉' })
        : null,

      el('button', {
        classe: 'botao-secundario',
        texto: 'Atualizar do OMIE',
        onclick: carregar,
      }),
    )
  }

  function cartao(rotulo, valor, quantos, cor) {
    return el('div', { classe: 'cartao contador', style: 'padding:12px' }, [
      el('div', { classe: 'secao__titulo', texto: rotulo }),
      el('div', { classe: 'contador__numero', style: `color:${cor};font-size:18px`, texto: reais(valor) }),
      el('div', { classe: 'campo__ajuda', texto: `${quantos} título${quantos === 1 ? '' : 's'}` }),
    ])
  }

  function bloco(titulo, grupo, cor) {
    if (!grupo.length) return null
    return el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', style: `color:${cor}`, texto: `${titulo} (${grupo.length})` }),
      el('div', { classe: 'lancamentos' }, grupo.slice(0, 80).map((t) => linha(t))),
      grupo.length > 80
        ? el('p', { classe: 'campo__ajuda', texto: `… e mais ${grupo.length - 80} títulos.` })
        : null,
    ])
  }

  function linha(t) {
    const nome = estado.clientes.get(t.clienteCodigo) || `Doc ${t.documento || t.id}`
    return el('div', { classe: 'lancamento' }, [
      el('div', { classe: 'lancamento__meio' }, [
        el('div', { classe: 'lancamento__nome', texto: nome }),
        el('div', {
          classe: 'lancamento__detalhe',
          texto: [dataCurta(t.vencimento), t.documento && `Doc ${t.documento}`, t.status]
            .filter(Boolean).join(' · '),
        }),
      ]),
      el('div', { classe: 'lancamento__valor', texto: reais(t.valor) }),
    ])
  }

  carregar()
  return raiz
}

function dataCurta(timestamp) {
  if (!timestamp) return 'sem vencimento'
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
