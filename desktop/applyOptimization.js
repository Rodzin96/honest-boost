// applyOptimization.js — Windows Node script (requires node >=16). Usage: node applyOptimization.js --id=telemetry-disable --dry
const {exec} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LOCAL_DB = path.join(__dirname,'optimizations-local.json'); // simple local storage

function ensureClientId(){
  const idFile = path.join(os.homedir(),'.honestboost-clientid');
  if(fs.existsSync(idFile)) return fs.readFileSync(idFile,'utf8').trim();
  const id = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(idFile,id,{mode:0o600});
  return id;
}

function localRecord(opt){
  let arr = [];
  if(fs.existsSync(LOCAL_DB)) try{ arr = JSON.parse(fs.readFileSync(LOCAL_DB,'utf8')) }catch(e){}
  if(arr.find(x=>x.id===opt.id)) return false;
  arr.push(opt);
  fs.writeFileSync(LOCAL_DB,JSON.stringify(arr,null,2));
  return true;
}

function applyWindowsTweak(cmd, dry){
  return new Promise((res)=>{
    if(dry) return res({ok:true,stdout:'dry-run'});
    exec(cmd,{windowsHide:true}, (err,stdout,stderr)=>{
      if(err) return res({ok:false,err:stderr||err.message});
      return res({ok:true,stdout});
    });
  });
}

async function registerRemote(opt,server='http://localhost:3001', apiKey){
  try{
    const headers = {'content-type':'application/json'};
    if(apiKey) headers['x-api-key'] = apiKey;
    const resp = await fetch(`${server}/api/optimizations`,{
      method:'POST',headers,body:JSON.stringify(opt)
    });
    return await resp.json();
  }catch(e){ return {error:'network'} }
}

// main
(async function(){
  const args = Object.fromEntries(process.argv.slice(2).map(s=>s.split('=')));
  const dry = Boolean(args['--dry'] || args['dry']);
  const optKey = args['--id'] || 'telemetry-disable';
  const clientId = ensureClientId();
  const opt = {
    id: crypto.createHash('sha256').update(clientId+':'+optKey).digest('hex').slice(0,32),
    name: optKey,
    game: 'system',
    category: 'privacy',
    version: '1.0.0',
    applied_by: clientId
  };

  // 1) apply tweak (example: disable telemetry via registry) — safe: use dry-run by default
  // Actual command (uncomment to run for real): powershell Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection" -Name "AllowTelemetry" -Value 0 -Type DWord -Force
  const psCmd = `powershell -Command "Write-Output 'Simulated tweak: ${opt.name}'"`;
  const res = await applyWindowsTweak(psCmd, dry);
  if(!res.ok){ console.error('Apply failed',res.err); process.exit(1) }

  // 2) local record (idempotent)
  const recorded = localRecord({...opt,applied_at: new Date().toISOString()});
  console.log(recorded ? 'Local record created' : 'Already recorded locally');

  // 3) remote register (idempotent by id)
  const apiKey = args['--key'] || process.env.STATS_API_KEY || '';
  const remote = await registerRemote(opt, process.env.STATS_SERVER_URL || 'http://localhost:3001', apiKey);
  console.log('Remote response:',remote);

})();
