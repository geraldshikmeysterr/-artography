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

const EMPTY_ENV: AppEnv = {
  discordClientId: '', supabaseUrl: '', supabaseAnonKey: '', mapId: '', devCanEdit: false,
};

let error: string | null = null;
let resolved: AppEnv;
try {
  resolved = readEnv(import.meta.env as unknown as RawEnv);
} catch (cause) {
  // Не роняем приложение белым экраном: main.tsx покажет понятный экран ошибки.
  error = (cause as Error).message;
  resolved = EMPTY_ENV;
}

export const ENV: AppEnv = resolved;
export const ENV_ERROR: string | null = error;
