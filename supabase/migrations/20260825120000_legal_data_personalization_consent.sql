-- Record Data & Personalization Consent on the existing per-version legal consent row.
-- Does not change agreementComplete gating (terms + privacy + guidelines), so existing
-- users are not forced through a new production re-consent redirect.

alter table public.user_legal_consents
  add column if not exists accepted_data_consent boolean not null default false;

alter table public.user_legal_consents
  add column if not exists data_consent_version text;

alter table public.user_legal_consents
  add column if not exists data_consented_at timestamptz;

comment on column public.user_legal_consents.accepted_data_consent is
  'Whether the user accepted Data & Personalization Consent for this policy version.';

comment on column public.user_legal_consents.data_consent_version is
  'Version string of the Data & Personalization Consent document accepted.';

comment on column public.user_legal_consents.data_consented_at is
  'Timestamp when Data & Personalization Consent was accepted.';
