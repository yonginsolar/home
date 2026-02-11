# Smoke Test Checklist / 스모크 테스트 체크리스트

Version: v1.0.0
Last Updated: 2026-02-04
Change: Initial manual smoke test checklist for key user flows.

## Scope / 범위
- Use after major releases, security fixes, or UI changes.
- Prefer a test account and test data where possible.

## Public Site / 대외 사이트
- [ ] `index.html` loads without console errors.
- [ ] About section renders from `site_about` and formatting looks correct (HTML allowed).
- [ ] Notices list, search, and detail modal open correctly.
- [ ] Notice attachments download and filenames display correctly.
- [ ] Partners list and partner modal display without broken images.
- [ ] FAQ section loads and accordion works.
- [ ] Map list and markers render; like buttons work.
- [ ] Rules page tabs switch and document content renders correctly.
- [ ] Signup flow: terms modal, postcode search, validation, and OTP email.
- [ ] `auth_callback.html` redirect works with allowlist.

## Member Portal / 조합원 포털
- [ ] `membermanage.html` login, dashboard counters, and quick links load.
- [ ] Board list loads, detail view opens, and attachments render.
- [ ] Family member list renders without layout issues.
- [ ] Partner application form loads existing data (if any) and submits.

## Minutes / 회의록·공문
- [ ] `admin_minutes.html` lists drafts and publish flow works.
- [ ] Minutes attachments upload and public download list works.
- [ ] `minutes_view.html` public view loads published documents.
- [ ] Notice/minutes HTML content renders correctly (allowed HTML).
- [ ] `minutes_sign.html` sign list filters correctly and sign flow works for eligible officials.

## ERP / ERP
- [ ] `erp/index.html` login and menu visibility by role.
- [ ] `erp/approval.html` draft, attachment upload, and approval routing.
- [ ] `erp/admin_member.html` member search, fund lists, and activity logs.
- [ ] `erp/admin_employee.html` employee list and settings modal.
- [ ] `erp/accounting.html` dashboard metrics and report export.
- [ ] `erp/permissions.html` permission list render, toggle, and delete.
- [ ] `erp/audit_logs.html` logs render and CSV export.

## Vote / 선거
- [ ] `vote_login.html` list view and detail view routes.
- [ ] Candidate list and modal open, images load.
- [ ] `vote.html` ballot renders and submission works (test election).
- [ ] `admin.html` login guard, election selection, and candidate workflows.
- [ ] `admin_setup.html` permissions check and setup flow.

## Security / 보안
- [ ] No `window.alert()` usage in runtime flows (custom modals only).
- [ ] HTML-allowed content does not execute scripts or unsafe URLs.
