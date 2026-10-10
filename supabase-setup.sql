-- Önce Authentication > Users > Add user > Create new user ile
-- yalnızca kendi hesabını oluştur. Auto Confirm User seçili olsun.
-- Bu kurulum, projede tam olarak bir kullanıcı bulunmasını gerektirir.
begin;
do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Önce Authentication > Users bölümünde yalnızca kendi hesabını oluştur.';
  end if;
end $$;

create table if not exists public.medarsiv_allowed_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.medarsiv_allowed_users enable row level security;
revoke all on public.medarsiv_allowed_users from anon, authenticated;
grant select on public.medarsiv_allowed_users to authenticated;
drop policy if exists owner_can_check_access on public.medarsiv_allowed_users;
create policy owner_can_check_access on public.medarsiv_allowed_users
  for select to authenticated using (user_id = (select auth.uid()));
insert into public.medarsiv_allowed_users(user_id)
  select id from auth.users on conflict do nothing;

create table if not exists public.medarsiv_archives (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  lessons jsonb not null default '[]'::jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint archive_array check (jsonb_typeof(lessons) = 'array'),
  constraint archive_size check (octet_length(lessons::text) <= 5242880)
);
alter table public.medarsiv_archives enable row level security;
revoke all on public.medarsiv_archives from anon, authenticated;
grant select, update on public.medarsiv_archives to authenticated;
drop policy if exists owner_reads_archive on public.medarsiv_archives;
create policy owner_reads_archive on public.medarsiv_archives
  for select to authenticated using (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.medarsiv_allowed_users where user_id = (select auth.uid())
    )
  );
drop policy if exists owner_updates_archive on public.medarsiv_archives;
create policy owner_updates_archive on public.medarsiv_archives
  for update to authenticated using (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.medarsiv_allowed_users where user_id = (select auth.uid())
    )
  ) with check (
    owner_id = (select auth.uid()) and exists (
      select 1 from public.medarsiv_allowed_users where user_id = (select auth.uid())
    )
  );
insert into public.medarsiv_archives(owner_id)
  select user_id from public.medarsiv_allowed_users on conflict do nothing;

create or replace function public.save_medarsiv_archive(expected_revision integer, new_lessons jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare next_revision integer;
begin
  if jsonb_typeof(new_lessons) is distinct from 'array' then
    raise exception 'Ders listesi geçersiz.' using errcode = '22023';
  end if;
  if jsonb_array_length(new_lessons) > 5000 then
    raise exception 'En fazla 5000 ders kaydedilebilir.' using errcode = '22023';
  end if;
  update public.medarsiv_archives
    set lessons = new_lessons, revision = revision + 1, updated_at = now()
    where owner_id = (select auth.uid()) and revision = expected_revision
    returning revision into next_revision;
  if next_revision is null then
    raise exception 'Arşiv değişti veya erişim izni yok.' using errcode = 'P0001';
  end if;
  return next_revision;
end $$;
revoke all on function public.save_medarsiv_archive(integer,jsonb) from public, anon;
grant execute on function public.save_medarsiv_archive(integer,jsonb) to authenticated;
commit;
