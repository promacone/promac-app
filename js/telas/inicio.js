// Tela inicial: o operador escolhe o módulo.
//
// Existe em vez de cair direto na cotação porque o app tem várias frentes
// e quem abre precisa ver o que dá para fazer. Os indicadores no topo
// respondem à pergunta que a operação faz primeiro toda manhã — quantas
// cargas estão rodando e quanto delas está atrasado.

import { bd, collection, getDocs } from '../firebase.js?v=20260824095009'
import { reais } from '../frete.js?v=20260824095009'
import { el, render, icone } from '../ui.js?v=20260824095009'

export function telaInicio({ sessao, modulos, aoEscolher, aoSair, aoAbrirConta }) {
  const areaResumo = el('div', { classe: 'inicio__resumo' })

  const raiz = el('div', { classe: 'inicio' }, [
    el('div', { classe: 'inicio__topo' }, [
      el('button', {
        classe: 'botao-pilula',
        onclick: aoAbrirConta,
      }, [icone(ICONE_PESSOA), 'Perfil']),
      el('button', {
        classe: 'botao-pilula',
        onclick: aoSair,
      }, [icone(ICONE_SAIR), 'Sair']),
    ]),

    el('div', { classe: 'inicio__marca' }, [
      el('img', { classe: 'inicio__logo', src: 'icones/logo-clara.png?v=20260824095009', alt: 'PROMAC Transportes' }),
      el('p', { classe: 'inicio__chamada', texto: 'Selecione o módulo que deseja acessar' }),
    ]),

    areaResumo,

    el('div', { classe: 'inicio__modulos' },
      modulos.map((modulo) =>
        el('button', {
          classe: 'modulo',
          onclick: () => aoEscolher(modulo.id),
        }, [
          el('div', {
            classe: 'modulo__icone',
            style: `background:${modulo.cor}22;color:${modulo.cor}`,
          }, [icone(modulo.icone)]),
          el('div', {}, [
            el('div', { classe: 'modulo__nome', texto: modulo.titulo }),
            el('div', { classe: 'modulo__descricao', texto: modulo.descricao }),
          ]),
          el('span', { classe: 'modulo__seta', texto: '›' }),
        ]))),

    el('p', {
      classe: 'campo__ajuda',
      style: 'text-align:center',
      texto: `Conectado como ${sessao.usuario.email}`,
    }),
  ])

  carregarIndicadores()

  /**
   * Números do dia.
   *
   * Falha de rede aqui não atrapalha nada: os cartões simplesmente não
   * aparecem, e os módulos continuam acessíveis.
   */
  async function carregarIndicadores() {
    let fretes
    try {
      const resultado = await getDocs(collection(bd, 'viagens'))
      fretes = resultado.docs.map((d) => d.data())
    } catch {
      return
    }

    const emAberto = fretes.filter((f) => f.estagio !== 'entregue')
    const atrasados = emAberto.filter(
      (f) => f.previsaoEntrega && f.previsaoEntrega < Date.now()
    )
    const valorEmAberto = emAberto.reduce((total, f) => total + (f.valorFrete || 0), 0)

    render(areaResumo,
      indicador(
        'Cargas em aberto',
        String(emAberto.length),
        reais(valorEmAberto),
        'var(--azul-claro)'
      ),
      indicador(
        'Atrasadas',
        String(atrasados.length),
        atrasados.length ? 'passaram da previsão' : 'nenhuma atrasada',
        atrasados.length ? 'var(--vermelho)' : 'var(--verde)'
      ),
    )
  }

  function indicador(rotulo, valor, nota, cor) {
    return el('div', { classe: 'indicador' }, [
      el('div', { classe: 'indicador__rotulo', texto: rotulo }),
      el('div', { classe: 'indicador__valor', style: `color:${cor}`, texto: valor }),
      el('div', { classe: 'indicador__nota', texto: nota }),
    ])
  }

  return raiz
}

const ICONE_PESSOA = 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z'
const ICONE_SAIR = 'M10 17l1.4-1.4-2.6-2.6H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h8V3H4a2 2 0 00-2 2v14a2 2 0 002 2h8v-2H4V5z'
