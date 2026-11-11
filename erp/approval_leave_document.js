/* v1.0.0 — Read-only leave dates, duration and compact month calendars. */
(function(root){
 'use strict';
 const weekdays=['일','월','화','수','목','금','토'];
 function date(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const d=new Date(value+'T00:00:00Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value?d:null;
 }
 function minutes(item){
  for(const [key,multiplier] of [['deducted_minutes',1],['deducted_hours',60],['deducted_days',480]]){
   if(item?.[key]===null||item?.[key]===undefined||item[key]==='')continue;
   const value=Number(item[key])*multiplier;
   if(Number.isFinite(value)&&value>=0&&Number.isSafeInteger(Math.round(value)))return Math.round(value);
  }
  return null;
 }
 function duration(value){
  if(!Number.isSafeInteger(value)||value<0)return '';
  const time=n=>[Math.floor(n/60)?`${Math.floor(n/60)}시간`:'',n%60?`${n%60}분`:''].filter(Boolean).join(' ')||'0시간';
  return value<=480?time(value):`${Math.floor(value/480)}일${value%480?' '+time(value%480):''}`;
 }
 function label(item){return String(item?.slot_label||({am:'오전',pm:'오후',hour:'시간차',full:'전일'})[item?.slot]||'휴가').trim();}
 function detailText(items){
  return (Array.isArray(items)?items:[]).map(item=>{
   const iso=String(item?.leave_date||''),d=date(iso),when=d?`${iso.replaceAll('-','.')}(${weekdays[d.getUTCDay()]})`:iso;
   const timed=item?.slot==='hour'&&item.time_input_mode!=='hours';
   const times=timed&&/^\d{2}:\d{2}$/.test(item.start_time||'')&&/^\d{2}:\d{2}$/.test(item.end_time||'')?`${item.start_time}~${item.end_time}`:'';
   const parts=[times,duration(minutes(item))].filter(Boolean).join(' / ');
   return `- ${when} ${label(item)}${parts?' ('+parts+')':''}`;
  }).join('\n');
 }
 function snapshot(doc){
  if(!/^휴가(?:\(|$)/.test(String(doc?.doc_type||'')))return null;
  let value=doc?.leave_snapshot;
  if(typeof value==='string'){try{value=JSON.parse(value);}catch(_){return null;}}
  if(!value||Array.isArray(value)||!Array.isArray(value.items)||!value.items.length||value.items.length>200)return null;
  if(value.items.some(item=>!date(item?.leave_date)))return null;
  return value.items;
 }
 function calendar(doc,document=root.document){
  const items=snapshot(doc);if(!items)return null;
  const selected=new Map(),months=new Set();
  for(const item of items){
   const iso=item.leave_date;months.add(iso.slice(0,7));
   const list=selected.get(iso)||[];list.push(item);selected.set(iso,list);
  }
  if(months.size>12)return null;
  const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
  const wrapper=make('section','approval-leave-calendar');wrapper.setAttribute('aria-label','휴가 신청일 달력');
  for(const month of [...months].sort()){
   const first=date(month+'-01'),year=first.getUTCFullYear(),number=first.getUTCMonth()+1;
   const count=new Date(first.getTime());count.setUTCMonth(count.getUTCMonth()+1);count.setUTCDate(0);
   const table=make('table','approval-leave-month');table.dataset.month=month;
   table.append(make('caption','',`${year}년 ${number}월`));
   const head=make('thead'),heading=make('tr');
   weekdays.forEach((text,i)=>{const cell=make('th',i===0?'leave-sunday':i===6?'leave-saturday':'',text);cell.scope='col';heading.append(cell);});
   head.append(heading);table.append(head);const body=make('tbody');
   const slots=Math.ceil((first.getUTCDay()+count.getUTCDate())/7)*7;
   for(let i=0;i<slots;i+=7){
    const row=make('tr');
    for(let j=0;j<7;j++){
     const day=i+j-first.getUTCDay()+1,cell=make('td',j===0?'leave-sunday':j===6?'leave-saturday':'');
     if(day>=1&&day<=count.getUTCDate()){
      const iso=month+'-'+String(day).padStart(2,'0'),entries=selected.get(iso);
      const tile=make('span','approval-leave-date',String(day));cell.dataset.date=iso;
      if(entries){
       cell.classList.add('leave-selected');
       const labels=[...new Set(entries.map(label))],half=labels.length===1&&/^(오전|오후)( 반차)?$/.test(labels[0])?labels[0].slice(0,2):'';
       if(half)tile.append(make('small','',half));
       cell.setAttribute('aria-label',`${iso} ${labels.join('·')}`);cell.title=detailText(entries).replace(/^- /gm,'');
      }
      cell.append(tile);
     }else cell.setAttribute('aria-hidden','true');
     row.append(cell);
    }
    body.append(row);
   }
   table.append(body);wrapper.append(table);
  }
  return wrapper;
 }
 function append(container,doc){
  if(!container)return;
  for(const child of [...container.children])if(child.classList.contains('approval-leave-calendar'))child.remove();
  const view=calendar(doc,container.ownerDocument);container.classList.toggle('approval-leave-document',!!view);
  if(view)container.append(view);
 }
 root.CoopApprovalLeaveDocument=Object.freeze({detailText,duration,calendar,append,version:'1.0.0'});
})(window);
