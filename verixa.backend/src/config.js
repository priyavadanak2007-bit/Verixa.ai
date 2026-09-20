const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const config = {
  port: Number(process.env.PORT || 5000),
  maxFileSize: Number(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024),
  uploadFolder: process.env.UPLOAD_FOLDER || 'uploads',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map((value) => value.trim()).filter(Boolean),
  publicApiBaseUrl: process.env.PUBLIC_API_BASE_URL || 'http://localhost:5000',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  allowedExtensions: new Set(['png', 'jpg', 'jpeg', 'pdf', 'pptx', 'docx']),
};

module.exports = { config };

