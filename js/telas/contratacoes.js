// Quadro de contratações: cada coluna é uma etapa, cada cartão é uma
// carga. No celular as colunas deslizam na horizontal; o cartão muda de
// etapa por botões dentro dele — arrastar com o dedo brigaria com a
// rolagem da página.

import {
  bd, doc, setDoc, updateDoc, deleteDoc, collection, getDocs, arrayUnion,
} from '../firebase.js?v=20260824134355'
import { reais } from '../frete.js?v=20260824134355'
import { el, render, campo, linha, mostrarAviso, seletor } from '../ui.js?v=20260824134355'
import { tornarArrastavel } from '../arrastar.js?v=20260824134355'

/** Os fretes de verdade, no Firestore. */
export function firestore() {
  return {
    async listar() {
      const resultado = await getDocs(collection(bd, 'viagens'))
      return resultado.docs.map((d) => ({ id: d.id, ...d.data() }))
    },
    async salvar(frete) {
      // O diário fica de fora de propósito, e a gravação é por mesclagem.
      //
      // Enquanto o escritório edita um frete, alguém na rua pode estar
      // anotando nele pelo celular. Gravando o documento inteiro, a
      // versão que o escritório carregou (sem a anotação nova) voltaria
      // por cima e apagaria o que a rua escreveu. Anotação só entra por
      // arrayUnion, nunca por aqui.
      const { id, anotacoes, ...campos } = frete
      await setDoc(doc(bd, 'viagens', id), campos, { merge: true })
    },
    async apagar(id) {
      await deleteDoc(doc(bd, 'viagens', id))
    },
    /**
     * Acrescenta uma anotação ao diário do frete.
     *
     * Usa arrayUnion em vez de reescrever o frete inteiro: o motorista
     * pode estar sendo movido de fase no computador do escritório no
     * mesmo minuto em que alguém anota pelo celular, e um setDoc
     * apagaria o trabalho do outro.
     */
    async anotar(id, entrada) {
      await updateDoc(doc(bd, 'viagens', id), { anotacoes: arrayUnion(entrada) })
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

  /**
   * Registra uma anotação no diário do frete.
   *
   * A etapa fica gravada junto: seis dias depois, "caminhão quebrou em
   * Feira de Santana" só quer dizer alguma coisa se der para saber que
   * isso foi anotado quando a carga já estava em rota.
   */
  async function anotar(frete, texto) {
    const entrada = {
      id: crypto.randomUUID(),
      texto: texto.trim(),
      estagio: frete.estagio,
      autor: sessao.membro?.nome || sessao.usuario?.email || 'Equipe',
      em: Date.now(),
    }

    await repositorio.anotar(frete.id, entrada)

    // Atualiza o que já está na tela, para a anotação aparecer sem
    // esperar uma nova leitura do servidor.
    //
    // O Set é o que evita contar duas vezes: quase sempre a ficha aberta
    // e o item da lista são o mesmo objeto, e acrescentar em ambos sem
    // conferir fazia a anotação aparecer duplicada.
    const naLista = estado.fretes.find((f) => f.id === frete.id)
    for (const alvo of new Set([naLista, frete].filter(Boolean))) {
      alvo.anotacoes = [...(alvo.anotacoes || []), entrada]
    }

    desenharColunas()
    return entrada
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

  /**
   * Contador do topo do quadro.
   *
   * O número grande é a quantidade de cargas, não o dinheiro: a pergunta
   * de quem abre o quadro é "quantas estão rodando", e o valor somado só
   * ajuda depois. Ele continua logo abaixo, em letra menor.
   *
   * "Em aberto" junta as quatro primeiras etapas — tudo que ainda não
   * chegou. "Entregues" conta só a última.
   */
  function totalizador(titulo, fretes, cor) {
    const soma = fretes.reduce((total, f) => total + (f.valorFrete || 0), 0)
    const quantidade = fretes.length

    return el('div', { classe: 'cartao contador' }, [
      el('div', { classe: 'secao__titulo', texto: titulo }),
      el('div', { classe: 'contador__numero', style: `color:${cor}`, texto: String(quantidade) }),
      el('div', {
        classe: 'campo__ajuda',
        texto: `${quantidade === 1 ? 'carga' : 'cargas'} · ${reais(soma)}`,
      }),
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
        // Apagar sem precisar abrir a ficha inteira. Discreto e com
        // pergunta antes: no celular ele fica a um dedo de distância dos
        // botões de mover.
        el('button', {
          classe: 'ficha__apagar',
          type: 'button',
          title: 'Apagar este frete',
          'aria-label': 'Apagar este frete',
          texto: '×',
          onclick: (e) => { e.stopPropagation(); confirmarApagar(frete) },
        }),
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

      // A anotação mais recente aparece no cartão: quem olha o quadro de
      // manhã quer saber onde cada carga está sem abrir uma por uma.
      ultimaAnotacao(frete)
        ? el('div', { classe: 'ficha__nota' }, [
            el('span', { classe: 'ficha__nota-texto', texto: ultimaAnotacao(frete).texto }),
            el('span', {
              classe: 'ficha__nota-quando',
              texto: dataCurta(ultimaAnotacao(frete).em),
            }),
          ])
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
      aoClicar: () => abrirFicha(frete),
    })

    return ficha
  }

  /**
   * Abre um painel deslizante e devolve o corpo dele para preencher.
   *
   * Um só lugar cuidando de fundo, fechar no toque de fora e rolagem —
   * antes cada tela remontava isso com estilo escrito à mão.
   */
  function abrirPainel(titulo) {
    const corpo = el('div', { classe: 'painel' })
    const fundo = el('div', { classe: 'painel-fundo' }, [corpo])

    fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar() })
    corpo.addEventListener('click', (e) => e.stopPropagation())

    function fechar() {
      fundo.remove()
      document.removeEventListener('keydown', aoTeclar)
    }

    // Esc fecha: quem trabalha no computador o dia inteiro espera isso.
    const aoTeclar = (e) => { if (e.key === 'Escape') fechar() }
    document.addEventListener('keydown', aoTeclar)

    const areaTitulo = el('span', { classe: 'painel__titulo', texto: titulo })
    corpo.append(el('div', { classe: 'painel__topo' }, [
      areaTitulo,
      el('button', { classe: 'botao-secundario', texto: 'Fechar', onclick: fechar }),
    ]))

    document.body.append(fundo)
    return { corpo, fechar, definirTitulo: (texto) => { areaTitulo.textContent = texto } }
  }

  // ---------- Ficha da carga ----------

  /**
   * Mostra a carga por inteiro, sem entrar no modo de edição.
   *
   * Abrir direto no formulário obrigava a ler os dados dentro de campos
   * editáveis — dá para conferir, mas basta um toque errado para alterar
   * um valor sem perceber. Aqui a informação fica só de leitura, e
   * mexer nela é uma decisão à parte.
   */
  function abrirFicha(freteOriginal) {
    // O quadro se redesenha ao anotar; a ficha precisa acompanhar o
    // objeto que está na lista, não uma cópia velha.
    const buscar = () => estado.fretes.find((f) => f.id === freteOriginal.id) || freteOriginal

    const painel = abrirPainel(freteOriginal.cliente || 'Sem cliente')
    const conteudo = el('div', { style: 'display:grid;gap:14px' })
    painel.corpo.append(conteudo)

    function desenharFicha() {
      const frete = buscar()
      const etapa = estagio(frete.estagio)
      const indice = ESTAGIOS.findIndex((e) => e.id === frete.estagio)
      const anterior = ESTAGIOS[indice - 1]
      const proximo = ESTAGIOS[indice + 1]
      const atrasado = frete.estagio !== 'entregue'
        && frete.previsaoEntrega && frete.previsaoEntrega < Date.now()

      const margem = (frete.valorFrete || 0) - (frete.valorMotorista || 0)

      render(conteudo,
        // Fase atual, com o mesmo verde/azul/amarelo da coluna.
        el('div', { classe: 'ficha-fase', style: `--cor-etapa:${etapa.cor}` }, [
          el('div', {}, [
            el('div', { classe: 'secao__titulo', texto: 'Fase atual' }),
            el('div', { classe: 'ficha-fase__nome', texto: etapa.titulo }),
          ]),
          el('div', { classe: 'ficha-fase__acoes' }, [
            anterior
              ? el('button', {
                  classe: 'botao-secundario',
                  texto: `← ${anterior.titulo}`,
                  onclick: async () => { await salvar(movido(buscar(), anterior.id)); desenharFicha() },
                })
              : null,
            proximo
              ? el('button', {
                  classe: 'botao-secundario',
                  texto: `${proximo.titulo} →`,
                  onclick: async () => { await salvar(movido(buscar(), proximo.id)); desenharFicha() },
                })
              : null,
          ]),
        ]),

        frete.prioridade && frete.prioridade !== 'normal'
          ? el('div', {
              classe: 'aviso aviso--atencao',
              texto: frete.prioridade === 'urgente' ? 'Carga urgente' : 'Carga prioritária',
            })
          : null,

        atrasado
          ? el('div', { classe: 'aviso', texto: `Passou da previsão de entrega (${dataCurta(frete.previsaoEntrega)}).` })
          : null,

        el('div', { classe: 'cartao' }, [
          el('div', { classe: 'secao__titulo', texto: 'Rota' }),
          linha('Cidade de coleta', frete.cidadeColeta || '—'),
          linha('Cidade de entrega', frete.cidadeEntrega || '—'),
          frete.dataColeta ? linha('Data da coleta', dataCurta(frete.dataColeta)) : null,
          frete.previsaoEntrega ? linha('Previsão de entrega', dataCurta(frete.previsaoEntrega)) : null,
        ]),

        el('div', { classe: 'cartao' }, [
          el('div', { classe: 'secao__titulo', texto: 'Carga e valores' }),
          linha('Tipo de veículo', frete.tipoVeiculo || '—'),
          linha('Valor do frete', reais(frete.valorFrete || 0), true),
          linha('Pago ao motorista', reais(frete.valorMotorista || 0)),
          // O que sobra é a conta que interessa na hora de aceitar ou não.
          linha('Sobra para a PROMAC', reais(margem), true),
        ]),

        el('div', { classe: 'cartao' }, [
          el('div', { classe: 'secao__titulo', texto: 'Motorista' }),
          frete.motoristaNome || frete.placa || frete.motoristaTelefone
            ? el('div', { style: 'display:grid;gap:2px' }, [
                linha('Nome', frete.motoristaNome || '—'),
                linha('Placa', frete.placa ? String(frete.placa).toUpperCase() : '—'),
                frete.motoristaTelefone
                  ? el('div', { classe: 'linha' }, [
                      el('span', { classe: 'linha__rotulo', texto: 'Telefone' }),
                      // Link direto: acompanhar motorista é ligar e mandar
                      // mensagem o dia inteiro, e digitar o número de novo
                      // a cada vez é onde o erro acontece.
                      el('a', {
                        classe: 'ficha-contato',
                        href: `https://wa.me/${soNumeros(frete.motoristaTelefone)}`,
                        target: '_blank',
                        rel: 'noopener',
                        texto: frete.motoristaTelefone,
                      }),
                    ])
                  : linha('Telefone', '—'),
              ])
            : el('p', { classe: 'campo__ajuda', texto: 'Motorista ainda não contratado.' }),
        ]),

        frete.observacoes
          ? el('div', { classe: 'cartao' }, [
              el('div', { classe: 'secao__titulo', texto: 'Observações do cadastro' }),
              el('p', { classe: 'ficha-texto', texto: frete.observacoes }),
            ])
          : null,

        diario(frete),

        el('div', { classe: 'cartao' }, [
          el('div', { classe: 'secao__titulo', texto: 'Registro' }),
          frete.criadoEm ? linha('Cadastrado em', dataHora(frete.criadoEm)) : null,
          frete.saiuEm ? linha('Saiu para a rota', dataHora(frete.saiuEm)) : null,
          frete.entregueEm ? linha('Entregue em', dataHora(frete.entregueEm)) : null,
        ]),

        el('button', {
          classe: 'botao',
          texto: 'Editar dados do frete',
          onclick: () => { painel.fechar(); abrirFormulario(buscar()) },
        }),

        el('button', {
          classe: 'botao botao-perigo',
          texto: 'Apagar frete',
          onclick: async () => {
            const foi = await confirmarApagar(buscar())
            if (foi) painel.fechar()
          },
        }),
      )
    }

    /**
     * Diário de acompanhamento.
     *
     * É onde entra o que muda todo dia e não cabe em campo fixo: onde o
     * caminhão parou, por que atrasou, o que o cliente pediu. Cada
     * anotação guarda a fase em que foi escrita, então a leitura de
     * depois não perde o contexto.
     */
    function diario(frete) {
      const anotacoes = [...(frete.anotacoes || [])].sort((a, b) => (b.em || 0) - (a.em || 0))
      const etapa = estagio(frete.estagio)

      const caixa = el('textarea', {
        rows: 2,
        placeholder: `O que aconteceu hoje em "${etapa.titulo}"?`,
      })
      const avisoDiario = el('div')

      const registrar = async () => {
        const texto = caixa.value.trim()
        if (!texto) {
          mostrarAviso(avisoDiario, 'Escreva a anotação antes de registrar.')
          return
        }

        botao.disabled = true
        try {
          await anotar(buscar(), texto)
          caixa.value = ''
          mostrarAviso(avisoDiario, '')
          desenharFicha()
        } catch {
          mostrarAviso(avisoDiario, 'Não consegui registrar a anotação. Tente de novo.')
        } finally {
          botao.disabled = false
        }
      }

      const botao = el('button', {
        classe: 'botao',
        texto: 'Registrar anotação',
        onclick: registrar,
      })

      // Ctrl/Cmd + Enter registra sem tirar a mão do teclado.
      caixa.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); registrar() }
      })

      return el('div', { classe: 'cartao' }, [
        el('div', { classe: 'secao__titulo', texto: `Acompanhamento diário (${anotacoes.length})` }),
        caixa,
        avisoDiario,
        botao,

        anotacoes.length
          ? el('div', { classe: 'diario' }, anotacoes.map((nota) => {
              const daEtapa = estagio(nota.estagio)
              return el('div', { classe: 'diario__item', style: `--cor-etapa:${daEtapa.cor}` }, [
                el('div', { classe: 'diario__topo' }, [
                  el('span', { classe: 'diario__fase', texto: daEtapa.titulo }),
                  el('span', { classe: 'diario__quando', texto: dataHora(nota.em) }),
                ]),
                el('p', { classe: 'ficha-texto', texto: nota.texto }),
                el('div', { classe: 'diario__autor', texto: nota.autor || 'Equipe' }),
              ])
            }))
          : el('p', { classe: 'campo__ajuda', texto: 'Nenhuma anotação ainda.' }),
      ])
    }

    desenharFicha()
  }

  /**
   * Pergunta e apaga.
   *
   * Apagar um frete não tem desfazer, então a pergunta traz o nome do
   * cliente — no quadro cheio é fácil clicar no cartão de baixo.
   *
   * @returns true se apagou.
   */
  async function confirmarApagar(frete) {
    const nome = frete.cliente || 'sem cliente'
    if (!confirm(`Apagar o frete de ${nome}? Isso não pode ser desfeito.`)) return false
    await apagar(frete.id)
    return true
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

    const painel = abrirPainel(ehNovo ? 'Novo frete' : 'Editar frete')
    const fechar = painel.fechar

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

    painel.corpo.append(el('div', { style: 'display:grid;gap:12px' }, [
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
          const foi = await confirmarApagar(frete)
          if (foi) fechar()
        },
      }),
    ]))
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

/** A anotação mais recente do diário, se houver alguma. */
function ultimaAnotacao(frete) {
  const lista = frete.anotacoes
  if (!lista || !lista.length) return null
  return lista.reduce((maisNova, nota) => ((nota.em || 0) > (maisNova.em || 0) ? nota : maisNova))
}

/**
 * Deixa só os dígitos e completa o país.
 *
 * O telefone é digitado como dá — "(42) 99999-8888", "42 99999 8888" — e
 * o WhatsApp só abre com o número limpo e com o 55 na frente.
 */
function soNumeros(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '')
  return digitos.startsWith('55') ? digitos : `55${digitos}`
}
