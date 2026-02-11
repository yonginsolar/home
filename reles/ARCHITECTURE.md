# ERP Architecture (Yongin Solar Platform) / ERP 아키텍처 (용인솔라 플랫폼)

Last Updated: 2026-02-05
최종 업데이트: 2026-02-05

## 1) Scope / 범위
**EN**
- This document describes the ERP subsystem located under `erp/`.
- Public site and member flows live outside this folder and are out of scope unless explicitly referenced.

**KR**
- 이 문서는 `erp/` 아래에 위치한 ERP 서브시스템을 설명합니다.
- 대외 공개 사이트 및 회원 플로우는 이 폴더 밖에 있으며, 명시적으로 언급되지 않는 한 범위에서 제외됩니다.

## 2) High-Level Overview / 상위 개요
**EN**
- **Frontend**: Static HTML + inline JS (Bootstrap, Chart.js, FullCalendar).
- **Backend**: Supabase (Postgres + Auth + Storage).
- **Storage**: Supabase buckets (notably `attachments`, `assets`, `contracts`).
- **Domains**
  - ERP UI: `https://erp.yonginsolar.kr`
  - OAuth callback (ERP): `https://erp.yonginsolar.kr/auth_callback.html`

**KR**
- **프론트엔드**: 정적 HTML + 인라인 JS (Bootstrap, Chart.js, FullCalendar).
- **백엔드**: Supabase (Postgres + Auth + Storage).
- **스토리지**: Supabase 버킷 (`attachments`, `assets`, `contracts`).
- **도메인**
  - ERP UI: `https://erp.yonginsolar.kr`
  - OAuth 콜백(ERP): `https://erp.yonginsolar.kr/auth_callback.html`

## 3) Authentication & Identity / 인증 및 식별
**EN**
- **Magic Link**: `index.html` uses Supabase OTP login.
- **Kakao OAuth** (ERP):
  - OAuth redirect target: `https://erp.yonginsolar.kr/auth_callback.html`
  - Post-login destination: `erp/index.html`
  - `ref_employees` used to map authenticated users to ERP profile.
- **Local Session**
  - ERP user profile cached in `localStorage` as `erp_user`.

**KR**
- **매직 링크**: `index.html`에서 Supabase OTP 로그인을 사용합니다.
- **카카오 OAuth** (ERP):
  - OAuth 리다이렉트 대상: `https://erp.yonginsolar.kr/auth_callback.html`
  - 로그인 후 이동: `erp/index.html`
  - 인증된 사용자를 ERP 프로필과 매핑하기 위해 `ref_employees` 사용.
- **로컬 세션**
  - ERP 사용자 프로필을 `localStorage`의 `erp_user`에 캐시합니다.

## 4) Core Pages & Responsibilities / 핵심 페이지와 역할
**EN**
- `erp/index.html`: ERP entry, login, and menu routing.
- `erp/approval.html`: Electronic approval (draft, todo, history).
- `erp/mypage.html`: Employee self-service, calendar, salary, certificates.
- `erp/admin_employee.html`: Employee admin, salary/leave, settings.
- `erp/accounting.html`: Accounting entries and reports.
- `erp/admin_member.html`: Member/website admin (coop functions).
- `erp/audit_logs.html`: Audit log viewer (admin).
- `erp/permissions.html`: Role/position permission management.
- `erp/patch_note.js`: Release note modal for ERP entry page.
- `erp/print_service.js`: Print rendering for salary/cert/ledger.
- `erp/auth_callback.html`: ERP OAuth callback (Kakao).

**KR**
- `erp/index.html`: ERP 진입, 로그인, 메뉴 라우팅.
- `erp/approval.html`: 전자결재(작성, 결재대기, 이력).
- `erp/mypage.html`: 직원 셀프 서비스, 캘린더, 급여, 증명서.
- `erp/admin_employee.html`: 직원 관리, 급여/휴가, 설정.
- `erp/accounting.html`: 회계 입력 및 리포트.
- `erp/admin_member.html`: 조합원/웹사이트 관리(조합 기능).
- `erp/audit_logs.html`: 감사 로그 뷰어(관리자).
- `erp/permissions.html`: 역할/직급 권한 관리.
- `erp/patch_note.js`: ERP 진입 페이지 릴리즈 노트 모달.
- `erp/print_service.js`: 급여/증명서/원장 출력 렌더링.
- `erp/auth_callback.html`: ERP OAuth 콜백(카카오).

## 5) Data Model (Confirmed) / 데이터 모델(확정)
### ERP / HR
**EN**
- `ref_employees`: employee master (authority, contact, payroll refs).
- `ref_approval`: approval documents (lines, files, status).
- `ref_company_info`: key/value company settings.
- `ref_settings`: yearly settings (rates, etc).
- `ref_salaryhistory`: salary history.
- `ref_calendar`: shared calendar events.
- `hr_salary`: monthly payroll records.
- `hr_leave_adj`: leave adjustment log.
- `ref_emergency_contacts`: emergency contact list.

**KR**
- `ref_employees`: 직원 마스터(권한, 연락처, 급여 참조).
- `ref_approval`: 결재 문서(결재선, 파일, 상태).
- `ref_company_info`: 회사 설정 키/값.
- `ref_settings`: 연간 설정(요율 등).
- `ref_salaryhistory`: 급여 이력.
- `ref_calendar`: 공유 캘린더 이벤트.
- `hr_salary`: 월 급여 기록.
- `hr_leave_adj`: 휴가 조정 로그.
- `ref_emergency_contacts`: 비상 연락처 목록.

### Related / Existing
**EN**
- `vote_logs`: present (columns TBD).

**KR**
- `vote_logs`: 존재함(컬럼 미확정).

## 6) New Data Model (Planned) / 신규 데이터 모델(계획)
**EN**
> These will be added via SQL migrations (see `reles/ERP_SCHEMA_UPDATES.sql`).
- `erp_notifications`: per-user notifications (approval, payroll, etc).
- `erp_audit_logs`: audit trail for critical actions.
- `erp_role_permissions`: role-based access control matrix.
- `ref_approval` columns:
  - `signed_doc_url`: URL of signed approval doc in Storage
  - `physical_approved_at`: timestamp of physical approval confirmation
  - `physical_approved_by`: employee id who confirmed

**KR**
> 아래 항목은 SQL 마이그레이션으로 추가됩니다(`reles/ERP_SCHEMA_UPDATES.sql` 참고).
- `erp_notifications`: 사용자별 알림(결재, 급여 등).
- `erp_audit_logs`: 주요 행동 감사 로그.
- `erp_role_permissions`: 역할 기반 접근 제어 매트릭스.
- `ref_approval` 컬럼:
  - `signed_doc_url`: 스토리지에 저장된 서명 문서 URL
  - `physical_approved_at`: 실물 결재 확인 시각
  - `physical_approved_by`: 확인자 직원 ID

## 7) Storage Buckets / 스토리지 버킷
**EN**
- `attachments`: approval files, signed docs, evidence.
- `assets`: images/assets used in ERP and site admin.
- `contracts`: employee contracts.

**KR**
- `attachments`: 결재 파일, 서명 문서, 증빙.
- `assets`: ERP 및 사이트 관리에서 사용하는 이미지/자산.
- `contracts`: 근로 계약서.

**EN**
- Minutes viewer (public site) resolves private attachment downloads via signed URLs (bucket: attachments).

**KR**
- 의사록 열람(대외 사이트)은 비공개 첨부 다운로드를 signed URL로 처리함(버킷: attachments).


## 8) Key Workflows / 주요 흐름
### A. ERP Login / ERP 로그인
**EN**
1) User signs in (OTP or Kakao OAuth).
2) User is matched to `ref_employees`.
3) `erp_user` cached to `localStorage`.
4) Menu visibility is computed by role/position.

**KR**
1) 사용자 로그인(OTP 또는 카카오 OAuth).
2) 사용자를 `ref_employees`와 매칭.
3) `erp_user`를 `localStorage`에 캐시.
4) 역할/직급에 따라 메뉴 노출 계산.

### B. Approval Flow (Standard) / 결재 흐름(일반)
**EN**
1) Draft created in `approval.html`.
2) Attachments uploaded to `attachments`.
3) Record created in `ref_approval` with status `진행중`.
4) Approvers process in order until `완료`.

**KR**
1) `approval.html`에서 기안 작성.
2) 첨부 파일을 `attachments`에 업로드.
3) `ref_approval`에 상태 `진행중`으로 기록 생성.
4) 결재자가 순서대로 처리하여 `완료`.

### C. Approval Flow (Physical Approval for Secretary General) / 실물 결재 흐름(사무국장)
**EN**
1) Secretary General drafts.
2) "Physical approval" button prints document with SG signature and sets status to `실물결재대기`.
3) SG receives physical signature from Chairperson.
4) SG uploads signed document and confirms completion (`실물결재완료`).
5) `ref_approval` updated with:
   - `status = 실물결재완료`
   - `signed_doc_url`, `physical_approved_at`, `physical_approved_by`

**KR**
1) 사무국장이 기안.
2) "실물 결재" 버튼으로 사무국장 서명이 포함된 문서를 출력하고 상태를 `실물결재대기`로 변경.
3) 이사장 실물 서명 수령.
4) 서명 문서를 업로드하고 완료 확인(`실물결재완료`).
5) `ref_approval` 업데이트:
   - `status = 실물결재완료`
   - `signed_doc_url`, `physical_approved_at`, `physical_approved_by`

### D. Notifications / 알림
**EN**
- Action-based notifications stored in `erp_notifications`.
- Unread count displayed in ERP header.

**KR**
- 행위 기반 알림을 `erp_notifications`에 저장.
- 미읽음 수를 ERP 헤더에 표시.

### E. Audit Logging / 감사 로그
**EN**
- Critical actions append to `erp_audit_logs` with actor, entity, and diff.

**KR**
- 주요 동작을 `erp_audit_logs`에 실행자, 대상, 변경 내용과 함께 기록.

## 9) UI/UX Rules (Enforced) / UI/UX 규칙(강제)
**EN**
- `window.alert()` is prohibited. Use modal-based alerts.
- Avoid direct `innerHTML` for user data; use safe DOM rendering.
- Maintain existing comments and avoid blind removal.

**KR**
- `window.alert()` 금지. 모달 기반 알림 사용.
- 사용자 데이터는 직접 `innerHTML`에 넣지 말고 안전한 DOM 렌더링 사용.
- 기존 주석을 유지하고 무분별한 삭제를 피함.

## 10) Operational Notes / 운영 메모
**EN**
- ERP is isolated under its own domain; OAuth redirect and CSP must respect this.
- SQL changes must be executed via Supabase SQL editor or admin terminal.

**KR**
- ERP는 별도 도메인으로 분리되어 있으며, OAuth 리다이렉트 및 CSP는 이를 준수해야 합니다.
- SQL 변경은 Supabase SQL Editor 또는 관리자 DB 터미널에서 실행해야 합니다.
