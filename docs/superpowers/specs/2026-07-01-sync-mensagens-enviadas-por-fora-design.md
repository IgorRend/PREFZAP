# Design — Sincronização de mensagens enviadas por fora (tempo real)

**Data:** 2026-07-01
**Status:** Aprovado (aguardando revisão do spec)
**Autor:** Igor + Claude

## Problema

Quando o atendente/dono responde uma conversa **fora do SaaS** — pelo
celular vinculado ou por outra conexão como o WhatsApp Web oficial — essa
mensagem não aparece no SaaS. A conversa fica dessincronizada: o histórico
do sistema não reflete o que realmente foi enviado ao cliente.

## Causa raiz

O SaaS usa a lib `zapo-js`, uma implementação do protocolo **multi-device**
do WhatsApp. Nesse protocolo, toda mensagem enviada por qualquer dispositivo
vinculado é entregue em tempo real a *todos* os demais dispositivos vinculados
— inclusive a sessão do SaaS — como um evento `message` com `key.fromMe = true`.

Ou seja, **as mensagens já chegam ao SaaS**. O handler simplesmente as descarta:

```js
// backend/src/lib/zapo.ts:238  (dentro de client.on('message'))
if (event.key.fromMe) return;
```

Não é limite do WhatsApp nem da lib — é decisão de código. Portanto a
sincronização é **viável e de baixo esforço**.

## Escopo

**Coberto:** sincronização em **tempo real** — mensagens enviadas por fora
enquanto a sessão do SaaS está conectada.

**Fora de escopo (decisão explícita):**
- Backfill de mensagens enviadas com o SaaS **offline/desconectado**.
- Backfill de conversas antigas anteriores à conexão do SaaS.

Esses casos dependem de history-sync da `zapo-js`, são bem mais complexos e
menos garantidos. Ficam para uma iteração futura, se necessário.

## Decisões de comportamento

| Situação | Comportamento |
|---|---|
| Mensagem por fora chega e ticket está em **BOT** | Move para **OPEN** (assume do bot; evita bot + humano respondendo juntos) |
| Só existe ticket **CLOSED** para o contato | **Reabre** (CLOSED → OPEN) |
| Existe ticket ativo (QUEUE/OPEN) | Apenas anexa a mensagem |
| **Nenhum** ticket (conversa nova iniciada por fora) | Cria **contato + ticket em OPEN** |
| Sempre | Toca `updatedAt` do ticket (reordena a lista de conversas) |

Autoria: a mensagem é gravada como `origin: 'AGENT'` com watermark
**"Enviado por fora (WhatsApp)"**, pois não há como saber qual usuário
digitou no dispositivo externo.

## Arquitetura

### Bloco 1 — Bifurcação no handler de mensagens

Em `zapo.ts:233` (`client.on('message')`), substituir o `return` da linha 238
por uma bifurcação:

- `fromMe === false` → fluxo atual, **intacto** (bot, NPS, horário comercial,
  roteamento, resposta automática).
- `fromMe === true` → novo fluxo **`handleOutboundSync`**.

Filtros comuns aos dois caminhos (mantidos): ignora grupos (`@g.us`),
broadcast, `status@broadcast` e mensagens de/para o próprio número
(`meJid` / `meLid`).

O fluxo `handleOutboundSync` **não** dispara bot, NPS, resposta de horário
comercial nem roteamento — a mensagem é da empresa, não do cliente.

### Bloco 2 — Deduplicação do "eco"

Quando o próprio SaaS envia (atendente respondendo dentro do sistema), o
WhatsApp devolve a mensagem como evento `fromMe`. Sem dedup, toda resposta
feita pelo SaaS seria duplicada.

Dupla checagem antes de gravar em `handleOutboundSync`:

1. **Cache em memória** `processedMessageIds` (já existe, `zapo.ts:26`),
   chaveado por `event.key.id`.
2. **Banco, por `whatsappMessageId`**: o caminho de envio do SaaS já grava o
   `whatsappMessageId` retornado pelo envio (`messages.service.ts:149`).
   - Se existe `message` com esse `whatsappMessageId` → é eco do próprio SaaS
     (ou já sincronizada) → **ignora**.
   - Se não existe → veio de fora → **sincroniza**.

**Fechamento da janela de corrida:** no momento do envio pelo SaaS, marcar o
`whatsappMessageId` no cache `processedMessageIds` assim que o ID for
conhecido, para cobrir o caso do eco chegar antes do `INSERT` terminar.

### Bloco 3 — Resolução de ticket e persistência

`findOrCreateByContact` **não é reutilizável direto**: ele só encontra tickets
com status em `['BOT','QUEUE','OPEN','PENDING_NPS']` e, se não achar, cria como
`BOT`/`QUEUE` (`tickets.service.ts:99-120`) — o que quebraria as decisões de
"assumir do bot" e "reabrir fechado". O fluxo de saída usa um resolvedor próprio:

1. Resolve o telefone do destinatário a partir de `event.key.remoteJid` /
   `remoteJidAlt` / mapeamento LID→PN (reaproveita a lógica existente das
   linhas 260-299).
2. Upsert do contato (reaproveita lógica das linhas 306-319).
3. Busca o ticket **mais recente** do contato (incluindo CLOSED):
   - Ativo (BOT/QUEUE/OPEN): anexa. Se **BOT → OPEN**.
   - CLOSED: **reabre → OPEN**.
   - Nenhum: cria contato + ticket **OPEN**.
4. Grava `message`: `origin: 'AGENT'`, `whatsappMessageId = msgId`,
   watermark de autoria "Enviado por fora (WhatsApp)".
5. Toca `updatedAt` do ticket (via update). **Não** mexe em
   `lastContactMessageAt` (métrica de SLA do cliente).
6. Reaproveita o parsing de conteúdo (texto, mídia com download, localização,
   contato) — ver Bloco 4.

### Bloco 4 — Frontend + refactor pontual

- **Socket:** emite `new_message` com o mesmo shape atual, incluindo
  `origin: 'AGENT'`, para a bolha aparecer do **lado de saída** em tempo real
  na conversa aberta.
- **Frontend:** garantir renderização como saída; badge opcional
  **"via WhatsApp"** para distinguir do que foi enviado pelo próprio SaaS.
- **Refactor justificado:** extrair o bloco de parsing de conteúdo
  (~`zapo.ts:335-432`) para um helper `parseMessageContent(event, client)`,
  reutilizado pelos fluxos de entrada e de saída. Evita duplicar ~100 linhas
  e mantém o handler legível.

## Unidades e interfaces

- **`handleOutboundSync(event, client, ctx)`** — recebe um evento `fromMe`,
  grava a saída e atualiza o ticket. Depende de: dedup, resolvedor de ticket,
  `parseMessageContent`, `MessagesService.create`, socket. Não depende de
  bot/NPS/horário.
- **`parseMessageContent(event, client)`** — dado um evento, retorna
  `{ body, mediaUrl, mediaType, locationJson, contactJson, buttonId }`.
  Puro em relação a ticket/bot; só faz parsing e download de mídia.
- **`resolveOutboundTicket(contact, tenantId)`** — retorna o ticket destino
  aplicando as regras de assumir-do-bot / reabrir-fechado / criar-OPEN.

## Riscos e limitações

- Cobre apenas o período **conectado** — mensagens enviadas com o SaaS offline
  não retornam (decisão de escopo).
- Depende do WhatsApp entregar o fanout multi-device (comportamento padrão do
  protocolo; se o dispositivo externo não estiver na mesma conta vinculada,
  não há entrega).
- Reações/edições enviadas por fora: o parsing de reação já existe
  (`zapo.ts:342-360`); confirmar comportamento no fluxo de saída durante a
  implementação (pode ficar fora do MVP).

## Testes

- **Dedup:** resposta enviada pelo SaaS **não** duplica ao voltar como eco.
- **Tempo real:** mensagem enviada pelo celular aparece na conversa aberta
  como bolha de saída.
- **Assumir do bot:** responder por fora um ticket em BOT move para OPEN.
- **Reabrir:** responder por fora um contato com ticket CLOSED reabre em OPEN.
- **Conversa nova:** iniciar conversa por fora cria contato + ticket OPEN.
- **Mídia:** imagem/áudio/documento enviados por fora são baixados e exibidos.
- **Filtros:** grupos, broadcast e mensagens para o próprio número são ignorados.
