// Quadro de contratações: cada coluna é uma etapa, cada cartão é uma
// carga. No celular as colunas deslizam na horizontal; o cartão muda de
// etapa por botões dentro dele — arrastar com o dedo brigaria com a
// rolagem da página.

import {
  bd, doc, setDoc, deleteDoc, collection, getDocs,
} from '../firebase.js?v=20260824095009'
import { reais } from '../frete.js?v=20260824095009'
import { el, render, campo, mostrarAviso, seletor } from '../ui.js?v=20260824095009'
import { tornarArrastavel } from '../arrastar.js?v=20260824095009'

/** Os fretes de verdade, no Firestore. */
export function firestore() {
  return {
    async listar() {
      const resultado = await getDocs(collection(bd, 'viagens'))
      return resultado.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    async salvar(frete) {
      const { id, ...campos } = frete
      await setDoc(doc(bd, 'viagens', id), campos)
    },
    async apagar(id) {
      await deleteDoc(doc(bd, 'viagens', id))
    },
  }
}

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

/**
 * @param sessao      quem está usando
 * @param repositorio de onde vêm os fretes. Trocável para eu conseguir
 *                    exercitar o quadro com dados falsos, sem depender de
 *                    login nem gastar leitura do Firestore.
 */
export function telaContratacoes(sessao, repositorio = firestore()) {
  const estado = { fretes: [], busca: '', carregando: true }
  const raiz = el('div', { style: 'display:grid;gap:14px' })
  const avisoEl = el('div')

  async function carregar() {
    try {
      estado.fretes = (await repositorio.listar())
        .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0))
      mostrarAviso(avisoEl, '')
    } catch {
      mostrarAviso(avisoEl, 'Não consegui carregar os fretes agora.')
    }
    estado.carregando = false
    desenhar()
  }

  async function salvar(frete) {
    try {
      await repositorio.salvar(frete)
      await carregar()
    } catch {
      mostrarAviso(avisoEl, 'Não consegui salvar. Tente de novo.')
    }
  }

  async function apagar(id) {
    try {
      await repositorio.apagar(id)
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

      // Busca e "novo frete" dividem a linha na tela grande: cada bloco
      // empilhado aqui em cima é altura que o quadro perde.
      el('div', { classe: 'quadro__barra' }, [
        el('input', {
          type: 'search',
          placeholder: 'Buscar cliente, cidade, motorista ou placa',
          value: estado.busca,
          oninput: (e) => { estado.busca = e.target.value; desenharColunas() },
        }),
        el('button', {
          classe: 'botao quadro__novo',
          texto: '+ Novo frete',
          onclick: () => abrirFormulario(null),
        }),
      ]),

      areaColunas,
    )

    desenharColunas()
  }

  const areaColunas = el('div', { classe: 'quadro' })

  function desenharColunas() {
    const lista = filtrados()

    render(areaColunas, ESTAGIOS.map((etapa) => {
      const cartoes = lista
        .filter((f) => f.estagio === etapa.id)
        .sort((a, b) => (a.previsaoEntrega || 0) - (b.previsaoEntrega || 0))

      return el('div', {
        classe: 'coluna',
        dataset: { etapa: etapa.id },
        // A cor da etapa vale para a coluna inteira: faixa, contador e o
        // botão de avançar das fichas lá dentro.
        style: `--cor-etapa:${etapa.cor}`,
      }, [
        el('div', { classe: 'coluna__topo' }, [
          el('span', { classe: 'coluna__nome', texto: etapa.titulo }),
          el('span', { classe: 'coluna__contador', texto: String(cartoes.length) }),
        ]),
        ...(cartoes.length
          ? cartoes.map(cartao)
          : [el('div', { classe: 'coluna__vazia', texto: 'Nenhuma carga' })]),
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

    const ficha = el('div', { classe: 'ficha' }, [
      el('div', { classe: 'ficha__topo' }, [
        el('span', { classe: 'ficha__cliente', texto: frete.cliente || 'Sem cliente' }),
        // "Normal" não ganha etiqueta: marcar tudo faria as cargas
        // realmente urgentes se perderem no meio.
        frete.prioridade && frete.prioridade !== 'normal'
          ? el('span', {
              classe: 'ficha__etiqueta',
              style: `background:${frete.prioridade === 'urgente' ? '#d93636' : '#e09a10'}`,
              texto: frete.prioridade === 'urgente' ? 'URGENTE' : 'PRIORITÁRIA',
            })
          : null,
      ]),

      el('div', { classe: 'ficha__rota' }, [
        el('div', { texto: `↑ ${frete.cidadeColeta || '—'}` }),
        el('div', { texto: `↓ ${frete.cidadeEntrega || '—'}` }),
      ]),

      // Motorista só aparece depois de contratado — antes disso não existe.
      frete.motoristaNome && indice >= 2
        ? el('div', { classe: 'ficha__motorista' }, [
            el('div', { texto: `👤 ${frete.motoristaNome}` }),
            frete.placa ? el('div', { texto: `🚚 ${String(frete.placa).toUpperCase()}` }) : null,
            frete.motoristaTelefone ? el('div', { texto: `📞 ${frete.motoristaTelefone}` }) : null,
          ])
        : null,

      frete.estagio === 'emRota' && frete.saiuEm
        ? el('div', { classe: 'ficha__carimbo', texto: `Saiu em ${dataHora(frete.saiuEm)}` })
        : null,
      frete.estagio === 'entregue' && frete.entregueEm
        ? el('div', { classe: 'ficha__carimbo', texto: `Entregue em ${dataHora(frete.entregueEm)}` })
        : null,

      el('div', { classe: 'ficha__rodape' }, [
        el('span', { texto: frete.tipoVeiculo || '' }),
        el('span', { classe: 'ficha__valor', texto: reais(frete.valorFrete || 0) }),
      ]),

      frete.previsaoEntrega
        ? el('div', {
            classe: atrasado ? 'ficha__carimbo ficha__atrasado' : 'ficha__carimbo',
            texto: `${atrasado ? '⚠ ' : ''}Entrega: ${dataCurta(frete.previsaoEntrega)}`,
          })
        : null,

      // Botões de mover em vez de arrastar: no celular, arrastar brigaria
      // com a rolagem da coluna e do quadro.
      el('div', { classe: 'ficha__acoes', onclick: (e) => e.stopPropagation() }, [
        anterior
          ? el('button', {
              classe: 'ficha__mover ficha__mover--voltar',
              texto: '← Voltar',
              title: `Voltar para ${anterior.titulo}`,
              onclick: () => salvar(movido(frete, anterior.id)),
            })
          : null,
        proximo
          ? el('button', {
              classe: 'ficha__mover ficha__mover--avancar',
              texto: `${proximo.titulo} →`,
              onclick: () => salvar(movido(frete, proximo.id)),
            })
          : null,
      ]),
    ])

    tornarArrastavel(ficha, frete, {
      aoSoltar: (arrastado, destino) => salvar(movido(arrastado, destino)),
      aoClicar: () => abrirFormulario(frete),
    })

    return ficha
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
