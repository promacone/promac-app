// Quem pode usar o app, e com que percentuais a empresa trabalha.
//
// A lista de equipe mora no Firestore, na mesma coleção que o aplicativo
// iOS usa — as duas versões enxergam as mesmas pessoas e os mesmos dados.

import {
  bd, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs,
  serverTimestamp,
} from './firebase.js'
import { PARAMETROS_PADRAO } from './frete.js'

/** Normaliza o e-mail: "Joao@" e "joao@" são a mesma pessoa. */
export function chave(email) {
  return String(email || '').trim().toLowerCase()
}

/** Checagem simples de formato, só para não gravar lixo na lista. */
export function pareceEmail(texto) {
  const limpo = chave(texto)
  const [usuario, dominio, ...sobra] = limpo.split('@')
  return Boolean(
    usuario && dominio && sobra.length === 0 &&
    dominio.includes('.') && !dominio.startsWith('.') && !dominio.endsWith('.') &&
    !limpo.includes(' ')
  )
}

function converter(id, dados = {}) {
  return {
    email: id,
    nome: dados.nome || id.split('@')[0],
    papel: dados.papel === 'master' ? 'master' : 'colaborador',
    // Sem o campo, tratamos como inativo: na dúvida, não dá acesso.
    ativo: dados.ativo === true,
    convidadoPor: dados.convidadoPor || null,
    jaEntrou: dados.jaEntrou === true,
  }
}

export async function buscarMembro(email) {
  const registro = await getDoc(doc(bd, 'equipe', chave(email)))
  return registro.exists() ? converter(registro.id, registro.data()) : null
}

export async function listarEquipe() {
  const resultado = await getDocs(collection(bd, 'equipe'))
  return resultado.docs
    .map((d) => converter(d.id, d.data()))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function convidar({ email, nome, convidadoPor }) {
  const id = chave(email)

  if (await buscarMembro(id)) {
    throw new Error('Esse e-mail já faz parte da equipe.')
  }

  await setDoc(doc(bd, 'equipe', id), {
    nome: nome || id.split('@')[0],
    papel: 'colaborador',
    ativo: true,
    convidadoPor: convidadoPor || '',
    convidadoEm: serverTimestamp(),
    // Vira verdadeiro no primeiro acesso da pessoa.
    jaEntrou: false,
  })
}

export async function definirAtivo(email, ativo) {
  await updateDoc(doc(bd, 'equipe', chave(email)), { ativo })
}

export async function removerMembro(email) {
  await deleteDoc(doc(bd, 'equipe', chave(email)))
}

export async function marcarQueEntrou(email, nome) {
  const campos = { jaEntrou: true }
  // Só preenche o nome se o convite tiver ficado sem um.
  if (nome) campos.nome = nome
  await setDoc(doc(bd, 'equipe', chave(email)), campos, { merge: true })
}

/**
 * Percentuais comerciais da transportadora.
 *
 * Ficam no Firestore, não no código, por dois motivos: num site o código
 * inteiro é visível para quem abre a página, e margem de lucro é
 * informação que um concorrente adoraria ter. Aqui só quem está na equipe
 * consegue ler — e o administrador pode ajustar sem depender de mim.
 */
export async function carregarParametros() {
  try {
    const registro = await getDoc(doc(bd, 'configuracao', 'comercial'))
    if (!registro.exists()) return { ...PARAMETROS_PADRAO, tabelas: TABELAS_PADRAO }

    const dados = registro.data()
    return {
      imposto: numeroValido(dados.imposto, PARAMETROS_PADRAO.imposto),
      gris: numeroValido(dados.gris, PARAMETROS_PADRAO.gris),
      tabelas: {
        a: numeroValido(dados.margemA, TABELAS_PADRAO.a),
        b: numeroValido(dados.margemB, TABELAS_PADRAO.b),
        c: numeroValido(dados.margemC, TABELAS_PADRAO.c),
      },
    }
  } catch {
    // Sem conseguir ler, o app segue com os percentuais padrão em vez de
    // travar — o vendedor na estrada precisa cotar de qualquer jeito.
    return { ...PARAMETROS_PADRAO, tabelas: TABELAS_PADRAO }
  }
}

export async function salvarParametros({ imposto, gris, tabelas }) {
  await setDoc(doc(bd, 'configuracao', 'comercial'), {
    imposto,
    gris,
    margemA: tabelas.a,
    margemB: tabelas.b,
    margemC: tabelas.c,
  })
}

export const TABELAS_PADRAO = { a: 0.20, b: 0.16, c: 0.12 }

function numeroValido(valor, padrao) {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0
    ? valor
    : padrao
}
