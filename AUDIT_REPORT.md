# HONEST BOOST — AUDITORIA COMPLETA DO CÓDIGO

**Data:** 07/09/2026
**Escopo:** Todo o repositório (server.js, stats-server.js, desktop/main.js, desktop/index.html, desktop/styles.css, desktop/preload.js, src/*)

---

## 1. CLASSIFICAÇÃO DAS OTIMIZAÇÕES EXISTENTES

### PLACEBO (REMOVER)
| Função | Motivo |
|--------|--------|
| `setPollingRate()` | Apenas chama `disableMouseAcceleration()`. Não altera polling rate de hardware. |
| `setMouseThreshold()` | Duplicado de parte da `disableMouseAcceleration()`. |
| `disableQoSThrottling()` | Windows NÃO limita banda por default desde XP SP2. Registry é placebo. |
| `optimizeCPUScheduler()` | `Win32PrioritySeparation=38` não tem evidência de ganho para gaming. |
| `cleanStandbyMemory()` | `[System.GC]::Collect()` em PowerShell não limpa standby list do Windows. |
| `setGPUMaxPerformance()` | Registry `nvlddmkm\Global\NVTweak\PowerMode` não é documentado e não funciona. |
| `optimizeNetwork()` | `timestamps=disabled` pode causar problemas de performance em conexões modernas. |
| `setDNSCloudflare()` | Assume adaptador "Ethernet" — falha em Wi-Fi, adaptadores com nomes diferentes. |
| `disableCoreParking()` | Windows 10/11 já gerencia core parking eficientemente. |
| `pauseWindowsUpdates()` | Não pausa updates de verdade — registry ignorado pelo Windows Update moderno. |
| `setMonitorRefreshRate()` | Pode causar black screen se o modo não for suportado. |

### BENEFÍCIO COMPROVADO (MANTER)
| Função | Evidência |
|--------|-----------|
| `disableMouseAcceleration()` | Movimento 1:1 melhora consistência em FPS. |
| `setHighPerformancePowerPlan()` | Previne throttling de CPU. |
| `disableGameDVR()` | Remove overhead de gravação em background. |
| `optimizeVisualEffects()` | Reduz uso de GPU/CPU com animações. |
| `disableFullscreenOptimizations()` | Reduz input lag em alguns cenários. |
| `disableTelemetry()` | Reduz background activity. |

### POTENCIALMENTE PREJUDICIAL (REMOVER)
| Função | Risco |
|--------|-------|
| `killGamingProcesses()` | Mata Steam, Discord, OneDrive sem confirmação. Pode causar perda de dados. |
| `cleanTempFiles()` | Deleta Prefetch (prejudicial para boot), SoftwareDistribution\Download. |
| `disableStartupApps()` | Deleta registry sem backup adequado. |
| `disableUnnecessaryServices()` | Para serviços sem verificar dependências. |

---

## 2. VULNERABILIDADES DE SEGURANÇA

### CRÍTICO
1. **Command Injection em regAdd/regQuery/regDelete** — pathName e valueName são interpolados diretamente em shell commands sem sanitização.
2. **Command Injection em run()** — Todas as funções usam `exec()` com string interpolation.
3. **Sem validação de admin** — Operações que exigem admin falham silenciosamente sem solicitar UAC.
4. **Hardcoded localhost:3000** — Desktop sempre tenta conectar em localhost:3000.

### ALTO
5. **Stats server com baseline falso** — `GLOBAL_BASELINE = 10000` é desonesto.
6. **Sem checkout real** — `/api/create-checkout-session` retorna 503.
7. **CORS aberto** — `app.use(cors())` no stats server permite qualquer origem.
8. **Sem rate limiting no stats server** — Além do optLimiter, não há proteção global.

### MÉDIO
9. **CSRF não implementado** — Middleware existe mas não é usado nas rotas.
10. **License key em localStorage** — Dados sensíveis em localStorage.
11. **Sem validação de integridade** — Auto-updater não verifica assinatura.

---

## 3. PROBLEMAS DE ARQUITETURA

1. **Monolito** — `desktop/main.js` tem 1006 linhas com todas as otimizações, IPC handlers, window creation.
2. **Duplicação** — `setMouseThreshold` e `disableMouseAcceleration` fazem a mesma coisa.
3. **Sem testes** — Zero cobertura de testes.
4. **Fake stats** — Contador começa em 10.000 para parecer popular.
5. **Sem modularidade** — Impossível adicionar novos jogos/otimizações sem reescrever.

---

## 4. PLANO DE AÇÃO

### FASE 0 ✅ Auditoria completa
### FASE 1 — Correções Críticas (P0)
- [ ] Criar módulo de registry seguro (sem command injection)
- [ ] Criar módulo de processes seguro (sem taskkill /F)
- [ ] Remover placebo
- [ ] Adicionar verificação de admin/UAC
- [ ] Corrigir stats server (remover baseline falso)
- [ ] Corrigir CORS

### FASE 2 — Core Modular
- [ ] System Analyzer
- [ ] Recommendation Engine
- [ ] Optimization Engine
- [ ] Rollback Engine

### FASE 3 — Benchmark
- [ ] Baseline/After comparison
- [ ] FPS/FrameTime telemetry

### FASE 4 — Gaming
- [ ] Game Detection
- [ ] Game Profiles
- [ ] Gaming Mode seguro

### FASE 5 — Produto
- [ ] Dashboard
- [ ] History
- [ ] Performance Score

### FASE 6 — Monetização
- [ ] Checkout real
- [ ] Webhook
- [ ] Licensing

### FASE 7 — Security Hardening
### FASE 8 — UX/UI Polish
### FASE 9 — Testes
