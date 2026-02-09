# 용인모두의햇빛협동조합 플랫폼 개발 참조 문서

> **Last Updated:** 2026-01-19
> **Context:** 자금 관리(자산수증이익) 및 이용고배당(포인트) 시스템 구축

---

## 1. 비즈니스 용어 및 정책 (Business Rules)

| 기존 용어 (Code) | **정정 용어 (UI)** | 설명 및 정책 |
| :--- | :--- | :--- |
| **Donation** (기부금) | **자산수증이익** (운영기금) | 이사들의 자발적 운영 자금. 세무용 영수증 발급 불필요. 현황 파악 목적. |
| **Point** (포인트) | **이용고배당** (Patronage Dividend) | 조합원 이용 실적에 따른 배당금. 법적 오해 방지를 위해 '포인트' 용어 지양. |

---

## 2. 데이터베이스 스키마 (Database Schema)

### A. `public.coop_points` (이용고배당 로그)
* **주의:** `balance`(잔액) 칼럼 없음. `admin_email` 칼럼 없음.
* **PK:** `id` (BigInt)
* **FK:** `member_uid` (UUID) -> `coop_members.id`
* **Columns:**
    * `member_id` (Text): 텍스트 ID (예: 2024-001) - 검색/백업용
    * `transaction_type` (Text):
        * `'earn'` (지급/적립)
        * `'use'` (차감/사용)
        * `'withdraw'` (출금)
        * `'refund'` (환불)
    * `change_amount` (Integer): 변동 금액
    * `reason` (Text): 지급/차감 사유
        * *Convention:* 관리자 수동 지급 시, 사유 뒤에 `(처리자: admin@email.com)` 텍스트 병기할 것.
    * `status` (Text): `'completed'`, `'pending'`, `'cancelled'`

### B. `public.coop_donations` (자산수증이익)
* **FK:** `member_uid` (UUID)
* **Columns:** `amount`, `donation_date`, `type` (transfer/card/cash), `note`

---

## 3. 핵심 개발 패턴 (Implementation Patterns)

### A. Supabase 관계 설정 오류 해결 (App-side Join)
`coop_donations`나 `coop_points` 조회 시, `.select('*, coop_members(*)')` 사용 시 FK 제약조건 문제로 에러(`Could not find a relationship...`)가 발생할 경우 아래 패턴을 사용한다.

**[패턴: 2-Step 조회]**
1.  **Log 조회:** 대상 테이블(`coop_points` 등)을 먼저 `select('*')`로 조회.
2.  **ID 수집:** 조회된 데이터에서 `member_uid`만 추출하여 배열 생성 (`[...new Set(...)]`).
3.  **Member 조회:** `coop_members` 테이블에서 `in('id', uids)`로 이름/ID 조회.
4.  **매핑(Mapping):** JS 메모리 상에서 `member_uid`를 키로 하여 데이터를 병합.

### B. 대량 데이터 처리 (Batch Processing)
별도의 Batch Insert용 RPC가 없는 경우, 클라이언트(Front-end)에서 Loop를 돌며 단건 RPC(`grant_dividend_manual`)를 순차 호출하여 처리한다.
