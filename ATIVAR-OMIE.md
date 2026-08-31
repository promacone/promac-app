# Ligar o app ao OMIE (contas a pagar e a receber)

O módulo Contabilidade já sabe consultar o OMIE. Falta você fazer duas
coisas que só o dono da conta pode: pegar as chaves no OMIE e guardá-las
no intermediário da Cloudflare — o mesmo esquema do token da Qualp.

**Regra de ouro: nunca cole as chaves no chat, nem em site nenhum além
do OMIE e da Cloudflare.** Elas dão acesso ao financeiro inteiro.

## Passo 1 — Pegar as chaves no OMIE

1. Entre no OMIE (app.omie.com.br)
2. Vá em **Configurações** (engrenagem) → procure **API** ou
   **Aplicativos / Chaves de acesso**
   - Se não achar, entre em **developer.omie.com.br** com a mesma conta:
     as chaves da sua empresa aparecem lá
3. Anote os dois códigos: **App Key** e **App Secret**

## Passo 2 — Guardar no intermediário

1. Entre em **dash.cloudflare.com** (a conta que criamos para o pedágio)
2. **Workers & Pages** → clique no worker **orange-leaf-09cd**
3. Aba **Settings** → **Variables and Secrets** → **Add**:
   - Nome `OMIE_APP_KEY` · tipo **Secret** · cole a App Key → Save
   - Nome `OMIE_APP_SECRET` · tipo **Secret** · cole a App Secret → Save

## Passo 3 — Atualizar o código do intermediário

1. Ainda no worker, clique em **Edit code**
2. Apague tudo e cole o conteúdo do arquivo `servidor/worker.js`
   (te mandei uma cópia na conversa)
3. **Deploy**

Este passo não mexe na Qualp: o código novo contém o antigo inteiro —
a cotação continua funcionando igual.

## Passo 4 — Testar

1. Abra o app → **Contabilidade**
2. Deve aparecer "Consultando o OMIE…" e, em seguida, suas contas a
   receber e a pagar, separadas em **Atrasadas / Vencem hoje / Próximas**

Se aparecer "As chaves do OMIE ainda não foram guardadas", o passo 2
ficou pela metade. Se aparecer "recusou seu login", me chame.

## O que o intermediário protege

- As chaves nunca chegam ao navegador de ninguém
- Só aceita pedidos vindos do site da PROMAC
- E mesmo assim, só de quem estiver **logado como administrador** — o
  comprovante de login é conferido com o Google a cada pedido
- Só duas consultas são permitidas: listar contas e listar nomes de
  clientes. Nada de criar, alterar ou apagar
