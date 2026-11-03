/* Bank choices1.0.0. Keep the original input as the writer/draft value. */
(function(root){
 'use strict';
 const banks=Object.freeze(['농협','국민','신한','우리','하나','기업','카카오뱅크','토스뱅크','새마을','신협','우체국','SC제일','부산','대구','광주','전북','수협','경남','제주','씨티','케이뱅크','산림조합','저축은행']);
 const states=new WeakMap(),selector='#editBankName,#md-bank-name,[data-information-field="bank_name"]';
 function attach(input){
  if(!input||input.tagName!=='INPUT'||states.has(input))return states.get(input);
  const doc=input.ownerDocument,labels=Array.from(input.labels||[]),wrapper=doc.createElement('div'),choice=doc.createElement('select');
  wrapper.className='coop-bank-picker';wrapper.style.cssText='display:flex;flex-direction:column;gap:.5rem;min-width:0;width:100%';
  choice.id=(input.id||'bank-'+Math.random().toString(36).slice(2))+'-choice';choice.className='form-select'+(input.classList.contains('form-control-sm')?' form-select-sm':'');
  choice.setAttribute('data-erp-query-control','');choice.setAttribute('aria-label',labels.map(l=>l.textContent.trim()).join(' ')||'은행명');
  for(const [value,label]of [['','은행 선택'],...banks.map(b=>[b,b]),['__direct__','직접 입력']]){const o=doc.createElement('option');o.value=value;o.textContent=label;choice.append(o);}
  input.before(wrapper);wrapper.append(choice,input);
  const state={input,choice,labels,direct:false,sync:null};states.set(input,state);
  function sync(){
   const locked=input.readOnly||input.disabled,value=input.value,known=!value||banks.includes(value);
   choice.hidden=locked;choice.disabled=locked;
   choice.value=state.direct||!known?'__direct__':value;
   input.hidden=!locked&&choice.value!=='__direct__';
   for(const label of labels)label.htmlFor=input.hidden?choice.id:input.id;
   if(input.hasAttribute('aria-describedby'))choice.setAttribute('aria-describedby',input.getAttribute('aria-describedby'));
  }
  state.sync=sync;
  choice.addEventListener('change',()=>{
   if(input.readOnly||input.disabled){sync();return;}
   state.direct=choice.value==='__direct__';
   if(!state.direct){input.value=choice.value;input.dispatchEvent(new root.Event('input',{bubbles:true}));input.dispatchEvent(new root.Event('change',{bubbles:true}));}
   sync();if(state.direct)input.focus({preventScroll:true});
  });
  input.addEventListener('input',sync);input.addEventListener('change',sync);
  new root.MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['readonly','disabled','aria-describedby']});
  sync();return state;
 }
 function refresh(input){const state=states.get(input)||attach(input);if(state){state.direct=false;state.sync();}}
 function scan(node){if(node.nodeType!==1)return;if(node.matches(selector))attach(node);for(const input of node.querySelectorAll(selector))attach(input);}
 function init(){scan(document.body);new root.MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)scan(node);}).observe(document.body,{childList:true,subtree:true});}
 root.CoopBankChoices=Object.freeze({banks,attach,refresh});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
