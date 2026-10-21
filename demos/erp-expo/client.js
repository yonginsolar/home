import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.112.2';
const origin=location.hostname;
const requestHeaders={'x-public-host':origin};
// Like the real member portal, a member uses PUBLIC tenant context. An ERP
// header deliberately resolves only employees and would block own-profile saves.
if(!/^expo-member-0[1-8]\.coopco\.kr$/.test(origin))requestHeaders['x-erp-host']=origin;
export const client=createClient('https://ifdqlwxgqgsvnawmhlfc.supabase.co','sb_publishable_lkVhLJDe8WmOPzsWOMkKdg_pjVwVS-h',{
 global:{headers:requestHeaders},
 auth:{persistSession:origin!=='expo.coopco.kr',autoRefreshToken:origin!=='expo.coopco.kr',detectSessionInUrl:false}
});
if(globalThis.CoopCheckedUploads)globalThis.CoopCheckedUploads.install(client);
export function codeMessage(code){
 const s=String(code||'');
 const messages={DEMO_NOT_OPEN:'공개 체험은 11월 27~29일에 열려요.',DEMO_ROOMS_BUSY:'체험 자리가 모두 사용 중이에요. 잠시 후 다시 시도해 주세요.',
 DEMO_VISITOR_LIMIT:'이번 행사에 준비한 체험 공간을 모두 사용했어요. 안내 부스로 문의해 주세요.',DEMO_TICKET_ENDED:'이 체험 시간이 끝났어요. 입구에서 새로 시작해 주세요.',
 DEMO_ACCESS_ENDED:'체험 시간이 끝났어요. 작성 중인 내용은 화면에서 확인할 수 있어요.',DEMO_CONTEXT_CHANGED:'체험 공간이 바뀌었어요. 새 체험 화면을 이용해 주세요.',DEMO_LOGIN_BUSY:'같은 계정의 접속을 준비 중이에요. 잠시 후 다시 눌러 주세요.',
 DEMO_DOCUMENT_CHANGED:'문서 상태가 바뀌었어요. 목록을 다시 확인해 주세요.',DEMO_SETTINGS_CHANGED:'다른 창에서 홈페이지를 수정했어요. 작성한 내용은 남겨 두었으니 최신 내용을 확인해 주세요.',
 DEMO_PROFILE_CHANGED:'다른 창에서 정보를 수정했어요. 작성한 내용은 남겨 두었으니 최신 내용을 확인해 주세요.',DEMO_REQUEST_CHANGED:'이 요청의 내용이 달라졌어요. 원래 요청 결과부터 확인해 주세요.',
 DEMO_PERMISSION_REQUIRED:'이 계정에서는 할 수 없는 작업이에요.',DEMO_PROBE_NOT_ALLOWED:'점검용 체험은 등록된 통합관리자만 준비할 수 있어요.',DEMO_WRITE_LIMIT:'이 체험 공간에서 준비한 저장 횟수를 모두 사용했어요.',
 DEMO_INPUT_INVALID:'입력한 내용과 길이를 확인해 주세요.',DEMO_FILE_LIMIT:'이 체험에 준비한 첨부 용량을 모두 사용했어요. 안내 부스로 문의해 주세요.',DEMO_DOWNLOAD_LIMIT:'이 체험에 준비한 파일 열기 한도를 모두 사용했어요. 안내 부스로 문의해 주세요.',
 DEMO_FILE_UNAVAILABLE:'첨부파일의 업로드 상태를 확인해 주세요. 이미 다른 문서에 사용한 파일은 다시 첨부할 수 없어요.'};
 return Object.entries(messages).find(([k])=>s.includes(k))?.[1]||'처리 결과를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.';
}
export async function factory(data){
 const {data:result,error}=await client.functions.invoke('erp-expo-session',{body:data});
 if(error){let body;try{body=await error.context.json();}catch{}throw Error(body?.error||'DEMO_UNAVAILABLE');}
 if(result?.error)throw Error(result.error);return result;
}
