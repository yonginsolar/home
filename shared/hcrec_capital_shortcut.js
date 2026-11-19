/* A fixed navigation hint. This never authenticates or submits an application. */
(function(root){
 'use strict';
 const coop='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028';
 const route='/membermanage#extra-capital';
 const publicHosts=['hcrec.kr','www.hcrec.kr'];
 const host=where=>String(where?.hostname||'').toLowerCase().replace(/\.$/,'');
 const isCoop=id=>String(id||'')===coop;
 const isEditor=(id,where=root.location)=>isCoop(id)&&where.protocol==='https:'&&!where.port&&['erp.hcrec.kr',...publicHosts].includes(host(where));
 function hasIntent(where=root.location){
  return where.protocol==='https:'&&!where.port&&publicHosts.includes(host(where))
    &&where.pathname==='/membermanage'&&!where.search&&where.hash==='#extra-capital';
 }
 function setPreset(select,allowed){
  if(!select)return;
  const prior=select.value,old=select.querySelector('option[data-hcrec-capital-preset]');
  if(allowed&&!old){
   const option=document.createElement('option');option.value=route;option.textContent='증좌하기';option.dataset.hcrecCapitalPreset='';
   const join=Array.from(select.options).find(x=>x.value==='/signup.html');
   select.insertBefore(option,join?.nextElementSibling||null);select.value=prior;
  }else if(!allowed&&old)old.remove();
 }
 function enter(options){
  if(!hasIntent(options.where)||!options.actor||!options.current())return false;
  // A settled member dashboard, not a requested ID or an OAuth flag, owns the shortcut.
  const eligible=options.mode==='current'&&isCoop(options.coop)&&isCoop(options.member?.coop_id)
    &&!!options.member?.id&&String(options.member.id)===String(options.rootProfile||'')
    &&(!options.member.auth_user_id||String(options.member.auth_user_id)===String(options.actor))
    &&options.eligible===true;
  if(!eligible){options.consume();return false;}
  if(!options.showFunds()||!options.current())return false;
  options.consume();options.openExtra();return true;
 }
 root.CoopHcrecCapitalShortcut=Object.freeze({route,isCoop,isEditor,hasIntent,setPreset,enter});
})(window);
