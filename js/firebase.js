// Conexão com o Firebase.
//
// Esta configuração é pública por natureza — ela viaja para o navegador de
// quem abre o site e não tem como ser escondida. Quem protege os dados são
// as regras do Firestore, que rodam no servidor: sem estar na coleção
// `equipe`, ninguém lê nem escreve nada.
//
// O token da Qualp, esse sim secreto, nunca entra aqui: ele fica num
// intermediário do lado do servidor.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js'
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js'

const configuracao = {
  apiKey: 'AIzaSyDrxPEU0VW2Zq3Mo8OYNgfkkr0v-qyELFw',
  authDomain: 'promac-transportes.firebaseapp.com',
  projectId: 'promac-transportes',
  storageBucket: 'promac-transportes.firebasestorage.app',
  messagingSenderId: '777653384143',
  appId: '1:777653384143:web:5dcb955a7ac78fbeed18ba',
}

const app = initializeApp(configuracao)

export const auth = getAuth(app)
export const bd = getFirestore(app)

/**
 * Decide se a sessão sobrevive ao fechar o app.
 *
 * No celular da própria pessoa, pedir senha toda vez atrapalha o uso em
 * campo. Já num computador compartilhado do escritório, manter conectado
 * deixaria a operação aberta para o próximo que sentar — por isso a
 * escolha fica com quem entra, e não fixa no código.
 *
 * A autorização continua sendo conferida no servidor a cada leitura:
 * lembrar do login não dá acesso a quem foi removido da equipe.
 */
export function lembrarNesteAparelho(lembrar) {
  return setPersistence(
    auth,
    lembrar ? browserLocalPersistence : browserSessionPersistence
  ).catch(() => {})
}

/**
 * Cria a conta de quem foi convidado e manda o e-mail para essa pessoa
 * escolher a própria senha.
 *
 * A senha provisória é sorteada e descartada em seguida: ninguém a
 * digita, ninguém a recebe, e ela deixa de valer assim que a pessoa
 * define a dela pelo link do e-mail.
 *
 * A conta é criada por uma segunda conexão com o Firebase. Pela conexão
 * principal, criar usuário trocaria a sessão — o administrador seria
 * desconectado e entraria como o próprio convidado.
 */
export async function criarContaComSenha(email, senha) {
  const paralelo = getApps().find((a) => a.name === 'convites')
    || initializeApp(configuracao, 'convites')
  const authParalelo = getAuth(paralelo)

  try {
    await createUserWithEmailAndPassword(authParalelo, email, senha)
  } finally {
    // A sessão paralela não pode sobreviver: ela está logada como a
    // pessoa convidada, e o administrador continua na dele.
    await signOut(authParalelo).catch(() => {})
  }
}

/** Troca a senha de quem está logado. */
export async function trocarSenha(novaSenha) {
  if (!auth.currentUser) throw new Error('Ninguém conectado.')
  await updatePassword(auth.currentUser, novaSenha)
}

/**
 * Sorteia uma senha temporária legível.
 *
 * Vai ser digitada à mão por alguém no celular, então evita caracteres
 * que se confundem: 0 e O, 1 e l, 5 e S.
 */
export function senhaTemporaria() {
  const alfabeto = 'ABCDEFGHJKMNPQRTUVWXYZ346789'
  const sorteio = crypto.getRandomValues(new Uint32Array(8))
  return Array.from(sorteio, (n) => alfabeto[n % alfabeto.length]).join('')
}

export async function abrirAcessoParaConvidado(email) {
  const paralelo = getApps().find((a) => a.name === 'convites')
    || initializeApp(configuracao, 'convites')
  const authParalelo = getAuth(paralelo)

  try {
    await createUserWithEmailAndPassword(authParalelo, email, senhaProvisoria())
  } catch (erro) {
    // Conta que já existe não é problema: a pessoa pode ter sido
    // convidada antes. O e-mail de senha vai do mesmo jeito.
    if (erro?.code !== 'auth/email-already-in-use') throw erro
  }

  await signOut(authParalelo).catch(() => {})
  await sendPasswordResetEmail(auth, email)
}

/** Senha descartável, só para o Firebase aceitar criar a conta. */
function senhaProvisoria() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%'
  const sorteio = crypto.getRandomValues(new Uint32Array(32))
  return Array.from(sorteio, (n) => alfabeto[n % alfabeto.length]).join('')
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword,
  deleteUser,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
}

/**
 * Traduz os erros do Firebase para algo que o vendedor entenda.
 *
 * De propósito, senha errada e usuário inexistente devolvem a mesma
 * mensagem: distinguir os dois contaria a quem tenta invadir quais
 * e-mails são válidos na empresa.
 */
export function mensagemDeErro(erro) {
  const codigo = erro?.code || ''

  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'E-mail ou senha incorretos.'
    case 'auth/user-disabled':
      return 'Esta conta foi desativada. Fale com o administrador do app.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
    case 'auth/network-request-failed':
      return 'Sem conexão com a internet.'
    case 'auth/email-already-in-use':
      return 'Já existe uma conta com esse e-mail. Use "Esqueci minha senha" se não lembrar dela.'
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.'
    case 'auth/requires-recent-login':
      return 'Por segurança, saia e entre de novo antes de apagar a conta.'
    case 'permission-denied':
      return 'Você não tem permissão para isso.'
    default:
      return 'Algo deu errado. Tente de novo.'
  }
}
