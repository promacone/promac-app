// Porta de entrada do app.
//
// São três estados, e a ordem importa: entrar com senha é uma coisa, ter
// permissão para ver os dados é outra. Quem passa pela primeira e não
// pela segunda fica na sala de espera — e as regras do Firestore repetem
// essa verificação no servidor, onde o navegador não tem como mentir.

import {
  auth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signOut,
  updateProfile, mensagemDeErro, lembrarNesteAparelho,
} from './firebase.js?v=20260824161714'
import { buscarMembro, marcarQueEntrou, carregarParametros } from './equipe.js?v=20260824161714'
import { $, el, render, mostrarAviso, comCarregamento, icone, ICONES } from './ui.js?v=20260824161714'
import { telaCotacao } from './telas/cotacao.js?v=20260824161714'
import { telaContratacoes } from './telas/contratacoes.js?v=20260824161714'
import { telaEquipe } from './telas/equipe.js?v=20260824161714'
import { telaConfiguracoes } from './telas/configuracoes.js?v=20260824161714'
import { telaConta } from './telas/conta.js?v=20260824161714'
import { telaInicio } from './telas/inicio.js?v=20260824161714'

// Guarda o app para funcionar sem sinal e evita que o celular fique com
// telas antigas depois de uma atualização.
if ('serviceWorker' in navigator) {
  // Quem já estava sendo controlado é quem tinha a versão antiga. Na
  // primeira visita o controle também muda, e aí recarregar seria só um
  // piscar sem motivo.
  const jaTinhaVersao = !!navigator.serviceWorker.controller
  let recarregando = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!jaTinhaVersao || recarregando) return
    recarregando = true
    // A versão nova assumiu: recarrega uma vez sozinho, para ninguém
    // precisar saber o que é "limpar o cache".
    location.reload()
  })

  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}

// Detecta se o app foi adicionado à tela de início do iPhone.
if (window.navigator.standalone || matchMedia('(display-mode: standalone)').matches) {
  document.body.classList.add('instalado')
}

const telas = {
  carregando: $('#tela-carregando'),
  login: $('#tela-login'),
  cadastro: $('#tela-cadastro'),
  pendente: $('#tela-pendente'),
  trocarSenha: $('#tela-trocar-senha'),
  inicio: $('#tela-inicio'),
  modulo: $('#tela-modulo'),
}

function mostrar(nome) {
  for (const [id, elemento] of Object.entries(telas)) {
    elemento.classList.toggle('oculto', id !== nome)
  }
}

// ---------- Sessão ----------

const sessao = {
  usuario: null,
  membro: null,
  parametros: null,
}

onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) {
    sessao.usuario = null
    sessao.membro = null
    mostrar('login')
    return
  }

  sessao.usuario = {
    email: (usuario.email || '').toLowerCase(),
    nome: usuario.displayName || (usuario.email || '').split('@')[0],
  }

  await conferirAutorizacao()
})

async function conferirAutorizacao() {
  mostrar('carregando')

  // Falha de rede aqui não libera o app: sem confirmação, a pessoa fica
  // na tela de espera. Na dúvida, não dá acesso.
  try {
    sessao.membro = await buscarMembro(sessao.usuario.email)
  } catch {
    sessao.membro = null
  }

  if (!sessao.membro || !sessao.membro.ativo) {
    $('#pendente-email').textContent = sessao.usuario.email
    mostrar('pendente')
    return
  }

  // Entrou com a senha que o administrador entregou: precisa trocar antes
  // de qualquer coisa, senão duas pessoas sabem a mesma senha.
  if (sessao.membro.senhaTemporaria) {
    mostrar('trocarSenha')
    return
  }

  // Registra que o convite virou acesso de verdade.
  if (!sessao.membro.jaEntrou) {
    marcarQueEntrou(sessao.usuario.email, sessao.usuario.nome).catch(() => {})
  }

  sessao.parametros = await carregarParametros()
  abrirApp()
}

// ---------- Login ----------

$('#form-login').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const avisoEl = $('#login-aviso')
  mostrarAviso(avisoEl, '')

  const email = $('#login-email').value.trim()
  const senha = $('#login-senha').value

  await comCarregamento($('#login-entrar'), async () => {
    try {
      // Precisa vir antes do login: define se a sessão fica guardada.
      await lembrarNesteAparelho($('#login-lembrar').checked)
      await signInWithEmailAndPassword(auth, email, senha)
      // onAuthStateChanged cuida do resto.
    } catch (erro) {
      mostrarAviso(avisoEl, mensagemDeErro(erro))
    }
  })
})

$('#login-esqueci').addEventListener('click', async () => {
  const avisoEl = $('#login-aviso')
  const email = $('#login-email').value.trim()

  if (!email) {
    mostrarAviso(avisoEl, 'Digite seu e-mail para receber o link de recuperação.')
    return
  }

  // A resposta é a mesma exista a conta ou não: mensagens diferentes
  // entregariam quais e-mails são válidos na empresa.
  try {
    await sendPasswordResetEmail(auth, email)
  } catch { /* mesmo silêncio de propósito */ }
  mostrarAviso(
    avisoEl,
    'Se houver uma conta com esse e-mail, o link para criar uma senha nova chegou na caixa de entrada.',
    'ok'
  )
})

$('#login-criar').addEventListener('click', () => mostrar('cadastro'))
$('#cadastro-voltar').addEventListener('click', () => mostrar('login'))

// ---------- Cadastro ----------

$('#form-cadastro').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const avisoEl = $('#cadastro-aviso')
  mostrarAviso(avisoEl, '')

  const nome = $('#cadastro-nome').value.trim()
  const email = $('#cadastro-email').value.trim()
  const senha = $('#cadastro-senha').value
  const senha2 = $('#cadastro-senha2').value

  if (senha.length < 6) {
    mostrarAviso(avisoEl, 'A senha precisa ter pelo menos 6 caracteres.')
    return
  }
  if (senha !== senha2) {
    mostrarAviso(avisoEl, 'As senhas não são iguais.')
    return
  }

  const botao = evento.target.querySelector('button[type="submit"]')
  await comCarregamento(botao, async () => {
    try {
      const credencial = await createUserWithEmailAndPassword(auth, email, senha)
      if (nome) {
        await updateProfile(credencial.user, { displayName: nome }).catch(() => {})
      }
      // Cadastrar não dá acesso: quem decide é a lista de equipe, no
      // servidor. Sem convite, a pessoa cai na tela de espera.
    } catch (erro) {
      mostrarAviso(avisoEl, mensagemDeErro(erro))
    }
  })
})

// ---------- Acesso pendente ----------

$('#pendente-conferir').addEventListener('click', (e) =>
  comCarregamento(e.target, conferirAutorizacao))
$('#pendente-sair').addEventListener('click', () => signOut(auth))

// ---------- Troca da senha provisória ----------

$('#form-trocar-senha').addEventListener('submit', async (evento) => {
  evento.preventDefault()
  const avisoEl = $('#trocar-aviso')
  mostrarAviso(avisoEl, '')

  const senha = $('#nova-senha').value
  const repetida = $('#nova-senha2').value

  if (senha.length < 6) {
    mostrarAviso(avisoEl, 'A senha precisa ter pelo menos 6 caracteres.')
    return
  }
  if (senha !== repetida) {
    mostrarAviso(avisoEl, 'As senhas não são iguais.')
    return
  }

  const botao = evento.target.querySelector('button[type="submit"]')
  await comCarregamento(botao, async () => {
    try {
      await trocarSenha(senha)
      await marcarSenhaDefinida(sessao.usuario.email)
      sessao.membro.senhaTemporaria = false
      await conferirAutorizacao()
    } catch (erro) {
      mostrarAviso(avisoEl, mensagemDeErro(erro))
    }
  })
})

$('#trocar-sair').addEventListener('click', () => signOut(auth))

// ---------- Módulos ----------

/**
 * Cada módulo tem cor própria: no quadro e na tela inicial, é a cor que o
 * operador reconhece antes de ler o nome.
 */
function modulosDisponiveis() {
  const ehAdministrador = sessao.membro.papel === 'master'

  return [
    {
      id: 'cotacao',
      titulo: 'Cotação',
      descricao: 'Piso ANTT, rota, pedágio e tabelas de preço',
      icone: ICONES.cotacao,
      cor: '#22a6e8',
      tela: () => telaCotacao(sessao),
    },
    {
      id: 'contratacoes',
      titulo: 'Contratações',
      descricao: 'Quadro das cargas, da coleta à entrega',
      icone: ICONES.contratacoes,
      cor: '#f2b317',
      largo: true,
      tela: () => telaContratacoes(sessao),
    },
    // Equipe só existe para quem administra — os colaboradores nem veem
    // que ela existe. Quem garante de verdade são as regras do servidor;
    // aqui é só a interface acompanhando.
    ...(ehAdministrador ? [{
      id: 'equipe',
      titulo: 'Equipe',
      descricao: 'Convidar, liberar e remover quem usa o app',
      icone: ICONES.equipe,
      cor: '#2bb673',
      tela: () => telaEquipe(sessao),
    }] : []),
    {
      id: 'configuracoes',
      titulo: 'Ajustes',
      descricao: 'Margens por tabela, imposto e GRIS',
      icone: ICONES.configuracoes,
      cor: '#8b7fe8',
      tela: () => telaConfiguracoes(sessao),
    },
    {
      id: 'conta',
      titulo: 'Conta',
      descricao: 'Seus dados, sair e apagar a conta',
      icone: ICONES.conta,
      cor: '#8b93a7',
      tela: () => telaConta(sessao),
    },
  ]
}

function abrirApp() {
  mostrarInicio()
}

function mostrarInicio() {
  const modulos = modulosDisponiveis()

  render(telas.inicio, telaInicio({
    sessao,
    modulos,
    aoEscolher: abrirModulo,
    aoSair: () => signOut(auth),
    aoAbrirConta: () => abrirModulo('conta'),
  }))

  mostrar('inicio')
}

function abrirModulo(id) {
  const modulo = modulosDisponiveis().find((m) => m.id === id)
  if (!modulo) return

  $('#modulo-titulo').textContent = modulo.titulo

  // O quadro precisa da tela inteira; os outros módulos ficam na largura
  // de leitura, que é mais confortável para formulário.
  $('#modulo-conteudo').classList.toggle('conteudo--largo', modulo.largo === true)

  render($('#modulo-conteudo'), modulo.tela())
  mostrar('modulo')
  window.scrollTo(0, 0)
}

$('#modulo-voltar').addEventListener('click', mostrarInicio)
