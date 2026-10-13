# Spec — Visibilidade de chats entre colegas do mesmo setor (QOL)

**Data:** 2026-06-29
**Status:** Aprovado para implementação
**Autor:** Igor (via Claude Code)

## Problema

Um atendente não consegue visualizar o chat que outro atendente está atendendo.
Ex.: Gustavo assume um chat; ele some da lista da Angelita — e permanece oculto
mesmo após finalizado.

## Causa-raiz (verificada)

No frontend `frontend/src/pages/Chat.tsx`, o memo `filteredTickets` (≈ linhas
910-923) esconde, para usuários não-admin, qualquer ticket que não seja "meu" e
que não esteja "sem dono no meu setor":

```js
const isMine = t.user?.id === user.id;
const inMyDept = t.department?.id ? agentDeptIds.includes(t.department.id) : true;
const isUnassignedInMyDept = inMyDept && !t.user;
if (!isMine && !isUnassignedInMyDept) return false;
```

Um ticket atribuído ao Gustavo tem `t.user` preenchido → `isUnassignedInMyDept`
é falso e `isMine` é falso para a Angelita → escondido. A atribuição persiste após
fechar, então o ticket CLOSED também continua oculto.

Agravante: o login e o `/me` **não retornam `departments`**, então
`(user as any).departments` é `undefined` e `agentDeptIds = []`. Hoje o escopo por
setor está degenerado — o atendente só vê os próprios tickets e tickets sem setor.

Backend (`GET /api/tickets`) já devolve todos os tickets do tenant (sem escopo por
usuário) e o socket faz broadcast para o tenant inteiro. Logo os dados já chegam ao
cliente da Angelita; estão apenas sendo filtrados no front.

## Decisões aprovadas

1. **Abrangência:** colegas do **mesmo setor** veem os chats uns dos outros, ativos
   e finalizados.
2. **Interação:** em chat ativo (OPEN) atribuído a outro atendente, o colega
   **somente visualiza**; para responder precisa **Assumir**.

## Mudanças

### 1. Backend — incluir setores no payload de autenticação

`backend/src/modules/auth/auth.service.ts`:

- `login`: incluir as relações de setor do usuário e retornar
  `departments: [{ departmentId, name }]` no objeto `user`.
- `getMe`: idem, para manter o `user` consistente ao recarregar/refresh.

Implementação: no `findUnique`/consulta do usuário, adicionar
`include: { departments: { include: { department: { select: { id: true, name: true } } } } }`
e mapear para `departments: user.departments.map(ud => ({ departmentId: ud.departmentId, name: ud.department.name }))`.

`frontend/src/store/authStore.ts`: adicionar ao `interface User`:
`departments?: { departmentId: string; name: string }[];`

Mudança aditiva — não altera assinaturas existentes nem o conteúdo do JWT.

### 2. Frontend — afrouxar o filtro de visibilidade

`frontend/src/pages/Chat.tsx`, memo `filteredTickets`, ramo não-admin:

```js
const agentDeptIds = (user.departments ?? []).map(d => d.departmentId);
const isMine = t.user?.id === user.id;
const inMyDept = t.department?.id ? agentDeptIds.includes(t.department.id) : true;
if (!isMine && !inMyDept) return false;   // remove a restrição "!t.user"
```

Resultado: o atendente vê todos os tickets dos seus setores, atribuídos a qualquer
colega, ativos e finalizados. Admin/super-admin seguem sem filtro.

### 3. Frontend — trava "somente visualizar"

`frontend/src/pages/Chat.tsx`, área de composição (o bloco gated por
`selectedTicket.status !== 'CLOSED'`, ≈ linhas 1168-1425):

- Definir `const isViewerOnly = !!selectedTicket.user
  && selectedTicket.user.id !== user?.id
  && user?.role !== 'ADMIN' && !user?.isSuperAdmin
  && selectedTicket.status === 'OPEN';`
- Quando `isViewerOnly`, renderizar no lugar do composer um banner
  `🔒 Em atendimento por {selectedTicket.user.name}` com um botão
  **"Assumir atendimento"** que chama `assignTicket(selectedTicket.id)` (reatribui
  ao usuário atual; o backend usa `req.userId` quando não há `userId` no corpo).
  Após assumir, `isViewerOnly` passa a falso e o composer aparece normalmente.
- CLOSED permanece read-only (já é hoje) — histórico visível, sem responder.

## Casos de borda

- Admin/super-admin: inalterados (veem e agem em tudo).
- Meus próprios chats: inalterados.
- QUEUE sem dono: mantém o botão "Assumir" atual.
- Ticket sem setor (`departmentId` nulo): permanece visível no "pool" geral.

## Fora de escopo (com justificativa)

- **Autorização server-side:** os endpoints de resposta/assign não checam dono e o
  backend devolve todos os tickets do tenant. A trava é UX, não segurança. Endurecer
  (escopo por setor na query + checagem de dono) é outro projeto.
- **Paginação:** mantém 50/página com filtro client-side. Em volume baixo é
  suficiente; rever quando o volume crescer.

## Verificação (manual)

1. Logar como Angelita. Gustavo assume um chat na Dívida Ativa.
2. O chat aparece na lista da Angelita (filtro "Abertos" e "Todos").
3. Abrir o chat → banner "🔒 Em atendimento por Gustavo", sem campo de resposta.
4. Clicar "Assumir atendimento" → o ticket passa para a Angelita e o composer
   libera.
5. Gustavo (ou Angelita) fecha o chat → continua visível em "Fechados", read-only.
6. Admin continua vendo e respondendo qualquer chat.
