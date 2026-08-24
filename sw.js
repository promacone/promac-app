// Controla o cache do app instalado.
//
// Sem isto, o Safari guarda as telas antigas e a equipe continuaria vendo
// a versão da semana passada sem entender por quê — e não há como pedir
// para cada um limpar o cache do celular.
//
// A estratégia é "rede primeiro": sempre busca a versão nova; se estiver
// sem sinal, entrega a última que funcionou. Assim o vendedor no meio da
// estrada ainda abre o app e cota um frete, mesmo sem 4G.

const CACHE = 'promac-20260824161714'

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

/**
 * Busca na rede de verdade quando o endereço não tem carimbo de versão.
 *
 * O GitHub Pages manda o navegador guardar o index.html por 10 minutos
 * (`cache-control: max-age=600`). Nesse intervalo o navegador nem pergunta
 * ao servidor: entrega a cópia velha — inclusive para este service worker.
 * E como é justamente o index.html que carrega os carimbos de versão de
 * todo o resto, uma publicação parecia "não ter subido" mesmo já estando
 * no ar.
 *
 * Arquivos carimbados (`?v=...`) não têm esse risco: um endereço novo
 * nunca está no cache. Esses continuam sendo buscados normalmente, que é
 * mais rápido.
 */
function buscarNaRede(pedido, endereco) {
  if (endereco.searchParams.has('v')) return fetch(pedido)

  return fetch(pedido.url, { cache: 'reload', credentials: 'same-origin' })
    // Se o navegador recusar a opção, ainda é melhor buscar do jeito
    // antigo do que deixar a tela em branco.
    .catch(() => fetch(pedido))
}

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request

  if (pedido.method !== 'GET') return

  const endereco = new URL(pedido.url)

  // Firebase e Qualp precisam da resposta viva; guardar em cache daria
  // dado velho de login e de frete.
  if (endereco.origin !== self.location.origin) return

  evento.respondWith(
    buscarNaRede(pedido, endereco)
      .then((resposta) => {
        // Guarda uma cópia para quando faltar sinal.
        if (resposta.ok) {
          const copia = resposta.clone()
          caches.open(CACHE).then((cache) => cache.put(pedido, copia)).catch(() => {})
        }
        return resposta
      })
      .catch(async () => {
        const guardada = await caches.match(pedido)
        if (guardada) return guardada

        // Só a navegação cai de volta na página inicial. Fazer isso com
        // um arquivo de estilo ou de código entregaria HTML no lugar
        // deles, e a tela apareceria crua — sem cor, sem layout, com
        // todas as telas empilhadas.
        if (pedido.mode === 'navigate') {
          const inicial = await caches.match('./index.html')
          if (inicial) return inicial
        }

        return Response.error()
      })
  )
})
