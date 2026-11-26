(function (root) {
  'use strict';

  const spec = [
    ['title','교육명','text',200], ['starts_at','시작 일시','datetime-local'],
    ['ends_at','종료 일시','datetime-local'], ['location','장소','text',300],
    ['instructor','강사','text',200], ['education_content','교육 내용','textarea',5000]
  ];
  const fmt = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'});
  const local = value => fmt.format(new Date(value)).replace(' ','T');
  const element = (tag, css, label) => {
    const el = document.createElement(tag);
    if (css) el.className = css;
    if (label) el.textContent = label;
    return el;
  };
  const button = (label, css) => {
    const el = element('button', css, label);
    el.type = 'button';
    return el;
  };
  let active = null;
  function close() { active?.dialog.close(); }

  function open({rpc, current, trigger}) {
    if (active || !current()) return;
    const dialog = element('dialog','portal-edu-pilot-dialog border-0 rounded-4 p-0 shadow');
    const panel = element('div','p-3 p-md-4');
    const header = element('div','d-flex justify-content-between align-items-center gap-2 mb-3');
    const title = element('h2','h5 mb-0','교육 관리');
    title.id = 'eduPilotTitle';
    dialog.setAttribute('aria-labelledby', title.id);
    const dismiss = button('닫기','btn btn-outline-secondary btn-sm');
    header.append(title,dismiss);
    const note = element('p','small text-muted','이 화면에서 등록한 교육을 관리합니다. 일시는 한국시간 기준입니다.');
    const status = element('p','small mb-2');
    status.setAttribute('role','status');
    const actions = element('div','d-flex flex-wrap gap-2 mb-3');
    const newButton = button('교육 등록','btn btn-success btn-sm');
    const reload = button('새로고침','btn btn-outline-secondary btn-sm');
    actions.append(newButton,reload);
    const list = element('div','d-grid gap-2 mb-2');
    const form = element('form','d-grid gap-2');
    form.hidden = true;
    const fields = new Map(spec.map(([key,label,kind,max]) => {
      const wrap = element('div');
      const input = element(kind === 'textarea' ? 'textarea' : 'input','form-control');
      if (kind !== 'textarea') input.type = kind;
      else input.rows = 3;
      input.id = 'eduPilot-'+key;
      if (max) input.maxLength = max;
      input.required = true;
      const caption = element('label','form-label mb-1',label);
      caption.htmlFor = input.id;
      wrap.append(caption,input);
      form.append(wrap);
      return [key,input];
    }));
    const save = element('button','btn btn-success','저장');
    save.type = 'submit';
    const cancel = button('취소','btn btn-outline-secondary');
    const formActions = element('div','d-flex gap-2 mt-1');
    formActions.append(save,cancel); form.append(formActions);
    panel.append(header,note,status,actions,list,form); dialog.append(panel); document.body.append(dialog);
    const state = {dialog, busy:false, generation:0, draft:null};
    active = state;
    const alive = () => active === state && current() && dialog.open;
    const editing = () => !!state.draft;
    function setBusy(value) {
      state.busy = value;
      save.disabled = cancel.disabled = newButton.disabled = reload.disabled = value;
      for (const control of fields.values()) control.disabled = value;
      for (const el of list.querySelectorAll('button')) el.disabled = value;
    }
    function setDraft(row) {
      state.draft = row === undefined ? null : {row, request: row ? null : root.crypto.randomUUID()};
      for (const [key,input] of fields) input.value = row?.[key] ? (key.endsWith('_at') ? local(row[key]) : row[key]) : '';
      form.hidden = !editing();
      actions.hidden = list.hidden = editing();
      if (editing()) fields.get('title').focus();
    }
    async function read() {
      if (!alive() || state.busy || editing()) return;
      const seq = ++state.generation;
      status.textContent = '교육을 불러오는 중입니다.';
      setBusy(true);
      try {
        const {data,error} = await rpc({p_action:'list'});
        if (!alive() || seq !== state.generation) return;
        if (error || !Array.isArray(data?.events)) throw error || new Error();
        list.replaceChildren();
        for (const row of data.events) {
          const b = button(row.title+' · '+local(row.starts_at).replace('T',' '),'btn btn-outline-secondary text-start text-break');
          b.addEventListener('click', () => { if (alive() && !state.busy) { status.textContent=''; setDraft(row); } });
          list.append(b);
        }
        status.textContent = data.events.length ? '' : '이 화면에서 등록한 교육이 없습니다.';
      } catch (_) {
        if (alive()) status.textContent='교육을 불러오지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.';
      } finally {
        if (alive() && seq === state.generation) setBusy(false);
      }
    }
    newButton.addEventListener('click', () => { if (alive() && !state.busy) { status.textContent=''; setDraft(null); } });
    reload.addEventListener('click', read);
    cancel.addEventListener('click', () => { if (alive() && !state.busy) { setDraft(undefined); status.textContent=''; newButton.focus(); } });
    dismiss.addEventListener('click', () => { if (!state.busy || !editing()) close(); });
    dialog.addEventListener('cancel', event => { if (state.busy && editing()) event.preventDefault(); });
    dialog.addEventListener('close', () => {
      if (active === state) active = null;
      dialog.remove();
      if (current() && trigger.isConnected) trigger.focus({preventScroll:true});
    }, {once:true});
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const draft = state.draft;
      if (!alive() || state.busy || !draft) return;
      const values = Object.fromEntries([...fields].map(([key,input]) => [key,input.value.trim()]));
      if (Object.values(values).some(value=>!value) || values.ends_at < values.starts_at) {
        status.textContent='모든 항목과 시작·종료 일시를 확인해 주세요.';
        return;
      }
      const timestamp = key => draft.row?.[key] && local(draft.row[key]) === values[key] ? draft.row[key] : values[key]+'+09:00';
      const payload = {...values, starts_at:timestamp('starts_at'),ends_at:timestamp('ends_at')};
      setBusy(true);
      try {
        const {data,error} = await rpc({p_action:'save',p_event:draft.row?.id ?? null,p_request:draft.request,
          p_expected:draft.row?.updated_at ?? null,p_fields:payload});
        if (!alive()) return;
        if (error || !data?.id) throw error || new Error();
        setDraft(undefined); setBusy(false); await read();
      } catch (error) {
        if (alive()) status.textContent = error?.code === '40001'
          ? '다른 창에서 바뀐 내용이 있습니다. 입력을 확인한 뒤 목록을 새로고침해 주세요.'
          : '저장을 확인하지 못했습니다. 입력은 유지되니 다시 시도해 주세요.';
      } finally { if (alive()) setBusy(false); }
    });
    dialog.showModal();
    void read();
  }
  root.MemberEducationPilot = Object.freeze({open,close});
})(window);
