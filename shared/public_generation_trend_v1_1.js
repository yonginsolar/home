/* Twelve Seoul calendar months from already-public generation sources. */
(function(global){
  'use strict';
  const DAY_FORMAT=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
  const VALUE_FORMAT=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2});
  const AXIS_FORMAT=new Intl.NumberFormat('ko-KR',{notation:'compact',maximumFractionDigits:1});
  const DATE=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const PAGE_SIZE=500, MAX_PAGES=40;
  const logFields='id,generation_date,generated_kwh,plant:site_power_plants!site_power_generation_logs_plant_id_fkey!inner(coop_id,project_type,generation_calc_method,participation_share_percent,participation_capacity,capacity)';
  const number=value=>((typeof value==='string'&&value.trim()!=='')||typeof value==='number')
    && Number.isFinite(Number(value))&&Number(value)>=0 ? Number(value) : null;

  function period(now=new Date()){
    const today=DAY_FORMAT.format(now);
    const [year,month]=today.split('-').map(Number);
    const months=Array.from({length:12},(_,i)=>{
      const date=new Date(Date.UTC(year,month-12+i,1));
      return date.toISOString().slice(0,7);
    });
    return {today,months,first:months[0]+'-01'};
  }
  const monthLabel=month=>month.slice(0,4)+'년 '+Number(month.slice(5))+'월';

  function accountedKwh(row){
    const kwh=number(row.generated_kwh),plant=row.plant;
    if(kwh===null||!plant)return null;
    if(plant.project_type!=='participation'||plant.generation_calc_method==='direct_input')return kwh;
    if(plant.generation_calc_method==='share_percent') {
      const share=number(plant.participation_share_percent);
      return share!==null&&share<=100?kwh*share/100:null;
    }
    if(plant.generation_calc_method==='capacity_ratio'){
      const part=number(plant.participation_capacity),total=number(plant.capacity);
      return part>0&&total>0?kwh*part/total:null;
    }
    return null;
  }

  async function readLoggedMonths(client,coopId,window,signal){
    const totals=new Map();
    let cursor='';
    for(let page=0;page<MAX_PAGES;page++){
      if(signal.aborted)throw Error('GENERATION_TREND_CANCELLED');
      let query=client.from('site_power_generation_logs').select(logFields)
        .eq('coop_id',coopId).eq('plant.coop_id',coopId)
        .gte('generation_date',window.first).lte('generation_date',window.today)
        .order('id',{ascending:true}).limit(PAGE_SIZE);
      if(cursor)query=query.gt('id',cursor);
      const {data,error}=await query.abortSignal(signal);
      if(signal.aborted||error||!Array.isArray(data))throw Error('GENERATION_TREND_READ_FAILED');
      for(const row of data){
        if(!UUID.test(row?.id)||row.id<=cursor||row.plant?.coop_id!==coopId||
           !DATE.test(row.generation_date)||row.generation_date<window.first||row.generation_date>window.today){
          throw Error('GENERATION_TREND_SCOPE_MISMATCH');
        }
        cursor=row.id;
        const kwh=accountedKwh(row);
        if(kwh===null)continue;
        const key=row.generation_date.slice(0,7);
        totals.set(key,(totals.get(key)??0)+kwh);
      }
      if(data.length<PAGE_SIZE)return window.months.map(month=>({month,kwh:totals.get(month)??null}));
    }
    // Do not turn a bounded, incomplete read into a smaller-looking total.
    throw Error('GENERATION_TREND_PAGE_LIMIT');
  }

  function monitorMonths(plants,window,readCurrentMonth){
    const current=window.months.at(-1);
    const sources=plants.map(plant=>({
      current:number(readCurrentMonth(plant)),
      history:new Map((Array.isArray(plant.cumulative_generation)?plant.cumulative_generation:[])
        .filter(row=>DATE.test(row?.month)&&row.month.endsWith('-01'))
        .map(row=>[row.month.slice(0,7),number(row.kwh)]))
    }));
    return window.months.map(month=>{
      const known=sources.map(source=>month===current?source.current:source.history.get(month)).filter(value=>value!=null);
      return {month,kwh:known.length?known.reduce((sum,value)=>sum+value,0):null,partial:known.length>0&&known.length<sources.length};
    });
  }

  function create({host,client,getContext,read}){
    if(!host)return null;
    const chart=host.querySelector('[data-generation-chart]'),bars=host.querySelector('[data-generation-bars]');
    const axis=host.querySelector('[data-generation-axis]'),values=host.querySelector('[data-generation-values]');
    const details=host.querySelector('details'),message=host.querySelector('[data-generation-message]');
    const legend=host.querySelector('[data-generation-legend]'),range=host.querySelector('[data-generation-range]');
    if(!chart||!bars||!axis||!values||!details||!message||!legend||!range)return null;
    const doc=host.ownerDocument;
    const make=(tag,text,cls)=>{
      const node=doc.createElement(tag);
      if(text!==undefined)node.textContent=text;
      if(cls)node.className=cls;
      return node;
    };
    let inFlight=null,loaded=false;

    function render(rows,source){
      const hasData=rows.some(row=>row.kwh!==null);
      const current=rows.at(-1).month;
      host.hidden=false;
      range.textContent=monthLabel(rows[0].month)+' – '+monthLabel(current);
      chart.hidden=details.hidden=legend.hidden=!hasData;
      message.textContent=hasData?'':'아직 이 기간에 공개된 발전량 기록이 없어요.';
      bars.replaceChildren();
      axis.replaceChildren();
      values.replaceChildren();
      if(!hasData)return;
      const max=Math.max(1,...rows.map(row=>row.kwh??0));
      const step=10**Math.floor(Math.log10(max));
      const top=Math.ceil(max/step)*step;
      for(const tick of [top,top/2,0])axis.append(make('span',AXIS_FORMAT.format(tick)));
      const columns=doc.createDocumentFragment(),tableRows=doc.createDocumentFragment();
      for(const {month,kwh,partial} of rows){
        const bar=make('div',undefined,'generation-trend-column'),track=make('div',undefined,'generation-trend-track');
        const fill=make('span',undefined,'generation-trend-bar');
        if(kwh===null)fill.dataset.missing='true';
        else if(kwh===0)fill.dataset.zero='true';
        if(partial||month===current)fill.dataset.partial='true';
        fill.style.setProperty('--generation-level',String(100*(kwh??0)/top)+'%');
        const label=make('span',month.slice(5), 'generation-trend-month');
        const value=kwh===null?'기록 없음':VALUE_FORMAT.format(kwh)+' kWh';
        const note=[month===current?'진행 중':'',partial?'일부 자료':''].filter(Boolean).join(' · ');
        bar.title=monthLabel(month)+' · '+value+(note?' · '+note:'');
        track.append(fill);bar.append(track,label);columns.append(bar);
        const tr=make('tr'),th=make('th',monthLabel(month));
        th.scope='row';
        tr.append(th,make('td',value),make('td',note||'—'));tableRows.append(tr);
      }
      bars.append(columns);values.append(tableRows);
      legend.textContent='점선은 기록 없음, 줄무늬는 진행 중인 달 또는 일부 자료를 뜻해요. '+(source==='monitor'?'공개 모니터 기준':'공개 발전 기록 기준');
    }

    function refreshLogs(skipEmpty=false){
      if(inFlight)return inFlight;
      if(loaded)return Promise.resolve();
      host.hidden=false;
      message.textContent='월별 발전량을 불러오는 중입니다.';
      const window=period();
      const work=skipEmpty ? Promise.resolve(window.months.map(month=>({month,kwh:null}))) :
        read(async signal=>{
          const coopId=String((await getContext())?.coop_id||'');
          if(!UUID.test(coopId))throw Error('GENERATION_TREND_CONTEXT_UNAVAILABLE');
          return readLoggedMonths(client,coopId,window,signal);
        });
      inFlight=work.then(rows=>{render(rows,'logs');loaded=true;},()=>{
        message.textContent='월별 발전량을 불러오지 못했어요.';
      }).finally(()=>{inFlight=null;});
      return inFlight;
    }
    function renderMonitor(plants,now,readCurrentMonth){
      render(monitorMonths(plants,period(now),readCurrentMonth),'monitor');
    }
    function monitorIssue(retain){
      if(!retain){
        render(period().months.map(month=>({month,kwh:null})),'monitor');
        message.textContent='공개 월별 발전량을 확인하지 못했어요.';
      }else if(!chart.hidden){
        message.textContent='마지막으로 확인한 공개 월별 발전량입니다.';
      }
    }
    return Object.freeze({refreshLogs,renderMonitor,monitorIssue});
  }
  global.CoopPublicGenerationTrend=Object.freeze({create});
})(window);
