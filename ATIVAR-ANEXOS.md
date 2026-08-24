# Ativar os anexos (canhoto e fotos da entrega)

O aplicativo já está pronto para anexar. Falta apenas criar o espaço de
arquivos no Firebase — isso só você pode fazer, porque envolve cadastrar
um cartão.

## Por que precisa de cartão

Desde 3 de fevereiro de 2026 o Firebase não guarda mais arquivos no plano
gratuito. Para criar esse espaço, o projeto precisa estar no plano
**Blaze**, que cobra pelo que se usa e exige um cartão cadastrado.

Na prática, com o volume da PROMAC a conta deve ficar em **R$ 0,00** —
o Blaze mantém uma faixa gratuita todo mês. Mas o cartão fica lá, então o
passo 4 (alerta de gasto) não é opcional.

## Passo 1 — Mudar o projeto para o Blaze

1. Abra https://console.firebase.google.com
2. Escolha o projeto **promac-transportes**
3. No canto de baixo à esquerda, clique em **Fazer upgrade** (ou
   **Upgrade**)
4. Escolha **Blaze — Pagamento por uso**
5. Cadastre o cartão quando ele pedir

## Passo 2 — Criar o espaço de arquivos

1. No menu da esquerda, clique em **Storage** (dentro de "Criação" ou
   "Build")
2. Clique em **Começar** / **Get started**
3. Quando perguntar o local, escolha **southamerica-east1 (São Paulo)** —
   o mesmo do banco de dados, para as fotos não viajarem à toa
4. Aceite o modo de produção; as regras certas vêm no passo 3

## Passo 3 — Colar as regras de segurança

Sem isto, qualquer pessoa com o endereço do projeto conseguiria baixar
todos os canhotos da empresa.

1. Ainda em **Storage**, abra a aba **Regras** (**Rules**)
2. Apague tudo que estiver lá
3. Abra o arquivo `storage.rules`, nesta mesma pasta, e cole o conteúdo
   inteiro
4. Clique em **Publicar**

## Passo 4 — Travar um alerta de gasto

O Blaze não tem teto automático. O alerta avisa antes de virar problema.

1. Abra https://console.cloud.google.com/billing
2. Escolha a conta de faturamento ligada ao projeto
3. No menu, clique em **Orçamentos e alertas** / **Budgets & alerts**
4. Clique em **Criar orçamento**
5. Coloque um valor baixo — **R$ 20** já é muito acima do esperado
6. Marque para avisar em 50%, 90% e 100%
7. Confirme que o e-mail do alerta é o seu

## Como testar depois

1. Abra o app, vá em **Contratações**
2. Clique num cartão que esteja na coluna **Entregue**
3. Role até **Canhoto e fotos da entrega**
4. Clique em **Anexar canhoto ou foto** e escolha uma imagem

Se aparecer "O espaço de arquivos ainda não foi ativado no Firebase",
algum passo acima ficou pela metade.

## O que o app faz com as fotos

- Reduz cada imagem para no máximo 1600 pixels antes de enviar. Uma foto
  de 4,7 MB do iPhone chega a menos de 600 KB, o que faz diferença no 4G
  do motorista.
- Aceita imagens e PDF, até 12 MB por arquivo.
- Guarda quem anexou e quando.
- Desiste depois de um minuto e avisa, em vez de ficar "Enviando…" para
  sempre.

## Quanto espaço isso ocupa

A faixa gratuita do Blaze para arquivos é de **5 GB guardados** e
**100 GB baixados por mês**.

A 300 KB por foto, 5 GB dão cerca de **17 mil fotos**. Com 3 anexos por
entrega e 30 entregas por dia, isso é mais de um ano dentro do gratuito.
Passando disso, cada GB a mais custa alguns centavos por mês.
