/* Member/capital workbook 1.0.3. Original member writers and legacy import drafts remain separate. */
(function (root) {
  "use strict";
  const memberHeaders = [
    "유형",
    "이름",
    "단체명",
    "조합원번호",
    "주민등록번호",
    "이메일",
    "연락처",
    "사업자번호",
    "법인번호",
    "상태",
    "주소",
    "가입구분",
    "가입일",
    "관리메모",
    "대표자명",
    "담당자명",
    "담당자 직함",
  ];
  const paymentHeaders = [
    "유형",
    "이름·단체명",
    "조합원번호",
    "납입일",
    "금액",
    "입금자명",
    "메모",
    "거래 구분",
  ];
  const text = (v) => String(v ?? "").trim();
  function parse(wb, X, normalizeMember, memberPayload) {
    const ms = wb.Sheets["조합원"],
      ps = wb.Sheets["출자금 납입내역"];
    if (!ms && !ps)
      throw Error(
        "조합원 또는 출자금 납입내역 시트를 사용해 주세요. 양식 다운로드에서 두 시트 양식을 받을 수 있습니다.",
      );
    const read = (sheet) => {
      if (!sheet) return [];
      const range = sheet["!fullref"] || sheet["!ref"];
      if (range) {
        const b = X.utils.decode_range(range);
        if (b.e.r > 10000 || b.e.c > 100)
          throw Error("시트마다 500건 이내로 정리해 주세요.");
      }
      const rows = X.utils.sheet_to_json(sheet, { raw: true, defval: "" });
      if (rows.length > 500)
        throw Error("시트마다 500건까지 검사할 수 있습니다.");
      if (range)
        for (const [key, cell] of Object.entries(sheet))
          if (!key.startsWith("!") && cell?.f)
            throw Error("수식 대신 계산된 값을 붙여넣어 주세요.");
      return rows;
    };
    const rawMembers = read(ms),
      rawPayments = read(ps),
      members = rawMembers.map((r, i) => normalizeMember(r, i)),
      errors = [];
    for (const r of members) {
      if (!r.valid)
        errors.push("조합원 " + r.rowNo + "행: " + r.errors.join(" · "));
      if (r.capital_amount || r.capital_date)
        errors.push(
          "조합원 " + r.rowNo + "행: 출자금은 납입내역 시트에 입력해 주세요.",
        );
    }
    const payload = memberPayload(members).map((r) => {
      delete r.capital_amount;
      delete r.capital_date;
      return r;
    });
    for (const key of [
      "email",
      "member_id",
      "rrn",
      "business_number",
      "corp_number",
    ]) {
      const keys = payload.map((r) =>
        text(r[key]).replace(/[ -]/g, "").toLowerCase(),
      );
      if (keys.some((value, i) => value && keys.indexOf(value) !== i))
        errors.push(
          "조합원 시트에 같은 연락·식별정보가 반복됩니다. 중복 회원인지 확인해 주세요.",
        );
    }
    const payment = rawPayments.map((r, i) => {
      const row = {
        row_no: Number.isInteger(r.__rowNum__) ? r.__rowNum__ + 1 : i + 2,
        member_type: text(r["유형"]),
        name: text(r["이름·단체명"] || r["이름"] || r["단체명"]),
        member_id: text(r["조합원번호"]),
        date: root.CapitalExcelImport.parseDate(
          r["납입일"],
          X,
          wb.Workbook?.WBProps?.date1904 === true,
        ),
        amount: root.CapitalExcelImport.parseAmount(r["금액"]),
        depositor: text(r["입금자명"]),
        note: text(r["메모"]),
        reference: text(r["거래 구분"]),
        confirmed_duplicate: false,
      };
      if (
        !row.date ||
        row.amount === null ||
        (!row.member_id &&
          (!row.name || !["개인", "단체"].includes(row.member_type)))
      )
        errors.push(
          "납입내역 " +
            row.row_no +
            "행: 유형·이름 또는 조합원번호, 납입일·금액을 확인해 주세요.",
        );
      return row;
    });
    if (!payload.length && !payment.length)
      errors.push("등록할 내용이 없습니다.");
    return { data: { members: payload, payments: payment }, errors };
  }
  function create({
    client,
    getContext,
    ensureSpreadsheet,
    normalizeMember,
    memberPayload,
    refresh,
  }) {
    let state = null,
      modal,
      file,
      status,
      summary,
      table,
      submit,
      check,
      clear,
      tab = "payments",
      opener;
    const context = () => getContext() || {},
      same = (s) => s === state && s.owner === context().owner,
      allowed = (s) => same(s) && context().allowed === true,
      visible = () =>
        modal?.classList.contains("show") && !root.frameElement?.hidden;
    const locked = (s) =>
        ["saving", "confirming", "uncertain"].includes(s?.phase),
      el = (tag, value) => {
        const n = document.createElement(tag);
        if (value !== undefined) n.textContent = value;
        return n;
      };
    function pause() {
      if (!state) return;
      state.epoch++;
      state.ctl?.abort();
      if (state.phase === "reading") state.phase = "pending";
      if (state.phase === "checking") state.phase = "needs_check";
      if (state.phase === "confirming") {
        state.phase = state.attempt?.uncertain ? "uncertain" : "ready";
        if (!state.attempt?.uncertain) state.attempt = null;
      }
      render();
    }
    function syncContext() {
      if (!state) return;
      if (!context().owner || state.owner !== context().owner) {
        pause();
        state = null;
        file.value = "";
        root.bootstrap.Modal.getInstance(modal)?.hide();
      } else if (!context().allowed) {
        pause();
        state.message = "현재 권한으로는 등록할 수 없습니다.";
      }
      render();
    }
    function build() {
      if (modal) return;
      modal = el("div");
      modal.id = "memberWorkbookModal";
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.setAttribute("aria-labelledby", "memberWorkbookTitle");
      modal.innerHTML =
        '<div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="memberWorkbookTitle">회원·출자금 엑셀 함께 등록</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body"><div class="d-flex gap-2 flex-wrap mb-3"><button type="button" class="btn btn-outline-success btn-sm" data-template>두 시트 양식 다운로드</button><button type="button" class="btn btn-outline-secondary btn-sm coop-workflow-help" data-help aria-label="회원·출자금 함께 등록 도움말">?</button></div><label class="form-label" for="memberWorkbookFile">엑셀 파일</label><input id="memberWorkbookFile" class="form-control mb-2" type="file" accept=".xlsx,.xls"><p class="small text-muted">조합원 시트에는 신규 회원을 한 줄씩, 출자금 납입내역 시트에는 실제 입금을 한 줄씩 입력하세요. 파일 10MB·시트별 500건까지 검사합니다.</p><p data-status class="small" role="status" aria-live="polite"></p><p data-summary class="small fw-bold"></p><div class="d-flex gap-2 flex-wrap mb-2"><button type="button" class="btn btn-outline-secondary btn-sm" data-check>다시 검사</button><button type="button" class="btn btn-outline-secondary btn-sm" data-export>검토 목록 다운로드</button><button type="button" class="btn btn-outline-secondary btn-sm" data-clear>검토 비우기</button></div><div class="d-flex gap-2 mb-2" role="group" aria-label="검토 시트"><button type="button" class="btn btn-outline-primary btn-sm" data-sheet="members">조합원</button><button type="button" class="btn btn-outline-primary btn-sm" data-sheet="payments">출자금 납입내역</button></div><div class="table-responsive border rounded" style="max-height:45vh;overflow:auto"><table class="table table-sm align-middle mb-0" style="min-width:850px;table-layout:fixed"><thead></thead><tbody></tbody></table></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button><button type="button" class="btn btn-primary" data-submit>회원·납입내역 등록</button></div></div></div>';
      document.body.append(modal);
      const $ = (s) => modal.querySelector(s);
      file = $("input[type=file]");
      status = $("[data-status]");
      status.style.whiteSpace = "pre-line";
      status.style.maxHeight = "8rem";
      status.style.overflow = "auto";
      summary = $("[data-summary]");
      table = $("table");
      submit = $("[data-submit]");
      check = $("[data-check]");
      clear = $("[data-clear]");
      file.onchange = () => {
        if (!allowed(state) || locked(state) || !file.files[0]) return;
        const selected = file.files[0];
        if (
          selected.size > 10 * 1024 * 1024 ||
          !/\.(xlsx|xls)$/i.test(selected.name)
        ) {
          restoreSelection(state.file);
          state.message = "10MB 이하의 엑셀(.xlsx, .xls) 파일을 선택해 주세요.";
          render(false);
          return;
        }
        state.fallback = state.data
          ? {
              file: state.file,
              data: state.data,
              review: state.review,
              acks: state.acks,
              rechecks: state.rechecks,
              errors: state.errors,
              dirty: state.dirty,
              phase: state.phase,
            }
          : null;
        pause();
        state.file = selected;
        state.data = null;
        state.review = null;
        state.acks = new Map();
        state.rechecks = new Set();
        state.attempt = null;
        state.dirty = true;
        void readFile();
      };
      check.onclick = () => void (state?.data ? review() : readFile());
      submit.onclick = () => void save();
      clear.onclick = async () => {
        const s = state;
        if (!s || !allowed(s) || locked(s)) return;
        const epoch = s.epoch;
        if (
          !(await root.CoopDialog.confirm("이 검토 내용을 비울까요?")) ||
          !same(s) ||
          s.epoch !== epoch ||
          !allowed(s) ||
          !visible()
        )
          return;
        pause();
        state = null;
        file.value = "";
        const originalOpener = opener;
        open();
        opener = originalOpener;
        file.focus({ preventScroll: true });
        root.ErpWorkspaceResume?.checkpoint(file);
      };
      const download = (action) => {
        const s = state,
          epoch = s?.epoch;
        void action().catch(() => {
          if (same(s) && s.epoch === epoch && allowed(s) && visible()) {
            s.message = "파일을 내려받지 못했습니다. 다시 시도해 주세요.";
            render(false);
          }
        });
      };
      $("[data-template]").onclick = () => download(template);
      $("[data-help]").onclick = () =>
        void root.CoopDialog.alert(
          "💡 두 시트를 어떻게 쓰나요?\n‘조합원’에는 신규 회원을 한 줄씩, ‘출자금 납입내역’에는 실제 입금을 한 줄씩 적습니다. 유형·이름 또는 조합원번호로 연결하며 기존 회원은 납입내역 시트에만 입력하세요.\n\n같은 날 같은 금액을 두 번 냈다면\n통장 거래번호·입금 시각 등 서로 다른 거래 구분을 적고 각 별도 입금을 확인하세요. 거래 구분을 수정하면 다시 확인해야 하며 기존 중복 검사도 함께 적용됩니다.\n\n등록 전 확인\n미리보기의 회원·날짜·금액과 검사 결과를 대조하세요. 신규 회원과 연결된 납입은 함께 반영하므로 형식 오류·동명이인·중복 대상을 먼저 정리합니다. 이 기능은 실제 납입 내역을 추가하는 것이지 현재 잔액 전체를 덮어쓰는 방식이 아닙니다.",
          { title: "회원·출자금 함께 등록" },
        );
      $("[data-export]").onclick = () => download(exportReview);
      for (const b of modal.querySelectorAll("[data-sheet]"))
        b.onclick = () => {
          tab = b.dataset.sheet;
          renderRows();
        };
      modal.addEventListener("hide.bs.modal", (e) => {
        if (state?.phase === "saving") {
          e.preventDefault();
          return;
        }
        pause();
      });
      modal.addEventListener("hidden.bs.modal", () => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      });
      root.addEventListener("beforeunload", (e) => {
        if (state?.dirty) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
      if (root.frameElement)
        new MutationObserver(() => {
          if (root.frameElement.hidden) pause();
        }).observe(root.frameElement, {
          attributes: true,
          attributeFilter: ["hidden"],
        });
    }
    function renderRows() {
      if (!modal) return;
      const s = state,
        head = table.tHead,
        body = table.tBodies[0];
      head.replaceChildren();
      body.replaceChildren();
      for (const b of modal.querySelectorAll("[data-sheet]"))
        b.setAttribute("aria-pressed", String(b.dataset.sheet === tab));
      const hr = el("tr");
      for (const t of tab === "members"
        ? ["행", "유형", "이름·단체명", "검사 결과"]
        : ["행", "유형·이름", "납입일", "금액", "검사 결과", "거래 구분·확인"])
        hr.append(el("th", t));
      head.append(hr);
      const rows = s?.data?.[tab] || [],
        results = new Map((s?.review?.[tab] || []).map((r) => [r.row_no, r]));
      for (const row of rows) {
        const r = results.get(row.row_no),
          tr = el("tr");
        const values =
          tab === "members"
            ? [
                row.row_no,
                row.member_type,
                row.name,
                s.phase === "saved"
                  ? "등록 완료"
                  : r?.reason || (r ? "등록 가능" : "검사 전"),
              ]
            : [
                row.row_no,
                [row.member_type, r?.name || row.name || row.member_id]
                  .filter(Boolean)
                  .join(" · "),
                row.date || "날짜 확인",
                row.amount == null
                  ? "금액 확인"
                  : row.amount.toLocaleString("ko-KR") + "원",
                s.phase === "saved"
                  ? "등록 완료"
                  : s.rechecks?.has(row.row_no)
                    ? "재확인 필요"
                    : r?.reason ||
                    (r?.needs_confirmation && !row.confirmed_duplicate
                      ? "별도 입금 확인 필요"
                      : r?.needs_confirmation && row.confirmed_duplicate
                        ? "별도 입금 확인됨"
                        : r
                          ? "등록 가능"
                          : "검사 전"),
              ];
        for (const v of values) {
          const td = el("td", v);
          td.style.overflowWrap = "anywhere";
          tr.append(td);
        }
        if (tab === "payments") {
          const resultCell = tr.lastElementChild;
          const td = el("td"),
            input = el("input");
          input.className = "form-control form-control-sm";
          input.maxLength = 200;
          input.value = row.reference;
          input.setAttribute("aria-label", row.row_no + "행 거래 구분");
          input.placeholder = "통장 거래번호·입금 시각";
          input.disabled =
            s.phase === "saved" ||
            !allowed(s) ||
            locked(s) ||
            ["reading", "checking"].includes(s.phase);
          input.oninput = () => {
            if (
              !allowed(s) ||
              locked(s) ||
              ["reading", "checking", "saved"].includes(s.phase)
            ) {
              input.value = row.reference;
              return;
            }
            row.reference = input.value;
            row.confirmed_duplicate = false;
            s.acks.delete(row.row_no);
            s.rechecks.add(row.row_no);
            s.epoch++;
            s.review = null;
            s.attempt = null;
            s.phase = "needs_check";
            s.dirty = true;
            s.message = "거래 구분을 입력했습니다. 다시 검사를 눌러 주세요.";
            resultCell.textContent = "재확인 필요";
            const confirmation = td.querySelector("button");
            if (confirmation) {
              confirmation.textContent = "재확인 필요";
              confirmation.classList.remove("btn-outline-success");
              confirmation.classList.add("btn-outline-warning");
              confirmation.disabled = true;
            }
            for (const button of table.tBodies[0].querySelectorAll("button")) {
              button.disabled = true;
            }
            render(false);
          };
          td.append(input);
          if (r?.needs_confirmation || s.rechecks?.has(row.row_no)) {
            const b = el(
              "button",
              s.rechecks?.has(row.row_no) ? "재확인 필요" : row.confirmed_duplicate ? "별도 입금 확인됨" : "별도 입금 확인",
            );
            b.type = "button";
            b.className =
              "btn btn-sm mt-1 " +
              (row.confirmed_duplicate
                ? "btn-outline-success"
                : "btn-outline-warning");
            b.disabled =
              !allowed(s) ||
              !readyForConfirm(s) ||
              locked(s) ||
              !text(row.reference) ||
              row.confirmed_duplicate;
            b.onclick = () => void confirmDuplicate(row);
            td.append(b);
          }
          tr.append(td);
        }
        body.append(tr);
      }
    }
    function ready(s) {
      return (
        s?.phase === "ready" &&
        s.review &&
        !s.errors?.length &&
        ["members", "payments"].every((k) =>
          s.review[k].every((r) => r.status === "ready"),
        ) &&
        s.review.payments.every(
          (r) =>
            !r.needs_confirmation ||
            s.data.payments.find((p) => p.row_no === r.row_no)
              ?.confirmed_duplicate,
        )
      );
    }
    function render(rows = true) {
      if (!modal) return;
      const s = state,
        can = !!s && allowed(s),
        busy = locked(s) || ["reading", "checking"].includes(s?.phase);
      file.disabled = !can || busy;
      check.disabled = !can || busy || !s.file;
      clear.disabled = !can || busy || !s.file;
      submit.disabled = !can || (!ready(s) && s.phase !== "uncertain");
      submit.textContent =
        s?.phase === "uncertain" ? "같은 요청 다시 확인" : "회원·납입내역 등록";
      status.textContent = s?.message || "";
      summary.textContent = s?.data
        ? "신규 회원 " +
          s.data.members.length +
          "명 · 납입 " +
          s.data.payments.length +
          "건 / " +
          s.data.payments
            .reduce((n, r) => n + BigInt(r.amount || 0), 0n)
            .toLocaleString("ko-KR") +
          "원"
        : "";
      if (rows) renderRows();
    }
    function restoreSelection(selected) {
      try {
        const transfer = new root.DataTransfer();
        if (selected) transfer.items.add(selected);
        file.files = transfer.files;
      } catch (_) {
        file.value = "";
      }
    }
    async function readFile() {
      const s = state;
      if (!s || !allowed(s) || locked(s) || !s.file) return;
      const epoch = ++s.epoch;
      s.phase = "reading";
      s.message = "두 시트의 내용을 읽는 중입니다…";
      render();
      try {
        if (s.file.size > 10 * 1024 * 1024)
          throw Error("파일은 10MB 이하로 선택해 주세요.");
        await ensureSpreadsheet();
        const bytes = await s.file.arrayBuffer();
        if (!same(s) || s.epoch !== epoch || !allowed(s) || !visible()) return;
        const parsed = parse(
          root.XLSX.read(bytes, { type: "array", cellDates: false }),
          root.XLSX,
          normalizeMember,
          memberPayload,
        );
        s.data = parsed.data;
        s.fallback = null;
        s.errors = parsed.errors;
        s.phase = "needs_check";
        if (parsed.errors.length) {
          s.message = parsed.errors.join("\n");
          render();
          return;
        }
        await review();
      } catch (e) {
        if (same(s) && s.epoch === epoch) {
          if (s.fallback) {
            Object.assign(s, s.fallback);
            s.fallback = null;
            restoreSelection(s.file);
          } else s.phase = "pending";
          s.message = /[가-힣]/.test(e.message || "")
            ? e.message
            : "파일을 읽지 못했습니다. 양식과 파일을 확인하고 다시 선택해 주세요.";
          render();
        }
      }
    }
    async function request(action, payload, key, signal) {
      let q = client.rpc("member_workbook_admin", {
        p_action: action,
        p_coop_id: context().coopId,
        p_data: payload,
        p_request_key: key || null,
      });
      if (signal && q.abortSignal) q = q.abortSignal(signal);
      const r = await q;
      if (r.error) throw r.error;
      return r.data;
    }
    async function review() {
      const s = state;
      if (!s || !allowed(s) || locked(s) || !s.data || !visible()) return;
      if (s.errors?.length) {
        s.message = s.errors.join("\n");
        render();
        return;
      }
      const epoch = ++s.epoch;
      s.phase = "checking";
      s.review = null;
      s.message = "조합원 연결과 기존 납입 내역을 확인하는 중입니다…";
      s.ctl?.abort();
      s.ctl = new AbortController();
      render();
      let timer;
      try {
        const r = await Promise.race([
          request("preview", s.data, null, s.ctl.signal),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              s.ctl.abort();
              reject(Error("조회 시간이 길어졌습니다. 다시 검사해 주세요."));
            }, 15000);
          }),
        ]);
        if (!same(s) || s.epoch !== epoch || !allowed(s) || !visible()) return;
        if (
          r?.outcome !== "preview" ||
          !r.expected ||
          !Array.isArray(r.members) ||
          !Array.isArray(r.payments) ||
          r.members.length !== s.data.members.length ||
          r.payments.length !== s.data.payments.length ||
          ["members", "payments"].some((k) =>
            r[k].some(
              (x) =>
                !s.data[k].some((v) => v.row_no === x.row_no) ||
                !["ready", "error"].includes(x.status),
            ),
          )
        )
          throw Error("검사 결과를 확인하지 못했습니다. 다시 검사해 주세요.");
        let changedAcknowledgement = false;
        for (const p of s.data.payments) {
          const current = r.payments.find((x) => x.row_no === p.row_no);
          if (
            p.confirmed_duplicate &&
            s.acks.get(p.row_no) !== acknowledgement(current)
          ) {
            p.confirmed_duplicate = false;
            s.acks.delete(p.row_no);
            changedAcknowledgement = true;
          }
        }
        if (changedAcknowledgement) {
          s.phase = "needs_check";
          return await review();
        }
        s.review = r;
        s.rechecks.clear();
        s.phase = "ready";
        s.message = ["members", "payments"].some((k) =>
          r[k].some((x) => x.status === "error"),
        )
          ? "확인할 행이 있습니다. 검사 결과를 보고 입력을 보완해 주세요."
          : r.payments.some(
                (x) =>
                  x.needs_confirmation &&
                  !s.data.payments.find((p) => p.row_no === x.row_no)
                    ?.confirmed_duplicate,
              )
            ? "같은 날짜·금액은 거래 구분을 입력하고 별도 입금임을 확인해 주세요."
            : "검토 내용을 확인한 뒤 등록해 주세요.";
      } catch (e) {
        if (same(s) && s.epoch === epoch) {
          s.phase = "needs_check";
          s.message =
            e.code === "42501"
              ? "현재 권한으로는 등록할 수 없습니다."
              : e.message || "다시 검사해 주세요.";
        }
      } finally {
        clearTimeout(timer);
        if (same(s) && s.epoch === epoch) render();
      }
    }
    const acknowledgement = (r) =>
      JSON.stringify([
        r?.target,
        r?.snapshot,
        r?.existing_count,
        r?.date,
        r?.amount,
        r?.reference,
      ]);
    async function confirmDuplicate(row) {
      const s = state;
      if (!s || !allowed(s) || !readyForConfirm(s) || !text(row.reference))
        return;
      const epoch = s.epoch,
        ref = row.reference;
      const reviewed = s.review.payments.find((r) => r.row_no === row.row_no);
      const yes = await root.CoopDialog.confirm(
        (reviewed?.name || row.name || row.member_id) +
          "\n" +
          row.date +
          " · " +
          row.amount.toLocaleString("ko-KR") +
          "원\n거래 구분: " +
          ref +
          "\n\n통장에서 확인한 별도 입금인가요?",
        { title: "같은 날짜·금액 확인", confirmText: "별도 입금 확인" },
      );
      if (
        !yes ||
        !same(s) ||
        s.epoch !== epoch ||
        row.reference !== ref ||
        !allowed(s) ||
        !visible()
      )
        return;
      row.confirmed_duplicate = true;
      s.acks.set(row.row_no, acknowledgement(reviewed));
      await review();
      if (
        same(s) &&
        s.epoch === epoch + 1 &&
        allowed(s) &&
        visible() &&
        s.phase === "ready"
      )
        modal
          .querySelector('input[aria-label="' + row.row_no + '행 거래 구분"]')
          ?.focus({ preventScroll: true });
    }
    const readyForConfirm = (s) => s.phase === "ready";
    async function save() {
      const s = state;
      if (
        !s ||
        !allowed(s) ||
        !visible() ||
        (!ready(s) && s.phase !== "uncertain")
      )
        return;
      if (!s.attempt)
        s.attempt = {
          key: root.crypto.randomUUID(),
          payload: JSON.parse(
            JSON.stringify({ ...s.data, expected: s.review.expected }),
          ),
          uncertain: false,
        };
      const attempt = s.attempt,
        epoch = s.epoch;
      s.phase = "confirming";
      render();
      const yes = await root.CoopDialog.confirm(
        "신규 회원 " +
          attempt.payload.members.length +
          "명과 납입 " +
          attempt.payload.payments.length +
          "건을 등록할까요?",
        { title: "회원·출자금 등록", confirmText: "등록" },
      );
      if (!same(s) || s.epoch !== epoch || !allowed(s) || !visible()) return;
      if (!yes) {
        s.phase = attempt.uncertain ? "uncertain" : "ready";
        if (!attempt.uncertain) s.attempt = null;
        render();
        return;
      }
      s.phase = "saving";
      s.message = "회원과 납입 내역을 등록하는 중입니다…";
      render();
      try {
        const r = await request("apply", attempt.payload, attempt.key);
        if (!same(s)) return;
        if (!allowed(s)) {
          attempt.uncertain = true;
          s.phase = "uncertain";
          s.message =
            "등록 결과는 권한 확인 후 같은 요청으로 다시 확인해 주세요.";
          render();
          return;
        }
        if (
          r?.outcome !== "saved" ||
          r.member_count !== attempt.payload.members.length ||
          r.payment_count !== attempt.payload.payments.length
        )
          throw Error("UNCONFIRMED");
        s.phase = "saved";
        s.attempt = null;
        s.dirty = false;
        s.message = "등록했습니다.";
        file.value = "";
        s.file = null;
        root.ErpWorkspaceResume?.checkpoint(file);
        render();
        try {
          if ((await refresh?.()) === false) throw Error("REFRESH");
        } catch (_) {
          if (same(s)) {
            s.message = "등록했습니다. 목록은 다시 불러와 주세요.";
            render();
          }
        }
      } catch (e) {
        if (!same(s)) return;
        if (["22023", "PT409", "42501", "55000"].includes(e.code)) {
          s.attempt = null;
          s.phase = "needs_check";
          s.review = null;
          s.message = e.hint || "입력이나 현재 상태를 다시 검사해 주세요.";
        } else {
          attempt.uncertain = true;
          s.phase = "uncertain";
          s.message =
            "등록 결과를 확인하지 못했습니다. 같은 요청 다시 확인을 눌러 주세요.";
        }
        render();
      }
    }
    async function template() {
      const s = state,
        epoch = s?.epoch;
      if (!s || !allowed(s)) return;
      await ensureSpreadsheet();
      if (!same(s) || s.epoch !== epoch || !allowed(s) || !visible()) return;
      const X = root.XLSX,
        wb = X.utils.book_new();
      for (const [name, h] of [
        ["조합원", memberHeaders],
        ["출자금 납입내역", paymentHeaders],
      ]) {
        const sheet = X.utils.aoa_to_sheet([h]);
        sheet["!cols"] = h.map((v) => ({
          wch: v.includes("메모") ? 35 : Math.max(16, v.length * 2 + 2),
        }));
        X.utils.book_append_sheet(wb, sheet, name);
      }
      X.writeFile(wb, "회원_출자금_함께등록_양식.xlsx");
    }
    async function exportReview() {
      const s = state,
        epoch = s?.epoch;
      if (!s || !allowed(s) || !s.data) return;
      await ensureSpreadsheet();
      if (!same(s) || s.epoch !== epoch || !allowed(s) || !visible()) return;
      const X = root.XLSX,
        wb = X.utils.book_new();
      for (const k of ["members", "payments"]) {
        const rows = s.data[k].map((r) => {
          const v = s.review?.[k]?.find((v) => v.row_no === r.row_no);
          return {
            행: r.row_no,
            유형: r.member_type,
            이름: r.name,
            조합원번호: r.member_id || "",
            납입일: r.date || "",
            금액: r.amount ?? "",
            거래구분: r.reference || "",
            검사결과:
              v?.reason ||
              (s.phase === "saved"
                ? "등록 완료"
                : v?.needs_confirmation
                  ? r.confirmed_duplicate
                    ? "별도 입금 확인됨"
                    : "별도 입금 확인 필요"
                  : v
                    ? "등록 가능"
                    : "검사 전"),
          };
        });
        X.utils.book_append_sheet(
          wb,
          X.utils.json_to_sheet(rows),
          k === "members" ? "조합원 검토" : "납입내역 검토",
        );
      }
      X.writeFile(wb, "회원_출자금_검토목록.xlsx");
    }
    function open() {
      build();
      syncContext();
      const c = context();
      if (!c.owner || !c.allowed) return false;
      if (!state)
        state = {
          owner: c.owner,
          epoch: 0,
          file: null,
          data: null,
          review: null,
          phase: "idle",
          message: "",
          dirty: false,
          acks: new Map(),
          rechecks: new Set(),
          attempt: null,
        };
      opener = document.activeElement;
      render();
      root.bootstrap.Modal.getOrCreateInstance(modal).show();
      if (state.file && !locked(state)) {
        const go = () => void (state.data ? review() : readFile());
        if (visible()) go();
        else modal.addEventListener("shown.bs.modal", go, { once: true });
      }
      return true;
    }
    return Object.freeze({ open, syncContext, hasDraft: () => !!state?.dirty });
  }
  root.MemberCapitalWorkbook = Object.freeze({
    version: "1.0.3",
    create,
    parse,
    memberHeaders,
    paymentHeaders,
  });
})(window);
