import { createClient } from '@supabase/supabase-js';
import config from './index.js';

// Client for authenticated user requests (respects RLS)
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey
);

// Admin client for background jobs (bypasses RLS)
// Use this carefully - only for server-side operations
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export default supabase;