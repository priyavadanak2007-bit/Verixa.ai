const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const scans = new Map();
const storePath = path.join(__dirname, '../../', config.uploadFolder, 'scan-store.json');

function ensureStore() {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({}, null, 2));
  }
}

function readStore() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (error) {
    return {};
  }
}

function persistStore(payload) {
  ensureStore();
  fs.writeFileSync(storePath, JSON.stringify(payload, null, 2));
}

function upsertScan(scan) {
  const current = readStore();
  current[scan.scanId] = scan;
  persistStore(current);
  scans.set(scan.scanId, scan);
  return scan;
}

function getScan(scanId) {
  const current = readStore();
  if (current[scanId]) {
    scans.set(scanId, current[scanId]);
    return current[scanId];
  }
  return scans.get(scanId) || null;
}

function listScans() {
  const current = readStore();
  return Object.values(current);
}

module.exports = { upsertScan, getScan, listScans };
