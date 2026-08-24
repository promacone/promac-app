// Controla o cache do app instalado.
//
// Sem isto, o Safari guarda as telas antigas e a equipe continuaria vendo
// a versão da semana passada sem entender por quê — e não há como pedir
// para cada um limpar o cache do celular.
//
// A estratégia é "rede primeiro": sempre busca a versão nova; se estiver
// sem sinal, entrega a última que funcionou. Assim o vendedor no meio da
// estrada ainda abre o app e cota um frete, mesmo sem 4G.

const CACHE = 'promac-20260824091453'

// O que vale a pena guardar para funcionar offline.
const ESSENCIAIS = [
  './',
  './index.html',
  './css/estilo.css',
  './manifest.webmanifest',
  './icones/logo.png',
  './icones/icone-192.png',
  './icones/apple-touch-icon.png',
]

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ESSENCIAIS))
      // Assume o controle sem esperar a aba antiga fechar: uma correção
      // urgente precisa chegar na próxima abertura, não daqui a dias.
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(
        nomes.filter((nome) => nome !== CACHE).map((nome) => caches.delete(nome))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request

  if (pedido.method !== 'GET') return

  const endereco = new URL(pedido.url)

  // Firebase e Qualp precisam da resposta viva; guardar em cache daria
  // dado velho de login e de frete.
  if (endereco.origin !== self.location.origin) return

  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        // Guarda uma cópia para quando faltar sinal.
        if (resposta.ok) {
          const copia = resposta.clone()
          caches.open(CACHE).then((cache) => cache.put(pedido, copia)).catch(() => {})
        }
        return resposta
      })
      .catch(() => caches.match(pedido).then((guardada) => guardada || caches.match('./index.html')))
  )
})
