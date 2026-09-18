/**
 * desktop/src/cim.js — Windows CIM queries via PowerShell.
 *
 * wmic.exe was removed from Windows 11 24H2+ and Microsoft flags it as
 * deprecated. This module replaces those calls with Get-CimInstance and emits
 * CSV whose shape matches WMIC /format:csv (a leading "Node" column followed
 * by the requested properties), so existing parsers keep working unchanged.
 */
const path = require('path');
const { execFile } = require('child_process');

const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';

function psStdout(script) {
  return new Promise((resolve, reject) => {
    execFile(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || '').trim() || err.message));
      resolve((stdout || '').trim());
    });
  });
}

/**
 * Query a CIM class and return CSV (WMIC-like, with a leading Node column).
 * @param {string} className e.g. 'Win32_Processor'
 * @param {string|string[]} properties e.g. 'Name,NumberOfCores'
 * @param {object} [opts] { filter } e.g. { filter: 'DriveType=3' }
 */
function cimCsv(className, properties, opts = {}) {
  const propList = Array.isArray(properties) ? properties.join(',') : String(properties);
  const select = `@{n='Node';e={$env:COMPUTERNAME}},${propList}`;
  let script = `Get-CimInstance ${className}`;
  if (opts.filter) script += ` -Filter "${String(opts.filter).replace(/"/g, "'")}"`;
  script += ` | Select-Object ${select} | ConvertTo-Csv -NoTypeInformation`;
  return psStdout(script);
}

module.exports = { cimCsv };