/* 제출 전 서류 확인 1.0.0 · 화면 안의 준비 체크만 보관한다. */
(function(root){
 'use strict';
 function cityRows(input){
  return [{key:'report',label:'별지 제7호 변경신고서'},...root.CoopRegistryDocumentsModel.requirements(input).map(r=>({key:r.key,label:r.key==='investors'?'출자자 명부 · 출자금 변동내역 확인서':r.label})),{key:'register',label:'법인 등기사항증명서 · 행정정보 공동이용에 동의하지 않은 경우'}];
 }
 function guideRows(html,mode='chair'){
  const source=root.document.createElement('div');source.innerHTML=html;
  const rows=[...source.querySelectorAll('li')].map(n=>n.textContent.trim()).filter(s=>!s.includes('대리인이 신청하면 위임장'));
  if(mode!=='chair')rows.push('위임장');
  if(mode==='employee')rows.push('재직증명서 · 조합 직원이 대리하는 경우');
  return [...new Set(rows)].map(label=>({key:label,label}));
 }
 function attach({element,context}){
  const d=element.ownerDocument,memory=new Map();let subject='',scope='',items=[],nodes=new Map();
  const count=d.createElement('p'),list=d.createElement('ul');element.classList.add('registry-checklist');count.setAttribute('role','status');count.setAttribute('aria-live','polite');list.setAttribute('aria-label','준비 서류');element.append(count,list);
  function status(){count.textContent='준비 확인 '+items.filter(r=>nodes.get(r.key)?.input.checked).length+' / '+items.length;}
  for(const type of ['input','change'])element.addEventListener(type,e=>e.stopPropagation());
  function sync(rows,key){
   const c=context();if(!c.authorized){list.hidden=true;count.textContent='';return;}
   if(subject!==c.key){memory.clear();subject=c.key;scope='';nodes.clear();list.replaceChildren();}
   list.hidden=false;const next=String(key),unique=[...new Map(rows.map(r=>[r.key,r])).values()];
   if(scope!==next){scope=next;nodes.clear();list.replaceChildren();}
   const checked=memory.get(scope)||new Set();memory.set(scope,checked);const keys=new Set(unique.map(r=>r.key));
   for(const [key,node]of nodes)if(!keys.has(key)){node.li.remove();nodes.delete(key);checked.delete(key);}
   items=unique;
   for(const [index,row]of unique.entries()){let node=nodes.get(row.key);if(!node){const li=d.createElement('li'),label=d.createElement('label'),input=d.createElement('input'),caption=d.createElement('span');input.type='checkbox';input.checked=checked.has(row.key);caption.textContent=row.label;label.append(input,caption);li.append(label);node={li,input,caption};nodes.set(row.key,node);input.addEventListener('change',()=>{if(context().key!==subject||!context().authorized)return;input.checked?checked.add(row.key):checked.delete(row.key);status();});}else node.caption.textContent=row.label;if(list.children[index]!==node.li)list.insertBefore(node.li,list.children[index]||null);}
   status();
  }
  return {sync,clear(){memory.clear();scope='';nodes.clear();items=[];list.replaceChildren();count.textContent='';}};
 }
 root.CoopRegistryChecklist=Object.freeze({cityRows,guideRows,attach,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
