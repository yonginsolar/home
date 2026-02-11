-- =================================================================================
-- Version: v1.0.0
-- File: DELETE_ALL_DON_JOURNAL_2026-02-09.sql
-- Change: Delete all donation journal rows with Trans_ID like 'DON-%'.
-- Date: 2026-02-09
-- =================================================================================

-- 목적:
-- - `ac_journal`의 기부금 전표(`Trans_ID`가 `DON-*`)를 전부 삭제합니다.
-- - 실행 전/후 개수를 확인할 수 있도록 검증 쿼리를 포함합니다.

begin;

-- 1) 삭제 전 개수 확인
select count(*) as before_count
from public.ac_journal
where "Trans_ID" like 'DON-%';

-- 2) 삭제 실행
delete from public.ac_journal
where "Trans_ID" like 'DON-%';

-- 3) 삭제 후 개수 확인 (0이어야 정상)
select count(*) as after_count
from public.ac_journal
where "Trans_ID" like 'DON-%';

commit;

-- 선택: 기부금 원본의 note 마커도 초기화가 필요하면 아래를 별도 실행
-- update public.coop_donations
-- set note = null
-- where coalesce(note, '') <> '';

