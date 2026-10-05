-- Proof fields for representative claims.
-- Files live in a private Storage bucket. Postgres stores the path only.
-- This does not change review_organization_representative_claim.

alter table public.organization_representative_claims
  add column if not exists role_title text check (role_title is null or char_length(role_title) <= 80),
  add column if not exists official_email text check (official_email is null or char_length(official_email) <= 320),
  add column if not exists verification_url text check (verification_url is null or char_length(verification_url) <= 2048),
  add column if not exists proof_storage_path text check (proof_storage_path is null or char_length(proof_storage_path) <= 300),
  add column if not exists proof_file_name text check (proof_file_name is null or char_length(proof_file_name) <= 120),
  add column if not exists proof_mime_type text check (proof_mime_type is null or proof_mime_type in ('image/png', 'image/jpeg', 'application/pdf'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'representative-proofs',
  'representative-proofs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "representative proof read own" on storage.objects;
create policy "representative proof read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'representative-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "representative proof insert own" on storage.objects;
