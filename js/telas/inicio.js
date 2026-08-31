// Tela inicial: o operador escolhe o módulo.
//
// Existe em vez de cair direto na cotação porque o app tem várias frentes
// e quem abre precisa ver o que dá para fazer. Só isso: os números do dia
// ficam dentro de Contratações, onde há o que fazer com eles.

import { el, icone } from '../ui.js?v=20260831113604'

export function telaInicio({ sessao, modulos, aoEscolher, aoSair, aoAbrirConta }) {
  return el('div', { classe: 'inicio' }, [
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
      el('img', { classe: 'inicio__logo', src: 'icones/logo-clara.png?v=20260831113604', alt: 'PROMAC Transportes' }),
      el('p', { classe: 'inicio__chamada', texto: 'Selecione o módulo que deseja acessar' }),
    ]),

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
}

const ICONE_PESSOA = 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.4 0-9 2.2-9 5v3h18v-3c0-2.8-4.6-5-9-5z'
const ICONE_SAIR = 'M10 17l1.4-1.4-2.6-2.6H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h8V3H4a2 2 0 00-2 2v14a2 2 0 002 2h8v-2H4V5z'
