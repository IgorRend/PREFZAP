# Capturar e finalizar atendimento no estado "Bot"

**Data:** 2026-07-02

## Objetivo

Permitir que o atendente **capture** (assuma), **transfira** e **finalize** (encerre)
um atendimento enquanto ele está sendo conduzido pelo bot (`status === 'BOT'`).
Hoje um ticket em `BOT` não exibe nenhum botão de ação na interface, então o
atendente fica impossibilitado de intervir sem esperar o bot terminar.

## Contexto atual

- Estados do ticket: `BOT | QUEUE | OPEN | CLOSED`. Conversas novas começam em
  `BOT` quando há um fluxo de bot ativo (`tickets.service.ts`).
- O backend **já** suporta as ações a partir de qualquer estado:
  - `assignToUser` → status `OPEN` + agente (a ação "Assumir").
  - `closeTicket` → `CLOSED`.
  - `transferToQueue` → `QUEUE`.
- O motor do bot só age em tickets `status === 'BOT'` (`botflow.engine.ts:98`),
  portanto assumir/transferir/encerrar já interrompe o bot automaticamente.
- A lacuna é **apenas de frontend**: em `Chat.tsx` o botão "Assumir" só aparece
  em `QUEUE` e "Transferir"/"Encerrar" só em `OPEN`/`QUEUE`.

## Design

### Backend (`tickets.service.ts`)

- Ao capturar (`assignToUser`), limpar os ponteiros de fluxo `botFlowId` e
  `currentNodeId`, para que o fluxo do bot seja abandonado de forma limpa.
  Implementado via novo campo opcional `clearBotFlow` em `updateStatus`.
- `closeTicket` e `transferToQueue` não mudam (já funcionam a partir de `BOT`).

### Frontend (`Chat.tsx`)

1. **Ações no cabeçalho:** incluir `BOT` nas condições de renderização de
   `Assumir`, `Transferir` e `Encerrar` (junto de `QUEUE`/`OPEN`).
2. **Banner na conversa:** novo banner quando `status === 'BOT'`, no mesmo padrão
   do banner "Em atendimento por outro agente" (view-only), com ícone de bot,
   texto *"Este atendimento está sendo conduzido pelo bot. Assuma para responder."*
   e botões **Assumir** / **Encerrar**.
3. **Bloqueio do compositor:** enquanto `status === 'BOT'`, o compositor de
   mensagens fica oculto (mesma lógica do `isViewerOnly`). O atendente precisa
   assumir para responder — evitando que agente e bot respondam ao mesmo tempo.
   Após capturar, o ticket vira `OPEN` e o compositor reaparece.

### Fluxo de dados

- **Assumir** → `PUT /tickets/:id/assign` → `OPEN` + agente + ponteiros de fluxo
  limpos → evento socket `ticket:updated` atualiza a UI e libera o compositor.
- **Encerrar** → `PUT /tickets/:id/close` → `CLOSED`.
- **Transferir** → barra de transferência existente → `PUT /tickets/:id/transfer`.

## Testes (QA manual)

1. Ticket em `BOT` exibe o banner e os botões no cabeçalho; compositor oculto.
2. "Assumir" interrompe o bot, vira `OPEN` e libera resposta do atendente.
3. "Encerrar" fecha o atendimento a partir de `BOT`.
4. "Transferir" roteia para uma fila/departamento a partir de `BOT`.
