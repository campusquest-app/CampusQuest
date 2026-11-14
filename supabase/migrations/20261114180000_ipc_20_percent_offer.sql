-- Activate International Pocket Café's live 20% OFF student perk.
-- Directory copy is the source of truth for listingType=partner; this seed makes the
-- offer editable in the business dashboard without wiping a later manager edit.

insert into public.partner_profile_overrides (
  partner_id,
  offer_managed,
  offer_title,
  discount_value,
  offer_description,
  redemption_instructions,
  reward_paused,
  updated_at
)
values (
  'international-pocket-cafe',
  true,
  '20% Off at International Pocket Café',
  '20% OFF',
  'Available to all CampusQuest members',
  'Show your CampusQuest account at checkout.',
  false,
  now()
)
on conflict (partner_id) do update
set
  offer_managed = true,
  offer_title = excluded.offer_title,
  discount_value = excluded.discount_value,
  offer_description = excluded.offer_description,
  redemption_instructions = excluded.redemption_instructions,
  reward_paused = excluded.reward_paused,
  updated_at = now()
where public.partner_profile_overrides.offer_managed = false
   or public.partner_profile_overrides.discount_value is null
   or public.partner_profile_overrides.reward_paused = true;
