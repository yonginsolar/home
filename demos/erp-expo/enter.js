import {prepareRoleClient,factory,codeMessage} from './client.js';
const ticket=new URLSearchParams(location.hash.slice(1)).get('ticket');history.replaceState(null,'',location.pathname);
const part=location.hostname.match(/^expo-(admin|staff|member)-0[1-8]\.coopco\.kr$/)?.[1],role={admin:'administrator',staff:'employee',member:'member'}[part];
let busy=false;const status=document.getElementById('status'),retry=document.getElementById('retry');
async function enter(){
 if(busy)return;busy=true;retry.hidden=true;
 try{
  if(!role||!/^[a-f0-9]{64}$/.test(ticket||''))throw Error('DEMO_TICKET_ENDED');
  const result=await factory({action:'login',ticket,role});
  if(result.path!=='/demos/erp-expo/workspace.html'||!/^[0-9a-f-]{36}$/.test(result.workspace||''))throw Error('DEMO_UNAVAILABLE');
  const client=prepareRoleClient(result.workspace);
  const {error}=await client.auth.setSession(result.session);if(error)throw Error('DEMO_UNAVAILABLE');
  location.replace(result.path);
 }catch(e){status.textContent=codeMessage(e.message);retry.hidden=false;}
 finally{busy=false;}
}
retry.addEventListener('click',enter);void enter();
