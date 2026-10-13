# Filtro "Ativos" na lista de atendimentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar task a task. Steps usam checkbox (`- [ ]`).

**Goal:** Tornar "Ativos" (OPEN+QUEUE+BOT) o filtro padrão da lista de atendimentos, buscando por status no backend para não esconder ativos além dos 50 mais recentes.

**Architecture:** Backend `findAll` ganha o valor especial `status='ACTIVE'` → `where.status = { in: [OPEN,QUEUE,BOT] }`. Frontend passa a buscar por status ao montar e ao trocar o filtro, e mantém um filtro client-side equivalente para refletir mudanças via socket.

**Tech Stack:** Node/TS + Express + Prisma (backend); React + Zustand (frontend).

## Global Constraints
- Sem testes automatizados — verificar com `npx tsc --noEmit` (backend e frontend) + QA manual.
- Backend roda `ts-node-dev --transpile-only`; frontend Vite com HMR (não requer restart).
- Não reiniciar o backend sem necessidade (sessão WhatsApp).

---

### Task 1: Backend aceita `status='ACTIVE'`

**Files:**
- Modify: `backend/src/modules/tickets/tickets.service.ts` (método `findAll`)

**Interfaces:**
- Produces: `GET /tickets?status=ACTIVE` → tickets com `status ∈ {OPEN, QUEUE, BOT}`.

- [ ] **Step 1: Ajustar a montagem do `where`**

No `findAll`, localizar:
```ts
        const where: any = {};
        if (status) where.status = status;
        if (departmentId) where.departmentId = departmentId;
```
Substituir por:
```ts
        const where: any = {};
        if (status === 'ACTIVE') where.status = { in: ['OPEN', 'QUEUE', 'BOT'] };
        else if (status) where.status = status;
        if (departmentId) where.departmentId = departmentId;
```

- [ ] **Step 2: Type-check backend**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros novos (apenas os 3 pré-existentes de `whatsapp.ts`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/tickets/tickets.service.ts
git commit -m "feat(tickets): findAll aceita status=ACTIVE (OPEN+QUEUE+BOT)"
```

---

### Task 2: Frontend — dropdown "Ativos" padrão + busca por status

**Files:**
- Modify: `frontend/src/pages/Chat.tsx`

**Interfaces:**
- Consumes: `GET /tickets?status=ACTIVE` (Task 1); `fetchTickets(filters)` do store (já monta querystring).

- [ ] **Step 1: Default do filtro = ACTIVE**

Localizar:
```tsx
    const [statusFilter, setStatusFilter] = useState('');
```
Substituir por:
```tsx
    const [statusFilter, setStatusFilter] = useState('ACTIVE');
```

- [ ] **Step 2: Buscar no backend ao montar e ao trocar o filtro**

Localizar a chamada única de carga inicial (por volta de `Chat.tsx:515`):
```tsx
        fetchTickets();
```
Substituir por:
```tsx
        fetchTickets(statusFilter ? { status: statusFilter } : {});
```
E garantir que o efeito reaja a `statusFilter`: no array de dependências desse `useEffect`, incluir `statusFilter`. (Se o `useEffect` atual tiver deps `[]`, trocar para `[statusFilter]`; se já tiver outras deps, adicionar `statusFilter`.)

- [ ] **Step 3: Novo dropdown com "Ativos" e "Todos"**

Localizar:
```tsx
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrar por status" className="w-[100px] text-xs" style={{ padding: '8px' }}>
                            <option value="">Todos</option>
                            <option value="OPEN">Abertos</option>
                            <option value="QUEUE">Fila</option>
                            <option value="BOT">Bot</option>
                            <option value="CLOSED">Fechados</option>
                        </select>
```
Substituir por:
```tsx
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrar por status" className="w-[100px] text-xs" style={{ padding: '8px' }}>
                            <option value="ACTIVE">Ativos</option>
                            <option value="OPEN">Abertos</option>
                            <option value="QUEUE">Fila</option>
                            <option value="BOT">Bot</option>
                            <option value="CLOSED">Fechados</option>
                            <option value="">Todos</option>
                        </select>
```

- [ ] **Step 4: Filtro client-side equivalente (reforço p/ socket)**

Localizar em `filteredTickets`:
```tsx
        if (statusFilter && t.status !== statusFilter) return false;
```
Substituir por:
```tsx
        if (statusFilter === 'ACTIVE') {
            if (!['OPEN', 'QUEUE', 'BOT'].includes(t.status)) return false;
        } else if (statusFilter && t.status !== statusFilter) return false;
```

- [ ] **Step 5: Type-check frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Chat.tsx
git commit -m "feat(chat): filtro Ativos como padrão (busca no backend)"
```

---

## Self-Review
- **Spec coverage:** backend ACTIVE → Task 1; default ACTIVE + dropdown + refetch por status + filtro client-side equivalente → Task 2. ✓
- **Placeholder scan:** sem TODO/TBD; todo passo tem código concreto. O único condicional ("se o useEffect tiver deps []") é instrução de aplicação exata sobre o código existente, não placeholder.
- **Type consistency:** `status='ACTIVE'`, `['OPEN','QUEUE','BOT']`, `fetchTickets(filters)` — consistentes entre tasks e com o código existente.

## Verificação final (QA manual)
- Tela abre em "Ativos": sem fechados; com OPEN/QUEUE/BOT.
- "Fechados" → só CLOSED; "Todos" → tudo (backend).
- Fechar atendimento com "Ativos": some da lista na hora (socket + filtro client-side).
