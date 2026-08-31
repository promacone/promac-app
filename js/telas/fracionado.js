// Tela da cotação de frete fracionado.
//
// O vendedor escolhe a região de destino numa aba, e dali em diante a
// tela só sugere cidades daquela região — cotar Manaus com preço de
// Curitiba era exatamente o erro que as abas existem para impedir.
//
// A conta em si mora em fracionado.js; aqui é só tela.

import {
  calcularFrete, coeficientes, reais, percentual, numero,
} from '../frete.js?v=20260831105449'
import {
  REGIOES, regiao, calcularFracionado, CUBAGEM_KG_POR_M3, capacidadeM3,
} from '../fracionado.js?v=20260831105449'
import { rotaComMemoria } from '../qualp.js?v=20260831105449'
import { campoDeCidade } from '../cidades.js?v=20260831105449'
import { el, render, campo, linha, mostrarAviso, comCarregamento } from '../ui.js?v=20260831105449'

export function telaFreteFracionado({ parametros }) {
  const estado = {
    regiao: 'sulSudeste',
    origem: '',
    destino: '',
    distanciaKm: '',
    // A carga é descrita volume a volume: medidas, quantidade e peso.
    // O total de m³ e kg sai daqui — ninguém precisa cubar de cabeça.
    volumes: [novoVolume()],
    ocupadoM3: '',
    valorNFe: '',
    taxasFixas: '',
    tabela: 'a',
    rota: null,
  }

  function novoVolume() {
    return { quantidade: '1', comprimento: '', largura: '', altura: '', pesoKg: '' }
  }

  /**
   * Medidas em metros, do jeito que o Pedro pediu para ler:
   *
   *   "1.80" e "1,80"  →  um metro e oitenta
   *   "0,80"           →  oitenta centímetros
   *   "180"            →  centímetros (nenhuma carga tem 180 m)
   *
   * Ponto e vírgula valem os dois como separador decimal. Não dá para
   * usar o numero() de frete.js aqui: ele trata ponto como separador de
   * milhar, e "1.80" viraria 180.
   *
   * O corte dos 20: acima disso não existe medida de carga em metros — a
   * carreta inteira tem 15 —, então o número só pode ser centímetros.
   * A leitura aparece escrita no subtotal do volume, para conferência.
   */
  function medidaEmMetros(valor) {
    const texto = String(valor ?? '').trim().replace(',', '.')
    const n = parseFloat(texto)
    if (!Number.isFinite(n) || n < 0) return 0
    return n > 20 ? n / 100 : n
  }

  /** Soma m³ e kg de todos os volumes digitados. */
  function totaisDaCarga() {
    let volumeM3 = 0
    let pesoKg = 0
    let quantidade = 0

    for (const v of estado.volumes) {
      const qtd = Math.max(0, Math.round(numero(v.quantidade)))
      const m3 = medidaEmMetros(v.comprimento) * medidaEmMetros(v.largura) * medidaEmMetros(v.altura)
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
      ? `Medidas em metros: 1,80 é um metro e oitenta; 0,80 é oitenta centímetros (180 também vale — números grandes são lidos como centímetros). O ${(r.caminhao.nome || 'veículo').toLowerCase()} de referência leva ${r.caminhao.capacidadeKg / 1000} t em ${m3(bau)} m³ (${m3(r.caminhao.bau.comprimento)} × ${m3(r.caminhao.bau.largura)} × ${m3(r.caminhao.bau.altura)} m). A carga paga a fração que ocupar — em peso ou em espaço, o que for maior.`
      : `Medidas em metros: 1,80 é um metro e oitenta; 0,80 é oitenta centímetros (180 também vale — números grandes são lidos como centímetros). Cada m³ conta como ${CUBAGEM_KG_POR_M3} kg; a cobrança vale o maior entre balança e cubagem.`
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

  /** "Truck cheio", "Carreta cheia" — o nome vem da região. */
  function nomeDoVeiculo(r) {
    return r.caminhao.nome || 'Carreta'
  }

  function veiculoCheio(r) {
    const nome = nomeDoVeiculo(r)
    return nome.endsWith('a') ? `${nome} cheia` : `${nome} cheio`
  }

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
      ocupadoM3: numero(estado.ocupadoM3),
      ajustes: parametros.fracionado || null,
      valorNFe: numero(estado.valorNFe),
      taxasFixas: numero(estado.taxasFixas),
      parametros: parametrosAtuais(),
      calcularFreteDedicado: calcularFrete,
      coeficientes,
    })

    const temBau = !!r.capacidadeM3
    const motor = !!r.regiao.motorCompleto

    render(areaResumo,
      el('div', { classe: 'secao__titulo', texto: `Fracionado — ${r.regiao.titulo} — Tabela ${estado.tabela.toUpperCase()}` }),

      linha('Volumes', `${carga.quantidade} · ${m3(carga.volumeM3)} m³`),
      linha('Peso real', `${Math.round(carga.pesoKg).toLocaleString('pt-BR')} kg`),
      linha(`Peso cubado (${CUBAGEM_KG_POR_M3} kg/m³)`, `${Math.round(r.peso.cubado).toLocaleString('pt-BR')} kg`),
      linha('Peso faturado', `${Math.round(r.peso.cobravel).toLocaleString('pt-BR')} kg`, r.peso.cubou),

      // Ocupação nas duas dimensões, com destaque na que mandou.
      temBau ? linha(`Ocupação em espaço (${m3(r.capacidadeM3)} m³)`, percentual(r.fatiaEspaco), r.cobrouPorEspaco) : null,
      temBau ? linha(`Ocupação em peso (${r.regiao.caminhao.capacidadeKg / 1000} t)`, percentual(r.fatiaPeso), !r.cobrouPorEspaco) : null,

      linha(
        temBau
          ? `${veiculoCheio(r.regiao)} — dedicado da rota (${r.distanciaKm} km)`
          : `Caminhão cheio (${r.regiao.caminhao.capacidadeKg / 1000} t, ${r.distanciaKm} km)`,
        reais(r.freteCaminhaoCheio)),
      linha(`Valor por km (${nomeDoVeiculo(r.regiao).toLowerCase()})`, `${reais(r.valorPorKm)}/km`),

      // Consolidação: o quanto do truck já estava vendido muda a faixa.
      r.consolidacao && r.consolidacao.ocupadoM3 > 0
        ? linha('Truck com esta carga', `${m3(r.consolidacao.totalM3)} de ${m3(r.capacidadeM3)} m³`)
        : null,

      motor
        ? linha(`Peso faturável${r.usouPesoMinimo ? ' (mínimo da tabela)' : ''}`,
            `${Math.round(r.pesoFaturavel).toLocaleString('pt-BR')} kg`, r.usouPesoMinimo)
        : null,
      motor
        ? linha(`Preço por kg (aproveitamento ${percentual(r.aproveitamento)})`,
            `${reais(r.precoPorKg)}/kg`)
        : null,

      linha('Frete peso', reais(r.rateio)),
      r.despacho > 0 ? linha('Despacho', reais(r.despacho)) : null,
      linha(r.usouMinimo ? 'Frete-peso (mínimo aplicado)' : 'Frete-peso', reais(r.fretePeso), true),

      r.pedagioDaFatia > 0 ? linha('Pedágio incluso na fatia', reais(r.pedagioDaFatia)) : null,
      motor ? linha(`Impostos inclusos (${percentual(parametros.imposto)})`, reais(r.fretePeso * parametros.imposto)) : null,
      motor ? linha('Margem PROMAC (estimada)', reais(Math.max(0, r.margemEstimada))) : null,

      linha(`GRIS (${percentual(parametros.gris)} da NF-e)`, reais(r.gris)),
      linha('Taxas fixas', reais(r.taxas)),
      linha('Prazo estimado', `${r.prazo.de} a ${r.prazo.ate} dias úteis`),

      r.consolidacao && r.consolidacao.ocupadoM3 > 0 && r.consolidacao.cabe
        ? el('p', {
            classe: 'campo__ajuda',
            style: 'margin-top:10px',
            texto: `Consolidação: sobra ${m3(r.consolidacao.restanteM3)} m³ no truck depois desta carga. Como a viagem já está vendida em parte, o aproveitamento subiu para ${percentual(r.aproveitamento)} e o quilo ficou mais barato.`,
          })
        : null,

      r.consolidacao && !r.consolidacao.cabe
        ? el('div', {
            classe: 'aviso aviso--atencao',
            texto: `Não cabe: o truck já tem ${m3(r.consolidacao.ocupadoM3)} m³ ocupados e esta carga tem ${m3(carga.volumeM3)} m³ — passa de ${m3(r.capacidadeM3)} m³. Seria outro veículo.`,
          })
        : null,

      r.bateuNoTeto
        ? el('div', {
            classe: 'aviso aviso--atencao',
            texto: `Essa carga já paga o preço do ${nomeDoVeiculo(r.regiao).toLowerCase()} inteiro — o valor foi travado nele. Vale oferecer o frete dedicado.`,
          })
        : null,

      r.fatia > 1
        ? el('div', {
            classe: 'aviso aviso--atencao',
            texto: `Essa carga não cabe num ${nomeDoVeiculo(r.regiao).toLowerCase()} só (${percentual(r.fatia)} da capacidade). Confira as medidas ou cote como dedicado.`,
          })
        : null,

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
      const c = medidaEmMetros(volume.comprimento)
      const l = medidaEmMetros(volume.largura)
      const a = medidaEmMetros(volume.altura)
      const cada = c * l * a
      const kg = numero(volume.pesoKg) * qtd

      // Mostrar as medidas já convertidas é o que avisa a pessoa de como
      // o número foi entendido: quem digitou "170" vê "1,70" na hora.
      const medidas = cada > 0 ? `${m3(c)} × ${m3(l)} × ${m3(a)} m — ` : ''
      subtotal.textContent = `${medidas}${m3(cada * qtd)} m³ · ${Math.round(kg).toLocaleString('pt-BR')} kg`
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
      el('div', { classe: 'secao__titulo', texto: 'Consolidação' }),
      campo('Espaço já vendido neste truck (m³)', campoNumerico('ocupadoM3', '0'),
        'Se a rota já tem cargas fechadas, informe quanto do truck elas ocupam. '
        + 'A carga nova aproveita a viagem e o preço dela cai de faixa.'),
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
