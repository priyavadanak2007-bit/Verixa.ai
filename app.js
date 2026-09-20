const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('./config');
const { ensureUploadDirectory, safeFileName, deleteFileIfExists } = require('./utils/fileUtils');
const { createError, createScanRecord, runInspection } = require('./services/inspectionService');
const { getScan } = require('./services/scanStore');

const app = express();

const allowedOrigins = config.allowedOrigins;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS policy denied this origin.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

ensureUploadDirectory(path.resolve(__dirname, '../', config.uploadFolder));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = path.resolve(__dirname, '../', config.uploadFolder);
    ensureUploadDirectory(targetDir);
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const safeName = safeFileName(file.originalname);
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.maxFileSize,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.split('.').pop() || '').toLowerCase();
    if (!config.allowedExtensions.has(ext)) {
      return cb(new Error('Unsupported file type. Allowed types: png, jpg, jpeg, pdf, pptx, docx.'));
    }
    cb(null, true);
  },
});

app.get('/', (req, res) => {
  res.json({ name: 'Verixa AI Backend', status: 'running' });
});

app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, async (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, error: { code: 'FILE_TOO_LARGE', message: `File exceeds the ${config.maxFileSize / (1024 * 1024)}MB limit.` } });
      }
      return res.status(400).json({ success: false, error: { code: 'INVALID_UPLOAD', message: error.message || 'Upload failed.' } });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FILE', message: 'No file was uploaded.' } });
    }

    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    const scanId = crypto.randomUUID();
    const metadata = {
      scanId,
      originalName: req.file.originalname,
      fileType: ext,
      filePath: req.file.path,
      storageName: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype || 'application/octet-stream',
    };

    try {
      await createScanRecord(scanId, metadata);
      res.json({
        success: true,
        scanId,
        filename: metadata.originalName,
        fileType: metadata.fileType,
        status: 'uploaded',
      });
    } catch (uploadError) {
      deleteFileIfExists(req.file.path);
      return res.status(500).json({ success: false, error: { code: 'UPLOAD_SAVE_FAILED', message: uploadError.message || 'Failed to save the upload.' } });
    }
  });
});

app.post('/api/scan', async (req, res) => {
  const { scanId } = req.body || {};
  if (!scanId) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_SCAN_ID', message: 'scanId is required.' } });
  }

  const scan = getScan(scanId);
  if (!scan) {
    return res.status(404).json({ success: false, error: { code: 'SCAN_NOT_FOUND', message: 'Scan record not found.' } });
  }

  if (!fs.existsSync(scan.filePath)) {
    return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'The uploaded file is no longer available.' } });
  }

  try {
    const report = await runInspection(scanId, {
      originalName: scan.filename,
      fileType: scan.fileType,
      filePath: scan.filePath,
      storageName: scan.storageName,
      size: scan.size,
      mimeType: scan.mimeType,
    });
    res.json({ success: true, scanId, status: 'completed', report });
  } catch (error) {
    return res.status(500).json({ success: false, error: { code: 'SCAN_FAILED', message: error.message || 'Scan processing failed.' } });
  }
});

app.get('/api/scan/:scanId/status', (req, res) => {
  const scan = getScan(req.params.scanId);
  if (!scan) {
    return res.status(404).json({ success: false, error: { code: 'SCAN_NOT_FOUND', message: 'Scan not found.' } });
  }

  res.json({
    success: true,
    scanId: scan.scanId,
    filename: scan.filename,
    fileType: scan.fileType,
    status: scan.status || 'uploaded',
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
  });
});

app.get('/api/scan/:scanId/report', (req, res) => {
  const scan = getScan(req.params.scanId);
  if (!scan) {
    return res.status(404).json({ success: false, error: { code: 'SCAN_NOT_FOUND', message: 'Scan not found.' } });
  }

  if (!scan.report) {
    return res.status(202).json({ success: true, scanId: scan.scanId, status: scan.status || 'processing', message: 'The report is still being generated.' });
  }

  res.json({ success: true, ...scan.report });
});

app.get('/api/scan/:scanId/download', (req, res) => {
  const scan = getScan(req.params.scanId);
  if (!scan) {
    return res.status(404).json({ success: false, error: { code: 'SCAN_NOT_FOUND', message: 'Scan not found.' } });
  }

  if (!fs.existsSync(scan.filePath)) {
    return res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'Original upload not found.' } });
  }

  res.download(scan.filePath, scan.filename);
});

module.exports = { app };
