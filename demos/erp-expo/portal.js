import {factory,codeMessage} from './client.js';
const probe=location.pathname==='/erp/expo_admin.html',button=document.getElementById('start'),status=document.getElementById('status'),links=document.getElementById('links');
let busy=false;
const ticketKey=probe?'expo-probe-ticket-v1':'expo-visitor-ticket-v1';
const labels={administrator:'관리자 화면 열기',employee:'직원 화면 열기',member:'조합원 화면 열기'};
button.addEventListener('click',async()=>{
 if(busy)return;busy=true;button.disabled=true;status.textContent='체험조합과 세 역할을 준비하고 있어요…';
 try{
  let ticket=sessionStorage.getItem(ticketKey);
  if(!/^[a-f0-9]{64}$/.test(ticket||'')){ticket=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');sessionStorage.setItem(ticketKey,ticket);}
  const result=await factory({action:probe?'probe':'start',ticket});links.replaceChildren();
  for(const item of result.links||[]){
   const u=new URL(item.url);if(u.protocol!=='https:'||!/^expo-(admin|staff|member)-0[1-8]\.coopco\.kr$/.test(u.hostname))throw Error('DEMO_UNAVAILABLE');
   const a=document.createElement('a');a.className='button';a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=labels[item.role];links.append(a);
  }
  links.hidden=false;status.textContent='준비됐어요! 직원 화면에서 작성한 뒤 관리자 화면에서 승인해 보세요.';button.textContent='역할별 링크 다시 확인';
 }catch(e){status.textContent=codeMessage(e.message);button.textContent='같은 체험 다시 확인';if(String(e.message).includes('TICKET_ENDED')){sessionStorage.removeItem(ticketKey);button.textContent='새 체험 시작';}}
 finally{busy=false;button.disabled=false;}
});
if(!probe){factory({action:'status'}).then(s=>{button.disabled=!s.is_open;button.textContent=s.is_open?'내 체험조합 시작하기':'11월 27일에 만나요';status.textContent=s.is_open?'지금 체험할 수 있어요.':'한국 시간 11월 27일 0시부터 29일 자정까지 열려요.';}).catch(()=>{status.textContent='운영 일정을 확인하지 못했어요. 페이지를 다시 열어 주세요.';button.textContent='일정 확인 필요';});}
