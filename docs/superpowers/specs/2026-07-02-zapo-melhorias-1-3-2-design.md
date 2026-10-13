# Melhorias ZAPO — persistAllSecrets, envio por buffer, message_unavailable

**Data:** 2026-07-02
**Ordem de implementação:** 1 → 3 → 2

Três melhorias independentes na integração com a lib `zapo-js` (v1.3.0, vendorada
via `file:../ZAPO`). Todas usam APIs já presentes na build atual — sem upgrade.

## 1. `persistAllSecrets` — reações sobrevivem a restart

**Problema:** o "segredo" da mensagem só é persistido para enquetes/eventos/prompts
de bot. Reação/edição a uma mensagem comum não descriptografa após o backend
reiniciar (e o `ts-node-dev --respawn` reinicia com frequência).

**Mudança:** em `backend/src/lib/zapo.ts` (criação do client, ~linha 285):

```ts
new WaClient(
  { store, sessionId: connectionId, addons: { persistAllSecrets: true } },
  new ConsoleLogger('info'),
)
```

**Custo:** guarda um segredo por mensagem no store SQLite. Sem efeito no fluxo.
API verificada: `WaAddonOptions.persistAllSecrets` (`src/client/types.ts:286`,
consumido em `src/client/WaClient.ts:259`).

## 3. Envio de mídia por buffer — elimina o self-HTTP

**Problema:** ao enviar mídia, o backend salva o arquivo, monta
`http://localhost:3001/uploads/…` e faz um GET no próprio localhost para reenviar
ao WhatsApp (`whatsapp.ts:84-85`). Isso é um round-trip HTTP desnecessário e
depende de `BACKEND_URL` estar acessível.

**Mudança:**
- `backend/src/lib/whatsapp.ts`: `sendImageMessage`, `sendVideoMessage`,
  `sendDocumentMessage`, `sendAudioMessage` passam a aceitar `string | Buffer` no
  parâmetro de mídia. O guard `imageUrl.startsWith('http')` vira
  `typeof media === 'string' && media.startsWith('http')` — quando é `Buffer`,
  usa direto.
- `backend/src/modules/messages/messages.controller.ts`: passar `file.buffer`
  (já disponível — `multer.memoryStorage`) em vez de `publicUrl`. O `relPath`
  continua sendo gravado no banco para exibição; `publicUrl` deixa de ser usado no
  envio.

**Retrocompatível:** demais callers (`messages.service.ts`) continuam passando
string; a assinatura ampliada aceita ambos.

## 2. Evento `message_unavailable` — placeholder no timeline

**Problema:** mensagem que chega sem corpo (placeholder indisponível / precisa
reenvio) é descartada silenciosamente (`zapo.ts:193`). O atendente não sabe que
algo chegou.

**Mudança:** registrar `client.on('message_unavailable', …)` em `zapo.ts`. Ao
receber, resolver o contato pelo telefone (`remoteJidAlt || remoteJid`), e **se
houver um ticket ativo** (`BOT`/`QUEUE`/`OPEN`) para esse contato, inserir uma
mensagem de sistema:

> ⚠️ Mensagem recebida mas indisponível (não pôde ser exibida). Aguardando
> reenvio pelo WhatsApp.

Regras:
- Ignorar `fromMe`, grupos e broadcast.
- Deduplicar por `unavail:<key.id>` no cache `processedMessageIds` existente.
- **Não** criar ticket a partir de um evento sem conteúdo — se não há ticket
  ativo, apenas loga. O reenvio, quando vier, cria/abre o ticket normalmente.

API verificada: evento `message_unavailable` com `key: WaIncomingMessageKey`
(`src/client/types.ts:1323` e `:889`). Placeholder via
`MessagesService.createSystemMessage(ticketId, body)` (`messages.service.ts:566`),
que já emite `message:new` e é renderizado como bolha de sistema.

## Testes

- `tsc --noEmit` no backend (arquivos alterados sem erro).
- Smoke manual: enviar imagem e documento (com/sem legenda); reagir a uma
  mensagem antiga após reiniciar o backend; observar o placeholder quando o
  WhatsApp sinalizar mensagem indisponível.
- e2e completo depende de sessão real conectada — validação manual pelo operador.
