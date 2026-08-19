// insert_optimizations.js — insert 3 sample optimization records into main DB
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const scriptsDir = path.join(__dirname);
const dbPath = path.join(__dirname,'..','data','database.sqlite');
if(!fs.existsSync(path.join(__dirname,'..','data'))){
  console.error('Data directory not found:', path.join(__dirname,'..','data'))
  process.exit(1);
}
const db = new sqlite3.Database(dbPath);
const now = new Date().toISOString();
const items = [
  {id:'opt_000001',name:'cpu-sched',game:'system',category:'performance',version:'1.0',applied_at:now,status:'applied'},
  {id:'opt_000002',name:'ram-standby-clean',game:'system',category:'memory',version:'1.0',applied_at:now,status:'applied'},
  {id:'opt_000003',name:'mouse-1000hz',game:'system',category:'peripheral',version:'1.0',applied_at:now,status:'applied'}
];

db.serialize(()=>{
  // Ensure table exists (schema may already create it on server boot)
  db.run(`CREATE TABLE IF NOT EXISTS optimizations (
    id TEXT PRIMARY KEY,
    name TEXT,
    game TEXT,
    category TEXT,
    description TEXT,
    version TEXT,
    status TEXT,
    applied_at TEXT
  )`);

  const stmt = db.prepare(`INSERT OR REPLACE INTO optimizations (id,name,game,category,description,version,status,applied_at) VALUES (?,?,?,?,?,?,?,?)`);
  for(const it of items){
    stmt.run(it.id,it.name,it.game,it.category,it.name+' auto',it.version,it.status,it.applied_at);
  }
  stmt.finalize((err)=>{
    if(err) console.error('Finalize error',err);
    else console.log('Inserted sample optimizations');
    db.close();
  });
});
