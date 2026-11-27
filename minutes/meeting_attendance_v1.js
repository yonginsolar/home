import {supabase} from '/shared/supabase-client.js';

const byId=id=>document.getElementById(id);
const token=new URLSearchParams(location.search).get('qr');
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const status=byId('status'), retry=byId('retry'), member=byId('member'), guest=byId('guest');
const guestButton=guest.querySelector('button');
let currentMethod='',revision=0,pending=false,done=false,request=null;
let isBoard=false;
const findMethod=()=>{
 member.hidden=done||currentMethod!=='MEMBER';guest.hidden=done||currentMethod!=='GUEST';
 byId('director-login').hidden=done||!isBoard||currentMethod!=='GUEST';
};
byId('director-signin').href=`./sign_login.html?next=${encodeURIComponent(location.href)}`;
const messages={CLOSED:'출석 접수가 마감됐거나 사용할 수 없는 QR입니다.',ACCOUNT_NOT_AVAILABLE:'이 회의의 출석 대상 계정으로 다시 확인해 주세요.',INPUT_INVALID:'이름과 전화번호를 다시 확인해 주세요.',RETRY:'접수가 몰리고 있어요. 잠시 뒤 같은 화면에서 한 번 더 눌러 주세요.'};
async function rpc(fields){
 const {data,error}=await supabase.rpc('meeting_attendance_qr',{p_token:token,...fields});
 if(error||typeof data?.status!=='string')throw Error('MEETING_CHECKIN_UNCONFIRMED');
 return data;
}
async function load(){
 if(done||pending)return;
 const id=++revision;currentMethod='';findMethod();retry.hidden=true;
 if(!uuid.test(token||'')){status.textContent=messages.CLOSED;return;}
 try{
  const data=await rpc({p_action:'context'});
  if(id!==revision||done)return;
  if(data.status!=='OPEN'||!['MEMBER','GUEST'].includes(data.method)){
   status.textContent=messages[data.status]||messages.CLOSED;return;
  }
  const title=typeof data.title==='string'?data.title.trim():'';
  byId('meetingTitle').textContent=title||'회의 출석';
  byId('meetingWhen').textContent=[data.date,typeof data.start_time==='string'?data.start_time.slice(0,5):null].filter(Boolean).join(' ');
  byId('meetingWhen').hidden=!byId('meetingWhen').textContent;
  isBoard=data.kind==='BOARD';currentMethod=data.method;status.textContent='';findMethod();
 }catch(_){if(id===revision&&!done){status.textContent='출석 QR을 확인하지 못했습니다.';retry.hidden=false;}}
}
async function send(method){
 if(pending||done||currentMethod!==method)return;
 const wanted=method==='GUEST'?{p_name:guest.elements.guestName.value,p_phone:guest.elements.guestPhone.value}:{};
 const key=JSON.stringify([method,wanted]);
 if(request&&request.key!==key){status.textContent='먼저 입력한 내용으로 접수 결과를 확인해 주세요.';return;}
 request=request||{key,id:crypto.randomUUID(),fields:wanted};
 pending=true;member.disabled=guestButton.disabled=true;status.textContent='출석을 접수하는 중입니다.';
 try{
  const result=await rpc({p_action:'submit',p_request:request.id,...request.fields});
  if(result.status==='RECEIVED'){
   done=true;guest.reset();findMethod();status.textContent='출석을 접수했습니다.';return;
  }
  if(result.status==='RETRY'){status.textContent=messages.RETRY;return;}
  if(result.status==='INPUT_INVALID')request=null;
  if(['CLOSED','ACCOUNT_NOT_AVAILABLE'].includes(result.status)){done=true;guest.reset();findMethod();}
  status.textContent=messages[result.status]||'출석 접수 결과를 확인하지 못했습니다.';
 }catch(_){status.textContent='접수 결과를 확인하지 못했습니다. 입력은 그대로 두고 다시 눌러 주세요.';}
 finally{pending=false;member.disabled=guestButton.disabled=false;}
}
retry.addEventListener('click',()=>void load());
member.addEventListener('click',()=>void send('MEMBER'));
guest.addEventListener('submit',event=>{event.preventDefault();void send('GUEST');});
void load();
