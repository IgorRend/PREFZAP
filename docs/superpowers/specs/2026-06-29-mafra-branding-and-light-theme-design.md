# Spec — Logo do Mafra em todos os locais + Tema claro

**Data:** 2026-06-29
**Status:** Aprovado para implementação
**Autor:** Igor (via Claude Code)

Duas features de aparência para o tenant Mafra (Prefeitura Municipal):
1. Exibir o brasão da Prefeitura em todos os locais aplicáveis (hoje há um ⚡).
2. Habilitar a troca para o tema claro, com botão no canto superior direito ao
   lado do ícone de notificação.

## Contexto verificado

- O ⚡ é um `<svg>` (raio) no cabeçalho do Sidebar (`frontend/src/components/Layout.tsx`,
  ≈ linhas 125-136), dentro de um quadrado com gradiente emerald, ao lado de
  "Atende Mafra".
- O brasão já está disponível em `frontend/public/brasao.png` e
  `frontend/public/brasao-favicon.png`. A tela de **Login já usa** `/brasao.png`.
- `tenant.logoUrl` está vazio no banco; o app não é data-driven para logo (hardcoded).
- Existe `frontend/src/contexts/ThemeContext.tsx` funcional: estados
  `light | dark | system`, persiste em `localStorage` (`saas_theme`), seta
  `data-theme` e alterna a classe `.dark` no `<html>`. O controle de tema hoje está
  escondido no dropdown do usuário (`TopBar.tsx`, `cycleTheme`).
- **`index.css` não define nenhum tema claro.** Há três camadas de tokens, todas
  escuras: escala fixa zinc/emerald (`--z-*`, `--em-*`); semânticos shadcn em oklch
  (`--background`, `--card`, …) no `:root`; e extensões (`--text-primary`,
  `--bg-secondary`, …) que mapeiam papéis para a escala zinc. Há ainda muitos
  `rgba(255,255,255,…)` (bordas/glass/scrollbar/hover) que presumem fundo escuro.
  Logo, alternar para "claro" hoje produz UI quebrada — o tema claro precisa ser
  construído.

## Decisões aprovadas

1. **Logo:** brasão direto (não data-driven), com componente reutilizável.
2. **Tema claro:** construir o tema claro completo e expor o toggle ao lado do sino.
3. **Sidebar permanece escura** nos dois temas (padrão premium sidebar-escura +
   conteúdo-claro; respeita "dark as identity" do PRODUCT.md; reduz a auditoria).

## Feature 1 — Logo

### Componente
`frontend/src/components/BrandLogo.tsx`: renderiza `<img src="/brasao.png"
alt="Brasão de Mafra">` com `size` parametrizável e prop opcional `withWordmark`
para exibir "Atende Mafra" + subtítulo ao lado. Ponto único de troca futura.

### Aplicações
- **Sidebar** (`Layout.tsx`): substituir o bloco `<svg>` do raio pelo brasão (dentro
  do contêiner arredondado existente). No modo recolhido, mostrar só o brasão.
- **Login** (`Login.tsx`): já usa `/brasao.png`; trocar pelo `BrandLogo` por
  consistência (sem mudança visual).
- **Favicon/aba** (`frontend/index.html`): garantir `<link rel="icon">` apontando
  para `/brasao-favicon.png` e `<title>` = "Atende Mafra".

### Fora de escopo (opcional, registrado)
- E-mail de boas-vindas (`backend/src/lib/mailer.ts`) usa ⚡. Troca pelo brasão pode
  ser feita depois; é canal de e-mail, não "canto superior esquerdo" do app.

## Feature 2 — Tema claro

### Mecanismo
O `ThemeContext` já seta `data-theme="light"`. O tema claro é ancorado num bloco
`[data-theme="light"] { … }` no `index.css`, sobrescrevendo os tokens. O padrão
(`:root`, e `data-theme="dark"`) continua escuro — dark é o default; nenhuma
mudança no comportamento atual do escuro.

### Tokens sobrescritos em `[data-theme="light"]`
- **Semânticos shadcn:** `--background`, `--foreground`, `--card`,
  `--card-foreground`, `--popover`, `--popover-foreground`, `--secondary`,
  `--secondary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--input`,
  `--ring`. O **accent/primary emerald é mantido**.
- **`--sidebar*`:** permanecem escuros (sidebar escura nos dois temas).
- **Extensões:** `--text-primary` → zinc escuro (ex.: `var(--z-900)`),
  `--text-secondary` → `var(--z-500)`, `--bg-secondary` → claro (ex.: `#f4f4f5`),
  `--bg-tertiary`, `--bg-hover` → `rgba(0,0,0,0.04)`, `--bg-chat` → claro, bolhas de
  chat (`--bg-bubble-incoming`, `-bot`) em tons claros.
- **Bordas/glass/shadow:** `--border*` de `rgba(255,255,255,…)` para
  `rgba(0,0,0,…)`; `--glass-*` para vidro claro; sombras mais suaves.
- Ajustes pontuais em utilitários que presumem fundo escuro quando aparecem no
  conteúdo claro (scrollbar thumb, `.skeleton`, `.bubble-in/system`).

### Toggle no TopBar
Adicionar um botão de ícone de tema no cluster direito de `TopBar.tsx`,
**imediatamente à esquerda do `<Bell>`**, reusando `cycleTheme` e `ThemeIcon`
(Sol/Lua/Monitor) já existentes no componente. Acessível (`aria-label`,
`title` com o tema atual). O item de tema no dropdown do usuário é mantido.

### Auditoria (o grosso do trabalho)
Varrer os componentes da **área de conteúdo** (não a sidebar) por cor escura
hardcoded — `text-white`, `rgba(255,255,255,…)`, hex fixos, `var(--z-*)` usados como
texto/bg — e trocar por tokens semânticos/extensões para que respondam ao tema.
Prioridade pelas telas mais visíveis: TopBar, Dashboard, Chat (lista + área +
bolhas + composer), modais/dropdowns, Settings. Iterativo, por tela.

## Riscos

- Superfície grande: exige QA visual por tela; abordagem iterativa.
- Dois sistemas de tokens em paralelo: componentes presos a `--z-*` fixo não trocam
  sozinhos — corrigir via extensões ou ajuste pontual.
- Contraste: validar legibilidade do emerald e dos textos secundários sobre fundo
  claro.

## Verificação

1. Sidebar e Login exibem o brasão; aba do navegador com o brasão e título correto.
2. Botão de tema aparece ao lado do sino e alterna Sol/Lua/Monitor.
3. Em "claro": Dashboard, Chat, Settings, modais e dropdowns ficam legíveis e
   coerentes; a sidebar permanece escura de propósito.
4. Em "escuro": nenhuma regressão (visual idêntico ao atual).
5. A preferência persiste após recarregar (localStorage).

## Fora de escopo

- Logo data-driven por `tenant.logoUrl` (mantido hardcoded no brasão).
- Sidebar clara (decisão: permanece escura).
- Re-tematização do e-mail de boas-vindas.
