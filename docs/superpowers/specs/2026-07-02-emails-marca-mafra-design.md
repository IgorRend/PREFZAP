# Redesign dos emails — boas-vindas e recuperação de senha

**Data:** 2026-07-02

## Objetivo

Substituir os emails genéricos ("WhatsApp SaaS", teal do WhatsApp, emojis) por um
visual da marca **Atende Mafra** (Prefeitura Municipal de Mafra): tema escuro +
verde do app, brasão do município, sem emojis e sem a palavra "SaaS".

## Escopo

`backend/src/lib/mailer.ts` — `sendWelcomeEmail`, `sendPasswordResetEmail`,
`sendEmail` (from/anexos) e os assuntos.

## Paleta (tema real do app)

- Fundos: `#09090b`, `#0c0c0f`, `#111113`, `#161618`, bordas `#1c1c1f`/`#2a2a2e`.
- Verde: `#10b981` (primário), `#059669` (escuro), `#34d399` (claro).
- Texto: `#f4f4f5` (título), `#a1a1aa`/`#71717a` (secundário).

## Logo do município

- Brasão embutido via **anexo CID** (`cid:brasao`) — renderiza mesmo com bloqueio
  de imagens externas (Gmail/Outlook) e não depende de host público/`FRONTEND_URL`.
- Cópia do asset em `backend/assets/brasao.png` (origem `frontend/public/brasao.png`).
- Leitura via `path.resolve(__dirname, '../../assets/brasao.png')` — resolve para
  `backend/assets` tanto em dev (`src/lib`) quanto em build (`dist/lib`).
- Degradação: se o arquivo não existir, envia sem o anexo (cabeçalho sem imagem),
  sem quebrar o envio.

## Estrutura

- Layout email-safe: largura 600px, estilos inline, **cores sólidas** (sem
  gradiente, que o Outlook desktop ignora).
- Shell compartilhado `renderEmailShell({ logo, title, contentHtml })` com
  cabeçalho (brasão + "Atende Mafra" + "Prefeitura Municipal de Mafra"), corpo e
  rodapé — elimina a duplicação atual entre os dois emails.
- **Boas-vindas:** saudação, texto, card de credenciais (e-mail + senha em bloco
  monoespaçado verde), aviso "Importante" (sem emoji), botão "Acessar plataforma".
- **Recuperação:** título, texto, botão "Redefinir senha", aviso de expiração em 1h.
- **Rodapé (institucional):** `© {ano} Prefeitura Municipal de Mafra · Atende Mafra`
  + aviso de e-mail automático. Sem crédito de fornecedor.

## From / assuntos

- `from` padrão: `Atende Mafra <SMTP_USER>` (ou `SMTP_FROM` se definido).
- Assuntos sem emoji: "Bem-vindo ao Atende Mafra" e
  "Recuperação de senha — Atende Mafra".

## Testes

- Gerar os dois HTMLs em arquivo e enviar preview para validação visual.
- `tsc --noEmit` no backend.
- Smoke: disparar uma recuperação de senha real, se possível.
