alter table public.profiles
add column if not exists major text;

alter table public.profiles
add column if not exists class_year integer check (class_year between 1900 and 3000);
