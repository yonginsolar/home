/* Dividend UI ownership/drafts. Existing writers, RLS and payment receipts stay authoritative. */
(() => {
    'use strict';
    const draftIds = ['dividendBatchMeetingDate','dividendBatchPaymentDueDate','dividendBatchAgenda','dividendBatchMinutesDocId','dividendBatchResolutionResult'];
    const createIds = ['dividendBatchFiscalYear','dividendBatchTitle','dividendBatchPeriodStart','dividendBatchPeriodEnd','dividendBatchCapitalStart','dividendBatchCapitalEnd','dividendBatchUsageStart','dividendBatchUsageEnd','dividendBatchCapitalRate','dividendBatchIncomeTaxRate','dividendBatchLocalTaxRate','dividendBatchIsFirst'];
    const drafts = new Map(), attempts = new Map(), reads = new Map(), createBaselines = new Map(), failedSelections = new Map();
    let epoch = 0, displayed = null, confirmation = null, createBusy = false, paymentBusy = false, createRevision = 0;
    let paymentReady = '', exportCache = null;
    const el = id => document.getElementById(id);
    const owner = () => adminCertificateAuthId && g_adminMemberRuntime?.coop_id && g_adminMemberRuntime.is_active !== false
        && canAccessAdminMemberTab('funds-manage') && !isAdminMemberSiteProfile()
        ? JSON.stringify([adminCertificateAuthId,g_adminMemberRuntime.coop_id]) : '';
    const pane = mode => el('sub-tab-dividend-' + (mode === 'manage' ? 'batches' : 'exports'));
    const active = mode => !!owner() && !window.frameElement?.hidden && el('tab-funds-manage')?.classList.contains('active') && pane(mode)?.classList.contains('active');
    const selected = mode => String((mode === 'manage' ? g_dividend_batch_state : g_dividend_export_state).selectedBatchId || '');
    const context = (mode, batch = selected(mode)) => ({owner:owner(),epoch,mode,batch});
    const current = c => !!c?.owner && c.owner === owner() && c.epoch === epoch && active(c.mode) && (!c.batch || c.batch === selected(c.mode));
    const values = ids => Object.fromEntries(ids.map(id => [id, el(id)?.type === 'checkbox' ? el(id).checked : el(id)?.value || '']));
    const key = (o,b) => JSON.stringify([o,b]);
    function remember() {
        if (!displayed || displayed.owner !== owner()) return;
        const d = drafts.get(key(displayed.owner,displayed.batch));
        if (d) {
            d.value = values(draftIds);
            status('dividendDraftStatus',JSON.stringify(d.value) !== JSON.stringify(d.baseline) ? '저장하지 않은 입력을 이어서 작성 중입니다.' : '');
        }
    }
    function invalidate() {
        remember(); rememberFailed(); ++epoch;
        if (confirmation) window.CoopDialog?.cancelAll?.(window);
        confirmation = null; paymentReady = ''; exportCache = null;
        reads.forEach(r => r.cancel()); reads.clear();
        for (const id of ['dividendPaymentConfirmButton','dividendPaymentCancelButton']) if (el(id)) el(id).disabled = true;
    }
    function rememberFailed() {
        const run = String(g_dividend_export_state.selectedPaymentRunId || '');
        if (!run || paymentReady !== selected('export')) return;
        failedSelections.set(key(owner(),run),Array.from(document.querySelectorAll('.dividend-payment-failed-check:checked')).map(n => n.value));
    }
    // A same-turn leave/return still invalidates pending work, without removing input nodes.
    const originalSwitch = switchTab;
    switchTab = function(name, ...args) {
        if (canAccessAdminMemberTab(name) && (name !== 'funds-manage' || !el('tab-funds-manage')?.classList.contains('active'))) invalidate();
        return originalSwitch.call(this,name,...args);
    };
    document.addEventListener('show.bs.tab', event => {
        if (event.target?.closest('#tab-funds-manage')) invalidate();
    });
    window.addEventListener('pagehide', invalidate);
    window.addEventListener('beforeunload',event => {
        remember(); const o = owner(), baseline = createBaselines.get(o);
        const dirty = [...drafts.values()].some(d => d.owner === o && JSON.stringify(d.value) !== JSON.stringify(d.baseline));
        if (dirty || createBusy || attempts.get(o)?.pending || (baseline && JSON.stringify(baseline) !== JSON.stringify(values(createIds)))) {
            event.preventDefault(); event.returnValue = '';
        }
    });
    _supabase.auth?.onAuthStateChange?.((event) => { if (event === 'SIGNED_OUT' || event === 'SIGNED_IN') invalidate(); });
    if (window.frameElement) new MutationObserver(records => {
        if (window.frameElement.hidden || records.some(r => r.oldValue === null)) invalidate();
    }).observe(window.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
    document.addEventListener('input', event => { if (draftIds.includes(event.target.id)) remember(); });
    document.addEventListener('change', event => { if (draftIds.includes(event.target.id)) remember(); });
    function status(id, message) { if (el(id)) el(id).textContent = message; }
    function retry(id, message, action) {
        const node = el(id); if (!node) return;
        node.textContent = message + ' ';
        const button = document.createElement('button'); button.type = 'button';
        button.className = 'btn btn-sm btn-outline-primary'; button.textContent = '다시 확인';
        button.onclick = action; node.append(button);
    }
    function read(lane, c, fingerprint, task, apply, fail) {
        if (!current(c)) return Promise.resolve(null);
        const prior = reads.get(lane), identity = JSON.stringify([c,fingerprint]);
        if (prior?.identity === identity) return prior.promise;
        prior?.cancel();
        const run = {identity,c}; reads.set(lane,run);
        const valid = () => reads.get(lane) === run && current(c);
        let timer, cancel;
        const end = new Promise(resolve => { cancel = () => resolve(null); timer = setTimeout(() => {
            if (valid()) fail(new Error('조회 응답이 늦어지고 있습니다. 기존 목록과 입력은 유지됩니다.'));
            if (reads.get(lane) === run) reads.delete(lane);
            resolve(null);
        },15000); });
        run.cancel = () => { clearTimeout(timer); cancel(); };
        const work = Promise.resolve().then(() => valid() ? task() : null).then(data => {
            if (!valid()) return null;
            apply(data); return data;
        }).catch(error => { if (valid()) fail(error); return null; });
        run.promise = Promise.race([work,end]).finally(() => {
            clearTimeout(timer); if (reads.get(lane) === run) reads.delete(lane);
        });
        return run.promise;
    }
    const unwrap = result => { if (result.error) throw result.error; return result.data || []; };
    const originalPanel = renderDividendBatchSelectedPanel;
    renderDividendBatchSelectedPanel = function(batch) {
        remember();
        const o = owner(), b = String(batch?.id || ''), id = key(o,b);
        const focus = document.activeElement, range = focus && typeof focus.selectionStart === 'number' ? [focus.selectionStart,focus.selectionEnd,focus.selectionDirection] : null;
        const previous = drafts.get(id);
        originalPanel(batch);
        if (o && b) {
            const stored = values(draftIds);
            const draft = previous || {owner:o,batch:b,baseline:stored,value:stored};
            // Refresh untouched fields only. Edited fields retain their original checkpoint.
            if (previous) for (const field of draftIds) if (draft.value[field] === draft.baseline[field]) draft.value[field] = draft.baseline[field] = stored[field];
            drafts.set(id,draft); displayed = {owner:o,batch:b};
            for (const field of draftIds) if (el(field).value !== draft.value[field]) el(field).value = draft.value[field];
            renderDividendAccountDeadlinePreview();
        } else displayed = null;
        if (range && document.activeElement === focus && draftIds.includes(focus.id)) focus.setSelectionRange(...range);
        for (const field of draftIds) window.ErpWorkspaceResume?.checkpoint(el(field));
        status('dividendDraftStatus','');
        if (previous && JSON.stringify(previous.value) !== JSON.stringify(previous.baseline)) status('dividendDraftStatus','저장하지 않은 입력을 이어서 작성 중입니다.');
    };
    window.discardDividendBatchDraft = async function() {
        remember(); const c = context('manage'), snapshot = JSON.stringify(values(draftIds)), batch = getDividendManageSelectedBatch();
        if (!current(c) || !await confirmOnce('이 회차의 작성 중인 입력을 버릴까요?',c,() => batch === getDividendManageSelectedBatch() && snapshot === JSON.stringify(values(draftIds)))) return;
        drafts.delete(key(c.owner,c.batch)); displayed = null; renderDividendBatchSelectedPanel(getDividendManageSelectedBatch());
    };
    const originalSelect = selectDividendManageBatch;
    selectDividendManageBatch = function(id) {
        if (!active('manage')) return;
        remember(); if (String(id) !== selected('manage')) invalidate();
        originalSelect(id);
    };
    fetchDividendBatchItemsPreview = function(id) {
        const c = context('manage',String(id || ''));
        if (!c.batch) { if (active('manage')) renderDividendBatchItemPreview([],''); return Promise.resolve(); }
        if (!current(c)) return Promise.resolve();
        const body = el('dividendBatchItemPreviewBody');
        if (body && body.dataset.dividendBatch !== c.batch) {
            body.dataset.dividendBatch = c.batch;
            body.innerHTML = '<tr><td colspan="7" class="py-4 text-muted">선택한 회차의 산출 내역을 확인하고 있습니다.</td></tr>';
        }
        status('dividendBatchItemPreviewMeta','조합원별 산출 내역을 확인하고 있습니다.');
        return read('items',c,'',async () => unwrap(await scopeAdminTenant(_supabase.from('coop_dividend_batch_items').select('member_no_snapshot,member_name_snapshot,capital_dividend_gross,usage_dividend_gross,gross_amount,income_tax_amount,local_income_tax_amount,net_amount,payment_status')).eq('batch_id',c.batch).order('member_no_snapshot',{ascending:true}).limit(500)),
            data => renderDividendBatchItemPreview(data,c.batch),
            () => retry('dividendBatchItemPreviewMeta','산출 내역을 확인하지 못했습니다. 이전 목록은 유지됩니다.',() => fetchDividendBatchItemsPreview(c.batch)));
    };
    fetchDividendGeneralAssemblyMinutes = function() {
        const c = context('manage','');
        return read('minutes',c,'',async () => unwrap(await scopeAdminTenant(_supabase.from('minutes').select('id,title,doc_no,doc_type,status,published_at')).eq('doc_type','GENERAL_ASSEMBLY').eq('status','CLOSED').not('published_at','is',null).order('published_at',{ascending:false}).limit(100)),
            data => { g_dividend_batch_state.minutes = data; renderDividendGeneralAssemblyMinutesOptions(); },
            () => retry('dividendBatchMinutesHelp','의사록 목록을 확인하지 못했습니다. 선택과 입력은 유지됩니다.',() => fetchDividendGeneralAssemblyMinutes()));
    };
    fetchDividendManageBatches = function() {
        const c = context('manage','');
        return read('batches',c,'',async () => {
            const rows = unwrap(await scopeAdminTenant(_supabase.from('coop_dividend_batches').select('id,fiscal_year,title,period_start,period_end,is_first_dividend,capital_basis_start,capital_basis_end,usage_basis_start,usage_basis_end,capital_dividend_pool,usage_dividend_pool,total_gross_amount,income_tax_rate,local_income_tax_rate,status,minutes_doc_id,general_meeting_date,general_meeting_agenda,general_meeting_resolution_result,payment_due_date,account_change_deadline,payment_accounts_locked_at,capital_calculation_method,capital_share_unit_snapshot,created_at,updated_at')).order('fiscal_year',{ascending:false}).order('created_at',{ascending:false}).limit(100));
            if (!rows.length) return rows;
            const items = unwrap(await scopeAdminTenant(_supabase.from('coop_dividend_batch_items').select('batch_id,gross_amount,net_amount')).in('batch_id',rows.map(r => r.id)));
            return rows.map(row => { const own = items.filter(i => String(i.batch_id) === String(row.id)); return {...row,item_count:own.length,item_gross_total:own.reduce((s,i) => s + normalizeDividendExportNumber(i.gross_amount),0),item_net_total:own.reduce((s,i) => s + normalizeDividendExportNumber(i.net_amount),0)}; });
        }, data => {
            remember(); g_dividend_batch_state.batches = data;
            if (!data.some(r => String(r.id) === selected('manage'))) g_dividend_batch_state.selectedBatchId = data[0]?.id || '';
            renderDividendManageBatches(); renderDividendBatchSelectedPanel(getDividendManageSelectedBatch());
            status('dividendManageReadStatus',data.length ? '목록을 확인했습니다.' : '등록된 배당 회차가 없습니다.');
        }, () => retry('dividendManageReadStatus','회차 목록을 확인하지 못했습니다. 이전 목록과 입력은 유지됩니다.',() => fetchDividendManageBatches()));
    };
    initializeDividendBatchTab = async function() {
        await Promise.resolve(); if (!active('manage')) return;
        if (!g_dividend_batch_state.initialized) { g_dividend_batch_state.initialized = true; resetDividendBatchCreateForm(); }
        if (!createBaselines.has(owner())) createBaselines.set(owner(),values(createIds));
        const c = context('manage','');
        if (!g_dividend_calculation_settings) await loadDividendCalculationSettings();
        if (!current(c)) return;
        await Promise.all([fetchDividendGeneralAssemblyMinutes(),fetchDividendManageBatches()]);
    };
    function resetPayment() {
        paymentReady = ''; g_dividend_export_state.paymentRuns = []; g_dividend_export_state.selectedPaymentRunId = '';
        g_dividend_export_state.paymentRunItems = []; g_dividend_export_state.notificationSummary = [];
        renderDividendPaymentRunState(); renderDividendNotificationSummary();
    }
    selectDividendExportBatch = function(id) {
        if (!active('export')) return Promise.resolve();
        rememberFailed();
        if (String(id) !== selected('export')) invalidate();
        g_dividend_export_state.selectedBatchId = String(id || '');
        exportCache = null; resetPayment();
        renderDividendExportBatches(); renderDividendExportSelectedBatch(getDividendExportSelectedBatch());
        status('dividendExportLastLoaded','선택한 회차의 최신 지급 내역을 확인하고 있습니다.');
        return fetchDividendPaymentState();
    };
    fetchDividendPaymentState = function() {
        rememberFailed(); const c = context('export'); paymentReady = '';
        for (const id of ['dividendPaymentConfirmButton','dividendPaymentCancelButton']) if (el(id)) el(id).disabled = true;
        if (!c.batch) { resetPayment(); return Promise.resolve(); }
        return read('payment',c,'',async () => {
            const [runs,summary] = await Promise.all([_supabase.rpc('list_dividend_payment_runs',{p_batch_id:c.batch}),_supabase.rpc('get_dividend_notification_summary',{p_batch_id:c.batch})]);
            const rows = unwrap(runs), notifications = unwrap(summary);
            if (!current(c)) return {rows:[],notifications:[],run:null,items:[]};
            const run = rows.find(r => String(r.payment_run_id) === String(g_dividend_export_state.selectedPaymentRunId)) || rows.find(r => r.status === 'EXPORTED') || rows[0];
            const items = run ? unwrap(await _supabase.rpc('list_dividend_payment_run_items',{p_payment_run_id:run.payment_run_id})) : [];
            return {rows,notifications,run,items};
        }, data => {
            g_dividend_export_state.paymentRuns = data.rows; g_dividend_export_state.selectedPaymentRunId = data.run?.payment_run_id || '';
            g_dividend_export_state.paymentRunItems = data.items; g_dividend_export_state.notificationSummary = data.notifications;
            paymentReady = c.batch; renderDividendPaymentRunState(); renderDividendNotificationSummary();
            const failed = failedSelections.get(key(c.owner,String(data.run?.payment_run_id || ''))) || [];
            document.querySelectorAll('.dividend-payment-failed-check').forEach(n => { if (!n.disabled) n.checked = failed.includes(n.value); });
        }, () => retry('dividendPaymentRunMeta','지급 내역을 확인하지 못했습니다. 다시 확인하기 전에는 처리할 수 없습니다.',() => fetchDividendPaymentState()));
    };
    fetchDividendExportBatches = function() {
        const c = context('export',''); paymentReady = '';
        for (const id of ['dividendPaymentConfirmButton','dividendPaymentCancelButton']) if (el(id)) el(id).disabled = true;
        return read('export-batches',c,'',async () => {
            const rows = unwrap(await _supabase.rpc('list_dividend_export_batches',{p_limit:50}));
            const policies = rows.length ? unwrap(await scopeAdminTenant(_supabase.from('coop_dividend_batches').select('id,account_change_deadline,payment_accounts_locked_at')).in('id',rows.map(r => r.batch_id))) : [];
            return rows.map(r => ({...r,...policies.find(p => String(p.id) === String(r.batch_id))}));
        }, data => {
            g_dividend_export_state.batches = data;
            const id = data.some(r => String(r.batch_id) === selected('export')) ? selected('export') : data[0]?.batch_id || '';
            void selectDividendExportBatch(id);
        }, () => retry('dividendExportLastLoaded','확정 회차를 확인하지 못했습니다. 이전 목록은 유지됩니다.',() => fetchDividendExportBatches()));
    };
    initializeDividendExportTab = async function() {
        await Promise.resolve(); if (!active('export')) return;
        await fetchDividendExportBatches();
        if (active('export') && !g_dividend_export_state.initialized) { g_dividend_export_state.initialized = true; void fetchWithdrawalDeemedDividendReviews(false); }
    };
    loadDividendExportRows = function(force = false) {
        const c = context('export'); if (!c.batch || !current(c)) return Promise.resolve(null);
        const debit = el('dividendExportDebitMemo')?.value || '배당금', credit = el('dividendExportCreditMemo')?.value || '배당금';
        const fingerprint = JSON.stringify([c.owner,c.batch,debit,credit]);
        if (!force && exportCache?.fingerprint === fingerprint) return Promise.resolve(exportCache.data);
        const batch = {...getDividendExportSelectedBatch()};
        return read('export-rows',c,fingerprint,async () => {
            const [bank,tax,summary] = await Promise.all([
                _supabase.rpc('get_dividend_bank_transfer_rows',{p_batch_id:c.batch,p_debit_memo:debit,p_credit_memo:credit}),
                _supabase.rpc('get_dividend_tax_ledger_rows',{p_batch_id:c.batch}),_supabase.rpc('get_dividend_withholding_summary',{p_batch_id:c.batch})]);
            return {bankRows:unwrap(bank),taxRows:unwrap(tax),withholdingSummaryRows:unwrap(summary),batch};
        }, data => {
            exportCache = {fingerprint,data}; status('dividendExportLastLoaded','현재 회차의 파일 데이터를 준비했습니다.');
        }, () => retry('dividendExportLastLoaded','파일 자료를 확인하지 못했습니다. 다시 확인해 주세요.',() => loadDividendExportRows(true)));
    };
    const originalFileName = makeDividendExportFileName;
    makeDividendExportFileName = function(suffix,extension,batch) {
        if (!batch) return originalFileName(suffix,extension);
        return `배당_${sanitizeDividendExportFilePart(batch.fiscal_year || '연도')}_${sanitizeDividendExportFilePart(batch.title || '확정배당')}_${sanitizeDividendExportFilePart(suffix,'파일')}_${getAdminMemberKstDateString().replace(/-/g,'')}.${extension}`;
    };
    async function confirmOnce(message,c,unchanged = () => true) {
        if (!current(c) || confirmation || typeof window.CoopDialog?.confirm !== 'function') return false;
        const token = {}; confirmation = token;
        try { const accepted = await window.CoopDialog.confirm(message); return accepted && confirmation === token && current(c) && unchanged(); }
        finally { if (confirmation === token) confirmation = null; }
    }
    // The original UUID primary key is the durable idempotency key: never upsert or replace.
    // Retry checks that same ID first; an unknown result cannot turn into a fresh request.
    createDividendBatch = async function() {
        const c = context('manage',''); if (!current(c) || createBusy) return;
        const o = c.owner; let attempt = attempts.get(o);
        if (attempt) return checkCreate(attempt,c);
        createBusy = true;
        try {
            const form = values(createIds), revision = createRevision, number = id => Number(form[id]);
            const year = number('dividendBatchFiscalYear'), rate = number('dividendBatchCapitalRate');
            if (!Number.isInteger(year) || year < 2000 || year > 2100 || !form.dividendBatchTitle.trim()) return myAlert('회계연도와 회차명을 확인해 주세요.','warning');
            for (const prefix of ['Period','Capital','Usage']) if (!form['dividendBatch'+prefix+'Start'] || form['dividendBatch'+prefix+'End'] < form['dividendBatch'+prefix+'Start']) return myAlert('시작일과 종료일을 확인해 주세요.','warning');
            if (!form.dividendBatchCapitalRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 10 || ['dividendBatchIncomeTaxRate','dividendBatchLocalTaxRate'].some(id => !form[id].trim() || !Number.isFinite(number(id)) || number(id) < 0)) return myAlert('배당 요율과 세율을 확인해 주세요.','warning');
            const basis = await fetchDividendCapitalBasisSummary(form.dividendBatchCapitalStart,form.dividendBatchCapitalEnd);
            if (!current(c) || revision !== createRevision || JSON.stringify(form) !== JSON.stringify(values(createIds))) return;
            const pool = calculateDividendCapitalPoolFromRate(basis.annualRateBasisTotal,rate);
            if (!await confirmOnce(`${form.dividendBatchTitle} 회차를 생성할까요?\n산출 방법: ${dividendMethodLabel(basis.method)}\n예상 출자금 배당 총액: ${formatDividendExportMoney(pool)}`,c,() => revision === createRevision && JSON.stringify(form) === JSON.stringify(values(createIds)))) return;
            const id = globalThis.crypto?.randomUUID?.(); if (!id) return myAlert('등록 준비를 완료하지 못했습니다. 안전한 연결에서 다시 시도해 주세요.','warning');
            const payload = {id,coop_id:g_adminMemberRuntime.coop_id,fiscal_year:year,title:form.dividendBatchTitle.trim(),period_start:form.dividendBatchPeriodStart,period_end:form.dividendBatchPeriodEnd,is_first_dividend:form.dividendBatchIsFirst,capital_basis_start:form.dividendBatchCapitalStart,capital_basis_end:form.dividendBatchCapitalEnd,usage_basis_start:form.dividendBatchUsageStart,usage_basis_end:form.dividendBatchUsageEnd,capital_dividend_pool:Math.trunc(pool),capital_annual_rate_percent:rate,capital_settings_revision:basis.settingsRevision,usage_dividend_pool:0,income_tax_rate:number('dividendBatchIncomeTaxRate'),local_income_tax_rate:number('dividendBatchLocalTaxRate'),status:'DRAFT'};
            attempt = {owner:o,payload,form,pending:false}; attempts.set(o,attempt);
            await sendCreate(attempt,c);
        } catch (_) { if (current(c)) myAlert('회차 생성을 준비하지 못했습니다. 입력을 유지한 채 다시 시도해 주세요.','warning'); }
        finally { createBusy = false; updateCreateUi(); }
    };
    function updateCreateUi() {
        const a = attempts.get(owner()), button = el('dividendBatchCreateButton');
        if (button) { button.disabled = createBusy || (!!a?.pending && !a?.uncertain); button.textContent = a ? '등록 결과 확인' : '배당 회차 생성'; }
        status('dividendCreateStatus',a ? (a.done ? '회차를 등록했습니다. 새 회차를 만들려면 입력 내용을 변경해 주세요.' : a.uncertain ? '등록 결과를 확인하지 못했습니다. 같은 요청의 결과만 다시 확인해 주세요.' : a.pending ? '회차를 등록하고 있습니다. 입력은 계속 보존됩니다.' : '이전 등록 결과를 먼저 확인해 주세요. 결과를 확인하기 전 새 회차는 생성하지 않습니다.') : '');
    }
    function created(a,c) {
        a.done = true; a.pending = false;
        if (!current(c)) return;
        g_dividend_batch_state.selectedBatchId = a.payload.id;
        createBaselines.set(a.owner,a.form);
        for (const field of createIds) if (values([field])[field] === a.form[field]) window.ErpWorkspaceResume?.checkpoint(el(field));
        status('dividendCreateStatus','회차를 등록했습니다. 목록을 다시 확인할 수 있습니다.');
        // Keep the completed intent until its original form changes: another click only reconciles it.
        if (JSON.stringify(a.form) !== JSON.stringify(values(createIds))) attempts.delete(a.owner);
        void fetchDividendManageBatches();
    }
    async function sendCreate(a,c) {
        if (!current(c) || a.owner !== owner() || a.pending || a.done) { if (a.done) created(a,c); return; }
        a.pending = true; updateCreateUi();
        let timer; const deadline = new Promise(resolve => { timer = setTimeout(() => resolve({unknown:true}),15000); });
        const work = Promise.resolve().then(() => _supabase.from('coop_dividend_batches').insert(a.payload).select('id').single())
            .catch(() => ({unknown:true}));
        const result = await Promise.race([work,deadline]); clearTimeout(timer);
        // A live request stays locked after UI timeout. It is never resent while in flight.
        if (result.unknown) {
            a.uncertain = true;
            work.then(late => { a.pending = false; if (late.data?.id === a.payload.id) created(a,c); if (current(c)) updateCreateUi(); });
            if (current(c)) updateCreateUi(); return;
        }
        a.pending = false;
        if (result.data?.id === a.payload.id) created(a,c);
        else if (result.error?.code === '23505') await checkCreate(a,c);
        else if (result.error && !/^(?:08|53|57|XX|PGRST)/.test(result.error.code || '') && result.status >= 400 && result.status < 500) {
            attempts.delete(a.owner); if (current(c)) myAlert('회차를 등록하지 못했습니다. 권한과 입력값을 확인한 뒤 다시 시도해 주세요.','warning');
        }
        updateCreateUi();
    }
    async function checkCreate(a,c) {
        if (!current(c) || createBusy || (a.pending && !a.uncertain)) return;
        createBusy = true; updateCreateUi();
        try {
            const result = await read('create-result',c,a.payload.id,
                () => scopeAdminTenant(_supabase.from('coop_dividend_batches').select('id,coop_id,created_by')).eq('id',a.payload.id).maybeSingle(),
                () => {}, () => status('dividendCreateStatus','등록 결과 조회가 지연됩니다. 입력을 유지한 채 다시 확인해 주세요.'));
            if (!result) return;
            if (result.error) throw result.error;
            if (result.data) { if (result.data.coop_id !== a.payload.coop_id || result.data.created_by !== JSON.parse(a.owner)[0]) throw new Error('scope'); created(a,c); }
            else if (current(c) && a.pending) status('dividendCreateStatus','이전 등록을 처리 중입니다. 새로 등록하지 않고 결과만 다시 확인해 주세요.');
            else if (current(c) && await confirmOnce('이전 등록이 조회되지 않았습니다. 같은 요청으로 등록을 다시 확인할까요?',c)) await sendCreate(a,c);
        } catch (_) { if (current(c)) status('dividendCreateStatus','등록 결과를 확인하지 못했습니다. 입력을 유지한 채 다시 확인해 주세요.'); }
        finally { createBusy = false; if (current(c)) updateCreateUi(); }
    }
    document.addEventListener('input',event => {
        if (!createIds.includes(event.target.id)) return;
        ++createRevision;
        const a = attempts.get(owner()); if (a?.done && JSON.stringify(a.form) !== JSON.stringify(values(createIds))) attempts.delete(a.owner);
        updateCreateUi();
    });
    // Exposed only for existing menu lifecycle and synthetic tests; no authority is granted.
    window.DividendWorkflow = Object.freeze({invalidate,current,context,remember,confirmOnce,
        paymentCurrent:() => active('export') && paymentReady === selected('export') && !paymentBusy,
        paymentLock:value => { paymentBusy = value; },
        saved:(id,snapshot) => { const d = drafts.get(key(owner(),id)); if (d) for (const field of Object.keys(snapshot)) d.baseline[field] = snapshot[field]; },
        hasDraft:() => { remember(); return [...drafts.values()].some(d => d.owner === owner() && JSON.stringify(d.value) !== JSON.stringify(d.baseline)); }});
    const fileJobs = new Map();
    for (const name of ['downloadDividendBankTransferXlsx','downloadDividendTaxLedgerXlsx','downloadDividendHometaxPaymentStatementCsv','downloadDividendWithholdingSummaryCsv']) {
        const original = window[name];
        if (typeof original !== 'function') continue;
        window[name] = function(...args) {
            const c = context('export'), jobKey = JSON.stringify([name,c.owner,c.batch]);
            if (!current(c)) return Promise.resolve();
            if (fileJobs.has(jobKey)) return fileJobs.get(jobKey);
            const promise = Promise.resolve().then(() => current(c) ? original.apply(this,args) : null).finally(() => {
                if (fileJobs.get(jobKey) === promise) fileJobs.delete(jobKey);
            });
            fileJobs.set(jobKey,promise); return promise;
        };
    }
})();
