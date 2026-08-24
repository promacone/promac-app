// Tela da cotação de frete fracionado.
//
// O vendedor escolhe a região de destino numa aba, e dali em diante a
// tela só sugere cidades daquela região — cotar Manaus com preço de
// Curitiba era exatamente o erro que as abas existem para impedir.
//
// A conta em si mora em fracionado.js; aqui é só tela.

import {
  calcularFrete, coeficientes, reais, percentual, numero,
} from '../frete.js?v=20260824163012'
import {
  REGIOES, regiao, calcularFracionado, CUBAGEM_KG_POR_M3, capacidadeM3,
} from '../fracionado.js?v=20260824163012'
import { rotaComMemoria } from '../qualp.js?v=20260824163012'
import { campoDeCidade } from '../cidades.js?v=20260824163012'
import { el, render, campo, linha, mostrarAviso, comCarregamento } from '../ui.js?v=20260824163012'

export function telaFreteFracionado({ parametros }) {
  const estado = {
    regiao: 'sulSudeste',
    origem: '',
    destino: '',
    distanciaKm: '',
    // A carga é descrita volume a volume: medidas, quantidade e peso.
    // O total de m³ e kg sai daqui — ninguém precisa cubar de cabeça.
    volumes: [novoVolume()],
    valorNFe: '',
    taxasFixas: '',
    tabela: 'a',
    rota: null,
  }

  function novoVolume() {
    return { quantidade: '1', comprimento: '', largura: '', altura: '', pesoKg: '' }
  }

  /** Soma m³ e kg de todos os volumes digitados. */
  function totaisDaCarga() {
    let volumeM3 = 0
    let pesoKg = 0
    let quantidade = 0

    for (const v of estado.volumes) {
      const qtd = Math.max(0, Math.round(numero(v.quantidade)))
      const m3 = numero(v.comprimento) * numero(v.largura) * numero(v.altura)
      volumeM3 += m3 * qtd
      pesoKg += numero(v.pesoKg) * qtd
      quantidade += qtd
    }

    return { volumeM3, pesoKg, quantidade }
  }

  const areaRegioes = el('div', { classe: 'tabelas-preco' })
  const areaVolumes = el('div', { style: 'display:grid;gap:10px' })
  const areaAjudaVolumes = el('p', { classe: 'campo__ajuda' })

  /** A explicação acompanha a região: baú real numa, cubagem na outra. */
  function atualizarAjudaVolumes() {
    const r = regiao(estado.regiao)
    const bau = capacidadeM3(r.caminhao)
    areaAjudaVolumes.textContent = bau
      ? `Medidas em metros — 60 cm é 0,60. A carreta de referência leva ${r.caminhao.capacidadeKg / 1000} t em ${m3(bau)} m³ (${m3(r.caminhao.bau.comprimento)} × ${m3(r.caminhao.bau.largura)} × ${m3(r.caminhao.bau.altura)}). A carga paga a fração que ocupar — em peso ou em espaço, o que for maior.`
      : `Medidas em metros — 60 cm é 0,60. Cada m³ conta como ${CUBAGEM_KG_POR_M3} kg; a cobrança vale o maior entre balança e cubagem.`
  }
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
    const carga = totaisDaCarga()
    const r = calcularFracionado({
      regiaoId: estado.regiao,
      distanciaKm: numero(estado.distanciaKm),
      pedagioCaminhao: estado.rota ? estado.rota.pedagioDinheiro : 0,
      pesoKg: carga.pesoKg,
      volumeM3: carga.volumeM3,
      valorNFe: numero(estado.valorNFe),
      taxasFixas: numero(estado.taxasFixas),
      parametros: parametrosAtuais(),
      calcularFreteDedicado: calcularFrete,
      coeficientes,
    })

    const temBau = !!r.capacidadeM3

    render(areaResumo,
      el('div', { classe: 'secao__titulo', texto: `Fracionado — ${r.regiao.titulo} — Tabela ${estado.tabela.toUpperCase()}` }),

      linha('Volumes', `${carga.quantidade} · ${m3(carga.volumeM3)} m³`),
      linha('Peso da balança', `${Math.round(carga.pesoKg).toLocaleString('pt-BR')} kg`),

      // Com o baú conhecido, o rateio é contra a carreta real: mostra a
      // ocupação nas duas dimensões e qual delas mandou no preço.
      temBau ? linha('Ocupação do baú (espaço)', percentual(r.fatiaEspaco), r.cobrouPorEspaco) : null,
      temBau ? linha('Ocupação em peso (25 t)', percentual(r.fatiaPeso), !r.cobrouPorEspaco) : null,

      !temBau ? linha(`Peso cubado (${CUBAGEM_KG_POR_M3} kg/m³)`, `${Math.round(r.peso.cubado).toLocaleString('pt-BR')} kg`) : null,
      !temBau ? linha('Peso considerado', `${Math.round(r.peso.cobravel).toLocaleString('pt-BR')} kg`, r.peso.cubou) : null,

      linha(
        temBau
          ? `Carreta cheia (${r.regiao.caminhao.capacidadeKg / 1000} t · ${m3(r.capacidadeM3)} m³ · ${r.distanciaKm} km)`
          : `Caminhão cheio (${r.regiao.caminhao.capacidadeKg / 1000} t, ${r.distanciaKm} km)`,
        reais(r.freteCaminhaoCheio)),
      linha('Valor por km da carreta', `${reais(r.valorPorKm)}/km`),
      linha('Fatia cobrada da carga', percentual(r.fatia)),
      linha(r.usouMinimo ? `Frete-peso (mínimo da região)` : 'Frete-peso', reais(r.fretePeso), true),
      linha(`GRIS (${percentual(parametros.gris)} da NF-e)`, reais(r.gris)),
      linha('Taxas fixas', reais(r.taxas)),

      r.cobrouPorEspaco && (temBau ? r.fatiaEspaco > 0 : true)
        ? el('p', {
            classe: 'campo__ajuda',
            style: 'margin-top:10px',
            texto: temBau
              ? 'A carga esgota o espaço antes do peso: a cobrança foi pela área do baú que ela ocupa.'
              : 'A carga é leve para o espaço que ocupa: a cobrança foi pelo volume, não pela balança.',
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

  // ---------- Volumes ----------

  /**
   * Desenha a lista de volumes.
   *
   * Só é chamada ao adicionar ou remover: redesenhar a cada tecla
   * derrubaria o teclado do iPhone no meio da digitação. Enquanto a
   * pessoa digita, apenas o subtotal do item e o resumo lá embaixo
   * mudam.
   */
  function desenharVolumes() {
    render(areaVolumes,
      ...estado.volumes.map((volume, indice) => itemDeVolume(volume, indice)),
      el('button', {
        classe: 'botao-secundario',
        texto: '+ Adicionar outro volume',
        onclick: () => {
          estado.volumes.push(novoVolume())
          desenharVolumes()
          recalcular()
        },
      }),
    )
  }

  function itemDeVolume(volume, indice) {
    const subtotal = el('div', { classe: 'volume__subtotal' })

    function atualizarSubtotal() {
      const qtd = Math.max(0, Math.round(numero(volume.quantidade)))
      const cada = numero(volume.comprimento) * numero(volume.largura) * numero(volume.altura)
      const kg = numero(volume.pesoKg) * qtd
      subtotal.textContent = `${m3(cada * qtd)} m³ · ${Math.round(kg).toLocaleString('pt-BR')} kg`
    }

    /** Campo pequeno com rótulo em cima, para caber cinco por item. */
    function medida(rotulo, nome, exemplo) {
      const entrada = el('input', {
        type: 'text',
        inputmode: 'decimal',
        placeholder: exemplo,
        value: volume[nome],
        oninput: (e) => {
          volume[nome] = e.target.value
          atualizarSubtotal()
          recalcular()
        },
      })
      return el('label', { classe: 'volume__campo' }, [
        el('span', { classe: 'volume__rotulo', texto: rotulo }),
        entrada,
      ])
    }

    atualizarSubtotal()

    return el('div', { classe: 'volume' }, [
      el('div', { classe: 'volume__topo' }, [
        el('span', { classe: 'volume__titulo', texto: `Volume ${indice + 1}` }),
        subtotal,
        // Sempre sobra ao menos um item: a tela sem nenhum campo de
        // carga pareceria quebrada.
        estado.volumes.length > 1
          ? el('button', {
              classe: 'ficha__apagar',
              type: 'button',
              title: 'Remover este volume',
              texto: '×',
              onclick: () => {
                estado.volumes.splice(indice, 1)
                desenharVolumes()
                recalcular()
              },
            })
          : null,
      ]),

      el('div', { classe: 'volume__medidas' }, [
        medida('Compr. (m)', 'comprimento', '1,20'),
        medida('Larg. (m)', 'largura', '1,00'),
        medida('Alt. (m)', 'altura', '1,10'),
      ]),

      el('div', { classe: 'volume__linha2' }, [
        medida('Quantidade', 'quantidade', '1'),
        medida('Peso de cada (kg)', 'pesoKg', '250'),
      ]),
    ])
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
          atualizarAjudaVolumes()
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
      el('div', { classe: 'secao__titulo', texto: 'Volumes da carga' }),
      areaAjudaVolumes,
      areaVolumes,
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Nota e taxas' }),
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
  atualizarAjudaVolumes()
  desenharVolumes()
  desenharDestino()
  desenharTabelas()
  recalcular()
  return raiz
}

/** Formata metros cúbicos: "1,44", "0,3", "12". */
function m3(valor) {
  return (Math.round((valor || 0) * 100) / 100).toLocaleString('pt-BR')
}
