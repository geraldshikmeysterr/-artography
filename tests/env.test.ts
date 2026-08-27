import { describe, it, expect } from 'vitest';
import { readEnv } from '../src/env';
import { PUBLIC_CONFIG } from '../src/config.public';

describe('readEnv', () => {
  it('reads all variables when the environment provides them', () => {
    const env = readEnv({
      VITE_DISCORD_CLIENT_ID: '123',
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_MAP_ID: '00000000-0000-0000-0000-000000000001',
    });
    expect(env.discordClientId).toBe('123');
    expect(env.supabaseUrl).toBe('https://x.supabase.co');
    expect(env.mapId).toBe('00000000-0000-0000-0000-000000000001');
  });

  // Vercel вырезает .env из исходников при сборке, поэтому публичные значения
  // обязаны иметь работающий дефолт прямо в коде.
  it('falls back to the committed public config when the environment is empty', () => {
    const env = readEnv({});
    expect(env.discordClientId).toBe(PUBLIC_CONFIG.discordClientId);
    expect(env.supabaseUrl).toBe(PUBLIC_CONFIG.supabaseUrl);
    expect(env.supabaseAnonKey).toBe(PUBLIC_CONFIG.supabaseAnonKey);
    expect(env.mapId).toBe(PUBLIC_CONFIG.mapId);
  });

  it('lets the environment override the public default', () => {
    expect(readEnv({ VITE_SUPABASE_ANON_KEY: 'rotated' }).supabaseAnonKey).toBe('rotated');
  });

  it('throws naming the variable when neither environment nor default has a value', () => {
    const blank = { ...PUBLIC_CONFIG, supabaseUrl: '' };
    expect(() => readEnv({}, blank)).toThrow(/VITE_SUPABASE_URL/);
  });

  it('lets the environment override the Discord client id', () => {
    expect(readEnv({ VITE_DISCORD_CLIENT_ID: '999' }).discordClientId).toBe('999');
  });

  it('treats dev edit rights as opt-in', () => {
    expect(readEnv({}).devCanEdit).toBe(false);
    expect(readEnv({ VITE_DEV_CAN_EDIT: 'true' }).devCanEdit).toBe(true);
  });
});
