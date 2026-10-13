# Spec — Provisionamento do setor "Dívida Ativa" (tenant Prefeitura Municipal)

**Data:** 2026-06-29
**Status:** Aprovado para implementação
**Autor:** Igor (via Claude Code)

## Objetivo

Limpar o banco de dados de desenvolvimento (`backend/prisma/dev.db`) preservando
apenas os usuários administradores, criar o setor **Dívida Ativa** no tenant da
Prefeitura Municipal e cadastrar três usuários nesse setor, enviando a cada um o
e-mail de boas-vindas com as credenciais via SMTP.

## Contexto do banco (estado real verificado em 2026-06-29)

- **Tenant alvo ("MAFRA") =** `default-tenant`, nome "Prefeitura Municipal"
  (`businessNiche = public_sector`). É onde vivem os e-mails `@mafra.sc.gov.br`.
- O tenant `master-tenant` ("Platform Master") hospeda apenas o super admin e
  **não é tocado**.
- **Setor "Dívida Ativa" não existe.** Setores atuais: Suporte, Vendas, Financeiro.
- **Usuários atuais (6):**
  | Email | Role | Tenant | Destino |
  |---|---|---|---|
  | superadmin@platform.local | ADMIN (super) | Platform Master | **preservar** |
  | admin@whatsapp-saas.com | ADMIN | Prefeitura Municipal | **preservar** |
  | ti@mafra.sc.gov.br | ADMIN | Prefeitura Municipal | **preservar** |
  | igor.rend@mafra.sc.gov.br | AGENT | Prefeitura Municipal | **apagar** |
  | atendente1@whatsapp-saas.com | AGENT | Prefeitura Municipal | **apagar** |
  | atendente2@whatsapp-saas.com | AGENT | Prefeitura Municipal | **apagar** |

## Decisões aprovadas

1. "Tenant MAFRA" = `default-tenant` (Prefeitura Municipal). Não criar tenant novo.
2. Escopo da limpeza = **dados operacionais + usuários AGENT**. Preservar tenants,
   setores, `account_settings`, bot flows e os 3 admins (`role = ADMIN`).
3. Admins a preservar = os 3 usuários com `role = ADMIN`. Os AGENT são apagados.
4. Role dos 3 novos usuários = **AGENT** (funcionários do setor).
5. Fazer backup do `dev.db` antes da limpeza.
6. Limpar os arquivos de sessão do WhatsApp (`prisma/zapo_sessions/*.sqlite`).

## Arquitetura

Script único, executado uma vez:

- **Arquivo:** `backend/prisma/provision-divida-ativa.ts`
- **Execução:** `npx ts-node prisma/provision-divida-ativa.ts` (a partir de `backend/`),
  seguindo o padrão de `seed.ts` e `clean-db.ts`.
- **Dependências reaproveitadas:**
  - `PrismaClient` (instância local, como em `seed.ts`/`clean-db.ts`).
  - `sendWelcomeEmail` de `backend/src/lib/mailer.ts` (importação livre de
    efeitos colaterais — só cria o transporter; não conecta até `sendMail`).
  - `bcryptjs` (custo 12) e `crypto` para gerar a senha, replicando a lógica de
    `UsersService.generateRandomPassword` / `UsersService.create`.
  - **Não** importar `UsersService` diretamente: ele faz `import { prisma } from
    '../../server'`, o que subiria a aplicação (server `listen`).

## Fluxo de dados (passos, em ordem)

1. **Backup:** copiar `backend/prisma/dev.db` → `dev.db.bak-<timestamp ISO>`.
   Abortar se a cópia falhar.
2. **Resolver tenant:** `prisma.tenant.findUnique({ where: { id: 'default-tenant' } })`.
   Se não existir, abortar com erro claro (nenhum delete executado).
3. **Limpeza** — `prisma.$transaction` com deletes em ordem segura de FK:
   1. `ticket_tags`
   2. `messages`
   3. `tickets`
   4. `nps_ratings`
   5. `contact_merge_logs`
   6. `web_widget_sessions`
   7. `contacts`
   8. `whatsapp_connections`
   9. `internal_read_receipts`
   10. `internal_messages`
   11. `internal_participants`
   12. `internal_rooms`
   13. `audit_logs`
   14. usuários AGENT: `deleteMany({ where: { role: 'AGENT', isSuperAdmin: false } })`
       (as linhas `user_departments` caem por `onDelete: Cascade`).
   Após o commit da transação, apagar os arquivos
   `backend/prisma/zapo_sessions/*.sqlite` e `*.sqlite-journal` (fora da transação,
   I/O de arquivo), como faz o `clean-db.ts`.
   **Não tocar:** `tenants`, `departments`, `user_departments` dos admins,
   `account_settings`, `bot_flows`, `hsm_templates`, `quick_replies`, `tags`,
   `kanban_boards`, `kanban_columns`, `web_widgets`, `password_reset_tokens`,
   e os usuários `role = ADMIN`.
4. **Garantir o setor "Dívida Ativa":**
   `findFirst({ where: { tenantId, name: 'Dívida Ativa' } })`; se não existir,
   `create`. Setores existentes permanecem intactos.
5. **Cadastrar os 3 usuários** (iterando sobre uma lista fixa), cada um:
   - Se o e-mail já existir (`findUnique` por `email`, que é `@unique` global),
     **pular a criação** e registrar aviso (rerun idempotente).
   - Gerar senha aleatória de 12 caracteres.
   - `bcrypt.hash(senha, 12)`.
   - `prisma.user.create` com `role: 'AGENT'`, `tenantId`, e
     `departments: { create: [{ departmentId: <Dívida Ativa> }] }`.
   - `sendWelcomeEmail(email, nome, senhaCrua, true)` dentro de try/catch —
     falha de envio é logada e **não aborta** o restante; registrar sucesso/falha
     e `messageId`.

   Lista de usuários:
   | Nome | E-mail |
   |---|---|
   | Angelita Soares | angelita.soares@mafra.sc.gov.br |
   | Gustavo da Silva Macedo | gustavo.macedo@mafra.sc.gov.br |
   | Dalmir Frare | dalmir.frare@mafra.sc.gov.br |
6. **Resumo no console:** para cada usuário, e-mail + senha gerada + status do
   envio (`messageId` ou erro).

## Tratamento de erros

- **Tenant ausente:** aborta antes de qualquer delete.
- **Falha no backup:** aborta antes de qualquer delete.
- **E-mail já cadastrado:** pula a criação daquele usuário, segue os demais.
- **Falha no envio SMTP:** capturada por usuário, logada, não interrompe o script
  (o usuário já foi criado no banco; o e-mail pode ser reenviado depois).
- **Falha na transação de limpeza:** rollback automático do `$transaction`; o
  backup permanece disponível.

## Verificação (após execução)

Consultas de confirmação no `dev.db`:

- Os 3 novos usuários existem, `role = AGENT`, `tenantId = default-tenant`, e cada
  um vinculado ao setor "Dívida Ativa" em `user_departments`.
- Os usuários AGENT antigos (`igor.rend`, `atendente1`, `atendente2`) não existem.
- Os 3 admins continuam presentes.
- `contacts`, `tickets`, `messages`, `audit_logs` zerados.
- Console exibiu `messageId` (ou erro tratado) para cada um dos 3 envios.

## Riscos e mitigações

- **Envio de e-mails reais** para endereços `@mafra.sc.gov.br` — ação externa
  irreversível. Mitigação: lista de destinatários fixa e revisada neste spec.
- **Deletes destrutivos** no `dev.db` (versionado em git conforme `README.md`).
  Mitigação: backup `dev.db.bak-<timestamp>` no passo 1 + `$transaction`.

## Fora de escopo

- Criar/alterar tenants além do `default-tenant`.
- Apagar setores existentes (Suporte/Vendas/Financeiro), bot flows ou settings.
- Alterar o `UsersService` ou rotas HTTP da aplicação.
- Reaproveitar o script como rotina recorrente (é one-off).
