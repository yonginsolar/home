(function (global) {
  'use strict';
  let model = null, sequence = 0;
  const pending = new Map();
  const labels = { yongin: ['수지구','기흥구','처인구','그 외','주소 미확인'], gyeonggi: ['경기도내','그 외','주소 미확인'] };
  const colors = { '수지구':'#0d6efd','기흥구':'#20c997','처인구':'#198754','경기도내':'#ffc107','그 외':'#adb5bd','주소 미확인':'#6c757d' };
  const genderLabels = ['남성','여성','미확인'];
  const node = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const count = value => Math.max(0, Number(value) || 0);
  const percent = (value, total) => total > 0 ? `${(count(value) / total * 100).toFixed(1)}%` : '0.0%';
  function ageTooltip(context) {
    const row = model?.age_groups?.find(item => item.label === context.label);
    if (!row) return '구성 정보를 확인하지 못했습니다.';
    return [`${count(row.count).toLocaleString()}명 (개인 조합원 중 ${percent(row.count, count(model.individual_count))})`,
      ...genderLabels.map(label => `${label} ${count(row.gender?.[label]).toLocaleString()}명 (${percent(row.gender?.[label], count(row.count))})`)];
  }
  function closeDetail() {
    if (node('member-demographic-detail')) node('member-demographic-detail').hidden = true;
    for (const scope of Object.keys(labels)) if (node(`member-demographic-select-${scope}`)) node(`member-demographic-select-${scope}`).value = '';
  }
  function openRegion(scope, label) {
    const row = model?.[scope]?.find(item => item.label === label);
    if (!row) return;
    const total = count(row.count), people = count(row.individual_count);
    node('member-demographic-title').textContent = `${row.label} 조합원 구성`;
    node('member-demographic-meta').textContent = `전체 ${total.toLocaleString()}명 (조합원 전체 중 ${percent(total,count(model.total))}) · 개인 ${people.toLocaleString()}명 · 단체 ${count(row.group_count).toLocaleString()}명`;
    node('member-demographic-gender').innerHTML = genderLabels.map(label => `<div class="col"><div class="border rounded-3 p-3 h-100"><div class="text-body-secondary">${label}</div><strong class="fs-4">${count(row.gender?.[label]).toLocaleString()}명</strong><div class="text-body-secondary">${percent(row.gender?.[label],people)}</div></div></div>`).join('');
    node('member-demographic-ages').innerHTML = (row.ages || []).map(age => `<tr><th scope="row">${escape(age.label)}</th><td>${count(age.count).toLocaleString()}명 <span class="text-body-secondary">(${percent(age.count,people)})</span></td>${genderLabels.map(gender => `<td>${count(age.gender?.[gender]).toLocaleString()}명</td>`).join('')}</tr>`).join('') || '<tr><td colspan="5" class="text-body-secondary">개인 조합원이 없는 지역입니다.</td></tr>';
    node('member-demographic-detail').hidden = false;
    for (const otherScope of Object.keys(labels)) node(`member-demographic-select-${otherScope}`).value = otherScope === scope ? label : '';
    node('member-demographic-detail').scrollIntoView({ behavior:'smooth',block:'nearest' });
  }
  function draw(data, options) {
    model = data;
    for (const scope of Object.keys(labels)) {
      const rows = [...(data[scope] || [])].filter(row => count(row.count)>0).sort((a,b) => labels[scope].indexOf(a.label)-labels[scope].indexOf(b.label));
      const select = node(`member-demographic-select-${scope}`);
      select.innerHTML = '<option value="">지역별 구성 보기</option>' + rows.map(row => `<option value="${escape(row.label)}">${escape(row.label)} · ${count(row.count).toLocaleString()}명</option>`).join('');
      select.disabled = rows.length===0;
      select.onchange = () => select.value ? openRegion(scope,select.value) : closeDetail();
      options.renderChart(scope==='yongin'?'location':'locationGyeonggi',scope==='yongin'?'chart-location':'chart-location-gyeonggi','doughnut',{
        labels:rows.map(row=>row.label),datasets:[{data:rows.map(row=>count(row.count)),backgroundColor:rows.map(row=>colors[row.label]||'#adb5bd')}]
      });
      node(`member-demographic-status-${scope}`).textContent = rows.length ? '지역을 클릭하거나 아래에서 선택해 자세히 보세요.' : '현재 정조합원이 없습니다.';
    }
    const ages = data.age_groups || [];
    options.renderChart('age','chart-age','bar',{labels:ages.map(age=>age.label),datasets:[{label:'개인 조합원 수',data:ages.map(age=>count(age.count)),backgroundColor:'#ffc107'}]});
    node('member-demographic-age-status').textContent = `개인 정조합원 ${count(data.individual_count).toLocaleString()}명 기준 · 막대에 마우스를 올리거나 터치하면 성별 구성도 보여요.`;
  }
  async function load(options) {
    const seq = ++sequence;
    closeDetail();
    model=null;
    options.clearCharts?.();
    for (const scope of Object.keys(labels)) {
      const select=node(`member-demographic-select-${scope}`);
      if (select) { select.disabled=true; select.innerHTML='<option value="">지역별 구성 보기</option>'; }
      const status=node(`member-demographic-status-${scope}`);
      if (status) status.textContent='구성을 확인하고 있습니다…';
    }
    if (!options.enabled) return null;
    const key = `${options.cacheKey || ''}:${new Date().toDateString()}`;
    let request;
    try {
      if (!pending.has(key)) pending.set(key,options.client.rpc('get_member_demographic_statistics'));
      request=pending.get(key);
      const {data,error} = await request;
      if (error || !data || !Array.isArray(data.age_groups)) throw Error('DEMOGRAPHICS_UNAVAILABLE');
      if (seq===sequence) draw(data,options);
      return data;
    } catch (_) {
      if (seq!==sequence) return null;
      model=null;
      for (const scope of Object.keys(labels)) {
        node(`member-demographic-select-${scope}`).disabled=true;
        node(`member-demographic-status-${scope}`).textContent='구성 통계를 확인하지 못했습니다. 다시 조회해 주세요.';
      }
      node('member-demographic-age-status').textContent='연령·성별 통계를 확인하지 못했습니다. 다시 조회해 주세요.';
      options.clearCharts?.();
      return null;
    } finally {
      if (pending.get(key)===request) pending.delete(key);
    }
  }
  global.MemberDemographics=Object.freeze({load,openRegion,closeDetail,ageTooltip});
})(window);
