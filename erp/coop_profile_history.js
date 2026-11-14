/* 1.0.0 · 기존 조합 정보 읽기 결과만 표시. 별도 조회·입력·저장·초점 변경 없음. */
(function(root){
 'use strict';const owned=new WeakMap();const labels={name:'조합명',office:'주소',chair:'이사장'};
 function clear(target){if(!target)return;owned.get(target)?.node.remove();owned.delete(target);}
 function begin(target,owner){if(target&&(!owner||owned.get(target)?.owner!==owner))clear(target);}
 function render(target,rows,owner){
  if(!target)return;if(!owner||!Array.isArray(rows)){clear(target);return;}
  const values=rows.filter(r=>r&&Object.hasOwn(labels,r.field)&&typeof r.before_value==='string'&&typeof r.after_value==='string'&&r.before_value!==r.after_value&&Number.isFinite(Date.parse(r.changed_at))).slice(0,50);
  if(!values.length){clear(target);return;}
  let state=owned.get(target);if(state?.owner!==owner){clear(target);state=null;}
  if(!state){const node=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('div');node.className='erp-coop-history border rounded p-3 mt-3';node.style.overflowWrap='anywhere';summary.textContent='이전 정보';list.className='mt-3';node.append(summary,list);target.append(node);state={owner,node,list};owned.set(target,state);}
  const fragment=document.createDocumentFragment();for(const r of values){const item=document.createElement('div'),title=document.createElement('strong'),before=document.createElement('p'),after=document.createElement('p');item.className='border-top pt-2 mt-2';title.textContent=labels[r.field]+' · '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.changed_at));before.className=after.className='mb-1';before.style.whiteSpace=after.style.whiteSpace='pre-wrap';before.textContent='이전: '+(r.before_value||'미등록');after.textContent='변경: '+(r.after_value||'미등록');item.append(title,before,after);fragment.append(item);}state.list.replaceChildren(fragment);
 }
 root.ERPCoopProfileHistory={render,clear,begin};
})(window);
