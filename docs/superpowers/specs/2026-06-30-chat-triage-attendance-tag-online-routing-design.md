# Spec — Triagem de chat: tag "em atendimento", roteamento só-online, filtro "Meus"

**Data:** 2026-06-30
**Status:** Aprovado para implementação
**Autor:** Igor (via Claude Code)

Três melhorias coesas na triagem de atendimentos:
1. Tag laranja "Em atendimento" (com nome do atendente) nos tickets já assumidos.
2. Roteamento automático apenas para atendentes **online**.
3. Tornar fácil para o atendente identificar o que está aberto para ele.

## Contexto verificado

- **`Chat.tsx`** — cada card da lista exibe um `badge` de status
  (`statusLabels`: OPEN = verde "Aberto"). `filteredTickets` já calcula
  `isMine = t.user?.id === user.id`. Há um `select` de status na barra de filtros.
  O cabeçalho do chat já tem o banner read-only "Em atendimento por X" (de colegas).
- **`routing.service.ts`** — `routeToDepartment` prefere online mas **faz fallback
  para offline**: `candidates = onlineAgents.length > 0 ? onlineAgents : departmentUsers`.
  `routeToUser` só é usado no "Assumir" (o próprio atendente, online). Não há UI de
  atribuir a um usuário específico.
- **`lib/socket.ts`** — no `connection`, marca `user.online = true` e faz broadcast,
  mas **não** dispara `processQueue`.
- **Presença online** vive no campo `User.online`, atualizado pelo socket
  (connect → true, disconnect → false).

## Decisões aprovadas

1. Tag laranja **com nome** do atendente, na lista e no cabeçalho do chat.
2. Identificação do "meu": **filtro "Meus" + marcador visual** nos tickets atribuídos
   a mim.
3. Roteamento automático **somente para online**; fila quando ninguém online, com
   reprocessamento quando um atendente conecta.

## A. Tag laranja "Em atendimento"

### Lista (`Chat.tsx`, card do ticket)
Para `ticket.status === 'OPEN' && ticket.user`, renderizar uma tag laranja ao lado
do badge de status:
`Em atend.: {primeiroNome(ticket.user.name)}`.
Estilo âmbar consistente com o tema (`background: rgba(245,158,11,0.12)`,
`color: #fbbf24`, `border: 1px solid rgba(245,158,11,0.25)`), mesmo formato dos
chips existentes (ex.: o chip de SLA).

### Cabeçalho do chat
Quando `selectedTicket.status === 'OPEN' && selectedTicket.user`, exibir a mesma tag:
- atribuído ao usuário logado → **`Em atend.: Você`**;
- caso contrário → `Em atend.: {nome}`.
Complementa (não substitui) o banner read-only já existente.

Helper: `firstName(name)` = primeira palavra do nome.

## B. Filtro "Meus" + marcador

### Filtro
Adicionar um toggle **"Meus"** na barra de filtros da lista (junto ao `select` de
status). Estado `mineOnly` (boolean). Em `filteredTickets`, quando `mineOnly`, manter
apenas `t.user?.id === user?.id`. Combina com o filtro de status atual.

### Marcador
Nos cards onde `t.user?.id === user?.id`:
- **borda esmeralda à esquerda** (ex.: `box-shadow: inset 3px 0 0 var(--em-500)` ou
  `border-left: 3px solid`), e
- um chip discreto **"Você"** (estilo emerald: `var(--em-subtle)` / `var(--em-400)`).

Admins também podem usar o filtro/marcador (continuam vendo tudo).

## C. Roteamento só para atendente online

### `routeToDepartment` (`routing.service.ts`)
Trocar:
```ts
const candidates = onlineAgents.length > 0 ? onlineAgents : departmentUsers;
```
por:
```ts
const candidates = onlineAgents;
```
Se `candidates.length === 0` → mandar para a fila (`updateStatus QUEUE`) com
mensagem de sistema: **"Nenhum atendente online no momento. Ticket na fila."**
A checagem de capacidade (`maxConcurrentChats`) permanece igual.

### Reprocessar a fila quando um atendente conecta (`lib/socket.ts`)
No handler de `connection`, após marcar `online = true`, disparar (sem bloquear o
fluxo do socket) o reprocessamento das filas dos setores do atendente:
```ts
// após user.update({ online: true })
import('../modules/routing/routing.service').then(async ({ RoutingService }) => {
  const depts = await prisma.userDepartment.findMany({ where: { userId }, select: { departmentId: true } });
  for (const d of depts) RoutingService.processQueue(d.departmentId).catch(() => {});
}).catch(() => {});
```
Assim, tickets que caíram na fila por falta de online são atribuídos assim que
alguém entra. `processQueue` já existe e chama `routeToDepartment`.

### `routeToUser`
Mantido como está — usado apenas no "Assumir" (o próprio atendente, online). Não há
caminho para rotear a um usuário offline.

## Casos de borda

- OPEN sem `user` → sem tag laranja (raro, mas tratado).
- "Meus" + status combinados (ex.: Meus + Abertos).
- 0 atendentes online no roteamento → fila; ao conectar um atendente do setor → o
  ticket sai da fila.
- Admin/super-admin: inalterado; filtro/marcador também funcionam.

## Verificação

1. Ticket OPEN atribuído mostra tag laranja "Em atend.: {nome}" na lista e no header;
   para o próprio atendente, "Em atend.: Você".
2. Toggle "Meus" filtra para os tickets do usuário; cards meus têm borda esmeralda +
   chip "Você".
3. Com todos os atendentes do setor offline, um novo atendimento roteado cai na fila
   com a mensagem correta; ao logar um atendente do setor, o ticket é atribuído a ele.
4. Sem regressão no roteamento quando há atendentes online.

## Fora de escopo

- Indicador de presença na UI de transferência (não há transferência para usuário
  específico hoje).
- Mudanças no mecanismo de presença além do socket atual.
