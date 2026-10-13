# Fechamento fora do horário + NPS por lista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fora do horário, uma conversa nova recebe a mensagem de ausência e é fechada automaticamente (excluída de relatórios); a pesquisa de NPS passa a usar uma lista de notas 10→1.

**Architecture:** Alterações no backend apenas. Novo flag `excludeFromReports` no `Ticket` filtra os relatórios. A orquestração fora-do-horário fica no handler inbound (`zapo.ts`), reusando `TicketsService`/`MessagesService`. O NPS troca texto por `sendListMessage` (já existente) com um helper compartilhado.

**Tech Stack:** Node + TypeScript, Express, Prisma (SQLite), socket.io, zapo-js.

## Global Constraints

- **Sem testes automatizados** no projeto — verificar com `npx tsc --noEmit` (no `backend/`) + QA manual.
- **NUNCA** rodar `prisma migrate dev` — `dev.db` em drift. Mudanças de schema via **SQL direto + `prisma generate`** (memória `prisma-db-drift`).
- Backend roda com `ts-node-dev --transpile-only` (sem checagem de tipos em runtime).
- Nomes de coluna do Prisma = nome do campo (camelCase), sem `@map` neste projeto.

---

### Task 1: Campo `excludeFromReports` no Ticket

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `Ticket`, após o campo `channel`)
- DB: `backend/prisma/dev.db` (ALTER TABLE via SQL)

**Interfaces:**
- Produces: campo `Ticket.excludeFromReports: boolean` (default `false`) no Prisma Client.

- [ ] **Step 1: Backup do dev.db**

```bash
cd backend && cp prisma/dev.db prisma/dev.db.bak-afterhours
```

- [ ] **Step 2: Adicionar coluna via SQL**

```bash
cd backend && node -e "const D=require('better-sqlite3');const db=new D('prisma/dev.db');db.prepare('ALTER TABLE \"tickets\" ADD COLUMN \"excludeFromReports\" BOOLEAN NOT NULL DEFAULT 0').run();console.log('col added');"
```
Expected: `col added` (se já existir, o erro "duplicate column name" indica que já foi aplicado — seguir).

- [ ] **Step 3: Declarar no schema.prisma**

No `model Ticket`, logo após a linha `channel String @default("whatsapp")`, adicionar:

```prisma
  // Excluir dos relatórios (ex.: fechamento automático fora do horário)
  excludeFromReports Boolean @default(false)
```

- [ ] **Step 4: Regenerar o client (sem migrate)**

```bash
cd backend && npx prisma generate
```
Expected: "Generated Prisma Client".

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(tickets): campo excludeFromReports"
```

---

### Task 2: `TicketsService.createClosedAfterHours`

**Files:**
- Modify: `backend/src/modules/tickets/tickets.service.ts` (nova função estática, junto de `createOpenTicket`)

**Interfaces:**
- Consumes: `prisma`, `emitToTenant`, `generateProtocol` (já no arquivo).
- Produces: `TicketsService.createClosedAfterHours(contactId: string, tenantId: string): Promise<Ticket>` — cria ticket `CLOSED`, `closedAt=now`, `excludeFromReports=true`, emite `ticket:new`.

- [ ] **Step 1: Implementar o método**

Após `createOpenTicket` (por volta da linha 159), inserir:

```typescript
    static async createClosedAfterHours(contactId: string, tenantId: string) {
        const ticket = await prisma.ticket.create({
            data: {
                protocol: generateProtocol(),
                status: 'CLOSED',
                closedAt: new Date(),
                excludeFromReports: true,
                contactId,
                tenantId,
            },
            include: { contact: true, department: true, user: true },
        });
        emitToTenant(tenantId, 'ticket:new', ticket);
        return ticket;
    }
```

- [ ] **Step 2: Type-check**

```bash
cd backend && npx tsc --noEmit
```
Expected: sem erros novos referentes a este arquivo.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/tickets/tickets.service.ts
git commit -m "feat(tickets): createClosedAfterHours"
```

---

### Task 3: Fluxo fora-do-horário no handler inbound

**Files:**
- Modify: `backend/src/lib/zapo.ts` (bloco "Business Hours Check" no handler `message`)

**Interfaces:**
- Consumes: `TicketsService.createClosedAfterHours`, `MessagesService.create`, `checkBusinessHours`, `prisma`; variáveis locais já em escopo: `upsertedContact`, `msgId`, `body`, `localMediaUrl`, `mType`, `locationJson`, `contactJson`, `event`, `tenantId`.

- [ ] **Step 1: Substituir o bloco de business hours**

Localizar:

```typescript
                // ── Business Hours Check ──
                const bh = await checkBusinessHours();
                if (!bh.isOpen) {
                    if (bh.awayMessage) {
                        try {
                            await client.message.send(event.key.remoteJid, bh.awayMessage);
                        } catch (err) {
                            console.error('[ZapoService] Failed to send away message:', err);
                        }
                    }
                    return;
                }
```

Substituir por:

```typescript
                // ── Business Hours Check ──
                const bh = await checkBusinessHours();
                if (!bh.isOpen) {
                    // Só aplica fechamento automático em CONVERSAS NOVAS.
                    // Se já há atendimento ativo, deixa o fluxo normal seguir.
                    const activeTicket = upsertedContact
                        ? await prisma.ticket.findFirst({
                            where: {
                                contactId: upsertedContact.id,
                                status: { in: ['OPEN', 'QUEUE', 'BOT', 'PENDING_NPS'] },
                            },
                        })
                        : null;

                    if (!activeTicket) {
                        const offBody = locationJson
                            ? JSON.stringify(locationJson)
                            : contactJson
                                ? JSON.stringify(contactJson)
                                : body;
                        const closed = await TicketsService.createClosedAfterHours(upsertedContact!.id, tenantId);
                        await MessagesService.create({
                            ticketId: closed.id,
                            body: offBody,
                            mediaUrl: localMediaUrl,
                            mediaType: mType,
                            origin: 'CONTACT',
                            whatsappMessageId: msgId,
                        });
                        if (bh.awayMessage) {
                            try {
                                await client.message.send(event.key.remoteJid, bh.awayMessage);
                            } catch (err) {
                                console.error('[ZapoService] Failed to send away message:', err);
                            }
                            await MessagesService.create({
                                ticketId: closed.id,
                                body: bh.awayMessage,
                                origin: 'BOT',
                            });
                        }
                        console.log(`[ZapoService] After-hours new conversation closed → ticket ${closed.id}`);
                        return;
                    }
                    // Atendimento ativo fora do horário: segue o fluxo normal abaixo.
                }
```

- [ ] **Step 2: Type-check**

```bash
cd backend && npx tsc --noEmit
```
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/zapo.ts
git commit -m "feat(zapo): fecha conversa nova fora do horário com msg de ausência"
```

---

### Task 4: Excluir tickets marcados dos relatórios

**Files:**
- Modify: `backend/src/modules/analytics/analytics.service.ts`

**Interfaces:**
- Consumes: `Ticket.excludeFromReports` (Task 1).

- [ ] **Step 1: Adicionar `excludeFromReports: false` a cada query de ticket**

Em cada `prisma.ticket.findMany`/`count`/`groupBy` do arquivo, adicionar `excludeFromReports: false` ao objeto `where`. Locais (funções): `getAverageFirstResponseTime`, `getAverageHandleTime`, `getAgentVolume` (as duas contagens `closed` e `open`), `getDailyVolume`, `getDepartmentVolume`, `getOverview` (objeto `filter`), `getSummary` (as contagens `totalTickets`, `openTickets`, `queueTickets`), `exportTickets`.

Exemplos concretos:

`getAverageFirstResponseTime`:
```typescript
            where: {
                status: { in: ['OPEN', 'CLOSED'] },
                excludeFromReports: false,
                ...(from || to ? { createdAt: dateFilter } : {}),
                ...(tenantId ? { tenantId } : {}),
            },
```

`getOverview` (o objeto `filter`):
```typescript
        const filter = {
            excludeFromReports: false,
            ...(from || to ? { createdAt: dateFilter } : {}),
            ...(tenantId ? { tenantId } : {}),
        };
```

`getSummary` (contagens):
```typescript
        const [totalTickets, openTickets, queueTickets, onlineAgents] = await Promise.all([
            prisma.ticket.count({ where: { excludeFromReports: false, ...(from || to ? { createdAt: dateFilter } : {}), ...tenantFilter } }),
            prisma.ticket.count({ where: { status: 'OPEN', excludeFromReports: false, ...tenantFilter } }),
            prisma.ticket.count({ where: { status: 'QUEUE', excludeFromReports: false, ...tenantFilter } }),
            prisma.user.count({ where: { online: true } }),
        ]);
```

`getAgentVolume` (as duas contagens), `getDailyVolume`, `getDepartmentVolume`, `getAverageHandleTime`, `exportTickets`: adicionar `excludeFromReports: false` no respectivo `where` do mesmo modo.

- [ ] **Step 2: Type-check**

```bash
cd backend && npx tsc --noEmit
```
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/analytics/analytics.service.ts
git commit -m "feat(analytics): exclui tickets excludeFromReports dos relatórios"
```

---

### Task 5: NPS por lista (initiate + handle)

**Files:**
- Modify: `backend/src/modules/nps/nps.service.ts`

**Interfaces:**
- Consumes: `WhatsAppClient.sendListMessage`, `prisma`.
- Produces: `NpsService.handleNpsResponse(ticketId, messageBody, buttonId?)` (novo parâmetro opcional `buttonId`); helper privado `sendNpsList`.

- [ ] **Step 1: Adicionar helper `sendNpsList`**

Dentro da classe `NpsService`, adicionar:

```typescript
    /** Envia a lista de NPS (notas de 10 a 1) com a mensagem configurada. */
    private static async sendNpsList(
        ticket: { id: string; contact: { phone: string } },
        npsMessage: string
    ) {
        const rows: Array<{ id: string; title: string }> = [];
        for (let n = 10; n >= 1; n--) rows.push({ id: `nps_${n}`, title: String(n) });
        const client = await WhatsAppClient.getClientForTicket(ticket.id);
        await client.sendListMessage(
            ticket.contact.phone,
            npsMessage,
            'Avaliar',
            [{ title: 'Notas', rows }]
        );
    }
```

- [ ] **Step 2: `initiateNps` envia a lista**

Substituir o bloco:

```typescript
        // Send NPS message via WhatsApp
        const npsMessage = settings.npsMessage || 'Por favor, avalie nosso atendimento de 1 a 10:';
        try {
            const client = await WhatsAppClient.getClientForTicket(ticketId);
            await client.sendTextMessage(ticket.contact.phone, npsMessage);
        } catch (e) {
            console.error('[NPS] Failed to send NPS message:', e);
        }
```

por:

```typescript
        // Send NPS list via WhatsApp
        const npsMessage = settings.npsMessage || 'Por favor, avalie nosso atendimento de 1 a 10:';
        try {
            await this.sendNpsList(updated, npsMessage);
        } catch (e) {
            console.error('[NPS] Failed to send NPS list:', e);
        }
```
(`updated` já vem de `prisma.ticket.update(... include: { contact: true })`.)

- [ ] **Step 3: `handleNpsResponse` aceita `buttonId` e reenvia a lista no inválido**

Trocar a assinatura e a extração da nota:

```typescript
    static async handleNpsResponse(ticketId: string, messageBody: string, buttonId?: string): Promise<boolean> {
```

Substituir:

```typescript
        const trimmed = messageBody.trim();
        const score = parseInt(trimmed, 10);

        if (isNaN(score) || score < 1 || score > 10) {
            // Not a valid score — send reminder
            try {
                const client = await WhatsAppClient.getClientForTicket(ticketId);
                await client.sendTextMessage(
                    ticket.contact.phone,
                    'Por favor, responda com um número de 1 a 10 para avaliar nosso atendimento.'
                );
            } catch { }
            return true; // Still consumed the message
        }

        // Check if there's a comment after the number
        const parts = trimmed.split(/\s+/);
        const comment = parts.length > 1 ? parts.slice(1).join(' ') : null;
```

por:

```typescript
        const trimmed = messageBody.trim();
        // Nota vem do rowId da lista (nps_N) ou, como fallback, de um número digitado.
        const score = buttonId && buttonId.startsWith('nps_')
            ? parseInt(buttonId.slice(4), 10)
            : parseInt(trimmed, 10);

        if (isNaN(score) || score < 1 || score > 10) {
            // Resposta inválida — reenvia a lista
            try {
                const settings = await prisma.accountSettings.findFirst({ where: { tenantId: ticket.tenantId } });
                const npsMessage = settings?.npsMessage || 'Por favor, avalie nosso atendimento de 1 a 10:';
                await this.sendNpsList(ticket, npsMessage);
            } catch { }
            return true; // Still consumed the message
        }

        // Comentário só quando digitado (lista não traz texto extra)
        const parts = trimmed.split(/\s+/);
        const comment = !buttonId && parts.length > 1 ? parts.slice(1).join(' ') : null;
```

- [ ] **Step 4: Type-check**

```bash
cd backend && npx tsc --noEmit
```
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/nps/nps.service.ts
git commit -m "feat(nps): pesquisa por lista de notas 10 a 1"
```

---

### Task 6: Passar `buttonId` ao handler de NPS no inbound

**Files:**
- Modify: `backend/src/lib/zapo.ts` (bloco "NPS Check")

**Interfaces:**
- Consumes: `NpsService.handleNpsResponse(ticketId, body, buttonId)` (Task 5); `buttonId` já destructurado do parse.

- [ ] **Step 1: Passar buttonId**

Localizar:

```typescript
                        const handled = await NpsService.handleNpsResponse(npsTicket.id, body);
```

Substituir por:

```typescript
                        const handled = await NpsService.handleNpsResponse(npsTicket.id, body, buttonId);
```

- [ ] **Step 2: Type-check**

```bash
cd backend && npx tsc --noEmit
```
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/zapo.ts
git commit -m "feat(zapo): repassa rowId da lista ao NPS"
```

---

## Self-Review

**Spec coverage:**
- Schema flag → Task 1. ✓
- Fluxo fora-do-horário (conversa nova cria+registra+fecha+away; ativo segue normal) → Tasks 2, 3. ✓
- Exclusão de relatórios → Task 4. ✓
- NPS lista 10→1 com msg configurada + fallback digitado + reenvio no inválido → Task 5. ✓
- Repasse do rowId no inbound → Task 6. ✓

**Placeholder scan:** nenhum TODO/TBD; todo passo tem código concreto.

**Type consistency:** `createClosedAfterHours(contactId, tenantId)`, `handleNpsResponse(ticketId, messageBody, buttonId?)`, `sendNpsList(ticket, npsMessage)`, `sendListMessage(to, text, buttonText, sections)` — consistentes entre tasks e com as assinaturas existentes.

## Verificação final (QA manual)
- Horário fechado + contato novo → recebe ausência; ticket criado como CLOSED; some dos relatórios.
- Horário fechado + contato com ticket ativo → mensagem entra normal, sem fechar.
- NPS: fechar atendimento → cliente recebe lista 10→1; selecionar → registra e agradece; digitar número → registra; inválido → reenvia lista.
