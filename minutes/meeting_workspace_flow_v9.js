/* UI modal revision: 20261013.1 — preserve business versions, authority and drafts. */
/*
Version: v1.20.2
Change: 2026-11-27 - 기본정보, 안건, 회의자료의 조회 시점을 분리.
*/
import { supabase } from '../shared/supabase-client.js';
import { MinutesService } from './MinutesService.js?v=1.0.61';
import { MeetingPackageService } from './MeetingPackageService.js?v=1.9.2';
import { createMeetingNotHeld } from './meeting_not_held_v2.js';
import { listMeetingAnnexes, appendMeetingTextAnnexes, orderMeetingAnnexes, setMeetingAnnexLink, moveMeetingAnnex } from './meeting_annex_import.js?v=1.1.2';
import { AGENDA_LOCK_REASON, BOARD_AGENDA_LOCK_REASON, protectMaterialAgendas, clearMaterialAgendaUi, guardMaterialAgendaInput } from './meeting_agenda_lock.js?v=1.2.0';
import { buildAssemblyAgendaPlan, buildAuditReportDraft, buildBoardTextAnnex, buildPreMeetingDocuments, getAssemblyChapterEditLock, usesChapterEditor } from './meeting_templates_v1_8.js';
import { assemblyBaseOptions, assemblyDecisionTypes, assemblyMinutePlan, encodeAssemblyMinutePlan, currentBaseOrder, agendaSkeleton } from './assembly_agenda_controls_v1.js';
import { labelPracticalScript } from './board_script_transfer.js?v=1.0.2';
import { SIGNATURE_PREVIEW_BUCKET } from './signature_preview.js?v=1.0.0';

let pdfRendererRequest = null;
let pdfRendererAttempt = 0;
let pdfIdentityRevision = 0;
function getPdfRenderer() {
  if (!pdfRendererRequest) {
    // A browser caches failed module imports. Retry only this same-origin tool
    // with a new attempt URL; successful imports remain shared in memory.
    const request = pdfRendererAttempt
      ? import(`../shared/pdf-page-renderer.js?v=1.0.1&retry=${pdfRendererAttempt}`)
      : import('../shared/pdf-page-renderer.js?v=1.0.1');
    pdfRendererRequest = request.catch(error => {
      pdfRendererAttempt++;
      pdfRendererRequest = null;
      throw error;
    });
  }
  return pdfRendererRequest;
}

function pdfActionStillCurrent(owner, anchor) {
  return state.session?.user?.id === owner.userId && state.runtime?.coop_id === owner.coopId
    && state.current?.id === owner.packageId && pdfIdentityRevision === owner.identity && !window.frameElement?.hidden
    && (anchor === undefined || activePdfAttachmentAnchor() === anchor);
}
function pdfActionOwner() {
  return { userId: state.session?.user?.id, coopId: state.runtime?.coop_id, packageId: state.current?.id, identity: pdfIdentityRevision };
}

const $ = (id) => document.getElementById(id);
const TYPE_LABEL = { BOARD: '이사회', GENERAL_ASSEMBLY: '대의원총회' };
const KIND_LABEL = { REPORT: '보고 안건', DECISION: '의결 안건', DISCUSSION: '논의 안건', OTHER: '기타 안건' };
const DOC_LABEL = { MATERIALS: '회의 자료', SCENARIO: '의장용 진행 시나리오', SCENARIO_SECRETARIAT: '실무자용 진행 시나리오' };
const STATUS_LABEL = { DRAFT: '초안', READY: '회의자료 완성', FINAL: '완료', CANCELLED: '회의 무산' };

const state = {
  session: null,
  runtime: null,
  company: {},
  officials: [],
  meetingHistory: [],
  packages: [],
  current: null,
  agendaLock: null,
  notHeld: null,
  agendas: [],
  documents: new Map(),
  inheritedChairStyle: null,
  pdfAttachments: [],
  sourceContext: null,
  auditChangeRequests: [],
  activeDocument: 'MATERIALS',
  currentStep: 'info',
  documentDirty: false,
  infoDirty: false,
  agendaDirty: false,
  pendingDocuments: new Set(),
  auditDraftDirty: false,
  auditDraftExpected: null,
  chapters: [],
  activeChapterId: null,
  loading: false,
  autoDraftTimer: null
};

const guidedRoute=()=>window.ErpBoardFlow?.parse(location.href);
const guidedStage=()=>guidedRoute()?.stage;
const guidedStatus=()=>window.ErpBoardFlow?.getSnapshot();
const isScenarioStage=()=>guidedStage()==='scenario';
function documentInStage(type) {
  if(isScenarioStage())return window.ErpBoardFlow.posted(guidedStatus()||{})
    &&(type==='SCENARIO'||(type==='SCENARIO_SECRETARIAT'&&guidedRoute().kind==='BOARD'));
  return type==='MATERIALS';
}
function openGuidedStage(id,stage,kind) {
  const href=window.ErpBoardFlow.url(id,stage,kind);
  if(!href)return;
  // A direct visit starts the workspace in the same browser tab. Inside the
  // workspace, its existing navigation owns drafts and authorization, even
  // when the parent tab was loaded with an older flow asset.
  if(window.parent===window&&!guidedRoute()&&window.ErpWorkspaceRoute?.address){
    window.ErpWorkspaceResume.navigate(window.ErpWorkspaceRoute.address(href));
  }else window.ErpWorkspaceResume.navigate(href);
}

let meetingSelection=null;
function openMeetingFromList(id) {
  if(!meetingEntryReady||state.loading||!window.ErpBoardFlow)return;
  const row=state.packages.find(p=>p.id===id);
  if(!row||!['BOARD','GENERAL_ASSEMBLY'].includes(row.meeting_type))return;
  if(assemblyBookletRequested&&row.meeting_type==='GENERAL_ASSEMBLY')return openPackage(id);
  const flow=window.ErpBoardFlow;
  const owner=meetingDetailOwner(),revision=meetingDetailRevision,coopId=state.runtime?.coop_id;
  if(meetingSelection?.id===id&&meetingSelection.owner===owner&&meetingSelection.revision===revision)return meetingSelection.promise;
  const request={id,owner,revision,promise:null};
  meetingSelection=request;
  setMeetingDetailStatus('회의 단계를 확인하고 있어요…');
  const current=()=>meetingSelection===request&&owner===meetingDetailOwner()&&revision===meetingDetailRevision
    &&!document.hidden&&!window.frameElement?.hidden;
  request.promise=boundedMeetingRead(()=>flow.read(supabase,coopId,{id,kind:row.meeting_type,stage:'prepare'}))
    .then(status=>{
      if(!current())return;
      setMeetingDetailStatus();
      rememberAutomaticEntry();
      openGuidedStage(id,flow.nextStage(status,row.meeting_type),row.meeting_type);
    }).catch(()=>{
      if(current()){
        $('meetingPicker').hidden=false;
        setMeetingDetailStatus('회의 단계를 불러오지 못했어요. 다시 확인해 주세요.',{id,owner,revision,selection:true});
      }
    }).finally(()=>{if(meetingSelection===request)meetingSelection=null;});
  return request.promise;
}

// Only mark the current history entry, never a user preference or cached record.
// Back returns to the picker without immediately sending the user forward again.
function meetingEntryHistory(){
  if(window.parent===window)return window.history;
  try{
    const outer=new URL(window.parent.location.href);
    const view=outer.searchParams.get('view');
    if(!/^\/erp\/workspace(?:\.html)?\/?$/.test(outer.pathname)
        ||window.ErpWorkspaceRoute.route(view)!==window.ErpWorkspaceRoute.route(location.href))return null;
    return window.parent.history;
  }catch(_){return null;}
}
function rememberAutomaticEntry(){
  try{
    const entry=meetingEntryHistory();
    if(entry)entry.replaceState({...entry.state,meetingIndexShown:true},'');
  }catch(_){}
}
const enteredFromMeetingHistory=(()=>{
  try{return meetingEntryHistory()?.state?.meetingIndexShown===true;}catch(_){return false;}
})();
function automaticMeeting(){
  const here=new URL(location.href);
  if(here.search||here.hash||assemblyBookletRequested||enteredFromMeetingHistory)return null;
  // Old shells still use the plain URL for their "회의 목록" button.
  // In that shell it must remain a way back to the list.
  try{if(window.parent!==window&&window.parent.ErpBoardFlow?.meetingPickerEntry!==true)return null;}catch(_){return null;}
  try{if(meetingEntryHistory()?.state?.meetingIndexShown===true)return null;}catch(_){}
  const active=state.packages.filter(row=>!isArchivedPackage(row)&&['BOARD','GENERAL_ASSEMBLY'].includes(row.meeting_type));
  return active.length===1?active[0]:null;
}

const meetingNotHeld=createMeetingNotHeld({document,owner:pdfActionOwner,current:pdfActionStillCurrent,
 hidden:()=>document.hidden||!!window.frameElement?.hidden,pack:()=>state.current,agendas:()=>state.agendas,packages:()=>state.packages,
 annexes:()=>listMeetingAnnexes(state.documents.get('MATERIALS')?.content_html,state.pdfAttachments,{document,sanitizeHtml}),sourceRevision:()=>state.notHeld?.revision,
 guided:()=>guidedStage()==='outcome',
 dirty:()=>hasUnsavedPacketChanges(),notice:showToast,confirm:message=>window.CoopDialog.confirm(message),
 checkpoint:root=>window.ErpWorkspaceResume?.checkpoint(root),
 call:(action,owner,payload,key)=>MeetingPackageService.notHeld(action,owner,payload,key),
 done:async(owner,result,current,annexes,sourceOrder)=>{if(!pdfActionStillCurrent(owner)||!current())return false;try{await loadPackages();if(!pdfActionStillCurrent(owner)||!current()||hasUnsavedPacketChanges())return false;const targetId=result.target_package||owner.packageId;await openPackage(targetId,{internal:true});if(state.current?.id!==targetId||state.session?.user?.id!==owner.userId||state.runtime?.coop_id!==owner.coopId||pdfIdentityRevision!==owner.identity||window.frameElement?.hidden)return false;if(result.target_package)applyCarriedTextAnnexes(annexes,owner.packageId,sourceOrder);return true;}catch(_){if(pdfActionStillCurrent(owner)&&current())showToast('처리는 완료했지만 목록을 불러오지 못했습니다. 같은 창을 다시 열어 처리 결과를 확인해 주세요.',4800);return false;}}
});
function applyCarriedTextAnnexes(annexes,sourceId,sourceOrder=[]){
 const agendaMap=Object.fromEntries((state.notHeld?.carryovers||[]).filter(x=>x.source_package===sourceId).map(x=>[x.source_agenda,x.target_agenda]));
 const row=state.documents.get('MATERIALS')||{},next=appendMeetingTextAnnexes(row.content_html||'',annexes,sourceId,{document,sanitizeHtml,agendaMap,agendas:state.agendas,pdfs:state.pdfAttachments,sourceOrder});
 if(!next.added)return 0;
 state.documents.set('MATERIALS',{...row,document_type:'MATERIALS',content_html:next.html,manually_edited:true});state.pendingDocuments.add('MATERIALS');
 if(state.activeDocument==='MATERIALS'){renderActiveDocument();state.documentDirty=true;}
 showToast(next.orderReview?'별첨을 초안에 넣었습니다. 기존 순서는 유지했으니 별첨 연결·순서에서 추가된 위치를 확인해 주세요.':'선택한 별첨을 회의자료 초안에 넣었습니다. 내용을 확인하고 저장해 주세요.',next.orderReview?6000:4500);
 return next.added;
}
const notHeldDisabled=new Map();
function restoreNotHeldControls(){for(const[node,prior]of notHeldDisabled){if(node.isConnected)node.disabled=prior;}notHeldDisabled.clear();}
function renderNotHeldState(){
 const closed=state.current?.status==='CANCELLED';
 $('markNotHeldButton').hidden=guidedStage()!=='outcome'||closed||!window.ErpBoardFlow.canRecord(guidedStatus()||{});
 $('carryAgendasButton').hidden=!closed||state.current?.meeting_type!=='BOARD';$('notHeldPanel').hidden=!closed&&!state.notHeld?.carryovers?.length&&!state.notHeld?.inheritedAttachments?.length;
 const record=state.notHeld?.record;
 $('notHeldSummary').textContent=closed?`성원 미달 · 재적 ${record?.eligible_count??'—'}명 / 참석 ${record?.attendee_count??'—'}명 · 안건 미심의`:state.notHeld?.carryovers?.length?'이전 회의의 미심의 안건을 가져온 초안입니다.':'';
 $('viewNotHeldButton').hidden=!closed||!state.current?.published_minute_id;
 const sources=[...new Map((state.notHeld?.carryovers||[]).map(x=>[x.source_package,x.source_title])).entries()];
 $('notHeldSources').replaceChildren();for(const[id,title]of sources){const b=document.createElement('button');b.type='button';b.className='btn btn-small';b.textContent='원본 회의 · '+title;b.onclick=()=>void openPackage(id).catch(e=>showToast(e.message));$('notHeldSources').append(b);}
 $('inheritedPdfList').replaceChildren();for(const row of state.pdfAttachments.filter(x=>x.inherited)){const b=document.createElement('button');b.type='button';b.className='btn btn-small';b.textContent='📎 '+row.title+' · 원본 연결';b.onclick=()=>void runAction(async()=>{const owner=pdfActionOwner(),r=await MeetingPackageService.createPdfAttachmentSignedUrl(row.storage_path);if(r.error)throw r.error;if(pdfActionStillCurrent(owner)&&r.data?.signedUrl)window.open(r.data.signedUrl,'_blank','noopener');});$('inheritedPdfList').append(b);}
 if(!closed)return;
 $('agendaLockStatus').textContent='회의 무산 · 기록 보관';$('agendaLockStatus').title='미심의 안건은 다음 회의 준비에서 가져올 수 있습니다.';
 $('documentEditStatus').textContent='무산된 회의의 원본 자료입니다.';
 for(const id of ['editDocumentButton','takeDocumentEditButton','refreshDocumentEditButton'])$(id).hidden=true;
 const nodes=[...document.querySelectorAll('#editorBody input,#editorBody select,#editorBody textarea,#agendaList [data-agenda-action]'),...['deletePackageButton','saveInfoButton','saveAgendasButton','generateAllButton','saveDocumentButton','completeMaterialsButton','addAgendaButton','addPdfAttachmentButton','addChapterButton','deleteChapterButton','moveChapterUpButton','moveChapterDownButton','addBoardAnnexButton','discardBoardAnnexDraft','editDocumentButton','takeDocumentEditButton'].map($).filter(Boolean)];
 for(const node of nodes){if(!notHeldDisabled.has(node))notHeldDisabled.set(node,node.disabled);node.disabled=true;}
 $('documentEditor').contentEditable='false';$('chapterEditor').contentEditable='false';
}

const documentEditStates = new Map(), documentSavedRows = new Map(), documentConflicts = new Set();
let documentEditEpoch=0, documentEditRefresh=null;
function documentEditKey(type=state.activeDocument) { return `${state.current?.id}:${type}`; }
function documentValue(row) { return JSON.stringify([row?.title||'',row?.content_html||'']); }
function documentEditingAllowed(type=state.activeDocument) {
  return !!state.current && state.current.status!=='CANCELLED' && !documentConflicts.has(documentEditKey(type))
    && MeetingPackageService.documentEdits.owned(pdfActionOwner(),type);
}
function renderDocumentEditState() {
  if (!$('documentEditStatus')) return;
  const allowed=documentEditingAllowed(), busy=state.loading, entry=documentEditStates.get(documentEditKey());
  $('documentEditStatus').toggleAttribute('data-idle',!allowed&&!entry?.failed&&!entry?.busy&&!entry?.closed&&!documentConflicts.has(documentEditKey()));
  $('documentEditStatus').textContent = allowed ? '편집 중입니다.' : documentConflicts.has(documentEditKey())
    ? '다른 사람이 저장한 내용이 있습니다. 최신 문서와 작성한 초안을 확인해 주세요.'
    : entry?.busy ? `${entry.holder_name||'조합 담당자'} 님이 편집 중입니다.`
    : entry?.failed ? '편집권을 확인하지 못했습니다. 다시 확인해 주세요.'
    : '읽기 전용입니다. 수정하려면 편집을 눌러 주세요.';
  $('editDocumentButton').hidden=allowed || !!entry?.busy || !!entry?.closed || documentConflicts.has(documentEditKey());
  $('editDocumentButton').disabled=busy;
  $('endDocumentEditButton').hidden=!MeetingPackageService.documentEdits.owned(pdfActionOwner(),state.activeDocument);
  $('takeDocumentEditButton').hidden=!entry?.busy || !entry?.can_takeover || allowed;
  $('refreshDocumentEditButton').disabled=busy;
  $('refreshDocumentEditButton').hidden=allowed || !(entry?.failed || entry?.busy || entry?.closed || documentConflicts.has(documentEditKey()));
  $('saveCurrentDocumentButton').disabled=busy || !allowed;
  if(document.body.hasAttribute('data-board-materials'))$('saveCurrentDocumentButton').hidden=!allowed;
  const guide=$('materials-chatgpt-guide');
  window.CoopChatGptEditGuide?.setVisible(guide,!busy&&allowed&&state.activeDocument==='MATERIALS'&&!(chapterMode()&&activeChapterLock().locked));
  $('documentTitle').readOnly=!allowed;
  if(chapterMode()) renderChapterEditState();
  else { $('documentEditor').contentEditable=allowed?'true':'false';$('documentEditor').setAttribute('aria-readonly',String(!allowed)); }
  for(const button of document.querySelectorAll('.rich-toolbar [data-command]'))button.disabled=busy||!allowed||(chapterMode()&&activeChapterLock().locked);
  for(const id of ['addChapterButton','moveChapterUpButton','moveChapterDownButton','deleteChapterButton','addBoardAnnexButton']) {
    if(!allowed||busy)$(id).disabled=true;
  }
  $('addChapterButton').disabled=busy||!allowed;
  $('addBoardAnnexButton').disabled=busy||!['DRAFT','READY'].includes(state.current?.status);
  document.querySelectorAll('#boardAnnexLinks select,#boardAnnexLinks button').forEach(n=>n.disabled=busy||!allowed||n.dataset.edge==='true');
  $('documentEditConflict').hidden=!documentConflicts.has(documentEditKey());
  renderNotHeldState();
  renderPendingPdf();
  // Viewing, printing and existing File selection are independent of body editing.
}

async function refreshDocumentEditState() {
  if(!state.current || pendingSection('documents') || document.hidden || window.frameElement?.hidden)return;
  const owner=pdfActionOwner(),epoch=documentEditEpoch,active=state.activeDocument;
  if(guidedRoute()?.kind==='BOARD'&&['prepare','agenda'].includes(guidedStage())
    &&!Object.keys(DOC_LABEL).some(type=>MeetingPackageService.documentEdits.owned(owner,type)))return;
  const scope=JSON.stringify([owner.userId,owner.coopId,owner.packageId,owner.identity,epoch,active]);
  const current=()=>pdfActionStillCurrent(owner)&&epoch===documentEditEpoch&&active===state.activeDocument&&!document.hidden;
  if(documentEditRefresh){
    if(documentEditRefresh.scope===scope)return documentEditRefresh;
    const resume=()=>{if(current())return refreshDocumentEditState();};
    return documentEditRefresh.then(resume,resume);
  }
  const task=(async()=>{
    for(const type of Object.keys(DOC_LABEL)) {
      if(!current())break;
      if(type!==state.activeDocument&&!MeetingPackageService.documentEdits.owned(owner,type))continue;
      try{
        const data=await MeetingPackageService.documentEdits.manage(owner,type,MeetingPackageService.documentEdits.owned(owner,type)?'renew':'status');
        if(current())documentEditStates.set(documentEditKey(type),data);
      }catch(error){if(error?.code!=='MEETING_EDIT_REQUEST_STALE'&&current())documentEditStates.set(documentEditKey(type),{failed:true});}
    }
    if(current())renderDocumentEditState();
  })().finally(()=>{if(documentEditRefresh===task)documentEditRefresh=null;});
  task.scope=scope;
  documentEditRefresh=task;return task;
}
async function beginDocumentEdit(force=false) {
  if(!state.current)return;
  const owner=pdfActionOwner(),type=state.activeDocument,epoch=documentEditEpoch;
  rememberActiveDocument();
  if(force && !(await window.CoopDialog.confirm('이 문서의 편집권을 가져올까요?')))return;
  if(!pdfActionStillCurrent(owner)||type!==state.activeDocument||epoch!==documentEditEpoch)return;
  const result=await MeetingPackageService.documentEdits.manage(owner,type,'acquire',force);
  if(!pdfActionStillCurrent(owner)||type!==state.activeDocument||epoch!==documentEditEpoch)return;
  documentEditStates.set(documentEditKey(type),result);
  if(result.owned){
    const current=state.documents.get(type),saved=documentSavedRows.get(type),remote=result.document;
    if(state.pendingDocuments.has(type)&&documentValue(saved)!==documentValue(remote)){
      documentConflicts.add(documentEditKey(type));
      $('documentEditRemote').innerHTML=sanitizeHtml(remote?.content_html||'<p>저장된 문서가 없습니다.</p>');
      $('documentEditConflict').open=true;
    }else if(!state.pendingDocuments.has(type)&&remote){
      state.documents.set(type,remote);documentSavedRows.set(type,remote);renderActiveDocument();
    }else if(!state.pendingDocuments.has(type)&&!saved&&!remote&&isScenarioStage()&&guidedRoute()?.kind==='BOARD'){
      await loadPreviousScenarioStyle(owner);
      if(!pdfActionStillCurrent(owner)||type!==state.activeDocument||epoch!==documentEditEpoch)return;
      refreshAutoDrafts({render:false});renderActiveDocument();
    }
  }
  renderDocumentEditState();
}
async function keepDocumentDraft() {
  const owner=pdfActionOwner(),type=state.activeDocument,epoch=documentEditEpoch;
  if(!documentConflicts.has(documentEditKey(type)))return;
  if(!(await window.CoopDialog.confirm('현재 작성한 초안으로 편집을 이어갈까요? 저장하면 확인한 최신 문서를 바꿉니다.')))return;
  if(!pdfActionStillCurrent(owner)||type!==state.activeDocument||epoch!==documentEditEpoch)return;
  if(!MeetingPackageService.documentEdits.owned(owner,type))throw new Error('편집권을 다시 확인해 주세요.');
  documentConflicts.delete(documentEditKey(type));renderDocumentEditState();
}
async function endDocumentEdit() {
  const owner=pdfActionOwner(),type=state.activeDocument;
  rememberActiveDocument();
  await MeetingPackageService.documentEdits.manage(owner,type,'release');
  if(pdfActionStillCurrent(owner)){documentEditStates.delete(documentEditKey(type));renderDocumentEditState();}
}
function freezeDocumentEditing() {
  meetingNotHeld.invalidate();
  if(!state.current)return;
  rememberActiveDocument();documentEditEpoch++;
  MeetingPackageService.documentEdits.freeze(pdfActionOwner());renderDocumentEditState();
}
function applySavedDocuments(owner,rows) {
  if(!pdfActionStillCurrent(owner))return;
  for(const row of rows||[]){
    const type=row.document_type,current=state.documents.get(type);
    documentSavedRows.set(type,row);
    if(documentValue(current)===documentValue(row)){
      state.documents.set(type,row);state.pendingDocuments.delete(type);
      if(type===state.activeDocument)state.documentDirty=false;
    }
  }
  if(rows?.some(row=>row.document_type==='MATERIALS'))syncSavedMeetingProgress();
}

function syncSavedMeetingProgress(patch={}) {
  const flow=window.ErpBoardFlow, route=flow?.parse(location.href), snapshot=flow?.getSnapshot(), row=state.current;
  if(!route||route.id!==snapshot?.id||row?.id!==route.id||row.meeting_type!==route.kind||snapshot.coopId!==state.runtime?.coop_id)return;
  const materials=documentSavedRows.get('MATERIALS');
  const materialsSaved=materials ? !!materials.content_html?.trim() : snapshot.materialsSaved;
  const hasPlan=row.meeting_type!=='GENERAL_ASSEMBLY'||(materials ? /data-assembly-plan="[0-9a-f]+"/.test(materials.content_html||'') : snapshot.materialsReady);
  flow.adopt({...snapshot,title:row.title,date:row.meeting_date,noticeDate:row.notice_date,start:row.start_time,end:row.end_time,
    location:row.location,status:row.status,materialsSaved,materialsReady:!!materialsSaved&&!!hasPlan&&['READY','FINAL'].includes(row.status),...patch});
}

let scenarioReviewPending = null, scenarioReviewEpoch = 0;
async function reviewedMeetingAction(action) {
  if (!state.current || state.loading || scenarioReviewPending) return;
  const owner=pdfActionOwner(),epoch=documentEditEpoch,reviewEpoch=scenarioReviewEpoch,type=state.activeDocument,step=state.currentStep,request={},focus=document.activeElement;
  const current=()=>pdfActionStillCurrent(owner)&&epoch===documentEditEpoch&&reviewEpoch===scenarioReviewEpoch&&type===state.activeDocument&&step===state.currentStep;
  scenarioReviewPending=request;
  try {
    // A result lookup resumes the original save, not a new document submission.
    const recovering=action===saveWholeMeetingDraft&&MeetingPackageService.documentEdits.hasPending(owner);
    if(state.current.meeting_type==='BOARD'&&isScenarioStage()&&!recovering){
      const accepted=await window.CoopDialog.confirm('의장용·실무자용 시나리오를 모두 확인하셨나요?',{confirmText:'확인',cancelText:'취소'});
      if(!accepted){
        let parentFocused=true;try{parentFocused=!window.frameElement||window.parent.document.activeElement===window.frameElement;}catch(_){parentFocused=false;}
        if(current()&&parentFocused&&focus?.isConnected&&!focus.disabled
          && [document.body,focus,$('documentEditor'),$('chapterEditor')].includes(document.activeElement))focus.focus({preventScroll:true});
        return;
      }
    }
    if(!current())return;
    return await runAction(action);
  } finally { if(scenarioReviewPending===request)scenarioReviewPending=null; }
}

let meetingDefaultsPending = null;
let meetingDefaultsReady = false;
let meetingHistoryPending = null;
let meetingHistoryReady = false;
let meetingDefaultsRevision = 0;
let meetingEntryPending = null, meetingEntryRevision = 0, meetingEntryReady = false;
let meetingEventsBound = false, meetingLifecycleBound = false;
let meetingDetailRead = null, meetingDetailRevision = 0, meetingDetailRetry = null;
let agendasLoaded = false, documentsSection = '', sectionRequest = null;

function pendingSection(step) {
  if (!state.current) return '';
  if (step==='agendas'&&!agendasLoaded) return 'agenda';
  const docSection=isScenarioStage()?'scenario':'materials';
  if (step==='documents'&&documentsSection!=='full'&&documentsSection!==docSection) return docSection;
  return '';
}
function setSectionStatus(message='', retry=false){
  $('meetingSectionStatus').hidden=!message;
  $('meetingSectionMessage').textContent=message;
  $('retryMeetingSection').hidden=!retry;
}
function cancelSectionRead(){
  const request=sectionRequest;sectionRequest=null;request?.controller.abort();
}
function acceptDocumentSections(data,section){
  documentsSection=section;
  for(const row of data.documents||[]){
    documentSavedRows.set(row.document_type,row);
    state.documents.set(row.document_type,row);
  }
  if(section!=='scenario'){
    state.pdfAttachments=data.pdfAttachments||[];
    state.notHeld=data.notHeld||null;
  }
  if(state.current?.meeting_type==='BOARD'){
    const source=state.documents.get('SCENARIO')||state.documents.get('SCENARIO_SECRETARIAT');
    state.inheritedChairStyle=source?reusableChairStyle(source.content_html,state.current):null;
  }
}
function loadMeetingSection(step,section){
  const id=state.current?.id,owner=meetingDetailOwner();
  if(!id||!section||sectionRequest?.step===step)return;
  cancelSectionRead();
  const request={step,controller:new AbortController()};sectionRequest=request;
  const current=()=>sectionRequest===request&&state.current?.id===id&&owner===meetingDetailOwner()
    &&state.currentStep===step&&!document.hidden&&!window.frameElement?.hidden;
  const label=section==='agenda'?'안건을':'회의자료를';
  setSectionStatus(label+' 불러오는 중…');
  // The workspace may call this while restoring a parked frame. Wait until
  // the approved target is actually visible before starting its requests.
  void boundedMeetingRead(async()=>{
    if(!current())return;
    const includeAgendas=!agendasLoaded;
    const {data,error}=await MeetingPackageService.getPackageSections(id,{section,includeAgendas,signal:request.controller.signal});
    if(!current())return;
    if(error||!data)throw error||Error('회의 항목 조회 실패');
    if(includeAgendas){state.agendas=agendaTypes(data.agendas,state.current.assembly_booklet_data);agendasLoaded=true;renderAgendaList();}
    if(section!=='agenda')acceptDocumentSections(data,section);
    switchStep(step);
  }).catch(()=>{
    if(current())setSectionStatus(label+' 불러오지 못했어요.',true);
    request.controller.abort();
  }).finally(()=>{if(sectionRequest===request)sectionRequest=null;});
}

function meetingDetailOwner() {
  return JSON.stringify([state.session?.user?.id,state.runtime?.coop_id,pdfIdentityRevision]);
}
function setMeetingDetailStatus(message = '', retry = null) {
  meetingDetailRetry = retry;
  $('meetingDetailStatus').hidden = !message;
  $('meetingDetailMessage').textContent = message;
  $('retryMeetingDetail').hidden = !retry;
  $('retryMeetingDetail').disabled = !retry || !meetingEntryReady || state.loading;
}
function invalidateMeetingDetailRead() {
  meetingDetailRevision++;
  meetingDetailRead?.cancel();
  setMeetingDetailStatus();
}

function boundedMeetingRead(work) {
  let timer;
  return Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
    timer = window.setTimeout(() => {
      const error = new Error('조회 시간이 길어지고 있습니다. 다시 시도해 주세요.');
      error.code = 'MEETING_READ_TIMEOUT'; reject(error);
    }, 15000);
  })]).finally(() => window.clearTimeout(timer));
}

function setMeetingEntryStatus(message = '', retry = false) {
  $('meetingEntryStatus').hidden = !message;
  $('meetingEntryMessage').textContent = message;
  $('retryMeetingEntry').hidden = !retry;
  $('retryMeetingEntry').disabled = !retry;
  $('newPackageButton').disabled = !meetingEntryReady || state.loading;
}
const newPackageDrafts = new Map();
let newPackageDraftOwner = '', newPackageDraftKey = '', newPackageDraftBaseline = '';
let newPackageDialogRevision = 0;
let newPackagePreparation = null;

function invalidateNewPackagePreparation() {
  const request = newPackagePreparation;
  if (!request) return;
  newPackagePreparation = null;
  newPackageDialogRevision++;
  // Only a cancelled New read is invalidated; drafts and business writes stay intact.
  meetingDefaultsRevision++;
  meetingDefaultsReady = false; meetingHistoryReady = false;
  meetingDefaultsPending = null; meetingHistoryPending = null;
  request.cancel();
}

function newPackageOwnerKey() {
  return state.session?.user?.id && state.runtime?.coop_id
    ? JSON.stringify([state.session.user.id, state.runtime.coop_id, pdfIdentityRevision]) : '';
}
function newPackageValues() {
  return JSON.stringify([$('newMeetingNumber').value, $('newMeetingTitle').value]);
}
function rememberNewPackageDraft() {
  if (!newPackageDraftKey || !newPackageDraftOwner || newPackageDraftOwner !== newPackageOwnerKey()) return;
  const values = newPackageValues();
  if (values === newPackageDraftBaseline) newPackageDrafts.delete(newPackageDraftKey);
  else newPackageDrafts.set(newPackageDraftKey, {values, baseline:newPackageDraftBaseline});
  syncNewPackageDraftUi();
}
function hasUnsavedNewPackageDraft() {
  if (!newPackageDraftOwner || newPackageDraftOwner !== newPackageOwnerKey()) return false;
  return newPackageDrafts.size > 0 || (!!newPackageDraftKey && newPackageValues() !== newPackageDraftBaseline);
}
function syncNewPackageDraftUi() {
  const dirty = !!newPackageDraftKey && newPackageValues() !== newPackageDraftBaseline;
  $('discardNewPackage').disabled = !dirty || state.loading;
  $('newPackageDraftStatus').textContent = dirty ? '작성 중' : '';
}
function activateNewPackageDraft() {
  rememberNewPackageDraft();
  const owner = newPackageOwnerKey();
  if (owner !== newPackageDraftOwner) {
    newPackageDrafts.clear(); newPackageDraftOwner = owner;
  }
  newPackageDraftKey = JSON.stringify([$('newMeetingType').value, $('newMeetingType').value === 'GENERAL_ASSEMBLY' ? $('newAssemblyKind').value : '']);
  $('newAssemblyKindField').hidden = $('newMeetingType').value !== 'GENERAL_ASSEMBLY';
  const draft = newPackageDrafts.get(newPackageDraftKey);
  if (draft) {
    const [number, title] = JSON.parse(draft.values);
    $('newMeetingNumber').value = number; $('newMeetingTitle').value = title;
    newPackageDraftBaseline = draft.baseline;
  } else {
    fillNewPackageSuggestion(); newPackageDraftBaseline = newPackageValues();
    window.ErpWorkspaceResume?.checkpoint($('newPackageModal'));
  }
  syncNewPackageDraftUi();
}
function closeNewPackage() {
  rememberNewPackageDraft(); newPackageDialogRevision++;
  $('newPackageModal').classList.remove('show');
  if (!window.frameElement?.hidden) $('newPackageButton').focus({preventScroll:true});
}
function clearNewPackageDrafts() {
  newPackageDialogRevision++; newPackageDrafts.clear();
  newPackageDraftOwner = ''; newPackageDraftKey = ''; newPackageDraftBaseline = '';
  $('newPackageModal').classList.remove('show');
  $('newMeetingTitle').value = ''; $('newMeetingNumber').value = '';
}
async function discardNewPackageDraft() {
  if (state.loading || !newPackageDraftKey) return;
  const owner = newPackageOwnerKey(), key = newPackageDraftKey, values = newPackageValues(), revision = newPackageDialogRevision;
  let host = window;
  try {
    while (host.parent !== host && host.parent.location.origin === host.location.origin && host.parent.CoopDialog) host = host.parent;
  } catch (_) { /* Use the current permitted dialog host. */ }
  if (host.CoopDialog?.hasPending?.()) return;
  const choice = window.CoopDialog.confirm('이 초안을 버릴까요?');
  const dialog = host.document.querySelector('dialog.coop-dialog[open]');
  const keepFocus = event => {
    if (event.key !== 'Tab' || !dialog?.open || event.defaultPrevented || event.isComposing
      || event.ctrlKey || event.altKey || event.metaKey) return;
    const controls = [...dialog.querySelectorAll('button,input,a[href],[tabindex]')]
      .filter(node => !node.disabled && node.tabIndex >= 0 && !node.hidden && node.getClientRects().length);
    if (!controls.length) return;
    const index = controls.indexOf(host.document.activeElement);
    const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
    event.preventDefault(); event.stopImmediatePropagation();
    controls[next].focus();
  };
  dialog?.addEventListener('keydown', keepFocus, true);
  let confirmed;
  try { confirmed = await choice; }
  finally { dialog?.removeEventListener('keydown', keepFocus, true); }
  if (!confirmed) return;
  if (!owner || owner !== newPackageOwnerKey() || key !== newPackageDraftKey || values !== newPackageValues()
    || revision !== newPackageDialogRevision || state.loading || window.frameElement?.hidden || !$('newPackageModal').classList.contains('show')) return;
  const previousFocus = document.activeElement;
  const resumeInput = previousFocus === $('discardNewPackage') || previousFocus === document.body || previousFocus === document.documentElement;
  newPackageDrafts.delete(key); fillNewPackageSuggestion(); newPackageDraftBaseline = newPackageValues();
  window.ErpWorkspaceResume?.checkpoint($('newPackageModal')); syncNewPackageDraftUi();
  if (resumeInput && !host.document.querySelector('dialog[open]')) $('newMeetingType').focus();
}

function meetingDefaultsStillCurrent(owner) {
  return state.session?.user?.id === owner.userId && state.runtime?.coop_id === owner.coopId
    && pdfIdentityRevision === owner.identity && meetingDefaultsRevision === owner.revision && !window.frameElement?.hidden;
}

async function ensureMeetingDefaults({ history = false } = {}) {
  const owner = { userId:state.session?.user?.id, coopId:state.runtime?.coop_id,
    identity:pdfIdentityRevision, revision:meetingDefaultsRevision };
  if (!meetingDefaultsReady && !meetingDefaultsPending) {
    const request = (async () => {
      const [officials, company] = await boundedMeetingRead(() => Promise.all([
        MinutesService.getOfficials({ strict:true }), MinutesService.getCompanyInfo()
      ]));
      if (company.error) throw company.error;
      if (!meetingDefaultsStillCurrent(owner)) throw new Error('현재 회의 화면에서 다시 불러와 주세요.');
      state.officials = officials || [];
      state.company = company.data || {};
      meetingDefaultsReady = true;
    })();
    meetingDefaultsPending = request;
    request.finally(() => { if (meetingDefaultsPending === request) meetingDefaultsPending = null; }).catch(() => {});
  }
  if (history && !meetingHistoryReady && !meetingHistoryPending) {
    const request = (async () => {
      const result = await boundedMeetingRead(() => MeetingPackageService.listMeetingHistory());
      if (result.error) throw result.error;
      if (!meetingDefaultsStillCurrent(owner)) throw new Error('현재 회의 화면에서 다시 불러와 주세요.');
      state.meetingHistory = result.data || [];
      meetingHistoryReady = true;
    })();
    meetingHistoryPending = request;
    request.finally(() => { if (meetingHistoryPending === request) meetingHistoryPending = null; }).catch(() => {});
  }
  await Promise.all([meetingDefaultsPending, history ? meetingHistoryPending : null]);
  if (!meetingDefaultsStillCurrent(owner)) throw new Error('현재 회의 화면에서 다시 불러와 주세요.');
}

async function openNewPackage() {
  const revision = ++newPackageDialogRevision;
  const owner = newPackageOwnerKey();
  let cancel;
  const cancelled = new Promise(resolve => { cancel = () => resolve(false); });
  const request = {cancel};
  newPackagePreparation = request;
  const current = () => newPackagePreparation === request && revision === newPackageDialogRevision
    && owner === newPackageOwnerKey() && !document.hidden && !window.frameElement?.hidden;
  try {
    const prepared = await Promise.race([ensureMeetingDefaults({history:true}).then(() => true), cancelled]);
    if (!prepared || !current()) return;
    activateNewPackageDraft();
    const modal = $('newPackageModal'), wasOpen = modal.classList.contains('show');
    modal.classList.add('show');
    if (!wasOpen) $('newMeetingType').focus();
  } catch (error) {
    if (current()) throw error;
  } finally {
    if (newPackagePreparation === request) newPackagePreparation = null;
  }
}

function numberFromMoney(value) {
  const digits = String(value ?? '').replace(/[^0-9-]/g, '');
  const parsed = Number(digits || 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function displayMoney(value) {
  const amount = numberFromMoney(value);
  return amount ? amount.toLocaleString('ko-KR') : '';
}

function defaultAssemblyBookletData() {
  return {
    business_report_intro: '', business_report_highlights: '',
    business_plan_goal: '', business_plan_details: '',
    income_budget: [], expense_budget: [], borrowing_limit: 0,
    borrowing_rule: '', borrowing_purpose: '', other_agenda_text: ''
  };
}
function normalizedAssemblyBookletData(row = state.current) {
  const raw = row?.assembly_booklet_data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.keys(raw).length) {
    return defaultAssemblyBookletData(row);
  }
  const defaults = defaultAssemblyBookletData(row);
  return {
    ...defaults,
    ...raw,
    income_budget: Array.isArray(raw.income_budget) ? raw.income_budget : defaults.income_budget,
    expense_budget: Array.isArray(raw.expense_budget) ? raw.expense_budget : defaults.expense_budget
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sanitizeHtml(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  doc.querySelectorAll('script,iframe,object,embed,form,input,button,textarea,select,link,meta,base').forEach(node => node.remove());
  doc.querySelectorAll('*').forEach(node => {
    [...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const attrValue = String(attr.value || '').trim().toLowerCase();
      if (name.startsWith('on') || name === 'srcdoc' || ((name === 'href' || name === 'src') && attrValue.startsWith('javascript:'))) {
        node.removeAttribute(attr.name);
      }
    });
  });
  return doc.body.firstElementChild?.innerHTML || '';
}

function stripEphemeralSignaturePreviewUrls(value) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(value || '')}</div>`, 'text/html');
  doc.querySelectorAll('[data-signature-preview-path] img').forEach((image) => image.remove());
  doc.querySelectorAll('[data-signature-preview-path]').forEach((slot) => slot.classList.remove('is-loaded'));
  return doc.body.firstElementChild?.innerHTML || '';
}

function validSignaturePreviewPath(value) {
  const path = String(value || '').trim();
  return /^[0-9a-f-]{36}\/\d+\/[0-9a-f-]{36}\.png$/i.test(path) ? path : '';
}

async function hydrateSignaturePreviews(root, expiresIn = 900) {
  if (!root?.querySelectorAll) return;
  const slots = [...root.querySelectorAll('[data-signature-preview-path]')];
  await Promise.all(slots.map(async (slot) => {
    const path = validSignaturePreviewPath(slot.dataset.signaturePreviewPath);
    if (!path || slot.querySelector('img')) return;
    const { data, error } = await MinutesService.createSignedUrl(SIGNATURE_PREVIEW_BUCKET, path, expiresIn);
    if (error || !data?.signedUrl) return;
    const image = document.createElement('img');
    image.src = data.signedUrl;
    image.alt = '전자서명 열람본';
    image.draggable = false;
    slot.prepend(image);
    slot.classList.add('is-loaded');
  }));
}

async function injectPdfAttachmentPages(wrapper, attachments = state.pdfAttachments) {
  const rows = Array.isArray(attachments) ? attachments : [];
  const board=state.current?.meeting_type==='BOARD'&&state.activeDocument==='MATERIALS';
  if(board&&[...wrapper.querySelectorAll('.board-pdf-annex')].some(n=>!rows.some(r=>r.id===n.dataset.boardPdfId)))throw new Error('연결된 별첨 PDF를 찾지 못했습니다. 첨부 목록을 다시 확인해 주세요.');
  if (!rows.length) return;
  const owner = pdfActionOwner();
  const { renderPdfUrlToImages } = await getPdfRenderer();
  if (!pdfActionStillCurrent(owner)) throw new Error('현재 회의 화면에서 다시 인쇄해 주세요.');
  const insertionPoints = new Map();
  if(board)orderMeetingAnnexes(wrapper,state.agendas);
  if(rows.some(row=>row.inherited)&&!board&&!wrapper.querySelector('[data-chapter-id="carryover-appendix"]')){
    const appendix=document.createElement('section');appendix.dataset.chapterId='carryover-appendix';appendix.innerHTML='<h2>이전 회의 첨부 자료</h2>';wrapper.append(appendix);
  }
  for (const attachment of rows) {
    const marker=board?[...wrapper.querySelectorAll('.board-pdf-annex')].find(n=>n.dataset.boardPdfId===attachment.id):null;
    const chapterId = String(attachment.insert_after_chapter_id || '');
    const anchor = board ? null : insertionPoints.get(chapterId)
      || wrapper.querySelector(`[data-chapter-id="${CSS.escape(chapterId)}"]`);
    if (!anchor&&!marker&&!board) continue;
    const signed = await MeetingPackageService.createPdfAttachmentSignedUrl(attachment.storage_path, 1800);
    if (signed.error || !signed.data?.signedUrl) throw signed.error || new Error(`「${attachment.title}」 PDF를 열 수 없습니다.`);
    const images = await renderPdfUrlToImages(signed.data.signedUrl, {
      onProgress: (page, total) => showToast(`「${attachment.title}」 ${page}/${total}쪽을 인쇄용으로 준비하고 있습니다.`)
    });
    if (!pdfActionStillCurrent(owner)) throw new Error('현재 회의 화면에서 다시 인쇄해 주세요.');
    let insertionPoint = marker||anchor;
    images.forEach((image, index) => {
      const section = document.createElement('section');
      section.className = 'meeting-chapter chapter-pdf-attachment';
      section.dataset.pdfAttachmentId = attachment.id;
      section.dataset.pdfPage = String(index + 1);
      const pageImage = document.createElement('img');
      pageImage.src = image.dataUrl;
      pageImage.alt = `${attachment.title} ${index + 1}쪽`;
      pageImage.className = 'pdf-attachment-page-image';
      section.append(pageImage);
      if(insertionPoint)insertionPoint.insertAdjacentElement('afterend', section);else wrapper.append(section);
      insertionPoint = section;
    });
    if(marker)marker.remove();else insertionPoints.set(chapterId, insertionPoint);
  }
}

function createBindingBlank(position, index) {
  const section = document.createElement('section');
  section.className = `meeting-chapter chapter-book-blank chapter-${position}-blank`;
  section.dataset.chapterId = `${position}-blank-${index}`;
  section.dataset.chapterTitle = `${position === 'front' ? '표지 뒤' : '뒷표지 앞'} 여백 ${index}`;
  section.innerHTML = `<div class="assembly-book-blank" aria-label="${escapeHtml(section.dataset.chapterTitle)}"></div>`;
  return section;
}

function normalizeBindingSkeleton(wrapper) {
  const cover = wrapper.querySelector('.chapter-cover');
  const back = wrapper.querySelector('.chapter-back');
  if (!cover || !back) return false;
  wrapper.querySelectorAll('.chapter-inside-cover,.chapter-book-blank').forEach((node) => node.remove());
  let frontAnchor = cover;
  for (let index = 1; index <= 3; index += 1) {
    const blank = createBindingBlank('front', index);
    frontAnchor.insertAdjacentElement('afterend', blank);
    frontAnchor = blank;
  }
  for (let index = 1; index <= 2; index += 1) {
    back.insertAdjacentElement('beforebegin', createBindingBlank('rear', index));
  }
  return true;
}

function ensureEvenPhysicalPageCount(wrapper) {
  const back = wrapper.querySelector('.chapter-back');
  if (!back) return;
  wrapper.querySelectorAll('.chapter-rear-blank[data-parity-blank="true"]').forEach((node) => node.remove());
  const embeddedExtraPages = [...wrapper.querySelectorAll('[data-book-page-count]')]
    .reduce((total, node) => total + Math.max(0, Number(node.dataset.bookPageCount || 1) - 1), 0);
  const physicalPages = wrapper.querySelectorAll('.meeting-chapter').length + embeddedExtraPages;
  if (physicalPages % 2 === 1) {
    const blank = createBindingBlank('rear', 3);
    blank.dataset.parityBlank = 'true';
    back.insertAdjacentElement('beforebegin', blank);
  }
}

async function preparePrintableHtml(value, attachments = state.pdfAttachments) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(stripEphemeralSignaturePreviewUrls(value));
  const bookMode = normalizeBindingSkeleton(wrapper);
  await hydrateSignaturePreviews(wrapper, 1800);
  await injectPdfAttachmentPages(wrapper, attachments);
  if (bookMode) ensureEvenPhysicalPageCount(wrapper);
  return wrapper.innerHTML;
}

function formatDate(value) {
  const raw = String(value || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return raw || '-';
  return `${match[1]}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}

function formatDateTimeShort(row) {
  if (!row?.meeting_date) return '일정 미정';
  const time = row.start_time ? ` ${String(row.start_time).slice(0, 5)}` : '';
  return `${formatDate(row.meeting_date)}${time}`;
}

function meetingYear(row) {
  const text = `${row?.meeting_number || ''} ${row?.title || ''}`;
  const titleYear = text.match(/((?:19|20)\d{2})\s*년?/);
  if (titleYear) return Number(titleYear[1]);
  const dateValue = row?.meeting_date || row?.created_at;
  const dateYear = String(dateValue || '').match(/^((?:19|20)\d{2})/);
  return dateYear ? Number(dateYear[1]) : null;
}

function meetingSequence(row) {
  const text = `${row?.meeting_number || ''} ${row?.title || ''}`;
  const numbered = text.match(/제\s*(\d+)\s*차/);
  if (numbered) return Number(numbered[1]);
  const yearRound = text.match(/(?:19|20)\d{2}\s*[-년]\s*(\d+)\s*회/);
  return yearRound ? Number(yearRound[1]) : null;
}

function meetingTypeOf(row) {
  if (row?.meeting_type) return row.meeting_type;
  const text = String(row?.title || '');
  if (text.includes('총회')) return 'GENERAL_ASSEMBLY';
  if (text.includes('이사회')) return 'BOARD';
  return null;
}

function assemblyKindOf(row) {
  if (row?.meeting_type !== 'GENERAL_ASSEMBLY' && meetingTypeOf(row) !== 'GENERAL_ASSEMBLY') return null;
  if (row?.assembly_kind === 'EXTRAORDINARY') return 'EXTRAORDINARY';
  return String(row?.title || '').includes('임시') ? 'EXTRAORDINARY' : 'REGULAR';
}

function suggestedMeeting(type, year = new Date().getFullYear(), assemblyKind = 'REGULAR') {
  const previous = [...state.packages, ...state.meetingHistory]
    .filter(row => meetingTypeOf(row) === type && meetingYear(row) === year)
    .filter(row => type !== 'GENERAL_ASSEMBLY' || assemblyKindOf(row) === assemblyKind)
    .map(meetingSequence)
    .filter(value => Number.isInteger(value) && value > 0);
  const sequence = (previous.length ? Math.max(...previous) : 0) + 1;
  return {
    meetingNumber: `${year}-${sequence}회`,
    title: `${year}년 제${sequence}차 ${type === 'GENERAL_ASSEMBLY' ? (assemblyKind === 'EXTRAORDINARY' ? '임시 대의원총회' : '정기 대의원총회') : '이사회'}`
  };
}

function fillNewPackageSuggestion() {
  const assembly = $('newMeetingType').value === 'GENERAL_ASSEMBLY';
  $('newAssemblyKindField').hidden = !assembly;
  const suggestion = suggestedMeeting($('newMeetingType').value, new Date().getFullYear(), $('newAssemblyKind').value);
  $('newMeetingNumber').value = suggestion.meetingNumber;
  $('newMeetingTitle').value = suggestion.title;
}

function showToast(message, duration = 2200) {
  const toast = $('toast');
  toast.textContent = String(message || '');
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), duration);
}

function setBusy(value) {
  state.loading = value;
  if (value) window.clearTimeout(state.autoDraftTimer);
  $('editorBody').inert = value;
  document.querySelectorAll('button').forEach(button => {
    if (button.dataset.allowWhileBusy === 'true') return;
    button.disabled = value;
  });
  if (!value) {
    renderAuditStep({ preserveDraft: true });
    renderBookletSourceOptions();
    if (chapterMode()) renderChapterEditState();
    renderAgendaLock();
    renderDocumentEditState();
  }
  syncNewPackageDraftUi();
  rememberBoardAnnexDraft();
  $('newPackageButton').disabled = !meetingEntryReady || state.loading;
}

function hasUnsavedPacketChanges({ includeAnnex = true } = {}) {
  return state.infoDirty || state.agendaDirty || state.documentDirty || state.auditDraftDirty || state.pendingDocuments.size > 0
    || [...pendingPdfDrafts.keys()].some(key=>{const [user,coop]=JSON.parse(key);return user===state.session?.user?.id&&coop===state.runtime?.coop_id;})
    || (includeAnnex && hasUnsavedBoardAnnexDraft())
    || (!!state.current && MeetingPackageService.documentEdits.hasPending(pdfActionOwner()));
}

function markFormDirty(target) {
  if (target?.closest('[data-panel="info"]')) state.infoDirty = true;
  if (target?.closest('[data-panel="agendas"]')) state.agendaDirty = true;
}

function resetPacketDirty() {
  state.infoDirty = false;
  state.agendaDirty = false;
  state.documentDirty = false;
  state.pendingDocuments.clear();
}

function hasLocalAdminHint() {
  try {
    const user = JSON.parse(localStorage.getItem('erp_user') || 'null');
    const permissions = new Set(JSON.parse(localStorage.getItem('erp_permissions') || '[]'));
    return user?.role === 'admin'
      || user?.role === 'admin_all'
      || permissions.has('member.admin')
      || permissions.has('site.admin')
      || permissions.has('minutes.manage');
  } catch (_) {
    return false;
  }
}

function officialName(row) {
  return String(row?.name || '').trim() || `명단 #${row?.id || '-'}`;
}

function officialRole(row) {
  return String(row?.role || row?.position || row?.category || '').trim();
}

function officialById(id) {
  return state.officials.find(row => String(row.id) === String(id)) || null;
}

function currentTypeOfficials(type) {
  if (type === 'GENERAL_ASSEMBLY') return state.officials.filter(row => row.category === 'delegate');
  return state.officials.filter(row => row.category === 'executive' && ['이사장', '이사'].includes(officialRole(row)));
}

function chairCandidates() {
  return state.officials.filter(row => row.category === 'executive' && ['이사장', '이사'].includes(officialRole(row)));
}

function todayInSeoul(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const part = (type) => parts.find(row => row.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isPastPackage(row, today = todayInSeoul()) {
  if(row?.status==='CANCELLED')return true;
  return ['READY', 'FINAL'].includes(row?.status)
    && /^\d{4}-\d{2}-\d{2}$/.test(String(row?.meeting_date || ''))
    && row.meeting_date < today;
}
function isArchivedPackage(row){
  return row.status==='CANCELLED'||(row.published_minute_id&&isPastPackage(row));
}

function packageItemHtml(row) {
  const type=row.meeting_type==='GENERAL_ASSEMBLY'?(row.assembly_kind==='EXTRAORDINARY'?'임시총회':'정기총회'):(TYPE_LABEL[row.meeting_type]||row.meeting_type);
  return `<button type="button" class="package-item ${state.current?.id === row.id ? 'active' : ''}" data-package-id="${escapeHtml(row.id)}">
    <span class="status ${escapeHtml(row.status)}">${escapeHtml(STATUS_LABEL[row.status] || row.status)}</span>
    <strong>${escapeHtml(row.title)}</strong>
    <small>${escapeHtml(type)} · ${escapeHtml(formatDateTimeShort(row))}</small>
  </button>`;
}

function renderPackages() {
  const past = state.packages.filter(isArchivedPackage)
    .sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date))
      || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  const preparing = state.packages.filter(row => !isArchivedPackage(row));
  $('packageList').innerHTML = preparing.length
    ? preparing.map(packageItemHtml).join('')
    : '<div class="empty">진행 중인 회의가 없습니다.</div>';
  $('pastPackageList').innerHTML = past.length
    ? past.map(packageItemHtml).join('')
    : '<div class="empty">종료된 회의가 없습니다.</div>';
  $('pastMeetingCount').textContent = String(past.length);
}

let assemblyBookletRequested=false;
function showRequestedAssemblyBooklet(){
  if(!assemblyBookletRequested||!meetingEntryReady||window.frameElement?.hidden)return;
  const panel=$('assemblyBookletPanel'),hint=$('assemblyBookletJumpHint');
  if(state.current?.meeting_type!=='GENERAL_ASSEMBLY'||state.current.assembly_kind==='EXTRAORDINARY'||panel.hidden){
    hint.hidden=false;return;
  }
  assemblyBookletRequested=false;hint.hidden=true;
  switchStep('agendas');
  const heading=$('assemblyBookletHeading');heading.focus({preventScroll:true});
  heading.scrollIntoView({block:'nearest'});
}
function clearAssemblyBookletRequest(){assemblyBookletRequested=false;$('assemblyBookletJumpHint').hidden=true;}

async function loadPackages(selectId = null) {
  const { data, error } = await MeetingPackageService.listPackages();
  if (error) throw error;
  state.packages = data;
  renderPackages();
  if (selectId) await openPackage(selectId, { internal: true });
}

function renderEditorHeader() {
  const row = state.current;
  $('editorTitle').textContent = row?.title || '회의 준비';
  const typeLabel = row?.meeting_type === 'GENERAL_ASSEMBLY'
    ? (row?.assembly_kind === 'EXTRAORDINARY' ? '임시총회' : '정기총회')
    : (TYPE_LABEL[row?.meeting_type] || '-');
  $('editorMeta').textContent = `${typeLabel} · ${formatDateTimeShort(row)}${row?.location ? ` · ${row.location}` : ''}`;
  $('editorStatus').className = `status ${row?.status || 'DRAFT'}`;
  $('editorStatus').textContent = STATUS_LABEL[row?.status] || '초안';
  $('completeMaterialsButton').hidden = state.currentStep !== 'documents' || !!pendingSection('documents') || isScenarioStage() || ['FINAL','CANCELLED'].includes(row?.status);
  renderNotHeldState();
}

function renderChairOptions(selectedId = null) {
  const options = chairCandidates();
  $('chairOfficial').innerHTML = '<option value="">선택하세요</option>' + options.map(row => `
    <option value="${row.id}" ${String(row.id) === String(selectedId || '') ? 'selected' : ''}>${escapeHtml(officialRole(row))} ${escapeHtml(officialName(row))}</option>
  `).join('');
}

function renderBudgetRows(kind, rows) {
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  if (!container) return;
  const list = Array.isArray(rows) ? rows : [];
  container.innerHTML = list.length ? list.map((row, index) => `
    <div class="budget-row" data-budget-kind="${kind}" data-budget-index="${index}">
      <input data-budget-field="name" value="${escapeHtml(row?.name || '')}" placeholder="항목">
      <input data-budget-field="basis" value="${escapeHtml(row?.basis || '')}" placeholder="산출 근거">
      <input data-budget-field="amount" class="budget-amount" inputmode="numeric" value="${escapeHtml(displayMoney(row?.amount))}" placeholder="금액">
      <button type="button" data-budget-remove title="이 항목 삭제">×</button>
    </div>`).join('') : '<div class="empty">등록된 예산 항목이 없습니다.</div>';
}

function collectBudgetRows(kind) {
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  if (!container) return [];
  return [...container.querySelectorAll('.budget-row')].map((row) => ({
    name: row.querySelector('[data-budget-field="name"]')?.value.trim() || '',
    basis: row.querySelector('[data-budget-field="basis"]')?.value.trim() || '',
    amount: numberFromMoney(row.querySelector('[data-budget-field="amount"]')?.value)
  })).filter((row) => row.name || row.basis || row.amount);
}

function collectAssemblyBookletData() {
  if (!$('assemblyBookletPanel')) return state.current?.assembly_booklet_data || {};
  return {
    ...(state.current?.assembly_booklet_data || {}),
    business_report_intro: $('businessReportIntro').value.trim(),
    business_report_highlights: $('businessReportHighlights').value.trim(),
    business_plan_goal: $('businessPlanGoal').value.trim(),
    business_plan_details: $('businessPlanDetails').value.trim(),
    income_budget: collectBudgetRows('income'),
    expense_budget: collectBudgetRows('expense'),
    borrowing_limit: numberFromMoney($('borrowingLimit').value),
    borrowing_rule: $('borrowingRule').value.trim(),
    borrowing_purpose: $('borrowingPurpose').value.trim(),
    other_agenda_text: $('otherAgendaText').value.trim()
  };
}

function updateBudgetSummary() {
  if (!$('budgetSummary')) return;
  const income = collectBudgetRows('income').reduce((sum, row) => sum + row.amount, 0);
  const expense = collectBudgetRows('expense').reduce((sum, row) => sum + row.amount, 0);
  const difference = income - expense;
  const differenceText = difference === 0
    ? ''
    : `${difference > 0 ? '수입이 지출보다' : '지출이 수입보다'} ${Math.abs(difference).toLocaleString('ko-KR')}원 많습니다.`;
  $('budgetSummary').innerHTML = `<span>수입 ${income.toLocaleString('ko-KR')}원</span><span>지출 ${expense.toLocaleString('ko-KR')}원</span>${differenceText ? `<span class="difference warn">${escapeHtml(differenceText)}</span>` : ''}`;
}

function renderAssemblyBookletInputs() {
  const data = normalizedAssemblyBookletData(state.current);
  $('businessReportIntro').value = data.business_report_intro || '';
  $('businessReportHighlights').value = data.business_report_highlights || '';
  $('businessPlanGoal').value = data.business_plan_goal || '';
  $('businessPlanDetails').value = data.business_plan_details || '';
  $('borrowingLimit').value = displayMoney(data.borrowing_limit);
  $('borrowingRule').value = data.borrowing_rule || '';
  $('borrowingPurpose').value = data.borrowing_purpose || '';
  $('otherAgendaText').value = data.other_agenda_text || '';
  renderBudgetRows('income', data.income_budget);
  renderBudgetRows('expense', data.expense_budget);
  updateBudgetSummary();
  renderBookletSourceOptions();
}

function renderBookletSourceOptions() {
  const select = $('bookletPreviousSource');
  if (!select) return;
  const selected=select.value;
  const rows = state.packages.filter(row => row.id !== state.current?.id && row.meeting_type === 'GENERAL_ASSEMBLY'
    && row.status!=='CANCELLED'&&isPastPackage(row));
  select.replaceChildren(new Option('지난 총회를 선택해 주세요', ''));
  rows.forEach(row => select.add(new Option(row.title, row.id)));
  if(rows.some(row=>row.id===selected))select.value=selected;
  $('loadPreviousBooklet').disabled = !rows.length;
}

async function loadPreviousBooklet() {
  const id = $('bookletPreviousSource').value;
  if (!id) throw new Error('지난 총회를 선택해 주세요.');
  if (!state.packages.some(row => row.id === id && row.id !== state.current?.id && row.meeting_type === 'GENERAL_ASSEMBLY'&&row.status!=='CANCELLED'&&isPastPackage(row))) throw new Error('이 조합의 지난 총회를 선택해 주세요.');
  const owner=pdfActionOwner(),box=$('assemblyPastChoices');
  const { data, error } = await supabase.from('meeting_package_agendas').select('title,agenda_kind')
    .eq('coop_id',owner.coopId).eq('package_id',id).order('sort_order').order('id').limit(300);
  if(!pdfActionStillCurrent(owner)||$('bookletPreviousSource').value!==id||!canEditAssemblyBase())return;
  if (error) throw error;
  const rows=(data||[]).map(agendaSkeleton).filter(Boolean);
  box.hidden=false;box.innerHTML=rows.length?rows.map((r,i)=>`<label><input type="checkbox" data-past-idx="${i}"> ${escapeHtml(r.title)}</label><br>`).join('')+'<button type="button" class="btn" data-apply-past>선택한 안건 담기</button>':'복사할 추가 안건이 없습니다.';
  const apply=box.querySelector('[data-apply-past]');
  if(apply)apply.onclick=()=>{
    if(!pdfActionStillCurrent(owner)||$('bookletPreviousSource').value!==id||!canEditAssemblyBase())return;
    const existing=collectAgendasFromDom(),seen=new Set(existing.map(r=>r.title.trim()));
    for(const n of box.querySelectorAll('input:checked')){const row=rows[Number(n.dataset.pastIdx)];if(row&&!seen.has(row.title)){seen.add(row.title);existing.push({...row});}}
    state.agendas=existing;box.hidden=true;renderAgendaList();scheduleAutoDraftRefresh('agendas');$('loadPreviousBooklet').focus();
  };
}

function canEditAssemblyBase(){
  return !!state.current&&state.current.meeting_type==='GENERAL_ASSEMBLY'&&state.current.assembly_kind!=='EXTRAORDINARY'
   &&!['FINAL','CANCELLED'].includes(state.current.status)&&!state.current.published_minute_id
   &&!!state.agendaLock&&!state.agendaLock.locked;
}
function assemblyBaseOrder(){
  return currentBaseOrder(state.current?.assembly_booklet_data?.assembly_agenda_order);
}
function setAssemblyBaseOrder(keys){
  if(!canEditAssemblyBase())return;
  state.current={...state.current,assembly_booklet_data:{...collectAssemblyBookletData(),assembly_agenda_order:keys}};
  drawAssemblyBase();scheduleAutoDraftRefresh('agendas');
}
function drawAssemblyBase(){
  const p=$('assemblyBasePanel'),c=state.current;
  if(!p)return;
  p.hidden=c?.meeting_type!=='GENERAL_ASSEMBLY'||c.assembly_kind==='EXTRAORDINARY';
  if(p.hidden)return;
  const readonly=!canEditAssemblyBase(),order=assemblyBaseOrder(),selected=new Set(order);
  const ready=new Set(buildAssemblyAgendaPlan({row:{...c,assembly_booklet_data:{...c.assembly_booklet_data,assembly_agenda_order:undefined}},agendas:[],sourceContext:state.sourceContext,coopName:state.runtime?.coop_name,officials:state.officials}).map(x=>x.key));
  if(state.agendas.length)ready.add('additional');
  const visible=order.filter(k=>ready.has(k));
  const count=c.meeting_date&&c.meeting_date===state.sourceContext?.source_meeting_date?state.sourceContext?.eligible_withdrawals?.length:null;
  $('assemblyRefundReadState').textContent=Number.isInteger(count)?count>0?'올해 의결할 환급 '+count+'건':'올해 의결할 환급 대상 없음':'올해 환급 대상 확인 전';
  $('assemblyBaseAdd').disabled=readonly;
  $('assemblyBaseChoices').innerHTML=Object.keys(assemblyBaseOptions).filter(k=>ready.has(k)&&!selected.has(k))
    .map(k=>`<button type="button" class="btn" data-base-add="${k}" ${readonly?'disabled':''}>${assemblyBaseOptions[k].label} 추가</button>`).join('')||'불러올 기본 안건이 없습니다.';
  $('assemblyBaseOrder').innerHTML=visible.map((k,i)=>`<li><span>${assemblyBaseOptions[k].label}</span>
   ${readonly?'':`<button type="button" class="btn btn-small" data-base="${k}" data-move="-1" ${i===0?'disabled':''}>위로</button>
   <button type="button" class="btn btn-small" data-base="${k}" data-move="1" ${i===visible.length-1?'disabled':''}>아래로</button>
   ${k==='additional'?'':`<button type="button" class="btn btn-small" data-base="${k}" data-move="remove">빼기</button>`}`}</li>`).join('');
  p.onclick=event=>{
   if(!canEditAssemblyBase())return;
   const b=event.target.closest('button');if(!b||b.disabled)return;
   if(b.id==='assemblyBaseAdd'){$('assemblyBaseChoices').hidden=!$('assemblyBaseChoices').hidden;return;}
   if(b.dataset.baseAdd){setAssemblyBaseOrder([...order,b.dataset.baseAdd]);$('assemblyBaseAdd').focus();return;}
   if(b.dataset.base){const k=b.dataset.base,i=visible.indexOf(k),j=i+Number(b.dataset.move);
    if(b.dataset.move==='remove')setAssemblyBaseOrder(order.filter(x=>x!==k));
    else if(i>=0&&j>=0&&j<visible.length){const next=[...order],a=next.indexOf(k),z=next.indexOf(visible[j]);[next[a],next[z]]=[next[z],next[a]];setAssemblyBaseOrder(next);}
    $('assemblyBaseAdd').focus();
   }
  };
}

function agendaTypes(rows,booklet){
  const types=booklet?.assembly_agenda_types||{};
  return (rows||[]).map(a=>({...a,assembly_decision_type:Object.hasOwn(assemblyDecisionTypes,types[a.id])?types[a.id]:''}));
}
function getAssemblyContext(id,sent=null){
  return supabase.rpc('get_assembly_agenda_context',{p_package:id,p_sent_on:sent});
}
function agendaDecisionControl(row){
  if(row.agenda_kind!=='DECISION'||state.current?.meeting_type!=='GENERAL_ASSEMBLY')return '';
  return `<label data-assembly-decision>안건 종류
    <select data-field="assembly_decision_type"><option value="">선택</option>${Object.entries(assemblyDecisionTypes).map(([id,label])=>
     `<option value="${id}" ${row.assembly_decision_type===id?'selected':''}>${label}</option>`).join('')}</select>
    </label>`;
}

function fillInfoForm() {
  const row = state.current;
  $('meetingType').value = row.meeting_type;
  $('assemblyKind').value = row.assembly_kind || 'REGULAR';
  $('meetingNumber').value = row.meeting_number || '';
  $('meetingTitle').value = row.title || '';
  $('noticeDate').value = row.notice_date || '';
  $('meetingDate').value = row.meeting_date || '';
  $('meetingLocation').value = row.location || '';
  $('startTime').value = row.start_time ? String(row.start_time).slice(0, 5) : '';
  $('endTime').value = row.end_time ? String(row.end_time).slice(0, 5) : '';
  $('facilitatorName').value = row.facilitator_name || '';
  $('eligibleCount').value = row.eligible_count ?? currentTypeOfficials(row.meeting_type).length;
  $('openingMessage').value = row.opening_message || '';
  $('closingMessage').value = row.closing_message || '';
  $('documentNotes').value = row.document_notes || '';
  $('privateNotes').value = row.private_notes || '';
  renderFiscalYearOptions(row.fiscal_year || defaultFiscalYear(row));
  renderChairOptions(row.chair_official_id);
  renderAssemblyBookletInputs();
  $('eligibleCountLabel').textContent = row.meeting_type === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
  updateDocumentModeLabels();
}

function renderAgendaList() {
  drawAssemblyBase();
  const container = $('agendaList');
  const board = state.current?.meeting_type === 'BOARD';
  if (!state.agendas.length) {
    container.innerHTML = '<div class="empty">등록된 안건이 없습니다.<br>보고·의결·논의할 안건을 추가해 주세요.</div>';
    return;
  }
  container.innerHTML = state.agendas.map((row, index) => `
    <article class="agenda-card" data-agenda-index="${index}" data-agenda-id="${escapeHtml(row.id || '')}">
      <div class="agenda-head">
        <span class="agenda-number">${index + 1}</span>
        <select data-field="agenda_kind">
          ${Object.entries(KIND_LABEL).map(([value, label]) => `<option value="${value}" ${row.agenda_kind === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
        <input data-field="title" value="${escapeHtml(row.title || '')}" placeholder="안건 제목">
        <div class="agenda-actions">
          <button type="button" data-agenda-action="up" title="위로">↑</button>
          <button type="button" data-agenda-action="down" title="아래로">↓</button>
          <button type="button" data-agenda-action="delete" title="삭제">×</button>
        </div>
      </div>
      <div class="agenda-details">
        <div class="field" ${board ? 'style="grid-column:1/-1;"' : ''}><label>${board ? '짧은 안건 설명' : '한눈에 보는 내용'}</label><textarea data-field="summary" placeholder="${board ? '회의자료 초안에 넣을 핵심만 적어 주세요. 자세한 내용은 회의자료 탭에서 편집할 수 있습니다.' : '목차와 안건 요약에 사용할 짧은 설명'}">${escapeHtml(row.summary || '')}</textarea></div>
        ${board ? '' : `
        <div class="field"><label>배경·필요성</label><textarea data-field="background" placeholder="왜 이 안건을 다루는지">${escapeHtml(row.background || '')}</textarea></div>
        <div class="field"><label>제안·보고 본문</label><textarea data-field="proposal_text" placeholder="자료집에 들어갈 핵심 내용">${escapeHtml(row.proposal_text || '')}</textarea></div>
        <div class="field"><label>사무국 설명</label><textarea data-field="office_report" placeholder="진행 시나리오의 설명 담당 문구">${escapeHtml(row.office_report || '')}</textarea></div>
        <div class="field"><label>진행 참고</label><textarea data-field="scenario_notes" placeholder="질의 순서, 소개할 사람, 주의할 점">${escapeHtml(row.scenario_notes || '')}</textarea></div>
        <div class="field"><label>의결 문구 초안</label><textarea data-field="decision_draft" placeholder="보고 안건이면 비워도 됩니다.">${escapeHtml(row.decision_draft || '')}</textarea></div>
        <div class="field" style="grid-column:1/-1;"><label>문서에 넣을 안건 메모</label><textarea data-field="document_notes" placeholder="회의자료와 시나리오에 함께 남길 보충 설명이나 메모를 적으세요.">${escapeHtml(row.document_notes || '')}</textarea></div>
        <label class="comparison-option" ${state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? '' : 'hidden'}>
          <input type="checkbox" data-field="requires_article_comparison" ${row.requires_article_comparison === true ? 'checked' : ''}>
          <span><strong>신구조문 대비표 포함</strong><small>정관·규약·규정을 바꾸는 안건일 때만 선택하세요. 기본값은 사용하지 않음입니다.</small></span>
        </label>
        ${agendaDecisionControl(row)}
        <div class="field" style="grid-column:1/-1;"><label>비공개 안건 메모</label><textarea data-field="private_notes" placeholder="확인할 일과 내부 메모. 문서에는 자동 포함되지 않습니다.">${escapeHtml(row.private_notes || '')}</textarea></div>
        `}
      </div>
    </article>
  `).join('');
  renderAgendaLock();
  renderDocumentEditState();
}

function renderAgendaLock() {
  const known = !!state.agendaLock, locked = !known || state.agendaLock.locked;
  const boardReview = locked && state.current?.meeting_type === 'BOARD' && state.agendaLock?.board_plan_review;
  const boardEditable = boardReview && !['FINAL','CANCELLED'].includes(state.current.status) && !state.current.published_minute_id;
  if (!$('agendaLockStatus')) return;
  $('agendaLockStatus').textContent = boardReview
    ? (boardReview === 'changed' ? '현재 준비안 변경 · 결재한 공문은 그대로입니다.'
      : boardReview === 'compare' ? '현재 준비안 · 결재한 공문과 대조해 주세요.'
        : '현재 준비안 · 수정해도 결재한 공문은 바뀌지 않습니다.')
    : !known ? '잠금 상태를 불러오지 못했습니다.' : locked ? '결재 완료 · 잠금' : '결재 완료 전';
  $('agendaLockStatus').title=known&&locked?(boardReview?BOARD_AGENDA_LOCK_REASON:AGENDA_LOCK_REASON):'';
  $('refreshAgendaLockButton').hidden=known;
  for (const id of ['meetingType','assemblyKind','fiscalYear','meetingNumber','meetingTitle','noticeDate','meetingDate','meetingLocation','startTime','endTime','facilitatorName','chairOfficial','eligibleCount']) {
    $(id).disabled = state.loading || (locked && (!boardEditable || id === 'meetingType'));
  }
  $('addAgendaButton').disabled = state.loading || locked;
  $('deletePackageButton').disabled = state.loading || locked;
  for (const node of document.querySelectorAll('#agendaList [data-agenda-action],#agendaList [data-field]')) {
    if (node.dataset.agendaAction || ['agenda_kind','title'].includes(node.dataset.field)) {
      node.disabled = state.loading || (locked && (!boardEditable || node.dataset.agendaAction === 'delete' || node.dataset.field === 'title'));
    }
  }
  if (state.activeDocument === 'MATERIALS' && !chapterMode()) protectMaterialAgendas($('documentEditor'), locked, !!boardEditable);
}

async function refreshAgendaLock() {
  if (!state.current) return;
  const owner = pdfActionOwner();
  const result = await MeetingPackageService.getAgendaState(owner.packageId);
  if (!pdfActionStillCurrent(owner)) return;
  if (result.error) { state.agendaLock = null; renderAgendaLock(); throw result.error; }
  state.agendaLock = result.data;
  renderAgendaLock();
  if (chapterMode()) renderChapterEditState();
}

function refreshSavedBoardPlan() {
  if (state.current?.meeting_type !== 'BOARD' || !state.agendaLock?.board_plan_review) return;
  const owner = pdfActionOwner(), pending = {...state.agendaLock,board_plan_review:'compare'};
  state.agendaLock = pending;
  renderAgendaLock();
  void MeetingPackageService.getAgendaState(owner.packageId).then(result => {
    if (!pdfActionStillCurrent(owner) || state.agendaLock !== pending || result.error || !result.data?.board_plan_review) return;
    state.agendaLock = result.data;
    renderAgendaLock();
  }).catch(() => {});
}

function collectAgendasFromDom() {
  return [...document.querySelectorAll('.agenda-card')].map((card, index) => {
    const row = state.agendas[index] || {};
    const value = (name) => card.querySelector(`[data-field="${name}"]`)?.value.trim() ?? String(row[name] || '');
    return {
      ...(row.id ? { id: row.id } : {}),
      agenda_kind: value('agenda_kind') || 'DECISION',
      title: state.agendaLock?.locked && state.agendaLock?.board_plan_review ? String(row.title ?? '') : value('title'),
      summary: value('summary'),
      background: value('background'),
      proposal_text: value('proposal_text'),
      office_report: value('office_report'),
      scenario_notes: value('scenario_notes'),
      decision_draft: value('decision_draft'),
      decision_result: row.decision_result || '',
      discussion_notes: row.discussion_notes || '',
      document_notes: value('document_notes'),
      private_notes: value('private_notes'),
      requires_article_comparison: card.querySelector('[data-field="requires_article_comparison"]')?.checked ?? row.requires_article_comparison === true
      ,assembly_decision_type: value('agenda_kind')==='DECISION'?value('assembly_decision_type'):''
    };
  });
}

function renderAssemblyBeforeCheck() {
  const active=state.current&&state.current.status!=='CANCELLED'&&$('meetingType').value==='GENERAL_ASSEMBLY';
  $('assemblyBeforeCheck').hidden=!active;
  if(!active)return;
  const regular=$('assemblyKind').value==='REGULAR',day=$('meetingDate').value,notice=$('noticeDate').value;
  const date=/^\d{4}-\d{2}-\d{2}$/.test(day)?new Date(day+'T00:00:00Z'):null;
  let due='';
  if(date&&Number.isFinite(+date)){date.setUTCDate(date.getUTCDate()-7);due=date.toISOString().slice(0,10);}
  $('assemblyNoticeDue').textContent='소집 통지'+(due?' · '+due+'까지':'');
  $('assemblyNoticeState').textContent=notice?(due&&notice>due?'공고 예정일이 기한보다 늦어요.':'공고일 '+notice+' · 발송 증빙 확인'):'공고일과 발송 증빙 확인';
  $('assemblyAuditDueRow').hidden=!regular;
  if(regular){
    $('assemblyAuditDue').textContent='감사에게 결산보고서 제출'+(due?' · '+due+'까지':'');
    const sent=state.sourceContext?.audit_sent_on;
    $('assemblyAuditState').textContent=sent?sent+' 제출 기록됨':state.sourceContext?.closing_report?'결산보고서 연결됨 · 제출 여부 확인':'결산보고서 연결 확인';
    $('assemblyAuditDelivery').hidden=!!sent||state.sourceContext?.audit_report_ready!==true||state.current.status==='FINAL';
    $('assemblyAuditRecord').disabled=state.loading;
    $('assemblyAuditSentOn').max=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  }
  if(!regular)$('assemblyAuditDelivery').hidden=true;
  $('assemblyChairCheck').textContent=$('chairOfficial').value?'의장 선택됨':'의장 선택';
}

function updateDocumentModeLabels() {
  const assembly = $('meetingType').value === 'GENERAL_ASSEMBLY';
  const simpleMaterials=!assembly&&guidedRoute()?.kind==='BOARD'&&guidedStage()==='materials';
  document.body.toggleAttribute('data-board-materials',simpleMaterials);
  if(simpleMaterials){
    const tools=$('boardMaterialTools'),menu=$('boardMaterialToolsMenu');
    if($('generateAllButton').parentElement!==menu){
      $('printDocumentButton').before($('completeMaterialsButton'),$('editDocumentButton'));
      menu.append($('generateAllButton'),$('saveDocumentButton'));
    }
    tools.hidden=false;
    $('saveDocumentButton').textContent='임시 저장';
    $('saveCurrentDocumentButton').textContent='저장';
  }
  if (assembly && state.activeDocument === 'SCENARIO_SECRETARIAT') state.activeDocument = 'SCENARIO';
  const regularAssembly = assembly && $('assemblyKind').value !== 'EXTRAORDINARY';
  $('assemblyKindField').hidden = !assembly;
  $('fiscalYearField').hidden = !regularAssembly;
  $('auditStepTab').hidden = !regularAssembly;
  $('auditStepPanel').hidden = !regularAssembly;
  $('documentsStepTab').textContent = assembly ? (regularAssembly ? '4. 회의 전 문서' : '3. 회의 전 문서') : '3. 회의자료';
  $('assemblySourcePanel').hidden = !regularAssembly;
  $('assemblyBookletPanel').hidden = !regularAssembly;
  $('bookPrintHelp').hidden = !assembly;
  $('materialsTab').textContent = assembly ? '📚 총회 자료집' : '📄 이사회 회의자료';
  $('scenarioTab').textContent = assembly ? '🎙️ 총회 진행 시나리오' : '🎙️ 의장용 시나리오';
  $('materialsTab').hidden = isScenarioStage();
  $('scenarioTab').hidden = !isScenarioStage();
  $('secretariatScenarioTab').hidden = assembly||!isScenarioStage();
  $('agendaModeNotice').textContent = assembly
    ? (regularAssembly
      ? '안건 순서를 바꾸면 자료집과 진행 시나리오에도 같은 순서로 들어갑니다.'
      : '임시총회에는 감사·결산·배당·사업계획을 자동으로 넣지 않습니다. 이번 임시총회에서 실제로 심의할 의안만 순서대로 적으세요.')
    : '보고·의결·논의할 안건을 적으면 한 장짜리 이사회 회의자료와 진행 시나리오에 반영됩니다.';
  $('documentModeNotice').textContent = assembly
    ? (regularAssembly
      ? '안건에서 정한 순서대로 자료집과 진행 시나리오를 작성합니다.'
      : '임시총회 자료집과 시나리오는 등록한 의안만으로 구성합니다.')
    : '의장용과 실무자용은 각각 편집합니다. 전체 저장이나 인쇄 전에 두 시나리오를 모두 확인해 주세요.';
  if(guidedRoute())$('documentModeNotice').textContent=isScenarioStage()?'필요하면 시나리오를 수정하고 인쇄하세요.':'회의자료를 확인한 뒤 자료 확정을 누르세요.';
  $('generateAllButton').textContent=isScenarioStage()?'시나리오 만들기':'회의자료 다시 만들기';
  $('generateAllButton').hidden=isScenarioStage()&&!window.ErpBoardFlow.posted(guidedStatus()||{});
  renderAssemblyBeforeCheck();
  if (!regularAssembly && state.currentStep === 'audit') switchStep('documents');
  if (regularAssembly) {
    renderAssemblySourceStatus();
    renderAuditStep({ preserveDraft: true });
  }
}

function defaultFiscalYear(row = state.current) {
  const meetingDateYear = Number(String(row?.meeting_date || '').slice(0, 4));
  if (meetingDateYear >= 1901) return meetingDateYear - 1;
  const titleYear = Number(String(row?.title || '').match(/(?:19|20)\d{2}/)?.[0]);
  return titleYear >= 1901 ? titleYear - 1 : new Date().getFullYear() - 1;
}

function renderFiscalYearOptions(selectedYear = defaultFiscalYear()) {
  const selected = Number(selectedYear || defaultFiscalYear());
  const currentYear = new Date().getFullYear();
  const years = new Set([selected, defaultFiscalYear()]);
  for (let year = currentYear; year >= currentYear - 12; year -= 1) years.add(year);
  $('fiscalYear').innerHTML = [...years]
    .filter((year) => year >= 1900 && year <= 2100)
    .sort((a, b) => b - a)
    .map((year) => `<option value="${year}" ${year === selected ? 'selected' : ''}>${year}년도${year === defaultFiscalYear() ? ' · 총회 개최연도 기준 전년도' : ''}</option>`)
    .join('');
}

function renderAssemblySourceStatus() {
  renderAssemblyBeforeCheck();
  drawAssemblyBase();
  const panel = $('assemblySourcePanel');
  if (!panel || panel.hidden) return;
  const source = state.sourceContext;
  if (!source) {
    $('assemblySourceStatus').innerHTML = '<div class="source-empty">총회 연동 자료를 확인하는 중입니다.</div>';
    return;
  }
  const closing = source.closing || {};
  const closingReport = source.closing_report;
  const audit = source.audit_report;
  const prior = source.previous_minute;
  const dividends = Array.isArray(source.dividend_batches) ? source.dividend_batches : [];
  const returns = Array.isArray(source.eligible_withdrawals) ? source.eligible_withdrawals : [];
  const auditorNames = state.officials
    .filter(row => officialRole(row) === '감사')
    .map(officialName)
    .filter(Boolean);
  const auditSigned = Number(audit?.signature_count || 0);
  const auditTotal = Array.isArray(audit?.signer_ids) ? audit.signer_ids.length : auditorNames.length;
  const cards = [
    ['전차 총회 의사록', prior ? `연결됨 · ${prior.title || '전차 의사록'}` : '확인 필요 · 문서함에서 찾지 못함', !!prior],
    [`${source.fiscal_year}년도 결산`, closingReport
      ? (closing.is_closed ? '회계관리 생성본 연결 · 결산 완료' : '회계관리 생성본 연결 · 결산 완료 전')
      : '연결 필요 · 회계관리에서 결산보고서 생성', !!closingReport && !!closing.is_closed],
    ['감사보고서', audit ? `${audit.status === 'CLOSED' ? '서명 완료' : '검토·서명 중'} · ${auditSigned}/${auditTotal}명` : `작성 전 · 감사 ${auditorNames.length}명`, audit?.status === 'CLOSED'],
    ['배당·이익처분', dividends.length ? `${dividends.length}개 배당안 자동 포함` : '해당 자료 없음 · 의안 자동 제외', true],
    ['감자·탈퇴 반환', returns.length ? `${returns.length}건 자동 포함` : '총회 의결 대기 없음 · 의안 자동 제외', true]
  ];
  $('assemblySourceStatus').innerHTML = cards.map(([label, detail, ok]) => `
    <div class="source-status-card"><span class="source-status-icon ${ok ? 'ok' : 'wait'}">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>
  `).join('');
}

function auditReportLocked(audit = state.sourceContext?.audit_report) {
  return Number(audit?.signature_count || 0) > 0 || audit?.status === 'CLOSED';
}

function generatedAuditDraft(source = state.sourceContext) {
  if (!source?.closing_report || !source?.closing?.is_closed) return '';
  return sanitizeHtml(buildAuditReportDraft({
    row: state.current,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    officials: state.officials,
    sourceContext: source
  }));
}

function activeAuditors() {
  return state.officials.filter(row => row.status !== 'inactive' && officialRole(row) === '감사');
}

function auditChangeMethodLabel(value) {
  return ({ PHONE:'전화', IN_PERSON:'대면', MESSENGER:'메신저', OTHER:'기타' })[value] || '기타';
}

function toDateTimeLocalValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatAuditChangeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('ko-KR', {
    timeZone:'Asia/Seoul', year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit'
  });
}

function renderAuditChangePanel() {
  const panel = $('auditChangePanel');
  if (!panel) return;
  const audit = state.sourceContext?.audit_report;
  panel.hidden = !audit?.id;
  if (panel.hidden) return;

  const auditors = activeAuditors();
  const auditorSelect = $('auditChangeAuditor');
  const selectedAuditor = auditorSelect.value;
  auditorSelect.innerHTML = auditors.length
    ? auditors.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(officialName(row))}</option>`).join('')
    : '<option value="">활성 감사를 확인해 주세요</option>';
  if (auditors.some(row => String(row.id) === selectedAuditor)) auditorSelect.value = selectedAuditor;
  if (!$('auditChangeRequestedAt').value) $('auditChangeRequestedAt').value = toDateTimeLocalValue();

  const locked = auditReportLocked(audit);
  $('recordAuditChangeButton').disabled = auditors.length === 0;
  $('recordAuditChangeButton').textContent = locked ? '요청 기록·개정본 만들기' : '수정 요청 기록';
  $('auditChangeWarning').hidden = !locked;
  $('auditChangeWarning').textContent = locked
    ? '이미 전자서명이 시작된 보고서입니다. 기록을 저장하면 기존 서명본은 그대로 보존하고 수정할 수 있는 개정본을 새로 만듭니다. 개정본은 감사 전원의 전자서명을 다시 받아야 합니다.'
    : '';

  const rows = Array.isArray(state.auditChangeRequests) ? state.auditChangeRequests : [];
  $('auditChangeHistorySummary').textContent = `이전 수정 요청 ${rows.length}건`;
  $('auditChangeHistory').innerHTML = rows.length
    ? rows.map(row => `<article class="audit-change-item">
        <div class="audit-change-item-head">
          <strong>${escapeHtml(row.auditor_name || `감사 명단 #${row.requested_auditor_official_id || '-'}`)}</strong>
          <span class="audit-change-chip">${escapeHtml(auditChangeMethodLabel(row.request_method))}</span>
          <span class="audit-change-chip">${escapeHtml(formatAuditChangeTime(row.requested_at))}</span>
          ${row.resulting_report_minute_id ? '<span class="audit-change-chip revision">개정본 생성</span>' : ''}
        </div>
        <p>${escapeHtml(row.request_summary || '')}</p>
      </article>`).join('')
    : '<div class="audit-change-empty">기록된 수정 요청이 없습니다.</div>';
}

function auditExpected(audit) {
  return {id:audit?.id||null,title:audit?.title??null,content:audit?.content??null};
}
function renderAuditStep({ preserveDraft = true } = {}) {
  const panel = $('auditStepPanel');
  const editor = $('auditDraftEditor');
  if (!panel || panel.hidden || !editor) return;
  const source = state.sourceContext;
  if (!source) {
    $('auditSourceStatus').innerHTML = '<div class="source-empty">감사보고서 자료를 확인하는 중입니다.</div>';
    if (!preserveDraft || !state.auditDraftDirty) {
      editor.innerHTML = '<div class="audit-draft-empty">결산자료와 감사 명단을 확인하면 감사보고서 초안이 표시됩니다.</div>';
      editor.classList.add('is-empty');
    }
    editor.contentEditable = 'false';
    $('auditDraftState').className = 'audit-draft-state';
    $('auditDraftState').textContent = '자료 확인 중';
    $('resetAuditDraftButton').disabled = true;
    $('requestAuditReviewButton').disabled = true;
    $('openAuditButton').hidden = true;
    $('auditChangePanel').hidden = true;
    return;
  }

  const closing = source.closing || {};
  const closingReport = source.closing_report;
  const audit = source.audit_report;
  const auditors = state.officials
    .filter(row => officialRole(row) === '감사')
    .map(officialName)
    .filter(Boolean);
  const signedCount = Number(audit?.signature_count || 0);
  const signerCount = Array.isArray(audit?.signer_ids) ? audit.signer_ids.length : auditors.length;
  const closingReady = Boolean(closingReport && closing.is_closed);
  const locked = auditReportLocked(audit);
  const cards = [
    [`${source.fiscal_year}년도 결산`, closingReport
      ? (closing.is_closed ? '결산 완료 · 감사보고서 작성 가능' : '결산 완료 전 · 회계관리에서 먼저 마감 필요')
      : '결산보고서 없음 · 회계관리에서 먼저 생성 필요', closingReady],
    ['감사 대상', auditors.length ? `${auditors.join(', ')} · ${auditors.length}명` : '활성 감사 계정을 확인해 주세요.', auditors.length > 0],
    ['전자검토', audit
      ? `${audit.status === 'CLOSED' ? '서명 완료' : (signedCount > 0 ? '서명 진행 중' : '검토 문서 준비됨')} · ${signedCount}/${signerCount}명`
      : '아직 요청하지 않음', Boolean(audit)]
  ];
  $('auditSourceStatus').innerHTML = cards.map(([label, detail, ok]) => `
    <div class="source-status-card"><span class="source-status-icon ${ok ? 'ok' : 'wait'}">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>
  `).join('');

  if (!preserveDraft || !state.auditDraftDirty) {
    const content = sanitizeHtml(audit?.content || generatedAuditDraft(source));
    if (content) {
      editor.innerHTML = content;
      editor.classList.remove('is-empty');
    } else {
      editor.innerHTML = '<div class="audit-draft-empty">결산을 완료하고 결산보고서를 생성하면 이곳에서 감사보고서 초안을 작성할 수 있습니다.</div>';
      editor.classList.add('is-empty');
    }
    state.auditDraftDirty = false;
    state.auditDraftExpected = auditExpected(audit);
  }

  editor.contentEditable = closingReady && !locked ? 'true' : 'false';
  editor.setAttribute('aria-readonly', closingReady && !locked ? 'false' : 'true');
  editor.classList.toggle('is-locked', locked);
  $('resetAuditDraftButton').disabled = !closingReady || locked;
  $('resetAuditDraftButton').textContent = audit ? '결산자료로 초안 다시 만들기' : '결산자료로 초안 만들기';
  $('requestAuditReviewButton').disabled = !closingReady || locked || auditors.length === 0;
  $('requestAuditReviewButton').textContent = audit ? '수정 내용 반영·전자검토 요청' : '수정 내용으로 전자검토 요청';
  $('openAuditButton').hidden = !audit?.id;

  const stateBadge = $('auditDraftState');
  stateBadge.className = `audit-draft-state ${audit?.status === 'CLOSED' ? 'signed' : (audit ? 'ready' : '')}`;
  stateBadge.textContent = audit?.status === 'CLOSED'
    ? '전자서명 완료'
    : (signedCount > 0 ? `전자서명 진행 중 · ${signedCount}/${signerCount}명` : (audit ? '전자검토 문서 있음' : '전자검토 요청 전'));
  $('auditDraftHelp').textContent = locked
    ? '감사의 전자서명이 시작되어 보고서 내용이 잠겼습니다. 전자검토 화면에서 진행 상태를 확인할 수 있습니다.'
    : (closingReady
      ? '보고서 본문을 직접 고친 뒤 전자검토 요청을 누르면 현재 내용이 저장되고 감사에게 검토·서명을 요청합니다.'
      : '회계관리에서 해당 연도 결산을 완료하고 결산보고서를 생성해 주세요.');
  renderAuditChangePanel();
}

async function loadAssemblySources({ render = true } = {}) {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    state.sourceContext = null;
    state.auditChangeRequests = [];
    if (render) {
      renderAssemblySourceStatus();
      renderAuditStep({ preserveDraft: true });
    }
    return null;
  }
  const owner=pdfActionOwner();
  const [sourceResult, requestResult] = await Promise.all([
    getAssemblyContext(state.current.id),
    MeetingPackageService.listAuditChangeRequests(state.current.id)
  ]);
  if(!pdfActionStillCurrent(owner))throw Object.assign(new Error('이전 회의 조회를 중단했습니다.'),{code:'MEETING_EDIT_REQUEST_STALE'});
  if (sourceResult.error) throw sourceResult.error;
  if (requestResult.error) throw requestResult.error;
  state.sourceContext = sourceResult.data || null;
  state.auditChangeRequests = requestResult.data || [];
  if (render) {
    renderAssemblySourceStatus();
    renderAuditStep({ preserveDraft: true });
  }
  return state.sourceContext;
}

function chapterMode() {
  return Boolean(state.current && usesChapterEditor(state.current.meeting_type, state.activeDocument));
}

function parseChapters(content) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${String(content || '')}</div>`, 'text/html');
  return [...doc.querySelectorAll('section.meeting-chapter[data-chapter-id]')].map((section, index) => ({
    id: section.dataset.chapterId || `chapter-${index + 1}`,
    title: section.dataset.chapterTitle || `챕터 ${index + 1}`,
    className: section.className || 'meeting-chapter',
    html: section.innerHTML
  }));
}

function composeChapters() {
  return state.chapters.map((chapter) => `<section class="${escapeHtml(chapter.className || 'meeting-chapter')}" data-chapter-id="${escapeHtml(chapter.id)}" data-chapter-title="${escapeHtml(chapter.title)}">${sanitizeHtml(chapter.html)}</section>`).join('');
}

function activeChapterIndex() {
  return Math.max(0, state.chapters.findIndex(chapter => chapter.id === state.activeChapterId));
}

function activeChapterLock() {
  const chapter = state.chapters[activeChapterIndex()];
  return getAssemblyChapterEditLock(chapter?.id || '', state.sourceContext);
}

function agendaBillLocked() {
  return state.activeDocument === 'MATERIALS' && (!state.agendaLock || state.agendaLock.locked)
    && String(state.chapters[activeChapterIndex()]?.className || '').split(/\s+/).includes('chapter-bill');
}

function renderChapterEditState() {
  const lock = activeChapterLock();
  const editor = $('chapterEditor');
  const title = $('chapterTitle');
  const notice = $('chapterLockNotice');
  const editable=documentEditingAllowed();
  editor.contentEditable = lock.locked || !editable ? 'false' : 'true';
  editor.setAttribute('aria-readonly', String(lock.locked || !editable));
  editor.classList.toggle('is-locked', lock.locked);
  const agendaLocked = agendaBillLocked();
  if (!lock.locked) protectMaterialAgendas(editor, state.activeDocument === 'MATERIALS' && (!state.agendaLock || state.agendaLock.locked));
  title.readOnly = lock.locked || agendaLocked || !editable;
  title.setAttribute('aria-readonly', title.readOnly ? 'true' : 'false');
  notice.hidden = !lock.locked && !agendaLocked;
  notice.textContent = lock.locked ? lock.reason : agendaLocked ? AGENDA_LOCK_REASON : '';
  const index = activeChapterIndex();
  $('moveChapterUpButton').disabled = !editable || lock.locked || agendaLocked || index === 0;
  $('moveChapterDownButton').disabled = !editable || lock.locked || agendaLocked || index >= state.chapters.length-1;
  $('deleteChapterButton').disabled = !editable || lock.locked || agendaLocked;
  document.querySelectorAll('.rich-toolbar [data-command]').forEach((button) => {
    button.disabled = lock.locked || !editable;
  });
  return lock;
}

function rememberActiveChapter() {
  if (!chapterMode() || !state.chapters.length || !$('chapterEditor')) return;
  if (activeChapterLock().locked) return;
  const index = activeChapterIndex();
  const copy = $('chapterEditor').cloneNode(true);
  clearMaterialAgendaUi(copy);
  state.chapters[index] = {
    ...state.chapters[index],
    title: $('chapterTitle').value.trim() || `챕터 ${index + 1}`,
    html: sanitizeHtml(stripEphemeralSignaturePreviewUrls(copy.innerHTML))
  };
}

function renderChapterList() {
  $('chapterList').innerHTML = state.chapters.map((chapter, index) => `
    <button type="button" class="chapter-item ${chapter.id === state.activeChapterId ? 'active' : ''}" data-chapter-id="${escapeHtml(chapter.id)}">
      <span>${index + 1}</span><strong>${escapeHtml(chapter.title)}</strong>
    </button>`).join('');
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(size / 1024))}KB`;
}

function activeChapterPdfAttachments() {
  return state.pdfAttachments.filter(row => row.insert_after_chapter_id === activePdfAttachmentAnchor());
}

function activePdfAttachmentAnchor() {
  if (chapterMode() && state.activeChapterId) return state.activeChapterId;
  if (state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS') return 'board-materials';
  return '';
}

function renderPdfAttachmentList() {
  if (!$('pdfAttachmentPanel') || !$('pdfAttachmentList')) return;
  const board = state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS';
  const available = (state.current?.meeting_type === 'GENERAL_ASSEMBLY' || board)
    && state.activeDocument === 'MATERIALS' && Boolean(activePdfAttachmentAnchor());
  $('pdfAttachmentPanel').hidden = !available;
  if (!available) {
    $('pdfAttachmentList').replaceChildren();
    return;
  }
  $('pdfAttachmentHeading').textContent = board ? '별첨 PDF 붙이기' : '이 챕터 뒤에 PDF 자료 붙이기';
  $('pdfAttachmentHelp').textContent = board ? '붙인 PDF는 아래 별첨 목록에서 관련 안건과 순서를 정할 수 있습니다.' : '별도로 만든 PDF를 붙이면 자료집 인쇄 시 현재 챕터 바로 뒤에 합쳐집니다.';
  const rows = activeChapterPdfAttachments();
  $('pdfAttachmentList').innerHTML = rows.length
    ? rows.map(row => `<div class="pdf-attachment-row" data-pdf-attachment-id="${escapeHtml(row.id)}">
        <span class="pdf-icon">📎</span>
        <span class="pdf-meta"><strong>${escapeHtml(row.title)}</strong><small>${Number(row.page_count || 0)}쪽 · ${formatFileSize(row.file_size)}</small></span>
        ${row.inherited?'': '<button type="button" class="btn btn-small btn-danger" data-pdf-action="delete">삭제</button>'}
      </div>`).join('')
    : '<div class="pdf-attachment-empty">첨부한 PDF가 없습니다. 자동 자료가 없는 항목은 그대로 비워 두어도 됩니다.</div>';
  for(const pending of MeetingPackageService.pendingPdfCleanups(pdfActionOwner())){
    const row=document.createElement('div');row.className='pdf-attachment-row';row.dataset.pdfAttachmentId=pending.id;
    const text=document.createElement('span');text.className='pdf-meta';text.textContent=(pending.title||pending.original_filename||'이전 PDF')+' · 제거 결과·파일 정리 확인 대기';
    const button=document.createElement('button');button.type='button';button.className='btn btn-small';button.dataset.pdfAction='delete';button.textContent='제거 결과 다시 확인';
    row.append(text,button);$('pdfAttachmentList').append(row);
  }
}

const boardAnnexDrafts = new Map();
let boardAnnexOwner = '', boardAnnexRevision = 0;
function boardAnnexKey() {
  return state.session?.user?.id && state.runtime?.coop_id && state.current?.id
    ? JSON.stringify([state.session.user.id,state.runtime.coop_id,state.current.id]) : '';
}
function boardAnnexValues() { return ['boardAnnexKind','boardAnnexTitle','boardAnnexBody','boardAnnexAgenda'].map(id=>$(id).value); }
function rememberBoardAnnexDraft() {
  if(!boardAnnexOwner)return;
  const values=boardAnnexValues();
  if(JSON.stringify(values)===JSON.stringify(['RULE','','','common']))boardAnnexDrafts.delete(boardAnnexOwner);
  else boardAnnexDrafts.set(boardAnnexOwner,values);
  $('discardBoardAnnexDraft').disabled=state.loading||!boardAnnexDrafts.has(boardAnnexOwner);
}
function activateBoardAnnexDraft() {
  const key=boardAnnexKey();if(key===boardAnnexOwner)return;
  rememberBoardAnnexDraft();boardAnnexOwner=key;boardAnnexRevision++;
  const values=boardAnnexDrafts.get(key)||['RULE','','','common'];
  ['boardAnnexKind','boardAnnexTitle','boardAnnexBody'].forEach((id,i)=>$(id).value=values[i]);
  renderBoardAnnexAgendaOptions($('boardAnnexAgenda'),values[3]??'common');
  rememberBoardAnnexDraft();
}
function hasUnsavedBoardAnnexDraft() {
  return boardAnnexDrafts.size>0 || (!!boardAnnexOwner && JSON.stringify(boardAnnexValues())!==JSON.stringify(['RULE','','','common']));
}
function clearBoardAnnexDrafts() {
  boardAnnexDrafts.clear();boardAnnexOwner='';boardAnnexRevision++;
  ['boardAnnexKind','boardAnnexTitle','boardAnnexBody'].forEach((id,i)=>$(id).value=i===0?'RULE':'');
  renderBoardAnnexAgendaOptions($('boardAnnexAgenda'),'common');
  $('discardBoardAnnexDraft').disabled=true;
}
async function discardBoardAnnexDraft() {
  const key=boardAnnexOwner,revision=boardAnnexRevision,values=JSON.stringify(boardAnnexValues());
  if(state.loading||!key||!boardAnnexDrafts.has(key))return;
  if(!await window.CoopDialog.confirm('이 초안을 버릴까요?'))return;
  if(state.loading||key!==boardAnnexOwner||key!==boardAnnexKey()||revision!==boardAnnexRevision||values!==JSON.stringify(boardAnnexValues())||window.frameElement?.hidden)return;
  boardAnnexDrafts.delete(key);boardAnnexOwner='';activateBoardAnnexDraft();
  window.ErpWorkspaceResume?.checkpoint($('boardAnnexPanel'));
  $('boardAnnexTitle').focus({preventScroll:true});
}
function renderBoardAnnexPanel() {
  activateBoardAnnexDraft();
  renderBoardAnnexAgendaOptions($('boardAnnexAgenda'),$('boardAnnexAgenda').value);
  $('boardAnnexPanel').hidden = state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS';
  rememberBoardAnnexDraft();
  renderBoardAnnexLinks();
}

function renderBoardAnnexAgendaOptions(select,value) {
  select.replaceChildren();
  for(const [id,title] of [['','연결 안 함'],['common','공통 자료'],...state.agendas.map((a,i)=>[a.id,`제${i+1}호 안건 · ${a.title}`])]) {
    const o=document.createElement('option');o.value=id;o.textContent=title;select.append(o);
  }
  if(value&&!['common',...state.agendas.map(a=>a.id)].includes(value)){
    const o=document.createElement('option');o.value=value;o.textContent='이전 안건 · 연결 확인 필요';select.append(o);
  }
  select.value=value;
}
function renderBoardAnnexLinks() {
  const list=$('boardAnnexLinks');if(!list)return;
  list.replaceChildren();if(state.current?.meeting_type!=='BOARD'||state.activeDocument!=='MATERIALS')return;
  const editor=$('documentEditor'),items=listMeetingAnnexes(currentBoardEditorHtml(),state.pdfAttachments,{document,sanitizeHtml});
  const nodes=[...editor.querySelectorAll('.board-text-annex,.board-pdf-annex')].filter(n=>!n.parentElement.closest('.board-text-annex,.board-pdf-annex'));
  const order=new Map(nodes.flatMap((n,i)=>[[n.dataset.boardAnnexId||`text:${nodes.slice(0,i).filter(x=>x.classList.contains('board-text-annex')).length}`,i],...(n.dataset.boardPdfId?[[`pdf:${n.dataset.boardPdfId}`,i]]:[])]));
  items.sort((a,b)=>(order.get(a.id)??order.get('pdf:'+a.pdfId)??1e6)-(order.get(b.id)??order.get('pdf:'+b.pdfId)??1e6));
  for(const item of items){
    const row=document.createElement('div');row.className='board-annex-link-row';row.dataset.annexLink=item.id;
    const title=document.createElement('strong');title.textContent=item.title+(item.kind==='PDF'?' · PDF':'');row.append(title);
    const label=document.createElement('label');label.textContent='관련 안건';
    const select=document.createElement('select');select.dataset.annexRelation=item.id;select.setAttribute('aria-label',item.title+' 관련 안건');renderBoardAnnexAgendaOptions(select,item.agendaId);label.append(select);row.append(label);
    const peers=items.filter(x=>x.agendaId===item.agendaId),index=peers.indexOf(item);
    for(const [direction,text]of [[-1,'위로'],[1,'아래로']]){const b=document.createElement('button');b.type='button';b.className='btn btn-small';b.textContent=text;b.dataset.annexMove=item.id;b.dataset.direction=String(direction);b.setAttribute('aria-label',item.title+' '+text);b.dataset.edge=String(direction<0?index===0:index===peers.length-1);row.append(b);}
    list.append(row);
  }
  const allowed=documentEditingAllowed()&&!state.loading;
  list.querySelectorAll('select,button').forEach(n=>n.disabled=!allowed||n.dataset.edge==='true');
}
function changeBoardAnnexRelation(id,value,direction) {
  if(!documentEditingAllowed()||state.loading||window.frameElement?.hidden||state.current?.meeting_type!=='BOARD'||state.activeDocument!=='MATERIALS')return;
  const editor=$('documentEditor');let item=listMeetingAnnexes(currentBoardEditorHtml(),state.pdfAttachments,{document,sanitizeHtml}).find(a=>a.id===id);if(!item)return;
  // PDF relationship markers are document content, saved with the same document lease.
  if(item.kind==='PDF'&&![...editor.querySelectorAll('.board-pdf-annex')].some(n=>n.dataset.boardPdfId===item.pdfId)){
    const next=appendMeetingTextAnnexes(currentBoardEditorHtml(),[item],state.current.id,{document,sanitizeHtml,pdfs:state.pdfAttachments});
    editor.innerHTML=next.html;
  }
  let node=item.kind==='PDF'?[...editor.querySelectorAll('.board-pdf-annex')].find(n=>n.dataset.boardPdfId===item.pdfId):[...editor.querySelectorAll('.board-text-annex')].find((n,i)=>(n.dataset.boardAnnexId||`text:${i}`)===id);
  if(!node)return;
  const actualId=node.dataset.boardAnnexId||id;
  let changed;
  if(direction){node.dataset.boardAnnexId ||= crypto.randomUUID();changed=moveMeetingAnnex(editor,node.dataset.boardAnnexId,direction,state.agendas);}
  else changed=setMeetingAnnexLink(editor,actualId,value,state.agendas);
  if(!changed)return;
  state.documentDirty=true;state.pendingDocuments.add('MATERIALS');decorateBoardAnnexes();renderBoardAnnexLinks();
  const focusId=item.kind==='PDF'?id:node.dataset.boardAnnexId;
  const related=[...$('boardAnnexLinks').querySelectorAll('select')].find(n=>n.dataset.annexRelation===focusId);
  const focus=direction? [...$('boardAnnexLinks').querySelectorAll('[data-annex-move]')].find(n=>n.dataset.annexMove===focusId&&Number(n.dataset.direction)===direction&&!n.disabled)||related:related;
  focus?.focus({preventScroll:true});
}

function normalizeBoardMaterialsHtml(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(value);
  const paper = wrapper.querySelector('.board-one-paper');
  if (!paper) return wrapper.innerHTML;
  paper.querySelector(':scope > .meeting-org-info')?.remove();
  const memoHeading = [...paper.querySelectorAll(':scope > h2')]
    .find(node => node.textContent.trim().replace(/[\[\]]/g, '') === '메모');
  if (memoHeading && !paper.querySelector(':scope > .board-memo-space')) {
    const space = document.createElement('div');
    space.className = 'board-memo-space';
    space.setAttribute('aria-label', '회의 중 메모할 공간');
    space.innerHTML = '<div class="board-memo-line"></div>'.repeat(6);
    const following = memoHeading.nextElementSibling;
    (following?.matches('p') ? following : memoHeading).insertAdjacentElement('afterend', space);
  }
  return wrapper.innerHTML;
}

function regeneratedDocumentPayload(row, existing = {}) {
  const content_html = sanitizeHtml(row.content);
  if (state.current?.meeting_type !== 'BOARD' || row.type !== 'MATERIALS') {
    return { content_html, manually_edited: false };
  }
  const saved = document.createElement('div');
  saved.innerHTML = sanitizeHtml(existing.content_html || '');
  const annexes = [...saved.querySelectorAll('.board-text-annex,.board-pdf-annex')]
    .filter(node => !node.parentElement.closest('.board-text-annex,.board-pdf-annex'));
  if (!annexes.length) return { content_html, manually_edited: false };
  const generated = document.createElement('div');
  generated.innerHTML = content_html;
  generated.querySelectorAll('.board-text-annex,.board-pdf-annex').forEach(node => node.remove());
  for (const annex of annexes) {
    annex.classList.remove('is-collapsed');
    generated.append(annex);
  }
  // Annex title/body belongs to this document, not the automatically generated agenda.
  // Keep the latest editor snapshot, including explicit removals and deliberate duplicate text.
  orderMeetingAnnexes(generated,state.agendas);
  return { content_html: generated.innerHTML, manually_edited: true };
}

function decorateBoardAnnexes({ expandLast = false } = {}) {
  if (state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS') return;
  const sections = [...$('documentEditor').querySelectorAll('.board-text-annex')];
  sections.forEach((section, index) => {
    const header = section.querySelector('.board-annex-heading');
    if (!header || header.querySelector('.board-annex-toggle')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'board-annex-toggle';
    button.contentEditable = 'false';
    const expanded = expandLast && index === sections.length - 1;
    section.classList.toggle('is-collapsed', !expanded);
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${header.querySelector('h1')?.textContent.trim() || '별첨'} ${expanded ? '접기' : '펼치기'}`);
    button.textContent = expanded ? '접기' : '펼치기';
    header.append(button);
  });
}

function currentBoardEditorHtml() {
  const copy = $('documentEditor').cloneNode(true);
  clearMaterialAgendaUi(copy);
  copy.querySelectorAll('.board-annex-toggle').forEach(button => button.remove());
  copy.querySelectorAll('.board-text-annex.is-collapsed').forEach(section => section.classList.remove('is-collapsed'));
  if(state.current?.meeting_type==='BOARD'&&state.activeDocument==='MATERIALS')orderMeetingAnnexes(copy,state.agendas);
  const html = sanitizeHtml(copy.innerHTML);
  return state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS'
    ? normalizeBoardMaterialsHtml(html)
    : html;
}

async function addBoardTextAnnex() {
  if (state.current?.meeting_type !== 'BOARD' || state.activeDocument !== 'MATERIALS') return;
  if(!['DRAFT','READY'].includes(state.current.status))throw new Error('완료되거나 무산된 회의의 원본에는 별첨을 추가할 수 없습니다.');
  const owner=pdfActionOwner(),epoch=documentEditEpoch,revision=boardAnnexRevision,values=JSON.stringify(boardAnnexValues());
  const current=()=>pdfActionStillCurrent(owner)&&epoch===documentEditEpoch&&state.activeDocument==='MATERIALS'&&revision===boardAnnexRevision&&values===JSON.stringify(boardAnnexValues());
  if(MeetingPackageService.documentEdits.hasPending(owner))throw new Error('이전 저장 결과를 먼저 확인한 뒤 별첨을 넣어 주세요.');
  if(!$('boardAnnexTitle').value.trim()||!$('boardAnnexBody').value.trim())throw new Error('별첨 제목과 본문을 입력해 주세요.');
  if(!documentEditingAllowed()){
    await beginDocumentEdit(false);
    if(!current())return;
    if(!documentEditingAllowed())throw new Error(documentConflicts.has(documentEditKey())
      ? '저장된 회의자료와 작성 중인 초안을 먼저 확인해 주세요.'
      : '다른 담당자가 회의자료를 편집 중입니다. 편집이 끝나면 다시 넣어 주세요.');
  }
  if(!current())return;
  const editor = $('documentEditor');
  const title = $('boardAnnexTitle').value.trim();
  const body = $('boardAnnexBody').value.trim();
  const number = Math.max(0, ...[...editor.querySelectorAll('.board-text-annex')]
    .map(section => Number(section.dataset.boardAnnexNumber) || 0)) + 1;
  const html = buildBoardTextAnnex({ title, body, kind: $('boardAnnexKind').value, number });
  const fragment=document.createElement('div');fragment.innerHTML=sanitizeHtml(html);
  const added=fragment.firstElementChild;added.dataset.boardAnnexId=crypto.randomUUID();
  const agenda=$('boardAnnexAgenda').value;
  if(agenda&&agenda!=='common'&&!state.agendas.some(a=>a.id===agenda))throw new Error('관련 안건을 다시 선택해 주세요.');
  if(agenda)added.dataset.boardAgendaId=agenda;
  editor.append(added);orderMeetingAnnexes(editor,state.agendas);
  decorateBoardAnnexes({ expandLast: true });
  state.documentDirty = true;
  $('boardAnnexTitle').value = '';
  $('boardAnnexBody').value = '';
  $('boardAnnexKind').value = 'RULE';$('boardAnnexAgenda').value='common';boardAnnexRevision++;rememberBoardAnnexDraft();renderBoardAnnexLinks();
  editor.querySelector('.board-text-annex:last-child')?.scrollIntoView({ block: 'nearest' });
  try {
    await saveActiveDocument({ quiet: true });
  } catch (error) {
    throw new Error('별첨은 화면에 추가됐지만 저장되지 않았습니다. 회의 전 자료 전체 저장을 다시 눌러 주세요.', { cause: error });
  }
  showToast('별첨을 회의자료에 넣고 저장했습니다.');
}

function renderActiveChapter() {
  if (!state.chapters.length) {
    $('chapterTitle').value = '';
    $('chapterEditor').className = 'rich-editor chapter-preview';
    $('chapterEditor').innerHTML = '<p>자료집 챕터가 없습니다.</p>';
    $('chapterPosition').textContent = '';
    $('chapterLockNotice').hidden = true;
    $('chapterEditor').contentEditable = 'false';
    renderChapterList();
    renderPdfAttachmentList();
    return;
  }
  const index = activeChapterIndex();
  const chapter = state.chapters[index];
  state.activeChapterId = chapter.id;
  $('chapterTitle').value = chapter.title;
  const chapterClasses = String(chapter.className || '')
    .split(/\s+/)
    .filter(name => /^chapter-[a-z0-9-]+$/i.test(name));
  $('chapterEditor').className = ['rich-editor', 'chapter-preview', ...chapterClasses].join(' ');
  $('chapterEditor').innerHTML = sanitizeHtml(chapter.html);
  void hydrateSignaturePreviews($('chapterEditor'));
  $('chapterPosition').textContent = `${index + 1} / ${state.chapters.length}`;
  $('previousChapterButton').disabled = index === 0;
  $('nextChapterButton').disabled = index >= state.chapters.length - 1;
  const lock = renderChapterEditState();
  $('moveChapterUpButton').disabled = !documentEditingAllowed() || lock.locked || agendaBillLocked() || index === 0;
  $('moveChapterDownButton').disabled = !documentEditingAllowed() || lock.locked || agendaBillLocked() || index >= state.chapters.length - 1;
  $('deleteChapterButton').disabled = !documentEditingAllowed() || lock.locked || agendaBillLocked();
  renderChapterList();
  renderPdfAttachmentList();
}

function renderActiveDocument() {
  const doc = state.documents.get(state.activeDocument) || {};
  const title = doc.title || defaultDocumentTitle(state.activeDocument);
  $('documentTitle').value = state.activeDocument === 'SCENARIO_SECRETARIAT' ? title.replace(/사무국장용 진행 시나리오$/, '실무자용 진행 시나리오') : title;
  const useChapters = chapterMode();
  $('documentEditor').hidden = useChapters;
  $('chapterLayout').hidden = !useChapters;
  if (useChapters) {
    state.chapters = parseChapters(doc.content_html || '');
    if (!state.chapters.length) {
      const generated = generatedDocumentRows().find(row => row.type === 'MATERIALS');
      state.chapters = parseChapters(generated?.content || '');
      const legacyContent = sanitizeHtml(doc.content_html || '').trim();
      if (legacyContent) {
        state.chapters.push({
          id: `legacy-draft-${Date.now()}`,
          title: '이전 자료 초안',
          className: 'meeting-chapter chapter-legacy',
          html: `<h1>이전 자료 초안</h1>${legacyContent}`
        });
      }
    }
    if (!state.chapters.some(chapter => chapter.id === state.activeChapterId)) state.activeChapterId = state.chapters[0]?.id || null;
    renderActiveChapter();
  } else {
    state.chapters = [];
    state.activeChapterId = null;
    $('chapterList').replaceChildren();
    $('chapterTitle').value = '';
    $('chapterEditor').className = 'rich-editor chapter-preview';
    $('chapterEditor').replaceChildren();
    $('chapterLockNotice').hidden = true;
    $('chapterTitle').readOnly = false;
    document.querySelectorAll('.rich-toolbar [data-command]').forEach((button) => { button.disabled = false; });
    $('chapterPosition').textContent = '';
    renderPdfAttachmentList();
    $('documentEditor').innerHTML = state.current?.meeting_type === 'BOARD' && state.activeDocument === 'MATERIALS'
      ? normalizeBoardMaterialsHtml(doc.content_html || '')
      : state.activeDocument === 'SCENARIO_SECRETARIAT' ? labelPracticalScript(doc.content_html || '', sanitizeHtml) : sanitizeHtml(doc.content_html || '');
    if(state.current?.meeting_type==='BOARD'&&state.activeDocument==='MATERIALS')orderMeetingAnnexes($('documentEditor'),state.agendas);
    decorateBoardAnnexes();
  }
  state.documentDirty = false;
  document.querySelectorAll('.doc-tab').forEach(button => button.classList.toggle('active', button.dataset.document === state.activeDocument));
  renderBoardAnnexPanel();
  renderAgendaLock();
  renderDocumentEditState();
}

function rememberActiveDocument() {
  if (!state.current) return;
  if (state.documentDirty) state.pendingDocuments.add(state.activeDocument);
  const existing = state.documents.get(state.activeDocument) || {};
  if (chapterMode()) rememberActiveChapter();
  state.documents.set(state.activeDocument, {
    ...existing,
    document_type: state.activeDocument,
    title: $('documentTitle').value.trim() || defaultDocumentTitle(state.activeDocument),
    content_html: chapterMode() ? sanitizeHtml(composeChapters()) : currentBoardEditorHtml(),
    manually_edited: state.documentDirty || existing.manually_edited === true
  });
}

function defaultDocumentTitle(type) {
  const title = state.current?.title || '회의';
  if (type === 'MATERIALS') return state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? `${title} 자료집` : `${title} 회의자료`;
  if (type === 'SCENARIO_SECRETARIAT') return `${title} 실무자용 진행 시나리오`;
  return state.current?.meeting_type === 'GENERAL_ASSEMBLY' ? `${title} 진행 시나리오` : `${title} 의장용 진행 시나리오`;
}

function scenarioChairGroups(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = sanitizeHtml(html || '');
  const groups = new Map();
  for (const heading of wrapper.querySelectorAll('.board-scenario > h2')) {
    const label = heading.textContent.trim();
    let kind = label === '개회 선언' ? 'OPENING' : label === '폐회 선언' ? 'CLOSING' : '';
    if (!kind) kind = /^\[보고\s/.test(label) ? 'REPORT'
      : /^\[의결\s/.test(label) ? 'DECISION'
      : /^\[토의\s/.test(label) ? 'DISCUSSION'
      : /^\[기타\s/.test(label) ? 'OTHER' : '';
    if (!kind) continue;
    const lines = [];
    for (let node = heading.nextElementSibling; node && node.tagName !== 'H2'; node = node.nextElementSibling) {
      if (node.matches('p.speaker') && node.querySelector(':scope > strong')?.textContent.trim() === '의장') lines.push(node);
    }
    const key = kind === 'OPENING' || kind === 'CLOSING' ? kind : `${kind}:${groups.get(kind)?.length || 0}`;
    if (kind === 'OPENING' || kind === 'CLOSING') groups.set(key, lines);
    else groups.set(kind, [...(groups.get(kind) || []), lines]);
  }
  return { wrapper, groups };
}

function reusableChairStyle(html, row) {
  const { wrapper, groups } = scenarioChairGroups(html);
  let inherited = null;
  try { inherited = JSON.parse(wrapper.querySelector('.board-scenario')?.getAttribute('data-inherited-chair-style') || 'null'); }
  catch (_) { inherited = null; }
  const entries = inherited?.entries && typeof inherited.entries === 'object' ? { ...inherited.entries } : {};
  for (const kind of ['OPENING', 'CLOSING', 'REPORT', 'DECISION', 'DISCUSSION', 'OTHER']) {
    const lines = kind === 'OPENING' || kind === 'CLOSING' ? groups.get(kind) : groups.get(kind)?.[0];
    if (!lines) continue;
    lines.forEach((line, index) => { entries[`${kind}:${index}`] = line.innerHTML; });
  }
  return Object.keys(entries).length ? { entries, title: row?.title || inherited?.title || '', eligibleCount: row?.eligible_count } : null;
}

function applyReusableChairStyle(html, style, row, agendas = []) {
  if (!style?.entries) return html;
  const { wrapper, groups } = scenarioChairGroups(html);
  wrapper.querySelector('.board-scenario')?.setAttribute('data-inherited-chair-style', JSON.stringify(style));
  for (const kind of ['OPENING', 'CLOSING', 'REPORT', 'DECISION', 'DISCUSSION', 'OTHER']) {
    const sets = kind === 'OPENING' || kind === 'CLOSING' ? [groups.get(kind) || []] : groups.get(kind) || [];
    for (const [setIndex, lines] of sets.entries()) lines.forEach((line, index) => {
      // Recording is the approved fixed notice, not inherited consent wording.
      if (kind === 'OPENING' && index === 2) return;
      // The introduction names a particular agenda. Always regenerate it from this meeting.
      if (['REPORT', 'DECISION', 'DISCUSSION', 'OTHER'].includes(kind) && index === 0) return;
      if (kind === 'DECISION' && index === 2
        && agendas.filter(agenda => agenda.agenda_kind === 'DECISION')[setIndex]?.decision_draft?.trim()) return;
      const previous = style.entries[`${kind}:${index}`];
      if (!previous) return;
      const scratch = document.createElement('p');
      scratch.innerHTML = sanitizeHtml(previous);
      if (scratch.querySelector(':scope > strong')?.textContent.trim() !== '의장') return;
      if (style.title && row?.title) scratch.innerHTML = scratch.innerHTML.replaceAll(escapeHtml(style.title), escapeHtml(row.title));
      if (kind === 'OPENING' && index === 0 && Number.isInteger(Number(row?.eligible_count))) {
        scratch.innerHTML = scratch.innerHTML.replace(/(재적\s*이사\s*)\d+(\s*명)/g, `$1${Number(row.eligible_count)}$2`);
      }
      line.innerHTML = scratch.innerHTML;
    });
  }
  return sanitizeHtml(wrapper.innerHTML);
}

function generatedDocumentRows() {
  const chair = officialById(state.current?.chair_official_id);
  const chairName = chair ? `${officialRole(chair)} ${officialName(chair)}` : '의장';
  const rows = buildPreMeetingDocuments({
    row: state.current,
    agendas: state.agendas,
    coopName: state.runtime?.coop_name || state.company.company_name || '협동조합',
    company: state.company,
    chairName,
    officials: state.officials,
    sourceContext: state.sourceContext
  });
  if (state.current?.meeting_type === 'BOARD' && state.inheritedChairStyle) {
    rows.forEach(row => {
      if (['SCENARIO', 'SCENARIO_SECRETARIAT'].includes(row.type)) {
        row.content = applyReusableChairStyle(row.content, state.inheritedChairStyle, state.current, state.agendas);
      }
    });
  }
  return rows.filter(row=>documentInStage(row.type));
}

function collectPackageDraftPayload() {
  const existingBookletData = state.current?.assembly_booklet_data || {};
  const regularAssembly = $('meetingType').value === 'GENERAL_ASSEMBLY' && $('assemblyKind').value !== 'EXTRAORDINARY';
  return {
    meeting_type: $('meetingType').value,
    assembly_kind: $('meetingType').value === 'GENERAL_ASSEMBLY' ? $('assemblyKind').value : null,
    fiscal_year: $('meetingType').value === 'GENERAL_ASSEMBLY' && $('assemblyKind').value !== 'EXTRAORDINARY'
      ? Number($('fiscalYear').value || defaultFiscalYear())
      : null,
    meeting_number: $('meetingNumber').value.trim() || null,
    title: $('meetingTitle').value.trim() || state.current?.title || '회의',
    notice_date: $('noticeDate').value || null,
    meeting_date: $('meetingDate').value || null,
    start_time: $('startTime').value || null,
    end_time: $('endTime').value || null,
    location: $('meetingLocation').value.trim() || null,
    chair_official_id: $('chairOfficial').value ? Number($('chairOfficial').value) : null,
    facilitator_name: $('facilitatorName').value.trim() || null,
    eligible_count: $('eligibleCount').value === '' ? null : Number($('eligibleCount').value),
    opening_message: $('openingMessage').value.trim() || null,
    closing_message: $('closingMessage').value.trim() || null,
    document_notes: $('documentNotes').value.trim() || null,
    private_notes: $('privateNotes').value.trim() || null,
    assembly_booklet_data: regularAssembly ? collectAssemblyBookletData() : existingBookletData
  };
}

function syncWorkingStateFromForms() {
  if (!state.current || state.current.status==='CANCELLED' || $('editorBody').hidden) return;
  state.current = { ...state.current, ...collectPackageDraftPayload() };
  if(agendasLoaded)state.agendas = collectAgendasFromDom();
  renderEditorHeader();
}

// Earlier regular booklets already contain their official default titles and
// order, but predate the structured marker consumed by linked minutes.
function savedRegularAssemblyPlan(row, material) {
  if(row?.meeting_type!=='GENERAL_ASSEMBLY'||row.assembly_kind==='EXTRAORDINARY'||!material?.content_html)return null;
  const source=document.createElement('template');source.innerHTML=material.content_html;
  const chapters=[...source.content.querySelectorAll('.meeting-chapter.chapter-bill')];
  if(chapters.length<1||chapters.length>100)return null;
  const used=new Set(),plan=[];
  for(const chapter of chapters){
    const key=/^bill-[1-9][0-9]*-([a-z-]+)$/.exec(chapter.dataset.chapterId||'')?.[1];
    const title=chapter.querySelector(':scope > h2')?.textContent?.trim();
    if(!key||key==='additional'||!Object.hasOwn(assemblyBaseOptions,key)||used.has(key)||!title||title.length>300)return null;
    used.add(key);plan.push({key,title});
  }
  return assemblyMinutePlan(plan,row.assembly_booklet_data);
}

const legacyMaterialRevisions=new WeakMap();
function preserveSavedAssemblyMaterials(row) {
  const saved=documentSavedRows.get('MATERIALS');
  if(row?.meeting_type!=='GENERAL_ASSEMBLY'||row.assembly_kind==='EXTRAORDINARY'||!saved?.content_html)return false;
  if(!legacyMaterialRevisions.has(saved)){
    const maybeLegacy=!/data-assembly-plan="[0-9a-f]+"/.test(saved.content_html)||saved.content_html.includes('data-assembly-legacy="1"');
    legacyMaterialRevisions.set(saved,maybeLegacy&&!!savedRegularAssemblyPlan(row,saved));
  }
  return legacyMaterialRevisions.get(saved);
}

function withLegacyAssemblyPlan(html,plan) {
  const encoded=encodeAssemblyMinutePlan(plan),existing=/data-assembly-legacy="1"\s+data-assembly-plan="[0-9a-f]+"/;
  if(existing.test(html))return html.replace(existing,'data-assembly-legacy="1" data-assembly-plan="'+encoded+'"');
  // Put the metadata inside a heading of the saved chapter so that later
  // chapter editing/compilation carries it along without changing visible text.
  const chapter=/<(?:article|section)\b[^>]*class="[^"]*\bchapter-bill\b[^"]*"[^>]*>/i.exec(html);
  if(!chapter)return null;
  const from=chapter.index+chapter[0].length,heading=/<h[12]\b/i.exec(html.slice(from));
  if(!heading)return null;
  const to=from+heading.index+heading[0].length;
  return html.slice(0,to)+' data-assembly-legacy="1" data-assembly-plan="'+encoded+'"'+html.slice(to);
}

function refreshAutoDrafts({ force = false, render = true } = {}) {
  if (!state.current || state.current.status==='CANCELLED' || pendingSection('documents')) return;
  const activeExisting = state.documents.get(state.activeDocument) || {};
  const activeProtected = !force && (state.documentDirty || activeExisting.manually_edited === true);
  for (const row of generatedDocumentRows()) {
    const existing = state.documents.get(row.type) || {};
    if(!force&&row.type==='MATERIALS'&&preserveSavedAssemblyMaterials(state.current))continue;
    if (!force && (existing.manually_edited === true || (row.type === state.activeDocument && state.documentDirty))) continue;
    state.documents.set(row.type, {
      ...existing,
      document_type: row.type,
      title: row.title,
      ...regeneratedDocumentPayload(row, existing),
      live_preview: true
    });
  }
  if (render && state.currentStep === 'documents' && !activeProtected) renderActiveDocument();
}

function scheduleAutoDraftRefresh(section = 'info') {
  if (typeof section === 'object') markFormDirty(section.target);
  else if (section === 'agendas') state.agendaDirty = true;
  else state.infoDirty = true;
  window.clearTimeout(state.autoDraftTimer);
  const packageId = state.current?.id;
  state.autoDraftTimer = window.setTimeout(() => {
    if (state.current?.id !== packageId || state.loading) return;
    syncWorkingStateFromForms();
    refreshAutoDrafts();
  }, 180);
}

function validateSchedule() {
  const notice = $('noticeDate').value;
  const meeting = $('meetingDate').value;
  if (notice && meeting) {
    const noticeTime = Date.parse(`${notice}T00:00:00Z`);
    const meetingTime = Date.parse(`${meeting}T00:00:00Z`);
    if ((meetingTime - noticeTime) / 86400000 < 7) throw new Error('회의일은 공고일로부터 최소 7일 뒤여야 합니다.');
  }
  if ($('startTime').value && $('endTime').value && $('endTime').value <= $('startTime').value) {
    throw new Error('종료 시각은 시작 시각보다 늦어야 합니다.');
  }
}

function collectPackagePayload() {
  validateSchedule();
  const payload = collectPackageDraftPayload();
  if (!$('meetingTitle').value.trim()) throw new Error('회의 제목을 입력하세요.');
  return payload;
}

async function saveInfo({ quiet = false } = {}) {
  if (!state.current) return false;
  const payload = collectPackagePayload();
  const { data, error } = await MeetingPackageService.updatePackage(state.current.id, payload);
  if (error) throw error;
  state.current = data;
  state.infoDirty = false;
  syncSavedMeetingProgress();
  const index = state.packages.findIndex(row => row.id === data.id);
  if (index >= 0) state.packages[index] = { ...state.packages[index], ...data };
  renderPackages();
  renderEditorHeader();
  if (state.agendaLock?.board_plan_review) refreshSavedBoardPlan();
  await loadAssemblySources();
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  if (!quiet) showToast('기본정보를 저장했습니다.');
  return true;
}

async function notifyAuditReportSigners(minuteId) {
  const safeMinuteId = String(minuteId || '').trim();
  if (!safeMinuteId) return { ok: false, error: 'MINUTE_ID_REQUIRED' };
  const response = await supabase.functions.invoke('signature-telegram-dm', {
    body: {
      minuteId: safeMinuteId,
      signBaseUrl: new URL('/minutes/minutes_sign.html', window.location.origin).toString()
    }
  });
  if (response.error) throw response.error;
  return response.data || {};
}

async function resetAuditDraft() {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    throw new Error('감사보고서 연동은 정기총회에서만 사용합니다.');
  }
  if (state.auditDraftDirty && !(await window.CoopDialog.confirm('현재 고친 감사보고서 내용을 결산자료 기준 초안으로 다시 만들까요?'))) return;
  await saveInfo({ quiet: true });
  const source = await loadAssemblySources();
  if (!source?.closing_report) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산보고서를 회계관리에서 먼저 생성해 주세요.`);
  }
  if (!source?.closing?.is_closed) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산을 완료하고 회계관리에서 결산보고서를 다시 생성한 뒤 감사에게 보내 주세요.`);
  }
  if (auditReportLocked(source.audit_report)) throw new Error('감사의 전자서명이 시작되어 감사보고서를 다시 만들 수 없습니다.');
  const content = generatedAuditDraft(source);
  if (!content) throw new Error('감사보고서 초안을 만들 결산자료가 없습니다.');
  $('auditDraftEditor').innerHTML = content;
  $('auditDraftEditor').classList.remove('is-empty');
  state.auditDraftDirty = true;
  renderAuditStep({ preserveDraft: true });
  showToast('결산자료로 감사보고서 초안을 만들었습니다. 내용을 확인하고 전자검토를 요청해 주세요.', 4200);
}

async function saveAuditReportForReview() {
  if (!state.current || state.current.meeting_type !== 'GENERAL_ASSEMBLY' || state.current.assembly_kind === 'EXTRAORDINARY') {
    throw new Error('감사보고서 연동은 정기총회에서만 사용합니다.');
  }
  const owner=pdfActionOwner(), editor=$('auditDraftEditor');
  const content=sanitizeHtml(editor.innerHTML), expected=state.auditDraftExpected||auditExpected(state.sourceContext?.audit_report);
  if (!String(editor.textContent || '').trim()) throw new Error('감사보고서 내용을 먼저 작성해 주세요.');
  await saveInfo({ quiet: true });
  if(!pdfActionStillCurrent(owner))return null;
  const source = await loadAssemblySources();
  if (!source?.closing_report) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산보고서를 회계관리에서 먼저 생성해 주세요.`);
  }
  if (!source?.closing?.is_closed) {
    throw new Error(`${source?.fiscal_year || $('fiscalYear').value}년도 결산을 완료하고 회계관리에서 결산보고서를 다시 생성한 뒤 감사에게 보내 주세요.`);
  }
  if (auditReportLocked(source.audit_report)) {
    throw new Error('감사의 전자서명이 시작되어 감사보고서 내용을 바꿀 수 없습니다.');
  }
  const title = `${source.fiscal_year}년도 감사보고서`;
  const { data, error, previousInput } = await MeetingPackageService.prepareAuditReport(owner.packageId, { title, content, expected },()=>pdfActionStillCurrent(owner));
  if(!pdfActionStillCurrent(owner))return null;
  if (error) {
    if(String(error.message).includes('MEETING_AUDIT_CONFLICT')){
      await loadAssemblySources();
      if(pdfActionStillCurrent(owner)){
        const latest=state.sourceContext?.audit_report;
        await window.CoopDialog.alert('다른 사람이 감사보고서를 수정했습니다. 작성한 초안은 유지했습니다. 전자검토 문서에서 최신 내용을 확인한 뒤 다시 저장해 주세요.');
        if(pdfActionStillCurrent(owner))state.auditDraftExpected=auditExpected(latest);
      }
    }
    throw error;
  }
  if(previousInput)throw new Error('이전 감사보고서 저장 결과를 확인했습니다. 지금 추가로 쓴 내용은 미저장 상태로 남겼습니다. 최신 문서를 확인한 뒤 다시 저장해 주세요.');
  const unchanged=sanitizeHtml(editor.innerHTML)===content;
  if(unchanged){state.auditDraftDirty=false;state.auditDraftExpected={id:data.id,title,content};}
  else state.auditDraftDirty=true;
  // No reread/render may replace extra typing before the exact save is confirmed.
  try{await loadAssemblySources();}catch(_){throw new Error('감사보고서는 저장했지만 최신 조회를 마치지 못했습니다. 다시 확인한 뒤 전자검토를 요청해 주세요.');}
  if(!pdfActionStillCurrent(owner)||!unchanged||sanitizeHtml(editor.innerHTML)!==content)return null;
  refreshAutoDrafts({ render: state.currentStep === 'documents' });
  renderAuditStep();
  return data?.id || state.sourceContext?.audit_report?.id || null;
}

async function requestAuditReview() {
  const owner=pdfActionOwner();
  const minuteId = await saveAuditReportForReview();
  if (!minuteId || !pdfActionStillCurrent(owner)) return;
  let notification = null;
  let notificationError = null;
  if (minuteId) {
    try {
      notification = await notifyAuditReportSigners(minuteId);
    } catch (error) {
      notificationError = error;
      console.warn('notifyAuditReportSigners failed:', error?.message || error);
    }
  }
  if(!pdfActionStillCurrent(owner))return;
  if (minuteId) window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
  const sentCount = Number(notification?.sentCount || 0);
  const pendingKakaoCount = Number(notification?.kakaoTemplatePendingCount || 0);
  const failedCount = Number(notification?.failedCount || 0);
  if (window.ExpoRuntimeBridge && notification?.simulation === true) {
    showToast('🔔 감사보고서를 준비했어요. 이 단계에서 서명 요청 알림이 가요. 지금은 시연 중이에요.', 4200);
  } else if (sentCount > 0) {
    showToast(`감사보고서를 준비하고 서명 요청 ${sentCount}건을 보냈습니다.`, 4200);
  } else if (pendingKakaoCount > 0) {
    showToast('감사보고서를 준비했습니다. 알림톡 검수 완료 뒤 문서함에서 서명 요청을 다시 보내 주세요.', 5200);
  } else if (notificationError || failedCount > 0) {
    showToast('감사보고서는 준비됐지만 서명 요청 알림은 다시 보내 주세요.', 4600);
  } else {
    showToast('감사보고서를 감사 전자검토·서명 문서로 준비했습니다.', 3600);
  }
}

function openAuditReport() {
  const minuteId = state.sourceContext?.audit_report?.id;
  if (!minuteId) return showToast('먼저 감사보고서를 준비해 주세요.');
  window.open(`/minutes/minutes_sign.html?minuteId=${encodeURIComponent(minuteId)}`, '_blank', 'noopener');
}

async function recordAuditChangeRequest() {
  const owner=pdfActionOwner();
  const audit = state.sourceContext?.audit_report;
  if (!state.current || !audit?.id) throw new Error('전자검토 중인 감사보고서를 먼저 준비해 주세요.');
  const auditorId = Number($('auditChangeAuditor').value || 0);
  const method = $('auditChangeMethod').value;
  const requestedAtValue = $('auditChangeRequestedAt').value;
  const summary = $('auditChangeSummary').value.trim();
  if (!auditorId) throw new Error('수정을 요청한 감사를 선택해 주세요.');
  if (!requestedAtValue) throw new Error('수정 요청을 받은 일시를 입력해 주세요.');
  if (!summary) throw new Error('수정 요청 내용을 입력해 주세요.');
  const requestedAt = new Date(requestedAtValue);
  if (Number.isNaN(requestedAt.getTime())) throw new Error('수정 요청 일시를 확인해 주세요.');

  const createRevision = auditReportLocked(audit);
  if (createRevision && !(await window.CoopDialog.confirm('기존 전자서명본은 그대로 보존하고, 감사 전원이 다시 확인할 개정본을 만들까요?'))) return;
  if(!pdfActionStillCurrent(owner))return;
  const { data, error, previousInput } = await MeetingPackageService.recordAuditChangeRequest(owner.packageId, {
    source_report_id:audit.id,
    requested_auditor_official_id: auditorId,
    request_method: method,
    requested_at: requestedAt.toISOString(),
    request_summary: summary,
    create_revision: createRevision
  },()=>pdfActionStillCurrent(owner));
  if(!pdfActionStillCurrent(owner))return;
  if (error) throw error;
  await loadAssemblySources();
  if(!previousInput && data?.revision_minute_id===state.sourceContext?.audit_report?.id
    && state.auditDraftExpected?.id===audit.id && pdfActionStillCurrent(owner))state.auditDraftExpected=auditExpected(state.sourceContext.audit_report);
  if (data?.revision_minute_id) refreshAutoDrafts({ render: state.currentStep === 'documents' });
  if(!pdfActionStillCurrent(owner))return;
  if(!previousInput && $('auditChangeSummary').value.trim()===summary && $('auditChangeRequestedAt').value===requestedAtValue
    && Number($('auditChangeAuditor').value)===auditorId && $('auditChangeMethod').value===method){
    $('auditChangeSummary').value = '';
    $('auditChangeRequestedAt').value = toDateTimeLocalValue();
    $('auditChangeFormDetails').open = false;
  }
  $('auditChangeHistoryDetails').open = true;
  renderAuditStep();
  showToast(data?.revision_minute_id
    ? '수정 요청을 내부 이력에 저장하고 개정본을 만들었습니다. 내용을 고친 뒤 전자검토를 다시 요청해 주세요.'
    : '수정 요청을 내부 이력에 저장했습니다. 보고서 내용을 고친 뒤 전자검토를 다시 요청할 수 있습니다.', 5200);
}

async function saveAgendas({ quiet = false } = {}) {
  if (!state.current) return false;
  const agendas = collectAgendasFromDom();
  if (agendas.some(row => !row.title)) throw new Error('모든 안건의 제목을 입력하세요.');
  const { data, error } = await MeetingPackageService.saveAgendas(state.current.id, agendas);
  if (error) throw error;
  state.agendas = (data || []).map((a,i)=>({...a,assembly_decision_type:agendas[i]?.assembly_decision_type||''}));
  if (state.current.meeting_type === 'GENERAL_ASSEMBLY') {
    const bookletData = state.current.assembly_kind === 'EXTRAORDINARY' ? {...state.current.assembly_booklet_data} : collectAssemblyBookletData();
    bookletData.assembly_agenda_types=Object.fromEntries(state.agendas.filter(a=>a.id&&a.agenda_kind==='DECISION'&&Object.hasOwn(assemblyDecisionTypes,a.assembly_decision_type)).map(a=>[a.id,a.assembly_decision_type]));
    const update = await MeetingPackageService.updatePackage(state.current.id, { assembly_booklet_data: bookletData });
    if (update.error) throw update.error;
    state.current = update.data;
  }
  renderAgendaList();
  if (state.agendaLock?.board_plan_review) refreshSavedBoardPlan();
  if (!quiet) showToast(state.current.meeting_type === 'GENERAL_ASSEMBLY' && state.current.assembly_kind !== 'EXTRAORDINARY' ? '안건과 자료집 입력을 저장했습니다.' : '안건을 저장했습니다.');
  state.agendaDirty = false;
  syncSavedMeetingProgress({agendaReady:state.agendas.some(a=>!!a.title?.trim())});
  return true;
}

async function generateAllDocuments() {
  if (!state.current) return;
  if(MeetingPackageService.documentEdits.hasPending(pdfActionOwner()))throw new Error('먼저 전체 저장 버튼으로 이전 저장 결과를 확인해 주세요.');
  if (state.current.status === 'FINAL') throw new Error('의사록으로 확정된 회의의 준비문서는 다시 만들 수 없습니다.');
  if (state.documentDirty) rememberActiveDocument();
  if(isScenarioStage()){
    const route=guidedRoute(),latest=await window.ErpBoardFlow.read(supabase,state.runtime.coop_id,route);
    if(guidedRoute()?.href!==route.href||state.current?.id!==route.id)return;
    window.ErpBoardFlow.adopt(latest);
    if(!window.ErpBoardFlow.posted(latest))throw Error('소집 공문을 문서함에 게시한 뒤 시나리오를 만들 수 있어요.');
  }
  const hasManualDraft = [...state.documents.values()].some(doc => documentInStage(doc.document_type)&&doc.manually_edited&&doc.content_html);
  if (hasManualDraft && !(await window.CoopDialog.confirm('직접 고친 초안이 있습니다. 공통정보와 안건으로 다시 만들면 현재 문구가 바뀝니다. 계속할까요?'))) return;
  const owner=pdfActionOwner();
  if(isScenarioStage())await loadPreviousScenarioStyle(owner);
  if(!pdfActionStillCurrent(owner))return;
  const types=generatedDocumentRows().map(row=>row.type);
  await acquireDocumentSet(owner,types);
  if(!pdfActionStillCurrent(owner))return;
  if(state.infoDirty)await saveInfo({ quiet: true });
  if(!pdfActionStillCurrent(owner))return;
  if(state.agendaDirty)await saveAgendas({ quiet: true });
  if(!pdfActionStillCurrent(owner))return;
  const generatedAt = new Date().toISOString();
  const rows = generatedDocumentRows().map(row=> {
    const existing = state.documents.get(row.type);
    return {
      document_type:row.type,title: row.title,
      ...regeneratedDocumentPayload(row, existing),
      version: Number(existing?.version || 0) + 1,
      generated_at: generatedAt
    };
  });
  const {data,error}=await MeetingPackageService.saveDocuments(owner.packageId,rows,owner);
  if(error)throw error;
  if(!pdfActionStillCurrent(owner))return;
  for(const row of data||[]){state.documents.set(row.document_type,row);documentSavedRows.set(row.document_type,row);documentConflicts.delete(documentEditKey(row.document_type));}
  if(!documentInStage(state.activeDocument))state.activeDocument=isScenarioStage()?'SCENARIO':'MATERIALS';
  for(const row of data||[])state.pendingDocuments.delete(row.document_type);
  renderEditorHeader();
  renderActiveDocument();
  if(guidedRoute()?.kind!=='BOARD'){
    await loadPackages();
    renderPackages();
  }
  showToast(isScenarioStage()?'시나리오를 만들었습니다.':'회의자료를 만들었습니다. 확인한 뒤 자료 확정을 눌러 주세요.', 4200);
}

async function acquireDocumentSet(owner,types) {
  for(const type of types){
    if(!pdfActionStillCurrent(owner))throw new Error('현재 회의를 다시 확인해 주세요.');
    const result=await MeetingPackageService.documentEdits.manage(owner,type,'acquire');
    if(!pdfActionStillCurrent(owner))throw new Error('현재 회의를 다시 확인해 주세요.');
    documentEditStates.set(documentEditKey(type),result);
    if(!result.owned)throw new Error(`${result.holder_name||'다른 담당자'} 님이 ${DOC_LABEL[type]}을 편집 중입니다.`);
    if(documentValue(result.document)!==documentValue(documentSavedRows.get(type)))throw new Error(`${DOC_LABEL[type]}의 저장 내용이 바뀌었습니다. 해당 문서의 편집을 눌러 최신 내용과 초안을 확인해 주세요.`);
  }
}

async function saveWholeMeetingDraft({ quiet = false } = {}) {
  if (!state.current) return;
  if (state.current.status === 'FINAL') throw new Error('이미 의사록으로 확정된 회의입니다.');
  const owner=pdfActionOwner();
  if(state.documentDirty)rememberActiveDocument();
  if(MeetingPackageService.documentEdits.hasPending(owner)){
    const result=await MeetingPackageService.saveDocuments(owner.packageId,[],owner);
    if(result.error)throw result.error;
    if(!pdfActionStillCurrent(owner))return;
    if(state.documentDirty)rememberActiveDocument();
    applySavedDocuments(owner,result.data);
    if(!quiet)showToast('이전 저장 결과를 확인했습니다. 추가 수정은 다시 저장해 주세요.');
    return;
  }
  const dirtyTypes=[...state.pendingDocuments].filter(type=>documentValue(state.documents.get(type))!==documentValue(documentSavedRows.get(type)));
  for(const type of dirtyTypes){
    if(documentConflicts.has(documentEditKey(type)))throw new Error(`${DOC_LABEL[type]}의 최신 저장본과 작성한 초안을 먼저 확인해 주세요.`);
  }
  const rows = dirtyTypes.map(type => {
    const existing=state.documents.get(type);
    return {document_type:type,title:existing?.title||defaultDocumentTitle(type),content_html:existing?.content_html||'',
      version:Number(existing?.version||1),manually_edited:existing?.manually_edited===true,generated_at:existing?.generated_at||null};
  });
  const epoch=documentEditEpoch;
  await acquireDocumentSet(owner,dirtyTypes.filter(type=>!documentEditingAllowed(type)));
  if(!pdfActionStillCurrent(owner)||epoch!==documentEditEpoch)return;
  if(state.documentDirty)rememberActiveDocument();
  for(const type of [...state.pendingDocuments])if(!dirtyTypes.includes(type)&&documentValue(state.documents.get(type))===documentValue(documentSavedRows.get(type))){
    state.pendingDocuments.delete(type);if(type===state.activeDocument)state.documentDirty=false;
  }
  if(state.infoDirty)await saveInfo({ quiet: true });
  if(!pdfActionStillCurrent(owner)||epoch!==documentEditEpoch)return;
  if(state.agendaDirty)await saveAgendas({ quiet: true });
  if(!pdfActionStillCurrent(owner)||epoch!==documentEditEpoch)return;
  if(epoch!==documentEditEpoch)return;
  const { data, error } = await MeetingPackageService.saveDocuments(owner.packageId, rows, owner);
  if (error) throw error;
  if(!pdfActionStillCurrent(owner))return;
  if(state.documentDirty)rememberActiveDocument();
  applySavedDocuments(owner,data);
  if (!quiet) showToast('수정한 내용을 저장했습니다.');
}

async function completeMeetingMaterials() {
  if (!state.current||isScenarioStage()) return;
  const owner=pdfActionOwner();
  if(!$('meetingDate').value||!$('startTime').value||!$('meetingLocation').value.trim())throw new Error('회의 일시와 장소를 확인해 주세요.');
  if(state.current.meeting_type==='GENERAL_ASSEMBLY'&&!$('noticeDate').value)throw new Error('소집 공고일을 입력해 주세요.');
  if(state.documentDirty)rememberActiveDocument();
  const agendas=collectAgendasFromDom(),material=state.documents.get('MATERIALS');
  if(!material?.content_html?.trim())throw new Error('확정할 회의자료를 확인해 주세요.');
  const defaultPlan=agendas.length===0?savedRegularAssemblyPlan(state.current,material):null;
  if(agendas.some(agenda=>!agenda.title?.trim())||(!agendas.length&&!defaultPlan))throw new Error('안건 제목을 모두 입력해 주세요.');
  if(defaultPlan&&(!/data-assembly-plan="[0-9a-f]+"/.test(material.content_html)||material.content_html.includes('data-assembly-legacy="1"'))){
    // The old HTML body stays as stored. Add only the metadata the existing
    // linked-minutes reader needs, and only on the user's explicit confirmation.
    const content=withLegacyAssemblyPlan(material.content_html,defaultPlan);
    if(!content)throw Error('저장된 자료집에서 안건을 확인하지 못했어요. 회의자료를 다시 확인해 주세요.');
    state.documents.set('MATERIALS',{...material,content_html:content});
  }
  if(documentValue(state.documents.get('MATERIALS'))!==documentValue(documentSavedRows.get('MATERIALS')))state.pendingDocuments.add('MATERIALS');
  await saveWholeMeetingDraft({ quiet: true });
  if(!pdfActionStillCurrent(owner))return;
  if(hasUnsavedPacketChanges()||!documentSavedRows.get('MATERIALS')?.content_html?.trim())throw new Error('남아 있는 수정 내용을 저장하고 회의자료를 확인한 뒤 확정해 주세요.');
  const updated = await MeetingPackageService.updatePackage(state.current.id, { status: 'READY' });
  if (updated.error) throw updated.error;
  if(!pdfActionStillCurrent(owner)||updated.data?.id!==owner.packageId)return;
  state.current = updated.data;
  syncSavedMeetingProgress();
  renderEditorHeader();
  const index=state.packages.findIndex(row=>row.id===updated.data.id);
  if(index>=0)state.packages[index]=updated.data;
  renderPackages();
  window.ErpWorkspaceResume?.checkpoint($('editorBody'));
  showToast('회의자료를 확정했습니다.');
  openGuidedStage(updated.data.id,'approval',updated.data.meeting_type);
}

async function saveActiveDocument({ quiet = false } = {}) {
  if (!state.current) return;
  const owner=pdfActionOwner(),type=state.activeDocument;
  if(!documentEditingAllowed(type)&&!MeetingPackageService.documentEdits.hasPending(owner))throw new Error('문서의 편집권을 먼저 확인해 주세요.');
  rememberActiveDocument();
  const row = state.documents.get(type);
  if (!row?.content_html) throw new Error('저장할 문서 내용이 없습니다. 먼저 초안을 만들어 주세요.');
  const { data, documents, error } = await MeetingPackageService.saveDocument(owner.packageId, type, {
    title: row.title,
    content_html: row.content_html,
    version: Number(row.version || 1),
    manually_edited: true,
    generated_at: row.generated_at || null
  },owner);
  if (error) throw error;
  if(!pdfActionStillCurrent(owner))return;
  if(state.documentDirty)rememberActiveDocument();
  applySavedDocuments(owner,documents||[data]);
  if (!quiet && state.activeDocument===type) showToast(`${DOC_LABEL[type]}을 저장했습니다.`);
}

const BOOK_PRINT_CSS = `
  @page { size:A4; margin:18mm 18mm 20mm; }
  @page cover { size:A4; margin:0; counter-reset:folio 0; @bottom-center { content:none; } }
  @page inside-cover { size:A4; margin:0; @bottom-center { content:none; } }
  @page book-blank { size:A4; margin:0; @bottom-center { content:none; } }
  @page book { size:A4; margin:18mm 18mm 20mm; counter-increment:folio 1; @bottom-center { content:counter(folio); font-size:11pt; font-weight:700; color:#52635a; } }
  @page book:left { margin-left:18mm; margin-right:22mm; }
  @page book:right { margin-left:22mm; margin-right:18mm; }
  @page back-cover { size:A4; margin:0; @bottom-center { content:none; } }
  @page :blank { @bottom-center { content:none; } }
  :root{--booklet-body-primary:#1b4d3e;--booklet-body-accent:#6b7c73;--booklet-body-tint:#f4f7f5;--booklet-body-line:#b8c7bf;--booklet-body-muted:#52635a}
  .chapter-cover,.chapter-order,.chapter-back{--booklet-cover-primary:#1b4d3e;--booklet-cover-accent:#6b7c73;--booklet-cover-tint:#f4f7f5;--booklet-cover-line:#b8c7bf;--booklet-cover-muted:#52635a}
  *{box-sizing:border-box}
  html,body{margin:0;color:#111827;background:#fff;font-family:"Pretendard","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;font-size:11pt;line-height:1.62;word-break:keep-all;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:21pt;line-height:1.3;margin:0 0 16pt;padding-bottom:9pt;border-bottom:2pt solid var(--booklet-body-primary);color:var(--booklet-body-primary);letter-spacing:-.025em}
  h2{font-size:14.5pt;line-height:1.4;margin:17pt 0 8pt;color:var(--booklet-body-primary);break-after:avoid;page-break-after:avoid}
  h3{font-size:12pt;margin:12pt 0 6pt;color:#1f2937;break-after:avoid;page-break-after:avoid}
  h4,p,li,td,th,div,span,small{font-size:11pt}p,li,td,dd{word-break:keep-all;overflow-wrap:break-word}
  p,li{orphans:3;widows:3}
  table{width:100%;border-collapse:collapse;margin:10pt 0;border-top:1.5pt solid var(--booklet-body-primary);border-bottom:1.5pt solid var(--booklet-body-primary);break-inside:auto}
  tr{break-inside:avoid;break-after:auto}
  th,td{border:0;border-bottom:.75pt solid var(--booklet-body-line);border-right:.75pt solid var(--booklet-body-line);padding:7pt 8pt;vertical-align:top}
  th:last-child,td:last-child{border-right:0}
  tbody tr:last-child>th,tbody tr:last-child>td{border-bottom:0}
  th{background:var(--booklet-body-tint);color:var(--booklet-body-primary);font-weight:800}
  thead th{border-bottom:1pt solid var(--booklet-body-primary)}
  thead{display:table-header-group}tfoot{display:table-footer-group}
  .amount,.rpt-amt{text-align:right;font-variant-numeric:tabular-nums}
  .speaker{border-left:2.5pt solid var(--booklet-body-primary);padding:6pt 9pt;margin:7pt 0;background:var(--booklet-body-tint)}
  .board-scenario h2{break-after:avoid;page-break-after:avoid}
  .board-scenario p.speaker,.board-scenario p.action{break-inside:avoid;page-break-inside:avoid}
  .action{background:var(--booklet-body-tint);color:var(--booklet-body-primary);border:.75pt solid var(--booklet-body-line);padding:6pt 8pt}
  .source-caption{margin:-6pt 0 16pt;padding:8pt 10pt;border-left:3pt solid var(--booklet-body-primary);background:var(--booklet-body-tint);color:var(--booklet-body-muted)}
  .source-agenda-row{display:grid;grid-template-columns:95pt 1fr;gap:3pt 9pt;padding:5pt 0;border-bottom:.5pt solid var(--booklet-body-line)}
  .source-agenda-row small{grid-column:2}
  .board-one-paper h1{text-align:center;font-size:19pt}.board-one-paper h2{font-size:13pt;margin:10pt 0 4pt}.board-one-paper .source-agenda-row{padding:3pt 0}
  .board-memo-space{margin-top:7pt;break-inside:avoid}.board-memo-line{height:8mm;border-bottom:.75pt solid var(--booklet-body-line)}
  .board-text-annex{break-before:page;page-break-before:always;color:#111827;line-height:1.75}
  .board-annex-heading{margin:0 0 16pt;padding:11pt 13pt;border-top:2.5pt solid var(--booklet-body-primary);border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);break-inside:avoid}
  .board-annex-heading span{display:block;margin:0 0 4pt;color:var(--booklet-body-primary);font-weight:800}
  .board-annex-heading h1{margin:0;padding:0;border:0;font-size:18.5pt;color:#111827}
  .board-annex-body h2{margin:18pt 0 8pt;padding:0 0 5pt;border-bottom:1pt solid var(--booklet-body-line);color:var(--booklet-body-primary);font-size:14.5pt;break-after:avoid}
  .board-annex-body h3{margin:14pt 0 5pt;color:#111827;font-size:12pt;break-after:avoid}
  .board-annex-body p{margin:5pt 0;font-size:11pt;line-height:1.75;orphans:3;widows:3}
  .meeting-org-info{margin:14pt 0 0;padding:9pt 11pt;border:1pt solid var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);text-align:left;break-inside:avoid}
  .meeting-org-info>div{display:grid;grid-template-columns:58pt minmax(0,1fr);gap:5pt 8pt;padding:2pt 0}
  .meeting-org-info dt,.meeting-org-info dd{font-size:11pt}.meeting-org-info dt{color:var(--booklet-body-primary);font-weight:800}.meeting-org-info dd{margin:0;overflow-wrap:anywhere}
  .assembly-back .meeting-org-info{width:155mm;margin:16pt auto 0;border-color:var(--booklet-cover-line);background:var(--booklet-cover-tint)}
  .assembly-back .meeting-org-info dt{color:var(--booklet-cover-primary)}
  .meeting-chapter{page:book;min-height:0;break-after:page;position:relative}
  .meeting-chapter:last-child{break-after:auto}
  .chapter-pdf-attachment{height:256mm;display:flex;align-items:center;justify-content:center;overflow:hidden}
  .pdf-attachment-page-image{display:block;max-width:100%;max-height:252mm;width:auto;height:auto;object-fit:contain}
  .chapter-cover{page:cover;width:210mm;height:296.5mm;padding:20mm 18mm;overflow:hidden;break-after:page}
  .chapter-inside-cover{page:inside-cover;width:210mm;height:296.5mm;overflow:hidden;break-after:page}
  .chapter-book-blank{page:book-blank;width:210mm;height:296.5mm;overflow:hidden;break-after:page}
  .chapter-back{page:back-cover;width:210mm;height:296.5mm;padding:20mm 18mm;overflow:hidden;break-after:auto}
  .assembly-cover{height:100%;padding:16mm 15mm;border:1pt solid var(--booklet-cover-accent);display:grid;grid-template-rows:auto 1fr auto auto;align-items:start}
  .assembly-cover .org-name{margin:0;padding-bottom:11pt;border-bottom:2pt solid var(--booklet-cover-primary);color:var(--booklet-cover-primary);font-size:14pt;font-weight:800;letter-spacing:.02em}
  .assembly-cover>p:nth-of-type(2){align-self:end;margin:0 0 8pt;color:var(--booklet-cover-muted);font-size:13pt;font-weight:700;letter-spacing:.04em}
  .assembly-cover h1{font-size:34pt;line-height:1.22;margin:0;padding-bottom:16pt;border-bottom:2pt solid var(--booklet-cover-accent);color:var(--booklet-cover-primary);font-weight:800}
  .assembly-cover dl{margin:64pt 0 0;padding:13pt 15pt;background:var(--booklet-cover-tint);border:1pt solid var(--booklet-cover-line);border-left:3pt solid var(--booklet-cover-primary);display:grid;grid-template-columns:52pt 1fr;gap:7pt 12pt}
  .assembly-cover dt{color:var(--booklet-cover-primary);font-weight:800}.assembly-cover dd{margin:0;font-weight:700;color:#111827}
  .chapter-order>h1{color:var(--booklet-cover-primary);border-bottom:2pt solid var(--booklet-cover-primary)}
  .chapter-order>h2{color:var(--booklet-cover-primary);font-size:13.5pt;margin:16pt 0 6pt;padding-left:8pt;border-left:2.5pt solid var(--booklet-cover-primary)}
  .chapter-order .chapter-subtitle{margin:-8pt 0 14pt;color:var(--booklet-cover-muted);font-weight:700}
  .chapter-order .bill-list{list-style:none;padding:0;margin:8pt 0 14pt;border-top:1pt solid var(--booklet-cover-primary);border-bottom:1pt solid var(--booklet-cover-primary)}
  .chapter-order .bill-list li{display:flex;align-items:baseline;gap:10pt;padding:6.5pt 4pt;border-bottom:.75pt dotted var(--booklet-cover-line)}
  .chapter-order .bill-list li:last-child{border-bottom:0}
  .chapter-order .bill-list li strong{flex:0 0 auto;min-width:52pt;padding:1.5pt 6pt;text-align:center;background:var(--booklet-cover-tint);border:.75pt solid var(--booklet-cover-line);border-radius:2pt;color:var(--booklet-cover-primary);font-weight:800}
  .assembly-inside-cover{width:100%;height:100%;background:#fff}
  .assembly-book-blank{width:100%;height:100%;background:#fff}
  .assembly-back{height:100%;padding:16mm 15mm;border:1pt solid var(--booklet-cover-accent);display:flex;flex-direction:column;justify-content:center;text-align:center}
  .assembly-back h1{font-size:30pt;line-height:1.35;border:0;color:var(--booklet-cover-primary)}.assembly-back hr{width:42mm;border:0;border-top:2.5pt solid var(--booklet-cover-primary);margin:22pt auto}
  .assembly-back h2{color:var(--booklet-cover-primary);margin:0 0 6pt}
  .chapter-bill>h1{color:var(--booklet-body-primary);font-size:16pt;border-bottom:1.5pt solid var(--booklet-body-primary)}.chapter-bill>h2{font-size:21pt;color:#111827;margin-top:6pt}
  .bill-content-card{margin:14pt 0;overflow:hidden;border:1pt solid var(--booklet-body-line);border-radius:4pt;background:#fff;break-inside:avoid}
  .bill-content-card>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:8pt 11pt;border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .bill-content-card>h3>span{width:20pt;height:20pt;display:inline-grid;place-items:center;border-radius:3pt;background:var(--booklet-body-primary);color:#fff;font-weight:800}
  .bill-content-body{padding:11pt 13pt}.bill-content-body>:first-child{margin-top:0}.bill-content-body>:last-child{margin-bottom:0}
  .bill-major-content{display:grid;grid-template-columns:88pt 1fr;border-top:1.2pt solid var(--booklet-body-primary);border-bottom:1.2pt solid var(--booklet-body-primary);margin:0}.bill-major-content dt,.bill-major-content dd{margin:0;padding:8.5pt 10pt;border-bottom:.75pt solid var(--booklet-body-line)}.bill-major-content dt{font-weight:800;color:var(--booklet-body-primary);background:var(--booklet-body-tint);border-right:.75pt solid var(--booklet-body-line)}.bill-major-content dd{background:#fff}.bill-major-content dt:last-of-type,.bill-major-content dd:last-of-type{border-bottom:0}
  .business-report-overview{margin:0 0 14pt;padding:12pt 14pt;border:1pt solid var(--booklet-body-line);border-left:3.5pt solid var(--booklet-body-primary);border-radius:3pt;background:var(--booklet-body-tint);break-inside:avoid}.business-report-overview>span{display:inline-block;margin-bottom:4pt;color:var(--booklet-body-primary);font-weight:800}.business-report-overview .chapter-lead{margin:0;font-weight:700;line-height:1.68}
  .business-report-list{list-style:none;padding:0;margin:0;counter-reset:business-item;display:grid;gap:7pt}.business-report-list li{counter-increment:business-item;position:relative;margin:0;padding:9pt 11pt 9pt 38pt;border:.75pt solid var(--booklet-body-line);border-radius:3pt;background:#fff;break-inside:avoid}.business-report-list li::before{content:counter(business-item);position:absolute;left:10pt;top:8pt;width:21pt;height:21pt;display:grid;place-items:center;border-radius:3pt;background:var(--booklet-body-tint);border:.75pt solid var(--booklet-body-line);color:var(--booklet-body-primary);font-weight:800}
  .budget-balance{padding:8pt 10pt;border-radius:4pt;font-weight:800}.budget-balance.is-unbalanced{background:#fef2f2;color:#b91c1c;border:1pt solid #fecaca}
  .chapter-financial>h1,.chapter-minutes>h1,.chapter-audit>h1{border-bottom-color:var(--booklet-body-primary)}
  .audit-report-document,.business-plan-document{color:#111827}
  .audit-document-heading,.business-plan-heading{text-align:center;margin-bottom:16pt;padding:15pt 14pt 13pt;border-top:2.5pt solid var(--booklet-body-primary);border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);break-inside:avoid}
  .audit-document-heading>span,.business-plan-heading>span{display:inline-block;padding:3pt 9pt;border:1pt solid var(--booklet-body-line);border-radius:2pt;background:#fff;color:var(--booklet-body-primary);font-weight:800}
  .audit-document-heading h1,.business-plan-heading h1{margin:7pt 0 3pt;padding:0;border:0;font-size:21pt;line-height:1.28;letter-spacing:-.02em;color:var(--booklet-body-primary)}
  .audit-document-heading h1{letter-spacing:.18em}
  .audit-document-heading p,.business-plan-heading p{margin:0;color:var(--booklet-body-muted);font-weight:700}
  .audit-meta-table{margin:0 0 13pt}
  .audit-meta-table th,.audit-meta-table td{padding:7.5pt 9pt}.audit-meta-table th{width:86pt;text-align:left;background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .audit-purpose{margin:0 0 15pt;padding:9pt 11pt;border:1pt solid var(--booklet-body-line);border-left:3.5pt solid var(--booklet-body-primary);border-radius:3pt;background:var(--booklet-body-tint)}
  .audit-section-title,.business-plan-section>h2{display:flex;align-items:center;gap:8pt;margin:18pt 0 8pt;padding:0 0 6pt;border-bottom:1.5pt solid var(--booklet-body-primary);color:var(--booklet-body-primary);break-after:avoid}
  .audit-section-title>span,.business-plan-section>h2>span{width:23pt;height:23pt;display:inline-grid;place-items:center;border-radius:3pt;background:var(--booklet-body-primary);color:#fff;font-weight:800}
  .audit-result-block{margin:9pt 0;padding:0;overflow:hidden;border:1pt solid var(--booklet-body-line);border-radius:4pt;background:#fff;break-inside:avoid}
  .audit-result-block>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:8pt 10pt;border-bottom:.75pt solid var(--booklet-body-line);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .audit-result-block>h3>span{width:20pt;height:20pt;display:inline-grid;place-items:center;border-radius:3pt;background:#fff;border:.75pt solid var(--booklet-body-line);color:var(--booklet-body-primary);font-weight:800}
  .audit-result-block>ul{margin:9pt 13pt;padding-left:18pt}
  .audit-writing-box{margin:9pt 12pt 11pt;padding:8.5pt 11pt;border:1pt solid var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);break-inside:avoid}
  .audit-writing-box>strong{display:block;margin-bottom:4pt;color:var(--booklet-body-primary)}
  .audit-writing-box p{min-height:18pt;margin:0;white-space:pre-wrap}
  .audit-writing-box-required{border-width:1.5pt;border-color:var(--booklet-body-primary);background:var(--booklet-body-tint)}
  .audit-overall-opinion{font-weight:700}
  .audit-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7pt;margin:9pt 0}
  .audit-summary-grid>div{position:relative;overflow:hidden;padding:8.5pt 10pt 8.5pt 13pt;border:1pt solid var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);break-inside:avoid}
  .audit-summary-grid>div:before{content:"";position:absolute;inset:0 auto 0 0;width:3pt;background:var(--booklet-body-primary)}
  .audit-summary-grid span{display:block;color:var(--booklet-body-muted)}.audit-summary-grid strong{display:block;margin-top:3pt;font-variant-numeric:tabular-nums}
  .audit-signature-panel{margin-top:18pt;padding:12pt 14pt;border-top:1.5pt solid var(--booklet-body-primary);background:var(--booklet-body-tint);break-inside:avoid}.audit-signature-date{margin:0 0 9pt;text-align:center;font-weight:800}.audit-signers{width:260pt;margin-left:auto;text-align:right;break-inside:avoid}.audit-signers>strong{display:block;margin-bottom:6pt;color:var(--booklet-body-primary)}
  .business-plan-section{margin:0 0 16pt}.business-plan-goal blockquote{margin:0;padding:12pt 14pt;border:1pt solid var(--booklet-body-line);border-left:3.5pt solid var(--booklet-body-primary);border-radius:3pt;background:var(--booklet-body-tint);color:var(--booklet-body-primary);line-height:1.68;break-inside:avoid}
  .business-plan-list{list-style:none;margin:0;padding:0;counter-reset:plan-item;display:grid;gap:7pt}.business-plan-list li{counter-increment:plan-item;position:relative;padding:9pt 11pt 9pt 38pt;border:.75pt solid var(--booklet-body-line);border-radius:3pt;background:#fff;break-inside:avoid}.business-plan-list li:before{content:counter(plan-item);position:absolute;left:10pt;top:8pt;width:21pt;height:21pt;display:grid;place-items:center;border-radius:3pt;background:var(--booklet-body-tint);border:.75pt solid var(--booklet-body-line);color:var(--booklet-body-primary);font-weight:800}
  .business-plan-empty{padding:10pt 12pt;border:1pt dashed var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);color:var(--booklet-body-muted)}
  .budget-panel{margin:10pt 0;overflow:hidden;border:1pt solid var(--booklet-body-line);border-radius:4pt;background:#fff;break-inside:avoid}.budget-panel>h3{display:flex;align-items:center;gap:7pt;margin:0;padding:8pt 10pt;border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}.budget-panel>h3>span{width:20pt;height:20pt;display:inline-grid;place-items:center;border-radius:3pt;background:var(--booklet-body-primary);color:#fff;font-weight:800}
  .budget-data-table{margin:0;border-top:0;border-bottom:0}.budget-data-table th,.budget-data-table td{padding:6.5pt 8pt}.budget-data-table thead th{background:#f8faf9;color:#1f2937;border-bottom:1pt solid var(--booklet-body-primary)}.budget-data-table tfoot th{border-top:1.5pt solid var(--booklet-body-primary);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .business-plan-note{margin:11pt 0 0;padding:8.5pt 11pt;border:1pt solid var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);color:var(--booklet-body-muted);break-inside:avoid}
  .financial-statement-page{color:#111827}
  .financial-statement-heading{text-align:center;margin-bottom:16pt;padding:15pt 14pt 13pt;border-top:2.5pt solid var(--booklet-body-primary);border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);break-inside:avoid}
  .financial-statement-heading>span{display:inline-block;padding:3pt 9pt;border:1pt solid var(--booklet-body-line);border-radius:2pt;background:#fff;color:var(--booklet-body-primary);font-weight:800}
  .financial-statement-heading h1{margin:8pt 0 3pt;padding:0;border:0;font-size:20pt;line-height:1.28;letter-spacing:-.025em;color:var(--booklet-body-primary);word-break:keep-all}
  .financial-statement-heading p{margin:0;font-weight:700;color:var(--booklet-body-muted)}
  .financial-statement-heading small{display:block;margin-top:6pt;text-align:right;color:var(--booklet-body-muted)}
  .financial-statement-section{margin:0 0 15pt;break-inside:avoid}.financial-statement-card{overflow:hidden;border:1pt solid var(--booklet-body-line);border-radius:4pt;background:#fff}
  .financial-balance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10pt;align-items:start}
  .financial-balance-grid .financial-statement-section{margin-bottom:10pt}
  .financial-balance-grid th,.financial-balance-grid td{padding:6pt}
  .financial-statement-section h2{display:flex;align-items:center;gap:8pt;margin:0;padding:7.5pt 10pt;border-left:3.5pt solid var(--booklet-body-primary);border-bottom:1pt solid var(--booklet-body-line);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .financial-statement-section table{margin:0;border-top:0;border-bottom:0}.financial-data-table thead th{background:#f8faf9;color:#1f2937}.financial-data-table th,.financial-data-table td{padding:6.5pt 8pt}
  .financial-statement-section tfoot th{border-top:1.5pt solid var(--booklet-body-primary);background:var(--booklet-body-tint);color:var(--booklet-body-primary)}
  .financial-result{margin-top:18pt;padding-top:10pt;border-top:1.5pt solid var(--booklet-body-primary)}
  .linked-minute img{max-width:100%;height:auto}
  .book-signature-section{margin-top:20pt;padding-top:13pt;border-top:1.5pt solid var(--booklet-body-primary);break-inside:avoid}
  .book-signature-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9pt}
  .book-signature-card{display:flex;align-items:center;gap:10pt;padding:9pt 10pt;border:1pt solid var(--booklet-body-line);border-radius:3pt;background:var(--booklet-body-tint);break-inside:avoid}
  .book-signature-card small{display:block;margin-top:3pt;color:var(--booklet-body-muted)}
  .book-signature-preview{flex:0 0 96px;width:96px;min-height:48px;display:grid;place-items:center;color:var(--booklet-body-muted);border:1pt dashed var(--booklet-body-line);background:#fff}
  .book-signature-preview img{width:96px;height:48px;object-fit:contain}.book-signature-preview.is-loaded>span{display:none}
  .book-source-required{padding:16pt;border:1.5pt solid var(--booklet-body-primary);border-radius:4pt;background:var(--booklet-body-tint)}.book-source-required strong{font-size:13.5pt;color:var(--booklet-body-primary)}
  .closing-report-snapshot .rpt-title{text-align:center;font-size:20pt;font-weight:900;margin:12pt 0 18pt;text-decoration:underline}
  .closing-report-snapshot .rpt-header-tbl,.closing-report-snapshot .rpt-tbl{width:100%;border-collapse:collapse;border:1.5pt solid #475569;margin-bottom:15pt}
  .closing-report-snapshot .rpt-header-tbl th,.closing-report-snapshot .rpt-header-tbl td,.closing-report-snapshot .rpt-tbl th,.closing-report-snapshot .rpt-tbl td{font-size:11pt!important;padding:7pt;border:1px solid #94a3b8}
  .closing-report-snapshot .rpt-sec{font-size:15pt!important;font-weight:900;margin:12pt 0 8pt;padding-bottom:5pt;border-bottom:1.5pt solid var(--booklet-body-primary);color:var(--booklet-body-primary)}
  .closing-report-snapshot .small,.closing-report-snapshot .text-small{font-size:11pt!important}
  .closing-report-snapshot .d-flex{display:flex}.closing-report-snapshot .justify-content-between{justify-content:space-between}.closing-report-snapshot .text-end{text-align:right}.closing-report-snapshot .text-center{text-align:center}.closing-report-snapshot .text-muted{color:#64748b}.closing-report-snapshot .text-primary{color:#1d4ed8}.closing-report-snapshot .text-danger{color:#b91c1c}.closing-report-snapshot .fw-bold{font-weight:800}.closing-report-snapshot .border-top{border-top:1pt solid #94a3b8}.closing-report-snapshot .mt-2{margin-top:7pt}.closing-report-snapshot .mt-3,.closing-report-snapshot .mt-4{margin-top:12pt}.closing-report-snapshot .mb-1{margin-bottom:4pt}.closing-report-snapshot .pt-2{padding-top:7pt}.closing-report-snapshot .p-2{padding:7pt}.closing-report-snapshot .bg-light{background:#f8fafc}.closing-report-snapshot .alert{padding:9pt 11pt;border:1pt solid var(--booklet-body-line);border-radius:4pt;background:var(--booklet-body-tint)}.closing-report-snapshot .alert-info{border-color:#93c5fd;background:#eff6ff}.closing-report-snapshot .alert-warning{border-color:#fbbf24;background:#fffbeb}
  a{color:#111827;text-decoration:none}
  @media print{button,.no-print{display:none!important}}
`;

function printLoadScript() {
  return `<script>(()=>{let ran=false;const run=()=>{if(ran)return;ran=true;const waits=[...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true})}));if(document.fonts?.ready)waits.push(document.fonts.ready.catch(()=>{}));Promise.all(waits).then(()=>{try{const cover=document.querySelector('.chapter-cover'),back=document.querySelector('.chapter-back');if(cover&&back){document.querySelectorAll('.chapter-rear-blank[data-parity-blank="true"]').forEach(n=>n.remove());const ruler=document.createElement('div');ruler.style.cssText='position:absolute;visibility:hidden;width:170mm;height:259mm;pointer-events:none;';document.body.appendChild(ruler);const rect=ruler.getBoundingClientRect(),pageW=rect.width,pageH=rect.height;ruler.remove();if(pageW>0&&pageH>0){const probe=document.createElement('div');probe.style.cssText='position:absolute;left:-99999px;top:0;width:'+pageW+'px;height:'+pageH+'px;column-width:'+pageW+'px;column-gap:0;column-fill:auto;visibility:hidden;pointer-events:none;';document.body.appendChild(probe);let total=0;for(const ch of document.querySelectorAll('.meeting-chapter')){if(ch.classList.contains('chapter-cover')||ch.classList.contains('chapter-inside-cover')||ch.classList.contains('chapter-book-blank')||ch.classList.contains('chapter-back')||ch.classList.contains('chapter-pdf-attachment')){total+=1;continue;}const clone=ch.cloneNode(true);clone.style.minHeight='0';clone.style.height='auto';clone.style.breakAfter='auto';probe.replaceChildren(clone);total+=Math.max(1,Math.round(probe.scrollWidth/pageW));}probe.remove();if(total%2===1){const blank=document.createElement('section');blank.className='meeting-chapter chapter-book-blank chapter-rear-blank';blank.dataset.chapterId='rear-blank-3';blank.dataset.chapterTitle='뒷표지 앞 여백 3';blank.dataset.parityBlank='true';blank.innerHTML='<div class="assembly-book-blank" aria-label="뒷표지 앞 여백 3"></div>';back.insertAdjacentElement('beforebegin',blank);}}}}catch(_){}setTimeout(()=>window.print(),300);});};if(document.readyState==='complete')run();else window.addEventListener('load',run,{once:true});})();<\/script>`;
}

async function printActiveDocument() {
  rememberActiveDocument();
  const type=state.activeDocument;
  let row = state.documents.get(type);
  if (!row?.content_html) return showToast('먼저 초안을 만들어 주세요.');
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  const owner = pdfActionOwner();
  let printableHtml;
  try {
    if(isScenarioStage()&&guidedRoute()?.kind==='BOARD'&&!documentSavedRows.has(type)&&!row.manually_edited){
      await loadPreviousScenarioStyle(owner);
      if(popup.closed||!pdfActionStillCurrent(owner)||state.activeDocument!==type){popup.close();return;}
      refreshAutoDrafts({render:false});row=state.documents.get(type)||row;
    }
    printableHtml = await preparePrintableHtml(row.content_html);
  }
  catch (error) { popup.close(); throw error; }
  if (popup.closed || !pdfActionStillCurrent(owner)) { popup.close(); return; }
  const title = escapeHtml(row.title || defaultDocumentTitle(type));
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>${BOOK_PRINT_CSS}</style></head><body>${printableHtml}${printLoadScript()}</body></html>`);
  popup.document.close();
}

async function printCurrentChapter() {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const chapter = state.chapters[activeChapterIndex()];
  const popup = window.open('', '_blank');
  if (!popup) return showToast('팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.');
  popup.opener = null;
  const chapterAttachments = state.pdfAttachments.filter(row => row.insert_after_chapter_id === chapter.id);
  const owner = pdfActionOwner();
  let printableHtml;
  try { printableHtml = await preparePrintableHtml(`<section class="${escapeHtml(chapter.className || 'meeting-chapter')}" data-chapter-id="${escapeHtml(chapter.id)}">${chapter.html}</section>`, chapterAttachments); }
  catch (error) { popup.close(); throw error; }
  if (popup.closed || !pdfActionStillCurrent(owner)) { popup.close(); return; }
  popup.document.open();
  popup.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(chapter.title)}</title><style>${BOOK_PRINT_CSS}</style></head><body>${printableHtml}${printLoadScript()}</body></html>`);
  popup.document.close();
}

async function openPackage(id, { internal = false, section = 'full' } = {}) {
  if(meetingDetailRead){
    if(meetingDetailRead.id===id&&meetingDetailRead.owner===meetingDetailOwner())return meetingDetailRead.promise;
    if(!internal)return;
    invalidateMeetingDetailRead();await meetingDetailRead?.promise;
  }
  if (state.loading && !internal) return;
  const openingOwner=meetingDetailOwner(),openingRevision=meetingDetailRevision;
  rememberBoardAnnexDraft();
  if (hasUnsavedPacketChanges({includeAnnex:false}) && !(await window.CoopDialog.confirm('저장하지 않은 회의 입력·문서 수정이 있습니다. 저장하지 않고 다른 회의를 열까요?'))) return;
  if(openingOwner!==meetingDetailOwner()||openingRevision!==meetingDetailRevision||window.frameElement?.hidden)return;
  window.clearTimeout(state.autoDraftTimer);
  cancelSectionRead();setSectionStatus();
  meetingNotHeld.invalidate();
  const request={id,owner:openingOwner,revision:++meetingDetailRevision,promise:null,cancel:null};
  const cancelled=Symbol('cancelled'),stop=new Promise(resolve=>{request.cancel=()=>resolve(cancelled);});
  const current=()=>meetingDetailRead===request&&request.revision===meetingDetailRevision
    &&request.owner===meetingDetailOwner()&&!window.frameElement?.hidden&&!document.hidden;
  meetingDetailRead=request;
  setMeetingDetailStatus('회의를 불러오고 있어요…');
  setBusy(true);
  request.promise=(async()=>{
  try {
    const result=await Promise.race([boundedMeetingRead(async()=>{
      const [{data,error}]=await Promise.all([MeetingPackageService.getPackage(id,{section}),ensureMeetingDefaults()]);
      if(!current())return null;
      if(error)throw error;
      if(!data?.package)throw new Error('회의 준비 자료를 찾을 수 없습니다.');
      // Prepare all read-only sources before replacing the last confirmed editor.
      let sourceContext=null,auditChangeRequests=[];
      if(data.package.meeting_type==='GENERAL_ASSEMBLY'&&data.package.assembly_kind!=='EXTRAORDINARY'){
        const [source,changes]=await Promise.all([getAssemblyContext(id),MeetingPackageService.listAuditChangeRequests(id)]);
        if(source.error||changes.error)throw source.error||changes.error;
        sourceContext=source.data||null;auditChangeRequests=changes.data||[];
      }
      return {data,sourceContext,auditChangeRequests};
    }),stop]);
    if(result===cancelled||!current())return;
    const {data,sourceContext,auditChangeRequests}=result;
    restoreNotHeldControls();
    state.current = data.package;
    documentEditEpoch++;
    documentSavedRows.clear();
    state.agendaLock = data.agendaLock;
    state.notHeld = null;
    state.pdfAttachments = [];
    agendasLoaded=section!=='prepare';
    state.agendas = agendaTypes(data.agendas,data.package.assembly_booklet_data);
    $('assemblyAuditSentOn').value='';$('assemblyPastChoices').hidden=true;$('assemblyBaseChoices').hidden=true;
    state.documents = new Map();documentsSection='';state.inheritedChairStyle=null;
    if(['materials','scenario','full'].includes(section))acceptDocumentSections(data,section);
    state.sourceContext = sourceContext;
    state.auditChangeRequests = auditChangeRequests;
    state.activeDocument = 'MATERIALS';
    resetPacketDirty();
    state.auditDraftDirty = false;
    $('editorPanel').hidden = false;
    $('editorBody').hidden = false;
    renderEditorHeader();
    fillInfoForm();
    renderAgendaList();
    if(documentsSection&&!isScenarioStage()&&(guidedRoute()?.kind!=='BOARD'||!['prepare','agenda','materials'].includes(guidedStage()))){
      refreshAutoDrafts({render:false});
      renderActiveDocument();
      void refreshDocumentEditState();
    }
    renderAuditStep();
    renderPackages();
    renderNotHeldState();
    if (isPastPackage(state.current)) $('pastMeetings').open = true;
    showRequestedAssemblyBooklet();
    setMeetingDetailStatus();
  } catch(error) {
    if(current())setMeetingDetailStatus(error?.code==='MEETING_READ_TIMEOUT'
      ?'조회 시간이 길어지고 있어요. 다시 확인해 주세요.'
      :'회의를 불러오지 못했어요. 다시 확인해 주세요.',{id,section,owner:request.owner,revision:request.revision});
  } finally {
    if(meetingDetailRead===request){
      meetingDetailRead=null;setBusy(false);
      $('retryMeetingDetail').disabled=!meetingDetailRetry||!meetingEntryReady;
    }
  }
  })();
  return request.promise;
}

async function createPackage() {
  rememberNewPackageDraft();
  const draftOwner = newPackageOwnerKey(), draftKey = newPackageDraftKey, draftValues = newPackageValues();
  const title = $('newMeetingTitle').value.trim();
  if (!title) throw new Error('회의 제목을 입력하세요.');
  const type = $('newMeetingType').value;
  const number = $('newMeetingNumber').value.trim(), assemblyKind = $('newAssemblyKind').value;
  const creationIdentity=pdfIdentityRevision, dialogRevision=newPackageDialogRevision;
  const creationCurrent=()=>draftOwner===newPackageOwnerKey() && creationIdentity===pdfIdentityRevision
    && dialogRevision===newPackageDialogRevision && $('newPackageModal').classList.contains('show') && !window.frameElement?.hidden;
  const candidates = currentTypeOfficials(type);
  const chair = chairCandidates().find(row => officialRole(row) === '이사장') || null;
  const { data, error } = await MeetingPackageService.createPackage({
    meeting_type: type,
    assembly_kind: type === 'GENERAL_ASSEMBLY' ? assemblyKind : null,
    title,
    meeting_number: number || null,
    fiscal_year: type === 'GENERAL_ASSEMBLY' && assemblyKind !== 'EXTRAORDINARY' ? new Date().getFullYear() - 1 : null,
    eligible_count: candidates.length,
    chair_official_id: chair?.id || null
  },creationCurrent);
  if(!creationCurrent())return;
  if (error) throw error;
  // Checkpoint the confirmed creation before navigation, not before a second write.
  if (newPackageDrafts.get(draftKey)?.values === draftValues) newPackageDrafts.delete(draftKey);
  if (draftKey === newPackageDraftKey && draftValues === newPackageValues()) {
    newPackageDraftBaseline = draftValues;
    closeNewPackage(); newPackageDraftKey = ''; newPackageDraftBaseline = '';
    $('newMeetingTitle').value = ''; $('newMeetingNumber').value = '';
    window.ErpWorkspaceResume?.checkpoint($('newPackageModal'));
  } else rememberNewPackageDraft();
  await MeetingPackageService.acknowledgePackageCreation({meeting_type:type,assembly_kind:type==='GENERAL_ASSEMBLY'?assemblyKind:null},data.id);
  if (draftOwner !== newPackageOwnerKey()) return;
  state.packages=[data,...state.packages.filter(row=>row.id!==data.id)];
  renderPackages();
  showToast('새 회의 준비 공간을 만들었습니다.');
  openGuidedStage(data.id,'prepare',type);
}

let previousStyleChecked='';
async function loadPreviousScenarioStyle(owner) {
  if(state.current?.meeting_type!=='BOARD'||state.inheritedChairStyle||documentSavedRows.has('SCENARIO'))return;
  const key=JSON.stringify([owner.userId,owner.coopId,owner.packageId,owner.identity,documentEditEpoch]);
  if(previousStyleChecked===key)return;
  const list=await MeetingPackageService.listPackages();
  if(list.error||!pdfActionStillCurrent(owner)||!isScenarioStage())return;
  const previous=(list.data||[]).filter(row=>row.id!==owner.packageId&&row.meeting_type==='BOARD'&&isPastPackage(row))
    .sort((a,b)=>String(b.meeting_date).localeCompare(String(a.meeting_date))||String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
  for(const row of previous){
    const result=await MeetingPackageService.getPackage(row.id,{section:'scenario',includeAgendas:false});
    if(!pdfActionStillCurrent(owner)||!isScenarioStage())return;
    if(result.error)continue;
    const source=result.data?.documents?.find(d=>d.document_type==='SCENARIO')||result.data?.documents?.find(d=>d.document_type==='SCENARIO_SECRETARIAT');
    const style=reusableChairStyle(source?.content_html,result.data?.package);
    if(style){state.inheritedChairStyle=style;return;}
  }
  previousStyleChecked=key;
}

async function deletePackage() {
  if (!state.current) return;
  if (state.current.published_minute_id) throw new Error('전자서명 문서로 넘긴 회의 꾸러미는 삭제할 수 없습니다.');
  if (!(await window.CoopDialog.confirm(`「${state.current.title}」 준비 자료와 초안을 삭제할까요?`))) return;
  const { error } = await MeetingPackageService.deletePackage(state.current.id);
  if (error) throw error;
  state.current = null;
  resetPacketDirty();
  state.agendas = [];
  state.documents.clear();
  state.inheritedChairStyle = null;
  state.pdfAttachments = [];
  state.sourceContext = null;
  state.auditChangeRequests = [];
  state.auditDraftDirty = false;
  $('editorBody').hidden = true;
  $('editorPanel').hidden = true;
  await loadPackages();
  showToast('회의 준비 자료를 삭제했습니다.');
}

function switchStep(step) {
  if (step === 'audit' && $('auditStepTab').hidden) step = 'documents';
  if (step !== state.currentStep){scenarioReviewEpoch++;cancelSectionRead();}
  state.currentStep = step;
  const pending=pendingSection(step);
  $('completeMaterialsButton').hidden = step !== 'documents' || !!pending || isScenarioStage() || ['FINAL','CANCELLED'].includes(state.current?.status);
  document.querySelectorAll('.step-tab').forEach(button => button.classList.toggle('active', button.dataset.step === step));
  document.querySelectorAll('.step-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === step&&!pending));
  if(pending){loadMeetingSection(step,pending);return;}
  setSectionStatus();
  if (step === 'audit') {
    syncWorkingStateFromForms();
    renderAuditStep({ preserveDraft: true });
  }
  if (step === 'documents') {
    const scopedDocument=guidedRoute()?.kind==='BOARD'||isScenarioStage();
    if(scopedDocument)updateDocumentModeLabels();
    syncWorkingStateFromForms();
    refreshAutoDrafts({render:!scopedDocument});
    if(scopedDocument){renderActiveDocument();void refreshDocumentEditState();}
  }
  renderNotHeldState();
}

function addAgenda() {
  if (!state.agendaLock || state.agendaLock.locked) return showToast(state.agendaLock?.board_plan_review?BOARD_AGENDA_LOCK_REASON:AGENDA_LOCK_REASON);
  state.agendas = collectAgendasFromDom();
  state.agendas.push({ agenda_kind:'DECISION', title:'', summary:'', background:'', proposal_text:'', office_report:'', scenario_notes:'', decision_draft:'', decision_result:'', discussion_notes:'', document_notes:'', private_notes:'', requires_article_comparison:false });
  renderAgendaList();
  scheduleAutoDraftRefresh('agendas');
  document.querySelector('.agenda-card:last-child input[data-field="title"]')?.focus();
}

function addBudgetRow(kind) {
  const rows = collectBudgetRows(kind);
  rows.push({ name:'', basis:'', amount:0 });
  renderBudgetRows(kind, rows);
  updateBudgetSummary();
  const container = $(kind === 'income' ? 'incomeBudgetRows' : 'expenseBudgetRows');
  container.querySelector('.budget-row:last-child [data-budget-field="name"]')?.focus();
  scheduleAutoDraftRefresh('agendas');
}

function removeBudgetRow(button) {
  const row = button.closest('.budget-row');
  const kind = row?.dataset.budgetKind;
  if (!row || !kind) return;
  const index = Number(row.dataset.budgetIndex);
  const rows = collectBudgetRows(kind);
  rows.splice(index, 1);
  renderBudgetRows(kind, rows);
  updateBudgetSummary();
  scheduleAutoDraftRefresh('agendas');
}

async function handleAgendaAction(button) {
  const action = button.dataset.agendaAction, boardReview = state.agendaLock?.board_plan_review;
  const boardEditable = boardReview && state.current?.meeting_type === 'BOARD'
    && !['FINAL','CANCELLED'].includes(state.current.status) && !state.current.published_minute_id;
  if (!state.agendaLock || (state.agendaLock.locked && (!boardEditable || !['up','down'].includes(action)))) {
    return showToast(boardReview?BOARD_AGENDA_LOCK_REASON:AGENDA_LOCK_REASON);
  }
  const card = button.closest('.agenda-card');
  if (!card) return;
  state.agendas = collectAgendasFromDom();
  const index = Number(card.dataset.agendaIndex);
  if (action === 'delete') {
    if (!(await window.CoopDialog.confirm('이 안건을 목록에서 뺄까요? 저장을 누르면 삭제가 확정됩니다.'))) return;
    state.agendas.splice(index, 1);
  } else if (action === 'up' && index > 0) {
    [state.agendas[index - 1], state.agendas[index]] = [state.agendas[index], state.agendas[index - 1]];
  } else if (action === 'down' && index < state.agendas.length - 1) {
    [state.agendas[index + 1], state.agendas[index]] = [state.agendas[index], state.agendas[index + 1]];
  }
  renderAgendaList();
  scheduleAutoDraftRefresh('agendas');
}

function selectChapter(id) {
  if (!chapterMode()) return;
  rememberActiveChapter();
  state.activeChapterId = id;
  renderActiveChapter();
}

function moveChapter(offset) {
  if (!chapterMode() || !state.chapters.length) return;
  if (activeChapterLock().locked || agendaBillLocked()) return showToast('연결된 확정 자료는 순서를 바꾸거나 수정할 수 없습니다.');
  rememberActiveChapter();
  const index = activeChapterIndex();
  const target = index + offset;
  if (target < 0 || target >= state.chapters.length) return;
  const targetLock = getAssemblyChapterEditLock(state.chapters[target]?.id || '', state.sourceContext);
  if (targetLock.locked) return showToast('연결된 확정 자료의 앞뒤 순서는 바꿀 수 없습니다.');
  [state.chapters[index], state.chapters[target]] = [state.chapters[target], state.chapters[index]];
  state.documentDirty = true;
  renderActiveChapter();
}

function stepChapter(offset) {
  if (!chapterMode() || !state.chapters.length) return;
  rememberActiveChapter();
  const target = activeChapterIndex() + offset;
  if (target < 0 || target >= state.chapters.length) return;
  state.activeChapterId = state.chapters[target].id;
  renderActiveChapter();
}

function addChapter() {
  if (!chapterMode()) return;
  rememberActiveChapter();
  const id = `custom-${Date.now()}`;
  const index = activeChapterIndex();
  state.chapters.splice(index + 1, 0, {
    id,
    title: '새 챕터',
    className: 'meeting-chapter chapter-custom',
    html: '<h1>새 챕터</h1><p>내용을 입력하세요.</p>'
  });
  state.activeChapterId = id;
  state.documentDirty = true;
  renderActiveChapter();
  $('chapterTitle').select();
}

async function deleteChapter() {
  if (!chapterMode() || !state.chapters.length) return;
  if (activeChapterLock().locked || agendaBillLocked()) return showToast('연결된 확정 자료는 자료집에서 수정하거나 삭제할 수 없습니다.');
  const index = activeChapterIndex();
  const title = state.chapters[index].title;
  if (activeChapterPdfAttachments().length) {
    showToast('이 챕터 뒤에 붙인 PDF를 먼저 삭제해 주세요.');
    return;
  }
  if (!(await window.CoopDialog.confirm(`「${title}」 챕터를 자료집에서 뺄까요? 저장하기 전까지는 새로고침하면 되돌릴 수 있습니다.`))) return;
  state.chapters.splice(index, 1);
  state.activeChapterId = state.chapters[Math.min(index, state.chapters.length - 1)]?.id || null;
  state.documentDirty = true;
  renderActiveChapter();
}

const pendingPdfDrafts=new Map();
function pendingPdfKey(anchor=activePdfAttachmentAnchor()) {
  const o=pdfActionOwner();return JSON.stringify([o.userId,o.coopId,o.packageId,anchor]);
}
function renderPendingPdf() {
  const button=$('addPdfAttachmentButton');if(!button)return;
  const draft=pendingPdfDrafts.get(pendingPdfKey());
  button.textContent=draft?'PDF 준비 다시 확인':'PDF 첨부';
  button.title=draft?draft.file.name:'';
  let filename=$('pendingPdfFilename');
  if(!filename){filename=document.createElement('span');filename.id='pendingPdfFilename';filename.style.overflowWrap='anywhere';button.after(filename);}
  filename.textContent=draft?'준비 중: '+draft.file.name:'';
  let replacement=$('replacePendingPdf');
  if(!replacement){replacement=document.createElement('button');replacement.id='replacePendingPdf';replacement.type='button';replacement.className=button.className;
    replacement.textContent='다른 PDF 선택';replacement.onclick=()=>$('pdfAttachmentInput').click();button.after(replacement);}
  replacement.hidden=!draft;replacement.disabled=button.disabled;
}
async function addPdfAttachment(file) {
  const anchor = activePdfAttachmentAnchor();
  if (!state.current || !anchor) throw new Error('PDF를 붙일 회의자료나 챕터를 먼저 선택해 주세요.');
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) throw new Error('PDF 파일은 20MB 이하만 첨부할 수 있습니다.');
  const draftKey=pendingPdfKey(anchor),draft={file};
  pendingPdfDrafts.set(draftKey,draft);renderPendingPdf();
  const owner = pdfActionOwner();
  const { inspectPdfFile } = await getPdfRenderer();
  if (!pdfActionStillCurrent(owner, anchor)) return;
  const inspected = await inspectPdfFile(file);
  if (!pdfActionStillCurrent(owner, anchor)) return;
  if (state.documentDirty) await saveActiveDocument();
  if (!pdfActionStillCurrent(owner, anchor)) return;
  const title = String(file.name || '첨부 자료').replace(/\.pdf$/i, '').trim() || '첨부 자료';
  const existing = activeChapterPdfAttachments();
  const { data, error, previousInput } = await MeetingPackageService.uploadPdfAttachment(state.current.id, file, {
    title,
    insert_after_chapter_id: anchor,
    page_count: inspected.pageCount,
    sort_order: existing.length ? Math.max(...existing.map(row => Number(row.sort_order || 0))) + 1 : 0
  },()=>pdfActionStillCurrent(owner,anchor));
  if (error) throw error;
  if (!pdfActionStillCurrent(owner, anchor)) return;
  if(!previousInput && pendingPdfDrafts.get(draftKey)===draft)pendingPdfDrafts.delete(draftKey);
  if(!state.pdfAttachments.some(row=>row.id===data.id))state.pdfAttachments.push(data);
  state.pdfAttachments.sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  renderPdfAttachmentList();
  renderPendingPdf();
  await MeetingPackageService.acknowledgePdfAttachment(owner.packageId,anchor,data.id);
  if(state.current.meeting_type==='BOARD')renderBoardAnnexLinks();
  showToast(previousInput?'이전 PDF 첨부 결과를 확인했습니다. 새로 선택한 파일은 그대로 남겨두었습니다.':`「${title}」 ${inspected.pageCount}쪽을 ${anchor === 'board-materials' ? '이사회 회의자료' : '이 챕터'} 뒤에 붙였습니다.`);
}

async function deletePdfAttachment(id) {
  const owner=pdfActionOwner();
  const row = state.pdfAttachments.find(item => item.id === id)||MeetingPackageService.pendingPdfCleanups(owner).find(item=>item.id===id);
  if (!row||row.inherited||state.current?.status==='CANCELLED') return;
  if (!(await window.CoopDialog.confirm(`「${row.title}」 PDF를 자료집과 비공개 저장소에서 삭제할까요?`))) return;
  if(!pdfActionStillCurrent(owner))return;
  const { error } = await MeetingPackageService.deletePdfAttachment(id);
  if (error) {if(pdfActionStillCurrent(owner))renderPdfAttachmentList();throw error;}
  if(!pdfActionStillCurrent(owner))return;
  state.pdfAttachments = state.pdfAttachments.filter(item => item.id !== id);
  renderPdfAttachmentList();
  if(state.current.meeting_type==='BOARD'&&state.activeDocument==='MATERIALS'){
    const markers=[...$('documentEditor').querySelectorAll('.board-pdf-annex')].filter(n=>n.dataset.boardPdfId===id);
    if(markers.length){markers.forEach(n=>n.remove());state.documentDirty=true;state.pendingDocuments.add('MATERIALS');}
    renderBoardAnnexLinks();
  }
  showToast('첨부 PDF를 삭제했습니다.');
}

function activeRichEditor() {
  return chapterMode() ? $('chapterEditor') : $('documentEditor');
}

async function runAction(action) {
  if (state.loading) return;
  setBusy(true);
  try { await action(); }
  catch (error) {
    if(error?.code==='MEETING_EDIT_REQUEST_STALE'||error?.code==='MEETING_WRITE_STALE')return;
    console.error(error);
    const code = String(error?.message || '');
    showToast(code.includes('MEETING_AUDIT_LOCKED') ? '감사의 서명이 시작되어 이번 수정은 저장하지 않았습니다. 작성한 초안은 그대로 남아 있습니다.'
      : code.includes('MEETING_AUDIT_CONFLICT') ? '저장된 감사보고서가 바뀌었습니다. 작성한 초안과 최신 문서를 확인한 뒤 다시 저장해 주세요.'
      : code.includes('MEETING_REQUEST_MISMATCH') ? '이전 요청과 대상이나 내용이 다릅니다. 원래 작업의 결과를 먼저 확인해 주세요.'
      : code.includes('MEETING_PDF_SOURCE_RETAINED') ? '무산된 회의나 다음 회의에서 참조하는 원본 PDF는 삭제할 수 없습니다.'
      : code.includes('MEETING_AGENDA_MATERIALS_MISMATCH') ? '회의자료의 안건 제목이 일치하지 않습니다. 작성한 설명·별첨을 보관한 뒤 기존 안건 제목을 확인해 주세요.'
      : code.includes('MEETING_AGENDA_LOCKED') && state.agendaLock?.board_plan_review ? BOARD_AGENDA_LOCK_REASON
      : code.includes('MEETING_AGENDA_LOCKED') && state.current?.meeting_type === 'BOARD' ? '결재로 확정된 이사회 안건 제목·목록은 바꿀 수 없습니다. 입력은 보관했습니다.'
      : code.includes('MEETING_AGENDA_LOCKED') ? '소집 공문 결재가 완료되어 기본정보와 안건 제목·구성이 잠겼습니다. 입력은 보관했습니다. 잠금 상태를 다시 확인해 주세요.'
      : code.includes('MEETING_DOCUMENT_EDIT_REQUIRED') ? '편집권이 없거나 만료되었습니다. 작성한 내용을 확인하고 편집권을 다시 확인해 주세요.'
      : code.includes('MEETING_DOCUMENT_EDIT_IN_PROGRESS') ? '편집 중인 문서가 있습니다. 편집을 마친 뒤 다시 확인해 주세요.'
      : code.includes('MEETING_DOCUMENT_CONFLICT') ? '저장된 문서가 바뀌었습니다. 편집권을 다시 확인해 최신 문서와 초안을 비교해 주세요.'
      : code.includes('MEETING_EDIT_FINAL_DOCUMENT') ? '의사록으로 확정된 회의의 준비문서는 수정할 수 없습니다.'
      : code.includes('MEETING_EDIT_ACCESS_DENIED') || code.includes('MEETING_EDIT_TAKEOVER_DENIED') ? '현재 권한으로 문서를 편집할 수 없습니다. 작성한 내용은 남아 있습니다.'
      : code.includes('MEETING_PACKAGE_DELETE_IN_PROGRESS') ? '이 회의의 삭제 작업이 진행 중입니다. 잠시 후 현재 상태를 다시 확인해 주세요.'
      : code.includes('MEETING_AGENDA_CHANGED') ? '회의 기본정보나 안건 제목이 변경되었습니다. 소집 공문에서 회의 내용을 다시 불러와 확인해 주세요.'
      : error?.message || '작업을 완료하지 못했습니다.', 4800);
  } finally { setBusy(false); }
}

function bindEvents() {
  $('standaloneMeetingPicker').addEventListener('click',()=>window.ErpWorkspaceResume.navigate('/minutes/meeting_workspace.html?picker=1'));
  $('retryMeetingDetail').addEventListener('click',()=>{
    const retry=meetingDetailRetry;
    if(!retry||state.loading||!meetingEntryReady||retry.owner!==meetingDetailOwner()||retry.revision!==meetingDetailRevision)return;
    if(retry.selection)void openMeetingFromList(retry.id);
    else void openPackage(retry.id,{section:retry.section});
  });
  $('retryMeetingSection').addEventListener('click',()=>switchStep(state.currentStep));
  $('markNotHeldButton').addEventListener('click',e=>{
    if(guidedStage()==='outcome'&&window.ErpBoardFlow.canRecord(guidedStatus()||{}))void meetingNotHeld.open('mark',e.currentTarget);
  });
  $('carryAgendasButton').addEventListener('click',e=>void meetingNotHeld.open('carry',e.currentTarget));
  $('viewNotHeldButton').addEventListener('click',()=>{if(state.current?.published_minute_id)window.open('/minutes/minutes_view?minuteId='+encodeURIComponent(state.current.published_minute_id),'_blank','noopener');});
  $('editDocumentButton').addEventListener('click',()=>runAction(()=>beginDocumentEdit(false)));
  $('takeDocumentEditButton').addEventListener('click',()=>runAction(()=>beginDocumentEdit(true)));
  $('endDocumentEditButton').addEventListener('click',()=>runAction(endDocumentEdit));
  $('refreshDocumentEditButton').addEventListener('click',()=>void refreshDocumentEditState());
  $('saveCurrentDocumentButton').addEventListener('click',()=>runAction(saveActiveDocument));
  $('keepDocumentDraftButton').addEventListener('click',()=>runAction(keepDocumentDraft));
  for(const id of ['documentEditor','chapterEditor'])$(id).addEventListener('beforeinput',event=>{if(!documentEditingAllowed())event.preventDefault();});
  $('backToDocuments').addEventListener('click', () => { location.href = '../erp/governance.html'; });
  $('newPackageButton').addEventListener('click', () => { if (meetingEntryReady) void runAction(openNewPackage); });
  $('retryMeetingEntry').addEventListener('click', () => { void init(); });
  $('newPackageModal').addEventListener('keydown', event => {
    const modal = $('newPackageModal');
    if (!modal.classList.contains('show') || window.frameElement?.hidden || event.defaultPrevented
      || event.isComposing || event.keyCode === 229 || event.target.closest('dialog[open]')
      || document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (!state.loading) closeNewPackage();
    } else if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && !node.closest('[inert]')
          && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
      if (!controls.length) return;
      event.preventDefault(); event.stopPropagation();
      const index = controls.indexOf(document.activeElement);
      controls[index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (index + controls.length + (event.shiftKey ? -1 : 1)) % controls.length].focus();
    }
  });
  $('newMeetingType').addEventListener('change', activateNewPackageDraft);
  $('newAssemblyKind').addEventListener('change', activateNewPackageDraft);
  $('newMeetingTitle').addEventListener('input', rememberNewPackageDraft);
  $('newMeetingNumber').addEventListener('input', rememberNewPackageDraft);
  $('cancelNewPackage').addEventListener('click', closeNewPackage);
  $('discardNewPackage').addEventListener('click', () => void discardNewPackageDraft());
  $('createPackageButton').addEventListener('click', () => runAction(createPackage));
  $('deletePackageButton').addEventListener('click', () => runAction(deletePackage));
  $('saveInfoButton').addEventListener('click', () => runAction(saveInfo));
  $('saveAgendasButton').addEventListener('click', () => runAction(saveAgendas));
  $('refreshAgendaLockButton').addEventListener('click', () => runAction(refreshAgendaLock));
  $('documentEditor').addEventListener('beforeinput', guardMaterialAgendaInput);
  $('chapterEditor').addEventListener('beforeinput', guardMaterialAgendaInput);
  $('loadPreviousBooklet').addEventListener('click', () => runAction(loadPreviousBooklet));
  $('generateAllButton').addEventListener('click', () => runAction(generateAllDocuments));
  $('completeMaterialsButton').addEventListener('click', () => reviewedMeetingAction(completeMeetingMaterials));
  $('refreshAssemblySourcesButton').addEventListener('click', () => runAction(async () => {
    await loadAssemblySources();
    refreshAutoDrafts({ render: state.currentStep === 'documents' });
    showToast('총회 연동 자료를 다시 확인했습니다.');
  }));
  $('refreshAuditSourcesButton').addEventListener('click', () => runAction(async () => {
    await loadAssemblySources();
    renderAuditStep({ preserveDraft: true });
    showToast('결산자료와 감사 진행 상태를 다시 확인했습니다.');
  }));
  $('resetAuditDraftButton').addEventListener('click', () => runAction(resetAuditDraft));
  $('requestAuditReviewButton').addEventListener('click', () => runAction(requestAuditReview));
  $('openAuditButton').addEventListener('click', openAuditReport);
  $('recordAuditChangeButton').addEventListener('click', () => runAction(recordAuditChangeRequest));
  $('saveDocumentButton').addEventListener('click', () => reviewedMeetingAction(saveWholeMeetingDraft));
  $('printDocumentButton').addEventListener('click', () => reviewedMeetingAction(printActiveDocument));
  $('printChapterButton').addEventListener('click', () => runAction(printCurrentChapter));
  $('previousChapterButton').addEventListener('click', () => stepChapter(-1));
  $('nextChapterButton').addEventListener('click', () => stepChapter(1));
  $('addChapterButton').addEventListener('click', addChapter);
  $('moveChapterUpButton').addEventListener('click', () => moveChapter(-1));
  $('moveChapterDownButton').addEventListener('click', () => moveChapter(1));
  $('deleteChapterButton').addEventListener('click', deleteChapter);
  $('addBoardAnnexButton').addEventListener('click', () => runAction(addBoardTextAnnex));
  $('discardBoardAnnexDraft').addEventListener('click',()=>void discardBoardAnnexDraft());
  for(const event of ['input','change'])$('boardAnnexPanel').addEventListener(event,()=>{boardAnnexRevision++;rememberBoardAnnexDraft();});
  $('boardAnnexLinks').addEventListener('change',event=>{const select=event.target.closest('[data-annex-relation]');if(select)changeBoardAnnexRelation(select.dataset.annexRelation,select.value);});
  $('boardAnnexLinks').addEventListener('click',event=>{const b=event.target.closest('[data-annex-move]');if(b)changeBoardAnnexRelation(b.dataset.annexMove,null,Number(b.dataset.direction));});
  $('addPdfAttachmentButton').addEventListener('click', () => {
    const pending=pendingPdfDrafts.get(pendingPdfKey());
    if(pending)void runAction(()=>addPdfAttachment(pending.file));else $('pdfAttachmentInput').click();
  });
  $('pdfAttachmentInput').addEventListener('change', () => {
    const file = $('pdfAttachmentInput').files?.[0] || null;
    $('pdfAttachmentInput').value = '';
    if (file) runAction(() => addPdfAttachment(file));
  });
  $('pdfAttachmentList').addEventListener('click', event => {
    const button = event.target.closest('[data-pdf-action="delete"]');
    const row = button?.closest('[data-pdf-attachment-id]');
    if (button && row) runAction(() => deletePdfAttachment(row.dataset.pdfAttachmentId));
  });
  $('chapterList').addEventListener('click', event => {
    const button = event.target.closest('[data-chapter-id]');
    if (button) selectChapter(button.dataset.chapterId);
  });
  $('addAgendaButton').addEventListener('click', addAgenda);
  $('packageList').addEventListener('click', event => {
    const button = event.target.closest('[data-package-id]');
    if (button) void openMeetingFromList(button.dataset.packageId);
  });
  $('pastPackageList').addEventListener('click', event => {
    const button = event.target.closest('[data-package-id]');
    if (button) void openMeetingFromList(button.dataset.packageId);
  });
  document.querySelectorAll('.step-tab').forEach(button => button.addEventListener('click', () => switchStep(button.dataset.step)));
  document.querySelectorAll('.doc-tab').forEach(button => button.addEventListener('click', () => {
    if(!documentInStage(button.dataset.document))return;
    rememberActiveDocument();
    documentEditEpoch++;
    state.activeDocument = button.dataset.document;
    renderActiveDocument();
    void refreshDocumentEditState();
    renderNotHeldState();
  }));
  $('meetingType').addEventListener('change', () => {
    const candidates = currentTypeOfficials($('meetingType').value);
    state.current = { ...state.current, meeting_type:$('meetingType').value, assembly_kind:$('meetingType').value === 'GENERAL_ASSEMBLY' ? $('assemblyKind').value : null };
    $('eligibleCount').value = candidates.length;
    $('eligibleCountLabel').textContent = $('meetingType').value === 'GENERAL_ASSEMBLY' ? '재적 대의원 수' : '재적 이사 수';
    updateDocumentModeLabels();
    state.sourceContext = null;
    renderAgendaList();
    scheduleAutoDraftRefresh();
  });
  $('assemblyKind').addEventListener('change', () => {
    if (!state.current || $('meetingType').value !== 'GENERAL_ASSEMBLY') return;
    state.current = { ...state.current, assembly_kind:$('assemblyKind').value };
    if ($('assemblyKind').value === 'REGULAR' && !$('fiscalYear').value) renderFiscalYearOptions(defaultFiscalYear());
    state.sourceContext = null;
    updateDocumentModeLabels();
    if ($('assemblyKind').value === 'REGULAR') renderAssemblyBookletInputs();
    renderAgendaList();
    scheduleAutoDraftRefresh();
  });
  $('chairOfficial').addEventListener('change', scheduleAutoDraftRefresh);
  for(const id of ['chairOfficial','meetingDate','noticeDate'])$(id).addEventListener('change',renderAssemblyBeforeCheck);
  $('assemblyOpenAudit').addEventListener('click',()=>{if(!$('auditStepTab').hidden)switchStep('audit');});
  $('assemblyAuditRecord').addEventListener('click',()=>runAction(async()=>{
    const owner=pdfActionOwner(),day=$('assemblyAuditSentOn').value;
    if(!day||!state.sourceContext?.audit_report_ready)throw new Error('실제 제출일과 결산보고서를 확인해 주세요.');
    if(!await window.CoopDialog.confirm(day+'에 감사에게 제출한 것으로 기록할까요?'))return;
    if(!pdfActionStillCurrent(owner))return;
    const {data,error}=await getAssemblyContext(owner.packageId,day);
    if(!pdfActionStillCurrent(owner))return;
    if(error||!data?.audit_sent_on)throw Error('제출 기록을 저장하지 못했습니다. 기존 기록을 확인해 주세요.');
    state.sourceContext=data;renderAssemblySourceStatus();
    syncSavedMeetingProgress({auditSentOn:data.audit_sent_on});
    window.ErpWorkspaceResume?.checkpoint?.();
  }));
  $('agendaList').addEventListener('click', event => {
    const button = event.target.closest('[data-agenda-action]');
    if (button) handleAgendaAction(button);
  });
  $('agendaList').addEventListener('change',event=>{
    const n=event.target,card=n.closest('.agenda-card');
    if(!card||state.current?.meeting_type!=='GENERAL_ASSEMBLY')return;
    if(n.dataset.field==='agenda_kind'){
      state.agendas=collectAgendasFromDom();const index=card.dataset.agendaIndex;
      renderAgendaList();document.querySelector(`.agenda-card[data-agenda-index="${index}"] [data-field="agenda_kind"]`)?.focus();
    }else if(n.dataset.field==='assembly_decision_type'){
      const value=card.querySelector('[data-assembly-votes]');if(value)value.innerHTML=votesLine(n.value);
    }
  });
  $('assemblyBookletPanel').addEventListener('click', event => {
    const addButton = event.target.closest('[data-budget-add]');
    if (addButton) return addBudgetRow(addButton.dataset.budgetAdd);
    const removeButton = event.target.closest('[data-budget-remove]');
    if (removeButton) removeBudgetRow(removeButton);
  });
  $('assemblyBookletPanel').addEventListener('input', event => {
    if (event.target.matches('.budget-amount,.money-input')) {
      const amount = numberFromMoney(event.target.value);
      event.target.value = amount ? amount.toLocaleString('ko-KR') : '';
    }
    if (event.target.closest('.budget-row')) updateBudgetSummary();
  });
  $('editorBody').addEventListener('input', event => {
    if(event.target.closest('#boardAnnexPanel'))return;
    if (event.target === $('documentEditor') || event.target === $('documentTitle') || event.target === $('chapterEditor') || event.target === $('chapterTitle') || event.target.closest('#documentEditor,#chapterEditor')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh(event);
  });
  $('editorBody').addEventListener('change', event => {
    if(event.target.closest('#boardAnnexPanel'))return;
    if (event.target === $('documentTitle') || event.target === $('chapterTitle')) return;
    if (event.target.matches('input,select,textarea')) scheduleAutoDraftRefresh(event);
  });
  $('documentEditor').addEventListener('input', () => { state.documentDirty = true;if(state.current?.meeting_type==='BOARD'&&state.activeDocument==='MATERIALS')renderBoardAnnexLinks(); });
  $('documentEditor').addEventListener('click', event => {
    const button = event.target.closest('.board-annex-toggle');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const section = button.closest('.board-text-annex');
    const expanded = section.classList.toggle('is-collapsed') === false;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${section.querySelector('.board-annex-heading h1')?.textContent.trim() || '별첨'} ${expanded ? '접기' : '펼치기'}`);
    button.textContent = expanded ? '접기' : '펼치기';
  });
  $('auditDraftEditor').addEventListener('input', () => {
    if (auditReportLocked()) return;
    state.auditDraftDirty = true;
    $('auditDraftEditor').classList.remove('is-empty');
    $('auditDraftState').className = 'audit-draft-state';
    $('auditDraftState').textContent = '수정 중 · 요청 전';
  });
  $('chapterEditor').addEventListener('input', () => {
    if (!activeChapterLock().locked) state.documentDirty = true;
  });
  $('chapterTitle').addEventListener('input', () => {
    if (activeChapterLock().locked) return;
    state.documentDirty = true;
    const index = activeChapterIndex();
    if (state.chapters[index]) state.chapters[index].title = $('chapterTitle').value;
    renderChapterList();
  });
  $('documentTitle').addEventListener('input', () => { state.documentDirty = true; });
  document.querySelectorAll('.rich-toolbar [data-command]').forEach(button => button.addEventListener('click', () => {
    if (chapterMode() && activeChapterLock().locked) return showToast('이 챕터는 연결된 확정 자료이므로 수정할 수 없습니다.');
    activeRichEditor().focus();
    document.execCommand(button.dataset.command, false, button.dataset.value || null);
    state.documentDirty = true;
  }));
  window.addEventListener('beforeunload', event => {
    if (!hasUnsavedPacketChanges() && !hasUnsavedNewPackageDraft() && !meetingNotHeld.hasDraft()) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

function bindMeetingLifecycle() {
  if (meetingLifecycleBound) return;
  meetingLifecycleBound = true;
  window.setInterval(renderPackages, 60_000);
  window.setInterval(()=>{void refreshDocumentEditState();},25000);
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){
      if(meetingEntryReady&&!guidedRoute())$('meetingPicker').hidden=false;
      invalidateNewPackagePreparation();invalidateMeetingDetailRead();cancelSectionRead();freezeDocumentEditing();
    }
    else {renderPackages();if(pendingSection(state.currentStep))switchStep(state.currentStep);void refreshDocumentEditState();}
  });
  if(window.frameElement)new MutationObserver(records=>{
    if(window.frameElement.hidden || records.some(record=>record.oldValue===null)){invalidateNewPackagePreparation();invalidateMeetingDetailRead();}
    if(window.frameElement.hidden){
      cancelSectionRead();
      if(meetingEntryReady&&!guidedRoute())$('meetingPicker').hidden=false;
      clearAssemblyBookletRequest();freezeDocumentEditing();
    }else {if(pendingSection(state.currentStep))switchStep(state.currentStep);void refreshDocumentEditState();}
  }).observe(window.frameElement,{attributes:true,attributeFilter:['hidden'],attributeOldValue:true});
  window.addEventListener('pagehide',()=>{invalidateNewPackagePreparation();invalidateMeetingDetailRead();cancelSectionRead();freezeDocumentEditing();});
  window.addEventListener('pageshow',event=>{
    if(event.persisted&&meetingEntryReady&&!guidedRoute())$('meetingPicker').hidden=false;
  });
}

function bindMeetingEntry() {
  if (meetingEventsBound) return;
  meetingEventsBound = true;
  document.addEventListener('erp-assembly-booklet',()=>{assemblyBookletRequested=true;showRequestedAssemblyBooklet();});
  if(location.hash==='#assembly-booklet')assemblyBookletRequested=true;
  bindEvents();
  supabase.auth.onAuthStateChange((event, session) => {
    const expected = meetingEntryPending?.userId || state.session?.user?.id;
    if (event === 'SIGNED_OUT' || (session?.user?.id && expected && session.user.id !== expected)) {
      clearAssemblyBookletRequest();
      meetingEntryRevision++; meetingEntryReady = false;
      $('meetingPicker').hidden=true;
      setMeetingEntryStatus('로그인 상태가 바뀌었습니다. 다시 불러오기를 눌러 주세요.', true);
      invalidateNewPackagePreparation();
      invalidateMeetingDetailRead();
      cancelSectionRead();
      freezeDocumentEditing();
      pdfIdentityRevision++;
      meetingDefaultsRevision++;
      meetingDefaultsReady = false;
      meetingHistoryReady = false;
      meetingDefaultsPending = null;
      meetingHistoryPending = null;
      clearNewPackageDrafts();
      clearBoardAnnexDrafts();
    }
  });
}

function init() {
  bindMeetingEntry();
  if (meetingEntryPending?.revision === meetingEntryRevision) return meetingEntryPending.promise;
  const request = {revision:++meetingEntryRevision, userId:null, failed:false, promise:null};
  meetingEntryReady = false;
  $('meetingPicker').hidden=true;
  setMeetingEntryStatus('회의 준비 화면을 불러오는 중…');
  meetingEntryPending = request;
  request.promise = boundedMeetingRead(() => initializeMeetingPage(request)).catch(error => {
    if (meetingEntryPending !== request || request.revision !== meetingEntryRevision) return;
    request.failed = true;
    setMeetingEntryStatus(error?.code === 'MEETING_READ_TIMEOUT' ? '조회 시간이 길어지고 있습니다. 다시 불러오기를 눌러 주세요.' : '회의 준비 화면을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.', true);
  }).finally(() => { if (meetingEntryPending === request) meetingEntryPending = null; });
  return request.promise;
}

async function initializeMeetingPage(request) {
  const current = () => meetingEntryPending === request && request.revision === meetingEntryRevision && !request.failed;
  const session = await MinutesService.getSession();
  if (!current()) return;
  if (!session) {
    showToast('로그인이 필요합니다.');
    location.href = `/erp/?next=${encodeURIComponent(location.href)}`;
    return;
  }
  request.userId = session.user.id;
  state.session = session;
  const runtimeGate = await window.ErpRuntimeGuard.enforce(supabase, {
    moduleKey:'minutes', moduleLabel:'회의 꾸러미', redirectUrl:`/erp/?next=${encodeURIComponent(location.href)}`, alertFn:message=>{if(current())showToast(message);}
  });
  if (!current() || !runtimeGate.ok) return;
  const runtime = runtimeGate.runtime || await MeetingPackageService.getRuntime();
  if (!current()) return;
  state.runtime = runtime;
  const isAdmin = hasLocalAdminHint() || await MinutesService.isAdmin(state.session?.user?.id, state.session?.user?.email);
  if (!current()) return;
  if (!isAdmin) {
    showToast('관리자 권한이 필요합니다.');
    window.setTimeout(() => { location.href = '/erp/'; }, 1000);
    return;
  }
  // Resolve the existing service scope once before its two independent list reads.
  // This is not a replacement for the entry or workspace-resume permission gates.
  const packageRuntime = await MeetingPackageService.getRuntime();
  if (!current()) return;
  if (packageRuntime.coop_id !== state.runtime.coop_id) throw new Error('현재 조합을 다시 확인해 주세요.');
  window.ErpWorkspaceResume.register({modules:['minutes'],busy:()=>state.loading||hasUnsavedPacketChanges()||hasUnsavedNewPackageDraft()||meetingNotHeld.hasDraft(),authorize:async runtime=>{
    const perms=runtime.effective_permissions||[];
    return perms.some(key=>['minutes.manage','member.admin','site.admin'].includes(key))
      || await MinutesService.isAdmin(state.session.user.id,state.session.user.email);
  },refresh:async () => {
    if (!meetingEntryReady) { await init(); return; }
    meetingDefaultsRevision++;
    meetingDefaultsReady = false;
    meetingHistoryReady = false;
    meetingDefaultsPending = null;
    meetingHistoryPending = null;
    const route=guidedRoute();
    if(route?.kind==='BOARD'&&route.stage!=='outcome'){
      const owner=meetingDetailOwner();
      const status=await window.ErpBoardFlow.read(supabase,state.runtime.coop_id,route);
      if(owner===meetingDetailOwner()&&guidedRoute()?.href===route.href)window.ErpBoardFlow.adopt(status);
      return;
    }
    await loadPackages();
  }});
  window.ErpWorkspaceTask.requestPrint = () => { if (!meetingEntryReady||pendingSection('documents')) return; return state.current?.meeting_type === 'BOARD' ? reviewedMeetingAction(printActiveDocument) : window.print(); };
  const requestedAssembly=new URLSearchParams(location.search).get('assembly');
  const boardRoute=window.ErpBoardFlow?.parse(location.href);
  const boardStatus=boardRoute?.kind==='BOARD'?await window.ErpBoardFlow.read(supabase,runtime.coop_id,boardRoute):null;
  if(!current())return;
  // Only cancellation needs the meeting list at entry. Scenario history
  // is read when the user actually generates or prints a fresh script.
  if(!boardStatus||(boardRoute.stage==='outcome'&&window.ErpBoardFlow.canVisit(boardRoute.stage,boardStatus))){
    const packageResult=await MeetingPackageService.listPackages();
    if(!current())return;
    if(packageResult.error)throw packageResult.error;
    state.packages=packageResult.data||[];
    renderPackages();
  }
  bindMeetingLifecycle();
  meetingEntryReady = true;
  if(boardRoute){
    if(!boardStatus&&!state.packages.some(row=>row.id===boardRoute.id&&row.meeting_type===boardRoute.kind))throw Error('선택한 회의를 찾을 수 없어요.');
    const status=boardStatus||await window.ErpBoardFlow.read(supabase,runtime.coop_id,boardRoute);
    if(!current())return;
    if(boardRoute.stage==='resume'){
      openGuidedStage(status.id,window.ErpBoardFlow.nextStage(status,boardRoute.kind),boardRoute.kind);
      return;
    }
    document.body.dataset.boardFlow='';
    document.body.dataset.guidedStage=boardRoute.stage;
    $('standaloneMeetingPicker').hidden=window.parent!==window;
    window.ErpBoardFlow.adopt(status);
    const boardPreparation=boardRoute.kind==='BOARD'&&['prepare','agenda','materials'].includes(boardRoute.stage);
    if(!boardPreparation&&!window.ErpBoardFlow.canVisit(boardRoute.stage,status)){
      setMeetingEntryStatus(status.status==='CANCELLED'?'무산된 회의입니다. 무산 기록을 열어 주세요.':
        boardRoute.stage==='scenario'?'소집 공문을 문서함에 게시한 뒤 시나리오를 열 수 있어요.':'문서함 게시 후 회의 날짜가 지나면 결과를 기록할 수 있어요.');
      return;
    }
    const section=boardRoute.stage==='audit'?'agenda':boardRoute.stage==='outcome'?'full':boardRoute.stage;
    await openPackage(boardRoute.id,{internal:true,section});
    if(!current()||state.current?.id!==boardRoute.id||state.current.meeting_type!==boardRoute.kind)return;
    if(boardRoute.stage==='audit'&&state.current.assembly_kind==='EXTRAORDINARY')throw Error('임시총회에는 감사 제출 단계가 없어요.');
    const setFlowStep=stage=>{
      document.body.dataset.guidedStage=stage;
      switchStep(stage==='agenda'?'agendas':stage==='materials'?'documents':'info');
      if(stage==='audit')requestAnimationFrame(()=>$('assemblyBeforeCheck')?.scrollIntoView({block:'start'}));
    };
    if(boardRoute.stage==='scenario'){
      state.activeDocument='SCENARIO';
      switchStep('documents');
    }else{
      setFlowStep(boardRoute.stage);
      if(boardRoute.stage==='outcome'&&status.status!=='CANCELLED')void meetingNotHeld.open('mark',$('markNotHeldButton'));
    }
    const adapter=window.ErpWorkspaceTask;
    const boardTarget=value=>{
      const target=window.ErpBoardFlow.parse(value);
      return ['prepare','agenda','audit','materials'].includes(guidedStage())&&!hasUnsavedPacketChanges()
        &&target?.id===boardRoute.id&&target.id===state.current?.id&&state.current.meeting_type===target.kind
        &&['prepare','agenda','audit','materials'].includes(target.stage)
        &&(target.stage!=='audit'||state.current.assembly_kind!=='EXTRAORDINARY')?target:null;
    };
    adapter.canNavigateTaskRoute=value=>!!boardTarget(value);
    adapter.navigateTaskRoute=value=>{
      const target=boardTarget(value);if(!target)return false;
      history.replaceState(history.state,'',target.href);
      setFlowStep(target.stage);
      return true;
    };
  }
  if(requestedAssembly&&state.packages.some(row=>row.id===requestedAssembly&&row.meeting_type==='GENERAL_ASSEMBLY')){
    await openPackage(requestedAssembly,{internal:true});
  }
  window.ErpMeetingManual?.mount({button:$('meetingWorkflowGuide'),client:supabase,runtime,
    active:()=>meetingEntryReady&&state.runtime?.coop_id===runtime.coop_id&&state.session?.user?.id===request.userId});
  setMeetingEntryStatus();
  showRequestedAssemblyBooklet();
  if(!boardRoute){
    const automatic=automaticMeeting();
    $('meetingPicker').hidden=!!automatic;
    if(automatic)void openMeetingFromList(automatic.id);
  }
}

init().catch(error => {
  console.error(error);
  showToast(error?.message || '회의 꾸러미를 시작하지 못했습니다.', 5000);
});
