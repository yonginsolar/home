/* Plant work log1.0.0. Internal records only, original monitor administration authority. */
(function (root) {
  "use strict";
  const kinds = {
      inspection: "점검",
      repair: "수리",
      cleaning: "청소",
      replacement: "부품 교체",
      incident: "장애",
      other: "기타",
    },
    states = { planned: "예정", in_progress: "진행 중", completed: "완료" };
  const mime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  const el = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const today = () =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  function create({
    client,
    getContext,
    container,
    basicContainer,
    onEditPlant,
  }) {
    const drafts = new Map(),
      lists = new Map();
    let scope = "",
      seq = 0,
      active = false,
      selected = "",
      currentList = null,
      reading = false,
      modal,
      form,
      editing = null,
      opener = null,
      editorEpoch = 0,
      detailSeq = 0;
    const context = () => getContext() || {},
      owner = () => JSON.stringify([context().actorId, context().coopId]),
      allowed = () =>
        !!context().actorId &&
        !!context().coopId &&
        context().allowed === true &&
        !root.frameElement?.hidden;
    const current = (key = scope, t = seq) =>
      allowed() && owner() === key && scope === key && t === seq && active;
    const visible = () => !!modal?.classList.contains("show"),
      owns = (d) =>
        d === editing && d.owner === owner() && allowed() && visible();
    const fields = [
      "work_date",
      "kind",
      "title",
      "body",
      "state",
      "vendor",
      "cost",
      "next_date",
      "outage_start",
      "outage_end",
    ];
    let plantSelect, search, retry, more, add, list, status;
    function capture() {
      if (!editing || !form) return;
      for (const name of fields)
        editing.values[name] = form.elements[name].value;
    }
    function dirty(d) {
      return (
        !!d &&
        (d.files.length > 0 ||
          JSON.stringify(d.values) !== d.baseline ||
          d.retainedChanged ||
          !!d.job)
      );
    }
    const draftKey = (plant, id) => owner() + "|" + plant + "|" + id;
    function empty(plant) {
      return {
        id: root.crypto.randomUUID(),
        plant,
        owner: owner(),
        coop: context().coopId,
        actor: context().actorId,
        revision: 0,
        values: {
          work_date: today(),
          kind: "inspection",
          title: "",
          body: "",
          state: "completed",
          vendor: "",
          cost: "",
          next_date: "",
          outage_start: "",
          outage_end: "",
        },
        files: [],
        retained: [],
        uploads: new Map(),
        editRevision: 0,
        retainedChanged: false,
      };
    }
    async function read(action, data, ticket, isCurrent) {
      let timer;
      const ctl = new AbortController();
      try {
        return await Promise.race([
          (async () => {
            let q = client.rpc("plant_work_admin", {
              p_action: action,
              p_coop_id: context().coopId,
              p_actor_uid: context().actorId,
              p_data: data,
            });
            if (q.abortSignal) q = q.abortSignal(ctl.signal);
            const out = await q;
            if (out.error) throw out.error;
            return out.data;
          })(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              ctl.abort();
              reject(Error("TIMEOUT"));
            }, 15000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    function showList() {
      list.replaceChildren();
      if (!currentList) return;
      for (const row of currentList.rows) {
        const card = el("article");
        card.className = "border rounded-3 p-3 mb-2";
        const b = el("button", row.title);
        b.type = "button";
        b.className = "btn btn-link text-start p-0 fw-bold";
        b.dataset.record = row.id;
        b.onclick = () => void openRecord(row, b);
        const meta = el(
          "p",
          row.work_date +
            " · " +
            (kinds[row.kind] || row.kind) +
            " · " +
            (states[row.state] || row.state),
        );
        meta.className = "small text-muted mb-0";
        card.append(b, meta);
        if (row.next_date)
          card.append(el("small", "다음 확인: " + row.next_date));
        list.append(card);
      }
      if (!currentList.rows.length && !reading)
        list.append(
          el(
            "p",
            search.value.trim()
              ? "검색 조건에 맞는 이력이 없습니다."
              : "등록된 작업 이력이 없습니다.",
          ),
        );
      more.hidden = !currentList.hasMore;
    }
    async function load(append = false) {
      if (!allowed() || !active || !selected || reading) return;
      const key = scope,
        t = ++seq,
        plant = selected,
        query = search.value.trim(),
        cache = key + "|" + plant + "|" + query;
      currentList = lists.get(cache) || { rows: [], hasMore: false };
      reading = true;
      retry.disabled = true;
      more.disabled = true;
      status.textContent = "작업 이력을 불러오고 있어요…";
      showList();
      try {
        const last = append ? currentList.rows.at(-1) : null;
        const result = await read(
          "list",
          {
            plant_id: plant,
            query,
            cursor: last ? { work_date: last.work_date, id: last.id } : null,
          },
          t,
        );
        if (
          !current(key, t) ||
          selected !== plant ||
          search.value.trim() !== query
        )
          return;
        if (result?.outcome !== "list" || !Array.isArray(result.rows))
          throw Error("INVALID_RESPONSE");
        const rows = result.rows.slice(0, 20);
        currentList = {
          rows: append
            ? [
                ...new Map(
                  [...currentList.rows, ...rows].map((r) => [r.id, r]),
                ).values(),
              ]
            : rows,
          hasMore: result.rows.length > 20,
        };
        lists.set(cache, currentList);
        status.textContent = "";
      } catch (e) {
        if (current(key, t)) {
          status.textContent =
            e.code === "42501"
              ? "현재 권한으로는 이력을 확인할 수 없습니다."
              : "이력을 불러오지 못했어요. 기존 목록은 유지됩니다. 다시 확인해 주세요.";
        }
      } finally {
        if (scope === key && seq === t) {
          reading = false;
          retry.disabled = false;
          more.disabled = false;
          if (active) showList();
        }
      }
    }
    function build() {
      const style = el("style");
      style.textContent =
        "#plantWorkModal .modal-content{color:var(--bs-body-color,#15261f);background:var(--bs-body-bg,#fff)}#plantWorkModal button,#plantWorkContent button,#plantBaseContent button{min-height:44px;min-width:0;max-width:100%;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}#plantWorkModal .modal-footer{gap:.5rem}#plantWorkModal .form-control,#plantWorkModal .form-select{min-width:0}";
      document.head.append(style);
      container.innerHTML =
        '<div class="d-flex gap-2 flex-wrap align-items-end mb-3"><div class="flex-grow-1"><label for="plantWorkPlant" class="form-label">발전소</label><select id="plantWorkPlant" class="form-select"></select></div><div class="flex-grow-1"><label for="plantWorkSearch" class="form-label">이력 검색</label><input id="plantWorkSearch" class="form-control" type="search" maxlength="200" placeholder="제목·내용·작업업체"></div><button type="button" class="btn btn-outline-primary" data-search>검색</button><button type="button" class="btn btn-outline-secondary" data-retry>다시 확인</button><button type="button" class="btn btn-success" data-add>이력 기록</button><button type="button" class="btn btn-outline-secondary coop-workflow-help" data-help aria-label="작업 이력 도움말">?</button></div><p role="status" aria-live="polite" data-status></p><div data-list></div><button type="button" class="btn btn-outline-secondary" data-more hidden>이전 이력 더 보기</button>';
      plantSelect = container.querySelector("select");
      search = container.querySelector("input");
      retry = container.querySelector("[data-retry]");
      more = container.querySelector("[data-more]");
      add = container.querySelector("[data-add]");
      list = container.querySelector("[data-list]");
      status = container.querySelector("[data-status]");
      const change = () => {
        seq++;
        reading = false;
        detailSeq++;
        selected = plantSelect.value;
        currentList = null;
        if (visible()) root.bootstrap.Modal.getInstance(modal)?.hide();
        void load();
      };
      plantSelect.onchange = change;
      const find = () => {
        if (!allowed()) return;
        seq++;
        reading = false;
        detailSeq++;
        void load();
      };
      container.querySelector("[data-search]").onclick = find;
      search.onkeydown = (e) => {
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          find();
        }
      };
      retry.onclick = () => void load();
      more.onclick = () => void load(true);
      add.onclick = () => void newRecord();
      container.querySelector("[data-help]").onclick = () =>
        void root.CoopDialog.alert(
          "수리·점검·청소·부품 교체·장애 내용을 발전소별로 남깁니다. 작업일과 종류, 제목·내용을 입력하고 사진·고지서 등은 필요한 경우에만 첨부하세요.\n\n이력과 첨부는 내부용이며 홈페이지에 공개되지 않습니다. 비용을 적어도 회계 지출이나 결재가 자동으로 만들어지지는 않습니다. 진행 상태는 예정·진행 중·완료로 구분하고, 다음 확인일은 필요할 때만 적으세요. 알림은 자동 발송하지 않습니다.",
          { title: "점검·작업 이력" },
        );
      modal = el("div");
      modal.id = "plantWorkModal";
      modal.className = "modal fade";
      modal.tabIndex = -1;
      modal.setAttribute("aria-labelledby", "plantWorkTitle");
      modal.innerHTML =
        '<div class="modal-dialog modal-dialog-scrollable" style="width:min(1000px,calc(100vw - 2rem));max-width:none;height:min(780px,calc(100dvh - 2rem));margin:1rem auto"><div class="modal-content" style="height:100%;overflow:auto"><div class="modal-header" style="flex-shrink:0;gap:.5rem"><h2 id="plantWorkTitle" class="modal-title h5" style="min-width:0;overflow-wrap:anywhere">점검·작업 이력</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="닫기"></button></div><div class="modal-body" style="min-height:9rem;overflow:auto"><p data-plant-name class="fw-bold"></p><form class="row g-3" novalidate></form><div data-files class="mt-3"></div><p data-result role="status" aria-live="polite" class="mt-3"></p></div><div class="modal-footer" style="flex-shrink:0;flex-wrap:wrap"><button type="button" class="btn btn-outline-danger" data-discard>초안 버리기</button><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">닫기</button><button type="button" class="btn btn-primary" data-save>저장</button></div></div></div>';
      document.body.append(modal);
      modal.addEventListener("keydown", (event) => {
        if (
          event.key !== "Tab" ||
          root.CoopDialog?.hasPending?.() ||
          event.target.closest?.('[role="alertdialog"],dialog[open]')
        )
          return;
        const nodes = [
          ...modal.querySelectorAll("button,input,select,textarea,[tabindex]"),
        ].filter(
          (n) =>
            !n.disabled &&
            n.tabIndex >= 0 &&
            !n.closest("[hidden],[inert]") &&
            n.getClientRects().length,
        );
        const index = nodes.indexOf(document.activeElement);
        if (
          index < 0 ||
          (!event.shiftKey && index === nodes.length - 1) ||
          (event.shiftKey && index === 0)
        ) {
          event.preventDefault();
          (event.shiftKey ? nodes.at(-1) : nodes[0])?.focus();
        }
      });
      form = modal.querySelector("form");
      const input = (name, label, type = "text", options = null) => {
        const col = el("div");
        col.className = ["title", "body"].includes(name)
          ? "col-12"
          : "col-12 col-md-6";
        const id = "plantWork_" + name,
          l = el("label", label);
        l.htmlFor = id;
        l.className = "form-label";
        let n;
        if (options) {
          n = el("select");
          for (const [key, value] of Object.entries(options))
            n.append(new Option(value, key));
        } else if (name === "body") {
          n = el("textarea");
          n.rows = 6;
          n.maxLength = 10000;
        } else {
          n = el("input");
          n.type = type;
        }
        n.name = name;
        n.id = id;
        n.className = options ? "form-select" : "form-control";
        if (name === "title") n.maxLength = 200;
        if (name === "vendor") n.maxLength = 200;
        if (name === "cost") {
          n.min = "0";
          n.step = "1";
          n.max = "9000000000000";
        }
        col.append(l, n);
        form.append(col);
      };
      input("work_date", "작업일", "date");
      input("kind", "작업 종류", "text", kinds);
      input("title", "제목");
      input("body", "작업 내용");
      input("state", "처리 상태", "text", states);
      input("vendor", "작업업체·담당자");
      input("cost", "비용(원)", "number");
      input("next_date", "다음 확인일", "date");
      input("outage_start", "발전 중단 시작", "datetime-local");
      input("outage_end", "발전 중단 종료", "datetime-local");
      input("photos", "사진·첨부파일", "file");
      form.elements.photos.multiple = true;
      form.elements.photos.accept = Object.values(mime)
        .map((x) => "." + x)
        .join(",");
      form.onsubmit = (e) => {
        e.preventDefault();
        void save();
      };
      form.addEventListener("input", () => {
        if (editing) {
          capture();
          editing.editRevision++;
        }
      });
      form.elements.photos.onchange = () => {
        const d = editing;
        if (!d || !owns(d)) return;
        const incoming = [...form.elements.photos.files];
        if (
          incoming.length + d.files.length + d.retained.length > 6 ||
          incoming.some((f) => f.size > 8388608 || !mime[f.type])
        ) {
          result(
            d,
            "첨부는 지원하는 사진·PDF·Word·Excel 파일로, 각 8MB·총 6개까지 선택해 주세요.",
          );
          form.elements.photos.value = "";
          return;
        }
        d.files.push(...incoming);
        d.editRevision++;
        renderFiles();
      };
      const compare = el("button", "저장본 확인");
      compare.type = "button";
      compare.className = "btn btn-outline-primary";
      compare.dataset.compare = "";
      modal.querySelector("[data-discard]").after(compare);
      compare.onclick = () => void compareStored();
      modal.querySelector("[data-save]").onclick = () => void save();
      modal.querySelector("[data-discard]").onclick = async () => {
        const d = editing,
          t = editorEpoch;
        if (!owns(d) || d.job || d.confirming) return;
        capture();
        if (
          !(await ask(
            d,
            t,
            "작성 중인 이력 초안을 버릴까요? 저장된 이력은 바뀌지 않습니다.",
          ))
        )
          return;
        if (!owns(d) || editorEpoch !== t) return;
        drafts.delete(d.key);
        editing = null;
        root.bootstrap.Modal.getInstance(modal)?.hide();
      };
      modal.addEventListener("hide.bs.modal", () => {
        capture();
        editorEpoch++;
        detailSeq++;
        if (editing?.confirmOwner)
          root.CoopDialog.cancelAll?.(editing.confirmOwner);
      });
      modal.addEventListener("hidden.bs.modal", () => {
        if (
          allowed() &&
          editing?.owner === owner() &&
          active &&
          [document.body, modal].includes(document.activeElement)
        ) {
          const target = opener?.isConnected ? opener : add;
          if (target.getClientRects().length && !target.disabled)
            target.focus({ preventScroll: true });
        }
      });
      root.addEventListener("beforeunload", (e) => {
        capture();
        if ([...drafts.values()].some(dirty)) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
      root.addEventListener("pagehide", pause);
      if (root.frameElement)
        new MutationObserver(() => {
          if (root.frameElement.hidden) pause();
        }).observe(root.frameElement, {
          attributes: true,
          attributeFilter: ["hidden"],
        });
    }
    function result(d, text) {
      d.message = text;
      if (owns(d)) modal.querySelector("[data-result]").textContent = text;
    }
    function renderFiles() {
      if (!editing) return;
      const d = editing,
        box = modal.querySelector("[data-files]");
      try {
        const transfer = new root.DataTransfer();
        for (const file of d.files) transfer.items.add(file);
        form.elements.photos.files = transfer.files;
      } catch (_) {
        /* Exact File objects remain in the scoped draft when native FileList reassignment is unavailable. */
      }
      box.replaceChildren();
      for (const [i, file] of d.retained.entries()) {
        const row = el("div");
        row.className = "d-flex gap-2 flex-wrap mb-2";
        const b = el("button", file.name);
        b.type = "button";
        b.className = "btn btn-outline-primary btn-sm";
        b.onclick = async () => {
          const t = editorEpoch;
          try {
            const out = await client.storage
              .from("plant-work-private")
              .createSignedUrl(file.path, 60);
            if (out.error) throw out.error;
            if (!owns(d) || editorEpoch !== t) return;
            const url = new URL(out.data.signedUrl);
            if (url.protocol !== "https:") throw Error("URL");
            const a = el("a");
            a.href = url.href;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.click();
          } catch (_) {
            if (owns(d) && editorEpoch === t)
              result(d, "첨부파일을 열지 못했어요. 다시 시도해 주세요.");
          }
        };
        const remove = el("button", "첨부 제외");
        remove.type = "button";
        remove.className = "btn btn-outline-secondary btn-sm";
        remove.disabled = !!d.job;
        remove.onclick = () => {
          d.retained.splice(i, 1);
          d.retainedChanged = true;
          d.editRevision++;
          renderFiles();
        };
        row.append(b, remove);
        box.append(row);
      }
      for (const [i, file] of d.files.entries()) {
        const row = el("div", file.name);
        row.className = "mb-2";
        row.style.overflowWrap = "anywhere";
        const remove = el("button", "선택 취소");
        remove.type = "button";
        remove.className = "btn btn-outline-secondary btn-sm ms-2";
        remove.disabled = !!d.job;
        remove.onclick = () => {
          d.files.splice(i, 1);
          d.editRevision++;
          renderFiles();
        };
        row.append(remove);
        box.append(row);
      }
    }
    function paint(d) {
      editing = d;
      editorEpoch++;
      for (const name of fields)
        form.elements[name].value = d.values[name] || "";
      form.elements.photos.value = "";
      modal.querySelector("[data-plant-name]").textContent =
        (context().plants || []).find((p) => p.id === d.plant)?.name ||
        "발전소";
      modal.querySelector("[data-result]").textContent = d.message || "";
      renderFiles();
      root.bootstrap.Modal.getOrCreateInstance(modal).show();
      buttons(d);
    }
    async function newRecord() {
      if (!allowed() || !active || !selected) return;
      detailSeq++;
      opener = document.activeElement;
      const key = draftKey(selected, "new");
      let d = drafts.get(key);
      if (!d) {
        d = empty(selected);
        d.key = key;
        d.baseline = JSON.stringify(d.values);
        drafts.set(key, d);
      }
      paint(d);
    }
    async function openRecord(row, button) {
      if (!allowed() || !active) return;
      const key = scope,
        t = ++detailSeq,
        plant = selected,
        k = draftKey(plant, row.id);
      opener = button;
      if (drafts.has(k)) {
        paint(drafts.get(k));
        return;
      }
      status.textContent = "선택한 이력을 불러오고 있어요…";
      try {
        const out = await read("get", { plant_id: plant, id: row.id });
        if (!current(key) || detailSeq !== t || selected !== plant) return;
        const r = out.record;
        if (
          out.outcome !== "record" ||
          r?.id !== row.id ||
          r.plant_id !== plant
        )
          throw Error("INVALID_RECORD");
        const d = empty(plant);
        d.id = r.id;
        d.key = k;
        d.revision = r.revision;
        for (const name of fields) {
          let value = r[name] ?? "";
          if (["outage_start", "outage_end"].includes(name) && value) {
            const date = new Date(value);
            value = new Intl.DateTimeFormat("sv-SE", {
              timeZone: "Asia/Seoul",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
              .format(date)
              .replace(" ", "T");
          }
          d.values[name] = String(value);
        }
        d.retained = r.files || [];
        d.baseline = JSON.stringify(d.values);
        drafts.set(k, d);
        status.textContent = "";
        paint(d);
      } catch (_) {
        if (current(key) && detailSeq === t)
          status.textContent =
            "이력을 열지 못했어요. 제목을 다시 눌러 확인해 주세요.";
      }
    }
    const payload = (d) => {
      const value = {
        ...d.values,
        id: d.id,
        plant_id: d.plant,
        revision: d.revision,
        files: d.retained.slice(),
      };
      for (const name of ["outage_start", "outage_end"])
        if (value[name])
          value[name] = new Date(value[name] + ":00+09:00").toISOString();
      return value;
    };
    async function compareStored() {
      const d = editing,
        t = editorEpoch,
        rev = d?.editRevision;
      if (!d || !owns(d) || d.job || !d.revision || d.confirming) return;
      capture();
      const b = modal.querySelector("[data-compare]");
      b.disabled = true;
      try {
        const out = await read("get", { plant_id: d.plant, id: d.id });
        if (!owns(d) || editorEpoch !== t || rev !== d.editRevision) return;
        const r = out.record;
        if (
          out.outcome !== "record" ||
          r?.id !== d.id ||
          !Number.isSafeInteger(r.revision)
        )
          throw Error("INVALID");
        const message =
          "최근 저장된 이력입니다.\n\n작업일: " +
          r.work_date +
          "\n제목: " +
          r.title +
          "\n상태: " +
          (states[r.state] || r.state) +
          "\n작업업체: " +
          (r.vendor || "없음") +
          "\n비용: " +
          (r.cost ?? "미입력") +
          "\n다음 확인일: " +
          (r.next_date || "없음") +
          "\n중단: " +
          (r.outage_start || "없음") +
          " ~ " +
          (r.outage_end || "없음") +
          "\n첨부: " +
          ((r.files || []).map((f) => f.name).join(", ") || "없음") +
          "\n\n" +
          r.body +
          "\n\n작성 중인 초안을 유지하고 이 저장본을 기준으로 다시 검토할까요?";
        d.confirming = true;
        const yes = await ask(d, t, message);
        if (yes && owns(d) && t === editorEpoch && rev === d.editRevision) {
          d.revision = r.revision;
          result(
            d,
            "최신 저장본을 확인했어요. 작성 중인 내용으로 저장하려면 저장을 눌러 주세요.",
          );
        }
      } catch (_) {
        if (owns(d) && editorEpoch === t)
          result(
            d,
            "저장본을 확인하지 못했어요. 초안을 유지한 채 다시 확인해 주세요.",
          );
      } finally {
        d.confirming = false;
        buttons(d);
      }
    }
    function settled(d, job, out) {
      if (d.job !== job) return;
      if (
        out?.outcome !== "saved" ||
        out.id !== d.id ||
        !Number.isSafeInteger(out.revision)
      )
        return false;
      d.revision = out.revision;
      d.baseline = JSON.stringify(job.values);
      d.retained = job.payload.files;
      d.files = d.files.filter((f) => !job.files.includes(f));
      d.retainedChanged = false;
      d.job = null;
      if (!dirty(d)) {
        drafts.delete(d.key);
        d.key = draftKey(d.plant, d.id);
        drafts.set(d.key, d);
      }
      result(
        d,
        "저장했습니다." +
          (dirty(d) ? " 이후에 수정한 내용은 아직 저장되지 않았어요." : ""),
      );
      if (owns(d)) {
        modal.querySelector("[data-save]").textContent = "저장";
        modal.querySelector("[data-discard]").disabled = false;
        renderFiles();
      }
      return true;
    }
    async function ask(d, t, message) {
      const bound = {
        get closed() {
          return !owns(d) || editorEpoch !== t;
        },
        get frameElement() {
          return root.frameElement;
        },
        get parent() {
          return root.parent;
        },
        document,
        getSelection: () => root.getSelection(),
      };
      d.confirmOwner = bound;
      try {
        return root.CoopDialog.forOwner
          ? await root.CoopDialog.forOwner(bound, "confirm", message, "", {})
          : await root.CoopDialog.confirm(message);
      } finally {
        if (d.confirmOwner === bound) d.confirmOwner = null;
      }
    }
    async function sendJob(d, job, action) {
      let timer;
      const request = Promise.resolve(
        client.rpc("plant_work_admin", {
          p_action: action,
          p_coop_id: d.coop,
          p_actor_uid: d.actor,
          p_data: action === "save" ? job.payload : {},
          p_request_key: job.key,
        }),
      );
      if (action === "save") job.pending = true;
      const original = request
        .then((out) => {
          if (out.error) throw out.error;
          if (action === "save") job.receipt = out.data;
          return out.data;
        })
        .finally(() => {
          if (action === "save") job.pending = false;
        });
      try {
        return await Promise.race([
          original,
          new Promise(
            (_, reject) =>
              (timer = setTimeout(
                () => reject(Error("UNKNOWN")),
                action === "save" ? 30000 : 15000,
              )),
          ),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    function acceptResult(d, job, out) {
      if (out?.outcome === "conflict") {
        if (d.job === job) d.job = null;
        result(
          d,
          "다른 사람이 먼저 수정했어요. 초안은 유지됩니다. 저장본 확인으로 최신 내용을 대조한 뒤 다시 저장해 주세요.",
        );
        return true;
      }
      return settled(d, job, out);
    }
    function buttons(d) {
      if (!owns(d)) return;
      modal.querySelector("[data-save]").textContent = d.job
        ? d.job.retryAllowed
          ? "이전 저장 재시도"
          : d.job.started
            ? "저장 결과 확인"
            : "첨부 준비 다시 확인"
        : "저장";
      modal.querySelector("[data-discard]").disabled =
        !!d.job || !!d.confirming;
      modal.querySelector("[data-compare]").disabled = !!d.job || !d.revision;
      renderFiles();
    }
    async function save() {
      const d = editing;
      if (!d || !owns(d) || d.confirming) return;
      capture();
      if (d.job?.busy) return;
      if (d.job) {
        const job = d.job;
        if (!job.started) {
          if (job.uploadPending) {
            result(
              d,
              "첨부 전송을 확인하고 있어요. 파일은 그대로 유지됩니다. 잠시 후 다시 확인해 주세요.",
            );
            return;
          }
          d.job = null;
          buttons(d);
          return save();
        }
        job.busy = true;
        try {
          if (job.receipt && acceptResult(d, job, job.receipt)) return;
          if (job.retryAllowed) {
            const t = editorEpoch,
              yes = await ask(
                d,
                t,
                "이전 저장 요청을 같은 내용으로 다시 확인·처리할까요? 그 뒤 수정한 입력은 별도로 유지됩니다.",
              );
            if (!yes || !owns(d) || editorEpoch !== t) return;
            job.retryAllowed = false;
            const out = await sendJob(d, job, "save");
            if (!acceptResult(d, job, out)) throw Error("UNKNOWN");
            return;
          }
          const out = await sendJob(d, job, "status");
          if (acceptResult(d, job, out)) return;
          if (out?.outcome === "not_found" && !job.pending) {
            job.retryAllowed = true;
            result(
              d,
              "접수된 저장 결과를 찾지 못했어요. 이전 저장 재시도를 누르면 같은 요청으로 다시 처리합니다.",
            );
          } else
            result(
              d,
              "저장 결과를 아직 확인하지 못했어요. 같은 결과 확인으로 다시 이어가 주세요.",
            );
        } catch (_) {
          result(d, "결과 조회에 실패했어요. 입력·파일은 유지됩니다.");
        } finally {
          job.busy = false;
          buttons(d);
        }
        return;
      }
      if (
        !d.values.work_date ||
        !kinds[d.values.kind] ||
        !states[d.values.state] ||
        !d.values.title.trim() ||
        !d.values.body.trim() ||
        d.values.title.length > 200 ||
        d.values.body.length > 10000 ||
        d.values.vendor.length > 200 ||
        (d.values.cost && !/^\\d{1,13}$/.test(d.values.cost)) ||
        Number(d.values.cost) > 9000000000000
      ) {
        result(d, "작업일·종류·제목·내용과 비용을 확인해 주세요.");
        return;
      }
      if (
        d.values.outage_end &&
        (!d.values.outage_start || d.values.outage_end < d.values.outage_start)
      ) {
        result(d, "발전 중단 종료는 시작 이후로 입력해 주세요.");
        return;
      }
      const t = editorEpoch,
        rev = d.editRevision,
        values = { ...d.values };
      d.confirming = true;
      buttons(d);
      let yes;
      try {
        yes = await ask(d, t, "이 발전소의 작업 이력을 저장할까요?");
      } finally {
        d.confirming = false;
        buttons(d);
      }
      if (!yes || !owns(d) || t !== editorEpoch || rev !== d.editRevision)
        return;
      const job = {
        key: root.crypto.randomUUID(),
        values,
        files: d.files.slice(),
        payload: payload(d),
        busy: true,
        receipt: null,
        started: false,
        uploadPending: true,
      };
      d.job = job;
      result(d, "첨부와 저장을 준비하고 있어요…");
      buttons(d);
      try {
        const prepare = (async () => {
          for (const f of job.files) {
            let path = d.uploads.get(f);
            if (!path) {
              path = [
                d.coop,
                d.plant,
                d.id,
                d.actor,
                root.crypto.randomUUID() + "." + mime[f.type],
              ].join("/");
              const out = await client.storage
                .from("plant-work-private")
                .upload(path, f, { upsert: false, contentType: f.type });
              if (out.error) throw out.error;
              d.uploads.set(f, path);
            }
            job.payload.files.push({
              path,
              name: f.name,
              type: f.type,
              size: f.size,
            });
          }
        })().finally(() => {
          job.uploadPending = false;
        });
        let timer;
        try {
          await Promise.race([
            prepare,
            new Promise(
              (_, reject) =>
                (timer = setTimeout(
                  () => reject(Error("UPLOAD_PENDING")),
                  30000,
                )),
            ),
          ]);
        } finally {
          clearTimeout(timer);
        }
        if (!owns(d) || t !== editorEpoch || rev !== d.editRevision) {
          d.job = null;
          result(
            d,
            "준비한 첨부는 유지됩니다. 현재 내용을 다시 확인한 뒤 저장해 주세요.",
          );
          return;
        }
        job.started = true;
        const out = await sendJob(d, job, "save");
        if (!acceptResult(d, job, out)) throw Error("UNKNOWN");
        if (current() && selected === d.plant) void load();
      } catch (e) {
        if (!job.started && job.uploadPending)
          result(
            d,
            "첨부 전송이 지연되고 있어요. 파일을 유지한 채 첨부 준비 다시 확인으로 이어가 주세요.",
          );
        else if (!job.started) {
          d.job = null;
          result(
            d,
            "첨부를 준비하지 못했어요. 입력·파일을 유지한 채 다시 저장해 주세요.",
          );
        } else if (["42501", "22023", "23514", "23505"].includes(e.code)) {
          d.job = null;
          result(
            d,
            e.code === "42501"
              ? "저장 권한을 확인하지 못했어요. 입력은 유지됩니다."
              : "입력이나 현재 이력 상태를 확인해 주세요. 저장하지 않았습니다.",
          );
        } else
          result(
            d,
            "저장 결과를 확인하지 못했어요. 다시 저장하지 말고 저장 결과 확인으로 이어가 주세요.",
          );
      } finally {
        job.busy = false;
        buttons(d);
      }
    }
    function pause() {
      capture();
      seq++;
      detailSeq++;
      editorEpoch++;
      reading = false;
      active = false;
      if (visible()) root.bootstrap.Modal.getInstance(modal)?.hide();
    }
    function sync() {
      const c = context(),
        key = owner();
      if (scope !== key) {
        pause();
        scope = key;
        selected = "";
        currentList = null;
        list.replaceChildren();
        status.textContent = "";
      }
      const old = selected;
      plantSelect.replaceChildren(new Option("발전소 선택", ""));
      for (const p of c.plants || [])
        plantSelect.append(new Option(p.name, p.id));
      selected = (c.plants || []).some((p) => p.id === old)
        ? old
        : (c.plants || [])[0]?.id || "";
      plantSelect.value = selected;
      add.disabled = !allowed() || !selected;
      retry.disabled = !allowed() || !selected;
      basicContainer.replaceChildren();
      for (const p of c.plants || []) {
        const card = el("article");
        card.className =
          "border rounded-3 p-3 mb-2 d-flex gap-3 flex-wrap align-items-center";
        const body = el("div");
        body.className = "flex-grow-1";
        body.append(
          el("h3", p.name),
          el(
            "p",
            (p.location || "주소 미등록") +
              " · " +
              (p.capacity_kw ?? p.capacity ?? "—") +
              " kW · " +
              (p.status || "상태 미설정"),
          ),
        );
        const edit = el("button", "기본정보 수정");
        edit.type = "button";
        edit.className = "btn btn-outline-primary";
        edit.onclick = () => onEditPlant(p.id);
        const history = el("button", "점검·작업 이력");
        history.type = "button";
        history.className = "btn btn-outline-secondary";
        history.onclick = () => {
          plantSelect.value = p.id;
          selected = p.id;
          root.dispatchEvent(new CustomEvent("plant-work-show"));
          activate(true);
        };
        card.append(body, edit, history);
        basicContainer.append(card);
      }
      if (!(c.plants || []).length)
        basicContainer.append(el("p", "등록된 발전소가 없습니다."));
      if (active && allowed() && (!old || old !== selected)) void load();
    }
    function activate(value) {
      if (!value) {
        pause();
        return;
      }
      if (active) return;
      active = true;
      retry.disabled = !allowed() || !selected;
      if (allowed() && selected) void load();
    }
    build();
    return Object.freeze({
      sync,
      activate,
      pause,
      hasDraft: () => {
        capture();
        return [...drafts.values()].some(dirty);
      },
    });
  }
  root.PlantWorkHistory = Object.freeze({
    version: "1.0.0",
    create,
    kinds,
    states,
  });
})(window);
