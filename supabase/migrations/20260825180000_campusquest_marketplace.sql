-- CampusQuest The Market: listings, student businesses, offers, favorites.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.student_businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  logo_url text,
  bio text not null default '' check (char_length(bio) <= 400),
  category text not null check (
    category in ('clothing', 'dorm', 'electronics', 'textbooks', 'services', 'free', 'other')
  ),
  offering text not null check (offering in ('products', 'services', 'both')),
  instagram_url text,
  website_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  plan_tier text not null default 'free' check (plan_tier in ('free', 'business_pro')),
  affiliation_school text not null default 'University of Rhode Island',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_businesses_owner on public.student_businesses (owner_id);
create index if not exists idx_student_businesses_status on public.student_businesses (status, created_at desc);

create table if not exists public.student_business_members (
  business_id uuid not null references public.student_businesses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index if not exists idx_student_business_members_user on public.student_business_members (user_id);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid references public.student_businesses(id) on delete set null,
  listing_kind text not null check (listing_kind in ('item', 'service', 'business_post')),
  title text not null check (char_length(trim(title)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  price_cents integer not null default 0 check (price_cents >= 0 and price_cents <= 100000000),
  starting_price boolean not null default false,
  category text not null check (
    category in ('clothing', 'dorm', 'electronics', 'textbooks', 'services', 'free', 'other')
  ),
  condition text check (condition is null or condition in ('new', 'like_new', 'good', 'fair', 'for_parts')),
  meetup_area text not null check (
    meetup_area in (
      'memorial_union',
      'library',
      'quad',
      'ryan_center',
      'dining_hall',
      'residence_hall_area',
      'messages'
    )
  ),
  availability_note text check (availability_note is null or char_length(availability_note) <= 200),
  status text not null default 'active' check (status in ('active', 'pending', 'sold', 'removed')),
  sold_at timestamptz,
  removed_at timestamptz,
  featured_until timestamptz,
  favorite_count integer not null default 0 check (favorite_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_listings_item_condition_chk check (
    listing_kind <> 'item' or condition is not null
  )
);

create index if not exists idx_marketplace_listings_discovery
  on public.marketplace_listings (status, created_at desc);
create index if not exists idx_marketplace_listings_seller
  on public.marketplace_listings (seller_id, created_at desc);
create index if not exists idx_marketplace_listings_business
  on public.marketplace_listings (business_id, created_at desc)
  where business_id is not null;
create index if not exists idx_marketplace_listings_category
  on public.marketplace_listings (category, status, created_at desc);

create table if not exists public.marketplace_listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  url text not null,
  thumbnail_url text,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketplace_listing_media_listing
  on public.marketplace_listing_media (listing_id, sort_order);

create table if not exists public.marketplace_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists idx_marketplace_favorites_listing
  on public.marketplace_favorites (listing_id);

create table if not exists public.marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists idx_marketplace_offers_pending_buyer
  on public.marketplace_offers (listing_id, buyer_id)
  where status = 'pending';
create index if not exists idx_marketplace_offers_listing
  on public.marketplace_offers (listing_id, created_at desc);
create index if not exists idx_marketplace_offers_buyer
  on public.marketplace_offers (buyer_id, created_at desc);

create table if not exists public.marketplace_business_follows (
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_id uuid not null references public.student_businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists trg_student_businesses_updated_at on public.student_businesses;
create trigger trg_student_businesses_updated_at
before update on public.student_businesses
for each row execute function public.set_updated_at();

drop trigger if exists trg_marketplace_listings_updated_at on public.marketplace_listings;
create trigger trg_marketplace_listings_updated_at
before update on public.marketplace_listings
for each row execute function public.set_updated_at();

drop trigger if exists trg_marketplace_offers_updated_at on public.marketplace_offers;
create trigger trg_marketplace_offers_updated_at
before update on public.marketplace_offers
for each row execute function public.set_updated_at();

create or replace function public.prevent_marketplace_verification_spoof()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.plan_tier := coalesce(new.plan_tier, 'free');
    if new.plan_tier is distinct from 'free' then
      new.plan_tier := 'free';
    end if;
    return new;
  end if;
  new.verification_status := old.verification_status;
  new.plan_tier := old.plan_tier;
  return new;
end;
$$;

drop trigger if exists trg_prevent_marketplace_verification_spoof on public.student_businesses;
create trigger trg_prevent_marketplace_verification_spoof
before insert or update on public.student_businesses
for each row execute function public.prevent_marketplace_verification_spoof();

create or replace function public.sync_marketplace_favorite_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.marketplace_listings
      set favorite_count = favorite_count + 1
      where id = new.listing_id;
    return new;
  end if;
  update public.marketplace_listings
    set favorite_count = greatest(favorite_count - 1, 0)
    where id = old.listing_id;
  return old;
end;
$$;

drop trigger if exists trg_marketplace_favorites_count on public.marketplace_favorites;
create trigger trg_marketplace_favorites_count
after insert or delete on public.marketplace_favorites
for each row execute function public.sync_marketplace_favorite_count();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_student_business_manager(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.student_business_members m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
  );
$$;

revoke all on function public.is_student_business_manager(uuid) from public;
grant execute on function public.is_student_business_manager(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.student_businesses enable row level security;
alter table public.student_business_members enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_listing_media enable row level security;
alter table public.marketplace_favorites enable row level security;
alter table public.marketplace_offers enable row level security;
alter table public.marketplace_business_follows enable row level security;

drop policy if exists "student_businesses select visible" on public.student_businesses;
create policy "student_businesses select visible"
on public.student_businesses for select
to authenticated
using (status = 'active' or owner_id = auth.uid() or public.is_student_business_manager(id));

drop policy if exists "student_businesses insert own" on public.student_businesses;
create policy "student_businesses insert own"
on public.student_businesses for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "student_businesses update managers" on public.student_businesses;
create policy "student_businesses update managers"
on public.student_businesses for update
to authenticated
using (auth.uid() = owner_id or public.is_student_business_manager(id))
with check (auth.uid() = owner_id or public.is_student_business_manager(id));

drop policy if exists "student_business_members select" on public.student_business_members;
create policy "student_business_members select"
on public.student_business_members for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_student_business_manager(business_id)
);

drop policy if exists "student_business_members insert own owner" on public.student_business_members;
create policy "student_business_members insert own owner"
on public.student_business_members for insert
to authenticated
with check (
  auth.uid() = user_id
  and role = 'owner'
  and exists (
    select 1 from public.student_businesses b
    where b.id = business_id and b.owner_id = auth.uid()
  )
);

drop policy if exists "marketplace_listings select" on public.marketplace_listings;
create policy "marketplace_listings select"
on public.marketplace_listings for select
to authenticated
using (
  (status = 'active')
  or seller_id = auth.uid()
  or (business_id is not null and public.is_student_business_manager(business_id))
  or exists (
    select 1 from public.marketplace_offers o
    where o.listing_id = marketplace_listings.id
      and o.buyer_id = auth.uid()
  )
);

drop policy if exists "marketplace_listings insert own" on public.marketplace_listings;
create policy "marketplace_listings insert own"
on public.marketplace_listings for insert
to authenticated
with check (
  auth.uid() = seller_id
  and (
    business_id is null
    or public.is_student_business_manager(business_id)
  )
);

drop policy if exists "marketplace_listings update own" on public.marketplace_listings;
create policy "marketplace_listings update own"
on public.marketplace_listings for update
to authenticated
using (
  seller_id = auth.uid()
  or (business_id is not null and public.is_student_business_manager(business_id))
)
with check (
  (
    seller_id = auth.uid()
    and (
      business_id is null
      or public.is_student_business_manager(business_id)
    )
  )
  or (
    business_id is not null
    and public.is_student_business_manager(business_id)
  )
);

drop policy if exists "marketplace_listing_media select" on public.marketplace_listing_media;
create policy "marketplace_listing_media select"
on public.marketplace_listing_media for select
to authenticated
using (
  exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.status = 'active'
        or l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
        or exists (
          select 1 from public.marketplace_offers o
          where o.listing_id = l.id and o.buyer_id = auth.uid()
        )
      )
  )
);

drop policy if exists "marketplace_listing_media write own" on public.marketplace_listing_media;
create policy "marketplace_listing_media write own"
on public.marketplace_listing_media for insert
to authenticated
with check (
  exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  )
);

drop policy if exists "marketplace_listing_media delete own" on public.marketplace_listing_media;
create policy "marketplace_listing_media delete own"
on public.marketplace_listing_media for delete
to authenticated
using (
  exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  )
);

drop policy if exists "marketplace_favorites own" on public.marketplace_favorites;
create policy "marketplace_favorites own"
on public.marketplace_favorites for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "marketplace_offers select parties" on public.marketplace_offers;
create policy "marketplace_offers select parties"
on public.marketplace_offers for select
to authenticated
using (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  )
);

drop policy if exists "marketplace_offers insert buyer" on public.marketplace_offers;
create policy "marketplace_offers insert buyer"
on public.marketplace_offers for insert
to authenticated
with check (
  auth.uid() = buyer_id
  and exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and l.status = 'active'
      and l.seller_id <> auth.uid()
  )
);

drop policy if exists "marketplace_offers update parties" on public.marketplace_offers;
create policy "marketplace_offers update parties"
on public.marketplace_offers for update
to authenticated
using (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  )
)
with check (
  buyer_id = auth.uid()
  or exists (
    select 1 from public.marketplace_listings l
    where l.id = listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  )
);

drop policy if exists "marketplace_business_follows own" on public.marketplace_business_follows;
create policy "marketplace_business_follows own"
on public.marketplace_business_follows for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Reports + notifications
-- ---------------------------------------------------------------------------

alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports
  add constraint content_reports_target_type_check check (
    target_type in (
      'user',
      'comment',
      'post',
      'message',
      'event',
      'organization',
      'infringement',
      'marketplace_listing',
      'student_business',
      'other'
    )
  );

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'direct_message',
    'connection_accepted',
    'friend_request',
    'quad_post_like',
    'quad_post_comment',
    'quad_post_tag',
    'quad_post_mention',
    'quad_post_tag_approval',
    'event_rsvp_reminder',
    'organization_event_announcement',
    'moderation_safety_update',
    'organization_request_submitted',
    'organization_request_approved',
    'organization_request_denied',
    'marketplace_offer',
    'marketplace_offer_accepted',
    'marketplace_offer_declined'
  )
);

alter table public.student_businesses
  add column if not exists affiliation_school text not null default 'University of Rhode Island';

create or replace function public.prevent_marketplace_verification_spoof()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.verification_status := 'unverified';
    new.plan_tier := 'free';
    new.affiliation_school := 'University of Rhode Island';
    return new;
  end if;
  new.owner_id := old.owner_id;
  new.verification_status := old.verification_status;
  new.plan_tier := old.plan_tier;
  new.affiliation_school := old.affiliation_school;
  return new;
end;
$$;

create or replace function public.enforce_marketplace_listing_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.seller_id := auth.uid();
    new.featured_until := null;
    new.favorite_count := 0;
    new.status := 'active';
    return new;
  end if;
  new.seller_id := old.seller_id;
  new.featured_until := old.featured_until;
  return new;
end;
$$;

drop trigger if exists trg_enforce_marketplace_listing_identity on public.marketplace_listings;
create trigger trg_enforce_marketplace_listing_identity
before insert or update on public.marketplace_listings
for each row execute function public.enforce_marketplace_listing_identity();

create or replace function public.enforce_marketplace_offer_update()
returns trigger
language plpgsql
as $$
declare
  listing_seller uuid;
begin
  if new.listing_id is distinct from old.listing_id
     or new.buyer_id is distinct from old.buyer_id
     or new.amount_cents is distinct from old.amount_cents then
    raise exception 'marketplace offer identity fields are immutable';
  end if;

  select seller_id into listing_seller
  from public.marketplace_listings
  where id = old.listing_id;

  if auth.uid() = old.buyer_id and auth.uid() is distinct from listing_seller then
    if new.status is distinct from old.status and new.status is distinct from 'withdrawn' then
      raise exception 'buyers may only withdraw their own offers';
    end if;
  elsif auth.uid() = listing_seller then
    if new.status is distinct from old.status and new.status not in ('accepted', 'declined') then
      raise exception 'sellers may only accept or decline offers';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_marketplace_offer_update on public.marketplace_offers;
create trigger trg_enforce_marketplace_offer_update
before update on public.marketplace_offers
for each row execute function public.enforce_marketplace_offer_update();

comment on table public.marketplace_listings is
  'CampusQuest The Market listings. Discovery is limited to status=active; sold/removed stay owner-visible.';
comment on table public.student_businesses is
  'Student-owned business profiles. verification_status, plan_tier, and affiliation cannot be spoofed by clients.';
