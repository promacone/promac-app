// Anexos das cargas: canhoto assinado e fotos da entrega.
//
// O canhoto é o documento que prova que a carga chegou. Hoje ele vive em
// conversas de WhatsApp, e na hora que o cliente contesta uma entrega
// alguém precisa rolar meses de mensagens para achar. Aqui ele fica
// preso à carga, com data e nome de quem anexou.
//
// As fotos passam por uma redução antes de subir. Um iPhone entrega uma
// foto de 4 MB; a mesma foto com 1600 px de lado maior fica em torno de
// 250 KB e continua legível para ler uma assinatura. A diferença aparece
// no 4G do motorista, que é onde o envio costuma falhar.

const LARGURA_MAXIMA = 1600
const QUALIDADE = 0.72
const TAMANHO_MAXIMO = 12 * 1024 * 1024 // 12 MB antes de reduzir

// Quanto esperar antes de desistir de um envio.
//
// O padrão do Firebase é tentar de novo por dez minutos. Numa entrega
// isso é tempo demais: o motorista fica olhando "Enviando…" sem saber se
// deu certo, e acaba mandando a foto pelo WhatsApp de qualquer jeito.
// Um minuto basta para uma foto reduzida, mesmo em 4G ruim.
const ESPERA_MAXIMA = 60_000

let modulo = null

/**
 * Carrega o Storage só quando alguém vai de fato anexar.
 *
 * São mais de 100 KB de biblioteca; quem só abre a cotação nunca precisa
 * baixar isso.
 */
async function storage() {
  if (modulo) return modulo

  const [{ getStorage, ref, uploadBytes, getDownloadURL, deleteObject }, { app }] =
    await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js'),
      import('./firebase.js?v=20260831105449'),
    ])

  const bd = getStorage(app)
  bd.maxUploadRetryTime = ESPERA_MAXIMA
  bd.maxOperationRetryTime = ESPERA_MAXIMA

  modulo = { bd, ref, uploadBytes, getDownloadURL, deleteObject }
  return modulo
}

let bucketExiste = null

/**
 * O espaço de arquivos já foi criado no Firebase?
 *
 * Vale a pergunta porque a falha de envio não distingue "espaço não
 * existe" de "sem sinal": os dois chegam como retry-limit-exceeded,
 * depois de um minuto tentando. Perguntando antes, a tela avisa na hora
 * e com a causa certa.
 *
 * A consulta é sem login de propósito: o que interessa é a diferença
 * entre 404 (não existe) e 401/403 (existe e está protegido, que é o
 * esperado).
 */
export async function storageDisponivel() {
  if (bucketExiste !== null) return bucketExiste

  try {
    const { app } = await import('./firebase.js?v=20260831105449')
    const balde = app.options.storageBucket
    if (!balde) { bucketExiste = false; return bucketExiste }

    const resposta = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${balde}/o?maxResults=1`)
    bucketExiste = resposta.status !== 404
  } catch {
    // Sem rede para checar. Não é motivo para impedir a tentativa.
    bucketExiste = true
  }

  return bucketExiste
}

/** É imagem? PDF e outros documentos sobem como estão. */
function ehImagem(arquivo) {
  return arquivo.type.startsWith('image/')
}

/**
 * Reduz a imagem mantendo a proporção.
 *
 * Se qualquer passo falhar — formato exótico, HEIC que o navegador não
 * abre — devolve o arquivo original. Anexar grande é melhor que não
 * anexar.
 */
export async function reduzir(arquivo) {
  if (!ehImagem(arquivo)) return arquivo

  try {
    const imagem = await criarImagem(arquivo)
    const maior = Math.max(imagem.width, imagem.height)

    // Já é pequena: mexer só pioraria a qualidade.
    if (maior <= LARGURA_MAXIMA && arquivo.size < 600 * 1024) return arquivo

    const escala = Math.min(1, LARGURA_MAXIMA / maior)
    const tela = document.createElement('canvas')
    tela.width = Math.round(imagem.width * escala)
    tela.height = Math.round(imagem.height * escala)

    const pincel = tela.getContext('2d')
    pincel.drawImage(imagem, 0, 0, tela.width, tela.height)

    const menor = await new Promise((resolver) =>
      tela.toBlob(resolver, 'image/jpeg', QUALIDADE))

    if (!menor || menor.size >= arquivo.size) return arquivo

    return new File([menor], trocarExtensao(arquivo.name, 'jpg'), { type: 'image/jpeg' })
  } catch {
    return arquivo
  }
}

function criarImagem(arquivo) {
  return new Promise((resolver, rejeitar) => {
    const endereco = URL.createObjectURL(arquivo)
    const imagem = new Image()
    imagem.onload = () => { URL.revokeObjectURL(endereco); resolver(imagem) }
    imagem.onerror = () => { URL.revokeObjectURL(endereco); rejeitar(new Error('imagem ilegível')) }
    imagem.src = endereco
  })
}

function trocarExtensao(nome, nova) {
  return `${String(nome || 'foto').replace(/\.[^.]+$/, '')}.${nova}`
}

/** Tira acentos e espaços: o caminho no Storage não gosta deles. */
function nomeSeguro(nome) {
  return String(nome || 'arquivo')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(-60)
}

/**
 * Envia um arquivo e devolve a ficha dele.
 *
 * @param freteId a carga a que o anexo pertence
 * @param arquivo o File escolhido
 * @param autor   quem está anexando
 */
export async function enviarAnexo(freteId, arquivo, autor) {
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error('ARQUIVO_GRANDE')
  }

  const pronto = await reduzir(arquivo)
  const id = crypto.randomUUID()
  const caminho = `viagens/${freteId}/${id}-${nomeSeguro(pronto.name)}`

  const s = await storage()

  try {
    const destino = s.ref(s.bd, caminho)

    // Trava de segurança por cima do limite do próprio Firebase: se ele
    // travar sem devolver erro nem sucesso, a tela ainda se recupera.
    await comLimite(s.uploadBytes(destino, pronto, { contentType: pronto.type }))
    const url = await comLimite(s.getDownloadURL(destino))

    return {
      id,
      nome: arquivo.name,
      tipo: pronto.type,
      tamanho: pronto.size,
      caminho,
      url,
      autor,
      em: Date.now(),
    }
  } catch (erro) {
    // O Storage só existe depois de alguém criá-lo no console do
    // Firebase. Sem esta tradução, a equipe veria "storage/unknown".
    if (erro?.message === 'DEMOROU') throw erro

    const codigo = erro?.code || ''
    if (codigo.includes('unauthorized') || codigo.includes('unauthenticated')) {
      throw new Error('SEM_PERMISSAO')
    }
    if (codigo.includes('unknown') || codigo.includes('project-not-found') || codigo.includes('bucket')) {
      throw new Error('STORAGE_DESLIGADO')
    }
    if (codigo.includes('retry-limit')) {
      // Pode ser sinal ruim ou espaço inexistente. A checagem prévia
      // resolve o segundo caso; aqui sobra o primeiro.
      throw new Error('DEMOROU')
    }
    throw erro
  }
}

/** Desiste depois de ESPERA_MAXIMA, para a tela nunca ficar presa. */
function comLimite(promessa) {
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) =>
      setTimeout(() => rejeitar(new Error('DEMOROU')), ESPERA_MAXIMA + 2000)),
  ])
}

/** Apaga o arquivo. Falha em silêncio: o registro sai da lista de todo jeito. */
export async function apagarAnexo(caminho) {
  if (!caminho) return
  try {
    const s = await storage()
    await s.deleteObject(s.ref(s.bd, caminho))
  } catch {
    // Arquivo já removido, ou sem permissão. Não trava a limpeza da ficha.
  }
}

/** Explica a falha em português. */
export function erroDeAnexo(erro) {
  const mensagens = {
    ARQUIVO_GRANDE: 'Arquivo muito grande. O limite é 12 MB.',
    SEM_PERMISSAO: 'Você não tem permissão para anexar. Fale com o administrador.',
    STORAGE_DESLIGADO: 'O espaço de arquivos ainda não foi ativado no Firebase. Peça para ativar o Storage.',
    DEMOROU: 'O envio demorou demais e foi cancelado. Tente de novo num sinal melhor.',
  }
  return mensagens[erro?.message] || 'Não consegui enviar o arquivo. Confira a internet e tente de novo.'
}

/** Tamanho em algo que se lê. */
export function tamanhoLegivel(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
