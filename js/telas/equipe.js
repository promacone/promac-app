// Onde o administrador convida, desliga e apaga quem usa o app — e ajusta
// os percentuais comerciais da empresa.

import { auth, sendPasswordResetEmail, mensagemDeErro, abrirAcessoParaConvidado } from '../firebase.js?v=20260831115307'
import {
  listarEquipe, convidar, definirAtivo, removerMembro, pareceEmail, chave,
} from '../equipe.js?v=20260831115307'
import { el, render, campo, mostrarAviso, comCarregamento } from '../ui.js?v=20260831115307'

export function telaEquipe(sessao) {
  const raiz = el('div', { style: 'display:grid;gap:14px' })
  const avisoEl = el('div')
  const areaLista = el('div', { classe: 'cartao' })

  async function carregar() {
    try {
      const membros = await listarEquipe()
      desenharLista(membros)
    } catch {
      mostrarAviso(avisoEl, 'Não consegui carregar a equipe agora.')
    }
  }

  function desenharLista(membros) {
    render(areaLista,
      el('div', { classe: 'secao__titulo', texto: 'Equipe' }),
      membros.length
        ? membros.map(linhaDeMembro)
        : el('p', { classe: 'campo__ajuda', texto: 'Ninguém convidado ainda.' }),
      el('p', {
        classe: 'campo__ajuda',
        style: 'margin-top:10px',
        texto: 'Toque em alguém para reenviar o convite, tirar o acesso ou apagar.',
      }),
    )
  }

  function etiqueta(membro) {
    if (!membro.ativo) return el('span', { style: 'color:var(--vermelho);font-size:12px;font-weight:700', texto: 'Sem acesso' })
    if (membro.jaEntrou) return el('span', { style: 'color:var(--verde);font-size:12px;font-weight:700', texto: 'Ativo' })
    return el('span', { style: 'color:var(--amarelo);font-size:12px;font-weight:700', texto: 'Convidado' })
  }

  function linhaDeMembro(membro) {
    return el('div', {
      style: 'display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--borda);cursor:pointer',
      onclick: () => abrirAcoes(membro),
    }, [
      el('div', {}, [
        el('div', { style: 'font-weight:600', texto: membro.nome }),
        el('div', { classe: 'campo__ajuda', texto: membro.email }),
        membro.papel === 'master'
          ? el('div', { style: 'color:var(--azul-vivo);font-size:12px', texto: 'Administrador' })
          : null,
      ]),
      etiqueta(membro),
    ])
  }

  function abrirAcoes(membro) {
    // O administrador não mexe no próprio registro — apagar ou desligar a
    // si mesmo deixaria a equipe sem ninguém para religar o acesso.
    const ehVoceMesmo = membro.email === chave(sessao.usuario.email)

    const fundo = el('div', {
      style: 'position:fixed;inset:0;background:rgba(15,18,40,.5);z-index:50;display:grid;align-items:end',
      onclick: (e) => { if (e.target === fundo) fundo.remove() },
    })

    const avisoAcoes = el('div')

    fundo.append(el('div', {
      style: 'background:var(--fundo);border-radius:20px 20px 0 0;padding:20px 16px calc(env(safe-area-inset-bottom) + 20px);display:grid;gap:12px',
      onclick: (e) => e.stopPropagation(),
    }, [
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, [
        el('strong', { style: 'font-size:17px', texto: membro.nome }),
        el('button', { classe: 'botao-secundario', texto: 'Fechar', onclick: () => fundo.remove() }),
      ]),
      el('p', { classe: 'campo__ajuda', texto: membro.email }),
      avisoAcoes,

      ehVoceMesmo
        ? el('div', { classe: 'aviso aviso--atencao', texto: 'Este é o seu próprio acesso. Você não pode desligar nem apagar a si mesmo — a equipe ficaria sem administrador.' })
        : el('div', { style: 'display:grid;gap:10px' }, [
            !membro.jaEntrou
              ? el('button', {
                  classe: 'botao',
                  texto: 'Reenviar e-mail de convite',
                  onclick: (e) => comCarregamento(e.target, async () => {
                    try {
                      await abrirAcessoParaConvidado(membro.email)
                      mostrarAviso(avisoAcoes, `E-mail reenviado para ${membro.email}.`, 'ok')
                    } catch (erro) {
                      mostrarAviso(avisoAcoes, mensagemDeErro(erro))
                    }
                  }),
                })
              : null,

            el('button', {
              classe: 'botao',
              style: membro.ativo ? 'background:var(--amarelo)' : 'background:var(--verde)',
              texto: membro.ativo ? 'Desligar acesso' : 'Reativar acesso',
              onclick: async () => {
                try {
                  await definirAtivo(membro.email, !membro.ativo)
                  fundo.remove()
                  carregar()
                } catch (erro) {
                  mostrarAviso(avisoAcoes, mensagemDeErro(erro))
                }
              },
            }),

            el('button', {
              classe: 'botao botao-perigo',
              texto: 'Apagar da equipe',
              onclick: async () => {
                if (!confirm(`Apagar ${membro.nome} da equipe? ${membro.email} perde o acesso imediatamente.`)) return
                try {
                  await removerMembro(membro.email)
                  fundo.remove()
                  carregar()
                } catch (erro) {
                  mostrarAviso(avisoAcoes, mensagemDeErro(erro))
                }
              },
            }),
          ]),
    ]))

    document.body.append(fundo)
  }

  // ---------- Convite ----------

  const conviteEmail = el('input', {
    type: 'email', placeholder: 'E-mail do colaborador',
    inputmode: 'email', autocapitalize: 'none', autocorrect: 'off',
  })
  const conviteNome = el('input', { type: 'text', placeholder: 'Nome (opcional)' })
  const avisoConvite = el('div')

  const cartaoConvite = el('div', { classe: 'cartao' }, [
    el('div', { classe: 'secao__titulo', texto: 'Convidar' }),
    campo('E-mail', conviteEmail),
    campo('Nome', conviteNome, 'A pessoa recebe um e-mail para criar a própria senha. Você nunca vê essa senha.'),
    avisoConvite,
    el('button', {
      classe: 'botao',
      texto: 'Liberar acesso',
      onclick: (e) => comCarregamento(e.target, async () => {
        mostrarAviso(avisoConvite, '')
        const email = conviteEmail.value.trim()

        if (!pareceEmail(email)) {
          mostrarAviso(avisoConvite, 'Digite um e-mail válido.')
          return
        }

        try {
          await convidar({
            email,
            nome: conviteNome.value.trim(),
            convidadoPor: sessao.usuario.email,
          })
        } catch (erro) {
          mostrarAviso(avisoConvite, erro.message || mensagemDeErro(erro))
          return
        }

        // A conta nasce com uma senha provisória entregue pelo
        // administrador, e não por e-mail: os e-mails do Firebase caem no
        // spam e o link de recuperação vale uma vez só — sistemas de
        // segurança de e-mail costumam abri-lo antes da pessoa, queimando
        // o uso. Pelo WhatsApp a mensagem chega e ninguém consome o
        // acesso por engano.
        const provisoria = senhaTemporaria()

        try {
          await criarContaComSenha(chave(email), provisoria)
        } catch (erro) {
          if (erro?.code === 'auth/email-already-in-use') {
            mostrarAviso(
              avisoConvite,
              `${email} já tinha conta. O acesso foi liberado — a pessoa entra com a senha que já usava.`,
              'ok'
            )
            limpar()
            return
          }
          mostrarAviso(avisoConvite, mensagemDeErro(erro))
          return
        }

        mostrarSenhaProvisoria(email, provisoria)
        limpar()
        carregar()
      }),
    }),
  ])

  function limpar() {
    conviteEmail.value = ''
    conviteNome.value = ''
    carregar()
  }

  /**
   * Mostra a senha provisória para o administrador repassar.
   *
   * É a única vez que ela aparece: no primeiro acesso a pessoa troca por
   * uma senha dela, e a partir daí ninguém mais sabe qual é.
   */
  function mostrarSenhaProvisoria(email, senha) {
    const mensagem = [
      'Seu acesso ao app da PROMAC está liberado.',
      '',
      `Link: ${location.origin}${location.pathname}`,
      `E-mail: ${email}`,
      `Senha provisória: ${senha}`,
      '',
      'No primeiro acesso o app pede para você criar sua própria senha.',
    ].join('\n')

    const fundo = el('div', {
      classe: 'painel-fundo',
      onclick: (e) => { if (e.target === fundo) fundo.remove() },
    })

    fundo.append(el('div', { classe: 'painel', onclick: (e) => e.stopPropagation() }, [
      el('div', { classe: 'painel__topo' }, [
        el('span', { classe: 'painel__titulo', texto: 'Acesso liberado' }),
        el('button', { classe: 'botao-secundario', texto: 'Fechar', onclick: () => fundo.remove() }),
      ]),

      el('div', { classe: 'aviso aviso--atencao' }, [
        el('strong', { texto: 'Anote ou copie agora. ' }),
        'Esta senha não volta a aparecer — no primeiro acesso a pessoa troca por uma dela.',
      ]),

      el('div', { classe: 'cartao', style: 'display:grid;gap:6px' }, [
        el('div', { classe: 'campo__ajuda', texto: 'E-mail' }),
        el('div', { style: 'font-weight:600', texto: email }),
        el('div', { classe: 'campo__ajuda', style: 'margin-top:8px', texto: 'Senha provisória' }),
        el('div', {
          style: 'font-size:26px;font-weight:800;letter-spacing:3px;font-family:ui-monospace,monospace;color:var(--azul-vivo)',
          texto: senha,
        }),
      ]),

      el('button', {
        classe: 'botao',
        texto: 'Enviar pelo WhatsApp',
        onclick: () => window.open(`https://wa.me/?text=${encodeURIComponent(mensagem)}`, '_blank'),
      }),

      el('button', {
        classe: 'botao botao-contorno',
        texto: 'Copiar mensagem',
        onclick: (e) => {
          navigator.clipboard.writeText(mensagem)
            .then(() => { e.target.textContent = 'Copiado!' })
            .catch(() => { e.target.textContent = 'Não consegui copiar' })
        },
      }),
    ]))

    document.body.append(fundo)
  }

  render(raiz, avisoEl, cartaoConvite, areaLista)
  carregar()
  return raiz
}
