'use strict';
let memberInformationSummaryRequest = 0;
let memberInformationListRequest = 0;
let memberInformationCursor = null;
let memberInformationRows = [];
let memberInformationOpeningDetail = false;

async function loadMemberInformationSummary() {
  const sequence = ++memberInformationSummaryRequest;
  const genderPanel = document.getElementById('dashboard-gender-panel');
  genderPanel.hidden = isAdminMemberSiteProfile();
  if (genderPanel.hidden) genderPanel.nextElementSibling.className = 'col-12';
  else genderPanel.nextElementSibling.className = 'col-md-6';
  try {
    const { data, error } = await _supabase.rpc('get_member_information_summary');
    if (error) throw error;
    if (sequence !== memberInformationSummaryRequest) return;
    document.getElementById('dashboard-information-count').textContent = `${Number(data.needs_completion || 0).toLocaleString()}명`;
    const fields = data.field_counts || {};
    const breakdown = [['계좌정보', data.account_incomplete], ['주민등록번호', fields.rrn], ['전화번호', fields.phone], ['주소', fields.address]];
    for (const [field, label] of Object.entries({ name: '이름', business_number: '사업자·고유번호', representative_name: '대표자명', contact_name: '담당자명' })) {
      if (Number(fields[field] || 0) > 0) breakdown.push([label, fields[field]]);
    }
    document.getElementById('dashboard-information-breakdown').textContent = breakdown
      .map(([label, count]) => `${label} ${Number(count || 0).toLocaleString()}명`).join(' · ');
    const total = Number(data.individual_count || 0);
    document.getElementById('dashboard-gender-summary').innerHTML = ['남성', '여성', '미확인'].map(label => {
      const count = Number(data.gender?.[label] || 0);
      const percent = total > 0 ? `${(count / total * 100).toFixed(1)}%` : '0%';
      return `<div><div class="small text-muted">${label}</div><strong class="fs-4">${count.toLocaleString()}명</strong><div class="small text-muted">${percent}</div></div>`;
    }).join('');
  } catch (_) {
    if (sequence !== memberInformationSummaryRequest) return;
    document.getElementById('dashboard-information-count').textContent = '확인 실패';
    document.getElementById('dashboard-information-breakdown').textContent = '정보 보완 현황을 불러오지 못했습니다. 다시 조회해 주세요.';
    document.getElementById('dashboard-gender-summary').textContent = '현황을 불러오지 못했습니다.';
  }
}

async function showMemberInformationList() {
  const panel = document.getElementById('member-information-list-panel');
  panel.hidden = false;
  await loadMemberInformationList(true);
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadMemberInformationList(reset = true) {
  const sequence = ++memberInformationListRequest;
  if (reset) { memberInformationCursor = null; memberInformationRows = []; }
  const more = document.getElementById('member-information-more');
  more.disabled = true;
  document.getElementById('member-information-list-status').textContent = '명단을 확인하고 있습니다…';
  try {
    const { data, error } = await _supabase.rpc('get_members_needing_information', {
      p_field: document.getElementById('member-information-filter').value || null,
      p_search: document.getElementById('member-information-search').value.trim() || null,
      p_after_id: memberInformationCursor, p_limit: 30
    });
    if (error) throw error;
    if (sequence !== memberInformationListRequest) return;
    const seen = new Set(memberInformationRows.map(row => row.id));
    for (const row of data.items || []) if (!seen.has(row.id)) { memberInformationRows.push(row); seen.add(row.id); }
    memberInformationCursor = data.after_id || null;
    more.hidden = !data.has_more;
    document.getElementById('member-information-list-status').textContent = memberInformationRows.length
      ? `${memberInformationRows.length.toLocaleString()}명 표시${data.has_more ? ' · 아래에서 더 불러올 수 있습니다.' : ''}`
      : '선택한 조건에서 보완할 정보가 있는 조합원이 없습니다.';
    const body = document.getElementById('member-information-list-body');
    body.innerHTML = memberInformationRows.map(row => `<tr>
      <td><strong>${escapeHtml(row.name || '이름 미입력')}</strong><div class="small text-muted">${escapeHtml(row.member_id || '')}</div></td>
      <td>${escapeHtml(row.member_type || '개인')}</td>
      <td>${escapeHtml(MemberInformation.fieldNames(row.missing_fields).join(', '))}</td>
      <td><button type="button" class="btn btn-sm btn-outline-primary" data-information-member="${escapeHtml(row.id)}">정보 보완</button></td>
      </tr>`).join('');
    body.querySelectorAll('[data-information-member]').forEach(button => button.addEventListener('click', async () => {
      if (button.disabled || memberInformationOpeningDetail) return;
      memberInformationOpeningDetail = true;
      body.querySelectorAll('[data-information-member]').forEach(item => { item.disabled = true; });
      try {
        await openMemberDetail(button.dataset.informationMember);
        if (g_current_member_row?.id === button.dataset.informationMember) toggleEditMode(true);
      }
      finally {
        memberInformationOpeningDetail = false;
        body.querySelectorAll('[data-information-member]').forEach(item => { item.disabled = false; });
      }
    }));
  } catch (_) {
    if (sequence !== memberInformationListRequest) return;
    document.getElementById('member-information-list-status').textContent = '명단을 불러오지 못했습니다. 다시 검색해 주세요.';
    if (reset) document.getElementById('member-information-list-body').replaceChildren();
  } finally {
    if (sequence === memberInformationListRequest) more.disabled = false;
  }
}
