/*
Version: v1.0.14
Change: Read early homepage notes separately without replacing current notes or drafts.
*/

var showAlert = (typeof window !== 'undefined' && window.showAlert) || function(message) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.45)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '9999';

  const box = document.createElement('div');
  box.style.background = '#fff';
  box.style.borderRadius = '10px';
  box.style.maxWidth = '90%';
  box.style.minWidth = '260px';
  box.style.padding = '18px 20px';
  box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

  const msg = document.createElement('div');
  msg.style.whiteSpace = 'pre-line';
  msg.style.color = '#111827';
  msg.style.fontSize = '14px';
  msg.style.lineHeight = '1.5';
  msg.textContent = String(message ?? '');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = '확인';
  btn.style.marginTop = '14px';
  btn.style.padding = '8px 16px';
  btn.style.border = '1px solid #e5e7eb';
  btn.style.borderRadius = '8px';
  btn.style.background = '#111827';
  btn.style.color = '#fff';
  btn.style.cursor = 'pointer';

  const close = () => overlay.remove();
  btn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  box.appendChild(msg);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
};

var showConfirm = (typeof window !== 'undefined' && window.showConfirm) || function(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '10000';

    const box = document.createElement('div');
    box.style.background = '#fff';
    box.style.borderRadius = '10px';
    box.style.maxWidth = '90%';
    box.style.minWidth = '280px';
    box.style.padding = '18px 20px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';

    const msg = document.createElement('div');
    msg.style.whiteSpace = 'pre-line';
    msg.style.color = '#111827';
    msg.style.fontSize = '14px';
    msg.style.lineHeight = '1.5';
    msg.textContent = String(message ?? '');

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '14px';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = '취소';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.border = '1px solid #d1d5db';
    cancelBtn.style.borderRadius = '8px';
    cancelBtn.style.background = '#fff';
    cancelBtn.style.color = '#111827';
    cancelBtn.style.cursor = 'pointer';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.textContent = '삭제';
    okBtn.style.padding = '8px 16px';
    okBtn.style.border = '1px solid #dc2626';
    okBtn.style.borderRadius = '8px';
    okBtn.style.background = '#dc2626';
    okBtn.style.color = '#fff';
    okBtn.style.cursor = 'pointer';

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(!!result);
    };

    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish(false);
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    box.appendChild(msg);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
};

function escapePatchHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safePatchUrl(url) {
  try {
    const parsed = new URL(String(url || ''), window.location.origin);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return parsed.href;
  } catch (e) {}
  return null;
}

function sanitizePatchContent(raw) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(raw || ''), 'text/html');
  const allowedTags = new Set(['A', 'B', 'BR', 'CODE', 'DIV', 'EM', 'I', 'LI', 'OL', 'P', 'PRE', 'SMALL', 'SPAN', 'STRONG', 'U', 'UL']);

  doc.body.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toUpperCase();
    if (!allowedTags.has(tag)) {
      el.replaceWith(doc.createTextNode(el.textContent || ''));
      return;
    }

    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '');
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }
      if (tag === 'A' && name === 'href') {
        const safe = safePatchUrl(value);
        if (safe) {
          el.setAttribute('href', safe);
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
        } else {
          el.removeAttribute(attr.name);
        }
        return;
      }
      if (tag === 'A' && name === 'title') return;
      el.removeAttribute(attr.name);
    });
  });

  return doc.body.innerHTML.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
}

const KST_TZ_PATCH = 'Asia/Seoul';
const formatPatchKstDate = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: KST_TZ_PATCH, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
};
if (typeof window !== 'undefined') {
  window.showAlert = showAlert;
  window.showConfirm = showConfirm;
}

let patchNoteLastFocus = null;
let patchNoteFocusGuardBound = false;
let patchNoteOpenPromise = null;
let patchNoteSavePromise = null;
let patchNoteDeletePromise = null;
let patchNoteListRevision = 0;
let patchNotePermissionRevision = 0;
let patchNotePermission = { state: 'unknown', allowed: false, client: null };
let patchNotePermissionRequest = null;
let patchNoteAuthClient = null;
let patchNoteAuthSubscription = null;
let patchNoteActor = null;
let patchDailyEditor = null;
function getPatchDailyEditor() {
  if(!patchDailyEditor && window.CoopDailyPatchNotes) patchDailyEditor=CoopDailyPatchNotes.create({
    area:'homepage',table:'sys_home_patch_note',client:patchNoteClient,allowed:isAdminUser,
    saving:()=>!!patchNoteSavePromise,confirm:message=>window.CoopDialog?.confirm(message)??Promise.resolve(false)
  });
  return patchDailyEditor;
}

function patchNoteClient() {
  return typeof _client === 'undefined' ? null : _client;
}

function updatePatchNoteControls() {
  const allowed = isAdminUser();
  document.getElementById('btnShowWrite')?.classList.toggle('hidden', !allowed);
  document.querySelectorAll('[data-home-patch-delete]').forEach(btn => {
    btn.classList.toggle('hidden', !allowed);
    btn.disabled = !allowed || !!patchNoteDeletePromise;
  });
  document.querySelectorAll('#patchWriteForm input, #patchWriteForm textarea').forEach(el => {
    el.disabled = !allowed;
  });
  const save = document.getElementById('btnSavePatchNote');
  if (save) save.disabled = !allowed || !!patchNoteSavePromise;
  const status = document.getElementById('patchPermissionStatus');
  if (status) status.classList.toggle('hidden', patchNotePermission.state !== 'error');
  patchDailyEditor?.stateChanged();
}

function invalidatePatchNotePermission() {
  patchDailyEditor?.pause();
  patchNotePermissionRevision++;
  patchNotePermissionRequest?.controller.abort();
  patchNotePermissionRequest = null;
  patchNotePermission = { state: 'unknown', allowed: false, client: null };
  updatePatchNoteControls();
}

function bindPatchNoteAuth(client) {
  if (patchNoteAuthClient === client) return;
  patchNoteAuthSubscription?.unsubscribe();
  invalidatePatchNotePermission();
  patchNoteAuthClient = client;
  patchNoteActor = null;
  patchNoteAuthSubscription = client?.auth.onAuthStateChange((event, session) => {
    // Do not call Supabase inside its Auth callback. Invalidate synchronously only.
    const actor = session?.user?.id || null;
    if (event !== 'INITIAL_SESSION' && (actor !== patchNoteActor ||
        ['SIGNED_OUT', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event))) {
      invalidatePatchNotePermission();
    }
    patchNoteActor = actor;
  })?.data?.subscription;
}

// A failed or stale read never grants access. Writes still pass the unchanged RLS.
function checkAdminPermission() {
  const client = patchNoteClient();
  bindPatchNoteAuth(client);
  if (window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ === false || !client) {
    invalidatePatchNotePermission();
    return Promise.resolve(false);
  }
  if (patchNotePermissionRequest) return patchNotePermissionRequest.promise;
  const revision = ++patchNotePermissionRevision;
  const controller = new AbortController();
  patchNotePermission = { state: 'loading', allowed: false, client };
  updatePatchNoteControls();
  const request = { controller, promise: null };
  let timer;
  request.promise = (async () => {
    try {
      const result = await Promise.race([
        (async () => {
          const { data, error } = await client.auth.getSession();
          if (error) throw error;
          if (!data?.session) return false;
          if (revision !== patchNotePermissionRevision) return false;
          patchNoteActor = data.session.user.id;
          const response = await client.rpc('home_patch_note_can_manage').abortSignal(controller.signal);
          if (response.error) throw response.error;
          return response.data === true;
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('permission-timeout')); }, 15000);
        })
      ]);
      if (revision !== patchNotePermissionRevision || client !== patchNoteClient()) return false;
      patchNotePermission = { state: 'ready', allowed: result, client };
      return result;
    } catch (_) {
      if (revision === patchNotePermissionRevision && client === patchNoteClient()) {
        patchNotePermission = { state: 'error', allowed: false, client };
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (patchNotePermissionRequest === request) patchNotePermissionRequest = null;
      updatePatchNoteControls();
    }
  })();
  patchNotePermissionRequest = request;
  return request.promise;
}

function isAdminUser() {
  return window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ !== false &&
    patchNotePermission.state === 'ready' && patchNotePermission.allowed === true &&
    patchNotePermission.client === patchNoteClient();
}

function ensurePatchNoteFocusGuard(modalEl) {
  if (!modalEl || patchNoteFocusGuardBound) return;
  patchNoteFocusGuardBound = true;

  const blurDismissTarget = (event) => {
    const target = event.currentTarget;
    if (target && typeof target.blur === 'function') {
      target.blur();
    }
  };

  modalEl.querySelectorAll('[data-bs-dismiss="modal"]').forEach((btn) => {
    btn.addEventListener('click', blurDismissTarget, true);
    btn.addEventListener('pointerdown', blurDismissTarget, true);
  });

  modalEl.addEventListener('show.bs.modal', () => {
    modalEl.removeAttribute('inert');
  });

  modalEl.addEventListener('shown.bs.modal', () => {
    const focusTarget =
      modalEl.querySelector('.btn-close') ||
      modalEl.querySelector('#btnShowWrite') ||
      modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  });

  modalEl.addEventListener('hide.bs.modal', () => {
    cancelPatchArchiveRead();
    invalidatePatchNotePermission();
    const active = document.activeElement;
    if (active && modalEl.contains(active) && typeof active.blur === 'function') {
      active.blur();
    }
    modalEl.setAttribute('inert', '');
  });

  modalEl.addEventListener('hidden.bs.modal', () => {
    const prev = patchNoteLastFocus;
    patchNoteLastFocus = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
      prev.focus();
    }
  });
}
/**
 * [File: patch_note.js]
 * 패치노트 UI 및 관리자 기능 (작성/삭제) 포함
 * 연결 테이블: sys_home_patch_note
 */


// 0. CSS 스타일 주입 (.hidden 클래스 처리)
// 부트스트랩 5에는 hidden 클래스가 없으므로 강제로 스타일을 넣어줍니다.
const style = document.createElement('style');
style.innerHTML = `
  .hidden { display: none !important; }
  .modal-dialog-scrollable .modal-body { overflow-y: auto; }
  #patchNoteModal[data-patch-view="archive"] #btnShowWrite { display:none !important; }
  #patchArchivePanel { word-break:keep-all; overflow-wrap:break-word; }
  #patchArchivePanel .patch-archive-copy { white-space:pre-wrap; font-size:.9rem; line-height:1.85; }
  #patchArchiveHeading:focus { outline:2px solid var(--bs-primary,#0d6efd); outline-offset:3px; }
`;
document.head.appendChild(style);

// 1. 모달 HTML (입력 폼 포함)
const patchNoteModalHTML = `
<div class="modal fade" id="patchNoteModal" tabindex="-1">
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header bg-dark text-white d-flex justify-content-between align-items-center">
        <div>
            <h5 class="modal-title m-0">🚀 업데이트 히스토리</h5>
        </div>
        <div class="d-flex gap-2">
            <button id="btnShowWrite" class="btn btn-sm btn-outline-light hidden" onclick="toggleWriteForm()">✏️ 작성·수정</button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
      </div>
      
      <div class="modal-body p-0">
        <div id="patchCurrentPanel">
        <div id="patchPermissionStatus" class="p-3 small hidden" role="status">
          작성 권한을 확인하지 못했습니다.
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="retryPatchNotePermission()">다시 확인</button>
        </div>
        <div id="patchWriteForm" class="bg-light p-3 border-bottom hidden">
            <p class="small text-muted mb-2">방문자·조합원에게 필요한 변화와 할 일을 적어 주세요. 작은 수정은 짧고 친근하게, 같은 표현은 반복하지 않아요.</p>
            <div id="patchDailyStatus" class="small text-muted mb-2" role="status"></div>
            <div class="row g-2 mb-2">
                <div class="col-4">
                    <input type="text" id="pnVersion" class="form-control form-control-sm" placeholder="v1.0.0">
                </div>
                <div class="col-5">
                    <input type="date" id="pnDate" class="form-control form-control-sm">
                </div>
                <div class="col-3 d-flex align-items-center">
                    <div class="form-check form-switch small">
                        <input class="form-check-input" type="checkbox" id="pnMajor">
                        <label class="form-check-label" for="pnMajor">중요</label>
                    </div>
                </div>
            </div>
            <input type="text" id="pnTitle" class="form-control form-control-sm mb-2" placeholder="예: 홈페이지에서 햇빛 퀴즈를 바로 시작할 수 있어요">
            <textarea id="pnContent" class="form-control form-control-sm mb-2" rows="4" placeholder="누가 이용할 수 있는지, 전에는 무엇이 불편했는지, 이제 어떻게 이용하는지 적어 주세요."></textarea>
            <div class="d-grid">
                <button type="button" id="btnSavePatchNote" class="btn btn-primary btn-sm" onclick="savePatchNote()">💾 저장</button>
            </div>
        </div>

        <div id="patchList" class="list-group list-group-flush">
            </div>
        </div>
        <section id="patchArchivePanel" class="hidden" aria-labelledby="patchArchiveHeading">
          <div class="p-3 border-bottom">
            <h6 id="patchArchiveHeading" class="fw-bold mb-2" tabindex="-1">📚 초기 패치노트 원문</h6>
            <p class="small text-muted mb-0">2025.12.02 ~ 2026.02.11에 작성된 기록이에요. 현재 이용 방법은 최근 업데이트를 확인해 주세요.</p>
          </div>
          <div id="patchArchiveStatus" class="p-3 small hidden" role="status" aria-live="polite"></div>
          <div id="patchArchiveList" class="list-group list-group-flush"></div>
        </section>
      </div>
      
      <div class="modal-footer bg-light py-1">
        <button type="button" id="btnPatchArchive" class="btn btn-outline-secondary btn-sm me-auto hidden" aria-controls="patchArchivePanel" aria-expanded="false">📚 지난 패치노트 보기</button>
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">닫기</button>
      </div>
    </div>
  </div>
</div>
`;

// HTML 주입 (body 맨 끝에 추가)
document.body.insertAdjacentHTML('beforeend', patchNoteModalHTML);

// Reviewed public homepage copy only; never expose the complete internal backup.
const PATCH_ARCHIVE_URL = '/assets/patch-notes/homepage-initial-20260211.json';
let patchArchiveVisible = false;
let patchArchiveCache = null;
let patchArchiveRead = null;
let patchArchiveRevision = 0;
let patchCurrentScroll = 0;
let patchArchiveScroll = 0;

function patchArchiveAvailable() {
  return window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ !== false &&
    ['www.yonginsolar.kr','yonginsolar.kr'].includes(window.location.hostname);
}

function cancelPatchArchiveRead() {
  patchArchiveRevision++;
  patchArchiveRead?.controller.abort();
  patchArchiveRead = null;
}

function renderPatchArchive(notes) {
  const list = document.getElementById('patchArchiveList');
  const fragment = document.createDocumentFragment();
  notes.forEach(note => {
    const card = document.createElement('article');
    card.className = 'list-group-item p-3';
    const meta = document.createElement('div');
    meta.className = 'small text-muted mb-2';
    const date = document.createElement('time');
    date.dateTime = note.release_date;
    date.textContent = note.release_date;
    const version = document.createElement('span');
    version.className = 'ms-2';
    version.textContent = 'v'+note.version;
    meta.append(date,version);
    const title = document.createElement('h6');
    title.className = 'patch-day-title fw-bold mb-2';
    title.textContent = note.title;
    const copy = document.createElement('div');
    copy.className = 'patch-archive-copy';
    copy.textContent = note.content;
    card.append(meta,title,copy);
    fragment.append(card);
  });
  list.replaceChildren(fragment);
}

function loadPatchArchive() {
  const modal = document.getElementById('patchNoteModal');
  if (!patchArchiveAvailable() || !patchArchiveVisible || !modal.classList.contains('show')) return Promise.resolve(false);
  if (patchArchiveRead) return patchArchiveRead.promise;
  const status = document.getElementById('patchArchiveStatus');
  if (patchArchiveCache) {renderPatchArchive(patchArchiveCache);status.classList.add('hidden');return Promise.resolve(true);}
  const epoch = ++patchArchiveRevision;
  const request = {controller:new AbortController(),promise:null};
  patchArchiveRead = request;
  status.classList.remove('hidden');
  status.textContent = '예전 소식을 꺼내고 있어요…';
  document.getElementById('patchArchiveList').replaceChildren();
  let timer;
  const current = () => epoch === patchArchiveRevision && patchArchiveVisible && patchArchiveAvailable() && modal.classList.contains('show');
  request.promise = (async () => {
    try {
      const timeout = new Promise((_,reject) => {timer=setTimeout(()=>{request.controller.abort();reject(new Error('archive-timeout'));},15000);});
      const data = await Promise.race([(async()=>{
        const response = await fetch(PATCH_ARCHIVE_URL,{credentials:'omit',signal:request.controller.signal});
        if(!response.ok)throw new Error('archive-read');
        return response.json();
      })(),timeout]);
      if(!current())return false;
      const keys=['version','release_date','title','content'];
      if(data?.formatVersion!==1 || data.area!=='homepage' || data.through!=='2026-02-11' || !Array.isArray(data.notes) || data.notes.length!==21 || data.notes.some(n=>
        !n || Object.keys(n).length!==4 || !keys.every(k=>typeof n[k]==='string') ||
        !/^\d{4}-\d{2}-\d{2}$/.test(n.release_date) || n.release_date<'2025-12-02' || n.release_date>'2026-02-11' ||
        !/^\d+(?:\.\d+){1,3}$/.test(n.version) || !n.title || n.title.length>500 || !n.content || n.content.length>20000
      ))throw new Error('archive-format');
      patchArchiveCache=data.notes.slice().sort((a,b)=>b.release_date.localeCompare(a.release_date)||b.version.localeCompare(a.version,undefined,{numeric:true}));
      renderPatchArchive(patchArchiveCache);
      status.classList.add('hidden');
      return true;
    } catch (_) {
      if(current()){
        status.replaceChildren(document.createTextNode('지난 패치노트를 불러오지 못했어요. '));
        const retry=document.createElement('button');retry.type='button';retry.className='btn btn-sm btn-outline-secondary';retry.textContent='다시 불러오기';retry.onclick=()=>{void loadPatchArchive();};status.append(retry);
      }
      return false;
    } finally {
      clearTimeout(timer);
      if(patchArchiveRead===request)patchArchiveRead=null;
    }
  })();
  return request.promise;
}

function setPatchArchiveView(show) {
  const modal=document.getElementById('patchNoteModal'),button=document.getElementById('btnPatchArchive');
  show=!!show&&patchArchiveAvailable();
  button.classList.toggle('hidden',!patchArchiveAvailable());
  if(show!==patchArchiveVisible){
    const body=modal.querySelector('.modal-body');
    if(show)patchCurrentScroll=body.scrollTop;else patchArchiveScroll=body.scrollTop;
    patchArchiveVisible=show;
    modal.dataset.patchView=show?'archive':'current';
    document.getElementById('patchCurrentPanel').classList.toggle('hidden',show);
    document.getElementById('patchArchivePanel').classList.toggle('hidden',!show);
    button.textContent=show?'← 최근 업데이트 보기':'📚 지난 패치노트 보기';
    button.setAttribute('aria-expanded',String(show));
    body.scrollTop=show?patchArchiveScroll:patchCurrentScroll;
    if(!show)cancelPatchArchiveRead();
    (show?document.getElementById('patchArchiveHeading'):button).focus({preventScroll:true});
  }
  return show?loadPatchArchive():Promise.resolve(false);
}
document.getElementById('btnPatchArchive').addEventListener('click',()=>{void setPatchArchiveView(!patchArchiveVisible);});

// ============================================================
// [로직] 데이터 로드 및 관리 (DB 테이블: sys_home_patch_note)
// ============================================================

// 1. 최신 버전 조회 (index.html 하단 표시용 - 필요 시 사용)
async function loadCurrentVersion() {
    if (window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ === false) return;
    if (typeof _client === 'undefined') return;

    // 테이블명 변경: sys_home_patch_note
    const { data, error } = await _client
        .from('sys_home_patch_note')
        .select('version')
        .order('release_date', { ascending: false }) // 날짜 최신순
        .order('id', { ascending: false })           // 같은 날짜면 ID 역순
        .limit(1)
        .single();
        
    if (data) {
        // index.html 등에 id="currentVersion" 인 태그가 있다면 버전 표시
        const verEl = document.getElementById("currentVersion");
        if(verEl) verEl.innerText = data.version;
    }
}

// 2. 패치노트 모달 열기
function openPatchModal() {
    if (window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ === false) return Promise.resolve();
    // 모달 요소 찾기
    const modalEl = document.getElementById('patchNoteModal');
    if (!modalEl) {
        console.error("패치노트 모달 HTML이 없습니다.");
        return Promise.resolve();
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    if (modalEl.classList.contains('show')) return Promise.resolve();
    if (patchNoteOpenPromise) return patchNoteOpenPromise;

    patchNoteOpenPromise = (async () => {
        patchNoteLastFocus = document.activeElement;
        ensurePatchNoteFocusGuard(modalEl);
        setPatchArchiveView(false);

        // 관리자 체크 (작성 버튼 표시 여부)
        void checkAdminPermission();

        // 작성 폼 초기화 (숨김 처리 및 오늘 날짜 세팅)
        const formEl = document.getElementById("patchWriteForm");
        if(formEl) formEl.classList.add("hidden");

        const dateEl = document.getElementById("pnDate");
        if(dateEl && !dateEl.value) dateEl.value = formatPatchKstDate();

        // 리스트 로딩
        await loadPatchList();
        updatePatchNoteControls();

        // 모달 띄우기
        if (!modalEl.classList.contains('show')) modal.show();
    })().finally(() => {
        patchNoteOpenPromise = null;
    });

    return patchNoteOpenPromise;
}

// 3. 리스트 불러오기
async function loadPatchList() {
    if (window.__PUBLIC_HOME_PATCH_NOTES_ENABLED__ === false) return;
    const listEl = document.getElementById("patchList");
    if (!listEl) return;
    const revision = ++patchNoteListRevision;
    const client = patchNoteClient();
    if (!client) return;
    
    // 로딩 스피너
    listEl.innerHTML = '<div class="p-4 text-center"><div class="spinner-border text-primary"></div></div>';

    // 테이블명 변경: sys_home_patch_note
    const { data, error } = await client
        .from('sys_home_patch_note')
        .select('*')
        .order('release_date', { ascending: false })
        .order('id', { ascending: false });
    if (revision !== patchNoteListRevision || client !== patchNoteClient()) return;
        
    if (error) {
        console.error("패치노트 로딩 에러:", error);
        listEl.innerHTML = '<div class="p-4 text-center text-danger">데이터를 불러오지 못했습니다.</div>';
        return;
    }
        
    if (!data || data.length === 0) {
        listEl.innerHTML = '<div class="p-4 text-center text-muted">등록된 업데이트 내역이 없습니다.</div>';
        return;
    }
    
    // 관리자 여부 (삭제 버튼 표시용)

    listEl.innerHTML = data.map(note => {
        const contentHtml = sanitizePatchContent(note.content || '');
        const safeVersion = escapePatchHtml(note.version || '');
        const safeReleaseDate = escapePatchHtml(note.release_date || '');
        const safeTitle = escapePatchHtml(note.title || '');
        const safeNoteId = Number.isFinite(Number(note.id)) ? Number(note.id) : null;
        
        // 메이저 업데이트 뱃지
        const badge = note.is_major 
            ? '<span class="badge bg-success-subtle text-success-emphasis ms-2">중요 안내</span>'
            : '';
        
        // 삭제 버튼 (관리자만)
        const delBtn = (safeNoteId !== null)
            ? `<button data-home-patch-delete class="btn btn-outline-danger btn-sm py-0 ms-auto hidden" style="font-size:0.7rem;" onclick="deletePatchNote(${safeNoteId})">삭제</button>`
            : '';

        return `
            <div class="list-group-item p-3">
                <div class="d-flex w-100 align-items-center mb-2">
                    <time class="small text-muted" datetime="${safeReleaseDate}">${safeReleaseDate}</time>
                    ${badge}<small class="text-muted ms-2">v${safeVersion.replace(/^v/i,'')}</small>
                    ${delBtn}
                </div>
                <h6 class="fw-bold mb-2 patch-day-title">${safeTitle}</h6>
                <div class="mb-1 small patch-day-copy">${contentHtml}</div>
            </div>
        `;
    }).join("");
    updatePatchNoteControls();
}

// 4. 새 패치노트 저장 (관리자용)
function savePatchNote() {
    if (patchNoteSavePromise) return patchNoteSavePromise;

    const version = document.getElementById("pnVersion").value;
    const date = document.getElementById("pnDate").value;
    const title = document.getElementById("pnTitle").value;
    const content = document.getElementById("pnContent").value;
    const isMajor = document.getElementById("pnMajor").checked;

    if(!version || !title || !content) {
        showAlert("내용을 모두 입력해주세요.");
        return Promise.resolve();
    }

    const saveButton = document.getElementById('btnSavePatchNote');
    const originalLabel = saveButton?.textContent || '💾 저장 및 배포';

    patchNoteSavePromise = (async () => {
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.setAttribute('aria-busy', 'true');
            saveButton.textContent = '저장 중…';
        }

        if (!await checkAdminPermission()) return;
        const revision = patchNotePermissionRevision;
        const client = patchNoteClient();
        const editor=getPatchDailyEditor();
        if(!editor){showAlert('작성 도구를 불러오지 못했습니다. 화면을 다시 열어 주세요.');return;}
        const { error } = await editor.save({
            version: version,
            release_date: date,
            title: title,
            content: content,
            is_major: isMajor
        });
        if (revision !== patchNotePermissionRevision || client !== patchNoteClient()) return;

        if(error) {
            showAlert(editor.message(error));
        } else {
            showAlert("저장했습니다.");
            // Keep any additional editing performed while the save was pending.
            if (document.getElementById('pnVersion').value === version &&
                document.getElementById('pnDate').value === date &&
                document.getElementById('pnTitle').value === title &&
                document.getElementById('pnContent').value === content &&
                document.getElementById('pnMajor').checked === isMajor) {
              document.getElementById("pnVersion").value = "";
              document.getElementById("pnTitle").value = "";
              document.getElementById("pnContent").value = "";
              document.getElementById("patchWriteForm").classList.add("hidden");
            }

            // 리스트 새로고침
            await loadPatchList();
            loadCurrentVersion();
        }
    })().catch(() => {
        showAlert('저장 결과를 확인하지 못했습니다. 목록을 확인해 주세요.');
    }).finally(() => {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.removeAttribute('aria-busy');
            saveButton.textContent = originalLabel;
        }
        patchNoteSavePromise = null;
        updatePatchNoteControls();
    });

    return patchNoteSavePromise;
}

// 5. 패치노트 삭제 (관리자용)
function deletePatchNote(id) {
    if (patchNoteDeletePromise) return patchNoteDeletePromise;
    patchNoteDeletePromise = (async () => {
    if (!Number.isSafeInteger(id) || !await checkAdminPermission()) return;
    const revision = patchNotePermissionRevision;
    const ok = await showConfirm("이 패치 내역을 삭제하시겠습니까? (복구 불가)");
    if(!ok || revision !== patchNotePermissionRevision || !await checkAdminPermission()) return;
    const client = patchNoteClient();
    const writeRevision = patchNotePermissionRevision;
    const { error } = await client
        .from('sys_home_patch_note')
        .delete()
        .eq('id', id);
    if (writeRevision !== patchNotePermissionRevision || client !== patchNoteClient()) return;
    
    if(error) {
        showAlert("삭제 실패: " + error.message);
    } else {
        await loadPatchList(); // 리스트 갱신
    }
    })().catch(() => {
        showAlert('삭제 결과를 확인하지 못했습니다. 목록을 확인해 주세요.');
    }).finally(() => {
        patchNoteDeletePromise = null;
        updatePatchNoteControls();
    });
    updatePatchNoteControls();
    return patchNoteDeletePromise;
}

async function retryPatchNotePermission() {
    await checkAdminPermission();
}

async function toggleWriteForm() {
    const form = document.getElementById("patchWriteForm");
    if (!form) return;
    if (!form.classList.contains('hidden')) { form.classList.add('hidden'); return; }
    if (await checkAdminPermission()) {
      const editor=getPatchDailyEditor();
      if(!editor){showAlert('작성 도구를 불러오지 못했습니다. 화면을 다시 열어 주세요.');return;}
      form.classList.remove('hidden');await editor.open();
    }
}

// 페이지 로드 시 최신 버전 체크 (선택 사항)
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(loadCurrentVersion, 500);
});
