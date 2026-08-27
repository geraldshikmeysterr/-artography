/**
 * Публичные значения проекта.
 *
 * Лежат в коде, а не в `.env`, по практической причине: Vercel вырезает
 * `.env`-файлы из исходников перед сборкой, поэтому переменные оттуда до
 * бандла не доезжают и продакшн падал бы на «не настроено».
 *
 * Секретов здесь нет и быть не может. `supabaseUrl` и `mapId` — не секреты
 * ни в каком смысле; anon-ключ публикуемый по устройству Supabase: он всё
 * равно попадает в JS-бандл после сборки, а доступ ограничивают политики RLS.
 * service_role, client_secret, бот-токен и JWT secret сюда не попадают
 * никогда — они живут только в Supabase Edge Functions.
 *
 * Любое значение перебивается переменной окружения с тем же именем: задайте
 * VITE_SUPABASE_ANON_KEY в настройках проекта Vercel — и ключ можно будет
 * ротировать без коммита.
 */
export interface PublicConfig {
  /** Application ID приложения Discord. Публичен: виден в URL активности. */
  discordClientId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapId: string;
}

export const PUBLIC_CONFIG: PublicConfig = {
  discordClientId: '1541040745279135825',
  supabaseUrl: 'https://hleafgtowbcgpjevvyno.supabase.co',
  supabaseAnonKey:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsZWFmZ3Rvd2JjZ3BqZXZ2eW5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3OTEyMjcsImV4cCI6MjEwMzM2NzIyN30.Y8JCUV_yLp_379pIJNdK8qI8bmZItIie_Jh3RwGmH3c',
  mapId: '00000000-0000-0000-0000-000000000001',
};
