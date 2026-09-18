/**
 * desktop/src/registry.js — Módulo SEGURO de Registry
 * Elimina command injection usando execFile com argumentos separados
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const REG = 'C:\\Windows\\System32\\reg.exe';

// Snapshot para rollback
let snapshot = null;

function snapshotFile() {
  return path.join(app.getPath('userData'), 'registry-snapshot.json');
}

async function loadSnapshot() {
  if (snapshot) return snapshot;
  try {
    snapshot = JSON.parse(await fs.promises.readFile(snapshotFile(), 'utf8'));
  } catch {
    snapshot = { createdAt: new Date().toISOString(), values: {} };
  }
  return snapshot;
}

async function saveSnapshot() {
  if (!snapshot) return;
  await fs.promises.writeFile(snapshotFile(), JSON.stringify(snapshot, null, 2), 'utf8');
}

function regCmd(args) {
  return new Promise((resolve, reject) => {
    execFile(REG, args, { windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve((stdout || '').trim());
    });
  });
}

async function snapshotValue(pathName, valueName) {
  const snap = await loadSnapshot();
  const key = `${pathName}|${valueName}`;
  if (snap.values[key]) return snap.values[key];
  
  try {
    const output = await regCmd(['query', pathName, '/v', valueName]);
    const line = output.split(/\r?\n/).find(l => l.includes('REG_')) || '';
    const match = line.match(/^\s*(.*?)\s+(REG_\S+)\s+(.*)$/);
    snap.values[key] = match
      ? { pathName, valueName, exists: true, type: match[2], data: match[3] }
      : { pathName, valueName, exists: false };
  } catch {
    snap.values[key] = { pathName, valueName, exists: false };
  }
  await saveSnapshot();
  return snap.values[key];
}

async function regAdd(pathName, valueName, type, data) {
  await snapshotValue(pathName, valueName);
  await regCmd(['add', pathName, '/v', valueName, '/t', type, '/d', String(data), '/f']);
  return true;
}

async function regQuery(pathName, valueName) {
  return regCmd(['query', pathName, '/v', valueName]);
}

async function regDelete(pathName, valueName) {
  await snapshotValue(pathName, valueName);
  await regCmd(['delete', pathName, '/v', valueName, '/f']);
  return true;
}

async function getSnapshotStatus() {
  const snap = await loadSnapshot();
  return { count: Object.keys(snap.values).length, createdAt: snap.createdAt };
}

async function restoreSnapshot() {
  const snap = await loadSnapshot();
  const entries = Object.values(snap.values);
  const failures = [];
  
  for (const item of entries) {
    try {
      if (item.exists) {
        await regCmd(['add', item.pathName, '/v', item.valueName, '/t', item.type, '/d', String(item.data), '/f']);
      } else {
        await regCmd(['delete', item.pathName, '/v', item.valueName, '/f']);
      }
    } catch (error) {
      failures.push(item.valueName);
    }
  }
  
  if (!failures.length) {
    snapshot = { createdAt: new Date().toISOString(), values: {} };
    await saveSnapshot();
  }
  
  return { ok: failures.length === 0, restored: entries.length - failures.length, failures };
}

module.exports = {
  regAdd, regQuery, regDelete,
  getSnapshotStatus, restoreSnapshot,
  snapshotValue
};
