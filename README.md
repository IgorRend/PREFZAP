# Atende Mafra — Plataforma de Atendimento Digital

Plataforma de atendimento ao cidadão via WhatsApp da Prefeitura Municipal de Mafra.
Desenvolvida e mantida pelo setor de Tecnologia da Informação de Mafra.

## Como rodar em uma nova máquina

### 1. Clonar o repositório
```bash
git clone https://github.com/IgorRend/WPSaas.git
cd WPSaas
```

### 2. Instalar dependências (frontend e backend)
O repositório contém os *lockfiles* (`package-lock.json`), garantindo uma árvore de
dependências idêntica.
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 3. Banco de dados e variáveis de ambiente
O banco SQLite (`backend/prisma/dev.db`) **não está no `.gitignore`** e é versionado
propositalmente, para que a nova instância tenha as mesmas configurações, mensagens e
conexões locais prévias.
- Renomeie `backend/.env.example` para `backend/.env` (se ainda não estiver) e ajuste
  os segredos se necessário (a maioria já vem com padrão para desenvolvimento local).
- Não é necessário rodar `npx prisma db seed`, a menos que queira resetar o banco —
  o `dev.db` já carrega o estado anterior.

### 4. Iniciar os servidores
Abra dois terminais na raiz:
```bash
# Terminal 1 (Backend)
cd backend
npm run dev

# Terminal 2 (Frontend)
cd frontend
npm run dev
```

## Backup / sincronização

O script `sync.ps1` (raiz do projeto) faz `add` + `commit` (mensagem com data/hora)
+ `push` da branch atual, para salvar o progresso no GitHub.

```powershell
.\sync.ps1                     # commit "backup: <data hora>"
.\sync.ps1 "minha mensagem"    # commit com mensagem personalizada
```
*(Se apontar erro de execução, rode antes: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)*
