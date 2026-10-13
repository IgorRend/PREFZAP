# Spec — Fluxo de atendimento "Dívida Ativa"

**Data:** 2026-06-29
**Status:** Aprovado para implementação
**Autor:** Igor (via Claude Code)

## Objetivo

Criar um fluxo de bot (BotFlow) que recepciona o cidadão no atendimento do setor
de Dívida Ativa, apresenta um menu em lista com quatro opções e, em cada caminho,
encaminha o atendimento para a fila do setor Dívida Ativa.

## Contexto técnico verificado (motor de BotFlow)

- **Modelo de execução:** ao executar um nó, o motor envia a mensagem do nó e grava
  `currentNodeId`. A *próxima* mensagem do usuário é avaliada contra as `conditions`
  daquele nó. Se houver condição que casa, executa a ação; se o nó não tem condição,
  segue a `edge` única; sem edge, encerra.
- **Não há captura de variável** no motor (apenas nós `httpRequest` gravam
  variáveis). Logo, "pedir nome/CPF" é modelado como: um nó que **pede** os dados +
  uma condição `matchType: 'any'` (catch-all) com `action: 'department'`. O texto que
  o cidadão digitar (nome+CPF) permanece na conversa como a primeira mensagem que o
  atendente lê ao puxar o ticket da fila.
- **Condições:** `{ id, matchType: 'specific'|'any'|'mask', values, action:
  'step'|'department'|'user'|'flow', targetId }`. `specific` casa contra o texto
  normalizado **ou** contra o `buttonId` (id da linha da lista selecionada).
- **Roteamento à fila:** `action: 'department'`, `targetId` = id do setor. O
  `routeOut` sempre envia `globalConfig.greetingMessage` antes de rotear — serve de
  confirmação "você está na fila" em todos os caminhos.
- **Lista vs botões:** 4 opções exigem `messageType: 'list'` (botões do WhatsApp são
  limitados a 3).
- **Editor visual:** `nodeTypes = { botStep: BotNode }`. Todos os nós usam
  `type: 'botStep'`; edges usam `type: 'smoothstep'`. O motor ignora o `type` de topo
  (só observa `data`).
- **Fluxo ativo:** novo ticket recebe `botFlow.findFirst({ where: { isActive: true } })`.
  Só pode haver um ativo. Hoje o `sample-flow-1` ("Fluxo Principal") está ativo.

## Identificadores

- Tenant: `default-tenant` (Prefeitura Municipal).
- Setor Dívida Ativa (department): `05730f46-e114-4824-9ed1-640a5f446f23`
  (resolvido em runtime por `findFirst({ tenantId, name: 'Dívida Ativa' })` —
  não hard-coded no script).

## Decisões aprovadas

1. Formato em **lista** (4 opções).
2. "Pedir nome/CPF" via prompt + condição catch-all → fila.
3. Todos os caminhos roteiam para o setor **Dívida Ativa**.
4. **Ativar** o novo fluxo (desativando os demais) e **remover** o `sample-flow-1`.

## Estrutura do fluxo

### Nós (`type: 'botStep'`)

1. **`menu`** — `data.isStart: true`, `data.messageType: 'list'`
   - `data.message` (corpo): saudação + instrução para tocar em "Ver opções".
   - `data.buttonText`: "Ver opções".
   - `data.listSections`: uma seção "Dívida Ativa" com 4 linhas:
     | row id | título | descrição |
     |---|---|---|
     | `opt_consultar` | Consultar débitos | Valores e situação dos débitos |
     | `opt_guia` | Emissão de guia / 2ª via | Gerar guia de pagamento |
     | `opt_protesto` | Protesto / processos judiciais | Informações sobre protesto/processos |
     | `opt_atendente` | Falar com atendente | Falar diretamente com um atendente |
   - `data.conditions`:
     - `specific` `opt_consultar,1,consultar débitos,consultar debitos` → `step` → `ask_consultar`
     - `specific` `opt_guia,2,emissão de guia,emissao de guia,2 via,2ª via,segunda via` → `step` → `ask_guia`
     - `specific` `opt_protesto,3,protesto,processos judiciais` → `step` → `ask_protesto`
     - `specific` `opt_atendente,4,falar com atendente,atendente` → `department` → setor Dívida Ativa

2. **`ask_consultar`** — texto. `message`: pede *nome completo* e *CPF/CNPJ* numa
   única mensagem. `conditions`: `[{ matchType: 'any', action: 'department',
   targetId: <setor> }]`.

3. **`ask_guia`** — texto. `message`: pede *CPF ou CNPJ do titular*.
   `conditions`: `[{ matchType: 'any', action: 'department', targetId: <setor> }]`.

4. **`ask_protesto`** — texto. `message`: pede *nome completo* e *CPF/CNPJ*.
   `conditions`: `[{ matchType: 'any', action: 'department', targetId: <setor> }]`.

### Edges (cosméticos para o editor)

`menu → ask_consultar`, `menu → ask_guia`, `menu → ask_protesto` (`type: 'smoothstep'`).
O caminho "atendente" roteia direto para o setor (sem nó), portanto sem edge. O
roteamento real é definido pelas `conditions`, não pelas edges.

### globalConfig

- `greetingMessage`: confirmação de entrada na fila do setor Dívida Ativa.
- `invalidResponseMessage`: pedido para escolher uma opção válida da lista.
- `maxRetries: 3`; `maxRetriesAction: 'route'`, `maxRetriesTargetType: 'department'`,
  `maxRetriesTargetId: <setor>` (após 3 respostas inválidas, encaminha à fila em vez
  de encerrar no vazio).
- `autoDistribute: 'BALANCE'`.

## Implementação

- **Arquivo:** `backend/prisma/create-divida-ativa-flow.ts`.
- **Execução:** `npx ts-node prisma/create-divida-ativa-flow.ts` (a partir de
  `backend/`), padrão de `seed.ts`/`clean-db.ts` (PrismaClient local + `dotenv`).
- **Passos:**
  1. Backup do `dev.db` → `dev.db.bak-<timestamp>`.
  2. Resolver tenant `default-tenant` e o setor "Dívida Ativa" (abortar se faltar
     qualquer um, sem alterar nada).
  3. Desativar todos os fluxos ativos (`updateMany({ where: { isActive: true },
     data: { isActive: false } })`).
  4. Apagar `sample-flow-1` se existir.
  5. Criar o `BotFlow` com `isActive: true`, `nodes`/`edges`/`globalConfig` como
     strings JSON, no tenant.
  6. Imprimir resumo.

## Tratamento de erros

- Tenant ou setor ausente → aborta antes de qualquer alteração.
- Falha no backup → aborta.
- Reexecução: se já existir um fluxo "Dívida Ativa", o script substitui — desativa
  os ativos, remove o sample, e cria o novo. (Idempotência prática: rodar de novo
  gera outro registro; aceitável para este one-off. Caso queira, dá para apagar um
  "Dívida Ativa" pré-existente antes de criar.)

## Verificação

- Exatamente **um** fluxo com `isActive: true`, e é o "Dívida Ativa".
- `sample-flow-1` não existe mais.
- Os 4 caminhos (3 condições `step` + 1 `department` no menu, e as 3 condições
  `any` nos nós de captura) têm `targetId` correto (nós existentes / id do setor).

## Fora de escopo

- Integração HTTP real para consultar débitos/guias (os caminhos apenas coletam
  dados e encaminham à fila humana).
- Alterações no motor de BotFlow ou no editor do frontend.
- Captura/persistência estruturada de nome/CPF em variáveis do contato.
