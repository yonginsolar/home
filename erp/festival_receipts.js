/* v1.0.1 - Existing ERP session, owning-cooperative authorization, inline confirmation. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id), client=window.supabase.createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h');
 let offset=0,items=[],total=0,busy=false;
 const date=v=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v));
 const say=text=>{$('adminStatus').textContent=text;};
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){$('adminPanel').hidden=true;$('receiptRows').replaceChildren();items=[];total=0;$('accessStatus').textContent='로그아웃되었습니다. 다시 로그인해 주세요.';}});
 async function rpc(action,data={}){const result=await client.rpc('festival_receipts_admin',{p_action:action,p_data:data});if(result.error)throw new Error(result.error.message==='ADMIN_REQUIRED'?'관리 권한이 없습니다.':'처리하지 못했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.');return result.data;}
 function render(){const rows=$('receiptRows');rows.replaceChildren();for(const item of items){const row=document.createElement('tr');for(const value of [date(item.created_at),item.depositor_name,item.amount.toLocaleString('ko-KR')+'원',item.phone]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}const cell=document.createElement('td');const button=document.createElement('button');button.type='button';button.className=item.issued_at?'secondary':'';button.textContent=item.issued_at?'발급 완료 · 되돌리기':'발급 완료로 표시';button.addEventListener('click',()=>{
  if(busy||button.hidden)return;
  const confirmBox=document.createElement('div'),message=document.createElement('p'),yes=document.createElement('button'),no=document.createElement('button');
  message.textContent=item.issued_at?'미처리 상태로 되돌릴까요?':'실제 현금영수증 발급을 마치셨나요?';
  yes.type=no.type='button';yes.textContent=item.issued_at?'예, 미처리로 되돌리기':'예, 발급을 마쳤어요';no.textContent='취소';no.className='secondary';
  no.addEventListener('click',()=>{confirmBox.remove();button.hidden=false;button.focus();});
  yes.addEventListener('click',async()=>{if(busy)return;busy=true;yes.disabled=no.disabled=true;try{await rpc(item.issued_at?'mark_pending':'mark_issued',{id:item.id});await load();say('처리 상태를 저장했습니다.');}catch(e){say(e.message);}finally{busy=false;yes.disabled=no.disabled=false;}});
  confirmBox.append(message,yes,no);cell.append(confirmBox);button.hidden=true;yes.focus();
 });cell.append(button);row.append(cell);rows.append(row);}
 $('countTitle').textContent='신청 내역 · '+total+'건';$('previous').hidden=offset===0;$('next').hidden=offset+items.length>=total;if(!items.length)say('접수된 신청이 없습니다.');}
 async function load(){const result=await rpc('list',{offset});items=result.items;total=result.total;render();}
 async function reload(){if(busy)return;busy=true;$('refresh').disabled=true;try{say('');await load();}catch(e){say(e.message);}finally{busy=false;$('refresh').disabled=false;}}
 $('refresh').addEventListener('click',reload);$('previous').addEventListener('click',()=>{if(busy)return;offset=Math.max(0,offset-100);reload();});$('next').addEventListener('click',()=>{if(busy)return;offset+=100;reload();});
 $('exportCsv').addEventListener('click',async()=>{if(busy)return;busy=true;$('exportCsv').disabled=true;try{const all=[];for(let p=0;p<total;p+=100){const data=await rpc('list',{offset:p});all.push(...data.items);}const cell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';const lines=[['신청일시','입금자명','입금액','전화번호','발급상태'],...all.map(i=>[date(i.created_at),i.depositor_name,i.amount,"'"+i.phone,i.issued_at?'발급 완료':'미처리'])];const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='태양광선풍기_현금영수증신청.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('다운로드한 파일에는 개인정보가 있습니다. 발급 처리 후 안전하게 삭제해 주세요.');}catch(e){say(e.message);}finally{busy=false;$('exportCsv').disabled=false;}});
 (async()=>{try{const {data,error}=await client.auth.getUser();if(error||!data.user){$('accessStatus').textContent='ERP에 로그인한 뒤 이용해 주세요.';$('loginLink').href='index.html?next='+encodeURIComponent(location.href);$('loginLink').hidden=false;return;}await rpc('access');$('accessStatus').textContent='';$('adminPanel').hidden=false;await reload();}catch(e){$('accessStatus').textContent=e.message;}})();
})();
