import { describe, it, expect, vi } from 'vitest';
import { exchangeCode } from '../src/session/session';

describe('exchangeCode', () => {
  it('posts the code to the edge function and returns the session payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'jwt',
        discordAccessToken: 'discord-token',
        user: { id: '42', username: 'gerald', avatar: null },
        canEdit: true,
      }),
    });

    const result = await exchangeCode('the-code', 'guild-1', fetchImpl as unknown as typeof fetch);

    expect(result.canEdit).toBe(true);
    expect(result.user.username).toBe('gerald');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('/functions/v1/discord-auth');
    expect(JSON.parse((init as RequestInit).body as string))
      .toEqual({ code: 'the-code', guildId: 'guild-1' });
  });

  it('throws with the status when the edge function rejects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 401, text: async () => 'bad code',
    });
    await expect(exchangeCode('x', 'g', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});
