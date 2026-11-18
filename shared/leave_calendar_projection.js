/* v1.2.0 — 휴가·출장의 일정 표시와 승인 상태를 전사 일정·구독에서 공유한다. */
(function (root) {
    'use strict';
    const pending=Object.freeze(['진행중','가승인','증빙확인중','실물결재대기']);
    const final=Object.freeze(['완료','실물결재완료']);
    const statuses=Object.freeze([...pending,...final]);
    const columns='id,coop_id,doc_type,status,title,content,drafter_id,drafter_name,created_at,processed_at,leave_snapshot,related_doc_id';
    const tripColumns='id,coop_id,doc_type,status,drafter_id,drafter_name,business_trip_snapshot,related_doc_id';
    const workSettingKeys=Object.freeze(['work_start_time','work_end_time','work_lunch_start_time','work_lunch_end_time']);
    const yongin='a4e65bb0-aa8e-4cef-a895-cd7865a67fef';
    const text=v=>String(v??'').trim();
    const clean=v=>text(v).replace(/\s+/g,' ').slice(0,100);
    const snapshotOf=doc=>{
        let s=doc?.leave_snapshot;
        if(typeof s==='string'){try{s=JSON.parse(s);}catch(_){s=null;}}
        return s && typeof s==='object' && !Array.isArray(s)?s:{};
    };
    function date(value) {
        const m=text(value).match(/^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})\.?$/);
        if(!m)return '';
        const s=[m[1],m[2].padStart(2,'0'),m[3].padStart(2,'0')].join('-'), d=new Date(s+'T00:00:00Z');
        return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s?s:'';
    }
    const tomorrow=value=>{
        const iso=date(value);if(!iso)return '';
        const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);
    };
    const clock=value=>text(value).match(/^((?:[01]\d|2[0-3]):[0-5]\d)(?::00)?$/)?.[1]||'';
    const timeNumber=value=>{const t=clock(value);return t?Number(t.slice(0,2))*60+Number(t.slice(3)):null;};
    const timeLabel=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
    function halfDayTimes(coop,part,settings) {
        if(text(coop)===yongin){
            if(part==='am')return ['08:30','12:30'];
            if(part==='pm')return ['13:30','17:30'];
        }
        const [a,b,l,r]=workSettingKeys.map(key=>timeNumber(settings?.[key]));
        if([a,b,l,r].some(v=>v==null)||!(a<=l&&l<r&&r<=b))return null;
        const half=(b-a-(r-l))/2;
        if(!Number.isInteger(half)||half<=0)return null;
        const before=l-a, boundary=a+half+(half>=before?r-l:0);
        const [from,to]=part==='am'?[a,half===before?l:boundary]:[boundary,b];
        if(to<=from||from%30||to%30)return null;
        return [timeLabel(from),timeLabel(to)];
    }
    const docType=/^휴가\s*(?:\(([^()]+)\))?$/;
    const cancelType=/^(?:휴가\s*취소|취소\s*휴가)\s*(?:\([^()]+\))?$/;
    const id=value=>/^[1-9][0-9]{0,18}$/.test(text(value))?text(value):'';
    const personKey=doc=>text(doc.coop_id)+'|'+text(doc.drafter_id);
    function legacy(doc,snapshot,kind) {
        const tail=text(doc.title).match(/\(([^()]+)\)\s*$/)?.[1]||'';
        const label=String(doc.content||'').match(/(?:^|\n)\s*휴가일\s*[:：]\s*([^\n]+)/)?.[1]||tail;
        const range=text(label).match(/(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2})\s*(?:[~～–]\s*(\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}))?/);
        const leave_date=date(snapshot.start_date||snapshot.leave_date||doc.start_date)||date(range?.[1]);
        if(!leave_date)return [];
        const end_date=date(snapshot.end_date)||date(range?.[2])||leave_date;
        if(end_date<leave_date)return [];
        const part=text(label).match(/오전|오후/)?.[0]||'';
        const half=snapshot.duration_mode==='half_day'||/반차|half_day/i.test(kind)||!!part;
        const hour=/시간차|hour/i.test(kind)||snapshot.duration_mode==='hour';
        const times=(half||hour)&&end_date===leave_date?text(label).match(/(\d{2}:\d{2})\s*[~～–]\s*(\d{2}:\d{2})/):null;
        return [{leave_date,end_date,slot:hour?'hour':half?(part==='오전'?'am':part==='오후'?'pm':'half'):'full',
            start_time:snapshot.start_time||times?.[1],end_time:snapshot.end_time||times?.[2]}];
    }
    function eventsForDoc(doc, employeeName='', workSettings=null) {
        const idValue=id(doc?.id), match=docType.exec(text(doc?.doc_type)), state=text(doc?.status);
        if(!idValue||!match||!statuses.includes(state))return [];
        const snapshot=snapshotOf(doc),kind=clean(snapshot.label||match[1]),name=clean(employeeName||doc.drafter_name)||'직원';
        const planned=pending.includes(state),raw=Array.isArray(snapshot.items)&&snapshot.items.length?snapshot.items:legacy(doc,snapshot,kind);
        const seen=new Set(), events=[];
        for(const item of raw){
            const iso=date(item?.leave_date||item?.date||item?.start_date);
            if(!iso)continue;
            const rawSlot=text(item.slot||item.slot_label).toLowerCase();
            const slot=({am:'am',pm:'pm',half:'half',hour:'hour',full:'full','오전':'am','오후':'pm','오전반차':'am','오후반차':'pm',
                '오전 반차':'am','오후 반차':'pm','반차':'half','시간차':'hour','전일':'full','종일':'full'})[rawSlot]||(!rawSlot?'full':'');
            if(!slot)continue;
            const endIso=date(item.end_date)||iso;
            if(endIso<iso)continue;
            const half=slot==='am'||slot==='pm'?slot:(slot==='hour'||slot==='half')
                ? ({오전:'am',오후:'pm'})[text(item.slot_label).match(/^(오전|오후)\s*반차$/)?.[1]]||'':'';
            const part=half==='am'?'오전 반차':half==='pm'?'오후 반차':slot==='half'?'반차':'';
            let startTime=clock(item.start_time),endTime=clock(item.end_time);
            const recorded=slot!=='full'&&item.time_input_mode!=='hours'&&!!startTime&&!!endTime&&(endIso>iso||endTime>startTime);
            // Keep the pre-projection identity/ordering even when a previously untimed item gets a range.
            const key=[iso,endIso,slot,recorded?startTime:'',recorded?endTime:''].join('|');
            if(seen.has(key))continue;seen.add(key);
            let timed=recorded;
            if(!timed&&half&&endIso===iso&&(!text(item.start_time)||startTime)&&(!text(item.end_time)||endTime)){
                const stated=raw.length===1?legacy(doc,snapshot,kind)[0]:null;
                const statedStart=clock(stated?.start_time),statedEnd=clock(stated?.end_time);
                const inferred=stated?.slot===half&&stated.leave_date===iso&&stated.end_date===iso&&statedEnd>statedStart&&statedStart
                    ? [statedStart,statedEnd] : halfDayTimes(doc.coop_id,half,workSettings);
                if(inferred&&(!startTime||startTime===inferred[0])&&(!endTime||endTime===inferred[1])){
                    [startTime,endTime]=inferred;timed=true;
                }
            }
            const label=part|| (slot==='hour'?'시간차':planned||!kind||/^(연차|annual)$/i.test(kind)?'휴가':kind);
            const range=timed?`${startTime}~${endIso===iso?'':endIso+' '}${endTime}`:'';
            const noTime=!timed&&slot!=='full';
            const displayTitle=`${name} ${label}${planned?'(예정)':''}${noTime?' · 시각 미등록':''}`;
            const title=displayTitle+(range?' · '+range:'');
            const localStart=timed?`${iso}T${startTime}:00`:iso;
            const localEnd=timed?`${endIso}T${endTime}:00`:tomorrow(endIso);
            const ordinal=events.length+1;
            events.push({
                uid:`leave-${idValue}${ordinal===1?'':'-part-'+ordinal}`,
                title,displayTitle,allDay:!timed,planned,slot,
                start:timed?localStart+'+09:00':localStart,end:timed?localEnd+'+09:00':localEnd,localStart,localEnd,
                firstDate:iso,lastDate:endIso, updatedAt:doc.processed_at||doc.created_at||null,
                state,description:`${planned?'결재 전 · 예정':'확정'}\n${iso}${endIso===iso?'':' ~ '+endIso}${range?' · '+range:noTime?' · 시각 미등록':''}`,
            });
        }
        return events;
    }
    function project(docs, employees=[], coop='', workSettings=null) {
        const rows=(Array.isArray(docs)?docs:[]).filter(d=>!coop||text(d?.coop_id)===text(coop));
        const names=new Map();
        for(const e of employees||[])if(text(e?.emp_id)&&clean(e?.emp_name)&&(!e.coop_id||!coop||text(e.coop_id)===text(coop)))
            names.set(text(e.emp_id),clean(e.emp_name));
        const canceled=new Set(rows.filter(d=>cancelType.test(text(d.doc_type))&&final.includes(text(d.status))&&text(d.drafter_id))
            .map(d=>id(d.related_doc_id)+'|'+personKey(d)));
        const seen=new Set(), result=[];
        for(const d of rows){
            const docId=id(d.id);
            if(!docId||seen.has(docId)||canceled.has(docId+'|'+personKey(d))||!docType.test(text(d.doc_type)))continue;
            seen.add(docId);
            for(const event of eventsForDoc(d,names.get(text(d.drafter_id)),coop?workSettings:null))result.push({...event,employeeKey:text(d.drafter_id)});
        }
        return result;
    }
    function tripSnapshot(doc){
        let v=doc?.business_trip_snapshot;
        if(typeof v==='string'){try{v=JSON.parse(v);}catch(_){return null;}}
        return v&&typeof v==='object'&&!Array.isArray(v)?v:null;
    }
    function tripInstant(value){
        const m=text(value).match(/^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d(?:\.\d{1,6})?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/);
        if(!m||!date(m[1]))return null;
        // 결재의 출장 날짜·시각 생성기는 한국 시각을 시차 기호 없이 저장한다.
        const normalized=m[0]+(m[3]?'':'+09:00'),ms=Date.parse(normalized);
        return Number.isFinite(ms)?{ms,local:new Date(ms+9*3600000).toISOString().slice(0,19),value:normalized}:null;
    }
    function projectBusinessTrips(docs,coop){
        if(!coop)return [];
        const rows=(Array.isArray(docs)?docs:[]).filter(row=>text(row?.coop_id)===text(coop));
        const canceled=new Set(rows.filter(d=>text(d.doc_type)==='출장취소'&&final.includes(text(d.status))&&text(d.drafter_id))
            .map(d=>id(d.related_doc_id)+'|'+personKey(d)));
        const out=[],seen=new Set();
        for(const row of rows){
            const stableId=id(row.id),state=text(row.status);
            if(!stableId||seen.has(stableId)||text(row.doc_type)!=='출장신청'||!statuses.includes(state)||canceled.has(stableId+'|'+personKey(row)))continue;
            const s=tripSnapshot(row);
            if(!s)continue;
            const startDate=date(s.start_date),endDate=date(s.end_date);
            const allDay=s.calendar_all_day===true||s.calendar_all_day==='true'||!!(s.period_label&&startDate&&endDate&&startDate!==endDate);
            let first=startDate,last=endDate,start,end,localStart,localEnd;
            if(allDay){
                if(!startDate||!endDate||endDate<startDate)continue;
                start=localStart=startDate;end=localEnd=tomorrow(endDate);
            }else{
                const a=tripInstant(s.start_at),b=tripInstant(s.end_at);
                if(!a||!b||b.ms<=a.ms)continue;
                first=a.local.slice(0,10);last=b.local.slice(0,10);
                if((startDate&&startDate!==first)||(endDate&&endDate!==last))continue;
                start=a.value;end=b.value;localStart=a.local;localEnd=b.local;
            }
            const planned=pending.includes(state),name=clean(row.drafter_name)||'직원';
            const title=`${name} 출장${planned?'(예정)':''}`;
            const period=allDay?(first===last?first:`${first} ~ ${last}`):
                `${first} ${localStart.slice(11,16)} ~ ${first===last?'':last+' '}${localEnd.slice(11,16)}`;
            const location=planned?'':clean(s.location);
            seen.add(stableId);
            out.push({uid:`business-trip-${stableId}`,title,start,end,localStart,localEnd,firstDate:first,lastDate:last,allDay,planned,location,
                employeeKey:text(row.drafter_id),description:[planned?'결재 전 · 예정':'결재 완료 · 확정',period,location?'출장 장소: '+location:''].filter(Boolean).join('\n')});
        }
        return out;
    }
    async function loadRows(client, coop, trip=false) {
        if(!coop)return [];
        const result=[];let cursor='0';
        for(;;){
            let query=client.from('ref_approval').select(trip?tripColumns:columns).eq('coop_id',coop);
            query=trip?query.in('doc_type',['출장신청','출장취소']):query.or('doc_type.ilike.휴가%,doc_type.ilike.취소휴가%');
            const {data,error}=await query.in('status',statuses).gt('id',cursor).order('id',{ascending:true}).limit(200);
            if(error||!Array.isArray(data))throw Error('LEAVE_CALENDAR_SOURCE');
            if(data.some(row=>text(row.coop_id)!==text(coop)))throw Error('LEAVE_CALENDAR_SCOPE');
            result.push(...data);
            if(data.length<200)return result;
            const next=id(data.at(-1)?.id);
            if(!next||BigInt(next)<=BigInt(cursor))throw Error('LEAVE_CALENDAR_CURSOR');
            cursor=next;
        }
    }
    const load=(client,coop)=>loadRows(client,coop);
    const loadBusinessTrips=(client,coop)=>loadRows(client,coop,true);
    function fold(line) {
        let count=0,out='';
        for(const char of String(line||'')){
            const n=char.codePointAt(0), size=n<=0x7f?1:n<=0x7ff?2:n<=0xffff?3:4;
            if(count+size>75){out+='\r\n ';count=1;}
            out+=char;count+=size;
        }
        return out;
    }
    root.CoopLeaveCalendar=Object.freeze({statuses,project,eventsForDoc,load,projectBusinessTrips,loadBusinessTrips,fold,workSettingKeys,version:'1.2.0'});
})(globalThis);
