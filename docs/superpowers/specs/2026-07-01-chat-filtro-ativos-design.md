# Design — Filtro "Ativos" na lista de atendimentos

**Data:** 2026-07-01
**Status:** Aprovado (design)

## Problema
Na tela de atendimentos (`frontend/src/pages/Chat.tsx`), o filtro padrão "Todos"
mostra tudo, inclusive tickets **CLOSED** e **PENDING_NPS**, poluindo a lista. Além
disso, a lista **não tem paginação/scroll infinito**: `fetchTickets()` traz só os 50
tickets mais recentes por `updatedAt` e o filtro é client-side. Tickets fechados
recentemente sobem no topo e podem empurrar atendimentos ativos para fora dos 50 —
então filtrar só no cliente esconderia ativos.

## Objetivo
Filtro principal **"Ativos"** (padrão) = `OPEN` + `QUEUE` + `BOT` (em atendimento, na
fila, no bot). Exclui `CLOSED` e `PENDING_NPS`. Buscar por status no **backend** para
que os 50 slots sejam usados pelos ativos.

## Contexto atual
- `TicketsService.findAll` (`backend/src/modules/tickets/tickets.service.ts`) aceita
  `filters.status` (string única) → `where.status = status`. `PAGE_SIZE = 50`,
  `orderBy: { updatedAt: 'desc' }`.
- Controller `/tickets` repassa `req.query.status` para `findAll`.
- `ticketStore.fetchTickets(filters)` monta `URLSearchParams(filters)` e chama
  `GET /tickets?...`. Atualiza `tickets` no store; socket (`ticket:new`/`ticket:updated`)
  mantém a lista viva.
- `Chat.tsx`: `statusFilter` (default `''`), dropdown Todos/Abertos(OPEN)/Fila(QUEUE)/
  Bot(BOT)/Fechados(CLOSED); `fetchTickets()` chamado uma vez sem args; `filteredTickets`
  filtra client-side por `t.status !== statusFilter`.

## Mudanças

### Backend — `TicketsService.findAll`
Aceitar o valor especial `status = 'ACTIVE'`:

```ts
const where: any = {};
if (status === 'ACTIVE') where.status = { in: ['OPEN', 'QUEUE', 'BOT'] };
else if (status) where.status = status;
```
(demais valores single continuam funcionando; controller não muda.)

### Frontend — `Chat.tsx`
- Dropdown novo: **Ativos** (`ACTIVE`, padrão) · Abertos (`OPEN`) · Fila (`QUEUE`) ·
  Bot (`BOT`) · Fechados (`CLOSED`) · Todos (`''`).
- `statusFilter` inicia em `'ACTIVE'`.
- Buscar no backend ao montar e ao trocar o filtro: `useEffect([statusFilter])` chama
  `fetchTickets(statusFilter ? { status: statusFilter } : {})`.
- `filteredTickets` mantém equivalência client-side (reforço p/ mudanças via socket):
  - `ACTIVE` → aceita `status ∈ {OPEN, QUEUE, BOT}`.
  - valor single → `t.status === statusFilter`.
  - `''` (Todos) → sem filtro de status.

### Frontend — `ticketStore.fetchTickets`
Sem mudança estrutural: já aceita `filters` e monta querystring. Garantir que o valor
`ACTIVE` seja repassado como `status=ACTIVE`.

## Comportamento com socket
Quando um ticket muda de status (ex.: fecha → `ticket:updated`), o store atualiza o
item; o filtro client-side em `filteredTickets` o remove da lista "Ativos" na hora, sem
refetch. Ao trocar o dropdown, refetch garante a lista correta do backend.

## Fora de escopo (YAGNI)
- Paginação / scroll infinito da lista de atendimentos.
- Persistir o filtro escolhido entre sessões.
- Contadores por status no dropdown.

## Verificação (QA manual — sem testes automatizados no projeto)
- Abrir a tela: padrão "Ativos" — nenhum fechado aparece; aparecem OPEN/QUEUE/BOT.
- Selecionar "Fechados": lista só CLOSED (buscados do backend).
- Selecionar "Todos": aparece tudo.
- Fechar um atendimento com "Ativos" ativo: ele some da lista na hora (socket).
- Com muitos fechados recentes, os ativos continuam todos visíveis (backend filtra).
