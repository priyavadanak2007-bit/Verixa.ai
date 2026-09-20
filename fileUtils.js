const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function safeFileName(originalName = 'upload') {
  const base = path.basename(originalName || 'upload');
  const ext = path.extname(base).toLowerCase();
  const sanitizedBase = base.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  const cleanBase = sanitizedBase.replace(new RegExp(`${escapeRegExp(ext)}$`), '') || 'upload';
  const digest = crypto.randomBytes(6).toString('hex');
  return `${cleanBase}-${digest}${ext}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureUploadDirectory(uploadFolder) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

function deleteFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    // ignore cleanup failures
  }
}

module.exports = {
  safeFileName,
  ensureUploadDirectory,
  deleteFileIfExists,
};
