-- Yongin Solar ERP - RLS Policies (Admin Access)
-- 작성일: 2026-02-04
-- Date: 2026-02-04
-- 목적: ERP 신규 테이블에 RLS 정책(관리자 접근) 적용
-- Purpose: Apply admin RLS policies to ERP tables
-- 전제/Assumptions:
-- 1) auth.uid() == coop_members.id (UUID)
-- 2) ref_employees.member_id (text) <-> coop_members.member_id (text) 매칭
--    (ERP 관리자는 ref_employees.role = 'admin')

-- ============================================================
-- 0) Helper Functions / 헬퍼 함수
-- ============================================================
create or replace function public.is_home_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.coop_admins ca
    where ca.id = auth.uid()
  )
  or exists (
    select 1 from public.coop_members cm
    where cm.id = auth.uid()
      and cm.role = 'admin'
  );
$$;

create or replace function public.is_erp_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ref_employees re
    join public.coop_members cm on cm.member_id = re.member_id
    where cm.id = auth.uid()
      and re.role = 'admin'
  );
$$;

grant execute on function public.is_home_admin() to authenticated;
grant execute on function public.is_erp_admin() to authenticated;

-- ============================================================
-- 1) ERP Notifications / ERP 알림
-- ============================================================
alter table public.erp_notifications enable row level security;

drop policy if exists "erp_notifications_admin_all" on public.erp_notifications;
create policy "erp_notifications_admin_all"
  on public.erp_notifications
  for all
  to authenticated
  using (public.is_erp_admin())
  with check (public.is_erp_admin());

-- ============================================================
-- 2) ERP Audit Logs / ERP 감사 로그
-- ============================================================
alter table public.erp_audit_logs enable row level security;

drop policy if exists "erp_audit_logs_admin_all" on public.erp_audit_logs;
create policy "erp_audit_logs_admin_all"
  on public.erp_audit_logs
  for all
  to authenticated
  using (public.is_erp_admin())
  with check (public.is_erp_admin());

-- ============================================================
-- 3) ERP Role Permissions / ERP 권한 매트릭스
-- ============================================================
alter table public.erp_role_permissions enable row level security;

drop policy if exists "erp_role_permissions_admin_all" on public.erp_role_permissions;
create policy "erp_role_permissions_admin_all"
  on public.erp_role_permissions
  for all
  to authenticated
  using (public.is_erp_admin())
  with check (public.is_erp_admin());
