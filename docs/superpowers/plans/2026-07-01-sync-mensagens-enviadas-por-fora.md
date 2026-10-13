# Sincronização de mensagens enviadas por fora — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o SaaS registrar e exibir, em tempo real, as mensagens que o atendente/dono envia por fora (celular vinculado ou WhatsApp Web oficial).

**Architecture:** No handler `client.on('message')` (`backend/src/lib/zapo.ts`), em vez de descartar eventos `fromMe`, bifurcar para um fluxo `handleOutboundSync` que grava a mensagem como `origin: 'AGENT'` e ajusta o ticket. A dedup de "eco" (mensagens que o próprio SaaS enviou) é feita pelo `whatsappMessageId`, que o `MessagesService.create` já valida. Nenhuma mudança de frontend é necessária.

**Tech Stack:** TypeScript, Node, `zapo-js` (protocolo WhatsApp multi-device), Prisma (SQLite), Socket.io.

## Global Constraints

- Escopo: **tempo real apenas**. Nada de backfill offline/histórico.
- Não disparar bot, NPS, resposta de horário comercial nem roteamento para mensagens `fromMe`.
- Reaproveitar a dedup existente por `whatsappMessageId` (`messages.service.ts:326-337`); não duplicar mensagens que o próprio SaaS enviou.
- Não alterar o comportamento do fluxo de entrada (`fromMe === false`), a não ser pela extração DRY do parser.
- Não tocar em `lastContactMessageAt` (é métrica de SLA do cliente).
- Watermark de autoria: `senderName = 'Enviado por fora (WhatsApp)'`.
- **Não há framework de testes no projeto.** A verificação é manual, contra o app rodando (`start.bat` na raiz), reproduzindo o cenário com um celular vinculado. Cada task termina com passos de verificação concretos e observáveis.

---

### Task 1: Extrair `parseMessageContent` e refatorar o fluxo de entrada para usá-lo

Refactor sem mudança de comportamento. Isola o parsing de conteúdo (texto, mídia, localização, contato, reação) numa função de módulo reutilizável pelos dois fluxos (entrada e saída).

**Files:**
- Modify: `backend/src/lib/zapo.ts` (extrair ~linhas 335-432 para função de módulo; ajustar o handler de entrada para chamá-la)

**Interfaces:**
- Produces: `parseMessageContent(event: any, client: any, tenantId: string): Promise<ParsedContent>` onde
  ```ts
  interface ParsedContent {
    body?: string;
    mediaUrl?: string;
    mediaType?: string;
    locationJson?: Record<string, any>;
    contactJson?: Record<string, any>;
    buttonId?: string;
    isReaction?: boolean;
    reaction?: { targetMsgId?: string; emoji: string };
  }
  ```

- [ ] **Step 1: Adicionar a função de módulo `parseMessageContent`**

Inserir no nível de módulo em `backend/src/lib/zapo.ts` (por exemplo logo após os helpers de idempotência, antes da classe `ZapoService`). O corpo é o mesmo parsing que hoje vive inline no handler:

```ts
interface ParsedContent {
    body?: string;
    mediaUrl?: string;
    mediaType?: string;
    locationJson?: Record<string, any>;
    contactJson?: Record<string, any>;
    buttonId?: string;
    isReaction?: boolean;
    reaction?: { targetMsgId?: string; emoji: string };
}

async function parseMessageContent(event: any, client: any, tenantId: string): Promise<ParsedContent> {
    const message = event.message || {};
    const out: ParsedContent = {};

    if (message.reactionMessage) {
        out.isReaction = true;
        out.reaction = {
            targetMsgId: message.reactionMessage.key?.id,
            emoji: message.reactionMessage.text || '',
        };
        return out;
    }

    if (message.conversation || message.extendedTextMessage) {
        out.body = message.conversation || message.extendedTextMessage.text || '';
    } else if (message.buttonsResponseMessage) {
        out.body = message.buttonsResponseMessage.selectedDisplayText || message.buttonsResponseMessage.selectedButtonId || '';
        out.buttonId = message.buttonsResponseMessage.selectedButtonId;
    } else if (message.listResponseMessage) {
        out.body = message.listResponseMessage.title || message.listResponseMessage.singleSelectReply?.selectedRowId || '';
        out.buttonId = message.listResponseMessage.singleSelectReply?.selectedRowId;
    } else if (message.interactiveResponseMessage) {
        const interactive = message.interactiveResponseMessage;
        out.body = interactive.body?.text || '';
        if (interactive.nativeFlowResponseMessage?.paramsJson) {
            try {
                const params = JSON.parse(interactive.nativeFlowResponseMessage.paramsJson);
                out.buttonId = params.id || params.selectedButtonId;
                if (!out.body && params.id) out.body = params.id;
            } catch {}
        }
    } else if (message.templateButtonReplyMessage) {
        out.body = message.templateButtonReplyMessage.selectedDisplayText || message.templateButtonReplyMessage.selectedId || '';
        out.buttonId = message.templateButtonReplyMessage.selectedId;
    } else if (message.imageMessage || message.videoMessage || message.audioMessage || message.documentMessage || message.stickerMessage) {
        const mediaObj = message.imageMessage || message.videoMessage || message.audioMessage || message.documentMessage || message.stickerMessage;
        const mime = mediaObj?.mimetype || 'application/octet-stream';
        const mediaBytes = await client.message.downloadBytes(event);
        const relPath = await StorageService.saveBuffer(tenantId, Buffer.from(mediaBytes), mime);
        const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
        out.mediaUrl = `${baseUrl}${relPath}`;
        if (message.imageMessage) out.mediaType = 'image';
        else if (message.videoMessage) out.mediaType = 'video';
        else if (message.audioMessage) out.mediaType = 'audio';
        else if (message.stickerMessage) out.mediaType = 'sticker';
        else out.mediaType = 'document';
        const caption = (mediaObj as any).caption || (mediaObj as any).fileName;
        out.body = caption || `[Mídia recebida: ${out.mediaType}]`;
    } else if (message.locationMessage) {
        const loc = message.locationMessage;
        out.locationJson = {
            latitude: loc.degreesLatitude,
            longitude: loc.degreesLongitude,
            name: loc.name || '',
            address: loc.address || '',
        };
        out.body = `📍 ${loc.name || 'Localização'}: ${loc.degreesLatitude}, ${loc.degreesLongitude}`;
    } else if (message.contactMessage) {
        const cont = message.contactMessage;
        out.contactJson = { displayName: cont.displayName, vcard: cont.vcard };
        out.body = `👤 Contato: ${cont.displayName}`;
    } else if (message.contactsArrayMessage) {
        const first = message.contactsArrayMessage.contacts?.[0];
        if (first) {
            out.contactJson = { displayName: first.displayName, vcard: first.vcard };
            out.body = `👤 Contato: ${first.displayName}`;
        }
    }

    return out;
}
```

- [ ] **Step 2: Substituir o parsing inline do handler de entrada por uma chamada a `parseMessageContent`**

No handler `client.on('message')`, remover o bloco inline (atuais ~linhas 335-432, incluindo a caixa de `reactionMessage` das linhas 342-360) e, no lugar, após a resolução de `phone`/`pushName`/`msgId`, inserir:

```ts
const parsed = await parseMessageContent(event, client, tenantId);

// Reação: emite e sai (comportamento atual preservado)
if (parsed.isReaction) {
    const targetMsgId = parsed.reaction?.targetMsgId;
    if (targetMsgId) {
        const existingMsg = await prisma.message.findFirst({ where: { whatsappMessageId: targetMsgId } });
        if (existingMsg) {
            getIO().to(tenantRoom(tenantId)).emit('message_reaction', {
                connectionId,
                targetMessageId: targetMsgId,
                internalMessageId: existingMsg.id,
                emoji: parsed.reaction?.emoji || '',
                ticketId: existingMsg.ticketId,
            });
        }
    }
    return;
}

const { body, mediaUrl: localMediaUrl, mediaType: mType, locationJson, contactJson, buttonId } = parsed;
```

Manter, logo abaixo e sem alteração, o restante do handler de entrada a partir de `if (!body && !localMediaUrl) return;` (checagem NPS, horário comercial, `findOrCreateByContact`, gravação `origin: 'CONTACT'`, emit `new_message`, bot flow).

- [ ] **Step 3: Compilar (typecheck) e subir o backend**

Run: `cd backend && npx tsc --noEmit`
Expected: sem novos erros de tipo introduzidos por esta task (a base pode ter erros pré-existentes documentados em `backend/tsc_errors.txt`; comparar e garantir que nada novo surgiu em `zapo.ts`).

Depois: rodar `start.bat` na raiz (ou `cd backend && npm run dev`) e confirmar no log `🚀 Server running on http://localhost:3001` sem exceções.

- [ ] **Step 4: Verificação manual — fluxo de entrada intacto**

De um telefone **de teste** (o cliente), enviar para o número conectado:
1. Uma mensagem de **texto** → aparece na conversa como bolha de entrada (esquerda).
2. Uma **imagem com legenda** → aparece com a mídia baixada e a legenda.

Expected: comportamento idêntico ao de antes do refactor (texto e mídia entram normalmente; bot/horário continuam funcionando).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/zapo.ts
git commit -m "refactor(zapo): extrai parseMessageContent do handler de mensagens"
```
(Se o projeto ainda não for um repositório git, rodar `git init` antes, ou pular o commit conforme preferência do usuário.)

---

### Task 2: Sincronizar mensagens `fromMe` (bifurcação + `resolveOutboundTicket` + `handleOutboundSync`)

Implementa o recurso: passa a gravar como saída as mensagens enviadas por fora, com as regras de ticket (assumir do bot / reabrir fechado / criar OPEN) e dedup do eco.

**Files:**
- Modify: `backend/src/modules/tickets/tickets.service.ts` (adicionar `createOpenTicket`)
- Modify: `backend/src/lib/zapo.ts` (adicionar `resolveOutboundTicket` e `handleOutboundSync`; bifurcar na linha do `if (event.key.fromMe) return;`)

**Interfaces:**
- Consumes: `parseMessageContent(event, client, tenantId)` (Task 1); `MessagesService.create({ ticketId, body?, mediaUrl?, mediaType?, origin, whatsappMessageId?, senderName? })` (dedup embutida por `whatsappMessageId`); `TicketsService.updateStatus(id, 'OPEN')` (emite `ticket:updated`).
- Produces:
  - `TicketsService.createOpenTicket(contactId: string, tenantId: string): Promise<Ticket>` — cria ticket `status: 'OPEN'` e emite `ticket:new`.
  - `handleOutboundSync(event: any, client: any, tenantId: string, connectionId: string): Promise<void>`.

- [ ] **Step 1: Adicionar `TicketsService.createOpenTicket`**

Em `backend/src/modules/tickets/tickets.service.ts`, adicionar (reaproveita `generateProtocol` e `emitToTenant` já usados no arquivo):

```ts
static async createOpenTicket(contactId: string, tenantId: string) {
    const ticket = await prisma.ticket.create({
        data: {
            protocol: generateProtocol(),
            status: 'OPEN',
            contactId,
            tenantId,
        },
        include: { contact: true, department: true, user: true },
    });
    emitToTenant(tenantId, 'ticket:new', ticket);
    return ticket;
}
```

- [ ] **Step 2: Adicionar `resolveOutboundTicket` em `zapo.ts`**

Função de módulo. Regras: usa o ticket mais recente do contato; BOT → OPEN (assume do bot); CLOSED → OPEN (reabre); QUEUE/OPEN/PENDING_NPS → usa como está; nenhum → cria OPEN.

```ts
async function resolveOutboundTicket(contactId: string, tenantId: string): Promise<{ id: string }> {
    const latest = await prisma.ticket.findFirst({
        where: { contactId },
        orderBy: { createdAt: 'desc' },
    });

    if (!latest) {
        return TicketsService.createOpenTicket(contactId, tenantId);
    }
    if (latest.status === 'BOT' || latest.status === 'CLOSED') {
        return TicketsService.updateStatus(latest.id, 'OPEN');
    }
    return latest;
}
```

- [ ] **Step 3: Adicionar `handleOutboundSync` em `zapo.ts`**

Função de módulo. Faz dedup do eco, resolve contato/ticket, grava como `AGENT` e deixa o `MessagesService.create` emitir `message:new` (frontend renderiza do lado de saída e reordena a lista).

```ts
const OUTBOUND_WATERMARK = 'Enviado por fora (WhatsApp)';

async function handleOutboundSync(event: any, client: any, tenantId: string, connectionId: string): Promise<void> {
    const msgId = event.key.id;

    // Dedup em memória (mesma janela do fluxo de entrada)
    if (isAlreadyProcessed(msgId)) return;

    // Dedup de eco por whatsappMessageId: se o próprio SaaS enviou (ou já
    // sincronizamos), a mensagem já existe no banco → não reprocessa.
    const already = await prisma.message.findFirst({ where: { whatsappMessageId: msgId } });
    if (already) return;

    // Resolver telefone do destinatário (mesma lógica LID→PN do fluxo de entrada)
    const rawJid = event.key.remoteJid;
    const altJid = event.key.remoteJidAlt;
    const rawPhone = sanitizeJid(rawJid);
    let phone = '';
    if (altJid) {
        phone = sanitizeJid(altJid);
    } else if (rawJid.includes('@lid') || rawPhone.length >= 14) {
        try {
            const Database = require('better-sqlite3');
            const p = require('path');
            const dbPath = p.resolve(process.cwd(), 'prisma', 'zapo_sessions', `zapo_${connectionId}.sqlite`);
            if (fs.existsSync(dbPath)) {
                const db = new Database(dbPath);
                const row = db.prepare("SELECT phone_number FROM mailbox_contacts WHERE jid = ? OR lid = ?").get(rawJid, rawPhone);
                if (row?.phone_number) phone = row.phone_number.split('@')[0].replace(/\D/g, '');
            }
        } catch (err: any) {
            console.error('[ZapoService][outbound] LID resolve failed:', err.message);
        }
    }
    if (!phone) phone = rawPhone;

    // Upsert do contato (não sobrescreve o nome — não temos pushName confiável aqui)
    let contact = await prisma.contact.findFirst({ where: { tenantId, phone } });
    if (!contact) {
        contact = await prisma.contact.create({ data: { phone, name: phone, tenantId } });
    }

    // Parsear conteúdo (reação enviada por fora fica fora do MVP)
    const parsed = await parseMessageContent(event, client, tenantId);
    if (parsed.isReaction) return;
    const finalBody = parsed.locationJson
        ? JSON.stringify(parsed.locationJson)
        : parsed.contactJson
            ? JSON.stringify(parsed.contactJson)
            : parsed.body;
    if (!finalBody && !parsed.mediaUrl) return;

    // Resolver ticket com as regras (assumir do bot / reabrir / criar OPEN)
    const ticket = await resolveOutboundTicket(contact.id, tenantId);

    // Gravar como saída. create() deduplica de novo por whatsappMessageId,
    // toca updatedAt do ticket e emite 'message:new' (o front renderiza).
    await MessagesService.create({
        ticketId: ticket.id,
        body: finalBody,
        mediaUrl: parsed.mediaUrl,
        mediaType: parsed.mediaType,
        origin: 'AGENT',
        whatsappMessageId: msgId,
        senderName: OUTBOUND_WATERMARK,
    });

    console.log(`[ZapoService] Synced outbound message ${msgId} → ticket ${ticket.id} (phone=${phone})`);
}
```

- [ ] **Step 4: Bifurcar o handler de entrada**

No `client.on('message')`, localizar:

```ts
// Ignore our own messages
if (event.key.fromMe) return;
```

e substituir por:

```ts
// Mensagens enviadas por fora (celular / WhatsApp Web oficial): sincronizar
if (event.key.fromMe) {
    // Manter filtros: ignorar grupos, broadcast e mensagens para o próprio número
    if (event.key.isGroup || event.key.isBroadcast || event.key.remoteJid.includes('@g.us') || event.key.remoteJid === 'status@broadcast') return;
    const creds = client.getCredentials();
    const meJidClean = creds?.meJid ? sanitizeJid(creds.meJid) : '';
    const meLidClean = creds?.meLid ? sanitizeJid(creds.meLid) : '';
    const remoteClean = sanitizeJid(event.key.remoteJid);
    if (remoteClean === meJidClean || (meLidClean && remoteClean === meLidClean)) return;

    await handleOutboundSync(event, client, tenantId, connectionId);
    return;
}
```

- [ ] **Step 5: Compilar e subir**

Run: `cd backend && npx tsc --noEmit`
Expected: sem novos erros de tipo em `zapo.ts` / `tickets.service.ts`.

Depois: rodar `start.bat` e confirmar boot limpo (`🚀 Server running on http://localhost:3001`).

- [ ] **Step 6: Verificação manual — cenários de sincronização**

Com o SaaS aberto no navegador (http://localhost:5173) e um celular vinculado à mesma conta:

1. **Eco não duplica:** enviar uma mensagem **pelo próprio SaaS** (atendente respondendo na tela). Expected: aparece **uma única** bolha; não surge duplicata quando o WhatsApp devolve o eco `fromMe`.
2. **Ticket existente (OPEN/QUEUE):** com um ticket aberto, responder o cliente **pelo celular**. Expected: em ~1-2s a mensagem aparece na conversa como bolha de **saída**, com o rótulo "Enviado por fora (WhatsApp)"; a conversa sobe na lista.
3. **Assumir do bot:** com um ticket em **BOT**, responder o cliente pelo celular. Expected: a mensagem aparece como saída **e** o ticket muda para OPEN na lista (evento `ticket:updated`).
4. **Reabrir fechado:** com o ticket do contato **CLOSED**, responder pelo celular. Expected: o ticket reabre (OPEN) e a mensagem aparece.
5. **Conversa nova:** iniciar pelo celular uma conversa com um número **sem ticket** no SaaS. Expected: são criados contato + ticket OPEN, e a mensagem aparece.
6. **Mídia por fora:** enviar uma **imagem** pelo celular. Expected: a imagem é baixada e exibida como bolha de saída.
7. **Grupo ignorado:** enviar mensagem em um **grupo** pelo celular. Expected: nada é criado no SaaS.

Conferir também no banco (`backend/prisma/dev.db`) que as mensagens sincronizadas têm `origin = 'AGENT'`, `whatsappMessageId` preenchido e `senderName = 'Enviado por fora (WhatsApp)'`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/zapo.ts backend/src/modules/tickets/tickets.service.ts
git commit -m "feat(zapo): sincroniza em tempo real mensagens enviadas por fora"
```

---

## Notas de execução

- **Sem testes automatizados:** o projeto não tem runner de testes; a verificação é manual e depende de um celular vinculado. Se no futuro for desejável cobertura automatizada, o candidato natural é isolar `resolveOutboundTicket` (lógica de decisão pura sobre status) atrás de um runner mínimo — fora do escopo deste plano.
- **Reações enviadas por fora:** deliberadamente fora do MVP (`handleOutboundSync` retorna cedo em `isReaction`).
- **Limitação de escopo:** só cobre o período conectado; mensagens enviadas com o SaaS offline não retornam.
