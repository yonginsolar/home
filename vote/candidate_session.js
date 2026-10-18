/* Candidate session 1.0.0. Memory-only drafts and request ownership, never authorization. */
export function createCandidateSession({context,selection,form,onInvalidate=()=>{},onFiles=()=>{}}){
 const records=new Map(),files=[...form.querySelectorAll('input[type=file]')],templates=new Map(files.map(n=>[n.id,n.cloneNode(true)]));
 const views=['rep-member-info','rep-member-search','rep-non-member-input','representative-section','current-photo-area','current-proof-area'];
 const texts=['rep-found-name','rep-found-birth','photo-file-name','proof-file-name'];
 const fields=()=>[...form.querySelectorAll('input[id],textarea[id],select[id]')].filter(n=>n.type!=='file'&&!n.readOnly&&(n.type!=='hidden'||n.id==='rep-found-member-id'));
 const owner=()=>{const c=context();return c?.auth&&c?.coop&&c?.profile?{auth:c.auth,coop:c.coop,profile:c.profile,hint:c.hint||''}:null;};
 const key=c=>JSON.stringify([c.auth,c.coop,c.profile,c.election]);
 const visible=()=>!document.hidden&&!window.frameElement?.hidden;
 let revision=0,request=null,editor=null;
 function snapshot(){return {
  values:fields().map(n=>[n.id,n.type==='checkbox'||n.type==='radio'?n.checked:n.value]),
  files:files.map(n=>{const node=document.getElementById(n.id);return{id:n.id,node,items:[...node.files]};}),
  views:views.map(id=>[id,document.getElementById(id)?.style.display||'']),
  texts:texts.map(id=>[id,document.getElementById(id)?.textContent||'']),
  photo:document.getElementById('preview-photo')?.getAttribute('src')||''
 };}
 const same=(a,b)=>JSON.stringify(a.values)===JSON.stringify(b.values)&&a.files.every((f,i)=>f.items.length===b.files[i].items.length&&f.items.every((item,j)=>item===b.files[i].items[j]));
 const empty=snapshot();
 function restore(s,blankFiles=false){
  for(const [id,value]of s.values){const n=document.getElementById(id);if(!n)continue;if(n.type==='checkbox'||n.type==='radio')n.checked=value;else n.value=value;}
  for(const f of s.files){const current=document.getElementById(f.id),node=blankFiles?templates.get(f.id).cloneNode(true):f.node;
   if(!blankFiles&&!f.items.length)node.value='';
   if(current!==node)current.replaceWith(node);
  }
  for(const [id,value]of s.views){const n=document.getElementById(id);if(n)n.style.display=value;}
  for(const [id,value]of s.texts){const n=document.getElementById(id);if(n)n.textContent=value;}
  const photo=document.getElementById('preview-photo');if(photo){if(s.photo)photo.setAttribute('src',s.photo);else photo.removeAttribute('src');}
  onFiles();
 }
 function capture(){if(editor){editor.values=snapshot();paint();}}
 const dirty=s=>!same(s.values,s.base);
 function paint(){const status=document.getElementById('candidate-draft-status'),discard=document.getElementById('candidate-draft-discard');
  const c=owner(),s=c&&records.get(key({...c,election:selection.value}));
  if(status)status.textContent=s&&dirty(s)?'작성 중 · 아직 제출하지 않았습니다.':'';
  if(discard)discard.hidden=!editor||!dirty(editor);
 }
 function leave(){capture();editor=null;form.style.display='none';paint();}
 function invalidate(){revision++;request=null;onInvalidate();}
 function begin(election){leave();invalidate();const c=owner();if(!c||!election)return null;request={...c,election,revision};return request;}
 function current(token){const c=owner();return !!token&&request===token&&revision===token.revision&&visible()&&c&&JSON.stringify(c)===JSON.stringify({auth:token.auth,coop:token.coop,profile:token.profile,hint:token.hint})&&selection.value===token.election;}
 function validEditor(token,requireVisible=true){const c=owner();return !!token&&editor?.context===token&&(!requireVisible||visible())&&c&&c.auth===token.auth&&c.coop===token.coop&&c.profile===token.profile&&c.hint===token.hint&&selection.value===token.election;}
 function open(token,render){
  if(!current(token))return false;
  capture();editor=null;restore(empty,true);document.getElementById('candidate-id').value='';
  render();const fresh=snapshot(),k=key(token),old=records.get(k);
  editor=old&&dirty(old)?old:{context:token,base:fresh,values:fresh};editor.context=token;records.set(k,editor);
  if(old&&dirty(old))restore(old.values);
  capture();return true;
 }
 for(const type of ['input','change'])form.addEventListener(type,capture);
 window.addEventListener('beforeunload',e=>{capture();if([...records.values()].some(dirty)){e.preventDefault();e.returnValue='';}});
 return {begin,current,open,capture,leave,invalidate,paint,owns:t=>request===t,
  editorContext:()=>editor?.context||null,validEditor,
  checkpoint(){capture();return editor?{record:editor,values:editor.values}:null;},
  committed(point){if(point){point.record.base=point.values;paint();}},
  discard(token){if(!validEditor(token))return false;restore(editor.base);capture();return true;},
  forget(){records.clear();editor=null;invalidate();restore(empty,true);form.reset();form.style.display='none';paint();}
 };
}
