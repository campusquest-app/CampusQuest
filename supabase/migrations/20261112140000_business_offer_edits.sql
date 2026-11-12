-- Manager edits for the current student offer on an existing business listing.
-- The listing id stays the same, so saved businesses and deal links keep working.
-- A missing or unmanaged row still uses the directory copy, including Daisy's live 20% offer.

alter table public.partner_profile_overrides
  add column if not exists offer_managed boolean not null default false,
  add column if not exists offer_title text,
  add column if not exists discount_value text,
  add column if not exists offer_description text,
  add column if not exists redemption_instructions text,
  add column if not exists reward_paused boolean,
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

alter table public.partner_profile_overrides
  drop constraint if exists partner_profile_overrides_offer_title_len,
  drop constraint if exists partner_profile_overrides_discount_len,
  drop constraint if exists partner_profile_overrides_offer_description_len,
  drop constraint if exists partner_profile_overrides_redemption_len,
  drop constraint if exists partner_profile_overrides_offer_window;

alter table public.partner_profile_overrides
  add constraint partner_profile_overrides_offer_title_len
    check (offer_title is null or char_length(offer_title) <= 140),
  add constraint partner_profile_overrides_discount_len
    check (discount_value is null or char_length(discount_value) <= 40),
  add constraint partner_profile_overrides_offer_description_len
    check (offer_description is null or char_length(offer_description) <= 500),
  add constraint partner_profile_overrides_redemption_len
    check (redemption_instructions is null or char_length(redemption_instructions) <= 400),
  add constraint partner_profile_overrides_offer_window
    check (starts_at is null or ends_at is null or starts_at < ends_at);

-- Copy Daisy's current directory offer into the editable row without touching a later edit.
insert into public.partner_profile_overrides (
  partner_id,
  offer_managed,
  offer_title,
  discount_value,
  redemption_instructions,
  reward_paused,
  updated_at
)
values (
  'daisys-chicken-ice-cream',
  true,
  'Go on a quest for 20% OFF at Daisy’s',
  '20% OFF',
  'Show your CampusQuest account at checkout.',
  false,
  now()
)
on conflict (partner_id) do update
set
  offer_managed = true,
  offer_title = excluded.offer_title,
  discount_value = excluded.discount_value,
  redemption_instructions = excluded.redemption_instructions,
  reward_paused = excluded.reward_paused,
  updated_at = now()
where public.partner_profile_overrides.offer_managed = false;
