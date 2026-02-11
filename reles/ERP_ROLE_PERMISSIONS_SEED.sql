-- ERP Role Permissions Seed
-- Roles: admin_all, admin_home, admin_accounting, staff
-- Optional legacy role: admin (uncomment block if you still use role='admin')

WITH perms AS (
  SELECT * FROM (VALUES
    -- 전체 관리자 (모든 접근)
    ('role','admin_all','approval.view','전자결재 조회'),
    ('role','admin_all','approval.submit','전자결재 상신'),
    ('role','admin_all','approval.process','전자결재 결재처리'),
    ('role','admin_all','approval.physical','실물결재 처리'),
    ('role','admin_all','mypage.view','마이페이지 조회'),
    ('role','admin_all','accounting.view','회계 조회'),
    ('role','admin_all','accounting.edit','회계 등록/수정'),
    ('role','admin_all','hr.admin','직원관리'),
    ('role','admin_all','member.admin','홈페이지 관리'),
    ('role','admin_all','audit.view','감사 로그 조회'),
    ('role','admin_all','permission.manage','권한 관리'),

    -- 홈페이지 관리자 (전자결재 + 마이페이지 + 홈페이지 관리)
    ('role','admin_home','approval.view','전자결재 조회'),
    ('role','admin_home','approval.submit','전자결재 상신'),
    ('role','admin_home','mypage.view','마이페이지 조회'),
    ('role','admin_home','member.admin','홈페이지 관리'),

    -- 회계 관리자 (전자결재 + 마이페이지 + 회계 관리)
    ('role','admin_accounting','approval.view','전자결재 조회'),
    ('role','admin_accounting','approval.submit','전자결재 상신'),
    ('role','admin_accounting','mypage.view','마이페이지 조회'),
    ('role','admin_accounting','accounting.view','회계 조회'),
    ('role','admin_accounting','accounting.edit','회계 등록/수정'),

    -- 일반 직원 (전자결재 + 마이페이지)
    ('role','staff','approval.view','전자결재 조회'),
    ('role','staff','approval.submit','전자결재 상신'),
    ('role','staff','mypage.view','마이페이지 조회')

    -- Legacy role support (role='admin') if needed:
    -- ,('role','admin','approval.view','전자결재 조회')
    -- ,('role','admin','approval.submit','전자결재 상신')
    -- ,('role','admin','approval.process','전자결재 결재처리')
    -- ,('role','admin','approval.physical','실물결재 처리')
    -- ,('role','admin','mypage.view','마이페이지 조회')
    -- ,('role','admin','accounting.view','회계 조회')
    -- ,('role','admin','accounting.edit','회계 등록/수정')
    -- ,('role','admin','hr.admin','직원관리')
    -- ,('role','admin','member.admin','홈페이지 관리')
    -- ,('role','admin','audit.view','감사 로그 조회')
    -- ,('role','admin','permission.manage','권한 관리')
  ) AS t(scope, role_key, permission_key, description)
)
INSERT INTO public.erp_role_permissions (scope, role_key, permission_key, description, is_enabled)
SELECT scope, role_key, permission_key, description, true
FROM perms
ON CONFLICT (scope, role_key, permission_key) DO UPDATE
SET is_enabled = EXCLUDED.is_enabled,
    description = EXCLUDED.description,
    updated_at = now();
