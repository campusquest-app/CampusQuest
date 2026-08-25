-- Expand profiles.student_status for clearer onboarding user types.
-- Legacy values current_or_incoming and not_student remain valid.

do $$
declare
  r record;
begin
  for r in
    select conname
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%student_status%'
  loop
    execute format('alter table public.profiles drop constraint if exists %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_student_status_allowed
  check (
    student_status is null
    or student_status in (
      'current_or_incoming',
      'not_student',
      'current_student',
      'incoming_student',
      'graduate_student',
      'faculty_staff'
    )
  );

comment on column public.profiles.student_status is
  'Onboarding user type. Legacy: current_or_incoming | not_student. Current UI: current_student | incoming_student | graduate_student | faculty_staff.';
