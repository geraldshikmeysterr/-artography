# Картограф — План 04: Realtime и полировка Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Совместное редактирование в реальном времени для всех сущностей, батч-синхронизация рельефа между клиентами, Discord-посты как описания объектов, оптимизация под большие карты и финальная полировка интерфейса.

**Architecture:** Один Supabase Realtime-канал на карту подписывается на `postgres_changes` пяти таблиц сущностей и на `terrain_chunk_versions`. Векторные изменения применяются напрямую в стор сущностей. Рельеф приходит не данными, а уведомлением «чанк (x, y) изменился до ревизии N» — клиент перезагружает чанк, только если он у него загружен и его писал кто-то другой; это держит трафик в пределах бесплатного тарифа. Discord-посты тянутся Edge Function'ом с бот-токеном и кэшируются в памяти вкладки. Производительность — переиспользование `Graphics` на сущность вместо полной перерисовки каждый кадр.

**Tech Stack:** Supabase Realtime, Supabase Edge Functions (Deno), PixiJS 8, Vitest 3.

**Spec:** [`docs/KARTOGRAF_SPEC.md`](../../KARTOGRAF_SPEC.md) — разделы 8.3, 10, 11, 14 (пункты 9, 11, 12).

**Предшествует:** Планы 01, 02 и 03 выполнены полностью.

---

## Global Constraints

- Все изменения сразу видны другим пользователям — **кроме рельефа**, где синхронизация идёт батчами примерно раз в секунду. Это осознанный компромисс ради бесплатного тарифа. (ТЗ §11, §5.5)
- Ручного сохранения нет: карта — единая рабочая версия. (ТЗ §11)
- Курсоры других пользователей **не делаем**. (ТЗ §11, §13)
- Конфликты — «кто последний записал, тот и победил». Сложного разрешения конфликтов **не делаем**. (ТЗ §11, §13)
- Discord-посты: у государств, культурных регионов и точечных объектов есть `discord_post_id`; текст тянется через Edge Function с бот-токеном. ID стартового сообщения ветки/форум-поста совпадает с ID самой ветки. (ТЗ §8.3)
- Бот-токен живёт только в Edge Function. (ТЗ §8.2)
- Оптимизация под большие карты: culling чанков и объектов вне видимой области. (ТЗ §14 п. 12)
- Панели плавающие, карту не загромождают. (ТЗ §10)

---

## File Structure

```
src/
├─ realtime/
│  ├─ channel.ts              Один канал на карту, подписки и отписка
│  ├─ entityEvents.ts         postgres_changes → useEntities (юнит-тесты)
│  └─ terrainEvents.ts        terrain_chunk_versions → перезагрузка чанка
├─ data/
│  └─ discordPost.ts          Кэшированный запрос текста поста
├─ ui/
│  ├─ DiscordPostBlock.tsx    Рендер поста в панели объекта
│  └─ Hint.tsx                Подсказка управления при первом запуске
supabase/functions/discord-post/index.ts
tests/
├─ entityEvents.test.ts
└─ terrainEvents.test.ts
```

---

## Task 1: Realtime для векторных сущностей

**Files:**
- Create: `src/realtime/channel.ts`, `src/realtime/entityEvents.ts`
- Modify: `src/main.tsx`
- Test: `tests/entityEvents.test.ts`

**Interfaces:**
- Consumes: `getSupabase()`, `ENV.mapId`, `useEntities`, мапперы `rowToRegion`/`rowToState`/`rowToCultural`/`rowToPoint`/`rowToRoad` из `src/data/repository.ts`.
- Produces:
  - `type ChangeEvent = { eventType: 'INSERT'|'UPDATE'|'DELETE'; new: Record<string, any>; old: Record<string, any> }`
  - `applyEntityEvent(table: string, event: ChangeEvent, entities: EntityActions): void` — чистая функция, где
    `EntityActions = { upsert(kind, entity): void; remove(kind, id): void; setSeaLevel(v: number): void }`.
  - `subscribeToMap(): () => void` — открывает канал, вешает все подписки, возвращает отписку.

`applyEntityEvent` вынесена отдельно именно ради тестируемости: она не знает
ни про Supabase, ни про React.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/entityEvents.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyEntityEvent } from '../src/realtime/entityEvents';

const actions = () => ({ upsert: vi.fn(), remove: vi.fn(), setSeaLevel: vi.fn() });

describe('applyEntityEvent', () => {
  it('upserts a region on INSERT', () => {
    const a = actions();
    applyEntityEvent('regions', {
      eventType: 'INSERT',
      new: { id: 'r1', name: 'Долина', geometry: { type: 'Polygon', coordinates: [] },
             state_id: null, cultural_region_id: null },
      old: {},
    }, a);
    expect(a.upsert).toHaveBeenCalledWith('region', expect.objectContaining({ id: 'r1', name: 'Долина' }));
  });

  it('upserts a region on UPDATE', () => {
    const a = actions();
    applyEntityEvent('regions', {
      eventType: 'UPDATE',
      new: { id: 'r1', name: 'Переименовано', geometry: { type: 'Polygon', coordinates: [] },
             state_id: 's1', cultural_region_id: null },
      old: { id: 'r1' },
    }, a);
    expect(a.upsert).toHaveBeenCalledWith('region', expect.objectContaining({ stateId: 's1' }));
  });

  it('removes a region on DELETE using the old row', () => {
    const a = actions();
    applyEntityEvent('regions', { eventType: 'DELETE', new: {}, old: { id: 'r1' } }, a);
    expect(a.remove).toHaveBeenCalledWith('region', 'r1');
  });

  it('maps each table to its entity kind', () => {
    const cases: [string, string, Record<string, any>][] = [
      ['states', 'state', { id: 's', name: 'A', color: '#fff', discord_post_id: null }],
      ['cultural_regions', 'cultural', { id: 'c', name: 'B', color: '#fff', discord_post_id: null }],
      ['point_objects', 'point', { id: 'p', name: 'C', icon_type: 'city', x: 0, y: 0, discord_post_id: null }],
      ['roads', 'road', { id: 'd', name: null, road_type: 'major',
                          geometry: { type: 'LineString', coordinates: [] } }],
    ];
    for (const [table, kind, row] of cases) {
      const a = actions();
      applyEntityEvent(table, { eventType: 'INSERT', new: row, old: {} }, a);
      expect(a.upsert).toHaveBeenCalledWith(kind, expect.objectContaining({ id: row.id }));
    }
  });

  it('updates the sea level when the map row changes', () => {
    const a = actions();
    applyEntityEvent('maps', { eventType: 'UPDATE', new: { id: 'm', sea_level: -120 }, old: {} }, a);
    expect(a.setSeaLevel).toHaveBeenCalledWith(-120);
  });

  it('ignores an unknown table', () => {
    const a = actions();
    applyEntityEvent('unknown', { eventType: 'INSERT', new: { id: 'x' }, old: {} }, a);
    expect(a.upsert).not.toHaveBeenCalled();
    expect(a.remove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/entityEvents.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/realtime/entityEvents.ts`**

```ts
import {
  rowToRegion, rowToState, rowToCultural, rowToPoint, rowToRoad,
} from '../data/repository';
import type { EntityKind, MapEntity } from '../data/types';

export interface ChangeEvent {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, any>;
  old: Record<string, any>;
}

export interface EntityActions {
  upsert(kind: EntityKind, entity: MapEntity): void;
  remove(kind: EntityKind, id: string): void;
  setSeaLevel(value: number): void;
}

const TABLES: Record<string, { kind: EntityKind; map: (row: Record<string, any>) => MapEntity }> = {
  regions:          { kind: 'region',   map: rowToRegion },
  states:           { kind: 'state',    map: rowToState },
  cultural_regions: { kind: 'cultural', map: rowToCultural },
  point_objects:    { kind: 'point',    map: rowToPoint },
  roads:            { kind: 'road',     map: rowToRoad },
};

export function applyEntityEvent(table: string, event: ChangeEvent, actions: EntityActions): void {
  if (table === 'maps') {
    if (event.eventType !== 'DELETE' && typeof event.new.sea_level === 'number') {
      actions.setSeaLevel(event.new.sea_level);
    }
    return;
  }

  const descriptor = TABLES[table];
  if (!descriptor) return;

  if (event.eventType === 'DELETE') {
    const id = event.old?.id;
    if (id) actions.remove(descriptor.kind, id);
    return;
  }
  actions.upsert(descriptor.kind, descriptor.map(event.new));
}
```

- [ ] **Шаг 4: Реализовать `src/realtime/channel.ts`**

```ts
import { getSupabase } from '../data/supabase';
import { ENV } from '../env';
import { useEntities } from '../state/entities';
import { applyEntityEvent, type ChangeEvent, type EntityActions } from './entityEvents';
import { handleChunkVersion } from './terrainEvents';

const ENTITY_TABLES = ['regions', 'states', 'cultural_regions', 'point_objects', 'roads', 'maps'];

export function subscribeToMap(): () => void {
  const channel = getSupabase().channel(`map:${ENV.mapId}`);

  const actions: EntityActions = {
    upsert: (kind, entity) => useEntities.getState().upsert(kind, entity),
    remove: (kind, id) => useEntities.getState().remove(kind, id),
    setSeaLevel: (value) => useEntities.getState().setSeaLevel(value),
  };

  for (const table of ENTITY_TABLES) {
    const filter = table === 'maps' ? `id=eq.${ENV.mapId}` : `map_id=eq.${ENV.mapId}`;
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter },
      (payload) => applyEntityEvent(table, payload as unknown as ChangeEvent, actions));
  }

  channel.on('postgres_changes',
    { event: '*', schema: 'public', table: 'terrain_chunk_versions', filter: `map_id=eq.${ENV.mapId}` },
    (payload) => handleChunkVersion(payload.new as Record<string, any>));

  channel.subscribe();
  return () => { void getSupabase().removeChannel(channel); };
}
```

- [ ] **Шаг 5: Подключить в `main.tsx`**

После `loadAll()` вызвать `subscribeToMap()`. Отписка при `beforeunload`.

- [ ] **Шаг 6: Проверить вручную в двух вкладках**

Run: `npm run dev`, открыть приложение в двух окнах (в обоих —
`VITE_DEV_CAN_EDIT=true`).
1. Создать регион в первом окне — он появляется во втором без перезагрузки.
2. Переименовать государство — имя и цвет обновляются во втором окне.
3. Удалить точечный объект — он исчезает во втором окне; если он был там
   выбран, панель объекта закрывается.
4. Подвинуть уровень моря — вода во втором окне перестраивается.

- [ ] **Шаг 7: Коммит**

```bash
git add src/realtime tests/entityEvents.test.ts src/main.tsx
git commit -m "feat: realtime synchronisation of vector entities across clients"
```

---

## Task 2: Realtime для рельефа

**Files:**
- Create: `src/realtime/terrainEvents.ts`
- Modify: `src/map/MapCanvas.tsx`
- Test: `tests/terrainEvents.test.ts`

**Interfaces:**
- Consumes: `CLIENT_ID`, `TerrainSync`, `ChunkStore`.
- Produces:
  - `registerTerrainSync(store: ChunkStore, sync: TerrainSync): void` — отдаёт модулю ссылки, которые нужны обработчику.
  - `handleChunkVersion(row: Record<string, any>): void` — реакция на строку `terrain_chunk_versions`.
  - `shouldReloadChunk(row: { chunk_x: number; chunk_y: number; last_writer: string | null }, clientId: string, isLoaded: (cx: number, cy: number) => boolean): boolean` — чистая функция решения, вынесена ради тестов.

Правило: перезагружаем чанк, **только** если (а) его писал не я и (б) он у
меня загружен. Чужие правки в невидимой области подтянутся сами, когда
камера туда доедет — `ensureLoaded` возьмёт свежую версию. Это и есть
экономия трафика из ТЗ §5.5.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/terrainEvents.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldReloadChunk } from '../src/realtime/terrainEvents';

const loadedEverywhere = () => true;
const loadedNowhere = () => false;

describe('shouldReloadChunk', () => {
  it('reloads a loaded chunk written by somebody else', () => {
    expect(shouldReloadChunk(
      { chunk_x: 1, chunk_y: 2, last_writer: 'other' }, 'me', loadedEverywhere)).toBe(true);
  });

  it('ignores the echo of our own write', () => {
    expect(shouldReloadChunk(
      { chunk_x: 1, chunk_y: 2, last_writer: 'me' }, 'me', loadedEverywhere)).toBe(false);
  });

  it('ignores a chunk we do not have loaded', () => {
    expect(shouldReloadChunk(
      { chunk_x: 9, chunk_y: 9, last_writer: 'other' }, 'me', loadedNowhere)).toBe(false);
  });

  it('reloads when the writer is unknown', () => {
    expect(shouldReloadChunk(
      { chunk_x: 0, chunk_y: 0, last_writer: null }, 'me', loadedEverywhere)).toBe(true);
  });
});
```

- [ ] **Шаг 2: Прогнать — падает**

Run: `npm test -- tests/terrainEvents.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/realtime/terrainEvents.ts`**

```ts
import type { ChunkStore } from '../map/terrain/chunkStore';
import { CLIENT_ID, type TerrainSync } from '../map/terrain/terrainSync';

let store: ChunkStore | null = null;
let sync: TerrainSync | null = null;

export function registerTerrainSync(nextStore: ChunkStore, nextSync: TerrainSync): void {
  store = nextStore;
  sync = nextSync;
}

export function shouldReloadChunk(
  row: { chunk_x: number; chunk_y: number; last_writer: string | null },
  clientId: string,
  isLoaded: (cx: number, cy: number) => boolean,
): boolean {
  if (row.last_writer === clientId) return false;      // эхо собственной записи
  return isLoaded(row.chunk_x, row.chunk_y);
}

export function handleChunkVersion(row: Record<string, any>): void {
  if (!store || !sync) return;
  const typed = {
    chunk_x: row.chunk_x as number,
    chunk_y: row.chunk_y as number,
    last_writer: (row.last_writer ?? null) as string | null,
  };
  if (!shouldReloadChunk(typed, CLIENT_ID, (cx, cy) => store!.has(cx, cy))) return;
  void sync.reload(typed.chunk_x, typed.chunk_y);
}
```

- [ ] **Шаг 4: Зарегистрировать sync в `MapCanvas.tsx`**

После создания `store`, `layer` и `sync` вызвать
`registerTerrainSync(store, sync)`.

Важно: не перезагружать чанк, пока пользователь **сам** его рисует —
иначе чужой снепшот затрёт незавершённый мазок. Добавить в `terrainEvents`
проверку «идёт ли сейчас мазок» через флаг, который выставляет
`makeTerrainHandlers` (`onStart` → true, `onFinish`/`onCancel` → false);
отложенные перезагрузки применить после `flush()`. Это ровно модель ТЗ §11
«кто последний записал, тот и победил», но без потери текущего мазка.

- [ ] **Шаг 5: Прогнать тесты**

Run: `npm test -- tests/terrainEvents.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 6: Проверить вручную в двух вкладках**

1. В первом окне нарисовать холм. Во втором он появляется с задержкой около
   секунды — это ожидаемое поведение (ТЗ §5.5, §11).
2. Во вкладке Network второго окна: приходят маленькие realtime-сообщения и
   один `fetch_chunks` на изменённый чанк, а **не** поток мазков.
3. Отъехать во втором окне так, чтобы чанк выгрузился, порисовать в первом,
   вернуться — рельеф актуален (подтянулся через `ensureLoaded`).

- [ ] **Шаг 7: Коммит**

```bash
git add src/realtime/terrainEvents.ts src/map/MapCanvas.tsx tests/terrainEvents.test.ts
git commit -m "feat: batched terrain synchronisation via lightweight chunk version events"
```

---

## Task 3: Discord-посты как описания объектов

**Files:**
- Create: `supabase/functions/discord-post/index.ts`, `src/data/discordPost.ts`, `src/ui/DiscordPostBlock.tsx`
- Modify: `src/ui/ObjectPanel.tsx`

**Interfaces:**
- Consumes: секрет `DISCORD_BOT_TOKEN`; JWT сессии для авторизации вызова.
- Produces:
  - `GET /functions/v1/discord-post?id=<threadOrMessageId>` → `200 { title: string | null, content: string, authorName: string | null }`, `404 { error }`.
  - `fetchDiscordPost(id: string): Promise<DiscordPost | null>` — с кэшем в `Map` на время жизни вкладки.
  - `<DiscordPostBlock postId={string | null} />`.

Правило Discord (ТЗ §8.3): ID стартового сообщения ветки/форум-поста совпадает
с ID самой ветки, поэтому один и тот же ID работает и как `channelId`, и как
`messageId`: `GET /channels/{id}` даёт заголовок ветки, `GET /channels/{id}/messages/{id}`
даёт текст стартового сообщения.

- [ ] **Шаг 1: Реализовать Edge Function**

`supabase/functions/discord-post/index.ts`:

```ts
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const id = new URL(req.url).searchParams.get('id');
  if (!id || !/^\d{5,25}$/.test(id)) return json({ error: 'bad id' }, 400);

  const bot = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!bot) return json({ error: 'bot token not configured' }, 500);
  const auth = { Authorization: `Bot ${bot}` };

  // ID ветки == ID её стартового сообщения (ТЗ §8.3).
  const channelResponse = await fetch(`https://discord.com/api/channels/${id}`, { headers: auth });
  if (!channelResponse.ok) return json({ error: 'post not found' }, 404);
  const channel = await channelResponse.json();

  const messageResponse = await fetch(
    `https://discord.com/api/channels/${id}/messages/${id}`, { headers: auth });
  const message = messageResponse.ok ? await messageResponse.json() : null;

  return json({
    title: channel.name ?? null,
    content: message?.content ?? '',
    authorName: message?.author?.global_name ?? message?.author?.username ?? null,
  });
});
```

- [ ] **Шаг 2: Задеплоить и проверить**

```bash
supabase functions deploy discord-post
curl -s "$VITE_SUPABASE_URL/functions/v1/discord-post?id=<реальный_id_форум_поста>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN"
```
Expected: JSON с заголовком и текстом поста. Если `404` — бот не видит канал,
проверить его права на сервере (нужно `Read Message History`).

- [ ] **Шаг 3: Реализовать `src/data/discordPost.ts`**

```ts
import { ENV } from '../env';
import { useAppStore } from '../state/store';

export interface DiscordPost { title: string | null; content: string; authorName: string | null }

const cache = new Map<string, Promise<DiscordPost | null>>();

export function fetchDiscordPost(id: string): Promise<DiscordPost | null> {
  const cached = cache.get(id);
  if (cached) return cached;

  const request = (async (): Promise<DiscordPost | null> => {
    const token = useAppStore.getState().session?.token;
    const response = await fetch(
      `${ENV.supabaseUrl}/functions/v1/discord-post?id=${encodeURIComponent(id)}`,
      {
        headers: {
          apikey: ENV.supabaseAnonKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as DiscordPost;
  })();

  cache.set(id, request);
  return request;
}

export function invalidateDiscordPost(id: string): void { cache.delete(id); }
```

- [ ] **Шаг 4: Реализовать `<DiscordPostBlock />` и вставить в панель**

```tsx
import { useEffect, useState } from 'react';
import { fetchDiscordPost, type DiscordPost } from '../data/discordPost';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; post: DiscordPost };

export function DiscordPostBlock({ postId }: { postId: string | null }) {
  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!postId) { setState({ status: 'idle' }); return; }
    let cancelled = false;
    setState({ status: 'loading' });
    void fetchDiscordPost(postId).then((post) => {
      if (cancelled) return;
      setState(post ? { status: 'ready', post } : { status: 'empty' });
    });
    return () => { cancelled = true; };
  }, [postId]);

  if (state.status === 'idle') return null;

  const box: React.CSSProperties = {
    marginTop: 12, paddingTop: 12, borderTop: '1px solid #263041', fontSize: 13,
  };

  if (state.status === 'loading') {
    return <div style={{ ...box, opacity: .55 }}>Загружаем описание…</div>;
  }
  if (state.status === 'empty') {
    return (
      <div style={{ ...box, opacity: .55 }}>
        Пост не найден или у бота нет к нему доступа.
      </div>
    );
  }

  return (
    <div style={box}>
      {state.post.title && (
        <div style={{ fontWeight: 600, marginBottom: 2 }}>{state.post.title}</div>
      )}
      {state.post.authorName && (
        <div style={{ fontSize: 11, opacity: .5, marginBottom: 8 }}>{state.post.authorName}</div>
      )}
      <div style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflowY: 'auto', lineHeight: 1.45 }}>
        {state.post.content}
      </div>
    </div>
  );
}
```

Вставить `<DiscordPostBlock postId={…} />` в `<ObjectPanel />` в ветки
государства, культурного региона и точечного объекта (ТЗ §8.3 — именно у этих
трёх есть `discord_post_id`), сразу после полей формы. У обычного региона
поста нет (ТЗ §4.1) — блок не показывать.

- [ ] **Шаг 5: Проверить вручную**

Указать реальный ID форум-поста у государства, открыть панель — текст
подтягивается. Указать мусорный ID — аккуратное сообщение вместо ошибки.

- [ ] **Шаг 6: Коммит**

```bash
git add supabase/functions/discord-post src/data/discordPost.ts src/ui
git commit -m "feat: Discord post descriptions fetched through a bot-token edge function"
```

---

## Task 4: Производительность и culling

**Files:**
- Modify: `src/map/regionsLayer.ts`, `src/map/pointsLayer.ts`, `src/map/roadsLayer.ts`

**Interfaces:**
- Produces: те же публичные интерфейсы слоёв, изменения внутренние.

Задача: убрать полную перерисовку всех сущностей каждый кадр. Сейчас каждый
слой делает `Graphics.clear()` и обходит все сущности — на карте из сотен
регионов это узкое место при панорамировании.

- [ ] **Шаг 1: Перевести слой регионов на `Graphics` по сущности**

Ядро оптимизации — подпись состояния: пока она не менялась, `Graphics` не
трогаем вообще. Толщина обводки зависит от зума, поэтому зум входит в подпись
огрублённым до 5 % — иначе перерисовка шла бы на каждый тик колеса.

```ts
interface RegionView { graphics: Graphics; label: Text; signature: string }

const views = new Map<string, RegionView>();
const zoomBucket = (zoom: number) => Math.round(Math.log(zoom) / Math.log(1.05));

function signatureOf(
  region: RegionEntity, style: RegionStyle, selected: boolean, zoom: number,
): string {
  return [
    region.geometry.type,
    JSON.stringify(region.geometry.coordinates).length,  // дешёвый прокси изменения
    region.name,
    style.fill ?? 'none',
    style.stroke,
    selected ? 1 : 0,
    zoomBucket(zoom),
  ].join('|');
}

function update(camera: Camera, viewport: Viewport) {
  const { regions, states, culturalRegions, selection } = useEntities.getState();
  const mode = useAppStore.getState().displayMode;
  const [minX, minY, maxX, maxY] = visibleWorldBounds(camera, viewport);

  // Удаляем ушедшие из стора.
  for (const [id, regionView] of [...views]) {
    if (regions.has(id)) continue;
    regionView.graphics.destroy();
    regionView.label.destroy();
    views.delete(id);
  }

  for (const region of regions.values()) {
    let regionView = views.get(region.id);
    if (!regionView) { regionView = makeRegionView(); views.set(region.id, regionView); }

    const [rMinX, rMinY, rMaxX, rMaxY] = geometryBBox(region.geometry);
    const visible = !(rMaxX < minX || rMinX > maxX || rMaxY < minY || rMinY > maxY);
    regionView.graphics.visible = visible;
    regionView.label.visible = visible && camera.zoom > 0.25;
    if (!visible) continue;      // culling: невидимое не перерисовываем

    const style = regionStyle(region, mode, states, culturalRegions);
    const selected = selection?.kind === 'region' && selection.id === region.id;
    const signature = signatureOf(region, style, selected, camera.zoom);
    if (regionView.signature === signature) continue;   // ничего не изменилось
    regionView.signature = signature;

    regionView.graphics.clear();
    tracePolygon(regionView.graphics, region.geometry);
    if (style.fill !== null) regionView.graphics.fill({ color: style.fill, alpha: style.fillAlpha });
    regionView.graphics.stroke({
      width: (selected ? 3 : 1.5) / camera.zoom,
      color: selected ? 0xffd479 : style.stroke,
      alpha: style.strokeAlpha,
    });

    const centre = geometryCentroid(region.geometry);
    regionView.label.text = region.name;
    regionView.label.position.set(centre.x, centre.y);
    regionView.label.scale.set(1 / camera.zoom);
  }
}
```

- [ ] **Шаг 2: То же для точечных объектов и дорог**

Точечные объекты: контейнер на объект уже есть по Task 13 Плана 02 — добавить
`visible` по bbox и пересоздание иконки только при смене `iconType`.
Дороги: `Graphics` на дорогу, перерисовка по `signature = geometryRevision + roadType + selected`.

- [ ] **Шаг 3: Ограничить рельеф на предельном отдалении**

В `terrainLayer.update`: если `CHUNK_WORLD * camera.zoom < 8`, чанк меньше
восьми экранных пикселей и изолинии нечитаемы — не создавать для него `Mesh`.

- [ ] **Шаг 4: Замерить**

Сценарий нагрузки: 200 регионов, 300 точечных объектов, 80 дорог, рельеф на
8×8 чанков. Через Chrome DevTools MCP снять трассу панорамирования и зума.

Expected: ≥ 55 FPS при панорамировании, ≥ 50 FPS при зуме, отсутствие
всплесков GC от пересоздания `Graphics` каждый кадр.

Записать замеры до/после в `docs/PERFORMANCE.md` одной таблицей.

- [ ] **Шаг 5: Коммит**

```bash
npm test
git add src/map docs/PERFORMANCE.md
git commit -m "perf: per-entity graphics reuse, visibility culling and terrain zoom cutoff"
```

---

## Task 5: Полировка интерфейса

**Files:**
- Modify: `src/ui/*`, `src/App.tsx`
- Create: `src/ui/Hint.tsx`

- [ ] **Шаг 1: Свести панели в единый стиль**

Общие токены в одном модуле `src/ui/theme.ts`: фон панели
`rgba(13,17,23,.86)`, рамка `#263041`, радиус 12, отступ 8/12, шрифт 13/14,
акцент `#2f6feb`, выделение `#ffd479`. Все панели используют только их.

- [ ] **Шаг 2: Проверить требования ТЗ §10 по списку**

- Карта занимает всё доступное пространство, панели плавают поверх.
- Панель инструментов содержит **ровно шесть** кнопок в порядке ТЗ, ничего
  лишнего не добавилось за четыре плана.
- У «Дороги» индикатор из двух точек, переключение повторным кликом.
- Отдельного режима «Обзор»/«Перемещение» нет; клик выбирает объект при
  любом активном инструменте.
- Панорамирование — только средней кнопкой; левая кнопка никогда не двигает
  карту.
- Панель выбранного объекта показывает действия именно для его типа.
- `grep -rn "prompt(\|alert(\|confirm(" src/` не находит ничего.

- [ ] **Шаг 3: Добавить подсказку управления**

`<Hint />` — небольшая плашка внизу по центру: «Перемещение — зажатое
колёсико · Зум — колёсико · Alt с кистью рельефа — понижение». Скрывается
по клику и запоминает это в `localStorage` (ключ `kartograf.hintDismissed`),
в `try/catch` на случай запрета хранилища.

- [ ] **Шаг 4: Состояние «только просмотр»**

При `session.canEdit === false`: панель инструментов и панель рельефа
скрыты, в панели объекта видны только описания без кнопок изменения,
поиск и переключатель режимов работают. Проверить в Discord под
пользователем без роли.

- [ ] **Шаг 5: Коммит**

```bash
git add src/ui src/App.tsx
git commit -m "polish: unified panel theme, control hint and read-only presentation"
```

---

## Task 6: Финальная проверка и README

**Files:**
- Create: `README.md` (заменить сгенерированный Vite)

- [ ] **Шаг 1: Написать README**

Разделы: что это, скриншот, стек, требуемые переменные окружения (со ссылкой
на `.env.example`), локальный запуск, применение миграций, деплой Edge
Functions, деплой на Vercel, настройка Discord Activity (Root Mapping и URL
Mapping `/supabase`), как запустить тесты. Отдельным блоком — три осознанных
отклонения от ТЗ из индекса планов, чтобы будущий читатель не считал их багами.

- [ ] **Шаг 2: Прогнать полный набор проверок**

```bash
npm test
npm run build
grep -rn "prompt(\|alert(\|confirm(" src/ || echo "no blocking dialogs"
```
Expected: все тесты зелёные, сборка без ошибок, третья команда печатает
`no blocking dialogs`.

- [ ] **Шаг 3: Сквозная проверка в Discord вдвоём**

Открыть Activity на двух аккаунтах — с ролью редактора и без.
1. Редактор рисует регион, назначает государство — второй видит сразу.
2. Редактор рисует рельеф — второй видит через ~1 секунду.
3. Второй пробует изменить объект — панель редактирования недоступна;
   попытка прямого запроса к PostgREST отклоняется RLS.
4. Поиск находит объект и долетает камерой.
5. Мост появляется на дороге через воду.

- [ ] **Шаг 4: Финальный коммит и деплой**

```bash
git add README.md
git commit -m "docs: project README with setup, deployment and spec deviations"
git push
vercel deploy --prod
```

---

## Definition of Done для Плана 04

- Изменения любой векторной сущности видны в другом клиенте без перезагрузки.
- Рельеф синхронизируется батчами примерно раз в секунду; в realtime летят
  уведомления о версии чанка, а не 8 КБ данных каждому клиенту.
- Собственные записи не вызывают лишней перезагрузки чанка; чужая запись не
  затирает мазок, который пользователь рисует прямо сейчас.
- Discord-посты подтягиваются и показываются в панели государств, культурных
  регионов и точечных объектов.
- ≥ 55 FPS на нагруженной сцене при панорамировании, замеры записаны в
  `docs/PERFORMANCE.md`.
- Интерфейс соответствует ТЗ §10 по всем пунктам, `prompt`/`alert`/`confirm`
  отсутствуют.
- README описывает установку, деплой и осознанные отклонения от ТЗ.
