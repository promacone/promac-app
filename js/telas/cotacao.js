// Módulo de cotação de frete.

import {
  TIPOS_DE_CARGA, RESOLUCAO_ANTT, coeficientes, eixosDisponiveis,
  calcularFrete, reais, percentual, numero,
} from '../frete.js'
import { el, render, campo, linha, seletor } from '../ui.js'

export function telaCotacao({ parametros }) {
  const estado = {
    tipo: 'geral',
    eixos: 5,
    distanciaKm: '',
    valorNFe: '',
    tarifaPedagio: '',
    tabela: 'a',
  }

  // A tela é montada uma vez e só as partes que mudam são redesenhadas.
  // Redesenhar os campos de digitação a cada tecla faria o teclado do
  // iPhone fechar no meio da palavra.
  const areaEixos = el('div')
  const areaTabelas = el('div', { style: 'display:flex;gap:8px' })
  const areaResumo = el('div')
  const areaTotal = el('div')

  function parametrosAtuais() {
    return {
      imposto: parametros.imposto,
      margem: parametros.tabelas[estado.tabela],
      gris: parametros.gris,
    }
  }

  function recalcular() {
    const r = calcularFrete({
      distanciaKm: numero(estado.distanciaKm),
      valorNFe: numero(estado.valorNFe),
      eixos: estado.eixos,
      tarifaPedagioPorEixo: numero(estado.tarifaPedagio),
      coeficientes: coeficientes(estado.tipo, estado.eixos),
      parametros: parametrosAtuais(),
    })

    render(areaResumo,
      el('div', { classe: 'secao__titulo', texto: `Frete — Tabela ${estado.tabela.toUpperCase()}` }),
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

  function redesenharEixos() {
    const eixos = eixosDisponiveis(estado.tipo)
    // Nem todo tipo de carga tem todas as quantidades de eixos.
    if (!eixos.includes(estado.eixos)) estado.eixos = eixos[0] || 2

    render(areaEixos, campo('Eixos', seletor(estado.eixos,
      eixos.map((e) => ({ valor: e, titulo: `${e} eixos` })),
      (valor) => { estado.eixos = Number(valor); recalcular() })))
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

  function campoNumerico(nome, placeholder) {
    return el('input', {
      type: 'text',
      inputmode: 'decimal',
      placeholder,
      value: estado[nome],
      oninput: (e) => { estado[nome] = e.target.value; recalcular() },
    })
  }

  const raiz = el('div', { style: 'display:grid;gap:16px' }, [
    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Carga' }),
      campo('Tipo', seletor(estado.tipo,
        TIPOS_DE_CARGA.map((t) => ({ valor: t.id, titulo: t.titulo })),
        (valor) => { estado.tipo = valor; redesenharEixos(); recalcular() })),
      areaEixos,
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Viagem' }),
      campo('Distância (km)', campoNumerico('distanciaKm', '0')),
      campo('Valor da NF-e (R$)', campoNumerico('valorNFe', '0,00')),
      campo(
        'Pedágio por eixo na rota (R$)',
        campoNumerico('tarifaPedagio', '0,00'),
        'Some as tarifas das praças da rota para um eixo. O cálculo automático pela Qualp chega em breve.'
      ),
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
