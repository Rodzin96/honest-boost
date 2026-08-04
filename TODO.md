# TODO — Finalização do Projeto Honest Boost

## Objetivo
Corrigir bugs, completar funcionalidades pendentes do backend/frontend/desktop e deixar o projeto pronto para produção.

## Passos

### 1. Correções de Frontend (links quebrados e UX)
- [ ] `public/success.html` — link de download apontando para `/downloads/honest-boost-installer.txt` que não existe
- [ ] `public/download.html` — botão Trial apontando para `/downloads/honest-boost-installer.txt` que não existe
- [ ] `public/login.html` — botão "GitHub" aponta para `/auth/github` que não existe no backend
- [ ] `public/register.html` — placeholder/minlength "Mínimo 6 caracteres" mas backend exige mínimo 8
- [ ] `public/reset.html` — placeholder/minlength "Mínimo 6 caracteres" mas backend exige mínimo 8
- [ ] `public/index.html` — botões de compra usam `window.prompt` para email (UX fraca)

### 2. Backend (server.js)
- [ ] Atualizar `/api/download` para servir o instalador real se existir, senão placeholder
- [ ] Tratar caso de senha com 6-7 caracteres na mensagem de erro (consistência)
- [ ] Revisar backup automático (evitar backup excessivo no boot)

### 3. Desktop App (Electron) — funções placeholder
- [ ] `setPollingRate()` — implementar configuração real (não apenas `return true`)
- [ ] `setMonitorRefreshRate()` — implementar detecção/aplicação de refresh rate
- [ ] `cleanStandbyMemory()` — implementar limpeza real de RAM standby via PowerShell
- [ ] `disableFullscreenOptimizations()` — implementar (registro)
- [ ] `setHighPerformancePowerPlan()` — tratar plano não encontrado (Ultimate Performance)
- [ ] Tratar plataformas não-Windows (exibir aviso)

### 4. Infraestrutura
- [ ] `docker-compose.yml` — corrigir volume que sobrescreve `node_modules`
- [ ] `env.env` — adicionar ao `.gitignore` se não estiver (evitar expor tokens)
- [ ] Limpar backups antigos da pasta `data/backups/` (manter apenas os recentes)
- [ ] Adicionar `.gitignore` se não existir

### 5. Testes Finais
- [ ] Iniciar servidor e verificar que todas as rotas respondem 200
- [ ] Testar fluxo de compra (create-checkout-session)
- [ ] Testar login/registro/reset de senha
- [ ] Testar download protegido por login
- [ ] Testar build do Electron desktop app
- [ ] Atualizar README.md com instruções finais

## Feito (tarefas anteriores)
- [x] Redesign Material Design 3 completo
- [x] Modo claro/escuro global
- [x] Features de Mouse/Monitor no site
- [x] Backend Express com auth, licenças, Cakto checkout
- [x] Desktop app Electron (estrutura)

