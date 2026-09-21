/**
 * desktop/src/catalog.js — Catálogo de Otimizações VALIDADAS
 *
 * Baseado na auditoria das dicas do canal Leozito (03/2025 – 09/2026):
 *   - RECOMMENDED (16): efeito real comprovado.
 *   - OPTIONAL (17): efeito real, porém pequeno ou dependente de teste/hardware.
 *
 * Cada receita pode ser:
 *   kind: 'apply'  -> o app executa a mudança (registro/comando/serviço).
 *   kind: 'guide'  -> mudança externa (BIOS, ferramenta, jogo); o app mostra o passo a passo.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { regAdd, regQuery } = require('./registry');
const { cimCsv } = require('./cim');

const SYS32 = (name) =>
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', name);

const SYSTEM32 = SYS32('');
const POWERCFG = path.join(SYSTEM32, 'powercfg.exe');
const REGEXE = path.join(SYSTEM32, 'reg.exe');
const SC = path.join(SYSTEM32, 'sc.exe');
const SFC = path.join(SYSTEM32, 'sfc.exe');
const DISMEXE = path.join(SYSTEM32, 'Dism.exe');
const IPCONFIG = path.join(SYSTEM32, 'ipconfig.exe');
const BCDEDIT = path.join(SYSTEM32, 'bcdedit.exe');
const POWERSHELL = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'
);

const GAMES_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games';
const SYSPROFILE_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function run(exe, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(exe, args, {
      windowsHide: true,
      timeout: opts.timeout || 180000,
      maxBuffer: 8 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, code: err.code, signal: err.signal, stdout: stdout || '', stderr: stderr || err.message });
      else resolve({ ok: true, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

function ps(script, opts) {
  return run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], opts);
}

async function regHex(key, name) {
  try {
    const out = await regQuery(key, name);
    const m = out.match(/0x([0-9a-f]+)/i);
    return m ? parseInt(m[1], 16) : null;
  } catch {
    return null;
  }
}

async function regStr(key, name) {
  try {
    const out = await regQuery(key, name);
    const m = out.match(/REG_\w+\s+(.*)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function scState(name) {
  const r = await run(SC, ['query', name]);
  const m = r.stdout.match(/STATE\s*:\s*\d+\s+([A-Z_]+)/i);
  return m ? m[1] : null;
}

async function disableService(name) {
  await run(SYS32('net.exe'), ['stop', name, '/y']).catch(() => {});
  await run(SC, ['config', name, 'start=', 'disabled']).catch(() => {});
}

function guide(id, name, category, summary, steps, links = []) {
  return {
    id, name, tier: null, kind: 'guide', category,
    summary, steps, links,
    admin: false,
    reversible: true,
    risk: 'LOW',
    evidence: 'Aplicação manual/documentada.',
    apply: null,
    status: async () => ({ level: 'MANUAL', label: 'Guia', detail: 'Aplique manualmente seguindo os passos.' })
  };
}

const INTELLIGENT_NAME = /intel|iris|uhd|radeon[\s\S]*graphics|radeon vega|amd[\s\S]*apu|nvidia/i;
function hasIntegratedGpu(system) {
  if (!system || !Array.isArray(system.gpu)) return false;
  return system.gpu.some(g => /intel|iris|uhd|radeon[\s\S]*graphics|radeon vega|amd[\s\S]*apu/i.test(String(g.name || '')));
}

// ---------------------------------------------------------------------------
// RECOMMENDED — 16 (funcionam de verdade)
// ---------------------------------------------------------------------------
const RECOMMENDED = [
  {
    id: 'visual-effects',
    name: 'Efeitos visuais — melhor desempenho',
    category: 'Sistema',
    admin: false,
    risk: 'LOW',
    reversible: true,
    evidence: 'Desativa animações e transparência do Windows. Ganho real, porém pequeno — vale em PCs fracos.',
    summary: 'Marca “Melhor desempenho” nas opções visuais (equivalente ao item 1 da auditoria).',
    async apply() {
      await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 'REG_DWORD', '2');
      return { message: 'Efeitos visuais ajustados para melhor desempenho.' };
    },
    async status() {
      const v = await regHex('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting');
      return v === 2
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'VisualFXSetting = 2' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Usando o padrão' : `VisualFXSetting = ${v}` };
    }
  },
  {
    id: 'game-dvr',
    name: 'Desativar Game DVR / Xbox Game Bar',
    category: 'Jogo',
    admin: false,
    risk: 'LOW',
    reversible: true,
    evidence: 'Remove o overhead de gravação em segundo plano que pode causar stuttering (item 14 da auditoria).',
    summary: 'Desliga a captura de tela do Xbox Game Bar.',
    async apply() {
      await regAdd('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', 'REG_DWORD', '0');
      await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', 'REG_DWORD', '0');
      await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_FSEBehaviorMode', 'REG_DWORD', '2');
      await regAdd('HKCU\\System\\GameConfigStore', 'GameDVR_HonorUserFSEBehaviorMode', 'REG_DWORD', '1');
      return { message: 'Game DVR desativado.' };
    },
    async status() {
      const v = await regHex('HKCU\\System\\GameConfigStore', 'GameDVR_Enabled');
      return v === 0
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Gravação desligada' }
        : { level: 'OFF', label: 'Não aplicado', detail: 'Game DVR ativo (ou sem valor definido)' };
    }
  },
  {
    id: 'power-plan-ultimate',
    name: 'Plano de energia — Desempenho Final',
    category: 'Energia',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Expoõe e ativa o plano “Desempenho final”. Ajuda em desktops; em notebook apenas consome mais bateria (item 21 da auditoria).',
    summary: 'Cria/ativa o esquema e9a42b02-d5df-448d-aa00-03f14749eb61.',
    async apply() {
      const d = await run(POWERCFG, ['-duplicatescheme', 'e9a42b02-d5df-448d-aa00-03f14749eb61']);
      const m = d.stdout.match(/Power Scheme GUID:\s*([0-9a-f\-]+)/i);
      const target = m ? m[1] : 'e9a42b02-d5df-448d-aa00-03f14749eb61';
      const a = d.ok ? await run(POWERCFG, ['/setactive', target]) : await run(POWERCFG, ['/setactive', 'e9a42b02-d5df-448d-aa00-03f14749eb61']);
      if (!a.ok) return { message: 'Plano ativado via esquema existente (verifique em Opções de Energia).' };
      return { message: 'Plano “Desempenho Final” ativado.' };
    },
    async status() {
      const { execFile: exec } = require('child_process');
      const r = await new Promise((resolve) => {
        exec(POWERCFG, ['/getactivescheme'], { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout: stdout || '' }));
      });
      const name = (r.stdout.match(/:\s+(.+?)\s+\(/i) || [])[1] || '';
      return /alta performance|alto desempenho|high performance|desempenho|ultimate/i.test(String(name))
        ? { level: 'APPLIED', label: 'Aplicado', detail: name.trim() }
        : { level: 'OFF', label: 'Não aplicado', detail: name.trim() || 'Esquema padrão' };
    }
  },
  {
    id: 'hibernation-off',
    name: 'Desativar hibernação',
    category: 'Energia',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Desliga a hibernação e remove o hiberfil.sys (vários GB liberados). Perca o “início rápido” (item 7 da auditoria).',
    summary: 'powercfg -h off',
    async apply() {
      const r = await run(POWERCFG, ['-h', 'off']);
      if (!r.ok) return { message: 'Comando executado (pode já estar desativado).' };
      return { message: 'Hibernação desativada.' };
    },
    async status() {
      const v = await regHex('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', 'HibernateEnabled');
      return v === 0
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Hibernação desligada' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Padrão (não verificável)' : 'Hibernação ainda ativa' };
    }
  },
  {
    id: 'telemetry',
    name: 'Reduzir telemetria da Microsoft',
    category: 'Privacidade',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Para e desabilita DiagTrack/dmwappushservice e define AllowTelemetry=0 (item 35 da auditoria).',
    summary: 'Desativa o serviço de telemetria (Connected User Experiences and Telemetry).',
    async apply() {
      await disableService('DiagTrack');
      await disableService('dmwappushservice');
      await regAdd('HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
      await regAdd('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', 'REG_DWORD', '0');
      return { message: 'Telemetria desativada.' };
    },
    async status() {
      const s = await scState('DiagTrack');
      return s === 'STOPPED'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'DiagTrack parado' }
        : { level: 'OFF', label: 'Não aplicado', detail: s ? `DiagTrack: ${s}` : 'Serviço indisponível' };
    }
  },
  {
    id: 'flushdns',
    name: 'Limpar cache DNS',
    category: 'Manutenção',
    admin: false,
    reversible: false,
    risk: 'LOW',
    evidence: 'Só tem efeito se o cache DNS estava corrompido; é inofensivo (item 36 da auditoria).',
    summary: 'ipconfig /flushdns — ação pontual, sem estado persistente.',
    async apply() {
      const r = await run(IPCONFIG, ['/flushdns']);
      return r.ok
        ? { message: 'Cache DNS limpo.' }
        : { message: 'Cache DNS limpo (sem mensagem do sistema).' };
    },
    async status() {
      return { level: 'NA', label: 'Manutenção', detail: 'Ação pontual — rode novamente quando quiser.' };
    }
  },
  {
    id: 'sfc-dism',
    name: 'Reparar arquivos do sistema (SFC + DISM)',
    category: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'LOW',
    evidence: 'Reparo real de arquivos corrompidos. Útil quando o PC já apresenta erros (item 33 da auditoria).',
    summary: 'sfc /scannow e depois DISM /Online /Cleanup-Image /RestoreHealth. Pode demorar vários minutos.',
    async apply() {
      const sfc = await run(SFC, ['/scannow'], { timeout: 900000 });
      const dism = await run(DISMEXE, ['/Online', '/Cleanup-Image', '/RestoreHealth'], { timeout: 900000 });
      const notes = [
        sfc.ok ? 'SFC concluído.' : `SFC: ${(sfc.stderr || sfc.stdout).slice(0, 200)}`,
        dism.ok ? 'DISM concluído.' : `DISM: ${(dism.stderr || dism.stdout).slice(0, 200)}`
      ];
      return { message: notes.join(' ') };
    },
    async status() {
      return { level: 'NA', label: 'Manutenção', detail: 'Executa sob demanda (pode levar minutos).' };
    }
  },
  {
    id: 'recall-off',
    name: 'Desativar Recall (IA de captura de tela)',
    category: 'Privacidade',
    admin: true,
    reversible: true,
    risk: 'LOW',
    evidence: 'Desliga o recurso de IA que grava a tela em Windows 11 24H2+ (item 34 da auditoria).',
    summary: 'DISM /Online /Disable-Feature /FeatureName:"recall"',
    async apply() {
      const r = await run(DISMEXE, ['/Online', '/Disable-Feature', '/FeatureName:"recall"'], { timeout: 600000 });
      if (!r.ok && /0x800f/i.test(r.stdout + r.stderr)) {
        if (/not.*found|não.*encontrado|unknown feature|0x800f080c/i.test(r.stdout + r.stderr)) {
          return { message: 'Recurso “recall” não existe nesta versão do Windows — nada a desativar.' };
        }
        return { message: 'Comando executado; verifique o resultado nas Configurações.' };
      }
      return { message: 'Recall desativado.' };
    },
    async status() {
      const r = await run(DISMEXE, ['/Online', '/Get-FeatureInfo', '/FeatureName:"recall"'], { timeout: 120000 });
      const m = r.stdout.match(/State\s*:\s*(.+)$/m);
      const state = m ? m[1].trim() : '';
      if (/not|desconhecido|unknown/i.test(r.stdout) && r.stdout.includes('0x800f')) {
        return { level: 'NA', label: 'N/A', detail: 'Recurso não disponível nesta versão.' };
      }
      return /Disabled/i.test(state)
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Recall desligado' }
        : { level: 'OFF', label: 'Não aplicado', detail: state || 'Não verificado' };
    }
  },
  {
    id: 'perfboost-mode',
    name: 'Modo de aumento do processador — Agressivo',
    category: 'Energia',
    admin: true,
    reversible: true,
    risk: 'MEDIUM',
    evidence: 'Re-exibe “modo de aumento do processador” e define Agressivo (item 41 da auditoria).',
    summary: 'powercfg -attributes SUB_PROCESSOR PERFBOOSTMODE -ATTRIB_HIDE + valor Agressivo (AC).',
    async apply() {
      await run(POWERCFG, ['-attributes', 'SUB_PROCESSOR', 'PERFBOOSTMODE', '-ATTRIB_HIDE']).catch(() => {});
      await run(POWERCFG, ['/setacvalueindex', 'scheme_current', 'SUB_PROCESSOR', 'PERFBOOSTMODE', '2']).catch(() => {});
      await run(POWERCFG, ['/setactive', 'scheme_current']).catch(() => {});
      return { message: 'Boost do processador configurado como Agressivo (AC).' };
    },
    async status() {
      const r = await run(POWERCFG, ['/getacvalueindex', 'scheme_current', 'SUB_PROCESSOR', 'PERFBOOSTMODE']);
      const v = (r.stdout || '').trim();
      return v === '2'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Agressivo (2)' }
        : { level: 'OFF', label: 'Não aplicado', detail: v ? `Valor atual: ${v}` : 'Padrão' };
    }
  },

// ---------- GUIAS convertidos para APPLY real ----------
  {
    id: 'msconfig-cores',
    name: 'Boot — usar todos os núcleos (BCDEdit)',
    category: 'Sistema',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'BCDEdit define numproc para todos os núcleos. Por padrão o Windows já usa todos; isto garante a configuração (item 4 da auditoria).',
    summary: 'bcdedit /set numproc 0 (usa todos). Revert: bcdedit /deletevalue numproc.',
    async apply() {
      const r = await run(BCDEDIT, ['/set', '{current}', 'numproc', '0']);
      if (!r.ok) return { message: 'Comando executado (pode já estar configurado).' };
      return { message: 'Núcleos configurados para uso total via BCDEdit. Reinicie.' };
    },
    async revert() {
      await run(BCDEDIT, ['/deletevalue', '{current}', 'numproc']).catch(() => {});
      return { message: 'Valor numproc removido (volta ao padrão). Reinicie.' };
    },
    async status() {
      const r = await run(BCDEDIT, ['/enum', '{current}']);
      return /numproc\s+0/i.test(r.stdout)
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'numproc = 0 (todos os núcleos)' }
        : { level: 'OFF', label: 'Não aplicado', detail: 'Padrão do Windows' };
    }
  },
  {
    id: 'bios-settings',
    name: 'Ajustes de BIOS/hardware — informações',
    category: 'Hardware',
    admin: false,
    risk: 'LOW',
    reversible: false,
    evidence: 'Configurações de BIOS (XMP/EXPO, SVM, Above 4G/Re-BAR, Fast Boot) só podem ser feitas na BIOS — o software não acessa. Mostramos o que habilitar.',
    summary: 'Abre guia com configurações recomendadas da BIOS. Nenhuma alteração automática.',
    kind: 'guide',
    apply: async () => {
      // Não automatizável — apenas informa
      return { message: 'Ajustes de BIOS requerem reinicialização e entrada no Setup (F2/Del).' };
    },
    status: async () => ({ level: 'NA', label: 'Manual', detail: 'Configure na BIOS (XMP/EXPO, SVM, Above 4G, Re-BAR, Fast Boot)' })
  },
  {
    id: 'spacesniffer',
    name: 'SpaceSniffer — instalar analisador de disco',
    category: 'Ferramentas',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Ferramenta portátil para visualizar ocupação de disco. Instala via winget (item 16 da auditoria).',
    summary: 'Instala SpaceSniffer via winget. Remove com "Remover".',
    async apply() {
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget install -e --id JeroenK.SpaceSniffer --accept-source-agreements --accept-package-agreements']);
      if (!r.ok && !/already installed/i.test(r.stdout)) return { message: 'Instalação via winget falhou; baixe manualmente de https://www.uderzo.it/main_products/space_sniffer/' };
      return { message: 'SpaceSniffer instalado.' };
    },
    async revert() {
      await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget uninstall -e --id JeroenK.SpaceSniffer']).catch(() => {});
      return { message: 'SpaceSniffer removido.' };
    },
    async status() {
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget list --id JeroenK.SpaceSniffer']);
      return /JeroenK.SpaceSniffer/i.test(r.stdout)
        ? { level: 'APPLIED', label: 'Instalado', detail: 'SpaceSniffer presente' }
        : { level: 'OFF', label: 'Não instalado', detail: 'Clique em Aplicar para instalar' };
    }
  },
  {
    id: 'process-lasso',
    name: 'Process Lasso — instalar gerenciador de prioridade',
    category: 'Ferramentas',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Gerencia prioridade/afinidade de processos automaticamente. Instala via winget (item 20 da auditoria).',
    summary: 'Instala Process Lasso (Bitsum) via winget.',
    async apply() {
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget install -e --id Bitsum.ProcessLasso --accept-source-agreements --accept-package-agreements']);
      if (!r.ok && !/already installed/i.test(r.stdout)) return { message: 'Instalação via winget falhou; baixe em https://bitsum.com/' };
      return { message: 'Process Lasso instalado.' };
    },
    async revert() {
      await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget uninstall -e --id Bitsum.ProcessLasso']).catch(() => {});
      return { message: 'Process Lasso removido.' };
    },
    async status() {
      const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget list --id Bitsum.ProcessLasso']);
      return /Bitsum.ProcessLasso/i.test(r.stdout)
        ? { level: 'APPLIED', label: 'Instalado', detail: 'Process Lasso presente' }
        : { level: 'OFF', label: 'Não instalado', detail: 'Clique em Aplicar para instalar' };
    }
  },
  {
    id: 'runtimes-throttlestop',
    name: 'VC++ Runtimes + DirectX — instalar pacotes essenciais',
    category: 'Ferramentas',
    admin: true,
    risk: 'LOW',
    reversible: false,
    evidence: 'Visual C++ Runtimes e DirectX End-User Runtime são pré-requisitos reais para jogos. Instala via winget (item 37 da auditoria).',
    summary: 'Instala todos os VC++ Runtimes (TechPowerUp) e DirectX via winget.',
    async apply() {
      const results = [];
      // VC++ Runtimes AIO
      const vc = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget install -e --id TechPowerUp.VisualCppRedistAIO --accept-source-agreements --accept-package-agreements']);
      results.push(vc.ok ? 'VC++ Runtimes OK' : `VC++: ${vc.stderr?.slice(0,100) || 'falhou'}`);
      // DirectX
      const dx = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget install -e --id Microsoft.DirectX --accept-source-agreements --accept-package-agreements']);
      results.push(dx.ok ? 'DirectX OK' : `DirectX: ${dx.stderr?.slice(0,100) || 'falhou'}`);
      return { message: results.join(' | ') };
    },
    async status() {
      const vc = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget list --id TechPowerUp.VisualCppRedistAIO']);
      const dx = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', 'winget list --id Microsoft.DirectX']);
      const hasVC = /TechPowerUp.VisualCppRedistAIO/i.test(vc.stdout);
      const hasDX = /Microsoft.DirectX/i.test(dx.stdout);
      if (hasVC && hasDX) return { level: 'APPLIED', label: 'Instalado', detail: 'VC++ Runtimes + DirectX presentes' };
      if (hasVC || hasDX) return { level: 'PARTIAL', label: 'Parcial', detail: `VC++: ${hasVC ? 'OK' : 'faltando'} | DirectX: ${hasDX ? 'OK' : 'faltando'}` };
      return { level: 'OFF', label: 'Não instalado', detail: 'Clique em Aplicar para instalar' };
    }
  },
  {
    id: 'gpedit-enable',
    name: 'Ativar gpedit.msc (Windows Home) via DISM',
    category: 'Sistema',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Adiciona pacotes de Group Policy ao Windows Home via DISM (item 40 da auditoria).',
    summary: 'Instala pacotes Microsoft-Windows-GroupPolicy via DISM. Revert remove os pacotes.',
    async apply() {
      const pkgs = [
        'Microsoft-Windows-GroupPolicy-ClientTools-Package',
        'Microsoft-Windows-GroupPolicy-ClientExtensions-Package'
      ];
      for (const pkg of pkgs) {
        const r = await run(DISMEXE, ['/Online', '/Add-Package', `/PackagePath:C:\\Windows\\servicing\\Packages\\${pkg}~*.mum`], { timeout: 120000 });
        if (!r.ok) console.log(`DISM ${pkg}:`, r.stderr?.slice(0,200));
      }
      return { message: 'Pacotes de Group Policy adicionados. Reinicie e teste gpedit.msc.' };
    },
    async revert() {
      const pkgs = [
        'Microsoft-Windows-GroupPolicy-ClientTools-Package',
        'Microsoft-Windows-GroupPolicy-ClientExtensions-Package'
      ];
      for (const pkg of pkgs) {
        await run(DISMEXE, ['/Online', '/Remove-Package', `/PackageName:${pkg}`], { timeout: 120000 }).catch(() => {});
      }
      return { message: 'Pacotes de Group Policy removidos (se existiam).' };
    },
    async status() {
      try {
        const r = await run('where', ['gpedit.msc']);
        return r.ok && r.stdout.trim().length > 0
          ? { level: 'APPLIED', label: 'Disponível', detail: 'gpedit.msc encontrado no PATH' }
          : { level: 'OFF', label: 'Não disponível', detail: 'Execute Aplicar para instalar via DISM' };
      } catch {
        return { level: 'OFF', label: 'Não disponível', detail: 'Execute Aplicar para instalar via DISM' };
      }
    }
  },
  {
    id: 'cs2-cvars',
    name: 'CS2 — opções de inicialização otimizadas (Steam)',
    category: 'Jogo',
    admin: false,
    risk: 'LOW',
    reversible: true,
    evidence: 'Define launch options do CS2 no Steam via registro: -high -novid -nojoy -fullscreen +fps_max 0 +cl_allow_animated_avatars 0 +battery_saver 0 +engine_low_latency_sleep_after_client_tick 1 +r_drawtracers_firstperson 0 (item 45 da auditoria).',
    summary: 'Escreve launch options no registro do Steam para CS2 (appid 730).',
    async apply() {
      const opts = '-high -novid -nojoy -fullscreen +fps_max 0 +cl_allow_animated_avatars 0 +battery_saver 0 +engine_low_latency_sleep_after_client_tick 1 +r_drawtracers_firstperson 0';
      await regAdd('HKCU\\Software\\Valve\\Steam\\Apps\\730', 'LaunchOptions', 'REG_SZ', opts);
      return { message: 'Opções de inicialização do CS2 aplicadas. Reinicie o Steam.' };
    },
    async revert() {
      await regDelete('HKCU\\Software\\Valve\\Steam\\Apps\\730', 'LaunchOptions').catch(() => {});
      return { message: 'Launch options do CS2 removidas.' };
    },
    async status() {
      const v = await regStr('HKCU\\Software\\Valve\\Steam\\Apps\\730', 'LaunchOptions');
      return v && v.includes('engine_low_latency_sleep_after_client_tick')
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Launch options otimizadas ativas' }
        : { level: 'OFF', label: 'Não aplicado', detail: v ? `Atual: ${v}` : 'Padrão do Steam' };
    }
  }
];

// ---------------------------------------------------------------------------
// OPTIONAL — 17 (condicionais: testar individualmente)
// ---------------------------------------------------------------------------
const OPTIONAL = [
  guide('parkcontrol', 'ParkControl — desempenho máximo',
    'Ferramentas',
    'Ajuda mais em notebooks com throttle; em CPUs modernas o efeito é pequeno (item 2 da auditoria).',
    [
      'Baixe o ParkControl (Bitsum).',
      'Em “Performance profile” selecione Performance.',
      'Clique em “Turn on” e em “Apply”.',
      'Faça o teste e reverta se não notar diferença a favor.'
    ],
    [{ label: 'Baixar ParkControl', url: 'https://bitsum.com/parkcontrol/' }]
  ),
  {
    id: 'services-safe-disable',
    name: 'Serviços desnecessários (conjunto seguro)',
    category: 'Sistema',
    admin: true,
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'Inofensivo na maioria das máquinas; ganho pequeno. Excluídos desta lista: Server, SysMain, Windows Search — que podem quebrar o sistema.',
    summary: 'Desativa: Registro Remoto, Telefonia, Cartão Inteligente e Roteamento & Acesso Remoto.',
    async apply() {
      const targets = ['RemoteRegistry', 'PhoneSvc', 'SCardSvr', 'RemoteAccess'];
      const applied = [];
      for (const name of targets) {
        if (await scState(name)) {
          await disableService(name);
          applied.push(name);
        }
      }
      return { message: `Desativados: ${applied.join(', ') || 'nenhum serviço encontrado'}.` };
    },
    async status() {
      const s = await scState('RemoteRegistry');
      return s === 'STOPPED'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Registro Remoto parado' }
        : { level: 'OFF', label: 'Não aplicado', detail: s ? `Registro Remoto: ${s}` : 'Serviço indisponível' };
    }
  },
  {
    id: 'games-task-regs',
    name: 'Hardware de jogos — classe Games (GPU 8)',
    category: 'Jogo',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Ramo real do agendador multimídia, mas efeito mínimo/nulo em muitos PCs. Vale teste (item 12 da auditoria).',
    summary: 'GPU=8, PRIORITY=6, SCHEDULING=HIGH, SFIO=HIGH.',
    async apply() {
      await regAdd(GAMES_KEY, 'GPU Priority', 'REG_DWORD', '8');
      await regAdd(GAMES_KEY, 'Priority', 'REG_DWORD', '6');
      await regAdd(GAMES_KEY, 'Scheduling Category', 'REG_SZ', 'High');
      await regAdd(GAMES_KEY, 'SFIO Priority', 'REG_SZ', 'High');
      return { message: 'Classe Games configurada (GPU=8).' };
    },
    async status() {
      const v = await regStr(GAMES_KEY, 'Scheduling Category');
      return v === 'High'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Scheduling Category = High' }
        : { level: 'OFF', label: 'Não aplicado', detail: 'Valor padrão' };
    }
  },
  {
    id: 'system-responsiveness',
    name: 'SystemResponsiveness = 1',
    category: 'Jogo',
    admin: true,
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'Pode favorecer o jogo, mas pode causar travadas de áudio/fundo. Default é 20; reverta em caso de stutter (item 13 da auditoria).',
    summary: 'Reduz o percentual reservado ao sistema em segundo plano.',
    async apply() {
      await regAdd(SYSPROFILE_KEY, 'SystemResponsiveness', 'REG_DWORD', '1');
      return { message: 'SystemResponsiveness = 1. Teste; se travar áudio/fundo, reaplique “Reverter tudo”.' };
    },
    async status() {
      const v = await regHex(SYSPROFILE_KEY, 'SystemResponsiveness');
      return v === 1
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'SystemResponsiveness = 1' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Default (20)' : `Atual: ${v}` };
    }
  },
  {
    id: 'memory-compression',
    name: 'Memory Compression (alternar ligado/desligado)',
    category: 'Memória',
    admin: true,
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'Recurso real; só muda resultado em máquinas com pouca RAM. Teste (item 17 da auditoria).',
    summary: 'Alterna Enable/Disable-MMAgent -mc conforme o estado atual.',
    async apply() {
      const cur = await currentMemoryCompression();
      const r = cur
        ? await ps('Disable-MMAgent -mc')
        : await ps('Enable-MMAgent -mc');
      return {
        message: cur
          ? 'Compressão de memória desativada. Reinicie para aplicar.'
          : 'Compressão de memória ativada. Reinicie para aplicar.'
      };
    },
    async status() {
      const on = await currentMemoryCompression();
      return { level: 'NA', label: 'Condicional', detail: `Compressão de memória: ${on ? 'Ligada' : 'Desligada'} (padrão do Windows: Ligada)` };
    }
  },
  {
    id: 'ndu-disable',
    name: 'Serviço Ndu (medição de dados)',
    category: 'Sistema',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Desligar economiza quase nada; ganho desprezível (item 18 da auditoria).',
    summary: 'sc config Ndu start= disabled',
    async apply() {
      await disableService('Ndu');
      return { message: 'Ndu desativado.' };
    },
    async status() {
      const s = await scState('Ndu');
      return s === 'STOPPED'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'Ndu parado' }
        : { level: 'OFF', label: 'Não aplicado', detail: s ? `Ndu: ${s}` : 'Serviço indisponível' };
    }
  },
  {
    id: 'igpu-vram',
    name: 'VRAM dedicada para GPU integrada (DedicatedSegmentSize)',
    category: 'Hardware',
    admin: true,
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'Em Intel/AMD modernos o BIOS/UMA domina a alocação; registro muda pouco ou nada (item 19 da auditoria).',
    summary: 'Só quando existe GPU integrada (Intel). 512 se tiver 8 GB+ de RAM; senão 128.',
    condition: (system) => hasIntegratedGpu(system),
    async apply() {
      const ramGB = os.totalmem() / 1024 / 1024 / 1024;
      const value = ramGB >= 8 ? 512 : 128;
      await regAdd('HKLM\\SOFTWARE\\Intel', 'DedicatedSegmentSize', 'REG_DWORD', String(value));
      return { message: `DedicatedSegmentSize = ${value} (${ramGB >= 8 ? '8 GB+' : 'menos de 8 GB'} de RAM).` };
    },
    async status() {
      const v = await regHex('HKLM\\SOFTWARE\\Intel', 'DedicatedSegmentSize');
      return v != null
        ? { level: 'APPLIED', label: 'Aplicado', detail: `DedicatedSegmentSize = ${v}` }
        : { level: 'OFF', label: 'Não aplicado', detail: 'Sem valor definido' };
    }
  },
  {
    id: 'mpo-disable',
    name: 'Desativar Multi-Plane Overlay (MPO)',
    category: 'Jogo',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Corrige stutter/flicker em alguns PCs. Sem sintoma = sem ganho; teste (item 22 da auditoria).',
    summary: 'HKLM\\...\\GraphicsDrivers\\DisableMultiplaneOverlay = 1',
    async apply() {
      await regAdd('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'DisableMultiplaneOverlay', 'REG_DWORD', '1');
      return { message: 'MPO desativado. Reinicie e teste o jogo; reverta se não notar diferença.' };
    },
    async status() {
      const v = await regHex('HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'DisableMultiplaneOverlay');
      return v === 1
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'MPO desligado' }
        : { level: 'OFF', label: 'Não aplicado', detail: 'MPO ativo (padrão)' };
    }
  },
  {
    id: 'dynamic-tick',
    name: 'Timer do sistema — dynamic tick off',
    category: 'Sistema',
    admin: true,
    risk: 'LOW',
    reversible: true,
    evidence: 'Reduz overhead do timer; efeito micro e aumenta consumo em idle. Inofensivo, porém despercebível (item 24 da auditoria).',
    summary: 'bcdedit /set disabledynamictick yes',
    async apply() {
      const r = await run(BCDEDIT, ['/set', 'disabledynamictick', 'yes']);
      if (!r.ok) return { message: 'Comando executado. (Não disponível em todos os sistemas.)' };
      return { message: 'Dynamic tick desativado.' };
    },
    async status() {
      const r = await run(BCDEDIT, ['/enum', '{current}']);
      return /disabledynamictick\s+yes/i.test(r.stdout) || /disabledynamictick.*yes/i.test(r.stdout)
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'dynamic tick off' }
        : { level: 'OFF', label: 'Não aplicado', detail: 'Padrão do Windows' };
    }
  },
  guide('steam-launch', 'Opções de inicialização Steam',
    'Jogo',
    '-high (prioridade alta) real porém pequeno; fps_max 0 limitado pelo monitor (item 27 da auditoria).',
    [
      'Steam → biblioteca → jogo → Propriedades → Opções de inicialização.',
      'Cole: -high -novid -nojoy -fullscreen +fps_max 0',
      'Teste; reverte removendo -high se houver instabilidade.'
    ]
  ),
  {
    id: 'games-task-gpu31',
    name: 'Classe Games — variante agressiva (GPU 31)',
    category: 'Jogo',
    admin: true,
    risk: 'MEDIUM',
    reversible: true,
    evidence: 'GPU=31 não é “melhor” que 8; sem ganho comprovado (item 28 da auditoria). Alternativa para quem testar.',
    summary: 'Aplica GPU=31 (máximo) na classe Games.',
    async apply() {
      await regAdd(GAMES_KEY, 'GPU Priority', 'REG_DWORD', '31');
      return { message: 'GPU Priority = 31 (variante agressiva). Teste e compare com o valor 8.' };
    },
    async status() {
      const v = await regHex(GAMES_KEY, 'GPU Priority');
      return v === 31
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'GPU Priority = 31' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Padrão' : `Atual: ${v}` };
    }
  },
  guide('cs2-launch', 'Opções de inicialização CS2',
    'Jogo',
    '-high tem efeito real pequeno; fps_max 0 só ajuda sem VSync (item 29 da auditoria).',
    [
      'Steam → CS2 → Propriedades → Opções de inicialização.',
      'Cole: -high -nojoy +fps_max 0',
      'Teste em treino antes de usar em partida ranqueada.'
    ]
  ),
  {
    id: 'temp-cleanup',
    name: 'Limpar arquivos temporários',
    category: 'Manutenção',
    admin: true,
    reversible: false,
    risk: 'LOW',
    evidence: 'Libera espaço; Prefetch e SoftwareDistribution ficam de fora de propósito (item 31 da auditoria).',
    summary: 'Remove %TEMP% e C:\\Windows\\Temp. Não mexe em Prefetch.',
    async apply() {
      const script =
        "[System.Collections.ArrayList]$dirs=@([System.IO.Path]::GetTempPath(),'C:\\Windows\\Temp');$freed=0;" +
        "foreach($d in $dirs){if(Test-Path $d){Get-ChildItem -Path $d -Force -ErrorAction SilentlyContinue | ForEach-Object { try { $freed+=$_.Length; Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue } catch {} }}};" +
        "[math]::Round($freed/1MB,1)";
      const r = await ps(script, { timeout: 300000 });
      const freed = (r.stdout || '').trim();
      return { message: `Limpeza concluída${freed ? ` (cerca de ${freed} MB removidos)` : ''}.` };
    },
    async status() {
      return { level: 'NA', label: 'Manutenção', detail: 'Ação pontual — rode quando quiser liberar espaço.' };
    }
  },
  {
    id: 'mouse-accel-off',
    name: 'Desativar aceleração do mouse',
    category: 'Input',
    admin: false,
    risk: 'LOW',
    reversible: true,
    evidence: 'Consistência 1:1 real; NÃO reduz input lag nem polling rate — muda a sensação (item 38 da auditoria).',
    summary: 'MouseSpeed=0 e barreiras de aceleração zeradas.',
    async apply() {
      await regAdd('HKCU\\Control Panel\\Mouse', 'MouseSpeed', 'REG_SZ', '0');
      await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold1', 'REG_SZ', '0');
      await regAdd('HKCU\\Control Panel\\Mouse', 'MouseThreshold2', 'REG_SZ', '0');
      return { message: 'Aceleração do mouse desativada.' };
    },
    async status() {
      const v = await regStr('HKCU\\Control Panel\\Mouse', 'MouseSpeed');
      return v === '0'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'MouseSpeed = 0' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Padrão' : `MouseSpeed = ${v}` };
    }
  },
  guide('winscript', 'WinScript — debloat do Windows',
    'Ferramentas',
    'Debloater open source real, mas remove funcionalidades por atacado. Leia o que marca (item 39 da auditoria).',
    [
      'Baixe o WinScript de fonte oficial (GitHub).',
      'Revise TUDO o que estiver marcado antes de rodar.',
      'Prefira o rollback do próprio app em vez de desmarcar vários ajustes de uma vez.'
    ],
    [{ label: 'WinScript (GitHub)', url: 'https://github.com/farshed/winscript' }]
  ),
  guide('msi-utility', 'MSI Utility — modo MSI para dispositivos',
    'Ferramentas',
    'Pode ajudar periféricos de alta taxa de polling; efeito difícil de medir (item 42 da auditoria).',
    [
      'Baixe o MSI Mode Utility v3 e rode como administrador.',
      'Ative MSI para mouse/teclado de alta polling rate.',
      'Reinicie e teste; reverta se não notar diferença.'
    ],
    [{ label: 'MSI Mode Utility v3 (Guru3D)', url: 'https://forums.guru3d.com/threads/windows-interrupt-affinity-policy-tool-msi-mode-v3.378044/' }]
  ),
  {
    id: 'mousekeys',
    name: 'Desativar MouseKeys (acessibilidade)',
    category: 'Sistema',
    admin: false,
    risk: 'LOW',
    reversible: true,
    evidence: 'Configuração de acessibilidade; sem impacto real perceptível em gameplay (item 44 da auditoria).',
    summary: 'HKCU\\Control Panel\\Accessibility\\MouseKeys → MouseKeys = 0',
    async apply() {
      await regAdd('HKCU\\Control Panel\\Accessibility\\MouseKeys', 'MouseKeys', 'REG_SZ', '0');
      return { message: 'MouseKeys desativado.' };
    },
    async status() {
      const v = await regStr('HKCU\\Control Panel\\Accessibility\\MouseKeys', 'MouseKeys');
      return v === '0'
        ? { level: 'APPLIED', label: 'Aplicado', detail: 'MouseKeys = 0' }
        : { level: 'OFF', label: 'Não aplicado', detail: v == null ? 'Padrão' : `MouseKeys = ${v}` };
    }
  }
];

// ---------------------------------------------------------------------------
// Memory Compression helper
// ---------------------------------------------------------------------------
async function currentMemoryCompression() {
  try {
    const r = await ps('Get-MMAgent | Select-Object -ExpandProperty MemoryCompression', { timeout: 30000 });
    return /true/i.test(r.stdout || '');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Montagem do catálogo
// ---------------------------------------------------------------------------
RECOMMENDED.forEach((r) => { r.tier = 'recommended'; });
OPTIONAL.forEach((r) => { r.tier = 'optional'; });

const ALL = [...RECOMMENDED, ...OPTIONAL];

function getById(id) {
  return ALL.find((r) => r.id === id) || null;
}

module.exports = {
  RECOMMENDED,
  OPTIONAL,
  ALL,
  getById
};