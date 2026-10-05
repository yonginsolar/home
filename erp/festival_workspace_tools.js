/* v1.1.1 — Keep inventory-use drafts separate for each festival. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const money = value => `${Number(value || 0).toLocaleString('ko-KR')}원`;
  const count = value => Number(value || 0).toLocaleString('ko-KR');
  const node = (tag,text,cls) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
  window.FestivalWorkspaceTools = { init({rpc,getEvent,getItems,editable,isBusy,onChanged,onStockChanged,readable,status,today}) {
    let busy=false,inventoryOffset=0,inventoryRevision=0,dashboardRevision=0,pendingUsage=null,settingsEvent=null;
    let inventoryDraftEventId=null;
    const inventoryDrafts=new Map();
    const draftFields=['eventUseItem','eventUseDate','eventUseType','eventUseQuantity','eventUseNote'];
    function rememberInventoryDraft() {
      if(!inventoryDraftEventId)return;
      inventoryDrafts.set(inventoryDraftEventId,{
        values:Object.fromEntries(draftFields.map(id=>[id,$(id).value])),pendingUsage
      });
    }
    const dialog=$('eventSettingsDialog');
    const showError=(id,error)=>{$(id).textContent=readable(error);$(id).classList.add('error');};
    async function run(fn,id='eventSettingsStatus') {
      if(busy||isBusy())return;
      busy=true;
      dialog.querySelectorAll('button,input').forEach(e=>{e.disabled=true;});
      try{await fn();}catch(e){showError(id,e);}finally{busy=false;syncSettings();dialog.querySelectorAll('button').forEach(e=>{e.disabled=!editable;});}
    }
    function syncSettings() {
      $('eventSettingsForm').querySelectorAll('input').forEach(e=>{e.disabled=busy||!editable;});
      const noCash=$('eventNoCash').checked;
      $('guidePrice').disabled=busy||!editable||noCash;
      $('guideCoupon').disabled=busy||!editable||noCash;
      $('guideCouponValue').disabled=busy||!editable||noCash||!$('guideCoupon').checked;
      $('guideCouponValue').required=$('guideCoupon').checked&&!noCash;
    }
    $('eventNoCash').addEventListener('change',syncSettings);
    $('guideCoupon').addEventListener('change',syncSettings);
    $('editEvent').addEventListener('click',()=>{
      if(!editable||busy||isBusy()||dialog.open||!getEvent())return;
      settingsEvent=getEvent();const g=settingsEvent.guide_settings||{};
      $('editEventName').value=settingsEvent.event_name;$('editEventDate').value=settingsEvent.event_date;
      $('eventNoCash').checked=settingsEvent.no_cash_sales===true;
      $('guideActivity').value=g.activity_name||'태양광 선풍기 만들기 체험';$('guidePrice').value=g.unit_price??2000;
      $('guideCoupon').checked=g.coupon_enabled===true;$('guideCouponValue').value=g.coupon_value??3000;
      $('guideShowDate').checked=g.show_date===true;$('guideTime').value=g.time_text||'';$('guideCapacity').value=g.capacity??'';
      $('eventSettingsStatus').textContent='';syncSettings();dialog.showModal();document.body.classList.add('event-dialog-open');$('editEventName').focus();
    });
    $('closeEventSettings').addEventListener('click',()=>{if(!busy)dialog.close();});
    dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
    dialog.addEventListener('close',()=>{document.body.classList.remove('event-dialog-open');});
    $('eventSettingsForm').addEventListener('submit',e=>{
      e.preventDefault();if(!editable||!settingsEvent||!e.currentTarget.reportValidity())return;
      const noCash=$('eventNoCash').checked;
      const data={event_id:settingsEvent.id,version:settingsEvent.version,event_name:$('editEventName').value.trim(),event_date:$('editEventDate').value,no_cash_sales:noCash,
        guide_settings:{activity_name:$('guideActivity').value.trim(),unit_price:noCash?0:Number($('guidePrice').value),coupon_enabled:!noCash&&$('guideCoupon').checked,
          coupon_value:Number($('guideCouponValue').value||3000),show_date:$('guideShowDate').checked,time_text:$('guideTime').value.trim(),capacity:$('guideCapacity').value?Number($('guideCapacity').value):null}};
      if(data.guide_settings.coupon_enabled&&data.guide_settings.coupon_value>data.guide_settings.unit_price){$('eventSettingsStatus').textContent='쿠폰 금액은 체험비보다 클 수 없습니다.';return;}
      run(async()=>{await rpc('update_event',data);dialog.close();await onChanged(settingsEvent.id);status('축제명과 체험·인쇄 안내를 저장했습니다. 기존 거래 날짜와 회계 전표는 변경하지 않았습니다.');});
    });
    function dates() {
      const current=today(),year=current.slice(0,4),month=current.slice(0,7);
      const mode=$('dashboardPeriod').value;
      if(mode==='year')return {from:`${year}-01-01`,to:current};
      if(mode==='month')return {from:`${month}-01`,to:current};
      if(mode==='custom')return {from:$('dashboardFrom').value||null,to:$('dashboardTo').value||null};
      return {};
    }
    $('dashboardPeriod').addEventListener('change',()=>{document.querySelectorAll('.dashboard-date').forEach(e=>{e.hidden=$('dashboardPeriod').value!=='custom';});});
    $('dashboardFilter').addEventListener('submit',e=>{e.preventDefault();void reloadDashboard();});
    async function reloadDashboard() {
      const revision=++dashboardRevision,data=dates();
      if(data.from&&data.to&&data.from>data.to){$('dashboardStatus').textContent='시작일이 종료일보다 늦습니다.';return;}
      $('dashboardStatus').textContent='매출을 집계하고 있습니다.';
      try {
        const result=await rpc('dashboard',data);if(revision!==dashboardRevision)return;
        if(result.amount_basis!=='stored_supply_v1')throw new Error('매출 집계 기준을 확인하지 못했습니다. 잠시 후 다시 조회해 주세요.');
        const s=result.summary||{};$('dashboardCards').replaceChildren();
        [['전체 매출',s.total_supply,'부가세 제외'],['재료비 매출',s.material_supply,'부가세 제외'],['체험비·추가 입금',Number(s.experience_supply||0)+Number(s.extra_supply||0),'부가세 제외'],['실제 수납액',s.received_amount,'부가세 포함']].forEach(([label,value,basis])=>{
          const card=node('article',undefined,'summary-card');card.append(node('h3',label),node('strong',money(value)),node('p',basis,'small muted'));$('dashboardCards').append(card);
        });
        $('dashboardVat').textContent=`집계된 매출의 부가세: ${money(s.vat_amount)}`;
        $('dashboardRows').replaceChildren();
        (result.items||[]).forEach(item=>{const row=node('tr');[item.event_name,money(item.material_supply),money(Number(item.experience_supply)+Number(item.extra_supply)),money(item.refund_supply),money(item.total_supply),`유료 ${count(item.sold_quantity)} · 무료 ${count(item.free_quantity)}`].forEach(text=>row.append(node('td',text)));$('dashboardRows').append(row);});
        if(!(result.items||[]).length){const row=node('tr'),cell=node('td','이 기간에 기록된 매출이나 무료 체험이 없습니다.');cell.colSpan=6;row.append(cell);$('dashboardRows').append(row);}
        $('dashboardStatus').textContent=Number(s.refund_amount)?`반환한 ${money(s.refund_amount)} 중 공급가액 ${money(s.refund_supply)}을 매출 합계에서 뺐습니다.`:'';
      }catch(e){if(revision===dashboardRevision)showError('dashboardStatus',e);}
    }
    async function reloadInventory(reset=false) {
      if(reset)inventoryOffset=0;
      const event=getEvent(),revision=++inventoryRevision;
      const nextId=event?.id||null;
      if(nextId!==inventoryDraftEventId) {
        rememberInventoryDraft();
        inventoryDraftEventId=nextId;
        const draft=inventoryDrafts.get(nextId);
        draftFields.forEach(id=>{$(id).value=draft?.values[id]??(id==='eventUseDate'?today():id==='eventUseType'?'event_use':'');});
        pendingUsage=draft?.pendingUsage||null;
      }
      $('eventInventory').hidden=!event;if(!event)return;
      const old=$('eventUseItem').value;$('eventUseItem').replaceChildren();
      getItems().filter(i=>i.is_active).forEach(i=>{const option=node('option',`${i.item_name} · 재고 ${count(i.stock_quantity)}${i.unit}`);option.value=i.id;$('eventUseItem').append(option);});
      if([...$('eventUseItem').options].some(o=>o.value===old))$('eventUseItem').value=old;
      $('eventUseDate').value=$('eventUseDate').value||today();$('eventUseDate').max=today();
      $('eventUseForm').hidden=!editable||!event.is_active;
      if(event.no_cash_sales)$('eventInventory').open=true;
      try {
        const result=await rpc('inventory',{event_id:event.id,offset:inventoryOffset});if(revision!==inventoryRevision||getEvent()?.id!==event.id)return;
        const s=result.summary||{};
        $('eventInventorySummary').textContent=`유료 체험 ${count(s.sold_quantity)}개 · 무료 체험·행사 사용 ${count(s.free_quantity)}개 · 불량·폐기 ${count(s.defect_quantity)}개`;
        $('eventInventoryRows').replaceChildren();
        const labels={sale:'유료 체험',event_use:'무료 체험·행사 사용',defect:'불량·폐기',purchase:'입고',adjustment_in:'실사 증가',adjustment_out:'실사 감소'};
        (result.items||[]).forEach(m=>{const row=node('tr');[m.movement_date,m.item_name,labels[m.movement_type]||'재고 조정',`${count(Math.abs(m.quantity_delta))}${m.unit}`,m.note||''].forEach(text=>row.append(node('td',text)));$('eventInventoryRows').append(row);});
        if(!(result.items||[]).length){const row=node('tr'),cell=node('td','이 축제의 재고 사용 기록이 없습니다.');cell.colSpan=5;row.append(cell);$('eventInventoryRows').append(row);}
        $('eventInventoryPrevious').hidden=inventoryOffset===0;$('eventInventoryNext').hidden=inventoryOffset+100>=Number(result.total||0);
      }catch(e){if(revision===inventoryRevision)status(readable(e),true);}
    }
    $('eventInventoryPrevious').addEventListener('click',()=>{inventoryOffset=Math.max(0,inventoryOffset-100);void reloadInventory();});
    $('eventInventoryNext').addEventListener('click',()=>{inventoryOffset+=100;void reloadInventory();});
    $('eventUseForm').addEventListener('submit',e=>{
      e.preventDefault();const event=getEvent();if(!editable||!event||busy||isBusy()||!e.currentTarget.reportValidity())return;
      const data={event_id:event.id,item_id:$('eventUseItem').value,movement_date:$('eventUseDate').value,movement_type:$('eventUseType').value,quantity:Number($('eventUseQuantity').value),note:$('eventUseNote').value.trim()};
      const fingerprint=JSON.stringify(data);if(pendingUsage?.fingerprint!==fingerprint)pendingUsage={fingerprint,key:crypto.randomUUID()};
      if(!confirm(`${event.event_name}\n${data.quantity}개를 사용한 기록을 저장할까요? 재고가 줄어들고 매출 전표는 만들지 않습니다.`))return;
      run(async()=>{await rpc('movement',{...data,request_key:pendingUsage.key});pendingUsage=null;$('eventUseQuantity').value='';$('eventUseNote').value='';await onStockChanged();status('이 축제의 사용 수량과 재고를 저장했습니다. 매출을 추가로 만들지 않았습니다.');},'operationStatus');
    });
    return {isBusy:()=>busy,reloadDashboard,reloadInventory,selectEvent:()=>reloadInventory(true),close:()=>{if(dialog.open&&!busy)dialog.close();}};
  }};
})();
