// Tela da cotação de frete fracionado.
//
// O vendedor escolhe a região de destino numa aba, e dali em diante a
// tela só sugere cidades daquela região — cotar Manaus com preço de
// Curitiba era exatamente o erro que as abas existem para impedir.
//
// A conta em si mora em fracionado.js; aqui é só tela.

import {
  calcularFrete, coeficientes, reais, percentual, numero,
} from '../frete.js?v=20260824161941'
import {
  REGIOES, regiao, calcularFracionado, CUBAGEM_KG_POR_M3,
} from '../fracionado.js?v=20260824161941'
import { rotaComMemoria } from '../qualp.js?v=20260824161941'
import { campoDeCidade } from '../cidades.js?v=20260824161941'
import { el, render, campo, linha, mostrarAviso, comCarregamento } from '../ui.js?v=20260824161941'

export function telaFreteFracionado({ parametros }) {
  const estado = {
    regiao: 'sulSudeste',
    origem: '',
    destino: '',
    distanciaKm: '',
    pesoKg: '',
    volumeM3: '',
    valorNFe: '',
    taxasFixas: '',
    tabela: 'a',
    rota: null,
  }

  const areaRegioes = el('div', { classe: 'tabelas-preco' })
  const areaTabelas = el('div', { classe: 'tabelas-preco' })
  const areaDestino = el('div')
  const areaResumo = el('div')
  const areaTotal = el('div')
  const areaRota = el('div')
  const avisoRota = el('div')

  const campoDistancia = campoNumerico('distanciaKm', '0', () => { estado.rota = null; desenharRota() })

  const campoOrigem = campoDeCidade({
    placeholder: 'Ex.: Ponta Grossa, PR',
    aoEscolher: (texto) => { estado.origem = texto; estado.rota = null; desenharRota() },
  })

  function parametrosAtuais() {
    return {
      imposto: parametros.imposto,
      margem: parametros.tabelas[estado.tabela],
      gris: parametros.gris,
    }
  }

  function recalcular() {
    const r = calcularFracionado({
      regiaoId: estado.regiao,
      distanciaKm: numero(estado.distanciaKm),
      pedagioCaminhao: estado.rota ? estado.rota.pedagioDinheiro : 0,
      pesoKg: numero(estado.pesoKg),
      volumeM3: numero(estado.volumeM3),
      valorNFe: numero(estado.valorNFe),
      taxasFixas: numero(estado.taxasFixas),
      parametros: parametrosAtuais(),
      calcularFreteDedicado: calcularFrete,
      coeficientes,
    })

    render(areaResumo,
      el('div', { classe: 'secao__titulo', texto: `Fracionado — ${r.regiao.titulo} — Tabela ${estado.tabela.toUpperCase()}` }),

      linha('Peso da balança', `${numero(estado.pesoKg).toLocaleString('pt-BR')} kg`),
      linha(`Peso cubado (${CUBAGEM_KG_POR_M3} kg/m³)`, `${Math.round(r.peso.cubado).toLocaleString('pt-BR')} kg`),
      linha('Peso considerado', `${Math.round(r.peso.cobravel).toLocaleString('pt-BR')} kg`, r.peso.cubou),

      linha(`Caminhão cheio (${r.regiao.caminhao.capacidadeKg / 1000} t, ${r.distanciaKm} km)`,
        reais(r.freteCaminhaoCheio)),
      linha('Fatia da carga', percentual(r.fatia)),
      linha(r.usouMinimo ? `Frete-peso (mínimo da região)` : 'Frete-peso', reais(r.fretePeso), true),
      linha(`GRIS (${percentual(parametros.gris)} da NF-e)`, reais(r.gris)),
      linha('Taxas fixas', reais(r.taxas)),

      r.peso.cubou
        ? el('p', {
            classe: 'campo__ajuda',
            style: 'margin-top:10px',
            texto: 'A carga é leve para o espaço que ocupa: a cobrança foi pelo volume, não pela balança.',
          })
        : null,

      r.usouViagemTipica
        ? el('p', {
            classe: 'campo__ajuda',
            style: 'margin-top:10px',
            texto: `Sem rota buscada, a conta usou a viagem típica da região (${r.regiao.distanciaKm} km). Busque a rota para o valor sair no km real.`,
          })
        : null,
    )

    render(areaTotal,
      el('div', { classe: 'total' }, [
        el('div', { classe: 'total__rotulo', texto: 'Total ao cliente' }),
        el('div', { classe: 'total__valor', texto: reais(r.total) }),
        el('div', {
          classe: 'total__secundario',
          texto: `Frete-peso ${reais(r.fretePeso)} + GRIS ${reais(r.gris)} + taxas ${reais(r.taxas)}`,
        }),
      ]),
    )
  }

  // ---------- Regiões ----------

  function desenharRegioes() {
    render(areaRegioes, REGIOES.map((r) =>
      el('button', {
        classe: `tabela-preco${estado.regiao === r.id ? ' tabela-preco--ativa' : ''}`,
        onclick: () => {
          estado.regiao = r.id
          // Trocar de região invalida destino e rota: a cidade escolhida
          // pertence à aba anterior.
          estado.destino = ''
          estado.rota = null
          desenharRegioes()
          desenharDestino()
          desenharRota()
        },
      }, [
        el('span', { classe: 'tabela-preco__letra', texto: r.sigla }),
        el('span', { classe: 'tabela-preco__margem', texto: r.titulo }),
      ])))
  }

  function desenharDestino() {
    const r = regiao(estado.regiao)
    render(areaDestino, campo(`Cidade de entrega — ${r.titulo}`, campoDeCidade({
      placeholder: 'Digite a cidade',
      apenasUFs: r.ufs,
      aoEscolher: (texto) => { estado.destino = texto; estado.rota = null; desenharRota() },
    }), `Só cidades de: ${r.ufs.join(', ')}.`))
  }

  function desenharTabelas() {
    render(areaTabelas, Object.entries(parametros.tabelas).map(([id, margem]) =>
      el('button', {
        classe: `tabela-preco${estado.tabela === id ? ' tabela-preco--ativa' : ''}`,
        onclick: () => { estado.tabela = id; desenharTabelas(); recalcular() },
      }, [
        el('span', { classe: 'tabela-preco__letra', texto: id.toUpperCase() }),
        el('span', { classe: 'tabela-preco__margem', texto: percentual(margem) }),
      ])))
  }

  // ---------- Rota ----------

  async function buscarRota(botao) {
    mostrarAviso(avisoRota, '')

    if (!estado.origem.trim() || !estado.destino.trim()) {
      mostrarAviso(avisoRota, 'Preencha a cidade de coleta e a de entrega.')
      return
    }

    await comCarregamento(botao, async () => {
      try {
        const r = regiao(estado.regiao)
        estado.rota = await rotaComMemoria({
          origem: estado.origem,
          destino: estado.destino,
          eixos: r.caminhao.eixos,
        })
        estado.distanciaKm = String(Math.round(estado.rota.distanciaKm))
        campoDistancia.value = estado.distanciaKm
        desenharRota()
      } catch {
        mostrarAviso(avisoRota,
          'Não consegui buscar a rota agora. Digite a distância para cotar mesmo assim.')
      }
    })
    recalcular()
  }

  function desenharRota() {
    render(areaRota, estado.rota
      ? el('p', {
          classe: 'campo__ajuda',
          texto: `Rota encontrada: ${Math.round(estado.rota.distanciaKm)} km, pedágio do caminhão ${reais(estado.rota.pedagioDinheiro)}.`,
        })
      : null)
    recalcular()
  }

  // ---------- Campos ----------

  function campoNumerico(nome, exemplo, aoDigitar) {
    return el('input', {
      type: 'text',
      inputmode: 'decimal',
      placeholder: exemplo,
      value: estado[nome],
      oninput: (e) => {
        estado[nome] = e.target.value
        if (aoDigitar) aoDigitar()
        recalcular()
      },
    })
  }

  const raiz = el('div', { style: 'display:grid;gap:14px' }, [
    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Região de destino' }),
      areaRegioes,
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Rota' }),
      campo('Cidade de coleta', campoOrigem),
      areaDestino,
      el('button', {
        classe: 'botao',
        texto: 'Buscar rota e pedágio',
        onclick: (evento) => buscarRota(evento.currentTarget),
      }),
      avisoRota,
      areaRota,
      campo('Distância (km)', campoDistancia,
        'Preenchida pela busca de rota. Digite só para cotar sem consultar.'),
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Carga' }),
      campo('Peso (kg)', campoNumerico('pesoKg', '0')),
      campo('Volume (m³)', campoNumerico('volumeM3', '0'),
        `Usado no peso cubado: cada m³ conta como ${CUBAGEM_KG_POR_M3} kg. Vale o maior entre balança e cubagem.`),
      campo('Valor da NF-e (R$)', campoNumerico('valorNFe', '0,00')),
      campo('Taxas fixas (R$)', campoNumerico('taxasFixas', '0,00'),
        'TDE, despacho, coleta — o que for combinado por fora do frete-peso.'),
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Tabela de preço' }),
      areaTabelas,
    ]),

    el('div', { classe: 'cartao' }, [areaResumo]),
    areaTotal,
  ])

  desenharRegioes()
  desenharDestino()
  desenharTabelas()
  recalcular()
  return raiz
}
