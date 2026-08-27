import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ENV } from '../env';

let client: SupabaseClient | null = null;
let currentToken: string | null = null;

/**
 * Клиент Supabase. Сессию Discord мы получаем не через Supabase Auth, а своим
 * JWT из Edge Function, поэтому токен подставляется в заголовок вручную.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

export function setSupabaseToken(token: string | null): void {
  currentToken = token;
  if (token) getSupabase().realtime.setAuth(token);
}
