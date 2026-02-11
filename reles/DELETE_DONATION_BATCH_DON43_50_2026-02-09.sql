-- =================================================================================
-- Version: v1.0.0
-- File: DELETE_DONATION_BATCH_DON43_50_2026-02-09.sql
-- Change: Delete latest donation journal batch (`DON-43` ~ `DON-50`) only.
-- Date: 2026-02-09
-- =================================================================================

-- 설명:
-- - 기존 "중복만 삭제" SQL은 동일 Trans_ID 중복이 있을 때만 동작합니다.
-- - 현재 데이터는 `DON-*`가 모두 2행(정상 분개 1세트)이므로, 최신 배치를 명시 삭제해야 합니다.
-- - 아래 스크립트는 `DON-43`~`DON-50`만 삭제합니다.

begin;

-- 1) 삭제 대상 미리보기
with target(trans_id) as (
  values
    ('DON-43'), ('DON-44'), ('DON-45'), ('DON-46'),
    ('DON-47'), ('DON-48'), ('DON-49'), ('DON-50')
)
select
  j."Trans_ID",
  j."Date",
  j."Account",
  j."Debit",
  j."Credit",
  j."Description"
from public.ac_journal j
join target t
  on j."Trans_ID" = t.trans_id
order by j."Trans_ID", j."Account";

-- 2) 삭제 실행
with target(trans_id) as (
  values
    ('DON-43'), ('DON-44'), ('DON-45'), ('DON-46'),
    ('DON-47'), ('DON-48'), ('DON-49'), ('DON-50')
)
delete from public.ac_journal j
using target t
where j."Trans_ID" = t.trans_id;

-- 3) 삭제 검증 (0건이어야 정상)
with target(trans_id) as (
  values
    ('DON-43'), ('DON-44'), ('DON-45'), ('DON-46'),
    ('DON-47'), ('DON-48'), ('DON-49'), ('DON-50')
)
select
  j."Trans_ID",
  count(*) as remain_rows
from public.ac_journal j
join target t
  on j."Trans_ID" = t.trans_id
group by j."Trans_ID"
order by j."Trans_ID";

commit;

