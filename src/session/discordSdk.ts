import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { ENV } from '../env';

let cached: Promise<DiscordSDK | null> | null = null;

/** Activity всегда открывается с frame_id в query — по нему и отличаем. */
export function isInsideDiscord(): boolean {
  return new URLSearchParams(location.search).has('frame_id');
}

export function getDiscordSdk(): Promise<DiscordSDK | null> {
  cached ??= (async () => {
    if (!isInsideDiscord()) return null;

    // ТЗ §8.4: внутри Activity браузер в песочнице, прямые запросы к
    // supabase.co режутся. Маппинг обязан быть выставлен ДО первого запроса.
    const supabaseHost = new URL(ENV.supabaseUrl).host;
    patchUrlMappings([{ prefix: '/supabase', target: supabaseHost }]);

    const sdk = new DiscordSDK(ENV.discordClientId);
    await sdk.ready();
    return sdk;
  })();
  return cached;
}
