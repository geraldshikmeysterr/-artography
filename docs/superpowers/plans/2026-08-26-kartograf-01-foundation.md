# Картограф — План 01: Каркас Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать репозиторий Картографа с бесконечным холстом PixiJS внутри Discord Activity, с базой Supabase (схема + RLS) и серверной проверкой Discord-роли, задеплоенный на Vercel.

**Architecture:** Vite + React 19 + TypeScript. React отвечает только за плавающие панели интерфейса; вся карта — один `<canvas>` под управлением PixiJS v8, живущий вне React-дерева и обновляемый императивно. Общее состояние — Zustand-стор, который читают и React-панели, и Pixi-слои. Авторизация: фронтенд получает OAuth-код через Discord Embedded App SDK, отдаёт его в Supabase Edge Function, та обменивает код на токен своим `client_secret`, проверяет роль через бот-токен и возвращает подписанный ключом проекта JWT с claim `can_edit`. Этот JWT используется как `Authorization` для PostgREST и Realtime, а RLS-политики читают из него `can_edit`.

**Tech Stack:** Vite 6, React 19, TypeScript 5, PixiJS 8, Zustand 5, `@supabase/supabase-js` 2, `@discord/embedded-app-sdk` 2, Vitest 3, Supabase CLI, Vercel.

**Spec:** [`docs/KARTOGRAF_SPEC.md`](../../KARTOGRAF_SPEC.md) — разделы 1, 8, 10 (навигация), 12, 14 (пункты 1–2).

---

## Global Constraints

- Все сервисы — **бесплатные тарифы** (Supabase free, Vercel free/hobby). Решения, увеличивающие трафик к Supabase, требуют обоснования. (ТЗ §1, §12)
- Существующий Supabase-проект: ref `tomumajlfnqmcmcraawy`. Старые таблицы (`rivers`, `lakes`, `seas`) **сносятся**, схема создаётся заново. (ТЗ §1)
- GitHub-репозиторий: `github.com/geraldshikmeysterr/-artography`, публичный, пустой. (ТЗ §1)
- `client_secret` Discord и бот-токен **никогда не попадают в браузер** — только внутри Supabase Edge Functions. (ТЗ §8.2)
- Внутри Discord Activity прямые запросы к `*.supabase.co` блокируются: обязателен URL Mapping `/supabase → tomumajlfnqmcmcraawy.supabase.co` в Developer Portal **и** вызов `patchUrlMappings` на старте фронтенда. (ТЗ §8.4)
- **Перемещение по карте — только зажатым средним колесом мыши (кнопка 1) + drag. Левая кнопка никогда не панорамирует.** Зум — вращение колеса. (ТЗ §10)
- Отдельного режима «Обзор»/«Перемещение» нет: клик по объекту работает всегда, независимо от активного инструмента. (ТЗ §10)
- Никаких `prompt()`, `alert()`, `confirm()` в продуктовом коде. (ТЗ §10)
- Право редактирования — одно общее булево `can_edit`, гранулярных прав нет. Без роли — карта только для просмотра. (ТЗ §8.2, §13)
- Язык интерфейса — русский; код, имена файлов и коммиты — английский.

---

## File Structure

```
/
├─ index.html                      Точка входа Vite, тёмный фон, full-viewport
├─ package.json / tsconfig.json / vite.config.ts / vitest.config.ts
├─ .env.example                    Список публичных VITE_* переменных
├─ .gitignore
├─ README.md
├─ docs/KARTOGRAF_SPEC.md          ТЗ (уже существует)
├─ src/
│  ├─ main.tsx                     Bootstrap: сессия → рендер <App/>
│  ├─ App.tsx                      Каркас: <MapCanvas/> + слой панелей
│  ├─ env.ts                       Типизированное чтение import.meta.env
│  ├─ session/
│  │  ├─ discordSdk.ts             Инициализация DiscordSDK + patchUrlMappings
│  │  └─ session.ts                createSession(): OAuth → {token, user, canEdit}
│  ├─ data/
│  │  └─ supabase.ts               Клиент Supabase с JWT сессии
│  ├─ state/
│  │  └─ store.ts                  Zustand: session, camera, viewport, tool
│  ├─ map/
│  │  ├─ camera.ts                 ЧИСТАЯ математика камеры (юнит-тесты)
│  │  ├─ MapCanvas.tsx             React-обёртка: монтирует Pixi в div
│  │  ├─ stage.ts                  createStage(): Application + контейнеры слоёв
│  │  ├─ cameraInput.ts            Обработчики колеса/среднего drag → камера
│  │  └─ gridLayer.ts              Фоновая сетка (визуальный якорь бесконечности)
│  └─ ui/
│     └─ StatusBadge.tsx           «Только просмотр» / имя пользователя
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/0001_init.sql     Схема, RLS, RPC, realtime-публикация
│  └─ functions/discord-auth/index.ts
└─ tests/
   ├─ camera.test.ts
   └─ session.test.ts
```

---

## Task 0: Ручные предусловия (человек, не агент)

Эти шаги делает владелец аккаунтов. Агент не может их выполнить и должен
остановиться и попросить, если чего-то не хватает.

- [ ] **Шаг 1: Ротация утёкших секретов** (ТЗ §1)

Supabase → Settings → API → Reset/Roll для `service_role` key.
Discord Developer Portal → OAuth2 → Reset Secret для Client Secret.
Причина: оба значения ранее пересылались в переписке с ассистентом.

- [ ] **Шаг 2: Создать Discord-бота и пригласить на сервер**

Developer Portal → приложение Картографа → Bot → Add Bot → скопировать токен.
Пригласить бота на сервер со scope `bot` и правом `Read Message History`
(нужно для чтения текстов постов в Плане 04).

- [ ] **Шаг 3: Собрать значения и положить их в `.env.local`**

Нужны: Discord Application (Client) ID, Client Secret, Bot Token, Guild ID
сервера, ID роли редакторов, Supabase URL / anon key / JWT secret
(Settings → API → JWT Settings → JWT Secret).

- [ ] **Шаг 4: Установить CLI**

```bash
npm i -g vercel
npm i -g supabase
supabase login
vercel login
```

---

## Task 1: Скелет проекта, сборка и тестовый прогон

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `.gitignore`, `.env.example`, `README.md`
- Create: `src/main.tsx`, `src/App.tsx`, `src/env.ts`
- Test: `tests/env.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces: `readEnv(source: Record<string,string|undefined>): AppEnv` где
  `AppEnv = { discordClientId: string; supabaseUrl: string; supabaseAnonKey: string; mapId: string }`;
  константа `ENV: AppEnv` из `src/env.ts`.

- [ ] **Шаг 1: Инициализировать репозиторий и зависимости**

```bash
cd "c:/Users/Gerald/Desktop/Сartography"
git init -b main
npm create vite@latest . -- --template react-ts --yes
npm install
npm install pixi.js@^8 zustand@^5 @supabase/supabase-js@^2 @discord/embedded-app-sdk@^2 @turf/turf@^7
npm install -D vitest@^3 @vitest/coverage-v8 jsdom
```

Если `npm create vite` откажется писать в непустую папку — создать в
`./tmp-scaffold` и перенести содержимое, затем удалить `tmp-scaffold`.

- [ ] **Шаг 2: Настроить Vitest**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

Добавить в `package.json` скрипты:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Шаг 3: Написать падающий тест на чтение окружения**

`tests/env.test.ts`:

```ts
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
      .toThrowError(/VITE_SUPABASE_URL/);
  });
});
```

- [ ] **Шаг 4: Прогнать тест и убедиться, что он падает**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "../src/env"`.

- [ ] **Шаг 5: Реализовать `src/env.ts`**

```ts
export interface AppEnv {
  discordClientId: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mapId: string;
}

type RawEnv = Record<string, string | undefined>;

function required(source: RawEnv, key: string): string {
  const value = source[key];
  if (!value) throw new Error(`Missing environment variable ${key}`);
  return value;
}

export function readEnv(source: RawEnv): AppEnv {
  return {
    discordClientId: required(source, 'VITE_DISCORD_CLIENT_ID'),
    supabaseUrl: required(source, 'VITE_SUPABASE_URL'),
    supabaseAnonKey: required(source, 'VITE_SUPABASE_ANON_KEY'),
    mapId: required(source, 'VITE_MAP_ID'),
  };
}

export const ENV: AppEnv = readEnv(import.meta.env as unknown as RawEnv);
```

- [ ] **Шаг 6: Прогнать тест и убедиться, что он проходит**

Run: `npm test`
Expected: PASS, 2 теста.

- [ ] **Шаг 7: Заполнить `index.html`, `.env.example`, `.gitignore`**

`index.html` (тело — единственный монтируемый div, тёмный фон, без скролла):

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Картограф</title>
    <style>
      html, body, #root { height: 100%; margin: 0; overflow: hidden; background: #0d1117; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; color: #e6edf3; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`.env.example`:

```
VITE_DISCORD_CLIENT_ID=
VITE_SUPABASE_URL=https://tomumajlfnqmcmcraawy.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_MAP_ID=
```

Дописать в `.gitignore`: `.env.local`, `.vercel`, `supabase/.temp`.

- [ ] **Шаг 8: Собрать проект и закоммитить**

```bash
npm run build
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript project with Vitest"
git remote add origin https://github.com/geraldshikmeysterr/-artography.git
git push -u origin main
```

---

## Task 2: Схема Supabase, RLS и RPC

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/config.toml` (генерируется `supabase init`)

**Interfaces:**
- Consumes: ничего.
- Produces: таблицы `maps`, `states`, `cultural_regions`, `regions`,
  `point_objects`, `roads`, `terrain_chunks`, `terrain_chunk_versions`;
  функции `can_edit() → boolean`,
  `fetch_chunks(p_map_id uuid, p_min_x int, p_max_x int, p_min_y int, p_max_y int) → setof (chunk_x int, chunk_y int, heights_b64 text)`,
  `save_chunks(p_map_id uuid, p_chunks jsonb, p_client_id text) → void`.
  Realtime-публикация на все таблицы кроме `terrain_chunks`.

- [ ] **Шаг 1: Инициализировать Supabase и подключить проект**

```bash
supabase init
supabase link --project-ref tomumajlfnqmcmcraawy
```

- [ ] **Шаг 2: Написать миграцию**

`supabase/migrations/0001_init.sql`:

```sql
-- Снести таблицы предыдущей попытки (ТЗ §1).
drop table if exists rivers, lakes, seas, bridges cascade;
drop table if exists terrain_chunk_versions, terrain_chunks, roads,
                     point_objects, regions, cultural_regions, states, maps cascade;

create extension if not exists pgcrypto;

-- Право редактирования приходит одним claim'ом в JWT (ТЗ §8.2).
create or replace function can_edit() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'can_edit')::boolean, false);
$$;

create table maps (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sea_level  smallint not null default 0,
  created_at timestamptz not null default now()
);

create table states (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid not null references maps(id) on delete cascade,
  name            text not null,
  color           text not null,
  discord_post_id text,
  created_at      timestamptz not null default now()
);

create table cultural_regions (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid not null references maps(id) on delete cascade,
  name            text not null,
  color           text not null,
  discord_post_id text,
  created_at      timestamptz not null default now()
);

-- ТЗ §4.3: один культурный регион на регион (упрощение MVP), поэтому FK,
-- а не таблица многие-ко-многим из §3.
create table regions (
  id                 uuid primary key default gen_random_uuid(),
  map_id             uuid not null references maps(id) on delete cascade,
  name               text not null,
  geometry           jsonb not null,
  state_id           uuid references states(id) on delete set null,
  cultural_region_id uuid references cultural_regions(id) on delete set null,
  updated_at         timestamptz not null default now()
);
create index regions_map_idx on regions(map_id);

create table point_objects (
  id              uuid primary key default gen_random_uuid(),
  map_id          uuid not null references maps(id) on delete cascade,
  name            text not null,
  icon_type       text not null check (icon_type in
                    ('capital','city','village','fortress','dungeon','cave','resource')),
  x               double precision not null,
  y               double precision not null,
  discord_post_id text,
  updated_at      timestamptz not null default now()
);
create index point_objects_map_idx on point_objects(map_id);

create table roads (
  id         uuid primary key default gen_random_uuid(),
  map_id     uuid not null references maps(id) on delete cascade,
  name       text,
  road_type  text not null check (road_type in ('major','minor')),
  geometry   jsonb not null,
  updated_at timestamptz not null default now()
);
create index roads_map_idx on roads(map_id);

-- Высоты: Int16 little-endian, 64*64 ячеек = 8192 байта (ТЗ §5.2).
create table terrain_chunks (
  map_id     uuid not null references maps(id) on delete cascade,
  chunk_x    int not null,
  chunk_y    int not null,
  heights    bytea not null,
  updated_at timestamptz not null default now(),
  primary key (map_id, chunk_x, chunk_y)
);

-- Realtime не должен таскать 8 КБ bytea каждому клиенту: публикуем только
-- лёгкие «версии», клиент сам решает, нужен ли ему этот чанк (ТЗ §5.5).
create table terrain_chunk_versions (
  map_id      uuid not null references maps(id) on delete cascade,
  chunk_x     int not null,
  chunk_y     int not null,
  rev         bigint not null default 1,
  last_writer text,
  updated_at  timestamptz not null default now(),
  primary key (map_id, chunk_x, chunk_y)
);

create or replace function fetch_chunks(
  p_map_id uuid, p_min_x int, p_max_x int, p_min_y int, p_max_y int)
returns table (chunk_x int, chunk_y int, heights_b64 text)
language sql stable security invoker as $$
  select t.chunk_x, t.chunk_y, encode(t.heights, 'base64')
  from terrain_chunks t
  where t.map_id = p_map_id
    and t.chunk_x between p_min_x and p_max_x
    and t.chunk_y between p_min_y and p_max_y;
$$;

create or replace function save_chunks(
  p_map_id uuid, p_chunks jsonb, p_client_id text)
returns void language plpgsql security invoker as $$
begin
  if not can_edit() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into terrain_chunks (map_id, chunk_x, chunk_y, heights, updated_at)
  select p_map_id, (c->>'x')::int, (c->>'y')::int, decode(c->>'d', 'base64'), now()
  from jsonb_array_elements(p_chunks) c
  on conflict (map_id, chunk_x, chunk_y)
  do update set heights = excluded.heights, updated_at = now();

  insert into terrain_chunk_versions (map_id, chunk_x, chunk_y, rev, last_writer, updated_at)
  select p_map_id, (c->>'x')::int, (c->>'y')::int, 1, p_client_id, now()
  from jsonb_array_elements(p_chunks) c
  on conflict (map_id, chunk_x, chunk_y)
  do update set rev = terrain_chunk_versions.rev + 1,
                last_writer = excluded.last_writer,
                updated_at = now();
end $$;

-- RLS: читать может любой, писать — только с can_edit (ТЗ §8.2).
do $$
declare t text;
begin
  foreach t in array array['maps','states','cultural_regions','regions',
                           'point_objects','roads','terrain_chunks',
                           'terrain_chunk_versions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (true)', t || '_read', t);
    execute format('create policy %I on %I for insert with check (can_edit())', t || '_insert', t);
    execute format('create policy %I on %I for update using (can_edit()) with check (can_edit())', t || '_update', t);
    execute format('create policy %I on %I for delete using (can_edit())', t || '_delete', t);
  end loop;
end $$;

alter publication supabase_realtime add table
  maps, states, cultural_regions, regions, point_objects, roads,
  terrain_chunk_versions;

-- Единственная карта проекта.
insert into maps (id, name, sea_level)
values ('00000000-0000-0000-0000-000000000001', 'Основная карта', 0);
```

- [ ] **Шаг 3: Применить миграцию**

Run: `supabase db push`
Expected: `Finished supabase db push.` без ошибок.

- [ ] **Шаг 4: Проверить, что анонимный ключ читает, но не пишет**

```bash
curl -s "$VITE_SUPABASE_URL/rest/v1/maps?select=id,name,sea_level" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY"
```
Expected: массив с одной картой `Основная карта`.

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/states" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"map_id":"00000000-0000-0000-0000-000000000001","name":"x","color":"#fff"}'
```
Expected: ошибка `new row violates row-level security policy`.

- [ ] **Шаг 5: Записать `VITE_MAP_ID` в `.env.local` и закоммитить**

```bash
git add supabase
git commit -m "feat: initial Supabase schema, RLS policies and terrain chunk RPCs"
```

---

## Task 3: Математика камеры (чистые функции)

**Files:**
- Create: `src/map/camera.ts`
- Test: `tests/camera.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `interface Camera { x: number; y: number; zoom: number }`
  - `interface Viewport { width: number; height: number }`
  - `MIN_ZOOM = 0.02`, `MAX_ZOOM = 8`
  - `worldToScreen(cam: Camera, wx: number, wy: number, vp: Viewport): {x:number;y:number}`
  - `screenToWorld(cam: Camera, sx: number, sy: number, vp: Viewport): {x:number;y:number}`
  - `zoomAt(cam: Camera, sx: number, sy: number, factor: number, vp: Viewport): Camera`
  - `panByScreen(cam: Camera, dxScreen: number, dyScreen: number): Camera`
  - `visibleWorldBounds(cam: Camera, vp: Viewport): [number,number,number,number]` — `[minX,minY,maxX,maxY]`
  - `fitBounds(bbox: [number,number,number,number], vp: Viewport, padding?: number): Camera`

- [ ] **Шаг 1: Написать падающие тесты**

`tests/camera.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  worldToScreen, screenToWorld, zoomAt, panByScreen,
  visibleWorldBounds, fitBounds, MIN_ZOOM, MAX_ZOOM,
} from '../src/map/camera';

const vp = { width: 800, height: 600 };

describe('camera', () => {
  it('maps the camera centre to the viewport centre', () => {
    const p = worldToScreen({ x: 100, y: 50, zoom: 2 }, 100, 50, vp);
    expect(p).toEqual({ x: 400, y: 300 });
  });

  it('round-trips screen and world coordinates', () => {
    const cam = { x: -37.5, y: 12.25, zoom: 0.37 };
    const w = screenToWorld(cam, 123, 456, vp);
    const s = worldToScreen(cam, w.x, w.y, vp);
    expect(s.x).toBeCloseTo(123, 6);
    expect(s.y).toBeCloseTo(456, 6);
  });

  it('keeps the world point under the cursor fixed while zooming', () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const before = screenToWorld(cam, 700, 100, vp);
    const zoomed = zoomAt(cam, 700, 100, 1.25, vp);
    const after = screenToWorld(zoomed, 700, 100, vp);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(zoomed.zoom).toBeCloseTo(1.25, 6);
  });

  it('clamps zoom to the allowed range', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: MAX_ZOOM }, 0, 0, 4, vp).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: MIN_ZOOM }, 0, 0, 0.25, vp).zoom).toBe(MIN_ZOOM);
  });

  it('pans in world units scaled by zoom', () => {
    expect(panByScreen({ x: 0, y: 0, zoom: 2 }, 100, -40))
      .toEqual({ x: -50, y: 20, zoom: 2 });
  });

  it('reports the visible world rectangle', () => {
    expect(visibleWorldBounds({ x: 0, y: 0, zoom: 2 }, vp))
      .toEqual([-200, -150, 200, 150]);
  });

  it('fits a bounding box with padding and centres on it', () => {
    const cam = fitBounds([0, 0, 400, 300], vp, 1);
    expect(cam.x).toBeCloseTo(200, 6);
    expect(cam.y).toBeCloseTo(150, 6);
    expect(cam.zoom).toBeCloseTo(2, 6);
  });

  it('never produces zero zoom for a degenerate bounding box', () => {
    const cam = fitBounds([10, 10, 10, 10], vp);
    expect(cam.zoom).toBeGreaterThan(0);
    expect(cam.zoom).toBeLessThanOrEqual(MAX_ZOOM);
  });
});
```

- [ ] **Шаг 2: Прогнать тесты и убедиться, что они падают**

Run: `npm test -- tests/camera.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/camera.ts`**

```ts
export interface Camera { x: number; y: number; zoom: number }
export interface Viewport { width: number; height: number }
export type Bounds = [number, number, number, number];

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function worldToScreen(cam: Camera, wx: number, wy: number, vp: Viewport) {
  return {
    x: (wx - cam.x) * cam.zoom + vp.width / 2,
    y: (wy - cam.y) * cam.zoom + vp.height / 2,
  };
}

export function screenToWorld(cam: Camera, sx: number, sy: number, vp: Viewport) {
  return {
    x: (sx - vp.width / 2) / cam.zoom + cam.x,
    y: (sy - vp.height / 2) / cam.zoom + cam.y,
  };
}

export function zoomAt(cam: Camera, sx: number, sy: number, factor: number, vp: Viewport): Camera {
  const zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  if (zoom === cam.zoom) return cam;
  const before = screenToWorld(cam, sx, sy, vp);
  const after = screenToWorld({ ...cam, zoom }, sx, sy, vp);
  return { x: cam.x + before.x - after.x, y: cam.y + before.y - after.y, zoom };
}

export function panByScreen(cam: Camera, dxScreen: number, dyScreen: number): Camera {
  return { ...cam, x: cam.x - dxScreen / cam.zoom, y: cam.y - dyScreen / cam.zoom };
}

export function visibleWorldBounds(cam: Camera, vp: Viewport): Bounds {
  const halfW = vp.width / 2 / cam.zoom;
  const halfH = vp.height / 2 / cam.zoom;
  return [cam.x - halfW, cam.y - halfH, cam.x + halfW, cam.y + halfH];
}

export function fitBounds(bbox: Bounds, vp: Viewport, padding = 1.25): Camera {
  const [minX, minY, maxX, maxY] = bbox;
  const width = Math.max(maxX - minX, 1e-6);
  const height = Math.max(maxY - minY, 1e-6);
  const zoom = clamp(
    Math.min(vp.width / (width * padding), vp.height / (height * padding)),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom };
}
```

- [ ] **Шаг 4: Прогнать тесты и убедиться, что они проходят**

Run: `npm test -- tests/camera.test.ts`
Expected: PASS, 7 тестов.

- [ ] **Шаг 5: Коммит**

```bash
git add src/map/camera.ts tests/camera.test.ts
git commit -m "feat: pure camera math with pan, cursor-anchored zoom and fit-bounds"
```

---

## Task 4: Zustand-стор приложения

**Files:**
- Create: `src/state/store.ts`
- Test: `tests/store.test.ts`

**Interfaces:**
- Consumes: `Camera`, `Viewport` из `src/map/camera.ts`.
- Produces:
  - `type ToolId = 'none' | 'region' | 'point' | 'state' | 'cultural' | 'terrain' | 'road'`
  - `type DisplayMode = 'states' | 'cultural' | 'regions'`
  - `interface Session { userId: string; username: string; avatarUrl: string | null; token: string | null; canEdit: boolean }`
  - `useAppStore` — Zustand-стор с полями
    `session: Session | null`, `camera: Camera`, `viewport: Viewport`,
    `tool: ToolId`, `roadType: 'major' | 'minor'`, `displayMode: DisplayMode`
    и действиями `setSession`, `setCamera`, `setViewport`, `selectTool`, `setDisplayMode`.
  - `selectTool(tool)` при повторном выборе `'road'` переключает `roadType`
    между `'major'` и `'minor'` (ТЗ §10); при повторном выборе любого другого
    инструмента — снимает его в `'none'`.
  - `getState()`/`setState()` доступны вне React для Pixi-слоёв.

- [ ] **Шаг 1: Написать падающие тесты**

`tests/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../src/state/store';

describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({ tool: 'none', roadType: 'major', displayMode: 'states' });
  });

  it('selects a tool', () => {
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('region');
  });

  it('deselects a non-road tool when picked twice', () => {
    useAppStore.getState().selectTool('region');
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('none');
  });

  it('cycles road type when the road tool is picked again', () => {
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().roadType).toBe('major');
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().tool).toBe('road');
    expect(useAppStore.getState().roadType).toBe('minor');
    useAppStore.getState().selectTool('road');
    expect(useAppStore.getState().roadType).toBe('major');
  });

  it('refuses to arm a drawing tool without edit rights', () => {
    useAppStore.setState({
      session: { userId: 'u', username: 'u', avatarUrl: null, token: null, canEdit: false },
    });
    useAppStore.getState().selectTool('region');
    expect(useAppStore.getState().tool).toBe('none');
  });
});
```

- [ ] **Шаг 2: Прогнать тесты и убедиться, что они падают**

Run: `npm test -- tests/store.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/state/store.ts`**

```ts
import { create } from 'zustand';
import type { Camera, Viewport } from '../map/camera';

export type ToolId = 'none' | 'region' | 'point' | 'state' | 'cultural' | 'terrain' | 'road';
export type DisplayMode = 'states' | 'cultural' | 'regions';
export type RoadType = 'major' | 'minor';

export interface Session {
  userId: string;
  username: string;
  avatarUrl: string | null;
  token: string | null;
  canEdit: boolean;
}

interface AppState {
  session: Session | null;
  camera: Camera;
  viewport: Viewport;
  tool: ToolId;
  roadType: RoadType;
  displayMode: DisplayMode;
  setSession: (session: Session) => void;
  setCamera: (camera: Camera) => void;
  setViewport: (viewport: Viewport) => void;
  selectTool: (tool: ToolId) => void;
  setDisplayMode: (mode: DisplayMode) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  session: null,
  camera: { x: 0, y: 0, zoom: 1 },
  viewport: { width: 1, height: 1 },
  tool: 'none',
  roadType: 'major',
  displayMode: 'states',

  setSession: (session) => set({ session }),
  setCamera: (camera) => set({ camera }),
  setViewport: (viewport) => set({ viewport }),
  setDisplayMode: (displayMode) => set({ displayMode }),

  selectTool: (tool) => {
    const { session, tool: current, roadType } = get();
    if (tool !== 'none' && session && !session.canEdit) return;
    if (tool === 'road' && current === 'road') {
      set({ roadType: roadType === 'major' ? 'minor' : 'major' });
      return;
    }
    set({ tool: current === tool ? 'none' : tool });
  },
}));
```

- [ ] **Шаг 4: Прогнать тесты и убедиться, что они проходят**

Run: `npm test -- tests/store.test.ts`
Expected: PASS, 4 теста.

- [ ] **Шаг 5: Коммит**

```bash
git add src/state/store.ts tests/store.test.ts
git commit -m "feat: app store with tool selection and road type cycling"
```

---

## Task 5: Pixi-сцена, слои и фоновая сетка

**Files:**
- Create: `src/map/stage.ts`, `src/map/gridLayer.ts`, `src/map/MapCanvas.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`

**Interfaces:**
- Consumes: `Camera`, `visibleWorldBounds` из `camera.ts`; `useAppStore`.
- Produces:
  - `interface Stage { app: Application; world: Container; layers: { terrain: Container; regions: Container; roads: Container; points: Container; overlay: Container }; destroy(): void }`
  - `createStage(host: HTMLDivElement): Promise<Stage>`
  - `applyCamera(stage: Stage, cam: Camera, vp: Viewport): void`
  - `createGridLayer(): { view: Container; update(cam: Camera, vp: Viewport): void }`

Порядок слоёв снизу вверх — `terrain → regions → roads → points → overlay`
(ТЗ §5.6: рельеф под всеми векторными объектами).

- [ ] **Шаг 1: Реализовать `src/map/stage.ts`**

```ts
import { Application, Container } from 'pixi.js';
import type { Camera, Viewport } from './camera';

export interface Stage {
  app: Application;
  world: Container;
  layers: {
    terrain: Container;
    regions: Container;
    roads: Container;
    points: Container;
    overlay: Container;
  };
  destroy(): void;
}

export async function createStage(host: HTMLDivElement): Promise<Stage> {
  const app = new Application();
  await app.init({
    background: 0x0d1117,
    antialias: true,
    resizeTo: host,
    preference: 'webgl',
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });
  host.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);

  const layers = {
    terrain: new Container(),
    regions: new Container(),
    roads: new Container(),
    points: new Container(),
    overlay: new Container(),
  };
  world.addChild(layers.terrain, layers.regions, layers.roads, layers.points, layers.overlay);

  return {
    app,
    world,
    layers,
    destroy() {
      app.destroy(true, { children: true });
    },
  };
}

export function applyCamera(stage: Stage, cam: Camera, vp: Viewport): void {
  stage.world.scale.set(cam.zoom);
  stage.world.position.set(
    -cam.x * cam.zoom + vp.width / 2,
    -cam.y * cam.zoom + vp.height / 2,
  );
}
```

`preference: 'webgl'` обязательна: шейдер рельефа в Плане 03 написан на
GLSL и не имеет WGSL-варианта.

- [ ] **Шаг 2: Реализовать `src/map/gridLayer.ts`**

Сетка даёт ощущение бесконечного холста и точку отсчёта при зуме. Шаг сетки
выбирается так, чтобы на экране он оставался в пределах 40–400 px.

```ts
import { Container, Graphics } from 'pixi.js';
import { visibleWorldBounds, type Camera, type Viewport } from './camera';

export function createGridLayer() {
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);

  function update(cam: Camera, vp: Viewport) {
    const [minX, minY, maxX, maxY] = visibleWorldBounds(cam, vp);
    let step = 64;
    while (step * cam.zoom < 40) step *= 4;
    while (step * cam.zoom > 400) step /= 4;

    g.clear();
    const x0 = Math.floor(minX / step) * step;
    const y0 = Math.floor(minY / step) * step;
    for (let x = x0; x <= maxX; x += step) g.moveTo(x, minY).lineTo(x, maxY);
    for (let y = y0; y <= maxY; y += step) g.moveTo(minX, y).lineTo(maxX, y);
    g.stroke({ width: 1 / cam.zoom, color: 0x1b2430, alpha: 0.9 });

    g.moveTo(0, minY).lineTo(0, maxY).moveTo(minX, 0).lineTo(maxX, 0);
    g.stroke({ width: 1.5 / cam.zoom, color: 0x2c3a4d, alpha: 1 });
  }

  return { view, update };
}
```

- [ ] **Шаг 3: Реализовать `src/map/MapCanvas.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { createStage, applyCamera, type Stage } from './stage';
import { createGridLayer } from './gridLayer';
import { attachCameraInput } from './cameraInput';
import { useAppStore } from '../state/store';

export function MapCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let stage: Stage | null = null;
    let detachInput: (() => void) | undefined;
    let unsubscribe: (() => void) | undefined;
    let disposed = false;

    void (async () => {
      const created = await createStage(host);
      if (disposed) { created.destroy(); return; }
      stage = created;

      const grid = createGridLayer();
      created.layers.terrain.addChild(grid.view);

      const redraw = () => {
        const { camera, viewport } = useAppStore.getState();
        applyCamera(created, camera, viewport);
        grid.update(camera, viewport);
      };

      const syncViewport = () => {
        useAppStore.getState().setViewport({
          width: host.clientWidth,
          height: host.clientHeight,
        });
      };

      detachInput = attachCameraInput(host);
      unsubscribe = useAppStore.subscribe(redraw);
      created.app.renderer.on('resize', syncViewport);
      syncViewport();
      redraw();
    })();

    return () => {
      disposed = true;
      unsubscribe?.();
      detachInput?.();
      stage?.destroy();
    };
  }, []);

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />;
}
```

- [ ] **Шаг 4: Собрать `App.tsx` и `main.tsx`**

`src/App.tsx`:

```tsx
import { MapCanvas } from './map/MapCanvas';
import { StatusBadge } from './ui/StatusBadge';

export function App() {
  return (
    <>
      <MapCanvas />
      <StatusBadge />
    </>
  );
}
```

`src/main.tsx`:

```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startSession } from './session/session';
import { useAppStore } from './state/store';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

void startSession().then((session) => useAppStore.getState().setSession(session));
```

`src/ui/StatusBadge.tsx`:

```tsx
import { useAppStore } from '../state/store';

export function StatusBadge() {
  const session = useAppStore((s) => s.session);
  if (!session) return null;
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, padding: '6px 12px',
      borderRadius: 8, background: 'rgba(13,17,23,.82)',
      border: '1px solid #263041', fontSize: 13,
    }}>
      {session.username}
      {!session.canEdit && <span style={{ opacity: .65 }}> · только просмотр</span>}
    </div>
  );
}
```

- [ ] **Шаг 5: Проверить сборку**

Run: `npm run build`
Expected: успешная сборка (`startSession` появится в Task 7 — до тех пор
временно заглушить импорт, вернув из локальной функции
`{ userId: 'dev', username: 'dev', avatarUrl: null, token: null, canEdit: true }`).

- [ ] **Шаг 6: Коммит**

```bash
git add src
git commit -m "feat: PixiJS stage with layered world container and infinite background grid"
```

---

## Task 6: Управление камерой мышью

**Files:**
- Create: `src/map/cameraInput.ts`
- Test: `tests/cameraInput.test.ts`

**Interfaces:**
- Consumes: `zoomAt`, `panByScreen` из `camera.ts`; `useAppStore`.
- Produces: `attachCameraInput(host: HTMLElement): () => void` — возвращает
  функцию отписки. Реализует ТЗ §10: панорамирование **только** средней
  кнопкой (`event.button === 1`), зум колесом вокруг курсора. Левая кнопка
  не трогается — она принадлежит инструментам рисования.

- [ ] **Шаг 1: Написать падающий тест**

`tests/cameraInput.test.ts` (окружение `jsdom` — добавить в начало файла
директиву `// @vitest-environment jsdom`):

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { attachCameraInput } from '../src/map/cameraInput';
import { useAppStore } from '../src/state/store';

function makePointerEvent(type: string, init: PointerEventInit) {
  return new MouseEvent(type, init) as unknown as PointerEvent;
}

describe('camera input', () => {
  let host: HTMLDivElement;
  let detach: () => void;

  beforeEach(() => {
    host = document.createElement('div');
    Object.defineProperty(host, 'clientWidth', { value: 800 });
    Object.defineProperty(host, 'clientHeight', { value: 600 });
    document.body.appendChild(host);
    useAppStore.setState({
      camera: { x: 0, y: 0, zoom: 1 },
      viewport: { width: 800, height: 600 },
    });
    detach = attachCameraInput(host);
  });

  it('pans with the middle button held', () => {
    host.dispatchEvent(makePointerEvent('pointerdown', { button: 1, clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(makePointerEvent('pointermove', { clientX: 140, clientY: 130, bubbles: true }));
    expect(useAppStore.getState().camera).toEqual({ x: -40, y: -30, zoom: 1 });
    window.dispatchEvent(makePointerEvent('pointerup', { button: 1, bubbles: true }));
    detach();
  });

  it('ignores the left button for panning', () => {
    host.dispatchEvent(makePointerEvent('pointerdown', { button: 0, clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(makePointerEvent('pointermove', { clientX: 400, clientY: 400, bubbles: true }));
    expect(useAppStore.getState().camera).toEqual({ x: 0, y: 0, zoom: 1 });
    detach();
  });

  it('zooms on wheel around the cursor', () => {
    host.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300, bubbles: true }));
    expect(useAppStore.getState().camera.zoom).toBeGreaterThan(1);
    detach();
  });
});
```

- [ ] **Шаг 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- tests/cameraInput.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/map/cameraInput.ts`**

```ts
import { panByScreen, zoomAt } from './camera';
import { useAppStore } from '../state/store';

const ZOOM_PER_NOTCH = 1.15;

export function attachCameraInput(host: HTMLElement): () => void {
  let panning = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 1) return;      // ТЗ §10: панорамирование только колёсиком
    e.preventDefault();
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    host.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!panning) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const { camera, setCamera } = useAppStore.getState();
    setCamera(panByScreen(camera, dx, dy));
  };

  const endPan = () => {
    if (!panning) return;
    panning = false;
    host.style.cursor = '';
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const notches = -e.deltaY / 100;
    const factor = Math.pow(ZOOM_PER_NOTCH, notches);
    const { camera, viewport, setCamera } = useAppStore.getState();
    setCamera(zoomAt(camera, e.clientX - rect.left, e.clientY - rect.top, factor, viewport));
  };

  // Средний клик в браузере открывает автопрокрутку — гасим.
  const onAuxClick = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('auxclick', onAuxClick);
  host.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', endPan);
  window.addEventListener('pointercancel', endPan);
  window.addEventListener('blur', endPan);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('auxclick', onAuxClick);
    host.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endPan);
    window.removeEventListener('pointercancel', endPan);
    window.removeEventListener('blur', endPan);
  };
}
```

- [ ] **Шаг 4: Прогнать тесты и убедиться, что они проходят**

Run: `npm test -- tests/cameraInput.test.ts`
Expected: PASS, 3 теста.

- [ ] **Шаг 5: Визуально проверить в браузере**

```bash
npm run dev
```

Через Playwright MCP или вручную: открыть `http://localhost:5173`, убедиться,
что видна сетка; покрутить колесо — сетка плавно масштабируется, шаг
перестраивается; зажать колесо и потянуть — карта едет; зажать левую кнопку и
потянуть — карта **не** едет. Сделать скриншот и удалить его после проверки.

- [ ] **Шаг 6: Коммит**

```bash
git add src/map/cameraInput.ts tests/cameraInput.test.ts
git commit -m "feat: middle-button panning and cursor-anchored wheel zoom"
```

---

## Task 7: Discord Activity shell и OAuth-сессия

**Files:**
- Create: `src/session/discordSdk.ts`, `src/session/session.ts`, `src/data/supabase.ts`
- Modify: `src/main.tsx` (убрать заглушку из Task 5, Шаг 5)
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `ENV` из `src/env.ts`; `Session` из `src/state/store.ts`.
- Produces:
  - `getDiscordSdk(): Promise<DiscordSDK | null>` — `null` вне Discord (обычная вкладка браузера).
  - `startSession(): Promise<Session>` — полный цикл: SDK → `patchUrlMappings` → `authorize` → Edge Function → `Session`.
  - `exchangeCode(code: string, guildId: string, fetchImpl?: typeof fetch): Promise<{ token: string; user: {id:string;username:string;avatar:string|null}; canEdit: boolean }>`
  - `getSupabase(): SupabaseClient` — синглтон; `setSupabaseToken(token: string | null): void` — переустанавливает `Authorization` и `realtime.setAuth`.

- [ ] **Шаг 1: Написать падающий тест на `exchangeCode`**

`tests/session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { exchangeCode } from '../src/session/session';

describe('exchangeCode', () => {
  it('posts the code to the edge function and returns the session payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: 'jwt',
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

  it('throws when the edge function rejects', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad code' });
    await expect(exchangeCode('x', 'g', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});
```

- [ ] **Шаг 2: Прогнать тест и убедиться, что он падает**

Run: `npm test -- tests/session.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Шаг 3: Реализовать `src/session/discordSdk.ts`**

```ts
import { DiscordSDK, patchUrlMappings } from '@discord/embedded-app-sdk';
import { ENV } from '../env';

let cached: Promise<DiscordSDK | null> | null = null;

export function isInsideDiscord(): boolean {
  return new URLSearchParams(location.search).has('frame_id');
}

export function getDiscordSdk(): Promise<DiscordSDK | null> {
  if (cached) return cached;
  cached = (async () => {
    if (!isInsideDiscord()) return null;

    // ТЗ §8.4: без этого запросы к supabase.co режет песочница Activity.
    const supabaseHost = new URL(ENV.supabaseUrl).host;
    patchUrlMappings([{ prefix: '/supabase', target: supabaseHost }]);

    const sdk = new DiscordSDK(ENV.discordClientId);
    await sdk.ready();
    return sdk;
  })();
  return cached;
}
```

- [ ] **Шаг 4: Реализовать `src/session/session.ts`**

```ts
import { ENV } from '../env';
import { getDiscordSdk } from './discordSdk';
import { setSupabaseToken } from '../data/supabase';
import type { Session } from '../state/store';

interface ExchangeResult {
  token: string;
  user: { id: string; username: string; avatar: string | null };
  canEdit: boolean;
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

export async function startSession(): Promise<Session> {
  const sdk = await getDiscordSdk();

  // Вне Discord (локальная разработка) — гостевая сессия только для просмотра.
  if (!sdk) {
    const devEdit = import.meta.env.DEV && import.meta.env.VITE_DEV_CAN_EDIT === 'true';
    return { userId: 'local', username: 'Локальный просмотр', avatarUrl: null, token: null, canEdit: devEdit };
  }

  const { code } = await sdk.commands.authorize({
    client_id: ENV.discordClientId,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify', 'guilds', 'guilds.members.read'],
  });

  const result = await exchangeCode(code, sdk.guildId ?? '');
  await sdk.commands.authenticate({ access_token: result.token });
  setSupabaseToken(result.token);

  return {
    userId: result.user.id,
    username: result.user.username,
    avatarUrl: avatarUrl(result.user.id, result.user.avatar),
    token: result.token,
    canEdit: result.canEdit,
  };
}
```

Примечание: `sdk.commands.authenticate` требует Discord access token, а не наш
Supabase JWT. Edge Function возвращает оба — поле `discordAccessToken` — если
на этапе интеграции Discord откажется принимать токен, передавать в
`authenticate` именно `result.discordAccessToken`. Уточнить на Шаге 8.

- [ ] **Шаг 5: Реализовать `src/data/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ENV } from '../env';

let client: SupabaseClient | null = null;
let currentToken: string | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {},
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (currentToken) headers.set('Authorization', `Bearer ${currentToken}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
  return client;
}

export function setSupabaseToken(token: string | null): void {
  currentToken = token;
  if (token) getSupabase().realtime.setAuth(token);
}
```

- [ ] **Шаг 6: Прогнать тесты и убедиться, что они проходят**

Run: `npm test`
Expected: PASS, все тесты (env, camera, store, cameraInput, session).

- [ ] **Шаг 7: Убрать заглушку сессии из `main.tsx`**

Импортировать `startSession` из `./session/session` (заглушка из Task 5,
Шаг 5 удаляется).

- [ ] **Шаг 8: Коммит**

```bash
git add src/session src/data src/main.tsx tests/session.test.ts
git commit -m "feat: Discord Activity bootstrap with OAuth code exchange and Supabase JWT"
```

---

## Task 8: Edge Function `discord-auth`

**Files:**
- Create: `supabase/functions/discord-auth/index.ts`

**Interfaces:**
- Consumes: секреты окружения `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`,
  `DISCORD_BOT_TOKEN`, `DISCORD_EDITOR_ROLE_ID`, `SUPABASE_JWT_SECRET`.
- Produces: `POST /functions/v1/discord-auth` с телом `{ code: string, guildId: string }` →
  `200 { token: string, discordAccessToken: string, user: { id, username, avatar }, canEdit: boolean }`.

- [ ] **Шаг 1: Написать функцию**

`supabase/functions/discord-auth/index.ts`:

```ts
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
  const secret = Deno.env.get('SUPABASE_JWT_SECRET')!;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { code, guildId } = await req.json().catch(() => ({}));
  if (!code) return json({ error: 'code is required' }, 400);

  // 1. Обмен кода на токен — client_secret живёт только здесь (ТЗ §8.2).
  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('DISCORD_CLIENT_ID')!,
      client_secret: Deno.env.get('DISCORD_CLIENT_SECRET')!,
      grant_type: 'authorization_code',
      code,
    }),
  });
  if (!tokenResponse.ok) return json({ error: 'token exchange failed' }, 401);
  const { access_token } = await tokenResponse.json();

  // 2. Кто это.
  const meResponse = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meResponse.ok) return json({ error: 'identify failed' }, 401);
  const me = await meResponse.json();

  // 3. Есть ли у него роль редактора — спрашиваем бот-токеном (ТЗ §8.2).
  let canEdit = false;
  const editorRole = Deno.env.get('DISCORD_EDITOR_ROLE_ID');
  const botToken = Deno.env.get('DISCORD_BOT_TOKEN');
  if (guildId && editorRole && botToken) {
    const memberResponse = await fetch(
      `https://discord.com/api/guilds/${guildId}/members/${me.id}`,
      { headers: { Authorization: `Bot ${botToken}` } },
    );
    if (memberResponse.ok) {
      const member = await memberResponse.json();
      canEdit = Array.isArray(member.roles) && member.roles.includes(editorRole);
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
    user: { id: me.id, username: me.global_name ?? me.username, avatar: me.avatar ?? null },
    canEdit,
  });
});
```

- [ ] **Шаг 2: Прописать секреты и задеплоить**

```bash
supabase secrets set \
  DISCORD_CLIENT_ID=... \
  DISCORD_CLIENT_SECRET=... \
  DISCORD_BOT_TOKEN=... \
  DISCORD_EDITOR_ROLE_ID=... \
  SUPABASE_JWT_SECRET=...
supabase functions deploy discord-auth --no-verify-jwt
```

`--no-verify-jwt` обязателен: на момент вызова у клиента ещё нет JWT.

- [ ] **Шаг 3: Проверить, что функция отвечает и отвергает мусорный код**

```bash
curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/discord-auth" \
  -H "Content-Type: application/json" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -d '{"code":"garbage","guildId":"0"}'
```
Expected: `{"error":"token exchange failed"}` со статусом 401 — значит функция
живая, секреты видны, до Discord она дошла.

- [ ] **Шаг 4: Проверить, что подписанный JWT даёт право на запись**

Взять любой валидный JWT из ответа функции (после первого реального входа в
Discord на Шаге 5 Task 9) и выполнить:

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/states" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"map_id":"00000000-0000-0000-0000-000000000001","name":"Проверка","color":"#8ab4f8"}'
```
Expected: созданная запись при `can_edit: true`; ошибка RLS при `can_edit: false`.
После проверки удалить запись.

- [ ] **Шаг 5: Коммит**

```bash
git add supabase/functions/discord-auth
git commit -m "feat: discord-auth edge function issuing can_edit-scoped Supabase JWT"
```

---

## Task 9: Деплой на Vercel и включение Activity

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Consumes: собранный фронтенд.
- Produces: рабочий production URL, включённая Discord Activity.

- [ ] **Шаг 1: Добавить `vercel.json` (SPA-фолбэк)**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Шаг 2: Завести проект и переменные окружения**

```bash
vercel link --yes
vercel env add VITE_DISCORD_CLIENT_ID production
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel env add VITE_MAP_ID production
```

- [ ] **Шаг 3: Задеплоить**

```bash
vercel deploy --prod
```
Expected: URL вида `https://<project>.vercel.app`, страница открывается,
видна сетка, в правом верхнем углу — «Локальный просмотр · только просмотр».

- [ ] **Шаг 4: Настроить Discord Developer Portal**

- Activities → Settings → включить Activity, Root Mapping `/` → домен Vercel.
- Activities → URL Mappings → добавить: prefix `/supabase`, target
  `tomumajlfnqmcmcraawy.supabase.co` (ТЗ §8.4).
- OAuth2 → Redirects → добавить домен Vercel.

- [ ] **Шаг 5: Проверить внутри Discord**

Запустить Activity в голосовом канале сервера. Ожидается: карта с сеткой,
имя пользователя в бейдже. У пользователя с ролью редактора — без пометки
«только просмотр»; у пользователя без роли — с пометкой.

Если запросы к Supabase падают — проверить, что `patchUrlMappings` вызывается
**до** первого запроса и что host в маппинге совпадает с `VITE_SUPABASE_URL`.

- [ ] **Шаг 6: Финальная проверка и коммит**

```bash
npm test
npm run build
git add vercel.json
git commit -m "chore: Vercel SPA deploy configuration"
git push
```

---

## Definition of Done для Плана 01

- `npm test` — зелёный, `npm run build` — без ошибок.
- Activity открывается внутри Discord, показывает бесконечную сетку.
- Панорамирование работает **только** средней кнопкой, зум — колесом вокруг курсора.
- Пользователь с ролью редактора получает `canEdit: true`, без роли — `false`,
  и RLS реально запрещает запись во втором случае (проверено curl'ом).
- Схема Supabase создана, старые таблицы снесены.
