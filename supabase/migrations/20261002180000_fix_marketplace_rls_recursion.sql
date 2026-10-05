-- Fix: every authenticated read of marketplace_listings / marketplace_offers failed with
--   42P17 infinite recursion detected in policy for relation "marketplace_listings"
-- because "marketplace_listings select" subqueried marketplace_offers (RLS) and
-- "marketplace_offers select parties" subqueried marketplace_listings (RLS) back.
--
-- The cross-table checks move into SECURITY DEFINER helpers (same pattern as
-- is_student_business_manager) so neither policy re-enters the other's RLS.
-- Visibility rules are unchanged:
--   listings: active, or own, or managed business, or the viewer made an offer on it
--   offers:   the buyer, or the listing's seller / business manager

create or replace function public.is_marketplace_offer_buyer(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_offers o
    where o.listing_id = p_listing_id
      and o.buyer_id = auth.uid()
  );
$$;

revoke all on function public.is_marketplace_offer_buyer(uuid) from public;
grant execute on function public.is_marketplace_offer_buyer(uuid) to authenticated;

create or replace function public.is_marketplace_listing_seller_or_manager(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.marketplace_listings l
    where l.id = p_listing_id
      and (
        l.seller_id = auth.uid()
        or (l.business_id is not null and public.is_student_business_manager(l.business_id))
      )
  );
$$;

revoke all on function public.is_marketplace_listing_seller_or_manager(uuid) from public;
grant execute on function public.is_marketplace_listing_seller_or_manager(uuid) to authenticated;

drop policy if exists "marketplace_listings select" on public.marketplace_listings;
create policy "marketplace_listings select"
on public.marketplace_listings for select
to authenticated
using (
  (status = 'active')
  or seller_id = auth.uid()
  or (business_id is not null and public.is_student_business_manager(business_id))
  or public.is_marketplace_offer_buyer(id)
);

drop policy if exists "marketplace_offers select parties" on public.marketplace_offers;
create policy "marketplace_offers select parties"
on public.marketplace_offers for select
to authenticated
using (
  buyer_id = auth.uid()
  or public.is_marketplace_listing_seller_or_manager(listing_id)
);
