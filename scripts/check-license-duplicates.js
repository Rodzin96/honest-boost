'use strict';
/**
 * Verificação PRÉ-DEPLOY: existem licenças duplicadas por order_id?
 *
 * O src/db.js cria um índice ÚNICO em licenses(order_id). Se houver
 * duplicatas, o CREATE UNIQUE INDEX falha, a migração aborta e toda a API
 * fica em 503 (dbReady nunca vira true).
 *
 * Este script é SOMENTE LEITURA: roda SELECTs. Não cria índice, não altera
 * dado nenhum.
 *
 * Uso: node scripts/check-license-duplicates.js
 */
const fs = require('fs');
const path = require('path');

// Carrega DATABASE_URL do .env.local sem depender do dotenv.
function carregarEnv() {
  const arquivo = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(arquivo)) return;
  for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = valor;
  }
}
carregarEnv();

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  console.error('DATABASE_URL ausente ou invalida.');
  process.exit(2);
}

const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log('conectado.\n');

  // 1. Existe a tabela licenses?
  const tabela = await client.query(
    "SELECT to_regclass('public.licenses') AS existe"
  );
  if (!tabela.rows[0].existe) {
    console.log('A tabela licenses ainda NAO existe. Migracao vai cria-la do zero.');
    console.log('   -> sem risco de indice unico conflitar.');
    await client.end();
    process.exit(0);
  }

  // 2. Total e distribuicao
  const total = await client.query('SELECT COUNT(*)::int AS n FROM licenses');
  const comOrder = await client.query(
    'SELECT COUNT(*)::int AS n FROM licenses WHERE order_id IS NOT NULL'
  );
  console.log(`licenses totais        : ${total.rows[0].n}`);
  console.log(`com order_id preenchido: ${comOrder.rows[0].n}\n`);

  // 3. O check que importa: duplicatas por order_id
  const dup = await client.query(`
    SELECT order_id, COUNT(*)::int AS n
    FROM licenses
    WHERE order_id IS NOT NULL
    GROUP BY order_id
    HAVING COUNT(*) > 1
    ORDER BY n DESC
  `);

  // 4. Ja existe algum indice unico em order_id?
  const idx = await client.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'licenses' AND indexdef ILIKE '%order_id%'
  `);

  console.log('indices existentes em licenses(order_id):');
  if (!idx.rowCount) console.log('   (nenhum)');
  for (const r of idx.rows) {
    const unico = /UNIQUE/i.test(r.indexdef) ? 'UNICO' : 'comum';
    console.log(`   ${r.indexname} [${unico}]`);
  }
  console.log('');

  if (dup.rowCount === 0) {
    console.log('RESULTADO: nenhuma duplicata.');
    console.log('   -> o CREATE UNIQUE INDEX vai funcionar. DEPLOY LIBERADO.');
    await client.end();
    process.exit(0);
  }

  console.log(`RESULTADO: ${dup.rowCount} order_id com duplicata.`);
  console.log('   -> o CREATE UNIQUE INDEX VAI FALHAR e a API fica em 503.\n');
  console.log('   order_id                          | licencas');
  console.log('   ----------------------------------|---------');
  for (const r of dup.rows) {
    console.log(`   ${String(r.order_id).padEnd(33)} | ${r.n}`);
  }
  console.log('\n   Resolva antes do deploy (escolha uma):');
  console.log('   a) apagar as licencas excedentes, mantendo a mais antiga por pedido;');
  console.log('   b) manter todas e trocar o indice unico por um indice comum.');
  await client.end();
  process.exit(1);
})().catch((err) => {
  console.error('falha na verificacao:', err && err.message ? err.message : err);
  process.exit(2);
});
