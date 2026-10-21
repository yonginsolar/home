/* v1.0.0 — Exhibition-only certificate preparation, never a real certificate. */
(function(root){
 'use strict';
 if(!root.ExpoRuntimeBridge)return;
 const requests=new Map();let busy=false;
 const stopped=()=>root.ExpoRuntimeBridge.status?.().stopped===true;
 async function prepare({client,empId,purpose,isCurrent=()=>true,profile,printer,onReady=()=>{},alert}){
  if(busy||stopped())return false;
  purpose=String(purpose||'').trim();if(!purpose){await alert('용도를 입력해 주세요.');return false;}
  const payload=JSON.stringify([empId,purpose]);
  if([...requests].some(([key,value])=>key!==payload&&value.uncertain)){
   await alert('앞선 증명서 준비 결과를 확인하지 못했어요. 같은 직원과 용도로 다시 확인해 주세요.');return false;
  }
  let job=requests.get(payload);if(!job){job={key:root.crypto.randomUUID(),uncertain:false};requests.set(payload,job);}
  busy=true;job.uncertain=true;
  try{
   const {data,error}=await client.rpc('erp_expo_employee_certificate',{p_emp_id:empId,p_purpose:purpose,p_request_key:job.key});
   if(error)throw error;
   if(data?.verified!==true||data.simulation!==true||data.employee?.emp_id!==empId||data.purpose!==purpose||!/^DEMO-/.test(data.cert_num))throw Error('UNCONFIRMED');
   job.uncertain=false;
   if(stopped()||!isCurrent())return false;
   const e=data.employee,today=new Date().toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric'});
   const currentProfile=profile();
   const values={simulation:true,docNum:data.cert_num,name:e.name,birth:e.birth||'미등록',dept:e.department||'-',pos:e.position||'-',address:e.address||'-',
    tenure:(e.hire_date||'-')+' ~ '+(data.cert_type==='경력증명서'?e.resign_date:'현재'),purpose,today,
    certTitle:'DEMO · '+data.cert_type,employmentStatement:'박람회 기능 체험을 위한 예시 증명서입니다.',
    chairman:'체험 대표',compName:currentProfile.companyName||'햇빛 체험조합',compAddr:currentProfile.address||'',contact:'',logo:'',seal:'',siteUrl:''};
   onReady();printer(values);return true;
  }catch(error){
   if(['PT400','PT403','PT409','42501','22023'].includes(String(error?.code||'')))job.uncertain=false;
   if(!stopped()&&isCurrent())await alert(job.uncertain?'준비 결과를 확인하지 못했어요. 같은 내용으로 다시 확인해 주세요.':'증명서를 준비하지 못했어요. 현재 직원과 권한을 다시 확인해 주세요.');
   return false;
  }finally{busy=false;}
 }
 root.addEventListener('beforeunload',event=>{if(busy||[...requests.values()].some(j=>j.uncertain)){event.preventDefault();event.returnValue='';}});
 root.ExpoEmployeeCertificate=Object.freeze({prepare,busy:()=>busy});
})(window);
