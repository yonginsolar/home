-- =================================================================================
-- Version: v1.0.0
-- File: AUTH_TRIGGER_HOTFIX_2026-02-09.sql
-- Change: Harden auth.users signup trigger against duplicate-email linkage errors.
-- Date: 2026-02-09
-- =================================================================================

-- Purpose:
-- 1) Prevent "database error saving new user" when duplicate emails exist in coop_members.
-- 2) Keep Auth signup/login alive even if member auto-linking fails on FK/UNIQUE constraints.
-- 3) Link by social ID first, then by email only when exactly one row matches.

create or replace function public.handle_new_user_integrated()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $function$
declare
  v_provider text;
  v_social_id text;
  v_matched_id uuid;
  v_phone text;
  v_email text;
  v_email_match_count int := 0;
begin
  v_provider := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_social_id := coalesce(new.raw_user_meta_data->>'provider_id', new.raw_user_meta_data->>'sub');
  v_phone := coalesce(new.phone, new.raw_user_meta_data->>'phone');
  v_email := nullif(lower(trim(new.email)), '');

  -- Already linked row exists.
  select m.id into v_matched_id
  from public.coop_members m
  where m.id = new.id
  limit 1;

  -- Match by social ID first.
  if v_matched_id is null and v_provider = 'kakao' and v_social_id is not null then
    select m.id into v_matched_id
    from public.coop_members m
    where m.kakao_id = v_social_id
    order by m.created_at desc nulls last
    limit 1;
  elsif v_matched_id is null and v_provider = 'naver' and v_social_id is not null then
    select m.id into v_matched_id
    from public.coop_members m
    where m.naver_id = v_social_id
    order by m.created_at desc nulls last
    limit 1;
  end if;

  -- Match by email only when exactly one row exists.
  if v_matched_id is null and v_email is not null then
    select count(*) into v_email_match_count
    from public.coop_members m
    where lower(trim(coalesce(m.email, ''))) = v_email;

    if v_email_match_count = 1 then
      select m.id into v_matched_id
      from public.coop_members m
      where lower(trim(coalesce(m.email, ''))) = v_email
      limit 1;
    else
      -- 0 or many matches: skip auto-linking to avoid wrong ownership transfer.
      return new;
    end if;
  end if;

  if v_matched_id is null then
    return new;
  end if;

  -- Never break auth signup/login because of linkage failures.
  begin
    update public.coop_members m
    set id = new.id,
        updated_at = now(),
        phone = coalesce(m.phone, v_phone),
        kakao_id = case when v_provider = 'kakao' then coalesce(m.kakao_id, v_social_id) else m.kakao_id end,
        naver_id = case when v_provider = 'naver' then coalesce(m.naver_id, v_social_id) else m.naver_id end
    where m.id = v_matched_id;
  exception
    when unique_violation or foreign_key_violation or check_violation then
      return new;
    when others then
      return new;
  end;

  return new;
end;
$function$;

-- Existing trigger should remain as-is:
-- on_auth_user_created AFTER INSERT ON auth.users
-- EXECUTE FUNCTION public.handle_new_user_integrated();
