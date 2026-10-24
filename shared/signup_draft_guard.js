/* v1.0.1 — In-document, subject-separated draft protection. No persistent storage. */
(function(root){
 'use strict';let baseline=null,pending=false,owner=null;const drafts=new Map();
 function snapshot(){
  const form=root.document.getElementById('joinForm');if(!form)return '';
  return JSON.stringify([...form.querySelectorAll('input,select,textarea')].filter(n=>!['button','submit','reset'].includes(n.type)&&n.id!=='deferred-signup-otp-input').map(n=>[n.id,n.value,['checkbox','radio'].includes(n.type)?n.checked:null]));
 }
 function initialize(){if(baseline===null)baseline=snapshot();}
 function markSaved(value){if(typeof value==='string')baseline=value;}
 function selectOwner(next,transfer=false){
  if(owner===next)return;
  if(owner!==null&&!transfer)drafts.set(owner,{baseline,dirty:baseline!==null&&snapshot()!==baseline});
  if(transfer)drafts.delete(owner);
  const previous=baseline;owner=next;baseline=drafts.get(next)?.baseline??(transfer?previous:null);
  drafts.delete(next);
 }
 function changed(){return pending||baseline!==null&&snapshot()!==baseline||[...drafts.values()].some(x=>x.dirty);}
 root.addEventListener('beforeunload',event=>{if(!changed())return;event.preventDefault();event.returnValue='';});
 root.CoopSignupDraft=Object.freeze({snapshot,initialize,markSaved,selectOwner,setPending:value=>{pending=value===true;},changed});
})(window);
