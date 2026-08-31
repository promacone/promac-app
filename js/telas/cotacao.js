// Módulo de cotação de frete.
//
// São dois negócios diferentes debaixo do mesmo módulo, e por isso ficam
// em abas separadas em vez de numa tela só:
//
// - **Dedicado**: o caminhão sai só com a carga do cliente. O preço nasce
//   do piso da ANTT por quilômetro e por eixo.
// - **Fracionado**: a carga divide o caminhão com outras. Não existe piso
//   legal para isso; o preço sai da tabela comercial da PROMAC, que muda
//   conforme a região de destino.
//
// Misturar os dois numa tela só levaria o vendedor a cotar fracionado com
// a conta do dedicado — que dá um número muito maior e perde a venda.

import {
  TIPOS_DE_CARGA, RESOLUCAO_ANTT, coeficientes, eixosDisponiveis,
  calcularFrete, reais, percentual, numero,
} from '../frete.js?v=20260831114030'
import { rotaComMemoria } from '../qualp.js?v=20260831114030'
import { campoDeCidade } from '../cidades.js?v=20260831114030'
import { gerarProposta } from '../proposta.js?v=20260831114030'
import { el, render, campo, linha, seletor, mostrarAviso, comCarregamento, mascaraCnpj } from '../ui.js?v=20260831114030'
import { telaFreteFracionado } from './fracionado.js?v=20260831114030'

/** Escolhe entre as duas formas de cotar. */
export function telaCotacao(sessao) {
  const area = el('div')
  let atual = 'dedicado'

  const abas = el('div', { classe: 'abas' })

  function trocar(qual) {
    atual = qual
    desenharAbas()
    render(area, qual === 'dedicado'
      ? telaFreteDedicado(sessao)
      : telaFreteFracionado(sessao))
  }

  function desenharAbas() {
    render(abas, [
      { id: 'dedicado', titulo: 'Dedicado' },
      { id: 'fracionado', titulo: 'Fracionado' },
    ].map((aba) => el('button', {
      classe: `aba${atual === aba.id ? ' aba--ativa' : ''}`,
      texto: aba.titulo,
      onclick: () => trocar(aba.id),
    })))
  }

  const raiz = el('div', { style: 'display:grid;gap:14px' }, [abas, area])
  trocar('dedicado')
  return raiz
}

/**
 * Cotação de frete dedicado: um caminhão inteiro para uma carga só.
 *
 * O preço parte do piso da ANTT, que é o mínimo legal a pagar ao
 * motorista terceiro, e sobe dali com imposto e margem.
 */
export function telaFreteDedicado({ parametros }) {
  const estado = {
    tipo: 'geral',
    eixos: 5,
    origem: '',
    destino: '',
    distanciaKm: '',
    valorNFe: '',
    tarifaPedagio: '',
    tabela: 'a',
    // Preenchido quando a Qualp responde; some se o vendedor mexer na
    // distância ou no pedágio na mão.
    rota: null,
    comTag: false,
  }

  // A tela é montada uma vez e só as partes que mudam são redesenhadas.
  // Redesenhar os campos de digitação a cada tecla faria o teclado do
  // iPhone fechar no meio da palavra.
  const areaEixos = el('div')
  const areaTabelas = el('div', { classe: 'tabelas-preco' })
  const areaResumo = el('div')
  const areaTotal = el('div')
  const areaRota = el('div')
  const avisoRota = el('div')
  const campoCliente = el('input', { type: 'text', placeholder: 'Razão social ou nome' })
  const campoClienteCnpj = el('input', {
    type: 'text',
    inputmode: 'numeric',
    placeholder: '00.000.000/0001-00',
    // A máscara entra sozinha: quem cota está com o número seco na mão,
    // vindo da nota ou do cadastro, e pontuar à mão é onde se erra.
    oninput: (e) => { e.target.value = mascaraCnpj(e.target.value) },
  })
  const campoObs = el('textarea', {
    rows: 3,
    placeholder: 'Ex.: Coleta agendada com 24h de antecedência. Pagamento em 28 dias.',
  })

  const campoDistancia = campoNumerico('distanciaKm', '0', () => { estado.rota = null; desenharRota() })
  const campoPedagio = campoNumerico('tarifaPedagio', '0,00', () => { estado.rota = null; desenharRota() })

  function parametrosAtuais() {
    return {
      imposto: parametros.imposto,
      margem: parametros.tabelas[estado.tabela],
      gris: parametros.gris,
    }
  }

  /** Pedágio por eixo: da Qualp quando ela respondeu, digitado se não. */
  function tarifaPorEixo() {
    if (estado.rota) {
      const total = estado.comTag ? estado.rota.pedagioTag : estado.rota.pedagioDinheiro
      return total / Math.max(1, estado.eixos)
    }
    return numero(estado.tarifaPedagio)
  }

  let ultimoCalculo = null

  function recalcular() {
    const r = calcularFrete({
      distanciaKm: numero(estado.distanciaKm),
      valorNFe: numero(estado.valorNFe),
      eixos: estado.eixos,
      tarifaPedagioPorEixo: tarifaPorEixo(),
      coeficientes: coeficientes(estado.tipo, estado.eixos),
      parametros: parametrosAtuais(),
    })

    ultimoCalculo = r

    const semPercentuais = parametros.imposto === 0 && parametrosAtuais().margem === 0

    render(areaResumo,
      el('div', { classe: 'secao__titulo', texto: `Frete — Tabela ${estado.tabela.toUpperCase()}` }),

      semPercentuais
        ? el('div', {
            classe: 'aviso aviso--atencao',
            style: 'margin-bottom:10px',
            texto: 'Os percentuais da empresa ainda não foram cadastrados. Vá em Equipe → Percentuais da empresa.',
          })
        : null,

      linha('Pago ao motorista', reais(r.pisoANTT)),
      linha(`GRIS (${percentual(parametros.gris)} da NF-e)`, reais(r.gris)),
      linha(`Imposto (${percentual(parametros.imposto)})`, reais(r.imposto)),
      linha(`Sua margem (${percentual(parametrosAtuais().margem)})`, reais(r.margem)),
      linha('Venda sem pedágio', reais(r.total), true),
      linha(`Pedágio (${estado.eixos} eixos)`, reais(r.pedagio)),
      linha('Venda com pedágio', reais(r.totalComPedagio), true),
      el('p', {
        classe: 'campo__ajuda',
        style: 'margin-top:10px',
        texto: `Piso pago ao motorista pela ${RESOLUCAO_ANTT.nome}, vigente desde ${RESOLUCAO_ANTT.vigenteDesde}. O pedágio é repasse: não leva imposto nem margem.`,
      }),
    )

    render(areaTotal,
      el('div', { classe: 'total' }, [
        el('div', { classe: 'total__rotulo', texto: 'Total ao cliente' }),
        el('div', { classe: 'total__valor', texto: reais(r.totalComPedagio) }),
        el('div', {
          classe: 'total__secundario',
          texto: `Sem o pedágio: ${reais(r.total)}`,
        }),
      ]),
    )
  }

  // ---------- Proposta ----------

  function abrirProposta() {
    if (!ultimoCalculo) return
    const r = ultimoCalculo
    const p = parametrosAtuais()
    const eixos = estado.eixos

    gerarProposta({
      cliente: campoCliente.value.trim(),
      clienteCnpj: campoClienteCnpj.value.trim(),
      titulo: `Frete dedicado — Tabela ${estado.tabela.toUpperCase()}`,
      rota: {
        origem: estado.origem || '—',
        destino: estado.destino || '—',
        km: numero(estado.distanciaKm),
      },
      carga: [
        ['Tipo de carga', (TIPOS_DE_CARGA.find((x) => x.id === estado.tipo) || {}).titulo || '—'],
        ['Veículo', `${eixos} eixos`],
        numero(estado.valorNFe) > 0 ? ['Valor da NF-e', reais(numero(estado.valorNFe))] : null,
      ],
      // ATENÇÃO: este documento vai para o cliente.
      //
      // Nada de custo, piso pago ao motorista, imposto separado ou
      // margem. Esses números são a conta interna da PROMAC; na mão do
      // cliente viram argumento de negociação. Sai só o que ele precisa
      // para conferir a fatura: o serviço, os repasses e o total.
      valores: [
        // O GRIS sai da linha do frete e vira linha própria: no cálculo
        // ele já está dentro de `total`, e listar os dois somaria duas
        // vezes na leitura do cliente — as parcelas precisam fechar o
        // total exibido.
        ['Frete', reais(r.total - r.gris), true],
        r.gris > 0 ? [`GRIS (${percentual(p.gris)} da NF-e)`, reais(r.gris)] : null,
        r.pedagio > 0 ? [`Pedágio (${eixos} eixos)`, reais(r.pedagio)] : null,
      ],
      total: r.totalComPedagio,
      observacoes: ['Valores com impostos inclusos. O pedágio é repasse, conforme o Vale-Pedágio Obrigatório (Lei 10.209/2001).', campoObs.value],
      empresa: parametros.empresa,
    })
  }

  // ---------- Rota ----------

  async function buscarRota(botao) {
    const origem = estado.origem.trim()
    const destino = estado.destino.trim()

    if (!origem || !destino) {
      mostrarAviso(avisoRota, 'Informe a cidade de coleta e a de entrega.')
      return
    }

    mostrarAviso(avisoRota, '')

    await comCarregamento(botao, async () => {
      try {
        const rota = await rotaComMemoria({ origem, destino, eixos: estado.eixos })
        estado.rota = rota
        estado.distanciaKm = String(Math.round(rota.distanciaKm))
        campoDistancia.value = estado.distanciaKm
        desenharRota()
        recalcular()
      } catch (erro) {
        estado.rota = null
        mostrarAviso(avisoRota, erro.message)
        desenharRota()
      }
    })
  }

  function desenharRota() {
    if (!estado.rota) {
      render(areaRota, null)
      return
    }

    const rota = estado.rota
    const economia = rota.pedagioDinheiro - rota.pedagioTag

    render(areaRota,
      el('div', {
        classe: 'aviso aviso--ok',
        style: 'display:grid;gap:6px',
      }, [
        el('strong', { texto: `${Math.round(rota.distanciaKm)} km · ${rota.quantidadeDePracas} praça${rota.quantidadeDePracas === 1 ? '' : 's'} de pedágio` }),
        el('span', {
          style: 'font-size:13px',
          texto: `Pedágio para ${estado.eixos} eixos: ${reais(rota.pedagioDinheiro)} em dinheiro`
            + (economia > 0.01 ? ` · ${reais(rota.pedagioTag)} com tag` : ''),
        }),
      ]),

      economia > 0.01
        ? el('label', {
            style: 'display:flex;align-items:center;gap:8px;font-size:14px;margin-top:8px',
          }, [
            el('input', {
              type: 'checkbox',
              style: 'width:auto',
              checked: estado.comTag,
              onchange: (e) => { estado.comTag = e.target.checked; desenharRota(); recalcular() },
            }),
            `Pagar com tag eletrônica (economia de ${reais(economia)})`,
          ])
        : null,
    )
  }

  function redesenharEixos() {
    const eixos = eixosDisponiveis(estado.tipo)
    // Nem todo tipo de carga tem todas as quantidades de eixos.
    if (!eixos.includes(estado.eixos)) estado.eixos = eixos[0] || 2

    render(areaEixos, campo('Eixos', seletor(estado.eixos,
      eixos.map((e) => ({ valor: e, titulo: `${e} eixos` })),
      (valor) => {
        estado.eixos = Number(valor)
        // O pedágio depende dos eixos: a rota consultada não vale mais.
        estado.rota = null
        desenharRota()
        recalcular()
      })))
  }

  function redesenharTabelas() {
    render(areaTabelas, Object.entries(parametros.tabelas).map(([id, margem]) =>
      // Letra em cima, percentual embaixo: escrito em linha única, "A —
      // 20%" quebrava no meio do travessão na largura do celular.
      el('button', {
        classe: `tabela-preco${estado.tabela === id ? ' tabela-preco--ativa' : ''}`,
        onclick: () => { estado.tabela = id; redesenharTabelas(); recalcular() },
      }, [
        el('span', { classe: 'tabela-preco__letra', texto: id.toUpperCase() }),
        el('span', { classe: 'tabela-preco__margem', texto: percentual(margem) }),
      ])))
  }

  function campoNumerico(nome, placeholder, aoDigitar) {
    return el('input', {
      type: 'text',
      inputmode: 'decimal',
      placeholder,
      value: estado[nome],
      oninput: (e) => {
        estado[nome] = e.target.value
        if (aoDigitar) aoDigitar()
        recalcular()
      },
    })
  }

  function campoCidade(nome, placeholder) {
    return campoDeCidade({
      valorInicial: estado[nome],
      placeholder,
      aoEscolher: (texto) => {
        estado[nome] = texto
        // Trocar de cidade invalida a rota consultada.
        estado.rota = null
        desenharRota()
      },
    })
  }

  const botaoRota = el('button', {
    classe: 'botao',
    texto: 'Buscar rota e pedágio',
    onclick: (evento) => buscarRota(evento.currentTarget),
  })

  const raiz = el('div', { style: 'display:grid;gap:16px' }, [
    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Carga' }),
      campo('Tipo', seletor(estado.tipo,
        TIPOS_DE_CARGA.map((t) => ({ valor: t.id, titulo: t.titulo })),
        (valor) => { estado.tipo = valor; estado.rota = null; redesenharEixos(); desenharRota(); recalcular() })),
      areaEixos,
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Rota' }),
      campo('Cidade de coleta', campoCidade('origem', 'Ex.: São Paulo, SP')),
      campo('Cidade de entrega', campoCidade('destino', 'Ex.: Curitiba, PR'),
        'Inclua o estado para não confundir cidades de mesmo nome.'),
      botaoRota,
      avisoRota,
      areaRota,
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Viagem' }),
      campo('Distância (km)', campoDistancia),
      campo('Valor da NF-e (R$)', campoNumerico('valorNFe', '0,00')),
      campo('Pedágio por eixo (R$)', campoPedagio,
        'Preenchido pela busca de rota. Digite aqui só para cotar sem consultar.'),
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Tabela de preço' }),
      areaTabelas,
    ]),

    el('div', { classe: 'cartao' }, [areaResumo]),
    areaTotal,

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Proposta para o cliente' }),
      campo('Contratante', campoCliente),
      campo('CNPJ do contratante', campoClienteCnpj),
      campo('Observações da proposta', campoObs,
        'Sai na seção Condições do PDF. Cada linha vira um item da lista.'),
      el('button', {
        classe: 'botao',
        texto: 'Gerar proposta em PDF',
        onclick: abrirProposta,
      }),
      el('p', {
        classe: 'campo__ajuda',
        texto: 'No iPhone, escolha Imprimir e depois compartilhe — dá para mandar direto no WhatsApp. No computador, escolha "Salvar como PDF".',
      }),
    ]),
  ])

  redesenharEixos()
  redesenharTabelas()
  recalcular()
  return raiz
}
