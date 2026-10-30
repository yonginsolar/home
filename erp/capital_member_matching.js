/* v1.0.0 — Same-cooperative capital target matching; original files and writers stay authoritative. */
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 function needed(kind,data){
  const rows=kind==='capital'?data:data?.payments||[];
  return rows.some(r=>!String(r.member_id||'').trim()||String(r.phone||'').trim())
   ||kind==='workbook'&&rows.length>0&&(data.members||[]).some(r=>!r.member_id&&r.phone);
 }
 function envelope(source,choices){return {source:clone(source),choices:clone(choices||{})};}
 function accept(choices,matches){
  const out=clone(choices||{});
  for(const [sheet,rows]of Object.entries(matches||{}))out[sheet]=rows.filter(r=>r.state!=='original').map(r=>({
   ...(out[sheet]||[]).find(v=>v.row_no===r.row_no),row_no:r.row_no,expected_match:r.expected_match
  }));
  return out;
 }
 function choose(choices,sheet,rowNo,memberUuid,lookup){
  const out=clone(choices||{}),current=(out[sheet]||[]).find(r=>r.row_no===rowNo)||{};
  out[sheet]=(out[sheet]||[]).filter(r=>r.row_no!==rowNo);
  out[sheet].push({row_no:rowNo,member_uuid:String(memberUuid||''),lookup:lookup===undefined?current.lookup||'':String(lookup).trim()});
  return out;
 }
 function render(cell,match,{enabled,onChoose,onSearch,source}){
  if(!match||match.state==='original')return;
  const doc=cell.ownerDocument,box=doc.createElement('div');box.className='capital-target-match mt-2';
  if(source){const original=doc.createElement('div');original.className='small text-secondary';original.textContent='엑셀: '+[source.name,source.phone].filter(Boolean).join(' · ');box.append(original);}
  const hint=doc.createElement('div');hint.className='small text-secondary';
  hint.textContent=match.state==='matched'?({name_phone:'이름·전화번호 일치',name:'이름 일치',number:'조합원번호 일치',manual:'직접 선택한 조합원'}[match.method]||'연결 대상 확인'):'연결 대상 확인 필요';box.append(hint);
  const candidates=Array.isArray(match.candidates)?match.candidates:[];
  if(candidates.length){
   const select=doc.createElement('select');select.className='form-select form-select-sm mt-1';select.disabled=!enabled;
   select.setAttribute('aria-label',match.row_no+'행 연결할 조합원');
   const empty=doc.createElement('option');empty.value='';empty.textContent='조합원 선택';select.append(empty);
   for(const c of candidates){const option=doc.createElement('option');option.value=c.member_uuid;option.textContent=[c.name,c.member_type,c.member_id,c.phone_hint].filter(Boolean).join(' · ');select.append(option);}
   select.value=match.state==='matched'?match.member_uuid||'':'';
   select.onchange=()=>onChoose(select.value);box.append(select);
  }
  const tools=doc.createElement('div');tools.className='d-flex flex-wrap gap-1 mt-1';
  const input=doc.createElement('input');input.type='search';input.className='form-control form-control-sm';input.maxLength=100;input.placeholder='이름·전화번호·조합원번호';input.setAttribute('aria-label',match.row_no+'행 조합원 직접 찾기');input.disabled=!enabled;input.dataset.erpQueryControl='';
  const button=doc.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary';button.textContent='찾기';button.disabled=!enabled;
  const search=()=>{if(input.value.trim())onSearch(input.value.trim());};button.onclick=search;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();search();}};
  tools.append(input,button);box.append(tools);cell.append(box);
 }
 root.CapitalMemberMatching=Object.freeze({version:'1.0.0',needed,envelope,accept,choose,render});
})(window);
