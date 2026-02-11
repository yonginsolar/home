- 2026-02-09: **[Accounting]** Added pre-execution auto-sync preview in `erp/accounting.html` so each sync shows target scope/new vs correction counts before final confirmation. / `erp/accounting.html` 자동연동 실행 전에 대상 범위와 신규/정정 건수를 보여주는 미리보기 확인 단계를 추가.
- 2026-02-09: **[Accounting]** Fixed approval sync source from `ac_approval` to `ref_approval` and split posting mode: salary/personnel-like docs post settlement `(차)미지급금/(대)보통예금`, general expense docs post accrual `(차)미분류비용/(대)미지급금`. / 전자결재 연동 소스를 `ac_approval`에서 `ref_approval`로 정정하고, 급여/인건비형 문서는 집행 분개로, 일반 지출 문서는 발생 분개로 분리.
- 2026-02-09: **[Accounting]** Donation auto-sync is now new-only when `coop_donations.note` contains `[전표완료]`: it skips correction/repost entirely (edits require a new donation row). / `coop_donations.note`에 `[전표완료]`가 있으면 기부금 자동연동은 정정/재기표를 하지 않고 완전 스킵(수정은 새 row로 입력)으로 정책 통일.
- 2026-02-09: **[Accounting]** Extended auto-sync correction flow in `erp/accounting.html` to salary/dividend/depreciation. The sync now compares source data with existing `SAL-*`/`DIV-*`/`DEP-*` journal effects and applies cancel-and-repost when amounts changed. / `erp/accounting.html` 자동연동 정정 흐름을 급여/배당/감가상각까지 확장. 기존 `SAL-*`/`DIV-*`/`DEP-*` 전표 효과와 원본 데이터를 비교해 변경 시 취소 후 재기표.
- 2026-02-09: **[Accounting]** Added `↩️ 자동연동 직전 취소` in `erp/accounting.html` to rollback the latest auto-sync batch (journal rows + source status markers). / `erp/accounting.html`에 `↩️ 자동연동 직전 취소`를 추가해 마지막 자동연동 묶음(전표 + 원본 상태 마킹)을 일괄 되돌리기 가능.
- 2026-02-09: **[Membermanage]** Added quick-link task attention badges in `membermanage.html`: red `!` + card highlight now appears on `선거/투표` when assigned `OPEN` election ballots remain unvoted (`election_voters` vs `vote_logs`), and on `전자서명` when officials still have unsigned `OPEN` minutes (`minutes`/`doc_signatures`). / `membermanage.html` 퀵 링크 카드 할일 경고 배지를 추가. 배정된 `OPEN` 선거에서 미투표 건이 남아 있으면 `선거/투표` 카드에, 임원 미서명 `OPEN` 의사록이 남아 있으면 `전자서명` 카드에 빨간 `!`와 강조 테두리를 표시.
- 2026-02-08: **[Bugfix]** Fixed `closeAlert is not defined` error in `vote/vote_login.html` by adding global binding (`window.closeAlert`). / vote_login.html에서 closeAlert 전역 바인딩 추가하여 오류 수정.
- 2026-02-08: **[Logic]** Updated `checkRights` in `vote/vote_login.html` to skip age validation for organization members (`member_type === '단체'`), preventing false "미성년자" error for organizations. / vote_login.html의 checkRights 함수에서 단체 조합원 나이 검증 스킵 로직 추가.
- 2026-02-08: **[Bugfix]** Replaced all `confirm()` calls with `showConfirm()` modal in `vote/admin.html` (8 instances). Added Promise-based `showConfirm()` function for consistent UI. / vote/admin.html의 모든 confirm() 호출을 showConfirm() 모달로 교체 (8곳). Promise 기반 showConfirm() 함수 추가.
- 2026-02-08: **[UI]** Updated placeholder in `vote/candidate_apply.html` member ID search from "2024-001" to "2025-00-0001" to match actual format. / candidate_apply.html 조합원 번호 검색 placeholder를 실제 형식에 맞춰 수정.
- 2026-02-08: **[UI]** Added top navigation buttons (← 뒤로 / 🏠 조합원 관리) to `vote/vote_login.html` and `vote/admin.html` for easier navigation. / vote 페이지들에 상단 네비게이션 버튼 추가 (뒤로가기/조합원 관리).
- 2026-02-08: **[Feature]** Added representative display in `vote/vote_login.html` (name only) and `vote/admin.html` (name + phone) for organization candidates. / vote_login.html에 대표자 이름 표시, admin.html에 대표자 이름+연락처 표시 추가.
- 2026-02-08: **[Bugfix]** Removed postal code patterns (00000) from address display in `formatAddress` function. / formatAddress 함수에서 우편번호 (00000) 패턴 제거.
- 2026-02-08: **[Feature]** Added representative selection for organization members in `vote/candidate_apply.html`: Organizations can now designate a representative (either existing member via search or non-member via manual input). Added `representative_type`, `representative_member_id`, `representative_name`, `representative_birth`, `representative_phone` columns to `candidates` table. / vote/candidate_apply.html에 단체 조합원 대표자 지정 기능 추가: 단체는 조합원 검색 또는 비조합원 직접 입력으로 대표자 지정 가능. candidates 테이블에 대표자 관련 컬럼 추가.
- 2026-02-08: **[Bugfix]** Fixed `closeAlert is not defined` error in `vote/vote_login.html` by adding global binding (`window.closeAlert`). / vote_login.html에서 closeAlert 전역 바인딩 추가하여 오류 수정.
- 2026-02-08: **[Logic]** Updated `checkRights` in `vote/vote_login.html` to skip age validation for organization members (`member_type === '단체'`), preventing false "미성년자" error for organizations. / vote_login.html의 checkRights 함수에서 단체 조합원 나이 검증 스킵 로직 추가.
- 2026-02-08: **[Bugfix]** Fixed `formatAddress` in `vote/vote_login.html` to prioritize administrative boundaries correctly: ~구 → ~동(행정, excluding building numbers like "101동") → ~로/대로/길. / vote/vote_login.html의 주소 표시 우선순위 수정: ~구 → 행정구역 ~동 (건물 동 제외) → 도로명.
- 2026-02-05: 연말결산 모달에서 법정적립금 최소치(당기순이익 10%)를 자동 입력, 3배 기준 달성 시 0 허용. / Closing modal auto-fills legal reserve minimum and allows 0 when 3x capital threshold met.
- 2026-02-05: 연말결산 입력을 모달로 전환하고 법정적립금 규정(당기순이익 10% 이상, 출자금 3배 도달 시 0 허용) 검증 추가. / Closing modal now enforces legal reserve rule with 3x capital exception.
- 2026-02-05: 결산/취소 연도 입력 prompt 제거 및 모달 입력으로 변경. / Replaced closing/undo prompts with modals.
- 2026-02-05: 회계 고급모드(자산/부채/자본 상대계정 분개) 추가 및 특수코드 정규화 로직 반영. / Added advanced mode for counterpart entries and normalized special codes.
- 2026-02-05: AC_MASTER 특수코드 공백 정리용 SQL 추가(reles/AC_MASTER_UPDATES.sql). / Added AC master cleanup SQL.
- 2026-02-05: 회계 화면에서 정산지급 UI 숨김 처리 + 설명 탭 추가(특수 분개/자동연동 요약). / Hide reimburse UI and add Accounting guide tab with special logic notes.
- 2026-02-05: 회계 전표 입력 날짜가 오늘 기준 ±약 4개월을 초과하면 확인 모달 표시(연도 오입력 방지). / Accounting entry date guard prompts confirmation when beyond ~4 months of today.
- 2026-02-05: ERP 결산보고서 항목 표준 순서 정렬 + 전체 인쇄(재무제표/조정명세서→재무상태표→손익계산서→이익잉여금) 추가, 빈 항목 0 표기. / ERP closing report now follows standard ordering, adds full-print sequence, and zero-fills empty lines.
- 2026-02-05: 회계 대시보드에서 통장 잔고는 누적으로 유지, 나머지는 연도별 집계. / Cash balance now cumulative with year-filtered totals.
- 2026-02-05: 회계 대시보드 연도 선택 기준 집계 추가(매출/비용/자산/통장잔고 연도 분리). / Accounting dashboard year filter added.
- 2026-02-05: 회계 전표 저장 시 특수코드 미지원 계정은 일반 분개로 처리하고 빈 entries 저장 방지. / Accounting special-code fallback + empty entry guard.
- 2026-02-05: 패치노트는 일반인이 이해하기 쉬운 톤(쉽고 재미있게)으로 작성. / Patch notes use friendly, easy-to-read tone for general users.
- 2026-02-05: index 콘솔 이스터에그(제미나이 초안 + 코덱스 디테일 + 버그 제보 안내) 복원. / Console easter egg restored.
- 2026-02-05: pay.html 불필요한 isMobile 변수 제거. / pay.html unused 변수 정리.
- 2026-02-05: rules.html 텍스트 모드 줄바꿈 처리 수정(리터럴 <br> 노출 방지). / rules.html 줄바꿈 렌더링 버그 수정.
- 2026-02-05: rules.html에서 &amp;lt;br&amp;gt; 등 이중 이스케이프도 디코딩 후 렌더링. / rules.html 이중 엔티티 디코딩 보완.
- 2026-02-05: rules.html에서 HTML 엔티티(&lt;br&gt; 등)를 디코딩 후 안전 렌더링. / rules.html HTML 엔티티 디코딩 후 렌더링 처리.
- 2026-02-05: rules.html에서 HTML 포함 콘텐츠는 안전하게 렌더링(분해 로직 생략) 처리. / rules.html HTML 콘텐츠 렌더링 분기 추가.
- 2026-02-05: vote/admin 및 vote_login 오류 메시지/로그 출력 XSS 안전화(escapeHtml 적용). / 투표 관리자/포털 로그·에러 출력 XSS 방어 강화.
- 2026-02-05: vote_login 후보 주소 표시를 읍/면/동 우선, 없으면 도로명(대로/로/길)까지만 노출하고 숫자 마스킹. / 투표 후보 주소 노출 규칙(읍/면/동 우선, 없으면 도로명까지만 + 숫자 마스킹).
- 2026-02-05: minutes_sign 서명 상태 판정 로직 수정(터치 서명도 완료로 인식), 대의원(doc_type GENERAL_ASSEMBLY) 대상자 필터링 보완 및 서명 후 목록 갱신. / minutes_sign 서명 상태 인식 및 대의원 대상자 필터 보완.
- 2026-02-05: minutes_view 서명 현황에 서명 이미지와 상태 카드 표시. / minutes_view 서명 이미지/상태 표시 강화.

- 2026-02-05: Standardized frontend time handling: KST input -> UTC storage, KST output across vote/ERP/minutes/notice/member pages. / 프론트엔드 시간 처리 통일: KST 입력을 UTC로 저장, 출력은 KST로 통일(투표/ERP/회의록/공지/조합원 페이지).
- 2026-02-05: Fixed membermanage KST const collision with shared scripts (home_patch_note.js). / membermanage의 KST 상수 충돌(공용 스크립트) 오류 수정.
- 2026-02-05: Fixed index KST const collision with shared scripts (home_patch_note.js). / index의 KST 상수 충돌(공용 스크립트) 오류 수정.
- 2026-02-05: Fixed KST helper name collisions in membermanage/index (shared scripts). / membermanage/index에서 KST 헬퍼 함수명 충돌 오류 수정.
- 2026-02-05: Namespaced KST helpers across vote/minutes/ERP pages and shared scripts to prevent global collisions. / 투표/회의록/ERP 및 공용 스크립트 전반 KST 헬퍼 네임스페이스 적용.
- 2026-02-05: Public notice UI now shows "공지" instead of "공문" (index/notice modal). / 공지 화면에서 "공문" 용어 비노출 처리(index/notice modal).
- 2026-02-05: Minutes admin updated: terminology to 의사록, added 총회/지난 의사록 handling, and past minutes upload UI. / 의사록 용어 통일, 총회/지난 의사록 유형 및 업로드 UI 추가.
- 2026-02-05: ERP accounting auto-sync now includes coop_donations to ac_journal with note completion. / 회계 자동연동에 기부금(coop_donations) 전표 생성 및 note 완료 처리 추가.
- 2026-02-05: Donation auto-sync now treats NULL and empty note as unprocessed. / 기부금 자동연동에서 note가 NULL/빈값 모두 처리.
- 2026-02-05: Donation auto-sync now creates cash (보통예금) asset entry to update bank balance. / 기부금 자동연동에서 보통예금 자산 전표를 추가해 통장잔고 반영.
- 2026-02-05: Membermanage quick-link cards made responsive grid (auto-fit). / membermanage 퀵 링크 카드 반응형 그리드 적용.
- 2026-02-05: minutes_view now shows list first with "open" button and renders attachments from file_url/file_urls. / minutes_view에서 목록 우선 표시, 열람 버튼 추가 및 첨부 렌더링 보완.
- 2026-02-04: Added tabbed admin_minutes layout for Minutes vs Notices. / 회의록·공문 탭 구조로 관리자 화면 분리.
- 2026-02-04: Reverted notice footer to standard company footer text and muted coop_officials query errors. / 공문 푸터를 기본 회사 푸터로 복귀, coop_officials 조회 오류 완화.
- 2026-02-04: Fixed membermanage notice attachments to prefer file_urls for multiple files. / 조합원 공지 첨부에서 file_urls 우선 표시하도록 수정.
- 2026-02-04: Enabled multi-attachment notices with original filenames on homepage/admin. / 홈페이지 공지 다중 첨부 및 원본 파일명 표시 지원.
- 2026-02-04: Refined 공문 notice footer layout and seal positioning in minutes pages. / 공문 푸터 레이아웃 및 도장 위치 조정.
- 2026-02-04: Linked ERP 공문 approvals to coop_notices drafts and added admin_minutes publish workflow. / ERP 공문 결재를 coop_notices 초안으로 연결하고 admin_minutes 게시 흐름 추가.
- 2026-02-04: Added coop_notices doc_no (제YYYY-NNN호) support + admin_member auto numbering. / 홈페이지 공문 문서번호 자동 부여 적용.
# Yongin Solar Platform - Project Reference / 프로젝트 레퍼런스
- 2026-02-05: minutes_view list-first UI now uses title-click detail view (no form/buttons). / minutes_view 목록 우선 + 제목 클릭 상세로 정리(폼/중복 버튼 제거).
- 2026-02-05: minutes_view attachments now use signed URLs for private attachments and show download-only buttons (no filenames). / minutes_view 첨부는 signed URL로 private 버킷 대응, 파일명 숨기고 다운로드 버튼만 표시.
- 2026-02-05: admin_minutes past minutes upload now includes 작성일 input to control ordering. / 지난 의사록 업로드에 작성일 입력 추가(정렬 기준).
- 2026-02-05: admin_minutes 신규 의사록 작성 폼 간소화(공지/수신/경유/공개범위/서명체크 제거) 및 서명 대상 이사회/대의원 분기. / 신규 의사록 폼 간소화 + 이사회/대의원 서명 대상 분기.
- 2026-02-05: minutes_sign 리스트 우선 UI 및 터치 서명(일회성) 지원 추가. / minutes_sign 목록 우선 + 터치 서명(이번만) 기록 지원.
- 2026-02-05: ERP admin_member에 임원 서명/도장 관리 탭 추가(attachments 업로드, coop_officials.seal_url 저장). / 임원 서명 관리 탭 추가 및 seal_url 저장.
- 2026-02-05: admin_member 임원 서명 관리 조회 오류 수정(position 컬럼 제거). / 임원 서명 관리 조회 오류 수정.
- 2026-02-05: admin_minutes 서명 대상 분기(delegate), 목록 검색/미리보기/스크롤 개선. / 의사록 관리 목록 UX 개선 및 서명 대상 분기 수정.
- 2026-02-05: minutes_view 서명 현황 표시 및 목록 뒤로가기 추가. / minutes_view 서명 현황 표시 및 뒤로가기 버튼 추가.
- 2026-02-05: minutes_sign 서명 취소 및 터치 서명 저장 업로드 경로 보강. / minutes_sign 서명 취소 및 터치 서명 저장 개선.

Last Updated: 2026-02-09
최종 업데이트: 2026-02-09
Source: sample/DEV_REFERENCE (1).md, sample/GEMINI_ORCHESTRATOR (1).md
출처: sample/DEV_REFERENCE (1).md, sample/GEMINI_ORCHESTRATOR (1).md

## 1) Core Rules (Must Follow) / 핵심 규칙 (필수)
**EN**
- **Safety First:** Before any modification (edit, write), a `.bak` backup must be created.
- **Precision Edit:** When using the `edit` tool, the `oldText` must be verified against the backup file's content (not the live file) to prevent cascading errors.

- **최우선 규칙 (안전성 강제):** 파일 수정 전 반드시 `cp`로 `.bak` 백업을 생성하고, `edit` 도구 사용 시 `oldText`는 직전의 **백업 파일 내용을 참조**하여 작성한다. `write` 도구는 최종적인 복구 수단으로만 사용하며, 모든 `exec`, `write`, `edit`, `gateway` 명령어는 **민호님의 명시적 승인**을 받은 후에만 실행한다.

- **최우선 규칙 (안전성 강제):** 파일 수정 전 반드시 `cp`로 `.bak` 백업을 생성하고, `edit` 도구 사용 시 `oldText`는 직전의 **백업 파일 내용을 참조**하여 작성한다. `write` 도구는 최종적인 복구 수단으로만 사용하며, 모든 `exec`, `write`, `edit`, `gateway` 명령어는 **민호님의 명시적 승인**을 받은 후에만 실행한다.

- No guessing: DB columns, variables, HTML IDs must be confirmed from code or user.
- Logic first: explain root cause and solution structure before coding, get approval.
- Zero-base analysis: re-check fundamentals instead of patching blindly.
- No window.alert(): use custom modal dialogs.
- Do not delete or simplify existing comments arbitrarily.
- New tables created via SQL must enable RLS and include admin access policies.
- Each modified file must include an internal version record (date + change summary).
- All coding changes should be applied in the iCloud workspace unless explicitly requested otherwise.
- Remember to upload work updates to the release notes regularly.
- HTML content is intentionally allowed for `site_about.content`, `site_partners.content`, `site_documents.content`, and `minutes.content` (render as HTML as designed).

**KR**
- 추측 금지: DB 컬럼, 변수, HTML ID는 코드 또는 사용자에게 확인해야 합니다.
- 논리 우선: 원인과 해결 구조를 설명한 뒤 코딩하고 승인을 받습니다.
- 제로베이스 분석: 임시 패치가 아니라 기본부터 재점검합니다.
- window.alert 금지: 커스텀 모달을 사용합니다.
- 기존 주석을 임의로 삭제/단순화하지 않습니다.
- SQL로 신규 테이블 생성 시 RLS를 켜고 관리자 접근 정책을 포함합니다.
- 수정한 파일은 파일 내부에 버전 기록(날짜/변경 요약)을 추가합니다.
- 모든 코딩 변경은 기본적으로 iCloud 워크스페이스에서 진행합니다(별도 요청 시 제외).
- 작업 내용은 수시로 릴리즈(Release) 문서에 업데이트/업로드합니다.
- `site_about.content`, `site_partners.content`, `site_documents.content`, `minutes.content`는 HTML 허용 데이터이므로 의도대로 HTML 렌더링합니다.

## 2) Business Terminology (UI) / 비즈니스 용어(UI)
**EN**
- Donation -> 자산수증이익 (운영기금)
- Point -> 이용고배당 (Patronage Dividend)

**KR**
- Donation -> 자산수증이익 (운영기금)
- Point -> 이용고배당 (Patronage Dividend)

## 3) Supabase DB Notes / Supabase DB 메모
### coop_points
**EN**
- No balance column.
- No admin_email column.
- Columns: member_uid (UUID FK), member_id (Text), transaction_type, change_amount, reason, status
- Convention: append "(처리자: admin@email.com)" to reason for manual admin grants.

**KR**
- balance 컬럼 없음.
- admin_email 컬럼 없음.
- 컬럼: member_uid (UUID FK), member_id (Text), transaction_type, change_amount, reason, status
- 관례: 관리자 수기 적립 시 reason에 "(처리자: admin@email.com)" 추가.

### coop_donations
**EN**
- Columns: member_uid, amount, donation_date, type (transfer/card/cash), note

**KR**
- 컬럼: member_uid, amount, donation_date, type (transfer/card/cash), note

### coop_members (known)
**EN**
- member_id (Text)
- id (UUID)
- manager_id (UUID)
- email (Text, overwrite allowed)
- kakao_id (Text)

**KR**
- member_id (Text)
- id (UUID)
- manager_id (UUID)
- email (Text, 덮어쓰기 허용)
- kakao_id (Text)

### RPC
**EN**
- manual_claim_member: syncs email and kakao_id to current auth values when manual match succeeds.

**KR**
- manual_claim_member: 수동 매칭 성공 시 현재 인증 값으로 email과 kakao_id를 동기화.

## 4) Implementation Patterns / 구현 패턴
**EN**
- App-side join workaround:
  1) select('*') from log table
  2) collect member_uid list
  3) in('id', uids) from coop_members
  4) map in JS
- Batch processing:
  - If no batch RPC, loop client-side single RPC calls in sequence.

**KR**
- 앱 단 조인 우회:
  1) 로그 테이블에서 select('*')
  2) member_uid 목록 수집
  3) coop_members에서 in('id', uids)
  4) JS에서 매핑
- 배치 처리:
  - 배치 RPC가 없으면 클라이언트에서 단건 RPC를 순차 호출.

## 5) Auth / Policy Decisions / 인증·정책 결정
**EN**
- signInWithOtp shouldCreateUser: true (keep)
- email sync after manual match: overwrite DB email
- duplicate phone allowed only for manager_id (family/staff)

**KR**
- signInWithOtp shouldCreateUser: true (유지)
- 수동 매칭 후 이메일 동기화: DB email을 덮어씀
- 중복 전화번호 허용: manager_id(가족/스태프)만 허용

## 6) UI/UX Rules / UI/UX 규칙
**EN**
- Address edit UX: detail address hidden until postcode search.

**KR**
- 주소 편집 UX: 우편번호 검색 전에는 상세주소를 숨김.

## 7) Current Test Environment Decisions / 테스트 환경 결정 사항
**EN**
- Test pages live in /test with _test filenames.
- Test assets use _test filenames (style_test.css, footer_test.js, etc.).
- OAuth test flow uses auth_callback_test.html; next parameter removed for allowlist match.
- Local session only: do not pass at/rt tokens via URL in test pages.

**KR**
- 테스트 페이지는 /test에 위치하며 파일명은 _test를 사용.
- 테스트 자산은 _test 파일명 사용 (style_test.css, footer_test.js 등).
- OAuth 테스트 흐름은 auth_callback_test.html 사용; allowlist 일치 위해 next 파라미터 제거.
- 로컬 세션만 사용: 테스트 페이지에서 at/rt 토큰을 URL로 전달하지 않음.

## 8) Change Log (append entries) / 변경 기록(추가 기록)
- 2026-02-08: Added Kakao Link button to membermanage.html (visible only when kakao_id is null). / membermanage.html에 카카오 연동 버튼 추가(kakao_id가 null일 때만 노출).
- 2026-02-08: Implemented startKakaoLinking() in membermanage.html to redirect with linking=true flag. / membermanage.html에 linking=true 플래그로 리다이렉트하는 startKakaoLinking() 구현.
- 2026-02-08: Updated auth_callback.html to process linking=true: extracts Kakao ID from session and calls new rpc_link_kakao(current_uid, kakao_id). / auth_callback.html에 linking=true 처리 로직 추가: 세션에서 카카오 ID 추출 후 rpc_link_kakao 호출.
- 2026-02-08: Created reles/RPC_LINK_KAKAO.sql for Supabase DB to update coop_members.kakao_id. / coop_members.kakao_id를 업데이트할 RPC_LINK_KAKAO.sql 생성.
- 2026-02-08: **[Bugfix]** Added null check (`!currentUser.id`) to `vote/candidate_apply.html` initialization to prevent `Cannot read properties of null (reading 'id')` error when member info or auth session is incomplete. / `vote/candidate_apply.html` 초기화 시 `currentUser.id` null 체크를 추가하여 조합원 정보 또는 인증 세션이 불완전할 때 발생하는 오류를 방지.
- 2026-02-08: **[Logic]** Updated `membermanage.html` (`loadDashboardData`) to explicitly save `activeMemberType` to `sessionStorage` for cross-page profile synchronization. / `membermanage.html`의 `loadDashboardData` 함수에 `activeMemberType`을 `sessionStorage`에 명시적으로 저장하는 로직을 추가하여 페이지 간 프로필 동기화 보강.
- 2026-02-08: **[Logic]** Updated `vote/vote_login.html` to load member profile using `sessionStorage.getItem('lastActiveProfile')` UUID instead of Auth email, guaranteeing organization profile state is passed to the vote portal. / `vote/vote_login.html`을 수정하여 Auth 이메일 대신 `sessionStorage.getItem('lastActiveProfile')` UUID를 사용하여 조합원 프로필을 로드, 단체 프로필 상태가 투표 포털까지 유지되도록 보장.
- 2026-02-08: **[Bugfix]** Fixed `vote/vote_login.html` error (`closeAlert is not defined`) by making `closeAlert` global, and updated `checkRights` to bypass RRN/Age validation for organization accounts. / `vote/vote_login.html`의 `closeAlert` 오류를 수정하고, 단체 조합원의 RRN/나이 검증을 무시하도록 `checkRights`를 업데이트.
- 2026-02-08: **[Bugfix]** Fixed address display error in `vote/vote_login.html` (`formatAddress`) where non-greedy regex prematurely cut off road names (e.g., '동천로113번길' became '동'). Changed to greedy match (.*) for accurate address boundary.
- 2026-02-08: **[Bugfix]** Final fix for `formatAddress` in `vote/vote_login.html`. Reverted to non-greedy regex with lookahead (`(?=\s|$)`) to reliably truncate address to the administrative boundary (e.g., '동' or '로') without prematurely cutting off names like '동천로'.
- 2026-02-08: **[Bugfix]** Final address masking logic in `vote/vote_login.html` (v1.0.13). Implemented split logic to handle '동' followed by space and '로/길' followed by number, ensuring accurate display for complex road addresses.
- 2026-02-08: **[Bugfix]** Final address masking fix (v1.0.14). Updated `roadMatch` regex to correctly handle road names followed by spaces, completing the address truncation logic.
- 2026-02-08: **[Bugfix]** Final fix for `formatAddress` (v1.0.18). Replaced complex regex with `lastIndexOf` unit prioritization logic, successfully resolving the conflict between administrative '동' and building numbers (e.g., '101동'). / `vote/vote_login.html`의 주소 표시 오류를 수정: 비탐욕적 정규식으로 인해 도로명이 잘리는 문제(예: '동천로113번길' → '동')를 탐욕적 매치(`.*`)로 변경하여 정확한 주소 경계까지 표시하도록 수정.
- 2026-02-03: Initialized reference file from sample docs. / 샘플 문서 기반으로 레퍼런스 파일을 초기화.
- 2026-02-03: User requested continuous logging to this file for ongoing work. / 사용자가 지속 기록을 요청하여 이 파일에 계속 기록.
- 2026-02-03: Switched active working directory to iCloud path /Users/minhokim/Library/Mobile Documents/com~apple~CloudDocs/New project. / 활성 작업 디렉터리를 iCloud 경로로 전환.
- 2026-02-03: Removed console.log/warn/info across all HTML/JS files (kept console.error). / 모든 HTML/JS에서 console.log/warn/info 제거( console.error 유지 ).
- 2026-02-03: Performed full review of iCloud workspace; flagged URL token handoff, multiple DOM XSS surfaces, HTTP downgrade redirect, and widespread alert() usage (modal required). / iCloud 워크스페이스 전체 리뷰, URL 토큰 전달/DOM XSS/HTTP 다운그레이드/alert() 남용(모달 필요) 이슈 표시.
- 2026-02-03: Test folder review only; flagged remaining DOM XSS surfaces in membermanage_test/index_test/candidate_apply_test and widespread alert() usage. / test 폴더만 리뷰, membermanage_test/index_test/candidate_apply_test의 DOM XSS와 alert() 남용 표시.
- 2026-02-03: Applied test-folder fixes for XSS (membermanage_test, candidate_apply_test, index_test) and replaced admin_test alert() with custom modal showAlert(). / test 폴더 XSS 수정(membermanage_test, candidate_apply_test, index_test) 및 admin_test alert()를 커스텀 모달 showAlert()로 교체.
- 2026-02-03: Replaced remaining alert() usage in test folder with custom showAlert (membermanage_test uses showModal). Added showAlert helper to vote_login_test/index_test/signup_test and to cert_generator_test.js/home_patch_note_test.js. / test 폴더의 남은 alert()를 showAlert로 교체( membermanage_test는 showModal 사용 ). vote_login_test/index_test/signup_test 및 cert_generator_test.js/home_patch_note_test.js에 showAlert 헬퍼 추가.
- 2026-02-03: Switched active working directory to local path /Users/minho/Documents/New project for ERP updates (iCloud sync deferred). / ERP 업데이트를 위해 작업 디렉터리를 로컬 경로(/Users/minho/Documents/New project)로 전환(iCloud 동기화 보류).
- 2026-02-03: Added ERP architecture doc at reles/ARCHITECTURE.md and recorded ERP domain separation (erp.yonginsolar.kr). / reles/ARCHITECTURE.md에 ERP 아키텍처 문서 추가 및 ERP 도메인 분리(erp.yonginsolar.kr) 기록.
- 2026-02-03: Collected confirmed ERP DB schemas (ref_employees, ref_approval, ref_company_info, ref_settings, ref_salaryhistory, ref_calendar, hr_salary, hr_leave_adj, ref_emergency_contacts). / ERP DB 스키마 확정 목록 수집(ref_employees, ref_approval, ref_company_info, ref_settings, ref_salaryhistory, ref_calendar, hr_salary, hr_leave_adj, ref_emergency_contacts).
- 2026-02-03: Approved physical approval workflow (Secretary General prints, uploads signed doc, marks completion) with signed document stored in attachments and URL in ref_approval. / 실물 결재 흐름 승인(사무국장 출력→서명 업로드→완료 표기), 서명 문서는 attachments에 저장하고 URL을 ref_approval에 기록.
- 2026-02-03: Added ERP schema update script reles/ERP_SCHEMA_UPDATES.sql (notifications, audit logs, role permissions, ref_approval columns). / ERP 스키마 업데이트 스크립트 추가(reles/ERP_SCHEMA_UPDATES.sql, 알림/감사로그/권한/ ref_approval 컬럼).
- 2026-02-03: Implemented ERP notifications UI (index.html) and approval notifications/audit logging. / ERP 알림 UI(index.html) 및 결재 알림/감사 로그 구현.
- 2026-02-03: Added ERP permission gates across pages and new admin pages (erp/permissions.html, erp/audit_logs.html). / ERP 권한 게이트를 페이지 전반에 추가하고 신규 관리자 페이지(erp/permissions.html, erp/audit_logs.html) 추가.
- 2026-02-03: Added ERP Kakao OAuth callback (erp/auth_callback.html) and Kakao login button in ERP entry. / ERP 카카오 OAuth 콜백(erp/auth_callback.html) 및 ERP 진입 페이지 카카오 로그인 버튼 추가.
- 2026-02-03: Implemented physical approval flow UI (print, signed doc upload, status updates) and CSV export for approval history. / 실물 결재 UI(출력, 서명 문서 업로드, 상태 업데이트) 및 결재 이력 CSV 내보내기 구현.
- 2026-02-03: Added bilingual (EN/KR) content to reles documents (ARCHITECTURE, PROJECT_REFERENCE, ERP_SCHEMA_UPDATES). / reles 문서(ARCHITECTURE, PROJECT_REFERENCE, ERP_SCHEMA_UPDATES)에 한/영 병기 추가.
- 2026-02-03: Added rule to enable RLS and admin access policies for new SQL-created tables. / SQL로 신규 테이블 생성 시 RLS 및 관리자 접근 정책 적용 규칙 추가.
- 2026-02-04: Added ERP_RLS_POLICIES.sql with admin RLS policies for ERP tables (uses coop_members.member_id + ref_employees.role mapping). / ERP 테이블 관리자 RLS 정책(ERP_RLS_POLICIES.sql) 추가.
- 2026-02-04: Local fix: About section now uses select('*').limit(1) and keeps defaults if no row (index.html, erp/admin_member.html). / 로컬 수정: About 조회를 limit(1)로 변경하고 데이터 없을 때 기본 콘텐츠 유지(index.html, erp/admin_member.html).
- 2026-02-04: Restored ERP About admin UI (sub-about tab) and wired preview/update (admin_member.html). / ERP 소개 관리 UI(About 탭) 복구 및 미리보기 업데이트 연결.
- 2026-02-04: Added rule for in-file version records on modifications. / 수정 파일 내부 버전 기록 규칙 추가.
- 2026-02-04: All coding changes will now be applied in the iCloud workspace by default. / 모든 코딩 변경은 iCloud 워크스페이스에서 진행하기로 기록.
- 2026-02-04: Auto-inserted in-file version headers for iCloud code files (.html/.js/.css/.sql). / iCloud 코드 파일에 버전 주석 자동 삽입.
- 2026-02-04: Security fixes in iCloud: removed URL token handoff in auth_callback, sanitized FAQ/notice rendering in index.html, escaped board list in membermanage.html, and escaped rules rendering in rules.html. / iCloud 보안 수정: auth_callback 토큰 전달 제거, index.html FAQ/공지 렌더링 정리, membermanage 게시판 이스케이프, rules 렌더링 이스케이프.
- 2026-02-04: Enabled signup Kakao 알림톡 (no failure modal), replaced remaining alert() with custom modals, and added auth_callback redirect allowlist. / 가입 알림톡 활성화(실패 알림 없음), alert() 제거, auth_callback 리다이렉트 허용 목록 추가.
- 2026-02-04: Unified showAlert modal styling via footer.js and updated index/home_patch_note/cert_generator to reuse it; ran local HTTP smoke test (200 OK). / footer.js 기반 showAlert 스타일 통일, 관련 파일 정리 및 로컬 200 응답 테스트 완료.
- 2026-02-04: Switched in-file version headers to semantic versioning (v1.x) across tracked files. / 파일 내 버전 주석을 v1.x 방식으로 통일.
- 2026-02-04: ERP admin_member dashboard now shows 7-day 신규가입(승인대기), computes 월별 출자금 유입 from ref_members, and refreshes 업무신청 pending badges on dashboard load. / ERP 대시보드에 7일 신규가입 표시, ref_members 기반 월별 출자금 유입 계산, 업무신청 대기 뱃지 즉시 갱신 추가.
- 2026-02-04: Removed Naver login wiring from signup (Supabase unsupported). / 회원가입에서 네이버 로그인 연동 코드 제거.
- 2026-02-04: Added console version log to all HTML pages (prints [Version] v1.x | filename). / 모든 HTML 페이지에 버전 콘솔 로그 출력 추가.
- 2026-02-04: Updated ERP accounting dashboard to split capital vs assets, show date in recent vouchers, and enforce account code generation/checks for new accounts. / ERP 회계 대시보드에서 출자금/자산 분리, 최근 전표 날짜 표시, 계정코드 자동 생성/검증 추가.
- 2026-02-04: Applied XSS hardening in ERP/admin pages and pay page (escape dynamic fields in admin_member/admin_employee/mypage/accounting; render name safely in pay). / ERP/관리자/입금 페이지 동적 렌더링 XSS 하드닝 적용.
- 2026-02-04: Guarded Supabase init in accounting.html to avoid createClient undefined; clamped 신규가입(7일) count to pending count. / accounting.html에서 Supabase 초기화 가드 추가, 신규가입(7일) 카운트 보정.
- 2026-02-04: Fixed ac_master code lookup to handle code/Code column names; compute 신규가입(7일) from pending rows list. / ac_master 코드 조회를 code/Code 모두 대응하도록 수정, 신규가입(7일) 카운트를 pending 리스트 기반으로 계산.
- 2026-02-04: Accounting now requires public disclosure (XBRL element ID) codes and stops auto-generating account codes; updated UI label/validation. / 회계관리에서 공시형(XBRL element ID) 코드 입력을 의무화하고 계정코드 자동 생성을 중단, UI 라벨/검증 업데이트.
- 2026-02-04: Vote folder XSS hardening (candidate_apply/vote_login/vote/admin/admin_setup/monitor) and added per-file version logs. / vote 폴더 XSS 하드닝 및 파일별 버전 로그 추가.
- 2026-02-04: Added public.sys_home_patch_note.sql entry v2.1.2 (security + XBRL code update note) and preserved line breaks in vote text renderers. / public.sys_home_patch_note.sql에 v2.1.2 패치노트 추가, vote 텍스트 줄바꿈 유지.
- 2026-02-04: Updated home patch note v2.1.2 to exclude ERP-related content. / 홈 패치노트 v2.1.2에서 ERP 관련 내용 제거.
- 2026-02-04: Added minutes schema/RLS update script (reles/MINUTES_SCHEMA_UPDATES.sql) for doc_type, publish gating, and admin/official/member policies. / minutes 스키마·RLS 업데이트 스크립트 추가.
- 2026-02-04: Minutes UI updated (admin publish, official sign list, member view list) and membermanage quick links row added. / minutes UI 업데이트(관리자 공개/임원 서명 목록/조합원 열람 목록) 및 membermanage 퀵 링크 추가.
- 2026-02-04: Added home patch note v2.1.3 for minutes/notice feature rollout. / 홈 패치노트 v2.1.3 추가.
- 2026-02-04: Updated ERP admin_employee roles to 4-tier permissions and fixed salary month-end query/406 and modal focus warnings. / ERP 임직원 권한 4단계 반영, 급여 월말 조회/406 오류 및 모달 포커스 경고 수정.
- 2026-02-04: Fixed admin_member 신규가입(7일) to require 승인대기 + 7일 조건 via DB filter. / admin_member 신규가입(7일) 집계를 승인대기+7일 조건으로 DB에서 필터.
- 2026-02-04: Split MinutesService module, refined membermanage quick link cards, and enabled public view for published minutes; added patch note v2.1.4. / MinutesService 모듈 분리, membermanage 퀵 링크 카드 UI 개선, 공개 문서 로그인 없이 열람 허용, v2.1.4 패치노트 추가.
- 2026-02-04: Added ERP role permission seed SQL (reles/ERP_ROLE_PERMISSIONS_SEED.sql) for 4-role model. / ERP 4단계 권한 기본 시드 SQL 추가.
- 2026-02-04: Added 공문 approval fields (ref_approval.receiver/via), extended upsert_notice_secure for attachments/source_approval_id, and added admin_minutes 공문 게시 UI with optional attachment inclusion. / 공문 결재 필드(ref_approval.receiver/via) 추가, upsert_notice_secure 확장(첨부/결재연결), admin_minutes 공문 게시 UI 및 첨부 선택 기능 추가.

- 2026-02-04: Added minutes attachments (PDF upload + file_urls) with admin upload UI and public download list. / 회의록 첨부(PDF) 업로드 및 공개 다운로드 리스트 추가.

- 2026-02-04: Added 공문 category 분리("공문") with admin edit/publish flow and polished 공문 템플릿. / 공문 카테고리 분리 및 admin_minutes 수정/게시 기능, 공문 템플릿 개선.

- 2026-02-04: Fixed MinutesService module parse errors (export/import) by rebuilding file. / MinutesService 모듈 파싱 오류(export/import) 수정.

- 2026-02-04: Adjusted minutes view/sign layout (logo/org name sizing, footer pinned to bottom, stamp position, email alignment). / 회의록 뷰/서명 레이아웃 조정(로고/텍스트 크기, 푸터 하단 고정, 도장 위치, 이메일 정렬).

- 2026-02-04: Admin minutes doc_no auto-generation + removed manual input; fixed showAlert redeclare in home_patch_note/cert_generator. / admin_minutes 문서번호 자동채번 적용 및 showAlert 중복 선언 오류 수정.
- 2026-02-05: Standardized KST input->UTC storage and KST output display for time values across frontend pages (vote/admin_setup, ERP mypage, minutes/notice templates, and related date defaults). / 프론트엔드 시간값 KST 입력→UTC 저장, KST 출력 통일(투표/admin_setup, ERP mypage, 회의록/공문 템플릿 및 관련 기본 날짜값).

- 2026-02-04: Minutes now support signer selection (directors only, chairman first) and simple text layout for minutes view/sign. / 의사록 서명 대상 지정(이사장 우선, 이사 가나다순) 및 의사록 텍스트 전용 뷰 적용.
- 2026-02-04: Added admin_minutes 공문 게시 취소 action to unpublish released notices. / admin_minutes 공문 게시 취소 기능 추가(게시된 공문 내리기).
- 2026-02-04: Included NOMINATION status in membermanage election quick link visibility. / membermanage 선거 퀵 링크 노출 조건에 후보등록(NOMINATION) 포함.
- 2026-02-04: Added rule to regularly upload work updates to release notes. / 작업 내용 릴리즈 기록 수시 업데이트 규칙 추가.
- 2026-02-04: Documented that HTML content is allowed for site_about/site_partners/site_documents/minutes content fields. / site_about/site_partners/site_documents/minutes content의 HTML 허용 규칙 명시.
- 2026-02-04: Replaced alert() with modal alerts in vote admin/login/setup and applied additional XSS hardening (partner list URLs, member/voter search renderers, group search, audit/permission tables, published minutes list). / 투표 관리자/포털/설정의 alert() 모달 교체 및 추가 XSS 하드닝(파트너 URL, 회원/유권자 검색 렌더, 단체 검색, 감사/권한 테이블, 공개 회의록 목록) 적용.
- 2026-02-04: Added HTML sanitizers for allowed content, created smoke test checklist, and hardened inline feedback rendering. / HTML 허용 콘텐츠용 sanitizer 추가, 스모크 테스트 체크리스트 생성, 인라인 피드백 렌더링 하드닝.
- 2026-02-04: Updated minutes_view layout (org name lower, date/chairman block near bottom, simple-view doc_no) and aligned minutes_sign list UI with public view cards. / minutes_view 레이아웃 조정(상단 조직명 하향, 날짜/이사장 하단 배치, 단순 뷰 문서번호 표기) 및 minutes_sign 목록 UI 정렬.
- 2026-02-04: Switched admin_minutes 공문 관리 to read completed ref_approval 공문 and publish into coop_notices; removed auto draft creation in approval flow. / admin_minutes 공문 관리를 완료된 ref_approval 조회 기반으로 전환하고 결재 자동 초안 생성을 중단.
- 2026-02-04: Applied 공문 template layout in notice detail view and admin_minutes preview (parses 공문 header lines). / 공문 상세 보기와 admin_minutes 미리보기에서 공문 템플릿 적용(헤더 라인 파싱).
- 2026-02-04: Shared notice modal UI/logic across index & membermanage via notice_modal.js; removed 공문 heading and added chairman name + seal in template footer. / index·membermanage 공지 모달을 notice_modal.js로 공통화, 공문 제목 제거 및 하단 이사장/도장 표기 추가.
- 2026-02-06: Expanded ERP accounting prepay tab to unified 선급·미수 관리 with 미수금 발생/회수 flows, tagged matching, and account picker integration. / ERP 회계의 선급금 탭을 선급·미수 통합으로 확장하고, 미수금 발생/회수·태그 매칭·계정 선택 연동을 추가.
- 2026-02-06: Updated ERP accounting report logic to use cumulative BS (<= end date) and period PL (year range), improved account-code mapping (Item/Standard fallback), and refined receivable VAT labels (공급가/세액/청구합계). / ERP 결산보고서 집계를 BS 누적·PL 기간 방식으로 보강하고, 계정코드 매핑(Item/Standard) 및 미수금 VAT 라벨(공급가/세액/청구합계)을 개선.
- 2026-02-06: Receivable tab now shows vendor-level VAT (부가세예수금) alongside receivable balance; collection entry remains 보통예금/미수금 only by design. / 미수금 탭에 거래처별 부가세예수금 표시를 추가하고, 회수 분개는 의도대로 보통예금/미수금만 유지.
- 2026-02-06: Added receivable dropdown summary fallback (`전체 미수`) and legacy alias matching (`매출채권`/`매출세액`) so VAT/balance can display even when vendor-tagged rows are incomplete. / 미수금 드롭다운에 `전체 미수` 요약을 추가하고 레거시 계정 별칭(`매출채권`/`매출세액`) 매칭을 보강해 태그 누락 데이터에서도 청구/세액 표시 가능하도록 개선.
- 2026-02-06: Receivable vendor VAT matching now uses tags + Trans_ID fallback and shows explicit selected-VAT line in UI for easier verification. / 미수금 거래처 VAT 매칭을 태그+Trans_ID 보조 매칭으로 확장하고, 선택 거래처 세액 표시줄을 UI에 추가.
- 2026-02-09: Added `reles/AUTH_TRIGGER_HOTFIX_2026-02-09.sql` to harden `handle_new_user_integrated()` so duplicate-email rows in `coop_members` do not break Auth signup/login; social-id match first, email match only when exactly one row, and trigger-side constraint exceptions are swallowed to keep auth flow alive. / `reles/AUTH_TRIGGER_HOTFIX_2026-02-09.sql` 추가: `handle_new_user_integrated()`를 보강하여 `coop_members` 이메일 중복 데이터가 있어도 Auth 가입/로그인이 중단되지 않도록 수정(소셜 ID 우선 매칭, 이메일은 단일 매칭만 허용, 트리거 제약 예외는 로그인 흐름 보호를 위해 흡수).
- 2026-02-09: Patched `vote/vote_login.html` to prevent candidate-entry crash when profile context is null (`member_uuid` fallback to session/profile storage and safer run-reason handling). / `vote/vote_login.html`에서 프로필 컨텍스트 누락 시 후보등록 진입 오류가 나지 않도록 `member_uuid` fallback(Auth/sessionStorage)과 안내 문구 null-safe 처리를 적용.
- 2026-02-09: Fixed `minutes/admin_minutes.html` runtime errors (`sanitizeHtml` undefined, `loadMinutes` undefined from inline onclick) and added editor helpers (tag toolbar, pre-save preview, load-last-template). / `minutes/admin_minutes.html`의 런타임 오류(`sanitizeHtml`/`loadMinutes` 미정의)를 수정하고 편집 보조 기능(태그 툴바, 저장 전 미리보기, 지난 양식 불러오기)을 추가.
- 2026-02-09: Updated `minutes/admin_minutes.html` (`v1.2.6`) + `minutes/MinutesService.js` (`v1.0.17`) so admin-list preview always shows full minute body by including `content` in list payload and refetching detail (`getMinuteById`) when cache content is empty. / `minutes/admin_minutes.html`(`v1.2.6`) + `minutes/MinutesService.js`(`v1.0.17`)에서 관리목록 미리보기가 항상 본문 전체를 표시하도록 목록 조회에 `content`를 포함하고, 캐시에 본문이 없으면 `getMinuteById` 상세 재조회로 보완.
- 2026-02-09: Updated `membermanage.html` dividend display to expose gross/net amounts and tax breakdown; default tax fallback uses 15.4% when row tax fields are missing. / `membermanage.html` 배당 표시를 세전/세후 및 세액 상세로 확장하고, 세금 필드가 없는 레코드는 15.4% 기본 세율로 보정 계산하도록 반영.
- 2026-02-09: Updated `vote/admin.html` direct candidate registration so organization members require representative-name input, then store `representative_type='non-member'` and `representative_name` in `candidates`. / `vote/admin.html` 관리자 직접 후보 등록에서 단체 조합원 선택 시 대표자 이름 입력을 필수화하고, 저장 시 `representative_type='non-member'` 및 `representative_name`을 `candidates`에 함께 기록하도록 수정.
- 2026-02-09: Updated `vote/admin.html` candidate detail modal so admins can edit and save `APPROVED` (and `PENDING`) candidate fields directly from modal. / `vote/admin.html` 후보 상세 모달에서 관리자에게 `APPROVED`(및 `PENDING`) 후보 정보 수정/저장을 허용하도록 변경.
- 2026-02-09: Updated `vote/admin.html` candidate detail modal to default read-only and require explicit `수정하기` action before entering edit mode; added `수정 취소` to restore view state. / `vote/admin.html` 후보 상세 모달을 기본 읽기 전용으로 바꾸고 `수정하기` 클릭 시에만 편집 모드로 전환되도록 변경했으며, `수정 취소`로 보기 모드 복귀를 지원.
- 2026-02-09: Updated `vote/vote_login.html` to hide candidate list/tabs during nomination intake and show intake-only notice until candidacy closes, to reduce fairness concerns. / `vote/vote_login.html`에서 후보 등록 기간에는 후보 목록/탭을 숨기고 등록 접수 안내만 노출하도록 바꿔 공정성 우려를 줄임.
- 2026-02-09: Updated `vote/admin.html` (`v1.0.20`) so already-registered voters can be selected for district reassignment directly from search results, removed `on_conflict`-dependent writes on `election_voters` (fallback to insert with duplicate-safe handling), and hid technical `is_common=true` wording from district-form UI. / `vote/admin.html`(`v1.0.20`)에서 이미 등록된 유권자도 검색 결과에서 바로 선택해 지역구 변경할 수 있도록 보강하고, `election_voters` 쓰기에서 `on_conflict` 의존을 제거(중복 안전 `insert` 처리)했으며, 지역구 폼 UI의 기술 문구 `is_common=true` 노출을 제거.
- 2026-02-09: Updated `home_patch_note.js` (`v1.0.6`) to restore missing `ensurePatchNoteFocusGuard` and `patchNoteLastFocus`, fixing `ReferenceError` when opening patch-note modal from `membermanage`. / `home_patch_note.js`(`v1.0.6`)에서 누락된 `ensurePatchNoteFocusGuard`와 `patchNoteLastFocus`를 복원해 `membermanage` 패치노트 모달 오픈 시 발생하던 `ReferenceError`를 해결.
- 2026-02-09: Restored donation auto-sync in `erp/accounting.html` (`v1.0.25`): re-added sync card/action, processes unhandled `coop_donations` rows (NULL/empty/no `[전표완료]`) into journal entries `(차) 보통예금 / (대) 자산수증이익`, then appends `[전표완료]` to notes to prevent duplicates. / `erp/accounting.html`(`v1.0.25`)에서 기부금 자동연동을 복구: 자동연동 카드/실행 버튼을 되살리고, `coop_donations` 미처리(note NULL/빈값/`[전표완료]` 미포함) 건을 `(차) 보통예금 / (대) 자산수증이익` 전표로 반영한 뒤 note에 `[전표완료]`를 기록해 중복을 방지.
- 2026-02-09: Patched `erp/accounting.html` (`v1.0.26`) modal accessibility/focus flow by blurring focused controls on modal hide and deferring confirm callback until after close; also replaced donation existing-journal check from `RelatedID in (...)` to `RelatedID like 'DON-%'` scan to avoid PostgREST 400 parsing on hyphenated IDs. / `erp/accounting.html`(`v1.0.26`)에서 모달 닫힘 시 포커스 blur 및 확인 콜백 지연 실행으로 `aria-hidden` 포커스 경고를 완화하고, 기부금 기존 전표 확인을 `RelatedID in (...)`에서 `RelatedID like 'DON-%'` 조회로 변경해 하이픈 ID 파싱 400 오류를 해결.
- 2026-02-09: Revalidated `ac_journal` schema via Supabase OpenAPI and fixed `erp/accounting.html` (`v1.0.27`) to stop using non-existent `RelatedID`; moved sync/dedup keys to `Trans_ID` for closing/undo-closing/approval/donation/dividend/depreciation flows, preventing `column ac_journal.RelatedID does not exist` errors. / Supabase OpenAPI로 `ac_journal` 스키마를 재검증하고 `erp/accounting.html`(`v1.0.27`)에서 존재하지 않는 `RelatedID` 의존을 제거. 결산/결산취소/전자결재/기부금/배당/감가상각 흐름의 식별·중복체크 키를 `Trans_ID`로 전환해 `column ac_journal.RelatedID does not exist` 오류를 방지.
- 2026-02-09: Added full cleanup SQL `reles/DELETE_ALL_DON_JOURNAL_2026-02-09.sql` to remove all donation journals in `ac_journal` where `Trans_ID like 'DON-%'`, including before/after count verification queries. / `Trans_ID like 'DON-%'` 조건의 기부금 전표를 `ac_journal`에서 전부 삭제하는 정리 SQL(`reles/DELETE_ALL_DON_JOURNAL_2026-02-09.sql`)을 추가하고, 삭제 전/후 건수 검증 쿼리를 포함.
- 2026-02-09: Updated `erp/accounting.html` (`v1.0.29`) to use `[전표완료]` as the donation auto-sync completion marker again (both detection and write paths). / `erp/accounting.html`(`v1.0.29`)에서 기부금 자동연동 완료 마커를 다시 `[전표완료]` 기준으로 통일(완료 판별/저장 경로 모두 적용).
- 2026-02-09: Added `reles/NORMALIZE_COOP_DONATION_NOTE_MARKER_2026-02-09.sql` to normalize malformed donation notes like `compleated [전표완료]` / `completed [전표완료]` to `[전표완료]`. / `compleated [전표완료]` / `completed [전표완료]` 형태의 기부금 note 값을 `[전표완료]`로 정규화하는 SQL(`reles/NORMALIZE_COOP_DONATION_NOTE_MARKER_2026-02-09.sql`)을 추가.
- 2026-02-09: Added single-entry style history view in `erp/accounting.html` (`v1.0.30`), grouping double-entry rows by `Trans_ID` and showing date/description/inflow-outflow/amount for easier human reading; users can toggle between `단식 보기` and `복식 원장`. / `erp/accounting.html`(`v1.0.30`)에 단식부기형 이력 보기를 추가하여 `Trans_ID` 기준으로 복식 분개를 묶고 `일자/적요/입금·지출/금액` 중심으로 읽기 쉽게 표시하도록 개선했으며, `단식 보기`/`복식 원장` 전환을 지원.
- 2026-02-09: Refined `erp/accounting.html` single-entry history to a cashbook style (`v1.0.31`): only transactions with cash-account movement are shown, with concise labels (e.g., `기부금 입금`) and `들어옴/나감` amounts. / `erp/accounting.html` 단식 이력을 용돈기입장형(`v1.0.31`)으로 단순화: 현금성 계정 변동 전표만 표시하고, `기부금 입금` 등 요약 항목명과 `들어옴/나감` 금액 중심으로 보여주도록 개선.
- 2026-02-09: Added cancel-and-repost correction flow in `erp/accounting.html` (`v1.0.32`) for donation/capital auto-sync: when source amounts change after posting, the system posts reversal (`...-REV-...`) and repost (`...-POST-...`) entries instead of editing prior journals; capital sync also skips legacy `전표완료` rows that lack `CAP-*` linkage to avoid unsafe duplicates. / `erp/accounting.html`(`v1.0.32`)에 기부금/출자금 자동연동 `전액취소+재기표` 정정 흐름을 추가: 전표완료 후 원본 금액 변경 시 기존 전표를 수정하지 않고 취소분개(`...-REV-...`)와 재기표(`...-POST-...`)를 생성하며, 출자금은 `CAP-*` 연결 정보가 없는 레거시 `전표완료` 건을 자동정정에서 제외해 중복 위험을 방지.
