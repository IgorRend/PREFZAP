# Horário de atendimento — 2 períodos por dia

**Data:** 2026-07-02

## Objetivo

Permitir **2 períodos** de atendimento por dia (ex.: 08:00–12:00 e 13:00–18:00,
fechando no almoço). Hoje cada dia tem apenas um período contínuo
(`{ start, end }`).

## Decisões

- 2º período **opcional por dia** (máximo 2). Dias sem intervalo ficam com 1.
- Sem migração de banco: o campo `businessHoursJson` (string) continua; muda só o
  formato do valor de cada dia.

## Modelo de dados (retrocompatível)

Cada dia passa a ser um **array de períodos**:

```json
{ "mon": [{ "start": "08:00", "end": "12:00" }, { "start": "13:00", "end": "18:00" }] }
```

- **Leitura:** se o valor do dia vier como objeto `{start,end}` (formato antigo),
  normaliza para `[{start,end}]`. Dados existentes seguem funcionando e passam a
  ser gravados como array na próxima gravação.
- **Gravação:** array de 1 ou 2 períodos, apenas dos dias habilitados.

## Backend — `backend/src/lib/business-hours.ts`

- `BusinessHoursSchedule` passa a aceitar, por dia, `Period | Period[] | null`.
- Nova função interna `normalizePeriods(value)` → `Period[]` (objeto vira array de
  1; array segue; null/ inválido vira `[]`).
- `checkBusinessHours`: **aberto se o horário atual cair em qualquer período** do
  dia. Sem períodos válidos → fechado (comportamento atual). JSON inválido →
  aberto (comportamento atual).

## Frontend — `BusinessHoursTab` em `frontend/src/pages/Settings.tsx`

- Estado por dia: `{ enabled: boolean; periods: { start: string; end: string }[] }`.
- **Load:** parse do JSON; normaliza objeto→`[objeto]`; default `[{08:00,18:00}]`
  para dias não configurados (enabled=false).
- **UI por dia habilitado:** Período 1 (início — "até" — fim); se houver 2º,
  mostra na linha de baixo com botão **✕ remover**. Botão **"+ período"** aparece
  só quando `periods.length < 2`.
- **Save:** para cada dia habilitado, grava `periods` (descarta períodos com
  campos vazios). Se sobrar 0 período válido, o dia não entra no JSON (fechado).

## Validação

Leve: períodos com `start`/`end` vazios são descartados no save. Não há bloqueio
de sobreposição nem de `fim > início` (a checagem é "cair em qualquer período", que
não quebra com ordens/sobreposições).

## Testes

- Script no backend simulando horários: dentro do 1º período, no intervalo
  (almoço), dentro do 2º, e fora de ambos.
- Retrocompat: JSON antigo (`{day:{start,end}}`) continua abrindo corretamente.
- Smoke manual na UI: adicionar/remover 2º período, salvar, recarregar e conferir.
