@echo off
REM ============================================================
REM  WP ZAPO - Iniciar Backend + Frontend
REM  Duplo-clique neste arquivo para subir os dois servidores.
REM ============================================================

REM Pasta onde este .bat esta (raiz do projeto)
set "ROOT=%~dp0"

echo.
echo  Iniciando servidores do WP ZAPO...
echo  Backend  : http://localhost:3001
echo  Frontend : http://localhost:5173
echo.

REM Abre o BACKEND em uma nova janela
start "WP ZAPO - Backend" cmd /k "cd /d "%ROOT%backend" && npm run dev"

REM Abre o FRONTEND em uma nova janela
start "WP ZAPO - Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

REM Aguarda o Vite subir e abre o navegador
timeout /t 6 /nobreak >nul
start "" http://localhost:5173

echo  Pronto! Duas janelas foram abertas (backend e frontend).
echo  Feche este menu quando quiser.
echo.
pause
