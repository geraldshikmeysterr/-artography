import { ENV } from '../env';
import { getDiscordSdk } from './discordSdk';
import { setSupabaseToken } from '../data/supabase';
import type { Session } from '../state/store';

export interface ExchangeResult {
  token: string;
  discordAccessToken: string;
  user: { id: string; username: string; avatar: string | null };
  canEdit: boolean;
  canEditReason: string | null;
}

export async function exchangeCode(
  code: string,
  guildId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangeResult> {
  const response = await fetchImpl(`${ENV.supabaseUrl}/functions/v1/discord-auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ENV.supabaseAnonKey },
    body: JSON.stringify({ code, guildId }),
  });
  if (!response.ok) {
    throw new Error(`discord-auth failed with ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as ExchangeResult;
}

function avatarUrl(userId: string, avatar: string | null): string | null {
  return avatar ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=64` : null;
}

/** Сессия вне Discord: карта только для просмотра (ТЗ §8.2). */
function localSession(): Session {
  return {
    userId: 'local',
    username: 'Локальный просмотр',
    avatarUrl: null,
    token: null,
    canEdit: import.meta.env.DEV && ENV.devCanEdit,
    canEditReason: null,
  };
}

export async function startSession(): Promise<Session> {
  const sdk = await getDiscordSdk();
  if (!sdk) return localSession();

  // Роль проверяет Edge Function бот-токеном, поэтому у пользователя просим
  // минимум — только identify.
  const { code } = await sdk.commands.authorize({
    client_id: ENV.discordClientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });

  const result = await exchangeCode(code, sdk.guildId ?? '');
  await sdk.commands.authenticate({ access_token: result.discordAccessToken });
  setSupabaseToken(result.token);

  return {
    userId: result.user.id,
    username: result.user.username,
    avatarUrl: avatarUrl(result.user.id, result.user.avatar),
    token: result.token,
    canEdit: result.canEdit,
    canEditReason: result.canEditReason ?? null,
  };
}
