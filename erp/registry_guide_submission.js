/* 제출 꾸러미 예시2.2.0 · 개인정보를 불투명하게 가린 원본 배치 사본. */
(function(root){
 'use strict';
 const labels=['등기신청수수료 납부서','변경등기신청서 · 첫 면','변경등기신청서 · 둘째 면','등록면허세 납부확인서','위임장','재직증명서','변경신고확인증','변경사항 별첨','총회의사록 · 첫 면','총회의사록 · 계속','총회의사록 · 의결'];
 const image=i=>'/erp/assets/registry-guide/minimal-case-20261117-'+String(i+1).padStart(2,'0')+'.png';
 function example(){return '<p class="rg-note">과거 서류의 배치 예시입니다.</p><ol class="rg-sample-list">'+labels.map((label,i)=>'<li><button type="button" data-rg-sample="'+i+'">'+(i+1)+'. '+label+'</button></li>').join('')+'</ol><p>신청서가 두 장 이상이면 장 사이에 신청인 또는 대리인이 간인합니다. 이번 변경에 필요한 증빙을 신청서와 함께 묶어 접수하세요.</p>';}
 function attach({context}){
  const d=document,subject=context().key,live=()=>context().authorized&&context().key===subject&&!d.hidden&&(!root.frameElement||!root.frameElement.hidden);let dialog,origin=null,index=0;
  function show(i,button){if(!live()||!Number.isInteger(i)||i<0||i>=labels.length)return;
   if(!dialog){dialog=d.createElement('dialog');dialog.className='rg-sample-dialog';dialog.setAttribute('aria-labelledby','rgSampleTitle');dialog.innerHTML='<header><h2 id="rgSampleTitle"></h2><button type="button" data-sample-close aria-label="서류 예시 닫기">닫기</button></header><div class="rg-sample-scroll"><img alt=""></div><footer><button type="button" data-sample-prev>이전</button><span aria-live="polite"></span><button type="button" data-sample-next>다음</button></footer>';d.body.append(dialog);
    dialog.querySelector('[data-sample-close]').onclick=()=>dialog.close();dialog.querySelector('[data-sample-prev]').onclick=()=>show(index-1);dialog.querySelector('[data-sample-next]').onclick=()=>show(index+1);
    dialog.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.repeat&&!e.isComposing)e.preventDefault();if(e.key!=='Tab'||e.defaultPrevented)return;const items=[...dialog.querySelectorAll('button:not(:disabled)')],first=items[0],last=items.at(-1);if(e.shiftKey&&d.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&d.activeElement===last){e.preventDefault();first.focus();}});
    dialog.addEventListener('close',()=>{if(dialog.open)return;const target=origin;origin=null;dialog.querySelector('img').removeAttribute('src');if(live()&&target?.isConnected&&target.getClientRects().length&&[d.body,dialog].includes(d.activeElement))target.focus({preventScroll:true});});
   }
   index=i;if(button)origin=button;dialog.querySelector('h2').textContent=labels[i];const img=dialog.querySelector('img');img.alt=labels[i]+' · 비식별 서식 예시';img.src=image(i);dialog.querySelector('span').textContent=(i+1)+' / '+labels.length;dialog.querySelector('[data-sample-prev]').disabled=i===0;dialog.querySelector('[data-sample-next]').disabled=i===labels.length-1;dialog.querySelector('.rg-sample-scroll').scrollTop=0;if(!dialog.open)dialog.showModal();
  }
  d.getElementById('registryGuide').addEventListener('click',e=>{const b=e.target.closest('[data-rg-sample]');if(b)show(Number(b.dataset.rgSample),b);});
  const leave=()=>{origin=null;if(dialog?.open)dialog.close();};return{leave};
 }
 root.CoopRegistrySubmissionExample=Object.freeze({example,attach,labels,image,version:'2.2.0'});
})(typeof window==='undefined'?globalThis:window);
