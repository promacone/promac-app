// Módulo Contabilidade: o quadro financeiro da PROMAC, mês a mês.
//
// Nasceu das duas planilhas do Pedro. A PROMAC FINANCEIRO entra inteira
// — despesas fixas, variáveis e receitas, lançamento a lançamento. Da
// planilha de vendas entram só dois números por mês, por decisão dele:
// o total vendido (coluna Frete) e o seguro. O resto daquela planilha
// (motorista, comissões, margem) fica fora do app.
//
// Módulo de administrador: as regras do servidor nem deixam o resto da
// equipe ler esta coleção.

import {
  bd, doc, setDoc, collection, getDocs, mensagemDeErro,
} from '../firebase.js?v=20260831154400'
import { reais } from '../frete.js?v=20260831154400'
import { el, render, campo, seletor, mostrarAviso, comCarregamento } from '../ui.js?v=20260831154400'

const STATUS_DESPESA = ['Pago', 'Pendente']
const STATUS_RECEITA = ['Recebido', 'A Vencer', 'Vencido']

export function telaContabilidade(sessao, repositorio) {
  // O repositório de verdade fala com o Firestore; o de teste, com a
  // memória. Mesma manobra do quadro de contratações.
  const repo = repositorio || {
    async listar() {
      const resultado = await getDocs(collection(bd, 'contabilidade'))
      const meses = {}
      resultado.forEach((d) => { meses[d.id] = d.data() })
      return meses
    },
    async salvar(id, mes) {
      await setDoc(doc(bd, 'contabilidade', id), mes)
    },
  }

  const estado = {
    meses: {},       // id -> dados do mês
    mesAtivo: null,
    carregando: true,
  }

  const avisoEl = el('div')
  const raiz = el('div', { style: 'display:grid;gap:14px' })

  // ---------- Servidor ----------

  async function carregar() {
    try {
      estado.meses = await repo.listar()
      const ids = Object.keys(estado.meses).sort().reverse()
      if (!estado.mesAtivo || !estado.meses[estado.mesAtivo]) estado.mesAtivo = ids[0] || null
    } catch (erro) {
      mostrarAviso(avisoEl, mensagemDeErro(erro))
    }
    estado.carregando = false
    desenhar()
  }

  async function salvarMes(id) {
    await repo.salvar(id, estado.meses[id])
  }

  // ---------- Contas do mês ----------

  function resumoDoMes(m) {
    const soma = (lista, filtro = () => true) =>
      (lista || []).filter(filtro).reduce((total, x) => total + (x.valor || 0), 0)

    const despesas = soma(m.despesas)
    const receitas = soma(m.receitas)
    return {
      despesas,
      receitas,
      resultado: receitas - despesas,
      despesasPendentes: soma(m.despesas, (x) => x.status === 'Pendente'),
      receitasAVencer: soma(m.receitas, (x) => x.status !== 'Recebido'),
    }
  }

  // ---------- Desenho ----------

  function desenhar() {
    const ids = Object.keys(estado.meses).sort().reverse()
    const m = estado.mesAtivo ? estado.meses[estado.mesAtivo] : null

    render(raiz,
      avisoEl,

      estado.carregando ? el('p', { classe: 'campo__ajuda', texto: 'Carregando…' }) : null,

      // Seletor de mês.
      ids.length
        ? el('div', { classe: 'tabelas-preco', style: `grid-template-columns:repeat(${Math.min(ids.length, 4)}, 1fr)` },
            ids.map((id) => el('button', {
              classe: `tabela-preco${estado.mesAtivo === id ? ' tabela-preco--ativa' : ''}`,
              onclick: () => { estado.mesAtivo = id; desenhar() },
            }, [
              el('span', { classe: 'tabela-preco__letra', texto: (estado.meses[id].titulo || id).split(' ')[0] }),
              el('span', { classe: 'tabela-preco__margem', texto: id.slice(0, 4) }),
            ])))
        : null,

      m ? cartoesDoMes(m) : null,
      m ? blocoLancamentos(m, 'Despesas fixas', (m.despesas || []).filter((x) => x.categoria === 'Fixa'), 'despesas') : null,
      m ? blocoLancamentos(m, 'Despesas variáveis', (m.despesas || []).filter((x) => x.categoria !== 'Fixa'), 'despesas') : null,
      m ? blocoLancamentos(m, 'Receitas', m.receitas || [], 'receitas') : null,
      m ? botaoNovoLancamento() : null,

      cartaoImportacao(),
    )
  }

  function cartoesDoMes(m) {
    const r = resumoDoMes(m)
    const v = m.vendas

    const cartao = (rotulo, valor, cor, nota) => el('div', { classe: 'cartao contador' }, [
      el('div', { classe: 'secao__titulo', texto: rotulo }),
      el('div', { classe: 'contador__numero', style: `color:${cor};font-size:22px`, texto: reais(valor) }),
      nota ? el('div', { classe: 'campo__ajuda', texto: nota }) : null,
    ])

    return el('div', {}, [
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        cartao('Receitas', r.receitas, 'var(--verde)',
          r.receitasAVencer > 0 ? `${reais(r.receitasAVencer)} ainda a receber` : 'tudo recebido'),
        cartao('Despesas', r.despesas, 'var(--vermelho)',
          r.despesasPendentes > 0 ? `${reais(r.despesasPendentes)} pendentes` : 'tudo pago'),
        cartao('Resultado do mês', r.resultado, r.resultado >= 0 ? 'var(--verde)' : 'var(--vermelho)'),
        v
          ? cartao('Vendas (CT-es)', v.totalVendas, 'var(--azul-vivo)',
              `${v.ctes} CT-es · seguro ${reais(v.seguro)}`)
          : cartao('Vendas (CT-es)', 0, 'var(--texto-fraco)', 'sem dados da planilha de vendas'),
      ]),
    ])
  }

  function blocoLancamentos(m, titulo, lista, tipo) {
    if (!lista.length) return null
    const total = lista.reduce((s, x) => s + (x.valor || 0), 0)

    return el('div', { classe: 'cartao' }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, [
        el('div', { classe: 'secao__titulo', texto: `${titulo} (${lista.length})` }),
        el('span', { style: 'font-weight:700;font-variant-numeric:tabular-nums', texto: reais(total) }),
      ]),
      el('div', { classe: 'lancamentos' }, lista.map((item) => linhaLancamento(m, item, tipo))),
    ])
  }

  function linhaLancamento(m, item, tipo) {
    const opcoes = tipo === 'receitas' ? STATUS_RECEITA : STATUS_DESPESA
    const pago = item.status === 'Pago' || item.status === 'Recebido'

    return el('div', { classe: 'lancamento' }, [
      el('div', { classe: 'lancamento__meio' }, [
        el('div', { classe: 'lancamento__nome', texto: item.descricao }),
        el('div', {
          classe: 'lancamento__detalhe',
          texto: [dataCurta(item.data), item.conta, item.observacao].filter(Boolean).join(' · '),
        }),
      ]),
      el('div', { classe: 'lancamento__lado' }, [
        el('div', { classe: 'lancamento__valor', texto: reais(item.valor || 0) }),
        el('button', {
          classe: `etiqueta-status${pago ? ' etiqueta-status--ok' : ''}`,
          texto: item.status || (tipo === 'receitas' ? 'A Vencer' : 'Pendente'),
          title: 'Toque para mudar o status',
          onclick: async (evento) => {
            // Gira entre os status possíveis e grava.
            const atual = opcoes.indexOf(item.status)
            item.status = opcoes[(atual + 1) % opcoes.length]
            evento.currentTarget.textContent = item.status
            try {
              await salvarMes(estado.mesAtivo)
              desenhar()
            } catch (erro) {
              mostrarAviso(avisoEl, mensagemDeErro(erro))
            }
          },
        }),
      ]),
    ])
  }

  // ---------- Novo lançamento ----------

  function botaoNovoLancamento() {
    return el('button', {
      classe: 'botao',
      texto: '+ Novo lançamento',
      onclick: abrirFormulario,
    })
  }

  function abrirFormulario() {
    const formulario = {
      tipo: 'despesaVariavel',
      descricao: '', valor: '', conta: '', data: hojeISO(), status: 'Pago', observacao: '',
    }

    const fundo = el('div', {
      style: 'position:fixed;inset:0;background:rgba(15,18,40,.5);z-index:50;display:grid;align-items:end',
      onclick: (e) => { if (e.target === fundo) fundo.remove() },
    })

    const avisoForm = el('div')
    const texto = (nome, exemplo, atributos = {}) => el('input', {
      type: 'text', placeholder: exemplo, value: formulario[nome],
      oninput: (e) => { formulario[nome] = e.target.value }, ...atributos,
    })

    fundo.append(el('div', {
      style: 'background:var(--fundo);border-radius:20px 20px 0 0;max-height:92dvh;overflow-y:auto;padding:20px 16px calc(env(safe-area-inset-bottom) + 20px);display:grid;gap:12px',
      onclick: (e) => e.stopPropagation(),
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('strong', { style: 'font-size:17px', texto: 'Novo lançamento' }),
        el('button', { classe: 'botao-secundario', texto: 'Fechar', onclick: () => fundo.remove() }),
      ]),
      el('div', { classe: 'cartao' }, [
        campo('Tipo', seletor(formulario.tipo, [
          { valor: 'despesaFixa', titulo: 'Despesa fixa' },
          { valor: 'despesaVariavel', titulo: 'Despesa variável' },
          { valor: 'receita', titulo: 'Receita' },
        ], (valor) => { formulario.tipo = valor })),
        campo('Descrição', texto('descricao', 'Ex.: Combustível')),
        campo('Valor (R$)', texto('valor', '0,00', { inputmode: 'decimal' })),
        campo('Conta bancária', texto('conta', 'Matriz')),
        campo('Data', el('input', {
          type: 'date', value: formulario.data,
          oninput: (e) => { formulario.data = e.target.value },
        })),
        campo('Status', seletor(formulario.status,
          [...new Set([...STATUS_DESPESA, ...STATUS_RECEITA])].map((s) => ({ valor: s, titulo: s })),
          (valor) => { formulario.status = valor })),
        campo('Observação', texto('observacao', '')),
      ]),
      avisoForm,
      el('button', {
        classe: 'botao',
        texto: 'Salvar lançamento',
        onclick: async (evento) => {
          const valor = parseFloat(String(formulario.valor).replace(/\./g, '').replace(',', '.'))
          if (!formulario.descricao.trim() || !Number.isFinite(valor) || valor <= 0) {
            mostrarAviso(avisoForm, 'Preencha a descrição e um valor maior que zero.')
            return
          }
          const item = {
            id: crypto.randomUUID(),
            descricao: formulario.descricao.trim(),
            valor: Math.round(valor * 100) / 100,
            conta: formulario.conta.trim(),
            data: formulario.data ? new Date(`${formulario.data}T12:00:00`).getTime() : null,
            status: formulario.status,
            observacao: formulario.observacao.trim(),
          }

          await comCarregamento(evento.currentTarget, async () => {
            try {
              const m = estado.meses[estado.mesAtivo]
              if (formulario.tipo === 'receita') {
                m.receitas = [...(m.receitas || []), item]
              } else {
                item.categoria = formulario.tipo === 'despesaFixa' ? 'Fixa' : 'Variável'
                m.despesas = [...(m.despesas || []), item]
              }
              await salvarMes(estado.mesAtivo)
              fundo.remove()
              desenhar()
            } catch (erro) {
              mostrarAviso(avisoForm, mensagemDeErro(erro))
            }
          })
        },
      }),
    ]))

    document.body.append(fundo)
  }

  // ---------- Importação ----------

  function cartaoImportacao() {
    const avisoImporta = el('div')
    const escolher = el('input', { type: 'file', accept: '.json', style: 'display:none' })

    escolher.addEventListener('change', async () => {
      const arquivo = escolher.files[0]
      escolher.value = ''
      if (!arquivo) return

      try {
        const dados = JSON.parse(await arquivo.text())
        if (!dados.meses) throw new Error('formato')

        let gravados = 0
        for (const [id, mes] of Object.entries(dados.meses)) {
          // Cada lançamento ganha uma identidade, para edição futura.
          for (const lista of [mes.despesas, mes.receitas]) {
            for (const item of lista || []) {
              if (!item.id) item.id = crypto.randomUUID()
            }
          }
          await repo.salvar(id, mes)
          gravados += 1
        }

        mostrarAviso(avisoImporta, `${gravados} meses importados. Os números já aparecem acima.`, 'ok')
        await carregar()
      } catch (erro) {
        mostrarAviso(avisoImporta,
          erro.message === 'formato'
            ? 'Este arquivo não parece ser a exportação da contabilidade.'
            : mensagemDeErro(erro))
      }
    })

    return el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Importar planilhas' }),
      el('p', {
        classe: 'campo__ajuda',
        texto: 'Recebe o arquivo de importação gerado a partir das planilhas (PROMAC FINANCEIRO e VENDAS). Importar um mês de novo substitui o que estava nele.',
      }),
      escolher,
      el('button', {
        classe: 'botao-secundario',
        texto: 'Escolher arquivo de importação',
        onclick: () => escolher.click(),
      }),
      avisoImporta,
    ])
  }

  carregar()
  desenhar()
  return raiz
}

function dataCurta(timestamp) {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function hojeISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
