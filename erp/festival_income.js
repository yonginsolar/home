/* v1.1.0 — Compact material fees in the selected festival workspace. */
(() => {
  'use strict';
  const money = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
  const today = () => new Date(Date.now() + 32400000).toISOString().slice(0, 10);
  const errors = {
    ADMIN_REQUIRED: '관리 권한이 없거나 로그인 시간이 만료되었습니다.',
    EDIT_REQUIRED: '회계 등록 권한이 필요합니다.',
    EVENT_NOT_FOUND: '행사를 먼저 등록하고 선택해 주세요.',
    INCOME_CHANGED: '다른 화면에서 변경된 내역입니다. 새로고침한 뒤 다시 확인해 주세요.',
    INCOME_NOT_FOUND: '해당 재료비 내역을 조회할 수 없습니다.',
    INCOME_RECEIPT_EXCEEDS_BALANCE: '입금액은 0원보다 크고 남은 금액 이하여야 합니다.',
    INCOME_BELOW_RECEIVED: '예정 금액을 이미 받은 금액보다 작게 바꿀 수 없습니다.',
    INVALID_INCOME_DATE: '입금일은 실제 입금 날짜로, 오늘까지 입력해 주세요.',
    INVALID_INCOME_INPUT: '행사·정산처·내용·금액을 확인해 주세요.',
    JOURNAL_NOT_LINKABLE: '연결할 수 없는 전표입니다. 이미 연결됐는지, 날짜와 금액이 맞는지 확인해 주세요.',
    REQUEST_CONFLICT: '이전 요청과 내용이 다릅니다. 새로고침 후 처리 결과부터 확인해 주세요.',
    ACCOUNT_SETUP_REQUIRED: '회계 계정 설정을 먼저 확인해 주세요.',
    FESTIVAL_INCOME_JOURNAL_LINKED: '입금 기록에 연결된 전표입니다. 회계 기록과 입금 기록을 함께 확인해 주세요.'
  };
  const readable = (e) => {
    const message = String(e?.message || e || '');
    const key = Object.keys(errors).find((k) => message.includes(k));
    if (key) return errors[key];
    if (/결산|마감|PERIOD_CLOSED/.test(message)) return '결산이 마감된 기간에는 입금 전표를 추가할 수 없습니다. 회계 마감을 확인해 주세요.';
    return '저장 결과를 확인하지 못했습니다. 새로고침하여 처리 결과를 확인한 뒤 다시 시도해 주세요.';
  };
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function button(text, handler, secondary = false) {
    const el = node('button', text, secondary ? 'secondary compact' : 'compact');
    el.type = 'button';
    el.addEventListener('click', handler);
    return el;
  }
  function field(form, text, name, type = 'text', value = '', options = {}) {
    const label = node('label', text, options.wide ? 'full' : '');
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    if (type !== 'select') input.type = type;
    input.name = name;
    input.value = value ?? '';
    if (options.required) input.required = true;
    if (options.maxLength) input.maxLength = options.maxLength;
    if (type === 'number') { input.min = options.min ?? 1; input.max = options.max ?? 100000000000; input.step = '1'; input.inputMode = 'numeric'; }
    label.append(input);
    form.append(label);
    return input;
  }
  function check(parent, text, checked) {
    const label = node('label', undefined, 'check');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = checked;
    label.append(input, node('span', text)); parent.append(label);
    return input;
  }
  window.FestivalIncome = {
    init({ root, rpc, getEvents, getSelectedEvent, editable }) {
      let busy = false, offset = 0, total = 0, items = [];
      let registrationEventId = null;
      const createDrafts = new Map();
      const eventSelects = new Set();
      const requestKeys = new Map();
      root.className = 'card festival-income';
      const header = node('div', undefined, 'section-heading');
      const heading = node('div'); heading.append(node('h2', '🧾 받을 재료비'),
        node('p', '행사 주관사에서 받을 재료비를 적어 두고, 실제 입금 후 확인해 주세요. 입금 확인을 누르면 회계 전표도 함께 기록됩니다.', 'muted'));
      const refresh = button('새로고침', () => run(() => reload()), true);
      header.append(heading, refresh);
      const summary = node('div', undefined, 'income-summary');
      const status = node('p', '', 'status'); status.setAttribute('role', 'status');
      const createDetails = node('details', undefined, 'sub-panel');
      createDetails.open = true;
      createDetails.append(node('summary', '받을 재료비 등록'));
      const createForm = makePlanForm();
      createDetails.append(createForm.form);
      createDetails.hidden = !editable;
      const toolbar = node('div', undefined, 'income-toolbar');
      const filterLabel = node('label', '보기');
      const filter = document.createElement('select');
      [['all','전체'],['open','입금 기다리는 건'],['paid','입금 완료']].forEach(([value,text]) => { const option = node('option',text);option.value=value;filter.append(option); });
      filterLabel.append(filter); toolbar.append(filterLabel);
      const list = node('div', undefined, 'income-list');
      const pageInfo = node('p', '', 'income-page-info');
      const pager = node('div', undefined, 'toolbar');
      const previous = button('이전 30건', () => run(async () => { offset=Math.max(0,offset-30);await reload(); }), true);
      const next = button('다음 30건', () => run(async () => { offset+=30;await reload(); }), true);
      pager.append(previous,next);
      root.replaceChildren(header,summary,createDetails,toolbar,status,list,pageInfo,pager);
      filter.addEventListener('change', () => run(async () => { offset=0;await reload(); }));

      function setStatus(text, error=false) { status.textContent=text;status.classList.toggle('error',error); }
      function syncBusy() {
        root.querySelectorAll('button,input,select').forEach(el => { el.disabled = busy || el.dataset.readonly === 'true'; });
      }
      async function run(fn) {
        if (busy) return;
        busy=true;syncBusy();setStatus('처리 중입니다.');
        try { await fn(); } catch(e) { setStatus(readable(e),true); }
        finally { busy=false;syncBusy(); }
      }
      function keyed(scope, data) {
        const fingerprint=JSON.stringify(data);
        const old=requestKeys.get(scope);
        const entry=old?.fingerprint===fingerprint ? old : {fingerprint,key:crypto.randomUUID()};
        requestKeys.set(scope,entry);
        return {...data,request_key:entry.key};
      }
      function fillEvents(select, preferred='') {
        const selected=preferred || select.value;
        select.replaceChildren();
        const events=getEvents().filter(e=>e.is_active || e.id===selected);
        const placeholder=node('option',events.length?'행사를 선택해 주세요':'위에서 행사를 먼저 등록해 주세요');placeholder.value='';select.append(placeholder);
        events.forEach(e=>{const option=node('option',`${e.event_date} · ${e.event_name}`);option.value=e.id;select.append(option);});
        if(events.some(e=>e.id===selected)) select.value=selected;
        else if(events.length===1) select.value=events[0].id;
      }
      function makePlanForm(plan) {
        const form=node('form',undefined,'form-grid income-form');
        const event=getSelectedEvent ? null : field(form,'행사','event_id','select','',{required:true,wide:true});
        if(event){eventSelects.add(event);fillEvents(event,plan?.event_id);}
        field(form,'받을 곳 (주관사·정산기관)','payer_name','text',plan?.payer_name,{required:true,maxLength:120});
        field(form,'받을 금액 (부가세 포함)','expected_amount','number',plan?.expected_amount,{required:true});
        field(form,'메모 (선택)','note','text',plan?.note,{maxLength:500,wide:true});
        const invoice=plan?null:check(form,'세금계산서 발행 완료',false);
        const submit=node('button',plan?'수정 저장':'받을 재료비 등록');submit.type='submit';form.append(submit);
        form.addEventListener('submit',e=>{
          e.preventDefault();if(!editable || busy || !form.reportValidity())return;
          const data=Object.fromEntries(new FormData(form));data.expected_amount=Number(data.expected_amount);
          if(getSelectedEvent)data.event_id=getSelectedEvent()?.id;
          const selected=getEvents().find(item=>item.id===data.event_id);
          if(!selected?.is_active){setStatus('재료비를 등록할 축제를 먼저 선택해 주세요.',true);return;}
          data.title=plan?.title || `${selected.event_name} 재료비`;
          data.due_date=plan?.due_date || null;
          if(!plan)data.invoice_issued=invoice.checked;
          run(async()=>{
            if(plan) {data.id=plan.id;data.version=plan.version;await rpc('update',data);}
            else {const key=`create:${data.event_id}`;await rpc('create',keyed(key,data));requestKeys.delete(key);createDrafts.delete(data.event_id);form.reset();if(event)fillEvents(event);createDetails.open=false;}
            await reload();setStatus(plan?'예정 내역을 수정했습니다.':'받을 재료비를 등록했습니다. 실제 입금 후 입금 확인을 눌러 주세요.');
          });
        });
        return {form,event};
      }
      function showEditor(card, title, form) {
        card.querySelector('.income-editor')?.remove();
        const editor=node('div',undefined,'income-editor');editor.append(node('h4',title),form);
        const cancel=button('닫기',()=>{editor.remove();},true);cancel.classList.add('cancel');form.append(cancel);card.append(editor);
      }
      function receiptEditor(card,plan) {
        const form=node('form',undefined,'form-grid income-form');
        const date=field(form,'실제 입금일','received_date','date',today(),{required:true});date.max=today();
        const amount=field(form,'실제 받은 금액','amount','number',plan.outstanding_amount,{required:true,max:plan.outstanding_amount});
        const submit=node('button','입금 확인·회계 기록');submit.type='submit';form.append(submit);
        form.addEventListener('submit',e=>{
          e.preventDefault();if(!editable || !form.reportValidity() || busy)return;
          const data={id:plan.id,version:plan.version,received_date:date.value,amount:Number(amount.value)};
          if(!confirm(`${plan.payer_name}에서 ${money(data.amount)}을 실제로 받으셨나요?\n입금 확인과 회계 전표를 함께 저장합니다. 이미 회계에 입력했다면 취소하고 ‘기존 전표 연결’을 이용해 주세요.`))return;
          run(async()=>{await rpc('receive',keyed(`receive:${plan.id}`,data));requestKeys.delete(`receive:${plan.id}`);await reload();setStatus('입금 확인과 회계 전표 저장을 완료했습니다.');});
        });
        showEditor(card,'실제 입금 확인',form);
      }
      async function linkEditor(card,plan) {
        const result=await rpc('journals',{id:plan.id});
        const journals=result.items || [];
        if(!journals.length){setStatus('연결할 수 있는 재료비 입금 전표가 없습니다. 회계의 날짜·계정·금액을 확인해 주세요.');return;}
        const form=node('form',undefined,'form-grid income-form');
        const select=field(form,'이미 입력한 재료비 입금 전표','journal','select','',{required:true,wide:true});
        const placeholder=node('option','날짜·내용·입금액을 보고 선택해 주세요');placeholder.value='';select.append(placeholder);
        journals.forEach((j,i)=>{const option=node('option',`${j.received_date} · ${j.description || '행사 재료비 입금'} · ${money(j.amount)}`);option.value=String(i);select.append(option);});
        const info=node('p','선택한 기존 전표에 연결합니다. 새 전표는 만들지 않습니다.','muted full');form.append(info);
        select.addEventListener('change',()=>{const j=journals[Number(select.value)];info.textContent=select.value!==''&&j?`${j.received_date} · ${money(j.amount)} 입금에 연결합니다. 새 전표는 만들지 않습니다.`:'선택한 기존 전표에 연결합니다. 새 전표는 만들지 않습니다.';});
        const submit=node('button','기존 전표 연결');submit.type='submit';form.append(submit);
        form.addEventListener('submit',e=>{
          e.preventDefault();if(!editable || !form.reportValidity() || busy)return;
          const j=journals[Number(select.value)];if(!j || select.value==='')return;
          if(!confirm(`${j.received_date} · ${money(j.amount)}\n${j.description || ''}\n이 기존 전표에 연결할까요? 회계 금액을 다시 입력하지 않습니다.`))return;
          run(async()=>{await rpc('link',keyed(`link:${plan.id}`,{id:plan.id,version:plan.version,received_date:j.received_date,amount:Number(j.amount),journal_trans_id:j.journal_trans_id}));requestKeys.delete(`link:${plan.id}`);await reload();setStatus('기존 전표에 연결했습니다. 새 회계 전표는 만들지 않았습니다.');});
        });
        showEditor(card,'기존 회계 전표 연결',form);setStatus('연결할 기존 전표를 선택해 주세요.');
      }
      function render() {
        eventSelects.forEach(select=>{if(!root.contains(select)&&select!==createForm.event)eventSelects.delete(select);});
        list.replaceChildren();
        if(!items.length)list.append(node('p','해당하는 재료비 내역이 없습니다.','muted'));
        items.forEach(plan=>{
          const card=node('article',undefined,'income-item');
          const paid=Number(plan.outstanding_amount)===0;
          card.append(node('h3',plan.payer_name),node('span',paid?'입금 완료':Number(plan.received_amount)>0?'부분 입금':'입금 대기',`income-badge${paid?' paid':''}`),
            node('p',`${plan.event_date} · ${plan.event_name}`,'income-meta'));
          const amounts=node('div',undefined,'income-amounts');
          [['예정 금액',plan.expected_amount],['받은 금액',plan.received_amount],['남은 금액',plan.outstanding_amount]].forEach(([label,value])=>{const cell=node('div');cell.append(node('span',label),node('strong',money(value)));amounts.append(cell);});card.append(amounts);
          const invoice=check(card,'세금계산서 발행 완료',plan.invoice_issued);invoice.dataset.readonly=String(!editable);
          invoice.addEventListener('change',()=>{
            if(busy){invoice.checked=plan.invoice_issued;return;}
            const value=invoice.checked;
            run(async()=>{try{await rpc('invoice',{id:plan.id,version:plan.version,invoice_issued:value});await reload();setStatus(value?'세금계산서 발행 완료로 표시했습니다.':'세금계산서 발행 표시를 해제했습니다.');}catch(e){invoice.checked=plan.invoice_issued;throw e;}});
          });
          if(plan.note)card.append(node('p',plan.note,'income-note'));
          if(editable){const actions=node('div',undefined,'income-actions');
            if(!paid)actions.append(button('입금 확인',()=>receiptEditor(card,plan)),button('기존 전표 연결',()=>run(()=>linkEditor(card,plan)),true));
            if(!getSelectedEvent || getSelectedEvent()?.is_active)actions.append(button('예정 내역 수정',()=>{const edit=makePlanForm(plan);showEditor(card,'예정 내역 수정',edit.form);},true));card.append(actions);}
          if(plan.receipts?.length){const history=node('details',undefined,'income-history');history.append(node('summary',`입금 기록 ${plan.receipts.length}건`));const ul=node('ul');
            plan.receipts.forEach(r=>ul.append(node('li',`${r.received_date} · ${money(r.amount)} · ${r.source==='linked'?'기존 전표 연결':'회계 자동 기록'}${r.journal_exists?'':' · 회계 전표 확인 필요'}`)));history.append(ul);card.append(history);}
          list.append(card);
        });
        pageInfo.textContent=total?`${total.toLocaleString('ko-KR')}건 중 ${offset+1}–${Math.min(offset+30,total)}건`:'';
        previous.hidden=offset===0;next.hidden=offset+30>=total;
        syncBusy();
      }
      async function reload() {
        const event=getSelectedEvent?.();
        if(getSelectedEvent&&!event){items=[];total=0;list.replaceChildren();summary.replaceChildren();return;}
        const data=await rpc('list',{filter:filter.value,offset,...(event?{event_id:event.id}:{})});
        if(offset>0 && !(data.items||[]).length){offset=Math.max(0,offset-30);return reload();}
        items=data.items || [];total=Number(data.total||0);
        summary.replaceChildren();
        [['입금 기다리는 건',`${data.summary?.open_count || 0}건`],['받을 잔액',money(data.summary?.outstanding_amount)]].forEach(([label,value])=>{const cell=node('div');cell.append(node('span',label),node('strong',value));summary.append(cell);});
        const eventId=event?.id || 'all';
        if(registrationEventId!==eventId){createDetails.open=Number(data.summary?.plan_count ?? data.total ?? 0)===0;registrationEventId=eventId;}
        createDetails.hidden=!editable || Boolean(event&&!event.is_active);
        render();setStatus('');
      }
      const controller={reload:()=>run(()=>reload()),refreshEvents:()=>eventSelects.forEach(select=>fillEvents(select)),isBusy:()=>busy,
        selectEvent:()=>run(async()=>{
          if(registrationEventId)createDrafts.set(registrationEventId,Array.from(createForm.form.querySelectorAll('input,select')).map(el=>({value:el.value,checked:el.checked})));
          offset=0;registrationEventId=null;createForm.form.reset();
          const draft=createDrafts.get(getSelectedEvent?.()?.id);
          if(draft)Array.from(createForm.form.querySelectorAll('input,select')).forEach((el,i)=>{el.value=draft[i].value;el.checked=draft[i].checked;});
          await reload();
        }),ready:null};
      controller.ready=run(async()=>{await reload();});
      // A failed initial load can be retried without rebuilding or losing drafts.
      return controller;
    }
  };
})();
