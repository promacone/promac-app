// Módulo de cotação de frete.

import {
  TIPOS_DE_CARGA, RESOLUCAO_ANTT, coeficientes, eixosDisponiveis,
  calcularFrete, reais, percentual, numero,
} from '../frete.js'
import { rotaComMemoria } from '../qualp.js'
import { campoDeCidade } from '../cidades.js'
import { el, render, campo, linha, seletor, mostrarAviso, comCarregamento } from '../ui.js'

export function telaCotacao({ parametros }) {
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
  const areaTabelas = el('div', { style: 'display:flex;gap:8px' })
  const areaResumo = el('div')
  const areaTotal = el('div')
  const areaRota = el('div')
  const avisoRota = el('div')

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

  function recalcular() {
    const r = calcularFrete({
      distanciaKm: numero(estado.distanciaKm),
      valorNFe: numero(estado.valorNFe),
      eixos: estado.eixos,
      tarifaPedagioPorEixo: tarifaPorEixo(),
      coeficientes: coeficientes(estado.tipo, estado.eixos),
      parametros: parametrosAtuais(),
    })

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
      linha('Frete', reais(r.total), true),
      linha(`Pedágio (${estado.eixos} eixos)`, reais(r.pedagio)),
      el('p', {
        classe: 'campo__ajuda',
        style: 'margin-top:10px',
        texto: `Piso pago ao motorista pela ${RESOLUCAO_ANTT.nome}, vigente desde ${RESOLUCAO_ANTT.vigenteDesde}. O pedágio é repasse: não leva imposto nem margem.`,
      }),
    )

    render(areaTotal,
      el('div', { classe: 'total' }, [
        el('span', { texto: 'Total ao cliente' }),
        el('span', { classe: 'total__valor', texto: reais(r.totalComPedagio) }),
      ]),
    )
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
      el('button', {
        classe: 'botao',
        style: estado.tabela === id
          ? ''
          : 'background:transparent;color:var(--azul-claro);border:1.5px solid var(--azul-claro)',
        texto: `${id.toUpperCase()} — ${percentual(margem)}`,
        onclick: () => { estado.tabela = id; redesenharTabelas(); recalcular() },
      })))
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
  ])

  redesenharEixos()
  redesenharTabelas()
  recalcular()
  return raiz
}
