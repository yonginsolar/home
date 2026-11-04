(function (global) {
  'use strict';
  let model = null, sequence = 0;
  let statisticsRead=null, statisticsRecovery=null;
  let otherOptions=null, otherModelScope='', otherSequence=0, otherRead=null, otherRows=[], otherCursor=null, otherReady=false, otherOpening=false;
  let otherSelection=null, otherOpen=false, otherOpener=null, otherBound=false, otherTotal=null;
  let otherDeferredRefresh=null, otherRefreshEpoch=0;
  let otherFocusReturn=null;
  let otherMoreFocus=null;
  const labels = { yongin: ['수지구','기흥구','처인구','그 외','주소 미확인'], gyeonggi: ['경기도내','그 외','주소 미확인'] };
  const hwaseongLabels = ['만세구','효행구','병점구','동탄구','그외'];
  const colors = { '만세구':'#0d6efd','효행구':'#20c997','병점구':'#198754','동탄구':'#f5b301','그외':'#adb5bd','수지구':'#0d6efd','기흥구':'#20c997','처인구':'#198754','경기도내':'#ffc107','그 외':'#adb5bd','주소 미확인':'#6c757d' };
  const genderLabels = ['남성','여성','미확인'];
  const node = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const count = value => Math.max(0, Number(value) || 0);
  const percent = (value, total) => total > 0 ? `${(count(value) / total * 100).toFixed(1)}%` : '0.0%';
  function otherContext() { return otherOptions?.otherListContext?.() || {}; }
  function otherScope() { const c=otherContext();return c.allowed&&c.active&&c.auth&&c.coop ? JSON.stringify([c.auth,c.coop]) : ''; }
  function otherControls() {
    const locked=!!otherRead||otherOpening||!otherReady||!otherScope();
    node('member-other-members-rows')?.querySelectorAll('button').forEach(b=>{b.disabled=locked;});
    const more=node('member-other-members-more');if(more)more.disabled=locked;
  }
  function pauseOtherList(clearContext=false,hide=true,preserveFocus=false,preserveStatistics=false) {
    otherMoreFocus=null;
    ++otherSequence;otherRead?.controller.abort();otherRead=null;otherRows=[];otherCursor=null;otherReady=false;otherOpening=false;
    node('member-other-members-rows')?.replaceChildren();
    otherOpen=false;otherTotal=null;
    const panel=node('memberRegionOtherModal');
    if(panel&&hide)global.bootstrap?.Modal.getInstance(panel)?.hide();
    if(clearContext){if(!preserveStatistics){cancelStatisticsRead();statisticsRecovery=null;syncStatisticsRecovery();}if(!preserveFocus)otherFocusReturn=null;++otherRefreshEpoch;otherDeferredRefresh=null;otherModelScope='';if(node('member-other-members-open'))node('member-other-members-open').hidden=true;}
    otherControls();
  }
  function closeOtherList() {
    const focus=prepareOtherFocusReturn();
    pauseOtherList();
    if(focus?.phase==='closing')global.requestAnimationFrame(()=>restoreOtherFocusReturn(focus));
  }
  function prepareOtherFocusReturn() {
    const panel=node('memberRegionOtherModal'),owner=otherScope(),active=document.activeElement;
    if(!otherOpen||!owner||!otherSelection||!(panel?.contains(active)||active===document.body))return null;
    const waiting=otherDeferredRefresh?.scope===owner&&otherDeferredRefresh.epoch===otherRefreshEpoch;
    return otherFocusReturn={owner,panel,opener:otherOpener,scope:otherSelection.scope,phase:waiting?'awaiting-load':'closing'};
  }
  function restoreOtherFocusReturn(focus) {
    if(!focus||otherFocusReturn!==focus)return;
    otherFocusReturn=null;
    const active=document.activeElement;
    if(otherOpen||focus.owner!==otherScope()||global.frameElement?.hidden||document.querySelector('.modal.show,dialog[open]')||
      !(active===document.body||active===document.documentElement||active===focus.opener||focus.panel?.contains(active)))return;
    const visible=el=>{const r=el?.getBoundingClientRect();return !!(el?.isConnected&&!el.hidden&&!el.disabled&&el.getClientRects().length&&r.bottom>0&&r.top<global.innerHeight&&r.right>0&&r.left<global.innerWidth);};
    const select=node(`member-demographic-select-${focus.scope}`),status=node(`member-demographic-status-${focus.scope}`);
    const target=visible(focus.opener)?focus.opener:visible(select)?select:visible(status)?status:null;
    if(!target)return;
    if(target===status)target.setAttribute('tabindex','-1');
    target.focus({preventScroll:true});
  }
  function observeOtherFocus(event) {
    const more=otherMoreFocus;
    if(more&&!(event.type==='focusin'&&[document.body,document.documentElement,more.button].includes(event.target))&&
      !(event.target===more.button&&((event.type==='keydown'&&['Enter',' ','Spacebar'].includes(event.key))||event.type==='pointerdown')))otherMoreFocus=null;
    const focus=otherFocusReturn;if(!focus||focus.panel?.contains(event.target))return;
    if(event.type==='focusin'&&(event.target===document.body||event.target===document.documentElement||event.target===focus.opener))return;
    otherFocusReturn=null;
  }
  function deferDashboardRefresh(refresh) {
    const scope=otherScope();
    if(!otherOpen||!scope||scope!==otherModelScope||typeof refresh!=='function')return false;
    otherDeferredRefresh={scope,options:otherOptions,epoch:otherRefreshEpoch,refresh};
    return true;
  }
  function flushOtherRefresh() {
    const work=otherDeferredRefresh;otherDeferredRefresh=null;
    if(!work)return;
    void Promise.resolve().then(()=>{
      if(work.epoch!==otherRefreshEpoch||work.scope!==otherScope()||work.options!==otherOptions)return;
      if(otherOpen){otherDeferredRefresh||=work;return;}
      const focus=otherFocusReturn;
      return Promise.resolve(work.refresh()).then(()=>{if(focus?.phase==='awaiting-load')restoreOtherFocusReturn(focus);});
    }).catch(()=>{});
  }
  function bindOtherModal() {
    if(otherBound)return;
    const panel=node('memberRegionOtherModal');if(!panel)return;otherBound=true;
    for(const type of ['pointerdown','keydown','focusin','input','change','wheel','touchmove'])document.addEventListener(type,observeOtherFocus,{capture:true,passive:type==='wheel'||type==='touchmove'});
    panel.addEventListener('hide.bs.modal',()=>{if(otherOpen){prepareOtherFocusReturn();pauseOtherList(false,false);}});
    panel.addEventListener('hidden.bs.modal',()=>{flushOtherRefresh();const focus=otherFocusReturn;if(focus?.phase==='closing')global.requestAnimationFrame(()=>restoreOtherFocusReturn(focus));});
    panel.addEventListener('keydown',event=>{
      if(!otherOpen||panel.hasAttribute('inert')||event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeOtherList();return;}
      if(event.key!=='Tab')return;
      const buttons=[...panel.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(b=>!b.hidden&&b.getClientRects().length);
      const first=buttons[0],last=buttons.at(-1);
      if(!first){event.preventDefault();panel.focus();}
      else if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===panel)){event.preventDefault();first.focus();}
    });
  }
  async function openOtherList(button) {
    if(!otherSelection||otherOptions?.regionsEnabled===false||!otherScope()||otherModelScope!==otherScope())return;
    otherFocusReturn=null;bindOtherModal();otherOpener=button||node('member-other-members-open');otherOpen=true;
    node('member-other-members-title').textContent=`${otherSelection.scope==='gyeonggi'?'경기도':model.local_region_title||'용인'} · ${otherSelection.label} 조합원 명단`;
    global.bootstrap.Modal.getOrCreateInstance(node('memberRegionOtherModal')).show();
    return loadOtherList(true);
  }
  async function loadOtherList(reset=true) {
    const scope=otherScope(),panel=node('memberRegionOtherModal'),selection=otherSelection;
    if(!scope||!panel||!otherOpen||!selection){pauseOtherList();return;}
    if(otherOpening)return;
    const after=reset?null:otherCursor,key=scope+'|'+selection.scope+'|'+String(after||'');
    if(otherRead?.key===key)return otherRead.promise;
    const more=node('member-other-members-more'),previousCount=reset?0:otherRows.length;
    otherMoreFocus=!reset&&document.activeElement===more?{button:more,panel,target:null}:null;
    const focus=otherMoreFocus;
    otherRead?.controller.abort();const ticket=++otherSequence,c=otherContext(),job={key,controller:new AbortController(),promise:null};
    otherRead=job;otherReady=false;otherControls();node('member-other-members-status').textContent='명단을 확인하고 있습니다…';
    const current=()=>ticket===otherSequence&&scope===otherScope()&&selection===otherSelection&&otherOpen;
    job.promise=(async()=>{let timer;try{
      let op=otherOptions.client.rpc('get_member_region_other_members',{p_scope:selection.scope,p_after_id:after,p_limit:30});
      if(typeof op.abortSignal==='function')op=op.abortSignal(job.controller.signal);
      const {data,error}=await Promise.race([op,new Promise((_,reject)=>{timer=setTimeout(()=>{job.controller.abort();reject(Error('REGION_READ_TIMEOUT'));},15000);})]);
      if(!current())return;if(error)throw error;
      if(data?.coop_id!==c.coop||data.scope!==selection.scope||data.region!==selection.label||!Array.isArray(data.items)||!Number.isSafeInteger(data.total)||data.total<0)throw Error('REGION_READ_INVALID');
      if(!reset&&otherTotal!==data.total)throw Error('REGION_LIST_CHANGED');
      const seen=new Set(reset?[]:otherRows.map(r=>r.id)),next=reset?[]:otherRows.slice();
      for(const row of data.items){if(!/^[0-9a-f-]{36}$/i.test(String(row.id)))throw Error('REGION_READ_INVALID');if(!seen.has(row.id)){next.push(row);seen.add(row.id);}}
      if(next.length>data.total)throw Error('REGION_LIST_CHANGED');
      otherRows=next;otherCursor=data.next_after_id;otherReady=true;otherTotal=data.total;
      const box=node('member-other-members-rows');box.replaceChildren();
      for(const [index,row] of otherRows.entries()){const item=document.createElement('li');item.className='border rounded-3 p-3 mb-2';item.dataset.memberOrdinal=String(index+1);
        const name=document.createElement('h6');name.className='fw-bold d-flex flex-wrap align-items-center gap-2';
        const ordinal=document.createElement('span');ordinal.className='badge text-bg-secondary';ordinal.textContent=`${index+1}번`;
        const label=document.createElement('span');label.textContent=row.name||'이름 미등록';name.append(ordinal,label);item.append(name);
        const dl=document.createElement('dl');dl.className='row mb-2 small';
        for(const [label,value]of [['조합원번호',row.member_id||'미등록'],['주소',row.address||'미등록']]){
          const dt=document.createElement('dt'),dd=document.createElement('dd');dt.className='col-sm-3';dd.className='col-sm-9 text-break';dt.textContent=label;dd.textContent=value;dl.append(dt,dd);
        }item.append(dl);const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-outline-primary';b.textContent='회원 상세';
        b.addEventListener('click',async()=>{if(!current()||!otherReady||otherRead||otherOpening)return;otherOpening=true;otherControls();
          try{await otherOptions.openOtherMember?.(row.id,current);}catch{if(current())node('member-other-members-status').textContent='회원 상세를 열지 못했습니다. 다시 확인해 주세요.';}
          finally{if(current()){otherOpening=false;otherControls();}}
        });item.append(b);box.append(item);
      }
      node('member-other-members-status').textContent=data.total?`그외 ${data.total.toLocaleString()}명 · ${otherRows.length.toLocaleString()}명 표시`:'그외로 분류된 정조합원이 없습니다.';
      node('member-other-members-more').hidden=!data.has_more;
      if(focus)focus.target=box.children[previousCount]?.querySelector('button')||node('member-other-members-status');
    }catch(error){if(!current())return;
      if(error.code==='42501'){otherRows=[];otherCursor=null;node('member-other-members-rows').replaceChildren();}
      node('member-other-members-status').textContent=error.message==='REGION_LIST_CHANGED'?'조회 중 명단 인원이 변경되었습니다. 다시 확인을 눌러 처음부터 조회해 주세요.':error.code==='42501'?'현재 권한으로 명단을 조회할 수 없습니다.':otherRows.length?'명단을 불러오지 못해 이전 목록을 표시하고 있습니다. 다시 확인해 주세요.':'명단을 불러오지 못했습니다. 다시 확인해 주세요.';
      if(focus)focus.target=node('member-other-members-retry');
    }finally{clearTimeout(timer);if(otherRead===job){otherRead=null;otherControls();if(focus)global.requestAnimationFrame(()=>{
      if(otherMoreFocus!==focus||!current()||panel.hasAttribute('inert')||document.querySelector('dialog[open]'))return;
      otherMoreFocus=null;const active=document.activeElement,target=focus.target;
      if(![document.body,document.documentElement,focus.button].includes(active)||!target?.isConnected||target.hidden||target.disabled)return;
      if(target===node('member-other-members-status'))target.setAttribute('tabindex','-1');
      target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',inline:'nearest'});
    });}}})();return job.promise;
  }
  global.addEventListener('pagehide',()=>pauseOtherList(true));
  function ageTooltip(context) {
    const row = model?.age_groups?.find(item => item.label === context.label);
    if (!row) return '구성 정보를 확인하지 못했습니다.';
    return [`${count(row.count).toLocaleString()}명 (개인 조합원 중 ${percent(row.count, count(model.individual_count))})`,
      ...genderLabels.map(label => `${label} ${count(row.gender?.[label]).toLocaleString()}명 (${percent(row.gender?.[label], count(row.count))})`)];
  }
  function closeDetail(preserveFocus=false) {
    if(!preserveFocus)otherFocusReturn=null;
    pauseOtherList();otherSelection=null;
    if(node('member-other-members-open'))node('member-other-members-open').hidden=true;
    if (node('member-demographic-detail')) node('member-demographic-detail').hidden = true;
    for (const scope of Object.keys(labels)) if (node(`member-demographic-select-${scope}`)) node(`member-demographic-select-${scope}`).value = '';
  }
  function openRegion(scope, label) {
    const row = model?.[scope]?.find(item => item.label === label);
    if (!row) return;
    otherFocusReturn=null;
    pauseOtherList();
    otherSelection=['그외','그 외'].includes(label)?{scope,label}:null;
    const listButton=node('member-other-members-open');
    if(listButton){listButton.hidden=!otherSelection||otherOptions?.regionsEnabled===false||!otherScope()||otherModelScope!==otherScope();listButton.textContent='명단 보기';}
    const total = count(row.count), people = count(row.individual_count);
    node('member-demographic-title').textContent = `${row.label} 조합원 구성`;
    node('member-demographic-meta').textContent = `전체 ${total.toLocaleString()}명 (조합원 전체 중 ${percent(total,count(model.total))}) · 개인 ${people.toLocaleString()}명 · 단체 ${count(row.group_count).toLocaleString()}명`;
    node('member-demographic-gender').innerHTML = genderLabels.map(label => `<div class="col"><div class="border rounded-3 p-3 h-100"><div class="text-body-secondary">${label}</div><strong class="fs-4">${count(row.gender?.[label]).toLocaleString()}명</strong><div class="text-body-secondary">${percent(row.gender?.[label],people)}</div></div></div>`).join('');
    node('member-demographic-ages').innerHTML = (row.ages || []).map(age => `<tr><th scope="row">${escape(age.label)}</th><td>${count(age.count).toLocaleString()}명 <span class="text-body-secondary">(${percent(age.count,people)})</span></td>${genderLabels.map(gender => `<td>${count(age.gender?.[gender]).toLocaleString()}명</td>`).join('')}</tr>`).join('') || '<tr><td colspan="5" class="text-body-secondary">개인 조합원이 없는 지역입니다.</td></tr>';
    node('member-demographic-detail').hidden = false;
    for (const otherScope of Object.keys(labels)) node(`member-demographic-select-${otherScope}`).value = otherScope === scope ? label : '';
    node('member-demographic-detail').scrollIntoView({ behavior:'smooth',block:'nearest' });
  }
  function draw(data, options) {
    const isHwaseong=data.local_region_title==='화성';
    model = isHwaseong ? {...data,yongin:hwaseongLabels.map(label=>data.yongin?.find(row=>row.label===label)||{label,count:0,individual_count:0,group_count:0,gender:{},ages:[]})} : data;
    const title=node('member-demographic-local-title');if(title)title.textContent=`👥 조합원 구성 (${isHwaseong?'화성':'용인'})`;
    otherModelScope=otherScope();
    const otherButton=node('member-other-members-open');if(otherButton)otherButton.hidden=true;
    node('member-demographic-select-yongin')?.setAttribute('aria-label',`${isHwaseong?'화성':'용인'} 지역별 구성 보기`);
    for (const scope of options.regionsEnabled === false ? [] : Object.keys(labels)) {
      const order=scope==='yongin'&&isHwaseong?hwaseongLabels:labels[scope];
      const rows = [...(model[scope] || [])].filter(row => count(row.count)>0||(scope==='yongin'&&isHwaseong)).sort((a,b) => order.indexOf(a.label)-order.indexOf(b.label));
      const select = node(`member-demographic-select-${scope}`);
      select.innerHTML = '<option value="">지역별 구성 보기</option>' + rows.map(row => `<option value="${escape(row.label)}">${escape(row.label)} · ${count(row.count).toLocaleString()}명</option>`).join('');
      select.disabled = rows.length===0;
      select.onchange = () => select.value ? openRegion(scope,select.value) : closeDetail();
      options.renderChart(scope==='yongin'?'location':'locationGyeonggi',scope==='yongin'?'chart-location':'chart-location-gyeonggi','doughnut',{
        labels:rows.map(row=>row.label),datasets:[{data:rows.map(row=>count(row.count)),backgroundColor:rows.map(row=>colors[row.label]||'#adb5bd')}]
      });
      node(`member-demographic-status-${scope}`).textContent = rows.length ? '지역을 클릭하거나 아래에서 선택해 자세히 보세요.' : '현재 정조합원이 없습니다.';
    }
    const ages = data.age_groups || [];
    options.renderChart('age','chart-age','bar',{labels:ages.map(age=>age.label),datasets:[{label:'개인 조합원 수',data:ages.map(age=>count(age.count)),backgroundColor:'#ffc107'}]});
    node('member-demographic-age-status').textContent = `개인 정조합원 ${count(data.individual_count).toLocaleString()}명 기준 · 막대에 마우스를 올리거나 터치하면 성별 구성도 보여요.`;
  }
  function statisticsScope(options) {
    const c=(options?.statisticsContext||options?.otherListContext)?.()||{};
    return options?.enabled&&c.allowed&&c.active&&c.auth&&c.coop&&!global.frameElement?.hidden?JSON.stringify([c.auth,c.coop,options.cacheKey||'',options.regionsEnabled!==false]):'';
  }
  function cancelStatisticsRead() {
    ++sequence;const old=statisticsRead;statisticsRead=null;
    old?.controller.abort();old?.cancel?.();
  }
  function syncStatisticsRecovery(state='') {
    const panel=node('member-demographic-recovery'),status=node('member-demographic-recovery-status'),button=node('member-demographic-retry');
    if(!panel||!status||!button)return;
    panel.hidden=!statisticsRecovery;
    const busy=state==='loading';
    status.textContent=busy?'구성 통계를 다시 확인하고 있습니다…':state==='ready'?'구성 통계를 확인했습니다.':statisticsRecovery?.message||'';
    button.hidden=statisticsRecovery?.denied===true;
    button.setAttribute('aria-disabled',String(busy));button.setAttribute('aria-busy',String(busy));
    button.textContent=busy?'확인 중…':'구성 다시 확인';
  }
  function retryStatistics() {
    if(!otherOptions||!statisticsScope(otherOptions)||statisticsRecovery?.denied)return Promise.resolve(null);
    return load(otherOptions);
  }
  async function load(options) {
    const key=statisticsScope(options);
    if(statisticsRead?.key===key&&key&&statisticsRead.client===options.client)return statisticsRead.promise;
    const focus=otherFocusReturn,c=options.otherListContext?.()||{};
    const keepFocus=!!focus&&focus.phase==='awaiting-load'&&focus.owner===otherScope()&&c.allowed&&c.active&&focus.owner===JSON.stringify([c.auth,c.coop]);
    if(keepFocus)focus.phase='reading';
    cancelStatisticsRead();
    pauseOtherList(true,true,keepFocus,true);otherOptions=options;if(node('member-other-members-open'))node('member-other-members-open').hidden=true;
    const seq = ++sequence;
    closeDetail(keepFocus);
    model=null;
    const title=node('member-demographic-local-title');if(title)title.textContent='👥 조합원 구성';
    options.clearCharts?.();
    for (const scope of Object.keys(labels)) {
      const select=node(`member-demographic-select-${scope}`);
      if (select) { select.disabled=true; select.innerHTML='<option value="">지역별 구성 보기</option>'; }
      const status=node(`member-demographic-status-${scope}`);
      if (status) status.textContent='구성을 확인하고 있습니다…';
    }
    if(statisticsRecovery?.key!==key)statisticsRecovery=null;
    syncStatisticsRecovery('loading');
    if (!key) {if(keepFocus)otherFocusReturn=null;syncStatisticsRecovery();return null;}
    const job={key,client:options.client,controller:new AbortController(),cancel:null,promise:null};statisticsRead=job;
    const current=()=>statisticsRead===job&&seq===sequence&&statisticsScope(options)===key;
    job.promise=(async()=>{let timer;try {
      let request=options.client.rpc('get_member_demographic_statistics');
      if(typeof request.abortSignal==='function')request=request.abortSignal(job.controller.signal);
      const {data,error,status}=await Promise.race([request,new Promise((_,reject)=>{
        job.cancel=()=>reject(Error('DEMOGRAPHICS_CANCELLED'));
        timer=setTimeout(()=>{job.controller.abort();reject(Error('DEMOGRAPHICS_TIMEOUT'));},15000);
      })]);
      if(!current())return null;
      if(error)throw Object.assign(new Error('DEMOGRAPHICS_UNAVAILABLE'),{code:error.code,status:error.status||status});
      if(!data||!Array.isArray(data.age_groups)||(data.coop_id&&data.coop_id!==c.coop))throw Error('DEMOGRAPHICS_UNAVAILABLE');
      draw(data,options);syncStatisticsRecovery('ready');
      return data;
    } catch (error) {
      if (!current()) return null;
      model=null;
      const denied=error.code==='42501'||[401,403].includes(error.status),limited=error.status===429||error.code==='429';
      const message=denied?'현재 권한으로 구성 통계를 조회할 수 없습니다.':limited?'조회 요청이 많습니다. 잠시 후 다시 확인해 주세요.':error.message==='DEMOGRAPHICS_TIMEOUT'?'구성 통계 조회가 지연되고 있습니다. 다시 확인해 주세요.':'구성 통계를 불러오지 못했습니다. 다시 확인해 주세요.';
      statisticsRecovery={key,denied,message};syncStatisticsRecovery();
      for (const scope of Object.keys(labels)) {
        node(`member-demographic-select-${scope}`).disabled=true;
        node(`member-demographic-status-${scope}`).textContent=message;
      }
      node('member-demographic-age-status').textContent='연령·성별 통계를 확인하지 못했습니다. 다시 조회해 주세요.';
      options.clearCharts?.();
      return null;
    } finally {
      clearTimeout(timer);job.cancel=null;
      if(statisticsRead===job)statisticsRead=null;
      if(keepFocus&&seq===sequence&&statisticsScope(options)===key)global.requestAnimationFrame(()=>restoreOtherFocusReturn(focus));
    }})();return job.promise;
  }
  global.MemberDemographics=Object.freeze({load,retryStatistics,openRegion,closeDetail,ageTooltip,openOtherList,loadOtherList,closeOtherList,pauseOtherList,deferDashboardRefresh});
})(window);
