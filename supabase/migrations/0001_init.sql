-- TQuest schema.
--
-- Design in one minute:
--   * CATALOGUE tables (stations, landmarks, stamps, achievements, challenges,
--     game_locations) are world-readable reference data, written only by
--     supabase/seed.sql, which is generated from the app's own source of truth
--     (scripts/build-seed.mjs). Clients can never write them.
--   * USER tables hold one player's progress. Row-level security limits every
--     row to its owner (user_id = auth.uid()). Judges play as anonymous Supabase
--     users: no e-mail, no sign-up screen.
--   * Rewards are IDEMPOTENT by construction: composite primary keys such as
--     xp_transactions (user_id, key) and user_stamps (user_id, stamp_id) make a
--     double grant physically impossible, however often a client retries.
--   * The app is local-first. public.sync_progress(payload) mirrors a player's
--     local progress here in one transaction, using ON CONFLICT so replays are
--     harmless.

-- ---------------------------------------------------------------------------
-- Catalogue (reference data)
-- ---------------------------------------------------------------------------

create table public.stations (
  id            text primary key,              -- MBTA parent station id, e.g. place-harsq
  name          text not null,
  lat           double precision not null,
  lng           double precision not null,
  municipality  text not null,
  lines         text[] not null,               -- Red / Orange / Blue / Green / Mattapan
  is_terminal   boolean not null default false
);

create table public.landmarks (
  id             text primary key,
  name           text not null,
  lat            double precision not null,
  lng            double precision not null,
  neighborhood   text not null,
  year           text,                         -- text: some are "c. 1680"
  summary        text not null,                -- reliable reference notes used to ground Gemini
  station_id     text not null references public.stations (id),
  freedom_trail  boolean not null default false
);

create table public.stamps (
  id      text primary key,                    -- station:place-harsq / landmark:state-house / set:red-line
  kind    text not null check (kind in ('station', 'landmark', 'set')),
  ref_id  text not null,
  name    text not null,
  rarity  text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  rule    text not null,                       -- the published requirement behind the rarity
  unique (kind, ref_id)
);

create table public.achievements (
  id           text primary key,
  name         text not null,
  description  text not null,
  xp           integer not null check (xp > 0)
);

create table public.challenges (
  id           text primary key,
  title        text not null,
  description  text not null,
  xp           integer not null check (xp > 0),
  goal         integer not null check (goal > 0),
  source       text not null default 'template' check (source in ('template', 'ai'))
);

create table public.game_locations (
  id          text primary key,
  kind        text not null check (kind in ('landmark', 'station', 'neighborhood')),
  name        text not null,
  aliases     text[] not null default '{}',    -- accepted answers for deterministic matching
  lat         double precision not null,
  lng         double precision not null,
  difficulty  smallint not null check (difficulty between 1 and 3),
  station_id  text references public.stations (id),
  summary     text not null
);

-- ---------------------------------------------------------------------------
-- Player data
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'Explorer' check (char_length(display_name) between 1 and 24),
  created_at    timestamptz not null default now()
);

-- The XP ledger. `key` is the transaction id ("station:place-harsq",
-- "achievement:first-ride", "round:<id>"): one key can be credited once per player.
create table public.xp_transactions (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  key         text not null,
  amount      integer not null check (amount > 0),
  label       text not null default '',
  created_at  timestamptz not null default now(),
  primary key (user_id, key)
);

create table public.user_stamps (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  stamp_id   text not null references public.stamps (id),
  earned_at  timestamptz not null default now(),
  source     text not null default 'unknown',  -- ride / demo / manual / nearby / simulated / photo-only / collection
  primary key (user_id, stamp_id)              -- a stamp can never be granted twice
);

create table public.user_achievements (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  achievement_id  text not null references public.achievements (id),
  earned_at       timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create table public.user_streaks (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  current_streak   integer not null default 0 check (current_streak >= 0),
  best_streak      integer not null default 0 check (best_streak >= 0),
  last_active_day  date                         -- the player's LOCAL calendar date
);

create table public.user_challenges (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  challenge_id  text not null references public.challenges (id),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  primary key (user_id, challenge_id),
  check (completed_at is null or completed_at >= started_at)
);

create table public.saved_places (
  user_id   uuid not null references public.profiles (id) on delete cascade,
  place_id  text not null check (char_length(place_id) <= 64),  -- a landmark id or a station id
  saved_at  timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.journeys (
  id            text primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  from_station  text not null references public.stations (id),
  to_station    text not null references public.stations (id),
  stops         integer not null check (stops >= 0),
  minutes       integer not null check (minutes >= 0),
  km            double precision not null check (km >= 0),
  lines         text[] not null default '{}',
  is_demo       boolean not null default false,   -- simulated demo rides are always labelled
  completed_at  timestamptz not null default now()
);
create index journeys_user_idx on public.journeys (user_id, completed_at desc);

-- Per-station progression inside a journey. Reserved: the client does not mirror these yet.
create table public.journey_events (
  id          bigint generated always as identity primary key,
  journey_id  text not null references public.journeys (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  station_id  text references public.stations (id),
  kind        text not null,
  created_at  timestamptz not null default now()
);
create index journey_events_journey_idx on public.journey_events (journey_id);

-- Reserved for grouping rounds; rounds are valid without a session.
create table public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  mode        text not null,
  started_at  timestamptz not null default now()
);

create table public.game_rounds (
  id           text primary key,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  session_id   uuid references public.game_sessions (id) on delete set null,
  location_id  text not null references public.game_locations (id),
  mode         text not null,
  correct      boolean not null,
  score        integer not null check (score >= 0),
  hints        smallint not null default 0 check (hints between 0 and 3),
  created_at   timestamptz not null default now()
);
create index game_rounds_user_idx on public.game_rounds (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.stations          enable row level security;
alter table public.landmarks         enable row level security;
alter table public.stamps            enable row level security;
alter table public.achievements      enable row level security;
alter table public.challenges        enable row level security;
alter table public.game_locations    enable row level security;
alter table public.profiles          enable row level security;
alter table public.xp_transactions   enable row level security;
alter table public.user_stamps       enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_streaks      enable row level security;
alter table public.user_challenges   enable row level security;
alter table public.saved_places      enable row level security;
alter table public.journeys          enable row level security;
alter table public.journey_events    enable row level security;
alter table public.game_sessions     enable row level security;
alter table public.game_rounds       enable row level security;

-- Catalogue: anyone may read; there is no write policy, so no client can write.
create policy "catalogue is public" on public.stations       for select to anon, authenticated using (true);
create policy "catalogue is public" on public.landmarks      for select to anon, authenticated using (true);
create policy "catalogue is public" on public.stamps         for select to anon, authenticated using (true);
create policy "catalogue is public" on public.achievements   for select to anon, authenticated using (true);
create policy "catalogue is public" on public.challenges     for select to anon, authenticated using (true);
create policy "catalogue is public" on public.game_locations for select to anon, authenticated using (true);

-- Player data: each row is visible and writable only by its owner.
create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own rows" on public.xp_transactions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.user_stamps for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.user_achievements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.user_streaks for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.user_challenges for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.saved_places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.journeys for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.journey_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.game_sessions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.game_rounds for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- sync_progress: mirror one player's local progress in a single transaction
-- ---------------------------------------------------------------------------
-- Payload (all keys optional; timestamps are unix milliseconds):
--   { name, xp: [{key, amount, label, at}], stamps: [{id, at, source}],
--     achievements: [{id, at}], challenges: [{id, startedAt, completedAt}],
--     saved: [placeId], journeys: [{id, from, to, stops, minutes, km, lines, demo, at}],
--     rounds: [{id, place, mode, correct, score, hints, at}],
--     streak: {current, best, lastDay} }
-- It only ever writes rows for auth.uid(). Ids that are not in the catalogue are
-- dropped by the joins, and every insert is ON CONFLICT DO NOTHING, so sending
-- the same payload twice grants nothing twice.
-- Known ceiling: amounts are computed by the client's reward engine and trusted
-- here (the sanity cap aside). Move the engine server-side before XP matters.
create or replace function public.sync_progress(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'sync_progress needs a signed-in user (anonymous sign-in is enough)' using errcode = '28000';
  end if;
  if octet_length(payload::text) > 1000000 then
    raise exception 'payload too large' using errcode = '54000';
  end if;

  insert into profiles (id, display_name)
  values (uid, left(coalesce(nullif(btrim(payload->>'name'), ''), 'Explorer'), 24))
  on conflict (id) do update set display_name = excluded.display_name;

  insert into xp_transactions (user_id, key, amount, label, created_at)
  select uid, x.key, x.amount, coalesce(x.label, ''), coalesce(to_timestamp(x."at" / 1000.0), now())
  from jsonb_to_recordset(coalesce(payload->'xp', '[]'::jsonb))
       as x(key text, amount integer, label text, "at" double precision)
  where x.key is not null and x.amount between 1 and 1000
  on conflict do nothing;

  insert into user_stamps (user_id, stamp_id, earned_at, source)
  select uid, s.id, coalesce(to_timestamp(x."at" / 1000.0), now()), coalesce(x.source, 'unknown')
  from jsonb_to_recordset(coalesce(payload->'stamps', '[]'::jsonb))
       as x(id text, "at" double precision, source text)
  join stamps s on s.id = x.id
  on conflict do nothing;

  insert into user_achievements (user_id, achievement_id, earned_at)
  select uid, a.id, coalesce(to_timestamp(x."at" / 1000.0), now())
  from jsonb_to_recordset(coalesce(payload->'achievements', '[]'::jsonb))
       as x(id text, "at" double precision)
  join achievements a on a.id = x.id
  on conflict do nothing;

  -- A challenge is accepted once and later completed, so completion fills in a
  -- NULL but never overwrites an existing completion.
  insert into user_challenges (user_id, challenge_id, started_at, completed_at)
  select distinct on (c.id)
         uid, c.id,
         coalesce(to_timestamp(x."startedAt" / 1000.0), now()),
         case when x."completedAt" is not null   -- (greatest() skips NULLs, so guard it)
              then greatest(to_timestamp(x."completedAt" / 1000.0), to_timestamp(x."startedAt" / 1000.0)) end
  from jsonb_to_recordset(coalesce(payload->'challenges', '[]'::jsonb))
       as x(id text, "startedAt" double precision, "completedAt" double precision)
  join challenges c on c.id = x.id
  order by c.id
  on conflict (user_id, challenge_id) do update
    set completed_at = coalesce(
          user_challenges.completed_at,
          case when excluded.completed_at is not null
               then greatest(excluded.completed_at, user_challenges.started_at) end);

  -- Saved places are a set the player edits freely: replace it.
  if jsonb_typeof(payload->'saved') = 'array' then
    delete from saved_places
    where user_id = uid
      and place_id not in (select jsonb_array_elements_text(payload->'saved'));
    insert into saved_places (user_id, place_id)
    select uid, p from jsonb_array_elements_text(payload->'saved') as p
    where char_length(p) between 1 and 64
    on conflict do nothing;
  end if;

  insert into journeys (id, user_id, from_station, to_station, stops, minutes, km, lines, is_demo, completed_at)
  select x.id, uid, f.id, t.id,
         greatest(0, coalesce(x.stops, 0)), greatest(0, coalesce(x.minutes, 0)), greatest(0, coalesce(x.km, 0)),
         array(select jsonb_array_elements_text(case when jsonb_typeof(x.lines) = 'array' then x.lines else '[]'::jsonb end)),
         coalesce(x.demo, false),
         coalesce(to_timestamp(x."at" / 1000.0), now())
  from jsonb_to_recordset(coalesce(payload->'journeys', '[]'::jsonb))
       as x(id text, "from" text, "to" text, stops integer, minutes integer, km double precision,
            lines jsonb, demo boolean, "at" double precision)
  join stations f on f.id = x."from"
  join stations t on t.id = x."to"
  where x.id is not null
  on conflict do nothing;

  insert into game_rounds (id, user_id, location_id, mode, correct, score, hints, created_at)
  select x.id, uid, g.id, coalesce(x.mode, 'mix'), coalesce(x.correct, false),
         greatest(0, coalesce(x.score, 0)), least(3, greatest(0, coalesce(x.hints, 0))),
         coalesce(to_timestamp(x."at" / 1000.0), now())
  from jsonb_to_recordset(coalesce(payload->'rounds', '[]'::jsonb))
       as x(id text, place text, mode text, correct boolean, score integer, hints integer, "at" double precision)
  join game_locations g on g.id = x.place
  where x.id is not null
  on conflict do nothing;

  if jsonb_typeof(payload->'streak') = 'object' then
    insert into user_streaks (user_id, current_streak, best_streak, last_active_day)
    values (uid,
            greatest(0, coalesce((payload->'streak'->>'current')::integer, 0)),
            greatest(0, coalesce((payload->'streak'->>'best')::integer, 0)),
            nullif(payload->'streak'->>'lastDay', '')::date)
    on conflict (user_id) do update
      set current_streak  = excluded.current_streak,
          best_streak     = greatest(user_streaks.best_streak, excluded.best_streak),
          last_active_day = excluded.last_active_day;
  end if;
end;
$$;

-- Supabase grants EXECUTE on new functions to anon by default: take it back.
revoke all on function public.sync_progress(jsonb) from public, anon;
grant execute on function public.sync_progress(jsonb) to authenticated;
