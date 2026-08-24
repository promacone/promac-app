// Arrastar cartões entre colunas, no mouse e no dedo.
//
// O problema no celular é que arrastar e rolar são o mesmo gesto: o dedo
// desce na tela e o navegador não sabe se você quer mover o cartão ou ver
// o resto da lista. A solução é a mesma que o iOS usa na tela de início —
// segurar por um instante antes de arrastar. Quem só quer rolar nunca
// segura, e o gesto passa direto.
//
// No mouse não há essa ambiguidade: basta clicar e puxar.

const ESPERA_TOQUE = 260   // ms segurando antes de o cartão soltar
const TOLERANCIA_TOQUE = 12 // px de folga antes de virar rolagem
const TOLERANCIA_MOUSE = 4  // px para diferenciar clique de arrasto
const BORDA_ROLAGEM = 70    // px da borda onde o quadro rola sozinho

let arrastando = null

/**
 * Prepara um cartão para ser arrastado.
 *
 * @param cartao elemento do cartão
 * @param dados  o que entregar ao soltar (aqui, o frete)
 * @param opcoes.aoSoltar   chamado com (dados, idDaColuna)
 * @param opcoes.aoClicar   chamado quando foi clique, não arrasto
 */
export function tornarArrastavel(cartao, dados, { aoSoltar, aoClicar }) {
  cartao.addEventListener('pointerdown', (evento) => {
    // Botão direito e cliques em botões dentro do cartão não arrastam.
    if (evento.button !== 0) return
    if (evento.target.closest('button')) return

    const ehToque = evento.pointerType !== 'mouse'
    const inicio = { x: evento.clientX, y: evento.clientY }
    let ativo = false
    let cronometro = null

    const comecar = () => {
      if (ativo) return
      ativo = true
      iniciarArrasto(cartao, dados, inicio)
    }

    // No dedo, espera o toque virar "segurar". No mouse, o próprio
    // movimento já decide.
    if (ehToque) {
      cronometro = setTimeout(comecar, ESPERA_TOQUE)
    }

    const aoMover = (e) => {
      const distancia = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y)

      if (!ativo) {
        if (ehToque) {
          // Mexeu antes de segurar: é rolagem, deixa o navegador cuidar.
          if (distancia > TOLERANCIA_TOQUE) encerrar(false)
          return
        }
        if (distancia > TOLERANCIA_MOUSE) comecar()
        else return
      }

      // Só a partir daqui bloqueamos a rolagem — antes disso o gesto
      // ainda podia ser dela.
      e.preventDefault()
      moverArrasto(e.clientX, e.clientY)
    }

    const aoSoltarPonteiro = (e) => {
      if (!ativo) {
        encerrar(false)
        // Sem arrasto, foi um toque comum: abre o cartão.
        if (aoClicar) aoClicar()
        return
      }

      const coluna = colunaSob(e.clientX, e.clientY)
      encerrar(true)
      if (coluna && coluna !== dados.estagio) aoSoltar(dados, coluna)
    }

    const encerrar = (houveArrasto) => {
      encerrarEscutas()
      if (houveArrasto || ativo) finalizarArrasto()
      ativo = false
    }

    const cancelar = () => {
      // O navegador cancela o ponteiro quando resolve rolar. Se o arrasto
      // já tinha começado, isso não deveria acontecer — mas se acontecer,
      // devolvemos o cartão ao lugar em vez de deixá-lo preso no ar.
      encerrar(true)
    }

    // No iOS, quem manda na rolagem é o touchmove, não o pointermove:
    // bloquear só o pointermove deixa a página rolar por baixo do arrasto.
    // Como o gesto só começa depois de o dedo ficar parado, a rolagem
    // ainda não arrancou quando chega o primeiro touchmove — e aí dá para
    // barrá-la.
    const barrarRolagem = (e) => { if (ativo) e.preventDefault() }

    const encerrarEscutas = () => {
      clearTimeout(cronometro)
      document.removeEventListener('pointermove', aoMover, { capture: true })
      document.removeEventListener('pointerup', aoSoltarPonteiro)
      document.removeEventListener('pointercancel', cancelar)
      document.removeEventListener('touchmove', barrarRolagem, { capture: true })
    }

    document.addEventListener('pointermove', aoMover, { capture: true, passive: false })
    document.addEventListener('pointerup', aoSoltarPonteiro)
    document.addEventListener('pointercancel', cancelar)
    document.addEventListener('touchmove', barrarRolagem, { capture: true, passive: false })
  })
}

function iniciarArrasto(cartao, dados, inicio) {
  const medida = cartao.getBoundingClientRect()

  // Uma cópia acompanha o ponteiro; o original fica apagado no lugar,
  // para a coluna não "pular" enquanto o cartão está no ar.
  const sombra = cartao.cloneNode(true)
  sombra.classList.add('ficha--voando')
  sombra.style.width = `${medida.width}px`
  document.body.append(sombra)

  cartao.classList.add('ficha--fantasma')
  document.body.classList.add('arrastando')

  arrastando = {
    sombra,
    original: cartao,
    dados,
    // Onde o dedo pegou o cartão, para ele não saltar para o canto.
    deslocX: inicio.x - medida.left,
    deslocY: inicio.y - medida.top,
    ultimaColuna: null,
  }

  moverArrasto(inicio.x, inicio.y)

  if (navigator.vibrate) navigator.vibrate(8)
}

function moverArrasto(x, y) {
  if (!arrastando) return

  arrastando.sombra.style.transform =
    `translate(${x - arrastando.deslocX}px, ${y - arrastando.deslocY}px) rotate(2deg)`

  destacarColuna(colunaSob(x, y))
  rolarSeNaBorda(x)
}

function destacarColuna(id) {
  if (arrastando.ultimaColuna === id) return

  document.querySelectorAll('.coluna--alvo').forEach((c) => c.classList.remove('coluna--alvo'))
  if (id) {
    document.querySelector(`.coluna[data-etapa="${id}"]`)?.classList.add('coluna--alvo')
  }
  arrastando.ultimaColuna = id
}

/** Descobre qual coluna está debaixo do ponteiro. */
function colunaSob(x, y) {
  // A cópia que voa tem pointer-events desligado, então não atrapalha.
  const alvo = document.elementFromPoint(x, y)
  return alvo?.closest('.coluna')?.dataset.etapa || null
}

/**
 * Rola o quadro quando o cartão chega perto da borda.
 *
 * Sem isso não dá para levar uma carga de "Coleta" até "Entregue" no
 * celular: as outras colunas ficam fora da tela e o dedo não alcança.
 */
function rolarSeNaBorda(x) {
  const quadro = document.querySelector('.quadro')
  if (!quadro) return

  const medida = quadro.getBoundingClientRect()

  if (x < medida.left + BORDA_ROLAGEM) {
    quadro.scrollLeft -= 14
  } else if (x > medida.right - BORDA_ROLAGEM) {
    quadro.scrollLeft += 14
  }
}

function finalizarArrasto() {
  if (!arrastando) return

  arrastando.sombra.remove()
  arrastando.original.classList.remove('ficha--fantasma')
  document.body.classList.remove('arrastando')
  document.querySelectorAll('.coluna--alvo').forEach((c) => c.classList.remove('coluna--alvo'))

  arrastando = null
}
