-- Admin-created quests, completions, and templates

create table if not exists public.admin_quests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  xp_reward integer not null check (xp_reward > 0 and xp_reward <= 10000),
  difficulty text not null default 'easy' check (difficulty in ('easy', 'medium', 'hard', 'legendary')),
  quest_type text not null default 'one_time' check (
    quest_type in ('daily', 'one_time', 'event', 'location', 'qr')
  ),
  location_name text,
  location_lat double precision,
  location_lng double precision,
  map_pin_x double precision,
  map_pin_y double precision,
  requires_qr boolean not null default false,
  qr_code_id uuid references public.qr_codes(id) on delete set null,
  completion_method text not null default 'manual_log' check (
    completion_method in ('manual_log', 'qr_scan', 'location_checkin', 'admin_approval')
  ),
  visibility_status text not null default 'draft' check (
    visibility_status in ('active', 'hidden', 'draft', 'deleted')
  ),
  starts_at timestamptz,
  ends_at timestamptz,
  active_duration_minutes integer check (active_duration_minutes is null or active_duration_minutes > 0),
  repeat_type text not null default 'one_time' check (
    repeat_type in ('one_time', 'daily', 'weekly', 'monthly', 'custom')
  ),
  repeat_limit text not null default 'once_per_user' check (
    repeat_limit in ('once_per_user', 'once_per_day', 'once_per_week', 'unlimited')
  ),
  is_repeatable boolean not null default false,
  expires_automatically boolean not null default true,
  icon text,
  image_url text,
  organization_id uuid references public.student_organizations(id) on delete set null,
  event_id uuid references public.campus_events(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_quests_visibility on public.admin_quests(visibility_status, starts_at, ends_at);
create index if not exists idx_admin_quests_created on public.admin_quests(created_at desc);
create index if not exists idx_admin_quests_location on public.admin_quests(location_lat, location_lng)
  where location_lat is not null and location_lng is not null;

create table if not exists public.admin_quest_completions (
  id uuid primary key default gen_random_uuid(),
  quest_id uuid not null references public.admin_quests(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  xp_awarded integer not null check (xp_awarded > 0),
  completion_method text not null,
  proof_url text,
  status text not null default 'completed' check (status in ('completed', 'pending', 'rejected')),
  completion_day date,
  unique (quest_id, user_id, completion_day)
);

create index if not exists idx_admin_quest_completions_quest on public.admin_quest_completions(quest_id, completed_at desc);
create index if not exists idx_admin_quest_completions_user on public.admin_quest_completions(user_id, completed_at desc);

create table if not exists public.quest_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  category text not null,
  description text not null default '',
  default_xp integer not null default 50 check (default_xp > 0),
  default_difficulty text not null default 'easy' check (default_difficulty in ('easy', 'medium', 'hard', 'legendary')),
  default_completion_method text not null default 'manual_log',
  default_quest_type text not null default 'one_time',
  default_repeat_type text not null default 'one_time',
  default_repeat_limit text not null default 'once_per_user',
  default_duration_minutes integer,
  default_requires_qr boolean not null default false,
  default_map_enabled boolean not null default false,
  default_image text,
  is_builtin boolean not null default false,
  usage_count integer not null default 0,
  is_favorite boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quest_templates_category on public.quest_templates(category, usage_count desc);

alter table public.qr_codes
  add column if not exists admin_quest_id uuid references public.admin_quests(id) on delete set null;

create index if not exists idx_qr_codes_admin_quest on public.qr_codes(admin_quest_id) where admin_quest_id is not null;

drop trigger if exists trg_admin_quests_updated_at on public.admin_quests;
create trigger trg_admin_quests_updated_at
before update on public.admin_quests
for each row execute function public.set_updated_at();

drop trigger if exists trg_quest_templates_updated_at on public.quest_templates;
create trigger trg_quest_templates_updated_at
before update on public.quest_templates
for each row execute function public.set_updated_at();

alter table public.admin_quests enable row level security;
alter table public.admin_quest_completions enable row level security;
alter table public.quest_templates enable row level security;

-- Users can read active, non-deleted quests within schedule
drop policy if exists "admin_quests read active" on public.admin_quests;
create policy "admin_quests read active"
on public.admin_quests for select
to authenticated
using (
  visibility_status = 'active'
  and deleted_at is null
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

-- Users read own completions
drop policy if exists "admin_quest_completions read own" on public.admin_quest_completions;
create policy "admin_quest_completions read own"
on public.admin_quest_completions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "admin_quest_completions insert own" on public.admin_quest_completions;
create policy "admin_quest_completions insert own"
on public.admin_quest_completions for insert
to authenticated
with check (auth.uid() = user_id);

-- Templates readable by authenticated (built-in + custom)
drop policy if exists "quest_templates read" on public.quest_templates;
create policy "quest_templates read"
on public.quest_templates for select
to authenticated
using (true);

comment on table public.admin_quests is 'Admin-created quests shown on user quest boards';
comment on table public.admin_quest_completions is 'Per-user admin quest completion records';
comment on table public.quest_templates is 'Quest builder templates for admins';
