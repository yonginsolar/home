-- =================================================================================
-- Version: v1.0.0
-- File: DELETE_DUP_DONATION_JOURNAL_2026-02-09.sql
-- Change: Remove duplicated donation vouchers (`DON-*`) while keeping one set.
-- Date: 2026-02-09
-- =================================================================================

-- 목적:
-- - 기부금 자동연동 중복 실행으로 생긴 `ac_journal` 중복 전표를 정리합니다.
-- - `Trans_ID`가 `DON-*`인 행 중 "완전히 동일한 분개 라인"의 중복만 삭제합니다.
-- - 각 전표(`Trans_ID`)의 최초 1개 라인은 유지합니다.

begin;

-- 1) 삭제 전 현황 확인
select
  "Trans_ID",
  count(*) as row_count
from public.ac_journal
where "Trans_ID" like 'DON-%'
group by "Trans_ID"
having count(*) > 2
order by row_count desc, "Trans_ID";

-- 2) 중복 삭제 (동일 라인 2건 이상인 경우 1건만 남기고 삭제)
with ranked as (
  select
    ctid,
    row_number() over (
      partition by
        "Trans_ID",
        "Type",
        "Account",
        "Debit",
        "Credit",
        coalesce("Description", ''),
        coalesce("Project", ''),
        coalesce("Operator", '')
      order by ctid
    ) as rn
  from public.ac_journal
  where "Trans_ID" like 'DON-%'
)
delete from public.ac_journal j
using ranked r
where j.ctid = r.ctid
  and r.rn > 1;

-- 3) 삭제 후 재확인
select
  "Trans_ID",
  count(*) as row_count
from public.ac_journal
where "Trans_ID" like 'DON-%'
group by "Trans_ID"
having count(*) > 2
order by row_count desc, "Trans_ID";

commit;

