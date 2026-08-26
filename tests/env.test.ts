import { describe, it, expect } from 'vitest';
import { readEnv } from '../src/env';

describe('readEnv', () => {
  it('reads all required variables', () => {
    const env = readEnv({
      VITE_DISCORD_CLIENT_ID: '123',
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_MAP_ID: '00000000-0000-0000-0000-000000000001',
    });
    expect(env.discordClientId).toBe('123');
    expect(env.mapId).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('throws naming the missing variable', () => {
    expect(() => readEnv({ VITE_DISCORD_CLIENT_ID: '123' }))
      .toThrow(/VITE_SUPABASE_URL/);
  });

  it('tolerates an empty Discord client id until the portal is configured', () => {
    const env = readEnv({
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_MAP_ID: 'm',
    });
    expect(env.discordClientId).toBe('');
  });

  it('treats dev edit rights as opt-in', () => {
    const base = {
      VITE_SUPABASE_URL: 'https://x.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon',
      VITE_MAP_ID: 'm',
    };
    expect(readEnv(base).devCanEdit).toBe(false);
    expect(readEnv({ ...base, VITE_DEV_CAN_EDIT: 'true' }).devCanEdit).toBe(true);
  });
});
