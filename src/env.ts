export interface AppEnv {
  /** Пусто до тех пор, пока не заполнен Application ID в Developer Portal. */
  discordClientId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapId: string;
  devCanEdit: boolean;
}

type RawEnv = Record<string, string | undefined>;

function required(source: RawEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

export function readEnv(source: RawEnv): AppEnv {
  return {
    discordClientId: source.VITE_DISCORD_CLIENT_ID ?? '',
    supabaseUrl: required(source, 'VITE_SUPABASE_URL'),
    supabaseAnonKey: required(source, 'VITE_SUPABASE_ANON_KEY'),
    mapId: required(source, 'VITE_MAP_ID'),
    devCanEdit: source.VITE_DEV_CAN_EDIT === 'true',
  };
}

export const ENV: AppEnv = readEnv(import.meta.env as unknown as RawEnv);
