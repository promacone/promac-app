// Quadro de contratações: cada coluna é uma etapa, cada cartão é uma
// carga. No celular as colunas deslizam na horizontal; o cartão muda de
// etapa por botões dentro dele — arrastar com o dedo brigaria com a
// rolagem da página.

import {
  bd, doc, setDoc, deleteDoc, collection, getDocs,
} from '../firebase.js'
import { reais } from '../frete.js'
import { el, render, campo, mostrarAviso, seletor } from '../ui.js'

export const ESTAGIOS = [
  { id: 'coleta', titulo: 'Coleta', cor: '#737d8c' },
  { id: 'motoristaAContratar', titulo: 'Motorista a Contratar', cor: '#f2b317' },
  { id: 'motoristaContratado', titulo: 'Motorista Contratado', cor: '#22a6e8' },
  { id: 'emRota', titulo: 'Em Rota', cor: '#252a5e' },
  { id: 'entregue', titulo: 'Entregue', cor: '#22a05c' },
]

const VEICULOS = ['VUC', '3/4', 'Toco', 'Truck', 'Carreta', 'Bitrem', 'Van', 'Outro']
const PRIORIDADES = [
  { id: 'normal', titulo: 'Normal' },
  { id: 'urgente', titulo: 'Urgente' },
  { id: 'prioritaria', titulo: 'Prioritária' },
]

function estagio(id) {
  return ESTAGIOS.find((e) => e.id === id) || ESTAGIOS[0]
}

/**
 * Move a carga de etapa, carimbando a hora quando a mudança tem
 * significado: a saída e a entrega são registradas no momento em que
 * acontecem — depois ninguém lembra o horário, e é justamente o que o
 * cliente pergunta.
 */
function movido(frete, destino) {
  const alterado = { ...frete, estagio: destino }
  const agora = Date.now()

  if (destino === 'emRota') {
    alterado.saiuEm = frete.saiuEm || agora
    alterado.entregueEm = null
  } else if (destino === 'entregue') {
    alterado.saiuEm = frete.saiuEm || agora
    alterado.entregueEm = frete.entregueEm || agora
  } else {
    // Voltar atrás desfaz os carimbos: manter uma hora de saída num frete
    // que voltou para "a contratar" seria mentira no relatório.
    alterado.saiuEm = null
    alterado.entregueEm = null
  }

  return alterado
}

export function telaContratacoes(sessao) {
  const estado = { fretes: [], busca: '', carregando: true }
  const raiz = el('div', { style: 'display:grid;gap:14px' })
  const avisoEl = el('div')

  async function carregar() {
    try {
      const resultado = await getDocs(collection(bd, 'viagens'))
      estado.fretes = resultado.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))
      mostrarAviso(avisoEl, '')
    } catch {
      mostrarAviso(avisoEl, 'Não consegui carregar os fretes agora.')
    }
    estado.carregando = false
    desenhar()
  }

  async function salvar(frete) {
    const { id, ...campos } = frete
    try {
      await setDoc(doc(bd, 'viagens', id), campos)
      await carregar()
    } catch {
      mostrarAviso(avisoEl, 'Não consegui salvar. Tente de novo.')
    }
  }

  async function apagar(id) {
    try {
      await deleteDoc(doc(bd, 'viagens', id))
      await carregar()
    } catch {
      mostrarAviso(avisoEl, 'Não consegui apagar. Tente de novo.')
    }
  }

  function filtrados() {
    const termo = estado.busca.trim().toLowerCase()
    if (!termo) return estado.fretes
    return estado.fretes.filter((f) =>
      [f.cliente, f.cidadeColeta, f.cidadeEntrega, f.motoristaNome, f.placa]
        .some((valor) => (valor || '').toLowerCase().includes(termo)))
  }

  function desenhar() {
    const lista = filtrados()
    const emAberto = lista.filter((f) => f.estagio !== 'entregue')
    const entregues = lista.filter((f) => f.estagio === 'entregue')

    render(raiz,
      avisoEl,

      // Totais e ações.
      el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        totalizador('Em aberto', emAberto, 'var(--azul)'),
        totalizador('Entregues', entregues, 'var(--verde)'),
      ]),

      el('input', {
        type: 'search',
        placeholder: 'Buscar cliente, cidade, motorista ou placa',
        value: estado.busca,
        oninput: (e) => { estado.busca = e.target.value; desenharColunas() },
      }),

      el('button', {
        classe: 'botao',
        texto: '+ Novo frete',
        onclick: () => abrirFormulario(null),
      }),

      areaColunas,
    )

    desenharColunas()
  }

  const areaColunas = el('div', {
    style: 'display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;margin:0 -16px;padding-left:16px;padding-right:16px;-webkit-overflow-scrolling:touch',
  })

  function desenharColunas() {
    const lista = filtrados()

    render(areaColunas, ESTAGIOS.map((etapa) => {
      const cartoes = lista
        .filter((f) => f.estagio === etapa.id)
        .sort((a, b) => (a.previsaoEntrega || 0) - (b.previsaoEntrega || 0))

      return el('div', {
        style: 'min-width:270px;max-width:270px;background:rgba(0,0,0,.04);border-radius:14px;padding:10px;display:grid;gap:10px;align-content:start',
      }, [
        el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
          el('span', { style: `width:10px;height:10px;border-radius:50%;background:${etapa.cor}` }),
          el('strong', { style: 'font-size:13px;flex:1', texto: etapa.titulo }),
          el('span', {
            style: `background:${etapa.cor};color:#fff;font-size:11px;font-weight:700;border-radius:99px;padding:2px 8px`,
            texto: String(cartoes.length),
          }),
        ]),
        ...(cartoes.length
          ? cartoes.map(cartao)
          : [el('div', { classe: 'campo__ajuda', style: 'text-align:center;padding:18px 0', texto: 'Vazio' })]),
      ])
    }))
  }

  function totalizador(titulo, fretes, cor) {
    const soma = fretes.reduce((total, f) => total + (f.valorFrete || 0), 0)
    return el('div', { classe: 'cartao', style: 'padding:12px' }, [
      el('div', { classe: 'secao__titulo', texto: titulo }),
      el('div', { style: `font-weight:800;font-size:18px;color:${cor}`, texto: reais(soma) }),
      el('div', { classe: 'campo__ajuda', texto: `${fretes.length} frete${fretes.length === 1 ? '' : 's'}` }),
    ])
  }

  function cartao(frete) {
    const etapa = estagio(frete.estagio)
    const atrasado = frete.estagio !== 'entregue'
      && frete.previsaoEntrega && frete.previsaoEntrega < Date.now()

    const indice = ESTAGIOS.findIndex((e) => e.id === frete.estagio)
    const anterior = ESTAGIOS[indice - 1]
    const proximo = ESTAGIOS[indice + 1]

    return el('div', {
      classe: 'cartao',
      style: `padding:12px;border-left:4px solid ${etapa.cor};display:grid;gap:8px;cursor:pointer`,
      onclick: () => abrirFormulario(frete),
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:start' }, [
        el('strong', { style: 'font-size:14px;color:var(--azul)', texto: frete.cliente || 'Sem cliente' }),
        frete.prioridade && frete.prioridade !== 'normal'
          ? el('span', {
              style: `font-size:9px;font-weight:800;color:#fff;border-radius:99px;padding:2px 7px;background:${frete.prioridade === 'urgente' ? 'var(--vermelho)' : 'var(--amarelo)'}`,
              texto: frete.prioridade === 'urgente' ? 'URGENTE' : 'PRIORITÁRIA',
            })
          : null,
      ]),

      el('div', { style: 'font-size:12px;color:var(--texto-fraco)' }, [
        el('div', { texto: `↑ ${frete.cidadeColeta || '—'}` }),
        el('div', { texto: `↓ ${frete.cidadeEntrega || '—'}` }),
      ]),

      frete.motoristaNome && indice >= 2
        ? el('div', { style: 'font-size:12px;color:var(--azul-claro)' }, [
            el('div', { texto: `👤 ${frete.motoristaNome}` }),
            frete.placa ? el('div', { texto: `🚚 ${String(frete.placa).toUpperCase()}` }) : null,
            frete.motoristaTelefone ? el('div', { texto: `📞 ${frete.motoristaTelefone}` }) : null,
          ])
        : null,

      frete.estagio === 'emRota' && frete.saiuEm
        ? el('div', { classe: 'campo__ajuda', texto: `Saiu em ${dataHora(frete.saiuEm)}` })
        : null,
      frete.estagio === 'entregue' && frete.entregueEm
        ? el('div', { classe: 'campo__ajuda', texto: `Entregue em ${dataHora(frete.entregueEm)}` })
        : null,

      el('div', { style: 'display:flex;justify-content:space-between;font-size:12px' }, [
        el('span', { classe: 'campo__ajuda', texto: frete.tipoVeiculo || '' }),
        el('strong', { style: 'color:var(--azul)', texto: reais(frete.valorFrete || 0) }),
      ]),

      frete.previsaoEntrega
        ? el('div', {
            classe: 'campo__ajuda',
            style: atrasado ? 'color:var(--vermelho);font-weight:700' : '',
            texto: `${atrasado ? '⚠ ' : ''}Entrega: ${dataCurta(frete.previsaoEntrega)}`,
          })
        : null,

      // Botões de mover: no celular, arrastar brigaria com a rolagem.
      el('div', { style: 'display:flex;gap:8px', onclick: (e) => e.stopPropagation() }, [
        anterior
          ? el('button', {
              classe: 'botao',
              style: 'background:transparent;color:var(--cinza);border:1.5px solid var(--borda);min-height:38px;padding:6px;font-size:12px',
              texto: `← ${anterior.titulo}`,
              onclick: () => salvar(movido(frete, anterior.id)),
            })
          : null,
        proximo
          ? el('button', {
              classe: 'botao',
              style: `min-height:38px;padding:6px;font-size:12px;background:${etapa.cor}`,
              texto: `${proximo.titulo} →`,
              onclick: () => salvar(movido(frete, proximo.id)),
            })
          : null,
      ]),
    ])
  }

  // ---------- Formulário ----------

  function abrirFormulario(freteExistente) {
    const ehNovo = !freteExistente
    const frete = freteExistente ? { ...freteExistente } : {
      id: crypto.randomUUID(),
      cliente: '', cidadeColeta: '', cidadeEntrega: '',
      dataColeta: hojeISO(), previsaoEntrega: hojeISO(1),
      tipoVeiculo: 'Truck', valorFrete: 0, valorMotorista: 0,
      motoristaNome: '', motoristaTelefone: '', placa: '',
      prioridade: 'normal', observacoes: '',
      estagio: 'coleta', saiuEm: null, entregueEm: null,
      criadoEm: Date.now(),
    }

    // Datas viajam como timestamp; o formulário fala em AAAA-MM-DD.
    const formulario = {
      ...frete,
      dataColeta: paraISO(frete.dataColeta),
      previsaoEntrega: paraISO(frete.previsaoEntrega),
    }

    const fundo = el('div', {
      style: 'position:fixed;inset:0;background:rgba(15,18,40,.5);z-index:50;display:grid;align-items:end',
      onclick: (e) => { if (e.target === fundo) fechar() },
    })

    function fechar() { fundo.remove() }

    const texto = (nome, placeholder, atributos = {}) => el('input', {
      type: 'text', placeholder, value: formulario[nome] ?? '',
      oninput: (e) => { formulario[nome] = e.target.value }, ...atributos,
    })
    const dinheiro = (nome) => el('input', {
      type: 'number', inputmode: 'decimal', step: '0.01', min: '0',
      value: formulario[nome] || '',
      oninput: (e) => { formulario[nome] = parseFloat(e.target.value) || 0 },
    })
    const data = (nome) => el('input', {
      type: 'date', value: formulario[nome],
      oninput: (e) => { formulario[nome] = e.target.value },
    })

    const avisoForm = el('div')

    fundo.append(el('div', {
      style: 'background:var(--fundo);border-radius:20px 20px 0 0;max-height:92dvh;overflow-y:auto;padding:20px 16px calc(env(safe-area-inset-bottom) + 20px);display:grid;gap:12px',
      onclick: (e) => e.stopPropagation(),
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('strong', { style: 'font-size:17px', texto: ehNovo ? 'Novo frete' : 'Editar frete' }),
        el('button', { classe: 'botao-secundario', texto: 'Fechar', onclick: fechar }),
      ]),

      el('div', { classe: 'cartao' }, [
        campo('Cliente', texto('cliente', 'Nome do cliente')),
        campo('Cidade de coleta', texto('cidadeColeta', 'Ex.: Ponta Grossa, PR', { autocorrect: 'off' })),
        campo('Cidade de entrega', texto('cidadeEntrega', 'Ex.: Belo Horizonte, MG', { autocorrect: 'off' })),
        campo('Data da coleta', data('dataColeta')),
        campo('Previsão de entrega', data('previsaoEntrega')),
      ]),

      el('div', { classe: 'cartao' }, [
        campo('Tipo de veículo', seletor(formulario.tipoVeiculo,
          VEICULOS.map((v) => ({ valor: v, titulo: v })),
          (valor) => { formulario.tipoVeiculo = valor })),
        campo('Status da carga', seletor(formulario.prioridade,
          PRIORIDADES.map((p) => ({ valor: p.id, titulo: p.titulo })),
          (valor) => { formulario.prioridade = valor })),
        campo('Valor do frete (R$)', dinheiro('valorFrete')),
        campo('Pago ao motorista (R$)', dinheiro('valorMotorista')),
      ]),

      el('div', { classe: 'cartao' }, [
        campo('Nome do motorista', texto('motoristaNome', 'Nome')),
        campo('Telefone', texto('motoristaTelefone', '(00) 00000-0000', { inputmode: 'tel' })),
        campo('Placa do veículo', texto('placa', 'ABC1D23', { autocapitalize: 'characters' })),
        campo('Etapa', seletor(formulario.estagio,
          ESTAGIOS.map((e) => ({ valor: e.id, titulo: e.titulo })),
          (valor) => { formulario.estagio = valor })),
        campo('Observações', el('textarea', {
          rows: 3, placeholder: 'Anotações sobre a carga',
          value: formulario.observacoes || '',
          oninput: (e) => { formulario.observacoes = e.target.value },
        })),
      ]),

      avisoForm,

      el('button', {
        classe: 'botao',
        texto: ehNovo ? 'Cadastrar frete' : 'Salvar alterações',
        onclick: async () => {
          if (!formulario.cliente.trim() || !formulario.cidadeColeta.trim() || !formulario.cidadeEntrega.trim()) {
            mostrarAviso(avisoForm, 'Preencha cliente, coleta e entrega.')
            return
          }
          const pronto = movido({
            ...formulario,
            dataColeta: deISO(formulario.dataColeta),
            previsaoEntrega: deISO(formulario.previsaoEntrega),
          }, formulario.estagio)
          await salvar(pronto)
          fechar()
        },
      }),

      ehNovo ? null : el('button', {
        classe: 'botao botao-perigo',
        texto: 'Apagar frete',
        onclick: async () => {
          if (confirm(`Apagar o frete de ${frete.cliente || 'sem cliente'}? Isso não pode ser desfeito.`)) {
            await apagar(frete.id)
            fechar()
          }
        },
      }),
    ]))

    document.body.append(fundo)
  }

  desenhar()
  carregar()
  return raiz
}

// ---------- Datas ----------

function hojeISO(diasAMais = 0) {
  const d = new Date(Date.now() + diasAMais * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function paraISO(timestamp) {
  return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : hojeISO()
}

function deISO(iso) {
  // Meio-dia local evita o dia "voltar" por fuso horário.
  return new Date(`${iso}T12:00:00`).getTime()
}

function dataCurta(timestamp) {
  return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function dataHora(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
