// Quem está logado, sair e apagar a própria conta.

import {
  auth, signOut, deleteUser, reauthenticateWithCredential, EmailAuthProvider,
  mensagemDeErro,
} from '../firebase.js?v=20260824163612'
import { removerMembro } from '../equipe.js?v=20260824163612'
import { el, campo, mostrarAviso, comCarregamento } from '../ui.js?v=20260824163612'

export function telaConta(sessao) {
  const senhaEl = el('input', {
    type: 'password',
    placeholder: 'Sua senha',
    autocomplete: 'current-password',
  })
  const avisoEl = el('div')

  return el('div', { style: 'display:grid;gap:14px' }, [
    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Conectado como' }),
      el('div', { style: 'font-weight:600', texto: sessao.usuario.nome }),
      el('div', { classe: 'campo__ajuda', texto: sessao.usuario.email }),
      el('div', {
        classe: 'campo__ajuda',
        texto: sessao.membro.papel === 'master' ? 'Administrador' : 'Colaborador',
      }),
    ]),

    el('div', { classe: 'cartao' }, [
      el('button', {
        classe: 'botao',
        style: 'background:transparent;color:var(--azul-vivo);border:1.5px solid var(--azul-vivo)',
        texto: 'Sair',
        onclick: () => signOut(auth),
      }),
      el('p', { classe: 'campo__ajuda', style: 'margin-top:8px', texto: 'Sair encerra a sessão neste aparelho. Sua conta continua existindo.' }),
    ]),

    el('div', { classe: 'cartao' }, [
      el('div', { classe: 'secao__titulo', texto: 'Apagar minha conta' }),
      el('p', { classe: 'campo__ajuda', style: 'margin-bottom:10px' }, [
        'Isto não tem volta: seu acesso e seu login são removidos na hora. ',
        'Os fretes cadastrados continuam no sistema, porque pertencem à operação da transportadora.',
      ]),
      campo('Confirme sua senha', senhaEl, 'Pedimos a senha para garantir que é você — e não alguém que pegou seu celular destravado.'),
      avisoEl,
      el('button', {
        classe: 'botao botao-perigo',
        texto: 'Apagar minha conta',
        onclick: (e) => comCarregamento(e.target, async () => {
          mostrarAviso(avisoEl, '')
          const senha = senhaEl.value

          if (!senha) {
            mostrarAviso(avisoEl, 'Digite sua senha para confirmar.')
            return
          }
          if (!confirm('Apagar sua conta definitivamente? Esta ação não pode ser desfeita.')) {
            return
          }

          const usuario = auth.currentUser
          if (!usuario) return

          try {
            // Confirma a senha antes de tocar em qualquer dado. Apagar o
            // registro primeiro deixaria quem errasse a senha sem acesso
            // e ainda com a conta de pé — trancado do lado de fora.
            const credencial = EmailAuthProvider.credential(usuario.email, senha)
            await reauthenticateWithCredential(usuario, credencial)

            // O registro sai enquanto a pessoa ainda está autenticada;
            // depois que a conta some, as regras do servidor não deixam
            // apagar mais nada.
            await removerMembro(usuario.email).catch(() => {})
            await deleteUser(usuario)
            // onAuthStateChanged leva de volta para o login.
          } catch (erro) {
            mostrarAviso(avisoEl, mensagemDeErro(erro))
          }
        }),
      }),
    ]),
  ])
}
