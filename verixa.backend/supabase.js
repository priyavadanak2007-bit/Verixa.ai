const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');

let client = null;

function getSupabaseClient() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return client;
}

module.exports = { getSupabaseClient };
