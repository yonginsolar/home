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
            <button id="btnShowWrite" class="btn btn-sm btn-outline-light hidden" onclick="toggleWriteForm()">✏️ 작성</button>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
        </div>
      </div>
      
      <div class="modal-body p-0">
        <div id="patchWriteForm" class="bg-light p-3 border-bottom hidden">
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
                        <label class="form-check-label" for="pnMajor">Major</label>
                    </div>
                </div>
            </div>
            <input type="text" id="pnTitle" class="form-control form-control-sm mb-2" placeholder="패치 제목 (예: 급여 연동 기능 추가)">
            <textarea id="pnContent" class="form-control form-control-sm mb-2" rows="4" placeholder="상세 내용 (HTML 태그 사용 가능)&#13;&#10;- 기능 A 추가&#13;&#10;- 버그 B 수정"></textarea>
            <div class="d-grid">
                <button class="btn btn-primary btn-sm" onclick="savePatchNote()">💾 저장 및 배포</button>
            </div>
        </div>

        <div id="patchList" class="list-group list-group-flush">
            </div>
      </div>
      
      <div class="modal-footer bg-light py-1">
        <small class="text-muted me-auto" style="font-size:0.75rem;">지속적으로 발전하는 시스템이 되겠습니다.</small>
        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">닫기</button>
      </div>
    </div>
  </div>
</div>
`;

// HTML 주입 (body 맨 끝에 추가)
document.body.insertAdjacentHTML('beforeend', patchNoteModalHTML);

// ============================================================
// [로직] 데이터 로드 및 관리 (DB 테이블: sys_home_patch_note)
// ============================================================

// 1. 최신 버전 조회 (index.html 하단 표시용 - 필요 시 사용)
async function loadCurrentVersion() {
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
async function openPatchModal() {
    // 모달 요소 찾기
    const modalEl = document.getElementById('patchNoteModal');
    if (!modalEl) {
        console.error("패치노트 모달 HTML이 없습니다.");
        return;
    }
    const modal = new bootstrap.Modal(modalEl);
    
    // 관리자 체크 (작성 버튼 표시 여부)
    checkAdminPermission();
    
    // 작성 폼 초기화 (숨김 처리 및 오늘 날짜 세팅)
    const formEl = document.getElementById("patchWriteForm");
    if(formEl) formEl.classList.add("hidden");
    
    const dateEl = document.getElementById("pnDate");
    if(dateEl) dateEl.valueAsDate = new Date();

    // 리스트 로딩
    await loadPatchList();
    
    // 모달 띄우기
    modal.show();
}

// 3. 리스트 불러오기
async function loadPatchList() {
    const listEl = document.getElementById("patchList");
    if (!listEl) return;
    
    // 로딩 스피너
    listEl.innerHTML = '<div class="p-4 text-center"><div class="spinner-border text-primary"></div></div>';

    // 테이블명 변경: sys_home_patch_note
    const { data, error } = await _client
        .from('sys_home_patch_note')
        .select('*')
        .order('release_date', { ascending: false })
        .order('id', { ascending: false });
        
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
    const isAdmin = isAdminUser();

    listEl.innerHTML = data.map(note => {
        // 줄바꿈 처리 (\n -> <br>)
        const contentHtml = note.content ? note.content.replace(/\\n/g, '<br>').replace(/\n/g, '<br>') : '';
        
        // 메이저 업데이트 뱃지
        const badge = note.is_major 
            ? '<span class="badge bg-danger ms-2">Major Update</span>' 
            : '<span class="badge bg-secondary ms-2">Patch</span>';
        
        // 삭제 버튼 (관리자만)
        const delBtn = isAdmin 
            ? `<button class="btn btn-outline-danger btn-sm py-0 ms-auto" style="font-size:0.7rem;" onclick="deletePatchNote(${note.id})">삭제</button>` 
            : '';

        return `
            <div class="list-group-item p-3">
                <div class="d-flex w-100 align-items-center mb-2">
                    <h6 class="mb-0 fw-bold text-primary">${note.version} ${badge}</h6>
                    <small class="text-muted ms-2">${note.release_date}</small>
                    ${delBtn}
                </div>
                <h6 class="fw-bold mb-2">${note.title}</h6>
                <p class="mb-1 small text-secondary" style="line-height: 1.6;">${contentHtml}</p>
            </div>
        `;
    }).join("");
}

// 4. 새 패치노트 저장 (관리자용)
async function savePatchNote() {
    const version = document.getElementById("pnVersion").value;
    const date = document.getElementById("pnDate").value;
    const title = document.getElementById("pnTitle").value;
    const content = document.getElementById("pnContent").value;
    const isMajor = document.getElementById("pnMajor").checked;

    if(!version || !title || !content) return alert("내용을 모두 입력해주세요.");

    // 테이블명 변경: sys_home_patch_note
    const { error } = await _client.from('sys_home_patch_note').insert({
        version: version,
        release_date: date,
        title: title,
        content: content,
        is_major: isMajor
    });

    if(error) {
        alert("저장 실패: " + error.message);
        console.error(error);
    } else {
        alert("업데이트 되었습니다!");
        // 입력창 초기화
        document.getElementById("pnVersion").value = "";
        document.getElementById("pnTitle").value = "";
        document.getElementById("pnContent").value = "";
        document.getElementById("patchWriteForm").classList.add("hidden"); // 폼 닫기
        
        // 리스트 새로고침
        await loadPatchList();
        loadCurrentVersion(); 
    }
}

// 5. 패치노트 삭제 (관리자용)
async function deletePatchNote(id) {
    if(!confirm("이 패치 내역을 삭제하시겠습니까? (복구 불가)")) return;
    
    // 테이블명 변경: sys_home_patch_note
    const { error } = await _client
        .from('sys_home_patch_note')
        .delete()
        .eq('id', id);
    
    if(error) {
        alert("삭제 실패: " + error.message);
    } else {
        await loadPatchList(); // 리스트 갱신
    }
}

// [Helper] 관리자 권한 체크 및 UI 제어
function checkAdminPermission() {
    const btn = document.getElementById("btnShowWrite");
    if(!btn) return;
    
    if(isAdminUser()) {
        btn.classList.remove("hidden");
    } else {
        btn.classList.add("hidden");
    }
}

function isAdminUser() {
    // localStorage에서 사용자 정보 확인
    const userStr = localStorage.getItem('erp_user');
    if(!userStr) return false;
    
    try {
        const user = JSON.parse(userStr);
        // 국장, 관리자, 이사, 이사장 직함이 있으면 관리자로 인정
        return (user.role === 'admin' || user.position === '국장' || user.position === '이사' || user.position === '이사장');
    } catch (e) {
        return false;
    }
}

function toggleWriteForm() {
    const form = document.getElementById("patchWriteForm");
    if (form) {
        form.classList.toggle("hidden");
    }
}

// 페이지 로드 시 최신 버전 체크 (선택 사항)
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(loadCurrentVersion, 500);
});
