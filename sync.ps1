# sync.ps1 - Backup / sincronizacao do repositorio Atende Mafra
#
# Faz add + commit (mensagem com data/hora) + push da branch atual.
# Uso:
#   .\sync.ps1                      -> commit "backup: <data hora>"
#   .\sync.ps1 "minha mensagem"     -> commit com mensagem personalizada
#
# Se apontar erro de execucao, rode antes:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# Roda sempre a partir da raiz do repositorio (pasta deste script)
Set-Location -Path $PSScriptRoot

# Confirma que e um repositorio git
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] Esta pasta nao e um repositorio git." -ForegroundColor Red
    exit 1
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Write-Host "[*] Branch atual: $branch" -ForegroundColor Cyan

# Adiciona todas as mudancas
git add -A

# Ha algo para commitar?
$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pending)) {
    Write-Host "[=] Nada novo para commitar." -ForegroundColor Yellow
} else {
    if ($args.Count -gt 0 -and $args[0]) {
        $msg = [string]$args[0]
    } else {
        $msg = "backup: $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] Falha no commit (verifique hooks/estado)." -ForegroundColor Red
        exit 1
    }
    Write-Host "[+] Commit criado: $msg" -ForegroundColor Green
}

# Envia para o remoto (cria upstream se ainda nao existir)
Write-Host "[*] Enviando para o remoto..." -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) {
    Write-Host "[*] Sem upstream; configurando com 'push -u origin $branch'..." -ForegroundColor Yellow
    git push -u origin $branch
}

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Backup concluido." -ForegroundColor Green
} else {
    Write-Host "[X] Falha no push. Verifique credenciais/conexao com o GitHub." -ForegroundColor Red
    exit 1
}
