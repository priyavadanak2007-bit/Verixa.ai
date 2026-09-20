const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { app } = require('../src/app');

const samplePath = path.join(__dirname, 'debug.png');
fs.writeFileSync(samplePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB4LqAAAAA1J0pAAB9h0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJ0UkGAAAAAAgI0BAAAAAAABQwAABQAAABJRU5ErkJggg==', 'base64'));

(async () => {
  const uploadRes = await request(app).post('/api/upload').attach('file', samplePath);
  console.log('UPLOAD_STATUS', uploadRes.status);
  console.log('UPLOAD_BODY', JSON.stringify(uploadRes.body, null, 2));

  const scanId = uploadRes.body && uploadRes.body.scanId;
  const scanRes = await request(app).post('/api/scan').send({ scanId });
  console.log('SCAN_STATUS', scanRes.status);
  console.log('SCAN_BODY', JSON.stringify(scanRes.body, null, 2));

  fs.unlinkSync(samplePath);
})();
