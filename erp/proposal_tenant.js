/* v1.0.0 — Own-cooperative proposal identity; saved legacy documents remain explicit. */
(function(root){
 'use strict';
 const MAIN='a4e65bb0-aa8e-4cef-a895-cd7865a67fef', OLD='용인모두의햇빛협동조합';
 const text=(v,max=300)=>String(v||'').trim().slice(0,max);
 function clean(value,coopId){
  if(!value||value.coopId!==coopId)throw new Error('제안서의 조합 정보를 확인할 수 없습니다. 다시 열어 주세요.');
  let homepage='';try{const u=new URL(value.homepage);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/')homepage=u.origin+'/';}catch(_){}
  return Object.freeze({coopId,legacy:value.legacy===true,name:text(value.name),address:text(value.address),chairName:text(value.chairName,80),contactName:text(value.contactName,80),contact:text(value.contact,80),logo:safeLogo(value.logo),homepage});
 }
 function safeLogo(v){try{const u=new URL(v);return u.origin==='https://ifdqlwxgqgsvnawmhlfc.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/assets/')&&!u.search&&!u.hash&&!u.username&&!u.password?u.href:'';}catch(_){return '';}}
 async function load(client,coopId){
  const [coop,info,branding,route]=await Promise.all([
   client.from('coops').select('id,coop_name').eq('id',coopId).single(),
   client.from('ref_company_info').select('key,value').eq('coop_id',coopId).in('key',['company_name','orgName','chairman_name','ceoName','company_address','company_contact','company_contact_name','company_contact_phone']),
   client.rpc('get_public_coop_branding'),
   client.from('coop_domain_routes').select('hostname').eq('coop_id',coopId).eq('is_primary',true).eq('is_active',true).single()
  ]);
  if(coop.error||info.error||!coop.data||coop.data.id!==coopId)throw new Error('제안서에 넣을 조합 기본정보를 불러오지 못했습니다. 다시 시도해 주세요.');
  const i=Object.fromEntries((info.data||[]).map(row=>[row.key,row.value]));
  const name=text(i.company_name||i.orgName||coop.data.coop_name);
  if(!name)throw new Error('조합 기본정보에서 조합명을 확인해 주세요.');
  const hostname=String(route.data?.hostname||'');
  return clean({coopId,legacy:coopId===MAIN,name,address:i.company_address,chairName:i.chairman_name||i.ceoName,contactName:i.company_contact_name,contact:i.company_contact_phone||i.company_contact,logo:!branding.error&&branding.data?.coop_name===coop.data.coop_name?branding.data.display_url:'',homepage:!route.error&&/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(hostname)?'https://'+hostname+'/':''},coopId);
 }
 function restored(value,coopId,current){
  // Old files did not carry issuer data: retain their text instead of silently rewriting it.
  return value?clean(value,coopId):coopId===MAIN?current:clean({coopId,legacy:true,name:OLD},coopId);
 }
 function generic(p){return !!p&&!p.legacy;}
 function apply(doc,m){
  const p=m.issuer;if(!generic(p))return;
  const pages=doc.querySelectorAll('.slide'),put=(n,s,value)=>{const el=pages[n-1]?.querySelector(s);if(el)el.textContent=value;};
  const walker=doc.createTreeWalker(doc.body,4),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(node=>{if(!['SCRIPT','STYLE'].includes(node.parentElement?.tagName))node.nodeValue=node.nodeValue.replaceAll(OLD,p.name).replaceAll('용인시 및 주민','관할 지방자치단체 및 주민');});
  doc.querySelectorAll('.logo-coop').forEach(img=>{if(p.logo){img.src=p.logo;img.alt=p.name;}else{const label=doc.createElement('strong');label.textContent=p.name;label.style.cssText='display:block;max-width:100%;font-size:20px;line-height:1.4;overflow-wrap:anywhere';img.replaceWith(label);}});
  doc.querySelectorAll('.logo-city').forEach(img=>img.remove());
  doc.querySelectorAll('.logo-row .divider').forEach(n=>n.remove());
  put(2,'h2','지역의 공공시설에서 시민과 함께 에너지 전환을 준비합니다');
  put(2,'.lead','대상지의 이용 목적과 실제 설치 여건을 확인하고, 재생에너지 생산과 이용자 편익을 함께 검토합니다.');
  put(2,'.card:nth-child(2) h3','지역에서 생산하는 재생에너지');
  put(2,'.card:nth-child(2) p','시설과 지역의 실제 전력 수요·계통 여건을 확인하고, 활용 가능한 공간에서 분산형 재생에너지를 넓히는 방안을 검토합니다.');
  pages[1]?.querySelectorAll('.source').forEach(n=>n.remove());
  if(m.facilityType!=='school'){
   put(7,'.grid-2 .card:first-child p','대상 지역의 주민에게 사업 구조와 안전·운영 계획을 설명하고, 질문과 우려를 듣는 자리를 협의합니다. 설명회에서 나온 의견을 검토해 필요한 내용을 사업 계획에 반영합니다.');
   put(7,'.banner','지역 주민이 사업을 이해하고 의견을 나눌 수 있도록 설명·협의 절차를 함께 준비합니다.');
  }
  put(11,'.note','화면 수치는 디자인 예시이며 실제 발전량이 아닙니다. 공개 항목과 범위는 대상 시설의 관리 주체와 협의해 확정합니다.');
  put(13,'.note.warning','사업비·금융조건과 수익성은 조합이 검토합니다. 관계 기관의 사업비 부담을 전제하지 않으며, 설계와 재원조달 계획을 확인한 뒤 제안합니다.');
  const procedure=pages[14]?.querySelector('.frame');
  if(procedure){
   procedure.replaceChildren();
   for(const[tag,cls,value]of [['div','eyebrow','PROPERTY & PROCEDURE'],['h2','','대상지의 소유·관리 기준과 필요한 절차를 먼저 확인합니다'],['p','lead','대상 시설과 사업에 실제로 적용되는 조건을 확인한 뒤 설치·운영 방식을 협의합니다.'],['h3','','확인할 사항'],['p','note','대상지의 소유·관리 주체, 시설 사용 조건, 설치·운영 책임과 사업비를 확인합니다. 계약 방식과 지원사업 적용 여부는 해당 지역·시설의 기준과 담당 기관의 검토를 거쳐 정합니다.'],['p','source','다른 지역의 조례나 기존 사업의 계약 조건을 이 대상지에 그대로 적용하지 않습니다.']]){const n=doc.createElement(tag);n.className=cls;n.textContent=value;procedure.append(n);}
  }
  put(16,'.grid-2 .card:first-child p','현장 조건과 필요한 자격·경험을 확인해 시공·운영 업체를 검토하고, 역할과 책임을 협의합니다.');
  pages[16]?.querySelectorAll('li').forEach(li=>{if(li.textContent.includes('용인 기반 협동조합'))li.textContent='조합의 정관과 의사결정 절차에 따라 사업을 추진';});
  const home=doc.querySelector('.slide.closing a.card');
  if(home){if(p.homepage){home.href=p.homepage;home.querySelector('b').textContent='조합 홈페이지 · '+new URL(p.homepage).hostname;}else{home.removeAttribute('href');home.querySelector('b').textContent='조합 홈페이지 주소 확인 필요';}}
  put(18,'.lead','조합의 담당 체계와 전문 시공·운영 업체의 역할을 확인하고, 안전하고 투명한 장기 운영을 준비하겠습니다.');
  put(9,'h2',p.name+'의 조합원과 함께 추진합니다');
  put(9,'.lead','조합원이 출자하고 조합의 의사결정 절차에 따라 사업을 검토하는 시민참여형 발전사업을 제안합니다.');
  put(9,'.org-band .card:first-child p','해당 조합의 조합원 원장 기준');
  pages[8]?.querySelector('.network')?.remove();
  put(9,'.source',m.statsAsOf?'조직 현황 기준일: '+m.statsAsOf+' · 해당 조합 공개 집계값 기준.':'조직 현황: 제안서 입력값 기준.');
  const frame=pages[9]?.querySelector('.frame');
  if(frame){
   frame.replaceChildren();
   const eyebrow=doc.createElement('div');eyebrow.className='eyebrow';eyebrow.textContent='PEOPLE & GOVERNANCE';
   const heading=doc.createElement('h2');heading.textContent='조합의 의사결정과 담당 체계';
   const grid=doc.createElement('div');grid.className='grid-2';
   for(const [label,value]of [['조합',p.name],['이사장',p.chairName||'조합 기본정보 확인 필요'],['담당자',p.contactName||'담당자 확인 필요'],['연락처',m.officePhone||p.contact||'연락처 확인 필요']]){
    const card=doc.createElement('div');card.className='card';const h=doc.createElement('h3');h.textContent=label;const body=doc.createElement('p');body.textContent=value;card.append(h,body);grid.append(card);
   }
   const note=doc.createElement('p');note.className='note';note.textContent='사업계획·계약·안전관리·지역환원은 해당 조합의 정관과 의사결정 절차에 따라 검토하고 협의합니다.';frame.append(eyebrow,heading,grid,note);
  }
  const contact=doc.querySelector('.slide.closing .contact');
  if(contact){const org=contact.querySelector('.contact-org');if(org)org.textContent=p.name;const address=contact.querySelector('.contact-address');if(address)address.textContent=p.address||'조합 주소 확인 필요';}
 }
 function presets(original,profile){
  if(profile.coopId===MAIN)return original;
  return Object.freeze({items:Object.freeze([]),blank:(kind='public')=>({...original.blank(kind),regionFull:'지역',regionShort:'지역'})});
 }
 function initializeForm(doc,p,originalBlank){
  if(p.coopId===MAIN)return;
  const fields={...originalBlank,facilityName:'새 대상지',regionFull:'지역',regionShort:'지역',memberTotal:'0',individualMembers:'0',organizationMembers:'0',shareCapitalManwon:'0',chairPhone:'',officePhone:p.contact||''};
  for(const[id,value]of Object.entries(fields)){const el=doc.getElementById(id);if(!el)continue;if(el.type==='checkbox')el.checked=!!value;else el.value=String(value??'');}
  doc.querySelectorAll('[data-visit-director]').forEach(el=>{el.closest('label')?.remove();});
  const photoName=doc.getElementById('siteImageName');if(photoName)photoName.textContent='대상지 사진 미등록';
  if(photoName?.nextElementSibling?.classList.contains('help'))photoName.nextElementSibling.textContent='사진은 미리보기와 PDF·HTML에 포함됩니다. 제안서를 저장하면 사진도 비공개 보관함에 함께 저장됩니다.';
  doc.getElementById('keepNamsaOverlay')?.closest('label')?.setAttribute('hidden','');
  const savedName=doc.getElementById('proposalSaveName');if(savedName)savedName.placeholder='제안서를 구분할 이름';
  const reset=doc.getElementById('resetButton');if(reset)reset.textContent='↩️ 새 제안서로 초기화';
 }
 root.ProposalTenant=Object.freeze({load,clean,restored,generic,apply,presets,initializeForm,mainId:MAIN});
})(window);
