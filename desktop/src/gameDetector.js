/**
 * desktop/src/gameDetector.js — Detecção de jogos instalados
 * Detecta Steam, Epic, Riot, Battle.net e executáveis conhecidos
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { cimCsv } = require('./cim');

// Catálogo de jogos conhecidos
const KNOWN_GAMES = [
  {
    id: 'valorant',
    name: 'Valorant',
    publisher: 'Riot Games',
    executable: 'VALORANT-Win64-Shipping.exe',
    detection: ['RiotClientServices.exe', 'VALORANT-Win64-Shipping.exe'],
    steamAppId: null,
    riotGame: true
  },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    publisher: 'Valve',
    executable: 'cs2.exe',
    detection: ['cs2.exe'],
    steamAppId: 730
  },
  {
    id: 'fortnite',
    name: 'Fortnite',
    publisher: 'Epic Games',
    executable: 'FortniteClient-Win64-Shipping.exe',
    detection: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe'],
    epicGame: true
  },
  {
    id: 'gta5',
    name: 'GTA V',
    publisher: 'Rockstar',
    executable: 'GTA5.exe',
    detection: ['GTA5.exe', 'PlayGTAV.exe'],
    steamAppId: 271590
  },
  {
    id: 'apex',
    name: 'Apex Legends',
    publisher: 'EA',
    executable: 'r5apex.exe',
    detection: ['r5apex.exe'],
    steamAppId: 1172470
  },
  {
    id: 'cod',
    name: 'Call of Duty: Warzone',
    publisher: 'Activision',
    executable: 'ModernWarfare.exe',
    detection: ['ModernWarfare.exe', 'cod.exe'],
    battleNetGame: true
  },
  {
    id: 'lol',
    name: 'League of Legends',
    publisher: 'Riot Games',
    executable: 'League of Legends.exe',
    detection: ['LeagueClient.exe', 'League of Legends.exe'],
    riotGame: true
  },
  {
    id: 'overwatch',
    name: 'Overwatch 2',
    publisher: 'Blizzard',
    executable: 'Overwatch.exe',
    detection: ['Overwatch.exe'],
    battleNetGame: true
  },
  {
    id: 'r6s',
    name: 'Rainbow Six Siege',
    publisher: 'Ubisoft',
    executable: 'RainbowSix.exe',
    detection: ['RainbowSix.exe', 'RainbowSix_Vulkan.exe'],
    steamAppId: 359550
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    publisher: 'Mojang',
    executable: 'javaw.exe',
    detection: ['javaw.exe'],
    special: 'minecraft'
  },
  {
    id: 'pubg',
    name: 'PUBG',
    publisher: 'Krafton',
    executable: 'TslGame.exe',
    detection: ['TslGame.exe'],
    steamAppId: 578080
  },
  {
    id: 'dota2',
    name: 'Dota 2',
    publisher: 'Valve',
    executable: 'dota2.exe',
    detection: ['dota2.exe'],
    steamAppId: 570
  },
  {
    id: 'rocketleague',
    name: 'Rocket League',
    publisher: 'Epic Games',
    executable: 'RocketLeague.exe',
    detection: ['RocketLeague.exe'],
    epicGame: true
  },
  {
    id: 'fifa',
    name: 'EA FC 24',
    publisher: 'EA',
    executable: 'EAFC24.exe',
    detection: ['EAFC24.exe', 'FIFA23.exe']
  },
  {
    id: 'eldenring',
    name: 'Elden Ring',
    publisher: 'FromSoftware',
    executable: 'eldenring.exe',
    detection: ['eldenring.exe'],
    steamAppId: 1245620
  }
];

// Perfis de otimização por jogo
const GAME_PROFILES = {
  valorant: {
    name: 'Valorant',
    description: 'Foco em consistência de input e baixa latência',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan', 'fullscreen-opt', 'telemetry'],
    notes: 'Valorant é CPU-bound em muitos cenários. Priorize reduzir background load.'
  },
  cs2: {
    name: 'Counter-Strike 2',
    description: 'Foco em resposta e consistência de framerate',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan', 'fullscreen-opt', 'visual-effects'],
    notes: 'CS2 beneficia de framerate estável. Mantenha background processes ao mínimo.'
  },
  fortnite: {
    name: 'Fortnite',
    description: 'Foco em estabilidade e redução de stuttering',
    optimizations: ['game-dvr', 'power-plan', 'visual-effects', 'telemetry'],
    notes: 'Fortnite é sensível a disk I/O. Mantenha SSD com espaço livre.'
  },
  gta5: {
    name: 'GTA V',
    description: 'Foco em balanceamento CPU/GPU',
    optimizations: ['game-dvr', 'power-plan', 'visual-effects'],
    notes: 'GTA V é pesado em RAM. 8GB+ recomendado.'
  },
  apex: {
    name: 'Apex Legends',
    description: 'Foco em framerate estável e input lag',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan', 'fullscreen-opt'],
    notes: 'Apex beneficia de alta framerate. Otimize para consistência.'
  },
  lol: {
    name: 'League of Legends',
    description: 'Foco em estabilidade para sessões longas',
    optimizations: ['game-dvr', 'power-plan', 'telemetry'],
    notes: 'LoL não é pesado. Foque em evitar thermal throttling.'
  },
  overwatch: {
    name: 'Overwatch 2',
    description: 'Foco em framerate alto e consistente',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan', 'fullscreen-opt'],
    notes: 'Overwatch 2 beneficia de alta framerate. Otimize para FPS máximo.'
  },
  r6s: {
    name: 'Rainbow Six Siege',
    description: 'Foco em precisão e consistência',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan', 'fullscreen-opt'],
    notes: 'R6S é competitivo. Consistência é mais importante que FPS máximo.'
  },
  generic: {
    name: 'Competitivo Geral',
    description: 'Otimizações seguras para qualquer jogo',
    optimizations: ['mouse-accel', 'game-dvr', 'power-plan'],
    notes: 'Perfil conservador. Aplique e teste no seu jogo.'
  }
};

// ==================== Detecção de processos ====================
async function getRunningProcesses() {
  try {
    const output = await cimCsv('Win32_Process', 'Name');
    const lines = output.split(/\r?\n/).filter(l => l.trim());
    const processes = new Set();
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length >= 2) processes.add(parts[1].replace(/^"|"$/g, '').trim());
    }
    return [...processes];
  } catch {
    return [];
  }
}

// ==================== Detecção de caminhos comuns ====================
function getCommonGamePaths() {
  const paths = [];
  const programFiles = [
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    process.env['ProgramFiles'] || 'C:\\Program Files',
    'D:\\Program Files',
    'D:\\Program Files (x86)',
    'E:\\Program Files',
    'E:\\Program Files (x86)'
  ];
  
  const steamPaths = [
    ...programFiles.map(p => path.join(p, 'Steam', 'steamapps', 'common')),
    'D:\\SteamLibrary\\steamapps\\common',
    'E:\\SteamLibrary\\steamapps\\common'
  ];
  
  const epicPaths = [
    ...programFiles.map(p => path.join(p, 'Epic Games')),
    'D:\\Epic Games',
    'E:\\Epic Games'
  ];
  
  const riotPaths = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Riot Games'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Riot Games')
  ];
  
  const battleNetPaths = [
    ...programFiles.map(p => path.join(p, 'Battle.net')),
    'D:\\Battle.net'
  ];
  
  return { steamPaths, epicPaths, riotPaths, battleNetPaths };
}

// ==================== Scan de jogos ====================
async function scanInstalledGames() {
  const installed = [];
  const running = await getRunningProcesses();
  const { steamPaths, epicPaths, riotPaths, battleNetPaths } = getCommonGamePaths();
  
  for (const game of KNOWN_GAMES) {
    let detected = false;
    let installPath = null;
    
    // Check if running
    for (const proc of game.detection) {
      if (running.includes(proc)) {
        detected = true;
        break;
      }
    }
    
    // Check common paths
    if (!detected) {
      const searchPaths = [];
      
      if (game.steamAppId) {
        searchPaths.push(...steamPaths);
      }
      if (game.epicGame) {
        searchPaths.push(...epicPaths);
      }
      if (game.riotGame) {
        searchPaths.push(...riotPaths);
      }
      if (game.battleNetGame) {
        searchPaths.push(...battleNetPaths);
      }
      
      // Also check generic paths
      searchPaths.push(...steamPaths, ...epicPaths);
      
      for (const basePath of searchPaths) {
        try {
          const entries = await fs.promises.readdir(basePath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const fullPath = path.join(basePath, entry.name);
              try {
                const files = await fs.promises.readdir(fullPath);
                if (files.includes(game.executable)) {
                  detected = true;
                  installPath = fullPath;
                  break;
                }
              } catch {}
            }
          }
        } catch {}
        if (detected) break;
      }
    }
    
    if (detected) {
      installed.push({
        ...game,
        installPath,
        isRunning: running.some(p => game.detection.includes(p))
      });
    }
  }
  
  return installed;
}

// ==================== Game Profiles ====================
function getGameProfile(gameId) {
  return GAME_PROFILES[gameId] || GAME_PROFILES.generic;
}

function getAllProfiles() {
  return GAME_PROFILES;
}

function createCustomProfile(gameId, optimizations) {
  return {
    name: `Custom: ${gameId}`,
    description: 'Perfil personalizado',
    optimizations,
    notes: 'Criado pelo usuário.'
  };
}

module.exports = {
  scanInstalledGames,
  getGameProfile,
  getAllProfiles,
  createCustomProfile,
  KNOWN_GAMES
};
