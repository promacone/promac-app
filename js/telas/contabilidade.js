// Módulo Contabilidade — reservado.
//
// O Pedro pediu para deixá-lo vazio por enquanto: ele ainda vai desenhar
// como quer esse quadro. A versão anterior (cartões do mês, lançamentos
// e importação das planilhas) está no histórico do git, commit
// "Modulo Contabilidade: despesas, receitas e vendas por mes", para
// aproveitar o que servir quando chegar a hora.

import { el } from '../ui.js?v=20260831161035'

export function telaContabilidade() {
  return el('div', { classe: 'cartao', style: 'text-align:center;padding:40px 20px' }, [
    el('div', { classe: 'secao__titulo', texto: 'Em construção' }),
    el('p', {
      classe: 'campo__ajuda',
      texto: 'Este módulo ainda vai ser desenhado. Nada foi ligado aqui por enquanto.',
    }),
  ])
}
