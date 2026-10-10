/* Homepage-only functions; shared state and server gates stay in admin_member_core.js. */
(function (root) {
    if (root.AdminMemberSite?.version === '20261010-3') return;
function normalizeHistoryContentForCompare(value) {
    return String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li>/gi, '- ')
        .replace(/<ul[^>]*>/gi, '')
        .replace(/<\/ul>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{2,}/g, '\n')
        .trim();
}

function isHistoryRowMatched(saved, expected) {
    if (!saved) return false;
    const savedDate = String(saved.event_date || '').slice(0, 10);
    const expectedDate = String(expected.date || '').slice(0, 10);
    const savedTitle = String(saved.title || '').trim();
    const expectedTitle = String(expected.title || '').trim();
    const savedContent = normalizeHistoryContentForCompare(saved.content || '');
    const expectedContent = normalizeHistoryContentForCompare(expected.content || '');
    return savedDate === expectedDate && savedTitle === expectedTitle && savedContent === expectedContent;
}

function updateSiteHistoryContentCounter() {
    const content = document.getElementById('hist-content')?.value || '';
    const counter = document.getElementById('hist-content-count');
    if (!counter) return;
    counter.textContent = `${content.length}자`;
    counter.classList.toggle('text-warning', content.length > 120);
    counter.classList.toggle('fw-bold', content.length > 120);
}

async function openSiteHistoryModal(id) {
    currentHistoryEditId = id || null;
    document.getElementById('hist-id').value = currentHistoryEditId || '';

    if (currentHistoryEditId) {
        const { data } = await scopeAdminTenant(_supabase.from('site_documents').select('*')).eq('id', currentHistoryEditId).single();
        if (data) {
            document.getElementById('hist-date').value = data.event_date;
            document.getElementById('hist-title').value = data.title;

            // ★ [핵심] DB의 HTML 태그를 사람이 보기 편한 텍스트로 복원
            let rawText = data.content || '';
            rawText = rawText.replaceAll('<br>', '\n');      // 줄바꿈 복원
            rawText = rawText.replaceAll('<ul>', '');        // 리스트 태그 제거
            rawText = rawText.replaceAll('</ul>', '');
            rawText = rawText.replaceAll('<ul class="my-1">', '');
            rawText = rawText.replace(/<li>/g, '- ');        // <li>를 '- '로 변환
            rawText = rawText.replace(/<\/li>/g, '\n');      // </li>를 줄바꿈으로
            rawText = rawText.replace(/\n\s*\n/g, '\n');     // 중복 줄바꿈 제거

            document.getElementById('hist-content').value = rawText.trim();
        }
    } else {
        // 신규 등록 시 초기화
        document.getElementById('hist-title').value = '';
        document.getElementById('hist-content').value = '';
        // 날짜는 오늘 날짜로 기본 세팅
        document.getElementById('hist-date').value = getAdminMemberKstDateString();
    }

    updateSiteHistoryContentCounter();

    // HTML 모달 ID는 기존 그대로 'historyModal' 사용
    bootstrap.Modal.getOrCreateInstance(document.getElementById('historyModal')).show();
}

async function saveSiteHistory() {
    if (isSavingSiteHistory) return;

    const idFromInput = (document.getElementById('hist-id').value || '').trim();
    const effectiveId = currentHistoryEditId || idFromInput || null;
    const dateValue = document.getElementById('hist-date').value;
    const titleValue = (document.getElementById('hist-title').value || '').trim();
    const contentValue = document.getElementById('hist-content').value || '';

    if (!dateValue) return myAlert('날짜를 입력하세요.', 'warning');
    if (!titleValue) return myAlert('제목을 입력하세요.', 'warning');

    const updates = {
        p_id: effectiveId,
        p_date: dateValue,
        p_title: titleValue,
        p_content: contentValue
    };

    isSavingSiteHistory = true;
    showLoading(true);

    try {
        // 연혁은 전용 RPC 사용 (문서 RPC보다 권한 조건 영향이 적음)
        const { error } = await _supabase.rpc('upsert_history_secure', updates);
        if (error) {
            CoopSafeLog.error("[saveSiteHistory] RPC error:", error);
            const msg = [error.message, error.code ? `(code: ${error.code})` : '', error.hint ? `힌트: ${error.hint}` : '']
                .filter(Boolean)
                .join(' ');
            myAlert('저장 실패: ' + msg, 'error');
            return;
        }

        // 수정 모드에서는 저장 반영 여부를 재확인
        if (effectiveId) {
            let saved = null;
            let verifyError = null;
            for (let i = 0; i < 3; i += 1) {
                const result = await scopeAdminTenant(_supabase
                    .from('site_documents')
                    .select('id, event_date, title, content'))
                    .eq('id', effectiveId)
                    .eq('category', 'history')
                    .maybeSingle();
                saved = result.data || null;
                verifyError = result.error || null;

                if (!verifyError && isHistoryRowMatched(saved, { date: dateValue, title: titleValue, content: contentValue })) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 180));
            }

            if (verifyError || !saved) {
                myAlert('저장 후 조회가 실패했습니다. 잠시 후 다시 시도해주세요.', 'warning');
                return;
            }

            if (!isHistoryRowMatched(saved, { date: dateValue, title: titleValue, content: contentValue })) {
                myAlert('서버에서 수정을 반영하지 않았습니다. (권한/함수 조건 확인 필요)', 'warning');
                return;
            }
        }

        bootstrap.Modal.getOrCreateInstance(document.getElementById('historyModal')).hide();
        currentHistoryEditId = null;
        await fetchHistory(); // 목록 새로고침
        myAlert('저장되었습니다.');
    } finally {
        isSavingSiteHistory = false;
        showLoading(false);
    }
}

async function openSectionSettings() {
if (hasPendingSectionChanges() || g_sectionSaving) { renderSectionRows(); return; }
try { await fetchSections(); }
catch (error) {
CoopSafeLog.error('섹션 로딩 실패:', error);
renderSectionSeedHint('섹션 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
}
}

async function loadInitialSiteSections() {
if (g_siteInitialSectionsRequested || ADMIN_MEMBER_PAGE_SCOPE === 'documents_admin' || hasPendingSectionChanges()) return;
const params = new URLSearchParams(window.location.search || '');
// These links load their own active pane; do not fetch an unrelated section list.
if (getInitialAdminMemberTab() === 'site' && ['activities', 'plants'].includes(params.get('sub'))) return;
const activePane = document.querySelector('#tab-site .tab-content > .tab-pane.show.active');
if (activePane?.id !== 'sub-sections') return;
g_siteInitialSectionsRequested = true;
try {
if (await fetchSections() === false) g_siteInitialSectionsRequested = false;
} catch (error) {
g_siteInitialSectionsRequested = false;
CoopSafeLog.error('섹션 초기 로딩 실패:', error);
renderSectionSeedHint('섹션 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
}
}

function getSectionDisplayOrder(section) {
const order = Number(section?.display_order);
if (Number.isFinite(order) && order > 0) return order;
if (Object.prototype.hasOwnProperty.call(SECTION_VISUAL_ORDER, section?.id)) {
return SECTION_VISUAL_ORDER[section.id];
}
return 9999;
}

function createSectionSnapshot(list = []) {
return [...list]
.map((section) => ({
id: String(section?.id || '').trim(),
display_order: getSectionDisplayOrder(section),
is_visible: section?.is_visible === true
}))
.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function createSectionExpectedSnapshot(list = []) {
return list.map(section => ({
id: String(section.id),
display_order: section.display_order ?? null,
is_visible: section.is_visible ?? null
}));
}

function hasPendingSectionChanges() {
const source = JSON.stringify(createSectionSnapshot(g_siteSections));
const draft = JSON.stringify(createSectionSnapshot(g_sectionDrafts));
return source !== draft;
}

function updateSectionSaveButton() {
const btn = document.getElementById('btnSaveSectionChanges');
if (!btn) return;
const dirty = hasPendingSectionChanges();
btn.disabled = !dirty || g_sectionSaving;
btn.classList.toggle('btn-primary', dirty);
btn.classList.toggle('btn-outline-secondary', !dirty);
const reload = document.getElementById('btnReloadSectionSettings');
if (reload) reload.disabled = g_sectionSaving;
const seed = document.getElementById('btnSeedRequiredSections');
if (seed) seed.disabled = g_sectionSaving;
}

function getSortedSectionDrafts() {
return [...(Array.isArray(g_sectionDrafts) ? g_sectionDrafts : [])].sort((a, b) => {
const aOrder = getSectionDisplayOrder(a);
const bOrder = getSectionDisplayOrder(b);
if (aOrder !== bOrder) return aOrder - bOrder;
return String(a.id || '').localeCompare(String(b.id || ''));
});
}

function renderSectionRows() {
const tbody = document.getElementById('sectionListBody');
if (!tbody) return;
const sortedSections = getSortedSectionDrafts();
tbody.innerHTML = sortedSections.map((sec, sectionIndex) => {
const safeSectionIdArg = escapeJsString(sec.id || '');
const checkedAttr = sec.is_visible ? 'checked' : '';
const statusBadge = sec.is_visible
? '<span class="badge bg-success">공개중</span>'
: '<span class="badge bg-secondary">숨김</span>';

const sectionDisplayNames = { hero:'메인 배너', about:'조합 소개', activities:'우리 소식', partners:'함께하는 단체', faq:'자주 묻는 질문', documents:'정보 공개' };
const sectionDisplayName = isAdminMemberSiteProfile() && sec.id === 'impact'
? '조합원·출자금 현황'
: (sectionDisplayNames[sec.id] || sec.name || '');
const editorTarget = getSiteSectionEditorTarget(sec.id);
const contentActions = `<div class="site-section-editor-actions">${editorTarget ? `<button type="button" class="btn btn-sm btn-outline-primary" onclick="openSiteSectionEditor('${safeSectionIdArg}')">내용 수정</button>` : ''}<button type="button" class="btn btn-sm btn-outline-secondary" onclick="openHomePreview('${safeSectionIdArg}')">미리보기</button></div>`;
const moveControls = `
<div class="btn-group btn-group-sm section-order-controls" role="group" aria-label="${escapeHtml(sectionDisplayName)} 순서">
  <button type="button" class="btn btn-outline-secondary" aria-label="${escapeHtml(sectionDisplayName)} 위로" ${g_sectionSaving || sectionIndex <= 0 ? 'disabled' : ''} onclick="moveSectionOrder('${safeSectionIdArg}', -1)">↑</button>
  <button type="button" class="btn btn-outline-secondary" aria-label="${escapeHtml(sectionDisplayName)} 아래로" ${g_sectionSaving || sectionIndex >= sortedSections.length - 1 ? 'disabled' : ''} onclick="moveSectionOrder('${safeSectionIdArg}', 1)">↓</button>
</div>
`;

return `
                   <tr>
                       <td class="align-middle text-center">${sectionIndex + 1}</td>
                       <td class="align-middle text-start ps-4">
                           <span class="fw-bold text-dark">${escapeHtml(sectionDisplayName)}</span>
                       </td>
                       <td class="align-middle text-center">${statusBadge}</td>
                       <td class="align-middle text-center">
                           <div class="section-manage-controls">
                           ${moveControls}
                           <div class="form-check form-switch section-visibility-switch">
                               <input class="form-check-input" type="checkbox" role="switch"
                                   aria-label="${escapeHtml(sectionDisplayName)} 공개"
                                   style="cursor: pointer;"
                                   ${checkedAttr} ${g_sectionSaving ? 'disabled' : ''}
                                   onchange="toggleSection('${safeSectionIdArg}', this.checked)">
                           </div>
                           </div>
                       </td>
                       <td class="align-middle">${contentActions}</td>
                   </tr>
               `;
}).join('') || '<tr><td colspan="5" class="text-center py-3">등록된 표시 영역이 없습니다.</td></tr>';

updateSectionSaveButton();
queueHomePreviewUpdate();
}

function renderSectionSeedHint(message = '', isWarning = true) {
const hintEl = document.getElementById('sectionSeedHint');
if (!hintEl) return;
if (!message) {
hintEl.classList.add('hidden');
hintEl.textContent = '';
return;
}
hintEl.classList.remove('hidden');
hintEl.classList.toggle('alert-warning', !!isWarning);
hintEl.classList.toggle('alert-success', !isWarning);
hintEl.textContent = message;
}

function renderSectionSeedButton(missingSections = []) {
const btn = document.getElementById('btnSeedRequiredSections');
if (!btn) return;
const labels = Array.isArray(missingSections)
? missingSections.map((sec) => String(sec?.name || '').trim()).filter(Boolean)
: [];
btn.classList.toggle('hidden', labels.length === 0);
if (labels.length > 0) {
btn.innerHTML = `<i class="bi bi-plus-circle me-1"></i>누락 섹션 등록 (${escapeHtml(labels.join(', '))})`;
}
}

async function fetchSections(options = {}) {
if (g_sectionLoadPromise) {
const result = await g_sectionLoadPromise;
return options.replaceDrafts ? fetchSections(options) : result;
}
g_sectionLoadPromise = loadSectionRows(options);
try {
return await g_sectionLoadPromise;
} finally {
g_sectionLoadPromise = null;
}
}

async function loadSectionRows(options = {}) {
if (hasPendingSectionChanges() && !options.replaceDrafts) return true;
const draftAtStart = JSON.stringify(createSectionSnapshot(g_sectionDrafts));
const revisionAtStart = g_sectionReadRevision;
const startedAt = performance.now();
// DB에서 순서대로 가져옴
const { data, error } = await scopeAdminTenant(_supabase
.from('site_sections')
.select('id,name,display_order,is_visible'))
.order('display_order');

if (error) {
CoopSafeLog.error("섹션 로딩 에러:", error);
renderSectionSeedHint('섹션 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.', true);
return false;
}
// A response begun before a local edit must not replace that edit.
if (revisionAtStart !== g_sectionReadRevision || draftAtStart !== JSON.stringify(createSectionSnapshot(g_sectionDrafts))) return false;
const applied = applySectionRows(data);
const body = document.getElementById('sectionListBody');
if (body) body.dataset.loadMs = String(Math.round(performance.now() - startedAt));
return applied;
}

function applySectionRows(data) {
if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) {
throw new Error('SECTION_RESPONSE_INVALID');
}
g_sectionReadRevision++;

const visibleData = (Array.isArray(data) ? data : []).filter((section) => !isSiteMemberRemovedSection(section?.id));
const requiredSections = getRequiredSiteSectionsForCurrentProfile();
const tbody = document.getElementById('sectionListBody');
tbody.innerHTML = '';
renderSectionSeedHint('', true);

if (visibleData.length === 0) {
g_siteSections = [];
g_sectionDrafts = [];
updateSectionSaveButton();
tbody.innerHTML = '<tr><td colspan="5" class="text-center py-3">섹션 정보가 없습니다.</td></tr>';
renderSectionSeedButton(requiredSections);
renderSectionSeedHint('등록된 홈페이지 섹션이 없습니다. 먼저 누락 섹션 등록을 눌러 주세요.', true);
g_siteInitialSectionsRequested = true;
return true;
}

const sortedSections = [...visibleData].sort((a, b) => {
const aOrder = getSectionDisplayOrder(a);
const bOrder = getSectionDisplayOrder(b);
if (aOrder !== bOrder) return aOrder - bOrder;
return String(a.id || '').localeCompare(String(b.id || ''));
});

g_siteSections = sortedSections;
g_sectionDrafts = sortedSections.map((sec) => ({ ...sec, display_order: getSectionDisplayOrder(sec), is_visible: sec.is_visible === true }));

const missingRequiredSections = requiredSections.filter((requiredSec) => (
!sortedSections.some((sec) => sec && sec.id === requiredSec.id)
));
renderSectionSeedButton(missingRequiredSections);
if (missingRequiredSections.length > 0) {
const missingNames = missingRequiredSections.map((sec) => sec.name).join(', ');
renderSectionSeedHint(`${missingNames} 섹션이 아직 등록되지 않았습니다. 우측 버튼으로 등록해 주세요.`, true);
}
renderSectionRows();
g_siteInitialSectionsRequested = true;
if (ADMIN_MEMBER_PAGE_SCOPE !== 'documents_admin') void fetchHomeSettings();
return true;
}

async function reloadSectionSettings(discardChanges = false) {
if (g_sectionSaving) return;
if (hasPendingSectionChanges() && !discardChanges) {
myConfirm('작성 중인 섹션 변경사항을 버리고 최신 설정을 불러올까요?', () => reloadSectionSettings(true));
return;
}
g_sectionSaving = true;
g_sectionReadRevision++;
renderSectionRows();
try { await fetchSections({ replaceDrafts: true }); }
catch (error) { renderSectionSeedHint('설정을 불러오지 못했습니다. 입력은 그대로 남아 있습니다. 다시 시도해 주세요.', true); }
finally { g_sectionSaving = false; renderSectionRows(); }
}

function showSectionSaveError(error) {
            const conflict = ['PT409','40001'].includes(error?.code) || error?.message === 'SECTION_CHANGED_RELOAD_REQUIRED';
const message = conflict
? '다른 화면에서 설정이 변경되었습니다. 작성한 내용은 그대로 남겨 두었습니다. 최신 설정 불러오기를 누른 뒤 다시 확인해 주세요.'
: '저장 결과를 확인하지 못했습니다. 작성한 내용은 그대로 남겨 두었습니다. 다시 저장하거나 최신 설정을 불러와 확인해 주세요.';
renderSectionSeedHint(message, true);
myAlert(message, 'warning');
}

async function seedRequiredSections() {
if (g_sectionSaving) return;
if (hasPendingSectionChanges()) { myAlert('작성 중인 섹션 변경사항을 먼저 저장해 주세요.', 'warning'); return; }
if (!g_siteInitialSectionsRequested) { myAlert('섹션 목록을 먼저 불러온 뒤 다시 시도해 주세요.', 'warning'); return; }
const missing = getRequiredSiteSectionsForCurrentProfile().filter(section => !g_siteSections.some(row => row.id === section.id));
if (!missing.length) return;
g_sectionSaving = true;
g_sectionReadRevision++;
renderSectionRows();
renderSectionSeedHint('', true);
const btn = document.getElementById('btnSeedRequiredSections');
if (btn) btn.disabled = true;

try {
const coopAtStart = g_adminMemberRuntime?.coop_id;
const { data, error } = await _supabase.rpc('seed_site_sections_atomic', { p_sections: missing });
if (coopAtStart !== g_adminMemberRuntime?.coop_id) return;
if (error) { showSectionSaveError(error); return; }
applySectionRows(data?.sections);
renderSectionSeedHint('누락된 홈페이지 섹션이 등록되었습니다. 이제 ON/OFF 스위치를 사용할 수 있습니다.', false);
} catch (e) {
showSectionSaveError(e);
} finally {
g_sectionSaving = false;
renderSectionRows();
if (btn) btn.disabled = false;
}
}

async function moveSectionOrder(id, direction) {
if (g_sectionSaving) return;
const currentSections = getSortedSectionDrafts();
const fromIndex = currentSections.findIndex((section) => section && section.id === id);
const toIndex = fromIndex + Number(direction || 0);
if (fromIndex < 0 || toIndex < 0 || toIndex >= currentSections.length) return;

// Equal legacy order numbers cannot be swapped. Move the row in the actual
// sorted list, then assign unambiguous order numbers only after a user move.
const [moved] = currentSections.splice(fromIndex, 1);
currentSections.splice(toIndex, 0, moved);
g_sectionDrafts = currentSections.map((section, index) => ({ ...section, display_order: index + 1 }));
// Manual order must not be masked by a template's recommended layout.
const layout = document.getElementById('site-home-layout-mode');
if (layout && getSiteEditorDraft('home').refresh().loaded && layout.value === 'designed') {
layout.value = 'existing';
layout.dispatchEvent(new Event('change', { bubbles:true }));
}
renderSectionRows();
}

function toggleSection(id, isVisible) {
if (g_sectionSaving) return;
const target = g_sectionDrafts.find((section) => section && section.id === id);
if (!target) return;
target.is_visible = !!isVisible;
if (id === 'impact') g_homePreviewImpactSource = 'sections';
renderSectionRows();
}

async function saveSectionChanges() {
if (g_sectionSaving || !hasPendingSectionChanges()) return;
g_sectionSaving = true;
g_sectionReadRevision++;
renderSectionRows();

try {
const drafts = getSortedSectionDrafts().map(section => ({ ...section }));
const coopAtStart = g_adminMemberRuntime?.coop_id;
const { data, error } = await _supabase.rpc('save_site_sections_atomic', {
p_sections: createSectionSnapshot(drafts),
p_expected: createSectionExpectedSnapshot(g_siteSections)
});
if (coopAtStart !== g_adminMemberRuntime?.coop_id) return;
if (error) { showSectionSaveError(error); return; }
applySectionRows(data?.sections);
renderSectionSeedHint('섹션 변경사항이 저장되었습니다.', false);
} catch (e) {
showSectionSaveError(e);
} finally {
g_sectionSaving = false;
renderSectionRows();
}
}

function askDeleteHistory(id) {
deleteType = 'history';
document.getElementById('delete-target-id').value = id;
// 버튼에 이벤트 연결
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

async function confirmDeleteHistory() {
// 1. 저장해둔 ID 꺼내기
const id = document.getElementById('delete-target-id').value;
if (!id) return;

// 2. 모달 닫기
const modalEl = document.getElementById('deleteConfirmModal');
const modalInstance = bootstrap.Modal.getInstance(modalEl);
modalInstance.hide();

showLoading(true);
const { error } = await _supabase.rpc('delete_document_secure', { p_id: id });
showLoading(false);

if (error) {
// 에러도 모달로 띄워주면 좋지만, 일단 간단한 경고는 유지하거나 토스트로 대체 가능
// 요청하신대로 alert 대신 커스텀 알림을 원하시면 별도 모달이 필요합니다.
// 일단은 에러 상황은 드물기 때문에 콘솔에 찍고 넘어갑니다.
CoopSafeLog.error("삭제 실패:", error.message);
} else {
fetchHistory(); // 목록 갱신
}
}

function getSiteSectionEditorTarget(sectionId) {
const targets = { hero:'sub-home-settings', impact:'sub-home-settings', contact:'sub-home-settings', about:'sub-about', progress:'sub-plants', portfolio:'sub-plants', status:'sub-generation', activities:'sub-activities', partners:'sub-partners', history:'sub-history', faq:'sub-faqs' };
const target = targets[sectionId];
if (!target) return '';
const link = document.querySelector(`#site-content-tabs a[href="#${target}"]`);
return link && !link.closest('.hidden') ? target : '';
}

function openSiteSectionEditor(sectionId) {
const target = getSiteSectionEditorTarget(sectionId);
if (!target || !canAccessAdminMemberTab('site')) return;
// Click the same tab as normal navigation, preserving its existing loading and scope checks.
if (!CoopHomeVisualEditor.select(sectionId)) document.querySelector(`#site-content-tabs a[href="#${target}"]`)?.click();
}

function siteEditorFormSnapshot(rootId) {
const root = document.getElementById(rootId);
const loaned = document.querySelectorAll(`[data-inline-original-root="${rootId}"]`);
return JSON.stringify(Array.from(new Set([...Array.from(root?.querySelectorAll('input, textarea, select') || []), ...loaned]))
.filter(el => !el.closest('.about-editor-toolbar'))
.sort((a, b) => String(a.id || a.name || '').localeCompare(String(b.id || b.name || '')))
.map(el => [el.id || el.name || '', el.type || el.tagName, el.type === 'file'
? Array.from(el.files || []).map(file => [file.name, file.size, file.lastModified, file.type])
: (el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value)]));
}

function getSiteEditorDraft(kind) {
if (g_siteEditorDrafts.has(kind)) return g_siteEditorDrafts.get(kind);
const rootId = kind === 'home' ? 'sub-home-settings' : 'sub-about';
const root = document.getElementById(rootId);
const controller = SiteEditorDrafts.create(() => siteEditorFormSnapshot(rootId), (state) => {
const status = document.getElementById(`site-${kind}-save-status`);
if (status) {
status.textContent = state.busy ? '저장 중입니다…' : state.loading ? '설정을 불러오는 중입니다…' : !state.loaded ? '설정을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.' : state.dirty ? '저장하지 않은 변경사항이 있습니다.' : '저장된 내용입니다.';
status.classList.toggle('text-primary', state.loaded && state.dirty);
status.classList.toggle('text-muted', !state.loaded || !state.dirty);
}
const button = document.getElementById(kind === 'home' ? 'btn-save-home-settings' : 'btn-save-about-settings');
if (button) button.disabled = !state.loaded || state.loading || state.busy || !state.dirty;
if (kind === 'home') {
const pending = document.getElementById('site-home-pending-save');
if (pending) { pending.hidden = !state.dirty; pending.disabled = !state.loaded || state.loading || state.busy; }
}
const preview = kind === 'home' ? document.getElementById('btn-preview-home-settings') : null;
if (preview) preview.disabled = !state.loaded || state.loading || state.busy;
const retry = document.getElementById(`btn-retry-${kind}-settings`);
if (retry) { retry.hidden = state.loaded || state.loading; retry.disabled = state.loading || state.busy; }
// Keep the first-read lock after an error too. Editing an unknown blank baseline
// would otherwise make retries unsafe and leave the form unable to save.
if (!state.loaded && !g_siteEditorFieldLocks.has(kind)) {
const fields = Array.from(root?.querySelectorAll('input,textarea,select,button') || [])
.filter(el => !el.closest('.site-editor-actionbar')).map(el => [el, el.disabled]);
g_siteEditorFieldLocks.set(kind, fields);
fields.forEach(([el]) => { el.disabled = true; });
} else if (state.loaded && g_siteEditorFieldLocks.has(kind)) {
g_siteEditorFieldLocks.get(kind).forEach(([el, disabled]) => { el.disabled = disabled; });
g_siteEditorFieldLocks.delete(kind);
}
});
g_siteEditorDrafts.set(kind, controller);
['input','change','click'].forEach(type => root?.addEventListener(type, () => Promise.resolve().then(() => controller.refresh())));
controller.refresh();
return controller;
}

function setHomeImagePreview(kind, url) {
const preview = document.getElementById(`site-home-${kind}-image-preview`);
if (!preview) return;
const safeUrl = String(url || '').trim();
if (!safeUrl) {
preview.removeAttribute('src');
preview.style.display = 'none';
return;
}
preview.src = safeUrl;
preview.style.objectPosition = document.getElementById(`site-home-${kind}-image-position`)?.value || 'center';
preview.style.display = 'block';
}

function previewHomeImage(kind) {
const input = document.getElementById(`site-home-${kind}-image-file`);
const file = input?.files?.[0] || null;
if (!file) return;
const preview = document.getElementById(`site-home-${kind}-image-preview`);
if (preview?.dataset.objectUrl) URL.revokeObjectURL(preview.dataset.objectUrl);
const objectUrl = URL.createObjectURL(file);
if (preview) preview.dataset.objectUrl = objectUrl;
setHomeImagePreview(kind, objectUrl);
queueHomePreviewUpdate();
}

function clearHomeImage(kind) {
const input = document.getElementById(`site-home-${kind}-image-file`);
const urlInput = document.getElementById(`site-home-${kind}-image-url`);
if (input) input.value = '';
if (urlInput) urlInput.value = '';
setHomeImagePreview(kind, '');
queueHomePreviewUpdate();
}

function updateHomeOverlayLabel() {
const value = Number(document.getElementById('site-home-hero-overlay')?.value || 50);
const label = document.getElementById('site-home-hero-overlay-label');
if (label) label.textContent = `${value}%`;
queueHomePreviewUpdate();
}

function setHomeCtaValue(kind, value) {
const safeValue = String(value || '').trim();
const target = document.getElementById(`site-home-${kind}-cta-target`);
const custom = document.getElementById(`site-home-${kind}-cta-custom`);
const hidden = document.getElementById(`site-home-${kind}-cta-url`);
if (hidden) hidden.value = safeValue;
if (target) target.value = HOME_CTA_PRESETS.has(safeValue) ? safeValue : '__custom__';
if (custom) custom.value = HOME_CTA_PRESETS.has(safeValue) ? '' : safeValue;
toggleHomeCtaCustom(kind);
}

function toggleHomeCtaCustom(kind) {
const target = document.getElementById(`site-home-${kind}-cta-target`);
const custom = document.getElementById(`site-home-${kind}-cta-custom`);
if (custom) custom.hidden = target?.value !== '__custom__';
queueHomePreviewUpdate();
}

function readHomeCtaValue(kind) {
const target = String(document.getElementById(`site-home-${kind}-cta-target`)?.value || '');
if (target !== '__custom__') return target;
return String(document.getElementById(`site-home-${kind}-cta-custom`)?.value || '').trim();
}

function normalizeHomeImpactRegions(value) {
const source = Array.isArray(value) ? value : [];
return source.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
}

function renderHomeImpactRegions(regions) {
const list = document.getElementById('site-home-impact-region-list');
if (!list) return;
list.replaceChildren();
normalizeHomeImpactRegions(regions).forEach((region) => addHomeImpactRegion(region, false));
if (!list.children.length) addHomeImpactRegion('', false);
}

function addHomeImpactRegion(value = '', notifyPreview = true) {
const list = document.getElementById('site-home-impact-region-list');
if (!list) return;
if (list.children.length >= 8) return myAlert('지역은 최대 8개까지 등록할 수 있습니다.', 'warning');
const row = document.createElement('div');
row.className = 'home-region-row';
const input = document.createElement('input');
input.type = 'text';
input.className = 'form-control home-impact-region-input';
input.maxLength = 30;
input.placeholder = '예: 처인구 또는 남사읍';
input.setAttribute('aria-label', '현황에 표시할 지역 이름');
input.value = String(value || '');
input.addEventListener('input', queueHomePreviewUpdate);
const remove = document.createElement('button');
remove.type = 'button';
remove.className = 'btn btn-outline-danger';
remove.setAttribute('aria-label', '지역 삭제');
remove.innerHTML = '<i class="bi bi-trash"></i>';
remove.addEventListener('click', () => {
row.remove();
if (!list.children.length) addHomeImpactRegion('', false);
queueHomePreviewUpdate();
});
row.append(input, remove);
list.appendChild(row);
if (notifyPreview) {
input.focus();
queueHomePreviewUpdate();
}
}

function readHomeImpactRegions() {
return Array.from(document.querySelectorAll('.home-impact-region-input'))
.map((input) => String(input.value || '').trim())
.filter(Boolean);
}

function updateHomeImpactModeUi() {
const mode = String(document.querySelector('input[name="site-home-impact-mode"]:checked')?.value || 'total');
const editor = document.getElementById('site-home-impact-region-editor');
if (editor) editor.hidden = mode !== 'regions';
queueHomePreviewUpdate();
}

function setHomeSettingsMode(mode) {
if (!['basic', 'advanced'].includes(mode)) return false;
if (window.CoopHomeVisualEditor) return CoopHomeVisualEditor.select(mode === 'advanced' ? 'fonts' : 'hero');
for (const name of ['basic', 'advanced']) {
const selected = name === mode;
const panel = document.getElementById(`site-home-${name}-panel`);
const tab = document.getElementById(`site-home-${name}-tab`);
if (panel) panel.hidden = !selected;
if (tab) {
tab.setAttribute('aria-selected', String(selected));
tab.tabIndex = selected ? 0 : -1;
}
}
return true;
}

function handleHomeSettingsModeKey(event) {
if (event.altKey || event.ctrlKey || event.metaKey) return;
const modes = ['basic', 'advanced'];
const current = modes.findIndex(name => document.getElementById(`site-home-${name}-tab`) === event.target);
if (current < 0) return;
let next;
if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = modes[1 - current];
else if (event.key === 'Home') next = modes[0];
else if (event.key === 'End') next = modes[1];
else return;
event.preventDefault();
setHomeSettingsMode(next);
document.getElementById(`site-home-${next}-tab`)?.focus();
}

function initializeHomeFontOptions() {
['title','body'].forEach(kind => {
const select = document.getElementById(`site-home-${kind}-font`);
if (!select || select.options.length > 1) return;
CoopHomeDesign.fonts.forEach(font => {
const option = document.createElement('option');
option.value = font.id;
option.textContent = `${font.label} · ${font.kind}`;
select.appendChild(option);
});
const external = document.createElement('option');
external.value = 'external'; external.textContent = '외부 글꼴 연결'; select.appendChild(external);
});
}

function updateHomeFontSelection() {
CoopHomeVisualEditor.updateExternalUi();
const title = document.getElementById('site-home-title-font')?.value || 'legacy';
const body = document.getElementById('site-home-body-font')?.value || 'legacy';
const matching = Object.entries(CoopHomeDesign.pairs).find(([, pair]) => pair.title === title && pair.body === body);
document.getElementById('site-home-font-pair').value = title === 'legacy' && body === 'legacy' ? 'legacy' : matching?.[0] || 'custom';
for (const id of ['site-home-font-sample', 'site-home-font-sample-advanced']) {
const sample = document.getElementById(id);
if (sample) CoopHomeDesign.applyFonts(sample, title, body, CoopHomeVisualEditor.readExternal(false));
}
queueHomePreviewUpdate();
}

function selectHomeFontPair() {
const value = document.getElementById('site-home-font-pair').value;
if (value === 'custom') {
updateHomeFontSelection();
setHomeSettingsMode('advanced');
document.getElementById('site-home-title-font')?.focus();
return;
}
const pair = value === 'legacy' ? { title:'legacy', body:'legacy' } : CoopHomeDesign.pairs[value];
if (!pair) return;
document.getElementById('site-home-title-font').value = pair.title;
document.getElementById('site-home-body-font').value = pair.body;
updateHomeFontSelection();
}

function recommendHomeFonts() {
const template = document.querySelector('input[name="site-home-template"]:checked')?.value || 'simple';
document.getElementById('site-home-font-pair').value = { community:'clean', simple:'clean', brand:'trust', editorial:'editorial', campaign:'participation' }[template];
selectHomeFontPair();
}

function selectHomeTemplate() {
document.getElementById('site-home-layout-mode').value = 'designed';
queueHomePreviewUpdate();
}

function setHomeSettingsForm(settings) {
CoopSiteInlineHost.setStyles('home',settings?.text_styles || {});
initializeHomeFontOptions();
g_homeSettingsRecord = settings && typeof settings === 'object' ? { ...settings } : {};
const template = ['community', 'simple', 'brand', 'editorial', 'campaign'].includes(String(settings?.home_template || ''))
? String(settings.home_template)
: (String(settings?.runtime_profile || '') === 'legacy_full' ? 'community' : 'simple');
document.querySelectorAll('input[name="site-home-template"]').forEach((input) => {
input.checked = input.value === template;
});
const valueMap = {
'site-home-layout-mode': CoopHomeDesign.normalizeLayout(settings?.home_layout_mode),
'site-home-title-font': CoopHomeDesign.normalizeFont(settings?.home_title_font),
'site-home-body-font': CoopHomeDesign.normalizeFont(settings?.home_body_font),
'site-home-hero-title': settings?.hero_title,
'site-home-hero-highlight': settings?.hero_highlight,
'site-home-hero-subtitle': settings?.hero_subtitle,
'site-home-hero-image-url': settings?.hero_image_url,
'site-home-hero-image-position': settings?.hero_image_position || 'center',
'site-home-hero-overlay': settings?.hero_overlay_percent ?? 50,
'site-home-hero-text-align': settings?.hero_text_align || 'center',
'site-home-hero-cta-label': settings?.hero_cta_label,
'site-home-impact-kicker': settings?.impact_kicker,
'site-home-impact-title': settings?.impact_title,
'site-home-impact-description': settings?.impact_description,
'site-home-impact-image-url': settings?.impact_image_url,
'site-home-impact-image-position': settings?.impact_image_position || 'center',
'site-home-impact-cta-label': settings?.impact_cta_label,
'site-home-contact-name': settings?.contact_name,
'site-home-contact-role': settings?.contact_role,
'site-home-contact-phone': settings?.contact_phone,
'site-home-contact-email': settings?.contact_email,
'site-home-contact-address': settings?.contact_address
};
Object.entries(valueMap).forEach(([id, value]) => {
const el = document.getElementById(id);
if (el) el.value = value == null ? '' : String(value);
});
setHomeCtaValue('hero', settings?.hero_cta_url == null ? '#about' : settings.hero_cta_url);
setHomeCtaValue('impact', settings?.impact_cta_url == null ? '#contact' : settings.impact_cta_url);
const impactMode = ['total', 'regions', 'village'].includes(String(settings?.impact_display_mode || ''))
? String(settings.impact_display_mode)
: 'total';
const villageCard = document.getElementById('site-home-village-mode-card');
if (villageCard) villageCard.hidden = impactMode !== 'village';
document.querySelectorAll('input[name="site-home-impact-mode"]').forEach((input) => {
input.checked = input.value === impactMode;
});
const visible = document.getElementById('site-home-impact-visible');
if (visible) visible.checked = settings?.impact_visible !== false;
renderHomeImpactRegions(settings?.impact_regions || []);
updateHomeImpactModeUi();
['hero', 'impact'].forEach((kind) => {
const fileInput = document.getElementById(`site-home-${kind}-image-file`);
if (fileInput) fileInput.value = '';
setHomeImagePreview(kind, document.getElementById(`site-home-${kind}-image-url`)?.value || '');
});
updateHomeOverlayLabel();
CoopHomeVisualEditor.setExternal(settings);
updateHomeFontSelection();
}

async function fetchHomeSettings() {
try {
CoopHomeVisualEditor.mount();
await getSiteEditorDraft('home').load(async () => {
const { data, error } = await _supabase.rpc('get_my_home_settings');
if (error) throw error;
return data || {};
}, data => { setHomeSettingsForm(data); bindHomePreviewInputs(); });
if (!g_homeVisualStarted && getSiteEditorDraft('home').refresh().loaded) {
g_homeVisualStarted = true;
window.setTimeout(() => openHomePreview('hero', { preserveArea:true }), 0);
}
} catch (error) {
CoopSafeLog.error("[fetchHomeSettings] failed:", error);
myAlert('메인 화면 설정을 불러오지 못했습니다: ' + (error?.message || error), 'warning');
}
}

function validateHomeCtaUrl(value, label) {
const safeValue = String(value || '').trim();
if (!safeValue || /^(https:\/\/|\/|#)/i.test(safeValue)) return safeValue;
throw new Error(`${label} 연결 주소는 https://, / 또는 #으로 시작해야 합니다.`);
}

function collectHomeSettingsPayload() {
const read = (id) => String(document.getElementById(id)?.value || '').trim();
const mode = String(document.querySelector('input[name="site-home-impact-mode"]:checked')?.value || 'total');
const regions = readHomeImpactRegions();
if (mode === 'regions' && regions.length === 0) {
CoopHomeVisualEditor.select('impact');
throw new Error('지역별 현황을 사용하려면 지역을 하나 이상 입력해 주세요.');
}
if (new Set(regions.map((item) => item.toLocaleLowerCase('ko-KR'))).size !== regions.length) {
CoopHomeVisualEditor.select('impact');
throw new Error('같은 지역을 두 번 등록할 수 없습니다.');
}
return {
p_home_layout_mode: read('site-home-layout-mode') || 'existing',
p_home_title_font: read('site-home-title-font') || 'legacy',
p_home_body_font: read('site-home-body-font') || 'legacy',
p_home_external_fonts: CoopHomeVisualEditor.readExternal(),
p_external_font_rights_confirmed: document.getElementById('site-home-external-rights-confirmed')?.checked === true,
p_expected_updated_at: g_homeSettingsRecord?.updated_at || null,
p_home_template: String(document.querySelector('input[name="site-home-template"]:checked')?.value || 'simple'),
p_hero_title: read('site-home-hero-title'),
p_hero_highlight: read('site-home-hero-highlight'),
p_hero_subtitle: read('site-home-hero-subtitle'),
p_hero_image_url: read('site-home-hero-image-url'),
p_hero_image_position: read('site-home-hero-image-position') || 'center',
p_hero_overlay_percent: Number(read('site-home-hero-overlay') || 50),
p_hero_text_align: read('site-home-hero-text-align') || 'center',
p_hero_cta_label: read('site-home-hero-cta-label'),
p_hero_cta_url: validateHomeCtaUrl(readHomeCtaValue('hero'), '메인 배너 버튼'),
p_impact_kicker: read('site-home-impact-kicker'),
p_impact_title: read('site-home-impact-title'),
p_impact_description: read('site-home-impact-description'),
p_impact_image_url: read('site-home-impact-image-url'),
p_impact_image_position: read('site-home-impact-image-position') || 'center',
p_impact_cta_label: read('site-home-impact-cta-label'),
p_impact_cta_url: validateHomeCtaUrl(readHomeCtaValue('impact'), '참여 안내 버튼'),
p_impact_display_mode: mode,
p_impact_regions: regions,
p_impact_visible: document.getElementById('site-home-impact-visible')?.checked !== false,
p_contact_name: read('site-home-contact-name'),
p_contact_role: read('site-home-contact-role'),
p_contact_phone: read('site-home-contact-phone'),
p_contact_email: read('site-home-contact-email'),
p_contact_address: read('site-home-contact-address')
};
}

async function saveHomeSettings() {
if (g_homeSettingsSaving) return;
const draft = getSiteEditorDraft('home');
const state = draft.refresh();
if (!state.loaded || state.loading || !state.dirty) return;
g_homeSettingsSaving = true;
draft.setBusy(true);
const button = document.getElementById('btn-save-home-settings');
if (button) button.disabled = true;
showLoading(true);
try {
const coopId = String(g_adminMemberRuntime?.coop_id || '').trim();
const validatedBeforeUpload = collectHomeSettingsPayload();
if (Object.keys(validatedBeforeUpload.p_home_external_fonts).length && !validatedBeforeUpload.p_external_font_rights_confirmed) throw new Error('외부 글꼴의 사용 권한과 이용 조건을 확인해 주세요.');
for (const kind of ['hero', 'impact']) {
const fileInput = document.getElementById(`site-home-${kind}-image-file`);
const file = fileInput?.files?.[0] || null;
if (!file) continue;
if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
if (file.size > 10 * 1024 * 1024) throw new Error('사진은 한 장당 10MB 이하로 올려 주세요.');
const folder = coopId ? `site-home/${coopId}` : 'site-home';
const uploadedUrl = await uploadFileToStorage(file, folder);
document.getElementById(`site-home-${kind}-image-url`).value = uploadedUrl;
}

const payload = collectHomeSettingsPayload();
if (Object.keys(payload.p_home_external_fonts).length && !payload.p_external_font_rights_confirmed) throw new Error('외부 글꼴의 사용 권한과 이용 조건을 확인해 주세요.');
const { data, error } = await _supabase.rpc('upsert_site_home_settings_v6', {p_settings:payload,p_text_styles:CoopSiteInlineHost.readStyles('home',true)});
if (error) throw error;
setHomeSettingsForm(data || payload);
draft.accept();
const impactSection = Array.isArray(g_sectionDrafts) ? g_sectionDrafts.find((item) => item.id === 'impact') : null;
if (impactSection) impactSection.is_visible = payload.p_impact_visible;
const savedImpactSection = Array.isArray(g_siteSections) ? g_siteSections.find((item) => item.id === 'impact') : null;
if (savedImpactSection) savedImpactSection.is_visible = payload.p_impact_visible;
myAlert('메인 화면, 참여 현황과 연락처 설정을 저장했습니다.');
} catch (error) {
CoopSafeLog.error("[saveHomeSettings] failed:", error);
myAlert('메인 화면 저장 실패: ' + (error?.message || error), 'error');
} finally {
showLoading(false);
g_homeSettingsSaving = false;
draft.setBusy(false);
}
}

function readHomePreviewFile(file) {
if (g_homePreviewFiles.has(file)) return g_homePreviewFiles.get(file);
const promise = new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = () => resolve(String(reader.result || ''));
reader.onerror = () => { g_homePreviewFiles.delete(file); reject(new Error('미리보기 사진을 읽지 못했습니다.')); };
reader.readAsDataURL(file);
});
g_homePreviewFiles.set(file, promise);
return promise;
}

async function collectSitePreviewDraft(includeLocalFiles = true) {
const result = {};
if (g_siteInitialSectionsRequested) result.sections = getSortedSectionDrafts().map(row => ({ id:row.id, is_visible:row.is_visible, display_order:row.display_order }));
window.CoopHomeVisualEditor?.syncOrder(result.sections);
if (g_homePreviewImpactSource === 'home') {
const impact = result.sections?.find(row => row.id === 'impact');
if (impact) impact.is_visible = document.getElementById('site-home-impact-visible')?.checked !== false;
}
if (getSiteEditorDraft('about').refresh().loaded) {
result.about = {
title:document.getElementById('admin-about-title').value,
subtitle:document.getElementById('admin-about-subtitle').value,
content:sanitizeAboutHtml(document.getElementById('admin-about-content').value),
list_items:document.getElementById('admin-about-list').value,
text_styles:CoopSiteInlineHost.readStyles('about'),
image_url:document.getElementById('admin-about-img').value
};
const file = document.getElementById('admin-about-img-file')?.files?.[0];
if (includeLocalFiles && file) result.about.image_url = await readHomePreviewFile(file);
}
if (g_siteCertificationsLoaded) {
result.certifications = g_siteCertifications.map(row => ({ ...row }));
const read = id => String(document.getElementById(id)?.value || '').trim();
const name = read('site-certification-name');
if (name) {
const item = { id:read('site-certification-id') || 'preview-new', name, issuer:read('site-certification-issuer'), certificate_no:read('site-certification-number'), issued_on:read('site-certification-issued-on'), valid_until:read('site-certification-valid-until'), image_url:read('site-certification-image-url'), public_url:normalizeAdminHttpUrl(read('site-certification-public-url')), display_order:Number(read('site-certification-order') || 100), is_visible:document.getElementById('site-certification-visible').checked, is_featured:document.getElementById('site-certification-featured').checked };
const file = document.getElementById('site-certification-image-file')?.files?.[0];
if (includeLocalFiles && file) item.image_url = await readHomePreviewFile(file);
result.certifications = result.certifications.filter(row => String(row.id) !== item.id).concat(item);
}
result.certifications = result.certifications.filter(row => row.is_visible).sort((a,b) => a.display_order-b.display_order);
}
if (document.getElementById('activityModal')?.classList.contains('show')) {
const cover = activityGalleryItems[0];
result.activity = { id:document.getElementById('activity-id').value || 'preview-new', title:document.getElementById('activity-title').value, text_styles:CoopSiteInlineHost.readStyles('activities'), event_date:document.getElementById('activity-date').value, content:sanitizeAboutHtml(document.getElementById('activity-content').value), file_url:cover?.url || cover?.previewUrl || '', is_current:document.getElementById('activity-visible').checked };
if (includeLocalFiles && cover?.file) result.activity.file_url = await readHomePreviewFile(cover.file);
}
return result;
}

async function collectHomePreviewSettings(includeLocalFiles = true) {
const payload = collectHomeSettingsPayload();
const settings = {
...g_homeSettingsRecord,
home_layout_mode: payload.p_home_layout_mode,
home_title_font: payload.p_home_title_font,
home_body_font: payload.p_home_body_font,
home_external_fonts: payload.p_home_external_fonts,
text_styles:CoopSiteInlineHost.readStyles('home',true),
home_template: payload.p_home_template,
hero_title: payload.p_hero_title,
hero_highlight: payload.p_hero_highlight,
hero_subtitle: payload.p_hero_subtitle,
hero_image_url: payload.p_hero_image_url,
hero_image_position: payload.p_hero_image_position,
hero_overlay_percent: payload.p_hero_overlay_percent,
hero_text_align: payload.p_hero_text_align,
hero_cta_label: payload.p_hero_cta_label,
hero_cta_url: payload.p_hero_cta_url,
impact_kicker: payload.p_impact_kicker,
impact_title: payload.p_impact_title,
impact_description: payload.p_impact_description,
impact_image_url: payload.p_impact_image_url,
impact_image_position: payload.p_impact_image_position,
impact_cta_label: payload.p_impact_cta_label,
impact_cta_url: payload.p_impact_cta_url,
impact_display_mode: payload.p_impact_display_mode,
impact_regions: payload.p_impact_regions,
impact_visible: payload.p_impact_visible,
contact_name: payload.p_contact_name,
contact_role: payload.p_contact_role,
contact_phone: payload.p_contact_phone,
contact_email: payload.p_contact_email,
contact_address: payload.p_contact_address
};
if (includeLocalFiles) for (const kind of ['hero', 'impact']) {
const file = document.getElementById(`site-home-${kind}-image-file`)?.files?.[0] || null;
if (file) settings[`${kind}_image_url`] = await readHomePreviewFile(file);
}
settings.site_preview = await collectSitePreviewDraft(includeLocalFiles);
settings.inline_fields = window.CoopSiteInlineHost?.collect() || {};
return settings;
}

function getHomePreviewUrl() {
const configured = String(g_homeSettingsRecord?.public_home_url || '').trim();
if (configured) return new URL(configured);
const host = location.hostname.replace(/^erp\./i, 'www.');
return new URL(`${location.protocol}//${host}/`);
}

async function sendHomePreviewSettings() {
const frame = document.getElementById('site-home-preview-frame');
const targetWindow = g_homePreviewSourceWindow || frame?.contentWindow;
if ((!targetWindow && !g_homePreviewChannel) || !frame?.src) return;
try {
const revision = g_homePreviewRevision;
const settings = await collectHomePreviewSettings();
if (revision !== g_homePreviewRevision) return;
const targetOrigin = new URL(frame.src).origin;
const message = { type: 'coop-home-preview-settings', settings };
// The iframe is the authoritative peer. Broadcast is only a fallback, not a
// second copy of every keystroke and settings update.
if (targetWindow) targetWindow.postMessage(message, targetOrigin);
else if (g_homePreviewChannel) g_homePreviewChannel.postMessage(message);
} catch (error) {
CoopSafeLog.warn("[sendHomePreviewSettings] failed:", error);
}
}

function queueHomePreviewUpdate() {
g_homePreviewRevision++;
window.clearTimeout(g_homePreviewTimer);
g_homePreviewTimer = window.setTimeout(sendHomePreviewSettings, 180);
}

function bindHomePreviewInputs() {
const pane = document.getElementById('site-home-visual-workspace') || document.getElementById('sub-home-settings');
if (!pane || pane.dataset.previewBound === 'true') return;
pane.dataset.previewBound = 'true';
pane.addEventListener('input', (event) => {
if (event.target.closest('#site-home-preview-modal')) return;
queueHomePreviewUpdate();
});
pane.addEventListener('change', (event) => {
if (event.target.closest('#site-home-preview-modal')) return;
if (event.target.id === 'site-home-impact-visible') g_homePreviewImpactSource = 'home';
queueHomePreviewUpdate();
});
}

function setHomePreviewDevice(device) {
const isMobile = device === 'mobile';
document.getElementById('site-home-preview-shell')?.classList.toggle('is-mobile', isMobile);
document.getElementById('site-home-preview-desktop')?.classList.toggle('active', !isMobile);
document.getElementById('site-home-preview-mobile')?.classList.toggle('active', isMobile);
}

async function openHomePreview(sectionId = 'hero', options = {}) {
try {
if (!options.preserveArea) CoopHomeVisualEditor.select(sectionId);
const existingFrame = document.getElementById('site-home-preview-frame');
if (existingFrame?.getAttribute('src')) {
await sendHomePreviewSettings();
existingFrame.contentWindow?.postMessage({type:'coop-home-preview-navigate',area:sectionId},new URL(existingFrame.src).origin);
return;
}
await fetchHomeSettings();
if (!getSiteEditorDraft('home').refresh().loaded) throw new Error('메인 화면 설정을 먼저 불러와 주세요.');
const previewPayload = collectHomeSettingsPayload();
const frame = document.getElementById('site-home-preview-frame');
const url = getHomePreviewUrl();
const previewSections = { hero:'hero', about:'about', impact:'impact', progress:'progress', portfolio:'portfolio', status:'status', activities:'activities', partners:'partners', faq:'faq', contact:'contact', documents:'documents', calculator:'calculator', 'ops-system':'ops-system', 'game-hall':'game-hall' };
url.hash = previewSections[sectionId] || 'hero';
url.searchParams.set('home_preview', '1');
url.searchParams.set('v', ADMIN_MEMBER_VERSION);
const previewLayoutJson = JSON.stringify({
home_layout_mode: previewPayload.p_home_layout_mode,
home_title_font: previewPayload.p_home_title_font,
home_body_font: previewPayload.p_home_body_font,
home_template: previewPayload.p_home_template,
impact_display_mode: previewPayload.p_impact_display_mode,
impact_regions: previewPayload.p_impact_regions,
impact_visible: previewPayload.p_impact_visible
});
const previewLayoutBytes = new TextEncoder().encode(previewLayoutJson);
let previewLayoutBinary = '';
previewLayoutBytes.forEach((byte) => { previewLayoutBinary += String.fromCharCode(byte); });
url.searchParams.set('home_preview_layout', btoa(previewLayoutBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''));
if (g_homePreviewStorageKey) {
try { sessionStorage.removeItem(g_homePreviewStorageKey); } catch (_) {}
g_homePreviewStorageKey = '';
}
if (url.origin === window.location.origin) {
try {
const storageToken = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
g_homePreviewStorageKey = `coop-home-preview-draft:${storageToken}`;
const initialHomeDraft = await collectHomePreviewSettings(false);
delete initialHomeDraft.site_preview; // Content/legal/news drafts stay in the live iframe message channel only.
delete initialHomeDraft.inline_fields;
sessionStorage.setItem(g_homePreviewStorageKey, JSON.stringify(initialHomeDraft));
url.searchParams.set('home_preview_token', storageToken);
} catch (error) {
CoopSafeLog.warn("[home preview] session draft failed:", error);
}
}
if (g_homePreviewChannel) g_homePreviewChannel.close();
g_homePreviewChannel = null;
if (typeof BroadcastChannel === 'function') {
const channelId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
url.searchParams.set('home_preview_channel', channelId);
g_homePreviewChannel = new BroadcastChannel(`coop-home-preview-${channelId}`);
g_homePreviewChannel.addEventListener('message', (event) => {
if (event.data?.type === 'coop-home-preview-ready') window.setTimeout(sendHomePreviewSettings, 0);
});
}
if (frame) {
g_homePreviewSourceWindow = null;
frame.onload = () => window.setTimeout(async () => {
await sendHomePreviewSettings();
const area = window.CoopHomeVisualEditor?.current() || sectionId;
frame.contentWindow?.postMessage({type:'coop-home-preview-navigate',area},url.origin);
}, 80);
frame.src = url.toString();
}
if (!options.preserveArea) CoopHomeVisualEditor.select(sectionId, false);
} catch (error) {
myAlert('미리보기를 열 수 없습니다: ' + (error?.message || error), 'warning');
}
}

function aboutHtmlToEditableText(rawHtml) {
const raw = String(rawHtml || '');
if (!/<\/?(?:p|br|strong|b|em|i|u|h[1-6]|ul|ol|li|blockquote|a)\b/i.test(raw)) {
return raw.replace(/\u00a0/g, ' ').replace(/\r\n/g, '\n').trim();
}
const doc = new DOMParser().parseFromString(`<div>${sanitizeAboutHtml(raw)}</div>`, 'text/html');
const root = doc.body.firstElementChild;
if (!root) return '';
root.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
return String(root.textContent || '')
.replace(/\u00a0/g, ' ')
.replace(/[ \t]+\n/g, '\n')
.replace(/\n[ \t]+/g, '\n')
.replace(/\n{3,}/g, '\n\n')
.trim();
}

function parseAboutListItems(rawValue) {
const raw = CoopTextStyles.editableList(rawValue).value.trim();
if (!raw) return [];
return raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function revokeAboutPreviewObjectUrl() {
if (!g_aboutPreviewObjectUrl) return;
URL.revokeObjectURL(g_aboutPreviewObjectUrl);
g_aboutPreviewObjectUrl = '';
}

function setAboutImageStatus(message) {
const status = document.getElementById('admin-about-img-status');
if (status) status.textContent = String(message || '');
}

function previewAboutImageFile() {
const input = document.getElementById('admin-about-img-file');
const file = input?.files?.[0] || null;
if (!file) return;
if (!file.type.startsWith('image/')) {
input.value = '';
revokeAboutPreviewObjectUrl();
setAboutImageStatus(g_aboutOriginalImageUrl ? '현재 홈페이지에서 사용 중인 사진입니다.' : '저장된 사진이 없습니다.');
updateTotalPreview();
return myAlert('이미지 파일만 올릴 수 있습니다.', 'warning');
}
if (file.size > 10 * 1024 * 1024) {
input.value = '';
revokeAboutPreviewObjectUrl();
setAboutImageStatus(g_aboutOriginalImageUrl ? '현재 홈페이지에서 사용 중인 사진입니다.' : '저장된 사진이 없습니다.');
updateTotalPreview();
return myAlert('사진은 10MB 이하로 올려 주세요.', 'warning');
}
revokeAboutPreviewObjectUrl();
g_aboutPreviewObjectUrl = URL.createObjectURL(file);
setAboutImageStatus('새 사진을 선택했습니다. 저장하면 홈페이지에 반영됩니다.');
updateTotalPreview();
}

function clearAboutImage() {
const fileInput = document.getElementById('admin-about-img-file');
const urlInput = document.getElementById('admin-about-img');
if (fileInput) fileInput.value = '';
if (urlInput) urlInput.value = '';
revokeAboutPreviewObjectUrl();
setAboutImageStatus('사진을 사용하지 않도록 선택했습니다. 저장하면 홈페이지에 반영됩니다.');
updateTotalPreview();
}

function isManagedAboutImageUrl(url, coopId) {
const safeUrl = String(url || '');
const safeCoopId = String(coopId || '').trim();
return Boolean(safeCoopId && safeUrl.includes(`/assets/site-home/${safeCoopId}/about/`));
}

async function deleteManagedAboutImage(url, coopId) {
if (!isManagedAboutImageUrl(url, coopId)) return;
try {
const rawPath = String(url).split('/assets/')[1]?.split('?')[0] || '';
const path = decodeURIComponent(rawPath);
if (!path) return;
const { error } = await _supabase.storage.from('assets').remove([path]);
if (error) CoopSafeLog.warn("[deleteManagedAboutImage] cleanup failed:", error.message || error);
} catch (error) {
CoopSafeLog.warn("[deleteManagedAboutImage] cleanup failed:", error);
}
}

async function fetchAboutSettings() {
try {
await getSiteEditorDraft('about').load(async () => {
const { data, error } = await scopeAdminTenant(_supabase.from('site_about').select('*')).limit(1);
if(error) throw error;
return (Array.isArray(data) ? data[0] : data) || {};
}, row => {
const titleEl = document.getElementById('admin-about-title');
const subtitleEl = document.getElementById('admin-about-subtitle');
const contentEl = document.getElementById('admin-about-content');
const listEl = document.getElementById('admin-about-list');
const imgEl = document.getElementById('admin-about-img');
const fileEl = document.getElementById('admin-about-img-file');
if (!titleEl || !subtitleEl || !contentEl || !listEl || !imgEl) return;
revokeAboutPreviewObjectUrl();
if (fileEl) fileEl.value = '';
titleEl.value = aboutHtmlToEditableText(row.title || '');
CoopSiteInlineHost.setStyles('about',row.text_styles || {});
subtitleEl.value = aboutHtmlToEditableText(row.subtitle || '');
contentEl.value = row.content || '';
listEl.value = row.list_items || '';
imgEl.value = row.image_url || '';
g_aboutOriginalImageUrl = imgEl.value;
setAboutImageStatus(g_aboutOriginalImageUrl ? '현재 홈페이지에서 사용 중인 사진입니다.' : '저장된 사진이 없습니다.');
if (typeof updateTotalPreview === 'function') updateTotalPreview();
});
queueHomePreviewUpdate(); // Publish editable field availability after the asynchronous baseline is accepted.
} catch (error) {
CoopSafeLog.error("[fetchAboutSettings] failed:", error);
myAlert('조합 소개를 불러오지 못했습니다: ' + (error?.message || error), 'warning');
}
}

function queueTotalPreviewUpdate() {
queueHomePreviewUpdate();
if (totalPreviewUpdateTimer) {
window.clearTimeout(totalPreviewUpdateTimer);
}
totalPreviewUpdateTimer = window.setTimeout(() => {
totalPreviewUpdateTimer = null;
updateTotalPreview();
}, 120);
}

function updateTotalPreview() {
const title = document.getElementById('admin-about-title').value;
const subtitle = document.getElementById('admin-about-subtitle').value;
const content = document.getElementById('admin-about-content').value;
const listText = document.getElementById('admin-about-list').value;
const imgUrl = g_aboutPreviewObjectUrl || document.getElementById('admin-about-img').value;

document.getElementById('prev-title').textContent = title;
document.getElementById('prev-subtitle').textContent = subtitle;
document.getElementById('prev-content').innerHTML = sanitizeAboutHtml(content);

const listEl = document.getElementById('prev-list');
// ★ 핵심: 미리보기 박스에도 'list-unstyled' 적용 (점 제거)
listEl.className = "list-unstyled mb-3";

if (!listText.trim()) {
listEl.innerHTML = '';
listEl.style.display = 'none';
} else {
listEl.style.display = 'block';
listEl.replaceChildren();
parseAboutListItems(listText).forEach((item) => {
const li = document.createElement('li');
li.className = 'mb-1';
li.textContent = item;
listEl.appendChild(li);
});
}

const imgEl = document.getElementById('prev-img');
if(imgUrl) { imgEl.src = imgUrl; imgEl.style.display = 'block'; }
else { imgEl.style.display = 'none'; }
}

async function saveAboutSettings() {
if (g_aboutSettingsSaving) return;
const draft = getSiteEditorDraft('about');
const state = draft.refresh();
if (!state.loaded || state.loading || !state.dirty) return;
g_aboutSettingsSaving = true;
draft.setBusy(true);
const saveButton = document.getElementById('btn-save-about-settings');
const fileInput = document.getElementById('admin-about-img-file');
const imageUrlInput = document.getElementById('admin-about-img');
const file = fileInput?.files?.[0] || null;
const previousImageUrl = g_aboutOriginalImageUrl;
let newlyUploadedImageUrl = '';
let aboutSaveConfirmed = false;
if (saveButton) saveButton.disabled = true;
showLoading(true);
try {
if (file && !file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
if (file && file.size > 10 * 1024 * 1024) throw new Error('사진은 10MB 이하로 올려 주세요.');

const coopId = String(await getAdminMemberCoopId() || '').trim();
if (!coopId) throw new Error('조합 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
if (file) {
newlyUploadedImageUrl = await uploadFileToStorage(file, `site-home/${coopId}/about`);
if (imageUrlInput) imageUrlInput.value = newlyUploadedImageUrl;
}

const updates = {
p_title: String(document.getElementById('admin-about-title').value || '').replace(/\r\n/g, '\n').trim(),
p_subtitle: String(document.getElementById('admin-about-subtitle').value || '').replace(/\r\n/g, '\n').trim(),
p_content: sanitizeAboutHtml(document.getElementById('admin-about-content').value),
p_list_items: document.getElementById('admin-about-list').value,
p_image_url: String(imageUrlInput?.value || '').trim(),
p_text_styles:CoopSiteInlineHost.readStyles('about',true)
};
const { error } = await _supabase.rpc('upsert_about_with_text_styles', updates);
if (error) throw error;
aboutSaveConfirmed = true;

const savedImageUrl = updates.p_image_url;
g_aboutOriginalImageUrl = savedImageUrl;
if (previousImageUrl && previousImageUrl !== savedImageUrl) {
await deleteManagedAboutImage(previousImageUrl, coopId);
}
document.getElementById('commonAlertText').innerText = '조합 소개를 저장했습니다.';
bootstrap.Modal.getOrCreateInstance(document.getElementById('commonAlertModal')).show();
if (fileInput) fileInput.value = '';
revokeAboutPreviewObjectUrl();
document.getElementById('admin-about-title').value = updates.p_title;
document.getElementById('admin-about-subtitle').value = updates.p_subtitle;
document.getElementById('admin-about-content').value = updates.p_content;
setAboutImageStatus(savedImageUrl ? '현재 홈페이지에서 사용 중인 사진입니다.' : '저장된 사진이 없습니다.');
updateTotalPreview();
draft.accept();
} catch (error) {
// Do not remove the new photo when a response is lost or a post-save UI refresh
// fails. It may already be referenced by the committed introduction.
document.getElementById('commonAlertText').innerText = aboutSaveConfirmed ? '조합 소개는 저장되었습니다. 화면을 다시 열어 확인해 주세요.' : '저장 실패: ' + (error?.message || error);
bootstrap.Modal.getOrCreateInstance(document.getElementById('commonAlertModal')).show();
} finally {
showLoading(false);
g_aboutSettingsSaving = false;
draft.setBusy(false);
}
}

function formatCertificationDate(value) {
const safe = String(value || '').slice(0, 10);
return safe || '—';
}

function resetSiteCertificationForm() {
[
'site-certification-id', 'site-certification-name', 'site-certification-issuer',
'site-certification-number', 'site-certification-issued-on', 'site-certification-valid-until',
'site-certification-image-url', 'site-certification-public-url'
].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
const file = document.getElementById('site-certification-image-file');
if (file) file.value = '';
const order = document.getElementById('site-certification-order');
if (order) order.value = '100';
const visible = document.getElementById('site-certification-visible');
if (visible) visible.checked = true;
const featured = document.getElementById('site-certification-featured');
if (featured) featured.checked = false;
const title = document.getElementById('site-certification-form-title');
if (title) title.textContent = '➕ 인증·지정 추가';
const status = document.getElementById('site-certification-image-status');
if (status) status.textContent = '선택 사항이며 10MB 이하 이미지를 사용합니다.';
const imageUrl = document.getElementById('site-certification-image-url');
if (imageUrl) delete imageUrl.dataset.originalUrl;
queueHomePreviewUpdate();
}

function clearSiteCertificationImage() {
const file = document.getElementById('site-certification-image-file');
const url = document.getElementById('site-certification-image-url');
if (file) file.value = '';
if (url) url.value = '';
const status = document.getElementById('site-certification-image-status');
if (status) status.textContent = '이미지를 사용하지 않도록 선택했습니다. 저장하면 반영됩니다.';
queueHomePreviewUpdate();
}

function editSiteCertification(id) {
const item = g_siteCertifications.find((row) => String(row.id) === String(id));
if (!item) return;
const set = (fieldId, value) => { const el = document.getElementById(fieldId); if (el) el.value = value == null ? '' : String(value); };
set('site-certification-id', item.id);
set('site-certification-name', item.name);
set('site-certification-issuer', item.issuer);
set('site-certification-number', item.certificate_no);
set('site-certification-issued-on', formatCertificationDate(item.issued_on).replace('—', ''));
set('site-certification-valid-until', formatCertificationDate(item.valid_until).replace('—', ''));
set('site-certification-image-url', item.image_url);
set('site-certification-public-url', item.public_url);
set('site-certification-order', item.display_order ?? 100);
const imageUrl = document.getElementById('site-certification-image-url');
if (imageUrl) imageUrl.dataset.originalUrl = String(item.image_url || '');
const file = document.getElementById('site-certification-image-file');
if (file) file.value = '';
const visible = document.getElementById('site-certification-visible');
if (visible) visible.checked = item.is_visible === true;
const featured = document.getElementById('site-certification-featured');
if (featured) featured.checked = item.is_featured === true;
const title = document.getElementById('site-certification-form-title');
if (title) title.textContent = '✏️ 인증·지정 수정';
const status = document.getElementById('site-certification-image-status');
if (status) status.textContent = item.image_url ? '현재 등록된 이미지가 있습니다.' : '등록된 이미지가 없습니다.';
document.getElementById('site-certification-name')?.focus();
queueHomePreviewUpdate();
}

function renderSiteCertifications() {
const tbody = document.getElementById('site-certification-list');
if (!tbody) return;
tbody.replaceChildren();
if (g_siteCertifications.length === 0) {
const row = document.createElement('tr');
const cell = document.createElement('td');
cell.colSpan = 5;
cell.className = 'certification-empty';
cell.textContent = '등록된 공식 인증·지정 정보가 없습니다.';
row.appendChild(cell);
tbody.appendChild(row);
return;
}
g_siteCertifications.forEach((item) => {
const row = document.createElement('tr');
const order = document.createElement('td');
order.textContent = String(item.display_order ?? 100);
const info = document.createElement('td');
const wrap = document.createElement('div');
wrap.className = 'd-flex align-items-center gap-2';
if (item.image_url) {
const img = document.createElement('img');
img.className = 'certification-logo-thumb';
img.src = item.image_url;
img.alt = '';
wrap.appendChild(img);
}
const copy = document.createElement('div');
const name = document.createElement('strong');
name.textContent = item.name;
const meta = document.createElement('div');
meta.className = 'small text-muted';
meta.textContent = [item.issuer, item.certificate_no, item.valid_until ? `유효기간 ${formatCertificationDate(item.valid_until)}` : ''].filter(Boolean).join(' · ');
copy.append(name, meta);
wrap.appendChild(copy);
info.appendChild(wrap);
const visible = document.createElement('td');
visible.textContent = item.is_visible ? '공개' : '비공개';
const featured = document.createElement('td');
featured.textContent = item.is_featured ? '대표' : '—';
const actions = document.createElement('td');
const edit = document.createElement('button');
edit.type = 'button'; edit.className = 'btn btn-sm btn-outline-primary me-1'; edit.textContent = '수정';
edit.addEventListener('click', () => editSiteCertification(item.id));
const remove = document.createElement('button');
remove.type = 'button'; remove.className = 'btn btn-sm btn-outline-danger'; remove.textContent = '삭제';
remove.addEventListener('click', () => askDeleteSiteCertification(item.id));
actions.append(edit, remove);
row.append(order, info, visible, featured, actions);
tbody.appendChild(row);
});
}

async function fetchSiteCertifications() {
try {
const { data, error } = await _supabase.rpc('get_my_site_certifications');
if (error) throw error;
g_siteCertifications = Array.isArray(data) ? data : [];
g_siteCertificationsLoaded = true;
renderSiteCertifications();
queueHomePreviewUpdate();
} catch (error) {
CoopSafeLog.error("[fetchSiteCertifications] failed:", error);
myAlert('공식 인증·지정 정보를 불러오지 못했습니다: ' + (error?.message || error), 'warning');
}
}

function isManagedCertificationImageUrl(url, coopId) {
return Boolean(String(coopId || '').trim() && String(url || '').includes(`/assets/site-home/${String(coopId).trim()}/certifications/`));
}

async function deleteManagedCertificationImage(url, coopId) {
if (!isManagedCertificationImageUrl(url, coopId)) return;
try {
const rawPath = String(url).split('/assets/')[1]?.split('?')[0] || '';
const path = decodeURIComponent(rawPath);
if (path) await _supabase.storage.from('assets').remove([path]);
} catch (error) {
CoopSafeLog.warn("[deleteManagedCertificationImage] cleanup failed:", error);
}
}

async function saveSiteCertification() {
if (g_siteCertificationSaving) return;
const read = (id) => String(document.getElementById(id)?.value || '').trim();
const name = read('site-certification-name');
if (!name) return myAlert('인증·지정 명칭을 입력해 주세요.', 'warning');
const issuedOn = read('site-certification-issued-on');
const validUntil = read('site-certification-valid-until');
if (issuedOn && validUntil && validUntil < issuedOn) return myAlert('유효기간 종료일은 지정일보다 앞설 수 없습니다.', 'warning');
const publicUrl = read('site-certification-public-url');
if (publicUrl && !/^https:\/\//i.test(publicUrl)) return myAlert('공식 안내 링크는 https:// 주소로 입력해 주세요.', 'warning');

g_siteCertificationSaving = true;
const button = document.getElementById('site-certification-save');
if (button) button.disabled = true;
showLoading(true);
let uploadedUrl = '';
const imageUrlInput = document.getElementById('site-certification-image-url');
const previousImageUrl = String(imageUrlInput?.dataset.originalUrl || '');
try {
const coopId = String(await getAdminMemberCoopId() || '').trim();
if (!coopId) throw new Error('조합 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
const file = document.getElementById('site-certification-image-file')?.files?.[0] || null;
if (file) {
if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.');
if (file.size > 10 * 1024 * 1024) throw new Error('이미지는 10MB 이하로 올려 주세요.');
uploadedUrl = await uploadFileToStorage(file, `site-home/${coopId}/certifications`);
if (imageUrlInput) imageUrlInput.value = uploadedUrl;
}
const { error } = await _supabase.rpc('upsert_my_site_certification', {
p_id: read('site-certification-id') || null,
p_name: name,
p_issuer: read('site-certification-issuer'),
p_certificate_no: read('site-certification-number'),
p_issued_on: issuedOn || null,
p_valid_until: validUntil || null,
p_image_url: read('site-certification-image-url') || null,
p_public_url: publicUrl || null,
p_is_featured: document.getElementById('site-certification-featured')?.checked === true,
p_is_visible: document.getElementById('site-certification-visible')?.checked === true,
p_display_order: Number(read('site-certification-order') || 100)
});
if (error) throw error;
const savedImageUrl = read('site-certification-image-url');
if (previousImageUrl && previousImageUrl !== savedImageUrl) await deleteManagedCertificationImage(previousImageUrl, coopId);
resetSiteCertificationForm();
await fetchSiteCertifications();
myAlert('공식 인증·지정 정보를 저장했습니다.');
} catch (error) {
if (uploadedUrl) await deleteManagedCertificationImage(uploadedUrl, String(g_adminMemberRuntime?.coop_id || ''));
CoopSafeLog.error("[saveSiteCertification] failed:", error);
myAlert('공식 인증·지정 저장 실패: ' + (error?.message || error), 'error');
} finally {
showLoading(false);
g_siteCertificationSaving = false;
if (button) button.disabled = false;
}
}

function askDeleteSiteCertification(id) {
const item = g_siteCertifications.find((row) => String(row.id) === String(id));
if (!item) return;
myConfirm(`‘${item.name}’ 인증·지정 정보를 삭제하시겠습니까?`, async () => {
showLoading(true);
try {
const { error } = await _supabase.rpc('delete_my_site_certification', { p_id: id });
if (error) throw error;
await deleteManagedCertificationImage(item.image_url, String(g_adminMemberRuntime?.coop_id || ''));
resetSiteCertificationForm();
await fetchSiteCertifications();
myAlert('공식 인증·지정 정보를 삭제했습니다.');
} catch (error) {
CoopSafeLog.error("[deleteSiteCertification] failed:", error);
myAlert('삭제 실패: ' + (error?.message || error), 'error');
} finally {
showLoading(false);
}
});
}

function normalizeActivityGalleryUrls(urls) {
return Array.from(new Set((Array.isArray(urls) ? urls : [])
  .map((url) => String(url || '').trim())
  .filter((url) => /^https?:\/\//i.test(url))));
}

function parseActivityContentWithGallery(value, fallbackUrl = '') {
const raw = String(value || '');
const match = raw.match(ACTIVITY_GALLERY_META_RE);
let galleryUrls = [];
let body = raw;
if (match) {
try {
galleryUrls = normalizeActivityGalleryUrls(JSON.parse(decodeURIComponent(match[1] || '[]')));
} catch (e) {
galleryUrls = [];
}
body = raw.replace(match[0], '').trim();
}
if (galleryUrls.length === 0 && String(fallbackUrl || '').trim()) {
galleryUrls = normalizeActivityGalleryUrls([fallbackUrl]);
}
return { body, galleryUrls };
}

function buildActivityContentWithGallery(body, galleryUrls) {
const safeUrls = normalizeActivityGalleryUrls(galleryUrls);
const cleanBody = String(body || '').replace(ACTIVITY_GALLERY_META_RE, '').trim();
if (safeUrls.length === 0) return cleanBody;
return `<!--ACTIVITY_GALLERY:${encodeURIComponent(JSON.stringify(safeUrls))}-->\n${cleanBody}`;
}

function normalizeActivityContentForEditor(value) {
return String(value || '').replace(ACTIVITY_GALLERY_META_RE, '').replace(/<br\s*\/?>/gi, '\n').trim();
}

function releaseActivityCoverPreviewObjectUrl() {
activityGalleryObjectUrls.forEach((objectUrl) => {
if (String(objectUrl || '').startsWith('blob:')) {
try { URL.revokeObjectURL(objectUrl); } catch (e) {}
}
});
activityGalleryObjectUrls = [];
}

function getActivityGalleryUrlsFromState() {
return activityGalleryItems
  .filter((item) => item && item.kind === 'url')
  .map((item) => String(item.url || '').trim())
  .filter(Boolean);
}

function syncActivityCoverHiddenFields() {
const coverUrl = String(activityGalleryItems[0]?.kind === 'url' ? activityGalleryItems[0].url : '').trim();
document.getElementById('activity-cover-url').value = coverUrl;
document.getElementById('activity-cover-removed').value = activityGalleryItems.length === 0 ? '1' : '0';
}

function renderActivityCoverPreview() {
queueHomePreviewUpdate();
const gridEl = document.getElementById('activity-gallery-preview');
const placeholderEl = document.getElementById('activity-cover-placeholder');
if (!gridEl || !placeholderEl) return;

syncActivityCoverHiddenFields();
if (activityGalleryItems.length === 0) {
gridEl.innerHTML = '';
placeholderEl.style.display = '';
return;
}

placeholderEl.style.display = 'none';
gridEl.innerHTML = activityGalleryItems.map((item, index) => {
const src = item.kind === 'file' ? item.objectUrl : (item.kind === 'participation' ? item.previewUrl : item.url);
const pendingBadge = item.kind === 'file'
? '<span class="activity-gallery-pending-badge">추가 예정</span>'
: (item.kind === 'participation' ? '<span class="activity-gallery-pending-badge">참여 관리 사진</span>' : '');
const coverBadge = index === 0 ? '<span class="activity-gallery-cover-badge">대표사진</span>' : '';
const coverButton = index === 0
? ''
: `<button type="button" class="btn btn-sm btn-light border" title="대표사진 지정" onclick="event.stopPropagation(); setActivityGalleryCover(${index})"><i class="bi bi-star"></i></button>`;
return `
  <div class="activity-gallery-thumb">
    <img src="${escapeHtml(src)}" alt="활동 사진 ${index + 1}">
    ${pendingBadge}
    ${coverBadge}
    <div class="activity-gallery-actions">
      ${coverButton}
      <button type="button" class="btn btn-sm btn-danger" title="삭제" onclick="event.stopPropagation(); removeActivityGalleryImage(${index})"><i class="bi bi-x-lg"></i></button>
    </div>
  </div>`;
}).join('');
}

function setActivityGalleryItemsFromUrls(urls) {
releaseActivityCoverPreviewObjectUrl();
activityGalleryItems = normalizeActivityGalleryUrls(urls).map((url) => ({ kind: 'url', url }));
renderActivityCoverPreview();
}

function setActivityCoverState(url) {
setActivityGalleryItemsFromUrls(url ? [url] : []);
}

function addActivityGalleryFiles(files) {
const imageFiles = Array.from(files || []).filter((file) => file && String(file.type || '').startsWith('image/'));
if (imageFiles.length === 0) return;
imageFiles.forEach((file) => {
const objectUrl = URL.createObjectURL(file);
activityGalleryObjectUrls.push(objectUrl);
activityGalleryItems.push({ kind: 'file', file, objectUrl });
});
document.getElementById('activity-cover-removed').value = '0';
renderActivityCoverPreview();
}

function previewActivityCover(input) {
addActivityGalleryFiles(input?.files || []);
if (input) input.value = '';
}

function handleActivityGalleryDrag(event, isOver) {
event.preventDefault();
event.stopPropagation();
const dropzone = document.getElementById('activity-gallery-dropzone');
if (dropzone) dropzone.classList.toggle('dragover', !!isOver);
}

function handleActivityGalleryDrop(event) {
handleActivityGalleryDrag(event, false);
addActivityGalleryFiles(event.dataTransfer?.files || []);
}

function setActivityGalleryCover(index) {
const safeIndex = Number(index);
if (!Number.isInteger(safeIndex) || safeIndex <= 0 || safeIndex >= activityGalleryItems.length) return;
const [item] = activityGalleryItems.splice(safeIndex, 1);
activityGalleryItems.unshift(item);
renderActivityCoverPreview();
}

function removeActivityGalleryImage(index) {
const safeIndex = Number(index);
if (!Number.isInteger(safeIndex) || safeIndex < 0 || safeIndex >= activityGalleryItems.length) return;
const [item] = activityGalleryItems.splice(safeIndex, 1);
if (item?.objectUrl && String(item.objectUrl).startsWith('blob:')) {
try { URL.revokeObjectURL(item.objectUrl); } catch (e) {}
activityGalleryObjectUrls = activityGalleryObjectUrls.filter((url) => url !== item.objectUrl);
}
renderActivityCoverPreview();
}

function clearActivityCover() {
document.getElementById('activity-cover-file').value = '';
document.getElementById('activity-cover-removed').value = '1';
setActivityGalleryItemsFromUrls([]);
}

function getActivitySourceEventId() {
return String(document.getElementById('activity-source-event-id')?.value || '').trim();
}

function setActivitySourceEventId(eventId) {
const safeId = String(eventId || '').trim();
const hidden = document.getElementById('activity-source-event-id');
const select = document.getElementById('activity-source-event-select');
if (hidden) hidden.value = safeId;
if (select) select.value = safeId;
}

function formatActivitySourceEventDate(startsAt) {
try {
return new Intl.DateTimeFormat('en-CA', {
timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'
}).format(new Date(startsAt));
} catch (_) {
return '';
}
}

function activitySourceTypeLabel(type) {
if (type === 'BOARD') return '이사회';
if (type === 'DELEGATE_ASSEMBLY') return '대의원 총회';
return '교육';
}

async function loadActivityParticipationEvents(selectedId = '') {
const select = document.getElementById('activity-source-event-select');
const help = document.getElementById('activity-source-event-help');
if (!select) return [];
try {
const { data, error } = await _supabase.rpc('participation_admin_get_dashboard');
if (error) throw error;
activityParticipationEvents = Array.isArray(data?.events) ? data.events : [];
const linkedByEvent = new Map((g_siteActivities || []).map((row) => [String(row.source_participation_event_id || ''), row]));
select.innerHTML = '<option value="">연동하지 않고 직접 작성</option>' + activityParticipationEvents.map((event) => {
const linked = linkedByEvent.get(String(event.id || ''));
const linkedElsewhere = linked && String(linked.id || '') !== String(document.getElementById('activity-id')?.value || '');
const photoCount = Number(event.photo_count || 0);
const date = formatActivitySourceEventDate(event.starts_at);
return `<option value="${escapeHtml(event.id)}" ${String(event.id) === String(selectedId) ? 'selected' : ''} ${linkedElsewhere ? 'disabled' : ''}>${escapeHtml(date)} · ${escapeHtml(activitySourceTypeLabel(event.event_type))} · ${escapeHtml(event.title || '')} · 사진 ${photoCount}장${linkedElsewhere ? ' · 소식 작성됨' : ''}</option>`;
}).join('');
if (selectedId) select.value = String(selectedId);
if (help) help.textContent = activityParticipationEvents.length
? '참여 관리의 사진을 선택하면 공개용 사진을 자동으로 준비하며, 원본 회의록의 상세 안건·참석자·결정 내용은 가져오지 않습니다.'
: '연동할 회의·교육 기록이 없습니다.';
return activityParticipationEvents;
} catch (error) {
activityParticipationEvents = [];
select.innerHTML = '<option value="">회의·교육 기록을 불러오지 못했습니다</option>';
if (help) help.textContent = error?.message || '회의·교육 기록을 불러오지 못했습니다.';
return [];
}
} // End of loadActivityParticipationEvents

async function getActivityParticipationPhotoPreview(file) {
const externalUrl = normalizeAdminHttpUrl(file?.external_url || '');
if (externalUrl) return externalUrl;
const path = String(file?.storage_path || '').trim();
if (!path) return '';
const { data, error } = await _supabase.storage.from('participation-files').createSignedUrl(path, 600);
if (error) throw error;
return String(data?.signedUrl || '').trim();
} // End of getActivityParticipationPhotoPreview

function buildActivitySourceSummary(event) {
const typeLabel = activitySourceTypeLabel(event?.event_type);
const location = String(event?.location || '').trim();
return `${event?.title || typeLabel}${typeLabel === '교육' ? '을 진행했습니다.' : '를 개최했습니다.'}${location ? `\n\n장소: ${location}` : ''}`;
} // End of buildActivitySourceSummary

async function applyActivitySourceEvent(eventId, { prefill = true } = {}) {
const safeId = String(eventId || '').trim();
if (!safeId) {
setActivitySourceEventId('');
return;
}
const { data, error } = await _supabase.rpc('participation_admin_get_event_media', { p_event_id:safeId });
if (error) throw error;
const event = data?.event || activityParticipationEvents.find((row) => String(row.id) === safeId);
if (!event) throw new Error('연동할 회의·교육 기록을 찾지 못했습니다.');
setActivitySourceEventId(safeId);

if (prefill) {
const titleEl = document.getElementById('activity-title');
const dateEl = document.getElementById('activity-date');
const contentEl = document.getElementById('activity-content');
if (!String(titleEl.value || '').trim()) titleEl.value = event.title || '';
if (!g_activityDateUserEdited || !String(dateEl.value || '').trim()) dateEl.value = formatActivitySourceEventDate(event.starts_at) || getAdminMemberKstDateString();
if (!String(contentEl.value || '').trim()) {
contentEl.value = buildActivitySourceSummary(event);
g_activityEditorBridge?.syncFromSource();
}
}

const photos = (Array.isArray(data?.files) ? data.files : []).filter((file) => file.file_kind === 'PHOTO');
const existingKeys = new Set(activityGalleryItems.map((item) => String(item.externalUrl || item.fileId || item.url || '').trim()).filter(Boolean));
for (const file of photos) {
const externalUrl = normalizeAdminHttpUrl(file.external_url || '');
if (externalUrl) {
if (!existingKeys.has(externalUrl)) {
activityGalleryItems.push({ kind:'url', url:externalUrl, sourceEventId:safeId, sourceFileId:file.id || null });
existingKeys.add(externalUrl);
}
continue;
}
const fileId = String(file.id || '').trim();
if (!fileId || existingKeys.has(fileId)) continue;
const previewUrl = await getActivityParticipationPhotoPreview(file);
activityGalleryItems.push({
kind:'participation',
fileId,
storagePath:String(file.storage_path || '').trim(),
originalName:String(file.original_name || 'meeting-photo.jpg'),
mimeType:String(file.mime_type || 'image/jpeg'),
previewUrl,
sourceEventId:safeId
});
existingKeys.add(fileId);
}
renderActivityCoverPreview();
const help = document.getElementById('activity-source-event-help');
if (help) help.textContent = photos.length
? `${event.title || '행사'}의 사진 ${photos.length}장을 불러왔습니다. 저장할 때 공개용 주소를 준비합니다.`
: `${event.title || '행사'}에는 등록된 사진이 없습니다. 기본정보만 연동했습니다.`;
} // End of applyActivitySourceEvent

async function loadSelectedActivitySourceEvent() {
const eventId = String(document.getElementById('activity-source-event-select')?.value || '').trim();
showLoading(true);
try {
await applyActivitySourceEvent(eventId, { prefill:true });
} catch (error) {
myAlert('회의·교육 기록을 불러오지 못했습니다: ' + (error?.message || error), 'error');
} finally {
showLoading(false);
}
} // End of loadSelectedActivitySourceEvent

function activityPublishedPhotoExtension(item) {
const mime = String(item?.mimeType || '').toLowerCase();
if (mime === 'image/png') return 'png';
if (mime === 'image/webp') return 'webp';
if (mime === 'image/heic') return 'heic';
if (mime === 'image/heif') return 'heif';
const extension = String(item?.storagePath || '').split('.').pop().toLowerCase();
return ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extension) ? extension : 'jpg';
} // End of activityPublishedPhotoExtension

async function publishActivityParticipationPhoto(item) {
const fileId = String(item?.fileId || '').trim();
const storagePath = String(item?.storagePath || '').trim();
if (!fileId || !storagePath) throw new Error('참여 관리 사진 경로를 확인하지 못했습니다.');
const destinationPath = `site-activities/participation_${fileId}.${activityPublishedPhotoExtension(item)}`;
const { error } = await _supabase.storage.from('participation-files').copy(
storagePath,
destinationPath,
{ destinationBucket:'assets' }
);
const duplicate = error && /duplicate|already exists|resource already exists/i.test(String(error.message || error.error || ''));
if (error && !duplicate) throw error;
const { data } = _supabase.storage.from('assets').getPublicUrl(destinationPath);
const url = String(data?.publicUrl || '').trim();
if (!url) throw new Error('공개용 사진 주소를 만들지 못했습니다.');
return { url, created:!error };
} // End of publishActivityParticipationPhoto

async function deleteActivityPhotoIfUnreferenced(url) {
const safeUrl = normalizeAdminHttpUrl(url || '');
if (!safeUrl) return false;
try {
const { data, error } = await _supabase.rpc('site_activity_media_reference_count', { p_url:safeUrl });
if (error) throw error;
if (Number(data || 0) > 0) return false;
await deleteOldFile(safeUrl);
return true;
} catch (error) {
CoopSafeLog.warn("[deleteActivityPhotoIfUnreferenced] preserved photo:", error?.message || error);
return false;
}
} // End of deleteActivityPhotoIfUnreferenced

async function fetchActivities() {
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*'))
  .eq('category', 'activity')
  .order('event_date', { ascending: false })
  .order('updated_at', { ascending: false });

const tbody = document.getElementById('activityListBody');
if (!tbody) return;
tbody.innerHTML = '';

if (error) {
CoopSafeLog.error("[fetchActivities] failed:", error);
tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-danger">활동 내역을 불러오지 못했습니다.</td></tr>';
return false;
}

g_siteActivities = Array.isArray(data) ? data : [];

if (g_siteActivities.length === 0) {
tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">등록된 활동 내역이 없습니다.</td></tr>';
return true;
}

g_siteActivities.forEach((row) => {
const parsedActivity = parseActivityContentWithGallery(row.content || '', row.file_url || '');
const coverUrl = normalizeAdminHttpUrl(parsedActivity.galleryUrls[0] || row.file_url);
const coverHtml = coverUrl
? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(row.title || '활동 대표 사진')}" style="width:72px;height:48px;object-fit:cover;border-radius:10px;border:1px solid #e5e7eb;">`
: '<span class="text-muted small">없음</span>';
const visibleBadge = row.is_current
? '<span class="badge bg-success">공개중</span>'
: '<span class="badge bg-secondary">숨김</span>';
const historyBadge = row.is_history_milestone
? '<span class="badge bg-warning text-dark ms-2">연혁</span>'
: '';
const summaryPreview = escapeHtml(toPlainSummaryPreview(parsedActivity.body, 88));

tbody.innerHTML += `<tr>
<td class="text-center">${escapeHtml(row.event_date || '-')}</td>
<td class="text-center">${coverHtml}</td>
<td class="text-start fw-bold">${escapeHtml(row.title || '-')}${historyBadge}</td>
<td class="text-center">${visibleBadge}</td>
<td class="text-start small">${summaryPreview}</td>
<td class="text-center">
  <button class="btn btn-sm btn-light" onclick="openActivityModal('${escapeJsString(String(row.id || ''))}')">수정</button>
  <button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeleteActivity('${escapeJsString(String(row.id || ''))}')">삭제</button>
</td>
</tr>`;
});
return true;
}

function getActivityDraftSnapshot() {
const modal = document.getElementById('activityModal');
const values = Array.from(modal?.querySelectorAll('input,textarea,select') || [])
.filter(el => !el.closest('#activity-content-toolbar'))
.map(el => [el.id, el.type === 'file' ? Array.from(el.files || []).map(file => [file.name,file.size,file.lastModified]) : el.type === 'checkbox' ? el.checked : el.value]);
const photos = activityGalleryItems.map(item => [item.kind,item.url || '',item.fileId || '',item.file ? [item.file.name,item.file.size,item.file.lastModified] : null]);
return JSON.stringify([values, g_activityEditorBridge?.getRootHtml() || '', photos]);
}

function hasUnsavedActivityChanges() {
return Boolean(g_activityDraftBaseline && document.getElementById('activityModal')?.classList.contains('show') && getActivityDraftSnapshot() !== g_activityDraftBaseline);
}

function bindActivityDraftGuard() {
const modal = document.getElementById('activityModal');
if (!modal || modal.dataset.draftGuardBound === '1') return;
modal.dataset.draftGuardBound = '1';
modal.addEventListener('show.bs.modal', () => { modal.dataset.activityShown = '0'; });
modal.addEventListener('shown.bs.modal', () => { modal.dataset.activityShown = '1'; });
modal.addEventListener('hidden.bs.modal', () => { modal.dataset.activityShown = '0'; });
document.getElementById('activity-date')?.addEventListener('input', () => { g_activityDateUserEdited = true; });
document.getElementById('activity-date')?.addEventListener('change', () => { g_activityDateUserEdited = true; });
modal.addEventListener('hide.bs.modal', event => {
if (g_activityAllowClose) { g_activityAllowClose = false; return; }
if (isSavingActivity) { event.preventDefault(); return; }
if (!hasUnsavedActivityChanges()) return;
event.preventDefault();
if (g_activityDiscardPending) return;
g_activityDiscardPending = true;
const confirmModal = document.getElementById('customConfirmModal');
confirmModal.addEventListener('hidden.bs.modal', () => { g_activityDiscardPending = false; }, {once:true});
myConfirm('저장하지 않은 우리 소식이 있습니다. 변경사항을 버리고 닫으시겠습니까?', () => {
g_activityAllowClose = true;
bootstrap.Modal.getOrCreateInstance(modal).hide();
});
// The shared confirmation hides before running its callback. Only for this
// prompt, wait until it is shown so an early click cannot miss that hide event.
const confirmButtons = Array.from(confirmModal.querySelectorAll('button')).map(button => [button, button.disabled]);
confirmButtons.forEach(([button]) => { button.disabled = true; });
confirmModal.addEventListener('shown.bs.modal', () => {
confirmButtons.forEach(([button, disabled]) => { button.disabled = disabled; });
}, {once:true});
});
}

function closeActivityAfterSave() {
const modal = document.getElementById('activityModal');
if (!modal?.classList.contains('show')) return Promise.resolve();
return new Promise(resolve => {
const close = () => {
g_activityAllowClose = true;
modal.addEventListener('hidden.bs.modal', resolve, {once:true});
bootstrap.Modal.getOrCreateInstance(modal).hide();
};
// Bootstrap ignores hide() during its opening animation. A quick successful
// save must still close once, before the success notice opens on top.
if (modal.dataset.activityShown === '1') close();
else modal.addEventListener('shown.bs.modal', close, {once:true});
});
}

async function ensureActivityRichEditor() {
if (!window.ApprovalRichEditor) throw new Error('편집기를 불러오지 못했습니다. 다시 시도해 주세요.');
await window.ApprovalRichEditor.loadTiptapModules();
if (!g_activityEditorBridge) g_activityEditorBridge = window.ApprovalRichEditor.createTiptapBridge({
source:'#activity-content', editor:'#activity-content-editor', toolbar:'#activity-content-toolbar',
siteColors:true,
placeholder:'우리 소식에 올릴 내용을 작성하세요.',
buildHtmlFromSource:noticeContentToEditorHtml, normalizeHtml:sanitizeAboutHtml,
askText:async (label, options) => window.prompt(label, options?.value || ''),
showMessage:message => myAlert(message, 'warning')
});
g_activityEditorBridge.ensure();
const editor = g_activityEditorBridge.getEditor();
if (editor && !document.getElementById('activity-content-editor').dataset.homePreviewBound) {
document.getElementById('activity-content-editor').dataset.homePreviewBound = 'true';
editor.on('update', queueHomePreviewUpdate);
}
return g_activityEditorBridge;
}

function updateActivitySaveLabel() {
const button = document.getElementById('btn-save-site-activity');
if (button) { button.textContent = document.getElementById('activity-visible')?.checked ? '공개로 저장' : '비공개로 저장'; button.disabled = isSavingActivity; }
}

async function openActivityModal(id, sourceEventId = '') {
if (g_activityModalOpening || isSavingActivity) return;
const modal = document.getElementById('activityModal');
if (modal?.classList.contains('show')) return;
g_activityModalOpening = true;
try {
await ensureActivityRichEditor();
bindActivityDraftGuard();
g_activityDraftBaseline = '';
g_activityAllowClose = false;
g_activityDateUserEdited = Boolean(id);
document.getElementById('activity-id').value = id || '';
document.getElementById('activity-cover-file').value = '';
document.getElementById('activity-cover-removed').value = '0';
document.getElementById('activity-cover-original').value = '';
document.getElementById('activity-title').value = '';
CoopSiteInlineHost.setStyles('activities',{});
document.getElementById('activity-date').value = getAdminMemberKstDateString();
document.getElementById('activity-content').value = '';
document.getElementById('activity-visible').checked = true;
document.getElementById('activity-history-milestone').checked = false;
document.getElementById('activity-history-title').value = '';
setActivitySourceEventId('');
setActivityGalleryItemsFromUrls([]);
let linkedSourceId = String(sourceEventId || '').trim();

if (id) {
const { data, error } = await scopeAdminTenant(_supabase.from('site_documents').select('*'))
  .eq('id', id)
  .eq('category', 'activity')
  .maybeSingle();
if (error) {
myAlert('활동 내역을 불러오지 못했습니다: ' + error.message, 'error');
return;
}
if (!data) {
myAlert('우리 소식을 찾지 못했습니다. 목록을 다시 확인해 주세요.', 'warning');
return;
}
if (data) {
const parsedActivity = parseActivityContentWithGallery(data.content || '', data.file_url || '');
document.getElementById('activity-title').value = data.title || '';
CoopSiteInlineHost.setStyles('activities',data.text_styles || {});
document.getElementById('activity-date').value = data.event_date || getAdminMemberKstDateString();
document.getElementById('activity-content').value = parsedActivity.body || '';
document.getElementById('activity-visible').checked = data.is_current !== false;
document.getElementById('activity-history-milestone').checked = data.is_history_milestone === true;
document.getElementById('activity-history-title').value = data.history_title || '';
document.getElementById('activity-cover-original').value = JSON.stringify(parsedActivity.galleryUrls);
setActivityGalleryItemsFromUrls(parsedActivity.galleryUrls);
linkedSourceId = String(data.source_participation_event_id || linkedSourceId || '').trim();
}
}

syncActivityHistoryMilestoneUi();
await loadActivityParticipationEvents(linkedSourceId);
setActivitySourceEventId(linkedSourceId);
if (!id && linkedSourceId) {
try {
await applyActivitySourceEvent(linkedSourceId, { prefill:true });
} catch (error) {
myAlert('연동할 회의·교육 기록을 불러오지 못했습니다: ' + (error?.message || error), 'error');
return;
}
}

g_activityOriginalBody = document.getElementById('activity-content').value;
g_activityEditorBridge.syncFromSource();
g_activityEditorLoadedHtml = g_activityEditorBridge.getRootHtml();
g_activityDraftBaseline = getActivityDraftSnapshot();
updateActivitySaveLabel();
bootstrap.Modal.getOrCreateInstance(modal).show();
} catch (error) {
myAlert('우리 소식 작성 화면을 열지 못했습니다: ' + (error?.message || error), 'error');
} finally { g_activityModalOpening = false; }
}

function syncActivityHistoryMilestoneUi() {
const checked = document.getElementById('activity-history-milestone')?.checked === true;
const area = document.getElementById('activity-history-title-area');
const input = document.getElementById('activity-history-title');
if (area) area.classList.toggle('hidden', !checked);
if (input) input.disabled = !checked;
}

async function saveActivity() {
if (isSavingActivity) return;
const bodyUnchanged = g_activityEditorBridge?.getRootHtml() === g_activityEditorLoadedHtml;
if (!g_activityEditorBridge?.syncToSource()) return myAlert('편집기를 먼저 불러와 주세요.', 'warning');

const title = (document.getElementById('activity-title').value || '').trim();
const eventDate = document.getElementById('activity-date').value;
// Changing only title, date, visibility or photos must not rewrite a legacy article body.
const content = bodyUnchanged ? g_activityOriginalBody : (document.getElementById('activity-content').value || '');
if (!title) return myAlert('제목을 입력하세요.', 'warning');
if (!eventDate) return myAlert('활동일을 입력하세요.', 'warning');

const id = document.getElementById('activity-id').value || null;
const isHistoryMilestone = document.getElementById('activity-history-milestone')?.checked === true;
const historyTitle = (document.getElementById('activity-history-title')?.value || '').trim();
if (historyTitle.length > 120) return myAlert('연혁용 제목은 120자 이내로 입력하세요.', 'warning');
const originalUrls = normalizeActivityGalleryUrls(safeParseArray(document.getElementById('activity-cover-original').value));
const isCurrent = document.getElementById('activity-visible').checked;
const sourceEventId = getActivitySourceEventId() || null;
let recordSaved = false;
let saveRequested = false;

isSavingActivity = true;
updateActivitySaveLabel();
showLoading(true);

try {
const finalGalleryUrls = [];
for (const item of activityGalleryItems) {
if (item?.kind === 'url' && item.url) {
finalGalleryUrls.push(item.url);
} else if (item?.kind === 'file' && item.file) {
const uploadedUrl = await uploadFileToStorage(item.file, 'site-activities');
if (uploadedUrl) {
finalGalleryUrls.push(uploadedUrl);
}
} else if (item?.kind === 'participation') {
const published = await publishActivityParticipationPhoto(item);
finalGalleryUrls.push(published.url);
}
}
const normalizedFinalGalleryUrls = normalizeActivityGalleryUrls(finalGalleryUrls);
const finalCoverUrl = normalizedFinalGalleryUrls[0] || '';
const finalContent = buildActivityContentWithGallery(content, normalizedFinalGalleryUrls);

saveRequested = true;
const { error } = await _supabase.rpc('site_activity_upsert_with_text_styles', {
p_id: id,
p_title: title,
p_date: eventDate,
p_content: finalContent,
p_file_url: finalCoverUrl || null,
p_is_current: isCurrent,
p_source_participation_event_id: sourceEventId,
p_is_history_milestone: isHistoryMilestone,
p_history_title: isHistoryMilestone ? (historyTitle || null) : null,
p_text_styles:CoopSiteInlineHost.readStyles('activities',true)
});

if (error) throw error;
recordSaved = true;

g_activityDraftBaseline = getActivityDraftSnapshot();
await closeActivityAfterSave();
releaseActivityCoverPreviewObjectUrl();
activityGalleryItems = [];
// Only a confirmed save permits old-photo cleanup. A failed refresh must
// never delete the new photos already referenced by the saved article.
const urlsToDelete = originalUrls.filter((url) => !normalizedFinalGalleryUrls.includes(url));
for (const url of urlsToDelete) await deleteActivityPhotoIfUnreferenced(url);
const refreshed = await Promise.all([fetchActivities(), fetchHistory()]);
if (refreshed.some((result) => result === false)) {
myAlert('우리 소식은 저장되었습니다. 목록을 불러오지 못했으니 새로고침해 확인해주세요. 다시 저장할 필요는 없습니다.', 'warning');
return;
}
myAlert('우리 소식이 저장되었습니다.');
} catch (e) {
CoopSafeLog.error("[saveActivity] failed:", e);
// A lost save response is not proof that the server rolled back. Preserve
// uploaded photos on all failures instead of deleting a possibly saved photo.
if (recordSaved) {
myAlert('우리 소식은 저장되었습니다. 화면 갱신 중 문제가 생겼으니 새로고침해 확인해주세요. 다시 저장할 필요는 없습니다.', 'warning');
} else if (saveRequested) {
myAlert('저장 결과를 확인하지 못했습니다. 입력 내용과 사진은 유지했습니다. 목록을 새로고침해 저장 여부를 확인한 뒤 다시 시도해주세요.', 'warning');
} else {
myAlert('사진을 처리하지 못해 저장하지 않았습니다. 입력 내용은 유지했습니다: ' + (e.message || e), 'error');
}
} finally {
showLoading(false);
isSavingActivity = false;
updateActivitySaveLabel();
}
}

function askDeleteActivity(id) {
if (!id) return;

myConfirm('이 활동 내역을 삭제하시겠습니까?\n대표 사진도 함께 정리됩니다.', async () => {
showLoading(true);
try {
const { data, error: fetchError } = await scopeAdminTenant(_supabase.from('site_documents').select('id, file_url, content'))
  .eq('id', id)
  .eq('category', 'activity')
  .maybeSingle();
if (fetchError) throw fetchError;

const { error } = await _supabase.rpc('delete_document_secure', { p_id: id });
if (error) throw error;

const parsedActivity = parseActivityContentWithGallery(data?.content || '', data?.file_url || '');
for (const url of parsedActivity.galleryUrls) {
await deleteActivityPhotoIfUnreferenced(url);
}

await fetchActivities();
myAlert('활동 내역이 삭제되었습니다.');
} catch (e) {
CoopSafeLog.error("[askDeleteActivity] failed:", e);
myAlert('삭제 실패: ' + (e.message || e), 'error');
} finally {
showLoading(false);
}
});
}

function getExternalNewsAdminScopeLabel(scope) {
return scope === 'national' ? '전국' : '광역';
}

function normalizeExternalNewsAdminUrl(value) {
try {
const url = new URL(String(value || '').trim(), window.location.origin);
if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
} catch (_) {}
return '';
}

function renderExternalNewsSyncStatus(feeds = []) {
const box = document.getElementById('externalNewsSyncStatus');
if (!box) return;
const rows = Array.isArray(feeds) ? feeds : [];
if (rows.length === 0) {
box.className = 'alert alert-light border small py-2 px-3';
box.textContent = 'RSS 동기화 설정을 불러오지 못했거나 아직 동기화 기록이 없습니다.';
return;
}
box.className = 'alert alert-light border small py-2 px-3 external-news-sync-summary';
box.innerHTML = rows.map((feed) => {
const scopeLabel = getExternalNewsAdminScopeLabel(feed.scope);
const status = String(feed.last_sync_status || '').trim();
const statusBadge = status === 'success'
? '<span class="badge bg-success">정상</span>'
: (status === 'error' ? '<span class="badge bg-danger">오류</span>' : '<span class="badge bg-secondary">대기</span>');
const syncedAt = feed.last_synced_at ? formatAdminMemberKstDateTime(feed.last_synced_at) : '아직 없음';
const message = escapeHtml(feed.last_sync_message || '');
return `<span>${escapeHtml(scopeLabel)} ${statusBadge} <span class="text-muted">최근 ${escapeHtml(syncedAt)}</span>${message ? ` <span class="text-muted">· ${message}</span>` : ''}</span>`;
}).join('');
}

async function fetchExternalNewsAdmin() {
const tbody = document.getElementById('externalNewsListBody');
if (tbody) {
tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">외부 소식을 불러오는 중...</td></tr>';
}

const [feedsResult, newsResult] = await Promise.all([
scopeAdminTenant(_supabase.from('site_external_news_feeds').select('*')).order('scope', { ascending: true }),
scopeAdminTenant(_supabase.from('site_external_news').select('*'))
  .order('published_at', { ascending: false, nullsFirst: false })
  .order('updated_at', { ascending: false })
  .limit(40)
]);

if (feedsResult.error) {
CoopSafeLog.error("[fetchExternalNewsAdmin] feed failed:", feedsResult.error);
renderExternalNewsSyncStatus([]);
}
else {
renderExternalNewsSyncStatus(feedsResult.data || []);
}

if (!tbody) return;
if (newsResult.error) {
CoopSafeLog.error("[fetchExternalNewsAdmin] news failed:", newsResult.error);
tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">외부 소식을 불러오지 못했습니다.</td></tr>';
return;
}

g_externalNewsAdmin = Array.isArray(newsResult.data) ? newsResult.data : [];
if (g_externalNewsAdmin.length === 0) {
tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">동기화된 외부 소식이 없습니다. 우측 상단 RSS 동기화를 실행하세요.</td></tr>';
return;
}

tbody.innerHTML = g_externalNewsAdmin.map((row) => {
const imageUrl = normalizeExternalNewsAdminUrl(row.image_url);
const linkUrl = normalizeExternalNewsAdminUrl(row.external_link);
const thumbHtml = imageUrl
? `<img class="external-news-thumb-admin" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(row.title || '외부 소식 썸네일')}">`
: '<span class="text-muted small">없음</span>';
const statusBadge = row.removed_at
? '<span class="badge bg-secondary ms-1">비노출</span>'
: '<span class="badge bg-success ms-1">노출</span>';
return `<tr>
<td class="text-center">${escapeHtml(getExternalNewsAdminScopeLabel(row.scope))}${statusBadge}</td>
<td class="text-center">${thumbHtml}</td>
<td class="text-start">
  <div class="fw-bold">${escapeHtml(row.title || '-')}</div>
  ${linkUrl ? `<a class="small text-decoration-none" href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener">원문 열기</a>` : '<span class="small text-muted">원문 링크 없음</span>'}
</td>
<td class="text-center">${escapeHtml(formatAdminMemberKstDate(row.published_at, '-'))}</td>
<td class="text-center">${escapeHtml(row.source_name || '-')}</td>
</tr>`;
}).join('');
}

async function syncExternalNewsAdmin() {
showLoading(true);
try {
const { data, error } = await invokeAdminMemberEdgeFunction('site-news-rss-sync', {
scopes: ['regional', 'national']
});

if (error) {
CoopSafeLog.error("[syncExternalNewsAdmin] failed:", error);
await fetchExternalNewsAdmin();
const errorMessage = await getAdminMemberEdgeErrorMessage(error);
return myAlert('RSS 동기화 실패: ' + errorMessage, 'error');
}

await fetchExternalNewsAdmin();
const totalUpserted = Number(data?.total_upserted || 0);
const totalRemoved = Number(data?.total_removed || 0);
myAlert(`RSS 동기화가 완료되었습니다. (${totalUpserted.toLocaleString('ko-KR')}건 반영, ${totalRemoved.toLocaleString('ko-KR')}건 비노출)`);
} finally {
showLoading(false);
}
}

function hasPartnerPendingChanges(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.keys(value).some((key) => {
        const cell = value[key];
        return String(cell ?? '').trim() !== '';
    });
} // End of hasPartnerPendingChanges

function resolvePartnerPendingPreview(partner) {
    const pending = hasPartnerPendingChanges(partner?.pending_changes) ? partner.pending_changes : null;
    return {
        name: pending?.name || partner?.name || '-',
        description: pending?.description || partner?.description || '-',
        badgeLabel: pending ? '수정 요청' : '신규 신청'
    };
} // End of resolvePartnerPendingPreview

function renderPartnerSyncedBadgePreview(badgeCodes, emptyMessage, noteMessage) {
    const box = document.getElementById('partner-badge-preview');
    const note = document.getElementById('partner-badge-note');
    if (!box || !note) return;

    note.textContent = noteMessage || '조합원 관리에서 부여한 뱃지가 실시간 연동됩니다.';

    const codes = Array.isArray(badgeCodes) ? badgeCodes.filter(Boolean) : [];
    if (!codes.length) {
        box.innerHTML = `<span class="small text-muted">${escapeHtml(emptyMessage || '연동된 뱃지가 없습니다.')}</span>`;
        return;
    }

    let html = '';
    codes.forEach((code) => {
        const badge = (g_badges || []).find((item) => item.code === code);
        if (badge) html += Badges.renderPill(badge);
    });

    box.innerHTML = html || `<span class="small text-muted">${escapeHtml(emptyMessage || '연동된 뱃지가 없습니다.')}</span>`;
} // End of renderPartnerSyncedBadgePreview

async function fetchPartnerMemberBadgeCodes(memberId) {
    const safeMemberId = String(memberId || '').trim();
    if (!safeMemberId) return { found: false, codes: [] };

    const { data: member, error: memberError } = await scopeAdminTenant(
        _supabase.from('coop_members').select('id').eq('member_id', safeMemberId).maybeSingle()
    );
    if (memberError) throw memberError;
    if (!member || !member.id) return { found: false, codes: [] };

    const { data: rows, error: badgeError } = await scopeAdminTenant(
        _supabase.from('coop_member_badges').select('badge_id').eq('member_uid', member.id)
    );
    if (badgeError) throw badgeError;

    const codes = [];
    (rows || []).forEach((row) => {
        const badge = (g_badges || []).find((item) => Number(item.id) === Number(row.badge_id));
        if (badge && badge.code && !codes.includes(badge.code)) codes.push(badge.code);
    });

    return { found: true, codes };
} // End of fetchPartnerMemberBadgeCodes

async function refreshPartnerBadgeSyncPreview(memberId, fallbackCodes = []) {
    const seq = ++g_partnerBadgePreviewRequestSeq;
    const safeMemberId = String(memberId || '').trim();

    if (!safeMemberId) {
        renderPartnerSyncedBadgePreview(
            Array.isArray(fallbackCodes) ? fallbackCodes : [],
            '조합원 번호를 입력하면 연동된 뱃지가 표시됩니다.',
            '조합원 관리에서 부여한 뱃지가 실시간 연동됩니다.'
        );
        return;
    }

    try {
        const result = await fetchPartnerMemberBadgeCodes(safeMemberId);
        if (seq !== g_partnerBadgePreviewRequestSeq) return;

        if (!result.found) {
            renderPartnerSyncedBadgePreview(
                [],
                '일치하는 조합원을 찾지 못했습니다.',
                '저장 시 연동 뱃지는 비워집니다.'
            );
            return;
        }

        renderPartnerSyncedBadgePreview(
            result.codes,
            '이 조합원에 부여된 뱃지가 없습니다.',
            '조합원 관리에서 부여한 뱃지가 실시간 연동됩니다.'
        );
    } catch (error) {
        CoopSafeLog.warn("refreshPartnerBadgeSyncPreview failed:", error);
        if (seq !== g_partnerBadgePreviewRequestSeq) return;
        renderPartnerSyncedBadgePreview(
            Array.isArray(fallbackCodes) ? fallbackCodes : [],
            '연동된 뱃지를 불러오지 못했습니다.',
            '조합원 관리에서 부여한 뱃지가 실시간 연동됩니다.'
        );
    }
} // End of refreshPartnerBadgeSyncPreview

function bindPartnerBadgeSyncInput() {
    const input = document.getElementById('pt-member-id');
    if (!input || input.dataset.badgeSyncBound === '1') return;

    const queueRefresh = () => {
        clearTimeout(g_partnerBadgeSyncTimer);
        const nextMemberId = input.value;
        g_partnerBadgeSyncTimer = setTimeout(() => {
            refreshPartnerBadgeSyncPreview(nextMemberId, []);
        }, 180);
    };

    input.addEventListener('input', queueRefresh);
    input.addEventListener('change', queueRefresh);
    input.addEventListener('blur', queueRefresh);
    input.dataset.badgeSyncBound = '1';
} // End of bindPartnerBadgeSyncInput

function parsePartnerRequestSnapshot(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
        return {};
    }
} // End of parsePartnerRequestSnapshot

function getPartnerRequestKindLabel(kind) {
    const value = String(kind || '').trim();
    if (value === 'new') return '신규 신청';
    if (value === 'pending_update') return '대기 신청 수정';
    if (value === 'active_update') return '수정 요청';
    if (value === 'client_failure') return '화면 처리 실패';
    return '확인 필요';
} // End of getPartnerRequestKindLabel

function getPartnerRequestStageLabel(stage) {
    const value = String(stage || '').trim();
    if (value === 'database_request') return '신청 저장';
    if (value === 'logo_upload') return '로고 업로드';
    if (value === 'rpc_call') return '신청 호출';
    return '확인 필요';
} // End of getPartnerRequestStageLabel

function getPartnerRequestOutcomeBadge(outcome) {
    const value = String(outcome || '').trim();
    if (value === 'success') return '<span class="badge bg-success">성공</span>';
    if (value === 'failure') return '<span class="badge bg-danger">실패</span>';
    return '<span class="badge bg-secondary">확인</span>';
} // End of getPartnerRequestOutcomeBadge

function renderPartnerRequestLogs(rows) {
    const tbody = document.getElementById('partnerRequestLogBody');
    const summary = document.getElementById('partnerRequestLogSummary');
    if (!tbody) return;

    const list = Array.isArray(rows) ? rows : [];
    if (summary) {
        summary.textContent = list.length > 0
            ? `최근 ${list.length.toLocaleString('ko-KR')}건 표시`
            : '';
    }

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">아직 기록된 파트너 신청 이력이 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map((row) => {
        const snapshot = parsePartnerRequestSnapshot(row.request_snapshot);
        const partnerName = snapshot.partner_name || snapshot.name || '-';
        const hasLogo = snapshot.has_logo === true ? '<div class="partner-request-log-snapshot">로고 포함</div>' : '';
        const linkUrl = String(snapshot.link_url || '').trim();
        const linkHint = linkUrl ? '<div class="partner-request-log-snapshot">링크 입력</div>' : '';
        const message = String(row.message || '').trim() || '-';

        return `
            <tr>
                <td class="text-center small">${escapeHtml(formatAdminMemberKstDateTimeSeconds(row.created_at, '-'))}</td>
                <td class="text-center">${getPartnerRequestOutcomeBadge(row.outcome)}</td>
                <td>
                    <div class="fw-semibold">${escapeHtml(getPartnerRequestStageLabel(row.stage))}</div>
                    <div class="small text-muted">${escapeHtml(getPartnerRequestKindLabel(row.request_kind))}</div>
                </td>
                <td class="text-center">${escapeHtml(row.target_member_id || '-')}</td>
                <td>
                    <div class="fw-semibold">${escapeHtml(partnerName)}</div>
                    ${hasLogo}${linkHint}
                </td>
                <td class="partner-request-log-message">${escapeHtml(message)}</td>
            </tr>`;
    }).join('');
} // End of renderPartnerRequestLogs

async function fetchPartnerRequestLogs() {
    const tbody = document.getElementById('partnerRequestLogBody');
    const summary = document.getElementById('partnerRequestLogSummary');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">신청 이력을 불러오는 중...</td></tr>';
    if (summary) summary.textContent = '';

    try {
        const { data, error } = await scopeAdminTenant(
            _supabase
                .from('site_partner_request_logs')
                .select('id, target_member_id, request_kind, outcome, stage, message, request_snapshot, created_at')
        )
            .order('created_at', { ascending: false })
            .limit(PARTNER_REQUEST_LOG_LIMIT);

        if (error) throw error;
        renderPartnerRequestLogs(data || []);
    } catch (error) {
        CoopSafeLog.error("fetchPartnerRequestLogs failed:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-4">신청 이력을 불러오지 못했습니다.<br><small>${escapeHtml(error.message || error)}</small></td></tr>`;
    }
} // End of fetchPartnerRequestLogs

async function fetchPartners() {
    await ensureBadgesReady();
    const { data: list, error } = await scopeAdminTenant(_supabase.from('site_partners').select('*')).order('display_order');
    if(error) { CoopSafeLog.error("[erp/admin_member] operation failed", error); return; }

    // 1. 뱃지 데이터 로드 (Badges 모듈 사용)
    if (!g_badges || g_badges.length === 0) {
        g_badges = await Badges.getAll(_supabase);
    }

    const pendingBody = document.getElementById('partnerPendingBody');
    const activeBody = document.getElementById('partnerActiveBody');
    pendingBody.innerHTML = ''; activeBody.innerHTML = '';

    // 상태별 분리
    const pendingList = list.filter((p) => p.status === 'pending' || hasPartnerPendingChanges(p.pending_changes));
    const activeList = list.filter(p => p.status !== 'pending');

    // (A) 대기 목록
    if(pendingList.length === 0) pendingBody.innerHTML = '<tr><td class="text-center text-muted py-3 small">승인 대기 중인 신청이 없습니다.</td></tr>';
    else {
        pendingList.forEach(p => {
            const preview = resolvePartnerPendingPreview(p);
            const partnerIdArg = escapeJsString(String(p.id || ''));
            const badgeClass = preview.badgeLabel === '수정 요청' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning-emphasis';
            const autoLinkedBadge = p.auto_linked === true
                ? '<span class="badge rounded-pill bg-primary-subtle text-primary">정조합원 자동 연동</span>'
                : '';
            pendingBody.innerHTML += `
                <tr class="bg-warning bg-opacity-10">
                    <td class="align-middle fw-bold ps-3">
                        <div class="d-flex align-items-center gap-2">
                            <span>${escapeHtml(preview.name || '')}</span>
                            <span class="badge rounded-pill ${badgeClass}">${escapeHtml(preview.badgeLabel || '')}</span>
                            ${autoLinkedBadge}
                        </div>
                    </td>
                    <td class="align-middle small text-muted">${escapeHtml(preview.description || '')}</td>
                    <td class="align-middle text-end pe-3">
                        <button class="btn btn-sm btn-primary" onclick="openPartnerModal('${partnerIdArg}')">${preview.badgeLabel === '수정 요청' ? '검토' : '검토·승인'}</button>
                    </td>
                </tr>`;
        });
    }

    // (B) 등록 목록
    if(activeList.length === 0) activeBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">등록된 파트너가 없습니다.</td></tr>';
    else {
        activeList.forEach(p => {
            const partnerIdArg = escapeJsString(String(p.id || ''));
            let badgesHtml = '';
            // ★ [핵심 변경] badges.js의 renderPill 사용
            if(p.badges && p.badges.length > 0) {
                p.badges.forEach(bCode => {
                    const b = g_badges.find(item => item.code === bCode);
                    badgesHtml += Badges.renderPill(b);
                });
            }
            const logoUrl = normalizeAdminHttpUrl(p.logo_url);
            const logo = logoUrl
                ? `<div class="partner-logo-thumb"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(p.name || '협력단체 로고')}"></div>`
                : '-';
            const hasPending = hasPartnerPendingChanges(p.pending_changes);
            const pendingBadge = hasPending ? '<span class="badge rounded-pill bg-danger-subtle text-danger ms-2">수정 요청</span>' : '';
            const pendingDesc = hasPending
                ? `<div class="small text-danger-emphasis mt-1">승인 대기 중인 수정 요청이 있습니다.</div>`
                : '';
            const memberLinkBadge = p.member_id
                ? (p.member_eligible === false
                    ? '<span class="badge rounded-pill bg-danger-subtle text-danger ms-2">정조합원 자격 확인 필요 · 홈페이지 제외</span>'
                    : '<span class="badge rounded-pill bg-primary-subtle text-primary ms-2">단체 조합원 연동</span>')
                : '';

            activeBody.innerHTML += `
                <tr>
                    <td class="text-center">${escapeHtml(p.display_order ?? '')}</td>
                    <td class="text-center">${logo}</td>
                    <td>
                        <div class="fw-bold">${escapeHtml(p.name || '')}${pendingBadge}${memberLinkBadge}</div>
                        <div class="small text-muted text-truncate" style="max-width:200px;">${escapeHtml(p.description || '-')}</div>
                        ${pendingDesc}
                    </td>
                    <td>${badgesHtml}</td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-light" onclick="openPartnerModal('${partnerIdArg}')">${hasPending ? '검토' : '수정'}</button>
                        <button class="btn btn-sm btn-outline-danger ms-1" onclick="askDeletePartner('${partnerIdArg}')">삭제</button>
                    </td>
                </tr>`;
        });
    }
}

async function openPartnerModal(id) {
    const modal = document.getElementById('partnerModal');
    if (g_partnerModalOpening || g_partnerSaving || modal.classList.contains('show')) return;
    g_partnerModalOpening = true;
    try {
    await ensureBadgesReady();

    // 1. 뱃지 데이터 로드
    if (!g_badges || g_badges.length === 0) {
        g_badges = await Badges.getAll(_supabase);
    }

    // 2. 수정 모드
    if(id) {
        const { data, error } = await scopeAdminTenant(_supabase.from('site_partners').select('*')).eq('id', id).single();
        if (error || !data) throw error || new Error('PARTNER_NOT_FOUND');

        if(data) {
            // 수정 요청은 active 상태에서도 pending_changes에 저장되므로 요청본을 우선 로드합니다.
            let displayData = data;
            let isModification = false;

            if (hasPartnerPendingChanges(data.pending_changes)) {
                // 원본 데이터 위에 변경 요청 데이터를 덮어씀
                displayData = { ...data, ...data.pending_changes };
                isModification = true;
            }

            // 폼 바인딩 (displayData 사용)
            document.getElementById('pt-name').value = displayData.name;
            document.getElementById('pt-member-id').value = displayData.member_id || '';
            document.getElementById('pt-desc').value = displayData.description || '';
            document.getElementById('pt-link').value = displayData.link_url || '';
            document.getElementById('pt-status').value = displayData.status || 'active';
            document.getElementById('pt-order').value = displayData.display_order || 99;
            document.getElementById('pt-member-eligible').value = data.member_id ? String(data.member_eligible !== false) : '';

            const memberLinkStatus = document.getElementById('pt-member-link-status');
            if (data.member_id && data.member_eligible === false) {
                memberLinkStatus.className = 'small mb-2 text-danger fw-semibold';
                memberLinkStatus.textContent = '현재 정상 상태의 단체 조합원이 아니므로 승인(노출)할 수 없습니다.';
            } else if (data.auto_linked === true) {
                memberLinkStatus.className = 'small mb-2 text-primary fw-semibold';
                memberLinkStatus.textContent = '정조합원 승인으로 자동 연결된 후보입니다. 내용을 확인한 뒤 최초 공개를 승인하세요.';
            } else if (data.member_id) {
                memberLinkStatus.className = 'small mb-2 text-success fw-semibold';
                memberLinkStatus.textContent = '정상 상태의 단체 조합원과 연결되어 있습니다.';
            } else {
                memberLinkStatus.className = 'small mb-2 text-muted';
                memberLinkStatus.textContent = '조합원 번호가 없는 수동 등록 파트너입니다.';
            }

            // 알림 메시지 (수정 요청인 경우 표시)
            const header = document.querySelector('#partnerModal .modal-header h5');
            if(isModification) {
                header.innerHTML = `🤝 파트너 승인 <span class="badge bg-danger ms-2">수정 요청본</span>`;
                myAlert("⚠️ 사용자가 수정을 요청한 내용이 입력란에 표시됩니다.\n내용을 확인 후 '저장하기'를 누르면 승인(적용)됩니다.", 'warning');
            } else {
                header.innerHTML = `🤝 협력 단체 관리`;
            }

            // 뱃지 체크박스
            bindPartnerBadgeSyncInput();
            await refreshPartnerBadgeSyncPreview(displayData.member_id || '', displayData.badges || []);

            // 이미지 프리뷰
            handleImagePreview('pt', displayData.logo_url);
        }
    }
    // 3. 신규 모드
    else {
        document.getElementById('pt-name').value = '';
        document.getElementById('pt-member-id').value = '';
        document.getElementById('pt-desc').value = '';
        document.getElementById('pt-link').value = '';
        document.getElementById('pt-status').value = 'active'; // 관리자가 직접 등록하니 active 기본
        document.getElementById('pt-order').value = 99;
        document.getElementById('pt-member-eligible').value = '';
        const memberLinkStatus = document.getElementById('pt-member-link-status');
        memberLinkStatus.className = 'small mb-2 text-muted';
        memberLinkStatus.textContent = '조합원 번호를 연결하면 정상 상태의 단체 조합원인지 서버에서 확인합니다.';

        document.querySelector('#partnerModal .modal-header h5').innerText = '🤝 협력 단체 등록';
        bindPartnerBadgeSyncInput();
        await refreshPartnerBadgeSyncPreview('', []);
        handleImagePreview('pt', null);
    }

    document.getElementById('pt-id').value = id || '';
    document.getElementById('pt-file').value = '';
    bootstrap.Modal.getOrCreateInstance(modal).show();
    } catch (error) {
        CoopSafeLog.error('Partner detail load failed:', error);
        myAlert('단체 정보를 불러오지 못했습니다. 잠시 후 다시 눌러주세요. 문제가 계속되면 새로고침한 뒤 다시 확인해주세요.', 'error');
    } finally {
        g_partnerModalOpening = false;
    }
}

async function savePartner() {
if (g_partnerSaving) return;
const name = document.getElementById('pt-name').value;
if(!name) return myAlert('단체명을 입력하세요.', 'warning');
const requestedStatus = document.getElementById('pt-status').value;
if (requestedStatus === 'active' && document.getElementById('pt-member-eligible').value === 'false') {
return myAlert('정상 상태의 단체 조합원만 홈페이지 공개를 승인할 수 있습니다.', 'warning');
}

// ★ [핵심] 빈 문자열 ID를 NULL로 변환 (BigInt/UUID 에러 방지)
let idVal = document.getElementById('pt-id').value;
if (!idVal || idVal.trim() === '') idVal = null;

// 1. 파일 업로드 (공통 함수 사용으로 코드 대폭 단축)
const fileInput = document.getElementById('pt-file');
const originalUrl = document.getElementById('pt-img-original').value;
const finalImgUrl = document.getElementById('pt-img-url').value;
const newFile = fileInput.files[0] || null;
// Collect first; only a confirmed database save can authorize old-file cleanup.
const updates = {
p_id: idVal, // NULL 또는 UUID
p_name: name,
p_link_url: document.getElementById('pt-link').value,
p_logo_url: finalImgUrl,
p_display_order: Number(document.getElementById('pt-order').value),
p_description: document.getElementById('pt-desc').value,
p_member_id: document.getElementById('pt-member-id').value,
p_status: requestedStatus,
p_badges: []
};

g_partnerSaving = true;
showLoading(true);
try {
if (newFile) updates.p_logo_url = await uploadFileToStorage(newFile, 'partners');
const { error } = await _supabase.rpc('upsert_partner_secure', updates);
if (error) throw error;
// On a failed or uncertain save retain both files: the server may have committed
// before its response was lost. Never remove the photo still used by the record.
if (originalUrl && originalUrl !== updates.p_logo_url) await deleteOldFile(originalUrl);
bootstrap.Modal.getInstance(document.getElementById('partnerModal')).hide();
await fetchPartners();
} catch (error) {
myAlert('저장 실패: ' + (error?.hint || error?.message || error), 'error');
} finally {
showLoading(false);
g_partnerSaving = false;
}
}

function askDeletePartner(id) {
deleteType = 'partner'; // confirmDelete 함수에서 처리하도록 분기 추가 필요
document.getElementById('delete-target-id').value = id;
document.getElementById('btn-real-delete').onclick = confirmDelete;
new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}

function handleImagePreview(prefix, url) {
document.getElementById(`${prefix}-img-original`).value = url || '';
document.getElementById(`${prefix}-img-url`).value = url || '';
const preview = document.getElementById(`${prefix}-img-preview`);
const placeholder = document.getElementById(`${prefix}-img-placeholder`);

if(url) {
preview.src = url; preview.style.display = 'block'; placeholder.style.display = 'none';
} else {
preview.src = ''; preview.style.display = 'none'; placeholder.style.display = 'block';
}
}

function previewPartnerImage(input) {
if(input.files && input.files[0]) {
const reader = new FileReader();
reader.onload = function(e) {
document.getElementById('pt-img-preview').src = e.target.result;
document.getElementById('pt-img-preview').style.display = 'block';
document.getElementById('pt-img-placeholder').style.display = 'none';
};
reader.readAsDataURL(input.files[0]);
}
}

function clearPartnerImage() {
document.getElementById('pt-file').value = '';
document.getElementById('pt-img-url').value = '';
document.getElementById('pt-img-preview').style.display = 'none';
document.getElementById('pt-img-placeholder').style.display = 'block';
}

async function fetchFaqs() {
const keyword = document.getElementById('search-faq').value;

// DB 조회 (순서대로)
let query = scopeAdminTenant(_supabase.from('site_faqs').select('*')).order('display_order', { ascending: true });

// 검색어가 있으면 필터링
if (keyword) {
query = query.ilike('question', `%${keyword}%`);
}

const { data: list, error } = await query;
if (error) { CoopSafeLog.error("[erp/admin_member] operation failed", error); return false; }

const tbody = document.getElementById('faqListBody');
if (!tbody) return false; // 탭이 없으면 패스
tbody.innerHTML = '';

if (!list || list.length === 0) {
tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">등록된 질문이 없습니다.</td></tr>';
return true;
}

tbody.innerHTML = list.map(f => {
const badge = f.is_visible
? '<span class="badge bg-success">공개</span>'
: '<span class="badge bg-secondary">숨김</span>';

const answerPreview = f.answer && f.answer.length > 50
? f.answer.substring(0, 50) + '...'
: f.answer;
const faqId = String(f.id ?? '');

return `
           <tr>
               <td class="text-center">${escapeHtml(f.display_order ?? '')}</td>
               <td class="text-center"><span class="badge bg-light text-dark border">${escapeHtml(f.category || '')}</span></td>
               <td>
                   <div class="fw-bold text-primary mb-1">Q. ${escapeHtml(f.question || '')}</div>
                   <div class="small text-muted text-truncate" style="max-width:400px;">A. ${escapeHtml(answerPreview || '')}</div>
               </td>
               <td class="text-center">${badge}</td>
               <td class="text-center">
                   <button class="btn btn-sm btn-light" type="button" data-open-faq="${escapeHtml(faqId)}">수정</button>
                   <button class="btn btn-sm btn-outline-danger ms-1" type="button" data-delete-faq="${escapeHtml(faqId)}">삭제</button>
               </td>
           </tr>
       `;
}).join('');
tbody.querySelectorAll('[data-open-faq]').forEach((button) => {
    button.addEventListener('click', () => openFaqModal(button.dataset.openFaq));
});
tbody.querySelectorAll('[data-delete-faq]').forEach((button) => {
    button.addEventListener('click', () => askDeleteFaq(button.dataset.deleteFaq));
});
return true;
}

function closeFaqAfterSave() {
const modal = document.getElementById('faqModal');
if (!modal?.classList.contains('show')) return Promise.resolve();
return new Promise(resolve => {
const close = () => {
modal.addEventListener('hidden.bs.modal', resolve, {once:true});
bootstrap.Modal.getOrCreateInstance(modal).hide();
};
if (modal.dataset.faqShown === '1') close();
else modal.addEventListener('shown.bs.modal', close, {once:true});
});
}

async function openFaqModal(id) {
const modal = document.getElementById('faqModal');
if (g_faqModalOpening || g_faqSaving || modal.classList.contains('show')) return;
if (modal.dataset.faqSaveGuardBound !== '1') {
modal.addEventListener('show.bs.modal', () => { modal.dataset.faqShown = '0'; });
modal.addEventListener('shown.bs.modal', () => { modal.dataset.faqShown = '1'; });
modal.addEventListener('hidden.bs.modal', () => { modal.dataset.faqShown = '0'; });
modal.addEventListener('hide.bs.modal', event => {
if (g_faqSaving && !g_faqSaveConfirmed) event.preventDefault();
});
modal.dataset.faqSaveGuardBound = '1';
}
g_faqModalOpening = true;
try {

if (id) {
// 수정 모드
const { data, error } = await scopeAdminTenant(_supabase.from('site_faqs').select('*')).eq('id', id).single();
if (error || !data) throw error || new Error('FAQ_NOT_FOUND');
if (data) {
document.getElementById('faq-category').value = data.category || '기타';
document.getElementById('faq-order').value = data.display_order;
document.getElementById('faq-visible').checked = data.is_visible;
document.getElementById('faq-question').value = data.question;
document.getElementById('faq-answer').value = data.answer;
}
} else {
// 신규 모드
document.getElementById('faq-category').value = '가입/탈퇴';
document.getElementById('faq-order').value = 0; // 맨 앞
document.getElementById('faq-visible').checked = true;
document.getElementById('faq-question').value = '';
document.getElementById('faq-answer').value = '';
}

document.getElementById('faq-id').value = id || '';
bootstrap.Modal.getOrCreateInstance(modal).show();
} catch (error) {
CoopSafeLog.error('FAQ detail load failed:', error);
myAlert('질문과 답변을 불러오지 못했습니다. 잠시 후 해당 질문의 수정을 다시 눌러주세요.', 'error');
} finally {
g_faqModalOpening = false;
}
}

async function saveFaq() {
if (g_faqSaving) return;
const question = document.getElementById('faq-question').value;
const answer = document.getElementById('faq-answer').value;

if (!question.trim() || !answer.trim()) return myAlert('질문과 답변을 모두 입력해주세요.', 'warning');

// ID 처리 (UUID 오류 방지)
let idVal = document.getElementById('faq-id').value;
if (!idVal || idVal.trim() === '') idVal = null;

const updates = {
p_id: idVal,
p_category: document.getElementById('faq-category').value,
p_display_order: Number(document.getElementById('faq-order').value),
p_is_visible: document.getElementById('faq-visible').checked,
p_question: question,
p_answer: answer
};

const modal = document.getElementById('faqModal');
const button = document.getElementById('btn-save-faq');
const controls = Array.from(modal.querySelectorAll('input,textarea,select,button')).map(control => [control, control.disabled]);
const buttonLabel = button.textContent;
g_faqSaving = true;
g_faqSaveConfirmed = false;
controls.forEach(([control]) => { control.disabled = true; });
button.textContent = '저장 중…';
button.setAttribute('aria-busy', 'true');
showLoading(true);
try {
const { error } = await _supabase.rpc('upsert_faq_secure', updates);
if (error) {
// The client can return a transport error instead of throwing. It is not
// evidence that the server rolled back; preserve the draft in either case.
throw error;
}
g_faqSaveConfirmed = true;
await closeFaqAfterSave();
try {
if (await fetchFaqs() === false) throw new Error('FAQ_LIST_REFRESH_FAILED');
} catch (error) {
CoopSafeLog.error('FAQ saved; list refresh failed:', error);
myAlert('질문은 저장되었습니다. 목록을 갱신하지 못했으니 잠시 후 검색을 눌러 확인해주세요. 다시 저장할 필요는 없습니다.', 'warning');
}
} catch (error) {
CoopSafeLog.error('FAQ save result unavailable:', error);
myAlert('저장 결과를 확인하지 못했습니다. 입력 내용은 그대로 유지됩니다. 중복 등록을 피하려면 목록에서 저장 여부를 먼저 확인해주세요.', 'warning');
} finally {
showLoading(false);
controls.forEach(([control, disabled]) => { control.disabled = disabled; });
button.textContent = buttonLabel;
button.removeAttribute('aria-busy');
g_faqSaving = false;
g_faqSaveConfirmed = false;
}
}

function askDeleteFaq(id) {
  deleteType = 'faq';
  document.getElementById('delete-target-id').value = id;
  document.getElementById('btn-real-delete').onclick = confirmDelete;
  new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
}
    let initialized = false;
    function initialize() {
        if (initialized) return;
// Establish the initial lock before a delayed tab handler can allow typing.
CoopHomeVisualEditor.mount(); // Mount before taking the initial draft snapshot.
getSiteEditorDraft('home');
getSiteEditorDraft('about');

window.addEventListener('beforeunload', (event) => {
if (hasPendingSectionChanges() || Array.from(g_siteEditorDrafts.values()).some(draft => draft.refresh().dirty) || hasUnsavedActivityChanges()) {
event.preventDefault();
event.returnValue = '';
}
});


window.addEventListener('message', (event) => {
if (event.data?.type !== 'coop-home-preview-ready') return;
const frame = document.getElementById('site-home-preview-frame');
if (!frame?.src) return;
let targetOrigin = '';
try {
targetOrigin = new URL(frame.src).origin;
} catch (_) {
return;
}
if (event.origin !== targetOrigin || event.source !== frame.contentWindow) return;
g_homePreviewSourceWindow = event.source;
window.setTimeout(sendHomePreviewSettings, 0);
});


        initialized = true;
    }
    Object.assign(root, { normalizeHistoryContentForCompare, isHistoryRowMatched, updateSiteHistoryContentCounter, openSiteHistoryModal, saveSiteHistory, openSectionSettings, loadInitialSiteSections, getSectionDisplayOrder, createSectionSnapshot, createSectionExpectedSnapshot, hasPendingSectionChanges, updateSectionSaveButton, getSortedSectionDrafts, renderSectionRows, renderSectionSeedHint, renderSectionSeedButton, fetchSections, loadSectionRows, applySectionRows, reloadSectionSettings, showSectionSaveError, seedRequiredSections, moveSectionOrder, toggleSection, saveSectionChanges, askDeleteHistory, confirmDeleteHistory, getSiteSectionEditorTarget, openSiteSectionEditor, siteEditorFormSnapshot, getSiteEditorDraft, setHomeImagePreview, previewHomeImage, clearHomeImage, updateHomeOverlayLabel, setHomeCtaValue, toggleHomeCtaCustom, readHomeCtaValue, normalizeHomeImpactRegions, renderHomeImpactRegions, addHomeImpactRegion, readHomeImpactRegions, updateHomeImpactModeUi, setHomeSettingsMode, handleHomeSettingsModeKey, initializeHomeFontOptions, updateHomeFontSelection, selectHomeFontPair, recommendHomeFonts, selectHomeTemplate, setHomeSettingsForm, fetchHomeSettings, validateHomeCtaUrl, collectHomeSettingsPayload, saveHomeSettings, readHomePreviewFile, collectSitePreviewDraft, collectHomePreviewSettings, getHomePreviewUrl, sendHomePreviewSettings, queueHomePreviewUpdate, bindHomePreviewInputs, setHomePreviewDevice, openHomePreview, aboutHtmlToEditableText, parseAboutListItems, revokeAboutPreviewObjectUrl, setAboutImageStatus, previewAboutImageFile, clearAboutImage, isManagedAboutImageUrl, deleteManagedAboutImage, fetchAboutSettings, queueTotalPreviewUpdate, updateTotalPreview, saveAboutSettings, formatCertificationDate, resetSiteCertificationForm, clearSiteCertificationImage, editSiteCertification, renderSiteCertifications, fetchSiteCertifications, isManagedCertificationImageUrl, deleteManagedCertificationImage, saveSiteCertification, askDeleteSiteCertification, normalizeActivityGalleryUrls, parseActivityContentWithGallery, buildActivityContentWithGallery, normalizeActivityContentForEditor, releaseActivityCoverPreviewObjectUrl, getActivityGalleryUrlsFromState, syncActivityCoverHiddenFields, renderActivityCoverPreview, setActivityGalleryItemsFromUrls, setActivityCoverState, addActivityGalleryFiles, previewActivityCover, handleActivityGalleryDrag, handleActivityGalleryDrop, setActivityGalleryCover, removeActivityGalleryImage, clearActivityCover, getActivitySourceEventId, setActivitySourceEventId, formatActivitySourceEventDate, activitySourceTypeLabel, loadActivityParticipationEvents, getActivityParticipationPhotoPreview, buildActivitySourceSummary, applyActivitySourceEvent, loadSelectedActivitySourceEvent, activityPublishedPhotoExtension, publishActivityParticipationPhoto, deleteActivityPhotoIfUnreferenced, fetchActivities, getActivityDraftSnapshot, hasUnsavedActivityChanges, bindActivityDraftGuard, closeActivityAfterSave, ensureActivityRichEditor, updateActivitySaveLabel, openActivityModal, syncActivityHistoryMilestoneUi, saveActivity, askDeleteActivity, getExternalNewsAdminScopeLabel, normalizeExternalNewsAdminUrl, renderExternalNewsSyncStatus, fetchExternalNewsAdmin, syncExternalNewsAdmin, hasPartnerPendingChanges, resolvePartnerPendingPreview, renderPartnerSyncedBadgePreview, fetchPartnerMemberBadgeCodes, refreshPartnerBadgeSyncPreview, bindPartnerBadgeSyncInput, parsePartnerRequestSnapshot, getPartnerRequestKindLabel, getPartnerRequestStageLabel, getPartnerRequestOutcomeBadge, renderPartnerRequestLogs, fetchPartnerRequestLogs, fetchPartners, openPartnerModal, savePartner, askDeletePartner, handleImagePreview, previewPartnerImage, clearPartnerImage, fetchFaqs, closeFaqAfterSave, openFaqModal, saveFaq, askDeleteFaq });
    root.AdminMemberSite = Object.freeze({ version: '20261010-3', initialize, isInitialized: () => initialized });
})(window);
