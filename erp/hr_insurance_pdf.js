/* Official PDF overlay only; original page size, instructions and grids retained. Version 1.0.1 */
'use strict';
((root)=>{
 const assets={acquisition:'acquisition-20251201.pdf',loss:'loss-20221026.pdf',separation:'separation-20250701.pdf'};
 const date=v=>String(v||'').replace(/-/g,'.');
 const money=v=>Number(v||0).toLocaleString('ko-KR');
 const addDay=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.toISOString().slice(0,10);};
 function validate(p){const d=p.case.form_data,e=p.employee;
  if(!/^\d{11}$/.test(String(d.management_no||'').replace(/-/g,'')))throw new Error('사업장관리번호 11자리를 확인해 주세요.');
  if(!d.company_name||!d.company_address||!d.employer||!d.print_date)throw new Error('사업장 명칭·주소·신고인·작성일을 입력해 주세요.');
  if(!/^\d{13}$/.test(String(p.rrn||'').replace(/\D/g,'')))throw new Error('직원 정보에 주민등록번호가 없습니다. 출력용 번호를 입력하거나 직원 정보를 보완해 주세요.');
  if(p.case.kind!=='acquisition'&&(!e.resign_date||e.resign_date!==p.case.event_date))throw new Error('퇴사 처리 정보를 다시 확인해 주세요.');
  if(p.case.kind!=='separation'&&!['pension','health','employment','accident'].some(k=>d[k]))throw new Error('신고할 보험을 선택해 주세요.');
  if(p.case.kind==='acquisition'){
   if(Number(d.monthly_income)<=0)throw new Error('신고 월 소득·보수액을 확인해 주세요.');
   if(d.pension&&!d.pension_code||d.health&&!d.health_code||d.employment&&(!d.occupation_code||Number(d.hours_week)<=0))throw new Error('선택한 보험의 취득·직종 부호와 근로시간을 입력해 주세요.');
   if(d.contract_fixed&&!d.contract_end)throw new Error('계약 종료 예정일을 입력해 주세요.');
  }else{
   if(!/^(11|12|22|23|26|31|32|41|42)$/.test(d.loss_code||'')||String(d.loss_reason||'').length<10)throw new Error('이직사유 코드와 10자 이상의 실제 퇴사 사유를 입력해 주세요.');
   if(p.case.kind==='loss'&&(d.pension&&!d.pension_loss_code||d.health&&!d.health_loss_code))throw new Error('선택한 보험의 상실 부호를 입력해 주세요.');
   if(p.case.kind==='separation'){
    if(!d.periods?.length||!d.wages?.length)throw new Error('피보험 단위기간과 임금 산정기간을 입력해 주세요.');
    if(Number(d.daily_hours)<1||Number(d.daily_hours)>8)throw new Error('1일 소정 근로시간은 1~8을 입력해 주세요.');
    for(const rows of [d.periods,d.wages])for(let i=0;i<rows.length;i++){
     const r=rows[i];if(!r.from||!r.to||r.from>r.to||r.from<e.hire_date||r.to>e.resign_date||Number(r.days)<0||!Number.isInteger(Number(r.days)))throw new Error('기간·일수는 실제 재직 기간 안에서 확인해 주세요.');
     const calendar=(Date.parse(r.to)-Date.parse(r.from))/86400000+1;if(Number(r.days)>calendar)throw new Error('기초일수·계산일수가 기간의 달력 일수보다 많습니다.');
     if(i&&r.to>=rows[i-1].from)throw new Error('기간을 최신 순으로 입력하고 서로 겹치지 않게 해 주세요.');
    }
    if(d.wages.reduce((n,r)=>n+Number(r.days),0)<=0)throw new Error('임금 계산기간 일수를 입력해 주세요.');
    const cutoff=new Date(e.resign_date+'T00:00:00Z');cutoff.setUTCMonth(cutoff.getUTCMonth()-3);if(Date.parse(e.hire_date)>cutoff.getTime()&&Number(d.ordinary_daily)<=0)throw new Error('근무 3개월 미만이면 1일 통상임금도 입력해 주세요.');
   }
  }
 }
 async function create(p){validate(p);const {PDFDocument,rgb}=root.PDFLib;if(!PDFDocument||!root.fontkit)throw new Error('PDF 도구를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.');
  const load=async file=>{const r=await fetch('assets/hr-forms/'+file);if(!r.ok)throw new Error('공식 서식 파일을 불러오지 못했습니다.');return r.arrayBuffer();};
  const [original,fontBytes]=await Promise.all([load(assets[p.case.kind]),load('NanumGothic-Regular.ttf')]);
  // Isolate each original page's clipping/graphics state in a vector Form XObject.
  // Some official originals leave nested clipping active; appended labels would disappear.
  const source=await PDFDocument.load(original),doc=await PDFDocument.create();
  const embedded=await doc.embedPages(source.getPages());for(const originalPage of embedded){const pg=doc.addPage([originalPage.width,originalPage.height]);pg.drawPage(originalPage);pg.pushOperators(root.PDFLib.setTextRenderingMode(0));}
  doc.registerFontkit(root.fontkit);const font=await doc.embedFont(fontBytes,{subset:false});const numberFont=await doc.embedFont(root.PDFLib.StandardFonts.Helvetica);const page=doc.getPages()[0],height=page.getHeight(),d=p.case.form_data,e=p.employee;
  // Top-left points. A bounded box either fits completely or aborts; never silently clip.
  function box(text,x,top,w,h,size=8.5,align='left'){
   const s=String(text??'').trim();if(!s)return;const face=/^[\x20-\x7e\n]+$/.test(s)?numberFont:font;const lineHeight=size*1.15;const lines=[];let line='';
   for(const ch of s){if(ch==='\n'||face.widthOfTextAtSize(line+ch,size)>w-4){if(line)lines.push(line);line=ch==='\n'?'':ch;}else line+=ch;}if(line)lines.push(line);
   if(lines.length*lineHeight>h){const error=new Error('일부 입력 문구가 공식 서식 칸보다 깁니다. 사업장명·주소·사유를 간결하게 정리해 주세요.');error.layout={x,top,w,h,lines:lines.length};throw error;}
   let y=height-top-(h-lines.length*lineHeight)/2-size;
   for(const text of lines){const offset=align==='center'?(w-face.widthOfTextAtSize(text,size))/2:align==='right'?w-face.widthOfTextAtSize(text,size)-2:2;page.drawText(text,{x:x+offset,y,size,font:face,color:rgb(0,0,0)});y-=lineHeight;}
  }
  const mark=(yes,x,top)=>{if(yes)page.drawText('V',{x,y:height-top-9,size:9,font:numberFont,color:rgb(0,0,0)});};
  const rrn=String(p.rrn).replace(/\D/g,'').replace(/^(\d{6})(\d{7})$/,'$1-$2');
  const printed=(positions,top)=>{d.print_date.split('-').forEach((s,i)=>box(String(Number(s)),positions[i],top,i===0?34:24,12,9,'center'));};
  if(p.case.kind==='acquisition'){
   mark(d.pension,164,76);mark(d.health,518,76);mark(d.employment,164,95);mark(d.accident,518,95);
   box(d.management_no,120,171,202,12,9);box(d.company_name,327,171,150,12,8);box(d.unit_name,484,171,136,12,8);box(d.branch_name,624,171,157,12,8);
   box(d.company_address,154,186,490,18,9);box(d.postal,695,195,80,11,8);box(d.company_phone,183,210,290,20,9);box(d.company_fax,535,210,245,20,9);
   box(d.agent_no,146,246,176,11,8);box(d.agent_name,356,246,121,11,8);box(d.subcontract_no,484,246,296,11,8);
   box('1',58,331,13,32,9,'center');box(e.name,74,327,80,20,9,'center');box(rrn,74,349,80,17,7.5,'center');box(d.nationality,158,327,23,20,7);box(d.visa,158,349,23,17,7);
   mark(d.representative,188,329);mark(!d.representative,188,350);box(money(d.monthly_income),232,329,91,37,9,'center');box(date(e.hire_date).replace(/\./g,'.\n'),327,329,44,37,8.5,'center');
   mark(d.pension,396,330);mark(d.pension_first_month,380,343);mark(d.health,469,330);mark(d.employment,620,330);mark(d.accident,623,343);mark(d.contract_fixed,708,330);mark(!d.contract_fixed,735,330);
   for(const [k,x,w] of [['pension_code',374,30],['pension_special',405,32],['pension_occupation',438,26],['health_code',466,39],['health_reduction',507,37],['public_account',545,33],['public_occupation',579,36],['occupation_code',617,35],['hours_week',653,24],['contract_end',678,45],['charge_code',724,37],['charge_reason',763,19]])box(k==='contract_end'?date(d[k]).slice(0,7):d[k],x,356,w,12,8,'center');
   box(d.employer,320,525,126,14,9);printed([660,712,755],511);
  }else if(p.case.kind==='loss'){
   mark(d.pension,176,82);mark(d.health,523,82);mark(d.employment,176,101);mark(d.accident,523,101);
   box(d.management_no,140,186,158,11,9);box(d.company_name,302,186,158,11,8);box(d.company_phone,464,186,155,11,9);box(d.company_fax,624,186,155,11,9);
   box(d.company_address,173,202,475,18,9);box(d.postal,697,210,79,11,8);box(d.agent_name,174,237,124,11,8);box(d.agent_no,331,237,127,11,8);box(d.subcontract_no,464,237,313,11,8);
   box('1',58,331,20,33,9,'center');box(e.name,81,331,34,33,8,'center');box(rrn,117,331,84,33,7.5,'center');box(e.phone,204,331,62,33,7.5,'center');box(date(addDay(e.resign_date)).replace(/\./g,'.\n'),270,331,57,33,8,'center');
   box(d.pension_loss_code,329,331,30,33,9,'center');mark(d.pension_last_month,374,350);box(d.health_loss_code,402,331,29,33,9,'center');
   for(const [k,x,w] of [['health_salary',433,53],['health_months',487,29],['previous_salary',518,52],['previous_months',572,29],['loss_reason',603,64],['loss_code',669,25]])box(k.includes('salary')?money(d[k]):d[k],x,332,w,31,k==='loss_reason'?7:8,'center');
   box(money(d.employment_salary),695,331,43,16,7,'right');box(money(d.accident_salary),695,349,43,15,7,'right');box(money(d.previous_employment_salary),740,331,42,16,7,'right');box(money(d.previous_accident_salary),740,349,42,15,7,'right');
   mark(d.employment,637,254);mark(d.accident,698,254);box(d.employer,357,513,97,12,9);printed([657,711,753],494);
  }else{
   box(d.management_no,218,137,316,15,9);box(d.company_name,198,156,126,14,8);box(d.company_phone,412,156,122,14,9);box(d.company_address,198,174,336,15,8.5);box(d.subcontract_no,413,193,121,21,8);
   box(e.name,200,222,125,23,10);box(e.phone,413,222,121,23,9);box(rrn.slice(0,6),216,249,119,15,10,'center');box(rrn.slice(7),394,249,133,15,10,'center');box(e.address,199,268,334,15,8.5);
   box(date(e.hire_date),265,287,63,22,8,'center');box(date(e.resign_date),463,287,70,22,8,'center');box(d.loss_code,198,330,62,12,9,'center');box(d.loss_reason,267,324,267,18,8.5);
   (d.periods||[]).forEach((r,i)=>{const top=371+i*16.1;box(date(r.from),59,top,56,14,7.5,'center');box(date(r.to),124,top,55,14,7.5,'center');box(r.days,182,top,58,14,9,'center');});
   box(d.periods.reduce((n,r)=>n+Number(r.days),0),190,565,36,13,9,'right');
   let sumDays=0,sumBasic=0,sumOther=0;(d.wages||[]).forEach((r,i)=>{const x=325+i*42.7;const compact=v=>date(v).replace(/^(\d{4})\./,'$1\n');box(compact(r.from),x,371,18,13,5.2,'center');box(compact(r.to),x,387,18,13,5.2,'center');box(r.days,x,412,26,12,8,'right');box(String(Number(r.basic||0)),x,439,26,12,5.5,'right');box(String(Number(r.other||0)),x,464,26,12,5.5,'right');sumDays+=Number(r.days);sumBasic+=Number(r.basic);sumOther+=Number(r.other);});
   box(sumDays,491,410,34,16,9,'right');box(money(sumBasic),490,438,36,14,7,'right');box(money(sumOther),490,463,36,14,7,'right');box(money(d.bonus),480,490,46,14,8,'right');box(money(d.leave_pay),480,514,46,14,8,'right');
   if(Number(d.ordinary_daily)>0)box(money(d.ordinary_daily),480,539,46,14,8,'right');if(Number(d.base_daily)>0)box(money(d.base_daily),480,563,46,14,8,'right');
   const hours=Number(d.daily_hours);mark(true,hours<=4?[251,326,376,427][hours-1]:[251,301,351,401][hours-5],hours<=4?586:602);
   if(Number(d.short_days)>0)box(d.short_days,490,627,36,12,8,'center');box(d.extend_code,290,648,245,12,9);if(d.extend_from)box(date(d.extend_from)+' ~ '+date(d.extend_to),290,669,245,12,9);
   printed([434,474,507],723);mark(true,286,738);box(d.company_name,374,737,158,14,8);
  }
  if(p.test){for(const pg of doc.getPages())pg.drawText('시험용 · 기관 제출 금지',{x:58,y:pg.getHeight()-35,size:11,font,color:rgb(.8,0,0)});}
  doc.setTitle((p.test?'시험용 ':'')+(p.case.kind==='separation'?'이직확인서':p.case.kind==='loss'?'자격상실 신고서':'자격취득 신고서'));doc.setAuthor(d.company_name);doc.setCreator('협동조합 운영시스템');doc.setSubject('공식 서식 원본에 입력값을 채운 출력본 · 기관 제출 별도');
  return doc.save();
 }
 root.HrInsurancePdf={create,validate,version:'1.0.1'};
})(typeof window!=='undefined'?window:globalThis);
