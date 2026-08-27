import { create, getNumericDate } from 'https://deno.land/x/djwt@v3.0.2/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

async function signingKey(): Promise<CryptoKey> {
  // Префикс SUPABASE_ зарезервирован платформой, отсюда собственное имя.
  const secret = Deno.env.get('KARTOGRAF_JWT_SECRET');
  if (!secret) throw new Error('KARTOGRAF_JWT_SECRET is not configured');
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

const CLIENT_ID = Deno.env.get('DISCORD_CLIENT_ID') ?? '1541040745279135825';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { code, guildId } = await req.json().catch(() => ({}));
  if (!code) return json({ error: 'code is required' }, 400);

  // 1. Обмен кода на токен. client_secret живёт только здесь (ТЗ §8.2).
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: Deno.env.get('DISCORD_CLIENT_SECRET')!,
      grant_type: 'authorization_code',
      code,
    }),
  });
  if (!tokenResponse.ok) {
    return json({ error: 'token exchange failed', detail: await tokenResponse.text() }, 401);
  }
  const { access_token } = await tokenResponse.json();

  // 2. Кто это.
  const meResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meResponse.ok) return json({ error: 'identify failed' }, 401);
  const me = await meResponse.json();

  // 3. Есть ли роль редактора — спрашиваем бот-токеном (ТЗ §8.2).
  // Причина отказа возвращается явно: молчаливый false невозможно
  // диагностировать, а отличать «бота нет на сервере» от «роль не выдана»
  // нужно и пользователю, и при настройке.
  let canEdit = false;
  let reason: string | null = null;
  const editorRole = Deno.env.get('DISCORD_EDITOR_ROLE_ID');
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');

  if (!guildId) {
    reason = 'no-guild-context';
  } else if (!editorRole || !botToken) {
    reason = 'not-configured';
  } else {
    const memberResponse = await fetch(
      `https://discord.com/api/guilds/${guildId}/members/${me.id}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    );
    if (!memberResponse.ok) {
      // Чаще всего: бот не приглашён на этот сервер.
      reason = `member-lookup-failed-${memberResponse.status}`;
    } else {
      const member = await memberResponse.json();
      const roles: string[] = Array.isArray(member.roles) ? member.roles : [];
      canEdit = roles.includes(editorRole);
      if (!canEdit) reason = 'role-not-assigned';
    }
  }

  // 4. Подписываем JWT ключом проекта — его читает RLS через auth.jwt().
  const token = await create(
    { alg: 'HS256', typ: 'JWT' },
    {
      sub: me.id,
      role: 'authenticated',
      aud: 'authenticated',
      can_edit: canEdit,
      discord_username: me.username,
      exp: getNumericDate(60 * 60 * 4),
    },
    await signingKey(),
  );

  return json({
    token,
    discordAccessToken: access_token,
    user: {
      id: me.id,
      username: me.global_name ?? me.username,
      avatar: me.avatar ?? null,
    },
    canEdit,
    canEditReason: reason,
  });
});
