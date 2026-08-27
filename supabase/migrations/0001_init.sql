-- Картограф — начальная схема.
-- Сносим таблицы предыдущей попытки (ТЗ §1) и создаём всё заново.

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
  sea_level  smallint not null default 64,
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

-- Единственная карта проекта. ID совпадает с VITE_MAP_ID.
insert into maps (id, name, sea_level)
values ('00000000-0000-0000-0000-000000000001', 'Основная карта', 64);
