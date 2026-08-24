// Módulo de configurações da empresa.
//
// Os percentuais moram aqui, e não na tela de equipe: mexer em quem tem
// acesso e mexer em quanto se cobra são assuntos diferentes, e misturá-los
// numa tela só confundia na hora de achar.

import { salvarParametros, salvarAjustesFracionado } from '../equipe.js?v=20260824170228'
import { RESOLUCAO_ANTT, percentual, numero } from '../frete.js?v=20260824170228'
import { regiao, FAIXAS_PADRAO } from '../fracionado.js?v=20260824170228'
import { mensagemDeErro } from '../firebase.js?v=20260824170228'
import { el, render, campo, mostrarAviso, comCarregamento } from '../ui.js?v=20260824170228'

export function telaConfiguracoes(sessao) {
  const ehAdministrador = sessao.membro.papel === 'master'
  const avisoEl = el('div')

  /**
   * Campo de percentual.
   *
   * É de texto, não numérico: o teclado do iPhone em português produz
   * vírgula, e um campo numérico do HTML recusa vírgula em silêncio — a
   * pessoa digita 0,25 e o navegador entende campo vazio.
   */
  function campoPercentual(fracao, casas = 2) {
    const input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: formatar(fracao, casas),
      disabled: !ehAdministrador,
      style: 'padding-right:38px',
    })

    // O "%" fica sobreposto à direita, para o campo continuar sendo um
    // número puro e a pessoa não precisar digitar o símbolo.
    return el('div', { style: 'position:relative' }, [
      input,
      el('span', {
        style: 'position:absolute;right:14px;top:50%;transform:translateY(-50%);color:var(--texto-fraco);pointer-events:none;font-weight:600',
        texto: '%',
      }),
    ])
  }

  function formatar(fracao, casas) {
    return (fracao * 100)
      .toFixed(casas)
      .replace(/\.?0+$/, '')
      .replace('.', ',')
  }

  /** Lê o campo aceitando tanto "0,25" quanto "0.25". */
  function ler(caixa) {
    const input = caixa.querySelector('input')
    const valor = parseFloat(String(input.value).replace(',', '.'))
    return Number.isFinite(valor) && valor >= 0 && valor < 100 ? valor / 100 : null
  }

  const margemA = campoPercentual(sessao.parametros.tabelas.a)
  const margemB = campoPercentual(sessao.parametros.tabelas.b)
  const margemC = campoPercentual(sessao.parametros.tabelas.c)
  const imposto = campoPercentual(sessao.parametros.imposto)
  const gris = campoPercentual(sessao.parametros.gris, 4)

  const resumo = el('div')

  function atualizarResumo() {
    const p = sessao.parametros
    render(resumo,
      el('p', { classe: 'campo__ajuda' }, [
        `Em vigor: imposto ${percentual(p.imposto)}, GRIS ${percentual(p.gris)}. `,
        `Tabelas ${percentual(p.tabelas.a)} · ${percentual(p.tabelas.b)} · ${percentual(p.tabelas.c)}.`,
      ]),
    )
  }

  const raiz = el('div', { style: 'display:grid;gap:14px' }, [
    avisoEl,

    !ehAdministrador
      ? el('div', {
          classe: 'aviso aviso--atencao',
          texto: 'Só o administrador pode alterar os percentuais. Você está vendo os valores em vigor.',
        })
      : null,

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Margens por tabela de preço' }),
      campo('Tabela A — preço cheio', margemA),
      campo('Tabela B — desconto moderado', margemB),
      campo('Tabela C — desconto máximo', margemC,
        'O desconto sai do seu lucro. O piso pago ao motorista e o imposto não mudam entre as tabelas.'),
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Impostos e seguro' }),
      campo('Imposto sobre o faturamento', imposto,
        'Igual nas três tabelas. Entra por dentro do preço: é fatia do que o cliente paga, não do custo.'),
      campo('GRIS sobre o valor da NF-e', gris,
        'Seguro da carga. Calculado sobre a nota fiscal, não sobre o frete.'),
    ]),

    ehAdministrador
      ? el('div', { classe: 'cartao' }, [
          resumo,
          el('button', {
            classe: 'botao',
            style: 'margin-top:10px',
            texto: 'Salvar percentuais',
            onclick: (evento) => comCarregamento(evento.currentTarget, salvar),
          }),
        ])
      : el('div', { classe: 'cartao' }, [resumo]),

    cartaoFracionado(),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Tabela de piso mínimo' }),
      el('p', { classe: 'campo__ajuda' }, [
        `${RESOLUCAO_ANTT.nome}, vigente desde ${RESOLUCAO_ANTT.vigenteDesde}. `,
        'A ANTT republica esses valores algumas vezes por ano — quando sair resolução nova, me avise para atualizar.',
      ]),
    ]),
  ])

  /**
   * Motor do frete fracionado — Sul e Sudeste.
   *
   * O que se ajusta aqui muda o preço para a equipe inteira na hora: o
   * truck de referência, o embarque, o mínimo e as quatro faixas de
   * margem por ocupação que o Pedro definiu.
   */
  function cartaoFracionado() {
    const padrao = regiao('sulSudeste')
    const atual = sessao.parametros.fracionado || {}
    const caminhaoAtual = { ...padrao.caminhao, ...(atual.caminhao || {}) }
    const faixasAtuais = atual.faixas || padrao.faixas || FAIXAS_PADRAO

    const avisoFrac = el('div')

    const numerico = (valor) => el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: String(valor).replace('.', ','),
      disabled: !ehAdministrador,
    })

    const capacidadeKg = numerico(caminhaoAtual.capacidadeKg)
    const capacidadeM3 = numerico(caminhaoAtual.capacidadeM3 || 48)
    const posicoes = numerico(caminhaoAtual.posicoes || 14)
    const embarque = numerico(atual.embarque ?? padrao.embarque)
    const minimo = numerico(atual.minimo ?? padrao.minimo)

    // Uma linha por faixa: "até X% -> fator Y".
    const camposFaixas = faixasAtuais.map((f) => ({
      ate: numerico(Math.round(f.ate * 100)),
      fator: numerico(f.fator),
    }))

    const rotulosFaixas = [
      'Ocupação pequena — margem mais alta',
      'Ocupação média — margem padrão',
      'Ocupação grande — margem reduzida',
      'Fecha o caminhão — margem mínima',
    ]

    async function salvarFracionado(botao) {
      mostrarAviso(avisoFrac, '')

      const lerNumero = (input) => {
        const v = numero(input.value)
        return Number.isFinite(v) && v > 0 ? v : null
      }

      const dados = {
        caminhao: {
          capacidadeKg: lerNumero(capacidadeKg),
          capacidadeM3: lerNumero(capacidadeM3),
          posicoes: lerNumero(posicoes),
        },
        embarque: numero(embarque.value),
        minimo: numero(minimo.value),
        faixas: camposFaixas.map((c) => ({
          ate: (lerNumero(c.ate) || 0) / 100,
          fator: lerNumero(c.fator),
        })),
      }

      if (!dados.caminhao.capacidadeKg || !dados.caminhao.capacidadeM3) {
        mostrarAviso(avisoFrac, 'Capacidade de peso e de cubagem precisam ser maiores que zero.')
        return
      }
      if (dados.faixas.some((f) => !f.fator || f.ate <= 0 || f.ate > 1)) {
        mostrarAviso(avisoFrac, 'Cada faixa precisa de um limite entre 1 e 100% e um fator maior que zero.')
        return
      }
      // Faixas fora de ordem fariam a interpolação andar para trás.
      for (let i = 1; i < dados.faixas.length; i++) {
        if (dados.faixas[i].ate <= dados.faixas[i - 1].ate) {
          mostrarAviso(avisoFrac, 'Os limites das faixas precisam crescer: cada um maior que o anterior.')
          return
        }
      }

      await comCarregamento(botao, async () => {
        try {
          await salvarAjustesFracionado(dados)
          sessao.parametros.fracionado = dados
          mostrarAviso(avisoFrac, 'Motor do fracionado salvo. As cotações já usam os novos valores.', 'ok')
        } catch (erro) {
          mostrarAviso(avisoFrac, mensagemDeErro(erro))
        }
      })
    }

    return el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Frete fracionado — Sul e Sudeste' }),
      el('p', {
        classe: 'campo__ajuda',
        texto: 'O truck de referência do rateio e a régua de margem por ocupação. Vale para a equipe inteira.',
      }),

      campo('Peso máximo do truck (kg)', capacidadeKg),
      campo('Cubagem máxima (m³)', capacidadeM3),
      campo('Posições de pallet', posicoes),
      campo('Embarque — coleta e manuseio (R$)', embarque,
        'Parcela fixa somada a toda cotação. É o que segura o preço da carga pequena.'),
      campo('Frete mínimo (R$)', minimo),

      el('div', { classe: 'secao__titulo', style: 'margin-top:8px', texto: 'Margem por ocupação do truck' }),
      ...camposFaixas.map((c, i) =>
        el('div', { classe: 'faixa' }, [
          el('div', { classe: 'campo__ajuda', texto: rotulosFaixas[i] || `Faixa ${i + 1}` }),
          el('div', { classe: 'faixa__campos' }, [
            el('label', { classe: 'volume__campo' }, [
              el('span', { classe: 'volume__rotulo', texto: 'Até (%)' }),
              c.ate,
            ]),
            el('label', { classe: 'volume__campo' }, [
              el('span', { classe: 'volume__rotulo', texto: 'Fator' }),
              c.fator,
            ]),
          ]),
        ])),

      avisoFrac,

      ehAdministrador
        ? el('button', {
            classe: 'botao',
            style: 'margin-top:6px',
            texto: 'Salvar motor do fracionado',
            onclick: (evento) => salvarFracionado(evento.currentTarget),
          })
        : null,
    ])
  }

  async function salvar() {
    mostrarAviso(avisoEl, '')

    const tabelas = { a: ler(margemA), b: ler(margemB), c: ler(margemC) }
    const valorImposto = ler(imposto)
    const valorGris = ler(gris)

    if ([tabelas.a, tabelas.b, tabelas.c, valorImposto, valorGris].some((v) => v === null)) {
      mostrarAviso(avisoEl, 'Preencha todos os percentuais com números entre 0 e 99.')
      return
    }

    // Imposto somado à margem precisa deixar sobrar algo para pagar o
    // custo — senão não existe preço que feche a conta.
    const maiorMargem = Math.max(tabelas.a, tabelas.b, tabelas.c)
    if (valorImposto + maiorMargem >= 1) {
      mostrarAviso(avisoEl, 'Imposto somado à maior margem precisa ficar abaixo de 100%.')
      return
    }

    try {
      await salvarParametros({ imposto: valorImposto, gris: valorGris, tabelas })
      Object.assign(sessao.parametros, { imposto: valorImposto, gris: valorGris, tabelas })
      atualizarResumo()
      mostrarAviso(avisoEl, 'Percentuais salvos. A cotação já usa os novos valores.', 'ok')
    } catch (erro) {
      mostrarAviso(avisoEl, mensagemDeErro(erro))
    }
  }

  atualizarResumo()
  return raiz
}
