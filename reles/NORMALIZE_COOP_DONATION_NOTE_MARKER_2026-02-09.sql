-- =================================================================================
-- Version: v1.0.0
-- File: NORMALIZE_COOP_DONATION_NOTE_MARKER_2026-02-09.sql
-- Change: Normalize malformed donation note markers to `[전표완료]`.
-- Date: 2026-02-09
-- =================================================================================

-- 목적:
-- - `coop_donations.note`에 저장된 `compleated [전표완료]` / `completed [전표완료]`
--   같은 값을 `[전표완료]`로 정규화합니다.

begin;

-- 1) 대상 건수 확인
select count(*) as target_rows
from public.coop_donations
where note is not null
  and note like '%[전표완료]%'
  and note ~* '(compleated|completed)';

-- 2) 정규화 실행
update public.coop_donations
set note = '[전표완료]'
where note is not null
  and note like '%[전표완료]%'
  and note ~* '(compleated|completed)';

-- 3) 결과 확인
select count(*) as remain_malformed_rows
from public.coop_donations
where note is not null
  and note like '%[전표완료]%'
  and note ~* '(compleated|completed)';

commit;

