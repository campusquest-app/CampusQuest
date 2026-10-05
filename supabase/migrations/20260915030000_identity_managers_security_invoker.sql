-- Fix Supabase Security Advisor: public.identity_managers defaults to
-- SECURITY DEFINER (view owner privileges / RLS). Switch to security_invoker so
-- querying users are checked against RLS on the underlying membership tables.
--
-- Postgres 15+ (Supabase). Preserves the existing view definition unchanged.
-- Underlying SELECT policies already allow authenticated users to read:
--   - student_business_members: own rows, or rows for businesses they manage
--   - student_businesses: active / owned / managed
--   - organization_members: authenticated read (using true)
--   - student_organizations: approved, not moderation-removed
-- App identity code queries those tables directly (not this view).

alter view public.identity_managers
set (security_invoker = true);

comment on view public.identity_managers is
  'Managers of business and organization identities. Backed by student_business_members and organization_members. Runs with security_invoker so RLS of the querying user applies.';
