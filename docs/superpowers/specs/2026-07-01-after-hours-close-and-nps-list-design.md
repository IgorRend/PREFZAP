# Design — Fechamento automático fora do horário + NPS por lista

**Data:** 2026-07-01
**Status:** Aprovado (design)

Duas melhorias independentes no atendimento:

1. **Horário de atendimento** — ao chegar uma **conversa nova** fora do horário, responder a
   mensagem de ausência configurada e **finalizar** o atendimento automaticamente, sem contar
   nos relatórios.
2. **Pesquisa de satisfação (NPS)** — enviar a mensagem configurada acompanhada de uma **lista**
   para o cliente selecionar a nota de 1 a 10 (começando por 10), em vez de pedir para digitar.

---

## Contexto atual

- **Horário** (`backend/src/lib/zapo.ts`, handler `message`, ~linhas 554-565): `checkBusinessHours()`
  retorna `{ isOpen, awayMessage }`. Quando fechado, envia a `awayMessage` e faz `return` **antes**
  de `findOrCreateByContact` — ou seja, hoje **não cria ticket nem salva mensagens** fora do horário.
- **Relatórios** (`backend/src/modules/analytics/analytics.service.ts`): contam tickets por
  `createdAt`/`status`/`closedAt`. Não existe flag de exclusão.
- **NPS** (`backend/src/modules/nps/nps.service.ts`): `initiateNps` envia `npsMessage` como texto;
  `handleNpsResponse` faz `parseInt` do corpo; resposta inválida → lembrete em texto.
- **Lista**: `WhatsAppClient.sendListMessage(to, text, buttonText, sections, footer?, title?)` já
  existe (`backend/src/lib/whatsapp.ts`) e o parser de entrada (`parseMessageContent`) já lê
  `listResponseMessage` → `body = title`, `buttonId = selectedRowId`.
- **Schema**: alterações aplicadas via **SQL direto + `prisma generate`**. NUNCA rodar
  `prisma migrate dev` (o `dev.db` está em drift — ver memória `prisma-db-drift`).

---

## Feature 1 — Fechamento automático fora do horário

### Schema
Novo campo em `Ticket`:

```prisma
excludeFromReports Boolean @default(false)
```

Aplicar via SQL:

```sql
ALTER TABLE "tickets" ADD COLUMN "excludeFromReports" BOOLEAN NOT NULL DEFAULT 0;
```

Depois atualizar `schema.prisma` e rodar `prisma generate` (sem migrate).

### Fluxo (em `zapo.ts`, substituindo o bloco business-hours atual)

Após o parse de conteúdo e a checagem de NPS (que permanece antes), quando `checkBusinessHours()`
retornar `isOpen = false`:

1. Buscar ticket **ativo** do contato: `status ∈ {OPEN, QUEUE, BOT, PENDING_NPS}`.
2. **Se existe ativo** → NÃO aplica auto-close. Segue o fluxo normal do handler (salva a mensagem,
   emite para o agente, bot/roteamento seguem). *(Efeito colateral desejado: corrige o descarte
   atual de mensagens off-hours em tickets já abertos.)*
3. **Se NÃO existe (conversa nova)**:
   1. Criar ticket já **fechado**: `status = 'CLOSED'`, `closedAt = now`, `excludeFromReports = true`
      (novo método `TicketsService.createClosedAfterHours(contactId, tenantId)`, que emite `ticket:new`).
   2. Salvar a mensagem recebida via `MessagesService.create({ ..., origin: 'CONTACT', whatsappMessageId })`.
   3. Enviar a `awayMessage` pelo WhatsApp (`client.message.send`) e salvar via
      `MessagesService.create({ ..., origin: 'BOT' })`.
   4. `return` — não roda bot, NPS, horário de resposta nem roteamento.

### Relatórios
Adicionar `excludeFromReports: false` a **todas** as queries de ticket em `analytics.service.ts`:
`getAverageFirstResponseTime`, `getAverageHandleTime`, `getAgentVolume`, `getDailyVolume`,
`getSummary` (contagens de total/open/queue), `getOverview`, `getDepartmentVolume`, `exportTickets`.
Queries de `NpsRating` não precisam (tickets off-hours não geram NPS).

---

## Feature 2 — NPS por lista

### `NpsService.initiateNps`
Trocar o envio de texto por um **list message**, através de um helper compartilhado
`sendNpsList(ticket, npsMessage)`:

- `description` = `npsMessage` configurada (a "mensagem setada");
- `buttonText` = `"Avaliar"`;
- 1 seção (`title: "Notas"`), 10 linhas de **10 a 1** (começa em 10):
  - `title`: `"10"`, `"9"`, …, `"1"` (somente números);
  - `rowId`: `"nps_10"`, …, `"nps_1"`.
- Salvar a system message com o `npsMessage` (como hoje).

Limite do WhatsApp: máx. 10 linhas por lista — 1–10 encaixa exatamente.

### `NpsService.handleNpsResponse(ticketId, messageBody, buttonId?)`
- Extrair a nota do `buttonId` (`nps_N` → `N`); **fallback** para `parseInt(messageBody)` (quem
  digitar continua funcionando).
- Nota válida (1–10) → salvar `NpsRating`, agradecer, fechar o ticket (`closeTicketDirectly`) e
  salvar a system message `⭐ NPS: N/10` (como hoje).
- Nota inválida → **reenviar a lista** (via `sendNpsList`) em vez de pedir para digitar.

### Integração no `zapo.ts`
No bloco de checagem de NPS (que hoje chama `handleNpsResponse(npsTicket.id, body)`), passar também
o `buttonId` do parse: `handleNpsResponse(npsTicket.id, body, buttonId)`. O `buttonId` já é extraído
por `parseMessageContent` para `listResponseMessage`.

---

## Fora de escopo (YAGNI)
- Rótulos descritivos nas notas do NPS (ficou "só números").
- Reabertura/expiração especial dos tickets fechados fora do horário (seguem o ciclo normal de
  ticket fechado).
- Alteração de UI de configuração (as mensagens já existem em Automações/Settings).

## Verificação
Sem testes automatizados no projeto — validação por QA manual:
- **Horário**: configurar horário fechado; mandar msg de um contato novo → recebe ausência, ticket
  criado como fechado e ausente dos relatórios; mandar de um contato com ticket ativo → segue normal.
- **NPS**: fechar um atendimento com NPS ativo → cliente recebe a lista 10→1; selecionar uma nota →
  registra e agradece; digitar número → também registra; resposta inválida → reenvia a lista.
