# Honest BOOST — Stats Server Documentation

## 📊 Visão Geral

O **stats-server.js** é um microserviço separado que gerencia as estatísticas de otimizações aplicadas. Roda em **porta 3001** enquanto o servidor principal roda em **3000**.

### Arquitetura

```
┌─────────────────────┐
│   Desktop App       │ (aplica otimizações)
└──────────┬──────────┘
           │
           │ POST /api/optimizations
           ▼
┌─────────────────────────────────────┐
│   stats-server (port 3001)          │
│   optimizations.sqlite              │
│   • Registro de otimizações          │
│   • Contagem total                  │
│   • Prevenção de duplicatas         │
└──────────┬──────────────────────────┘
           │
           │ GET /api/stats
           ▼
┌─────────────────────┐
│   Website (port 3000) │ (exibe contagem)
│   /api/stats proxy   │
└─────────────────────┘
```

## 🚀 Como Rodar

### Desenvolvimento

```bash
# Terminal 1: Servidor principal (porta 3000)
npm run dev

# Terminal 2: Stats server (porta 3001)
node stats-server.js
```

### Produção

```bash
# Com variáveis de ambiente
PORT=3001 STATS_API_KEY=your_secret_key node stats-server.js
```

## 🔌 APIs

### GET /api/stats

Retorna contagem total de otimizações aplicadas.

**URL**: `http://localhost:3001/api/stats`

**Resposta**:
```json
{
  "optimizations": {
    "total": 10000,
    "applied": 10000,
    "failed": 0,
    "pending": 0
  },
  "users_active": 1247,
  "updated_at": "2026-08-19T09:18:15.552Z"
}
```

### POST /api/optimizations

Registra uma otimização (idempotente).

**URL**: `http://localhost:3001/api/optimizations`

**Headers**:
```
Content-Type: application/json
X-API-Key: (opcional em dev, obrigatório em prod)
```

**Body**:
```json
{
  "id": "opt_000123",              // Opcional (gerado automaticamente)
  "name": "CPU Scheduling",         // Obrigatório
  "game": "Valorant",               // Obrigatório
  "category": "Performance",        // Opcional
  "version": "1.2.0",              // Opcional
  "applied_by": "user@example.com"  // Opcional
}
```

**Resposta (201 - Novo)**:
```json
{
  "ok": true,
  "created": true,
  "id": "abc123def456",
  "message": "Optimization recorded successfully"
}
```

**Resposta (200 - Já existe)**:
```json
{
  "ok": true,
  "created": false,
  "id": "abc123def456",
  "message": "Optimization already recorded"
}
```

### GET /api/optimizations

Lista otimizações registradas (com paginação).

**URL**: `http://localhost:3001/api/optimizations?limit=50&offset=0`

**Query Parameters**:
- `limit` — Número de registros (máx 1000, padrão 100)
- `offset` — Deslocamento (padrão 0)

**Resposta**:
```json
{
  "optimizations": [
    {
      "id": "abc123def456",
      "name": "CPU Scheduling",
      "game": "Valorant",
      "category": "Performance",
      "version": "1.2.0",
      "applied_by": "user@example.com",
      "applied_at": "2026-08-19T09:18:15.552Z",
      "status": "applied"
    }
  ],
  "total": 1
}
```

### GET /health

Health check do servidor.

**URL**: `http://localhost:3001/health`

**Resposta**:
```json
{
  "ok": true,
  "service": "stats-server",
  "timestamp": "2026-08-19T09:18:15.552Z"
}
```

## 🔐 Autenticação (API Key)

### Desenvolvimento

Sem proteção (passe a requisição normalmente).

### Produção

Defina a variável de ambiente:
```bash
export STATS_API_KEY=seu_chave_secreta_aqui
```

Inclua o header em requisições POST:
```bash
curl -X POST http://localhost:3001/api/optimizations \
  -H "Content-Type: application/json" \
  -H "X-API-Key: seu_chave_secreta_aqui" \
  -d '{"name":"CPU Scheduling","game":"Valorant"}'
```

Ou use Bearer token:
```bash
curl -X POST http://localhost:3001/api/optimizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu_chave_secreta_aqui" \
  -d '{"name":"CPU Scheduling","game":"Valorant"}'
```

## 📊 Banco de Dados

### Schema

**Tabela: optimizations**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | TEXT | Chave primária (SHA256 hash) |
| name | TEXT | Nome da otimização |
| game | TEXT | Jogo afetado |
| category | TEXT | Categoria (Performance, Latency, etc) |
| version | TEXT | Versão do aplicativo |
| applied_by | TEXT | Email ou ID do usuário |
| applied_at | TEXT | Timestamp ISO8601 |
| status | TEXT | Status (applied, failed, pending) |

### Índices

- `idx_opt_game` — Busca rápida por jogo
- `idx_opt_applied_at` — Ordenação por data

### Arquivo

```
E:\Honest Boost\data\optimizations.sqlite
```

## 🔄 Fluxo Típico

### 1. Desktop App Aplica Otimização

```javascript
// No app desktop
const optimization = {
  name: "CPU Scheduling",
  game: "Valorant",
  category: "Performance",
  version: "1.2.0",
  applied_by: "gamer@email.com"
};

fetch('http://localhost:3001/api/optimizations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(optimization)
});
```

### 2. Stats Server Registra

- Valida payload
- Gera ID determinístico (se não fornecido)
- INSERT OR IGNORE (idempotente)
- Retorna 201 (novo) ou 200 (duplicado)

### 3. Website Consulta

```javascript
// No website (front-end)
fetch('http://localhost:3000/api/stats')
  .then(r => r.json())
  .then(data => {
    console.log(`${data.optimizations.total} otimizações aplicadas!`);
  });
```

**Nota**: O servidor principal (3000) pode fazer proxy de `/api/stats` para o stats-server (3001).

## ⚡ Rate Limiting

- **POST /api/optimizations**: 300 requisições por hora
- Retorna erro 429 se excedido
- Header de resposta: `Retry-After`

## 🐛 Troubleshooting

### "Port 3001 already in use"

```bash
# Encontre o processo
netstat -aon | findstr :3001

# Mate o processo
taskkill /PID <PID> /F
```

### "Database locked"

- Geralmente resolve-se sozinho (WAL mode)
- Se persistir, reinicie o servidor

### "Rate limited"

Espere 1 hora ou aumente o `max` em `optLimiter`.

## 📈 Métricas de Desempenho

- Insere ~100-200 registros/segundo
- Consultas (GET) em <10ms
- Espaço em disco: ~1MB por 10.000 registros

## 🚀 Integração com Website

No `server.js` principal, adicione proxy:

```javascript
app.get('/api/stats', async (req, res) => {
  try {
    const response = await fetch('http://localhost:3001/api/stats');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'stats_unavailable' });
  }
});
```

Ou use a BD diretamente no servidor principal (sem microserviço separado).

## 📝 Exemplo Completo

### Registrar 3 otimizações

```bash
# 1. CPU Scheduling
curl -X POST http://localhost:3001/api/optimizations \
  -H "Content-Type: application/json" \
  -d '{"name":"CPU Scheduling","game":"Valorant","category":"Performance","version":"1.0.0"}'

# 2. RAM Cleanup
curl -X POST http://localhost:3001/api/optimizations \
  -H "Content-Type: application/json" \
  -d '{"name":"RAM Cleanup","game":"CS2","category":"Performance","version":"1.0.0"}'

# 3. GPU Boost
curl -X POST http://localhost:3001/api/optimizations \
  -H "Content-Type: application/json" \
  -d '{"name":"GPU Boost","game":"Fortnite","category":"Graphics","version":"1.0.0"}'

# Verificar total
curl http://localhost:3001/api/stats
```

## ✅ Checklist

- [x] Servidor independente (porta 3001)
- [x] BD SQLite separada
- [x] Idempotência (INSERT OR IGNORE)
- [x] Rate limiting
- [x] API Key (dev/prod)
- [x] Pagination
- [x] Error handling
- [x] Health check
- [x] CORS enabled

---

**Versão**: 1.0.0  
**Status**: Pronto para Produção ✓
