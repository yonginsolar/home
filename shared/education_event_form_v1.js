(function (root) {
  'use strict';
  const definitions = [
    ['title', 'eventTitle', '교육명', 'text', 'col-12', 200],
    ['starts_at', 'eventStartsAt', '시작 일시', 'datetime-local', 'col-md-6'],
    ['ends_at', 'eventEndsAt', '종료 일시', 'datetime-local', 'col-md-6'],
    ['location', 'eventLocation', '장소', 'text', 'col-12', 300],
    ['education_content', 'educationContent', '교육 내용', 'textarea', 'col-md-8', null, 'educationContentGroup'],
    ['instructor', 'eventInstructor', '강사', 'text', 'col-md-4', 200, 'instructorGroup']
  ];
  const labels = Object.freeze(Object.fromEntries(definitions.map(([key,, label]) => [key, label])));
  const dateFormat = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'short'
  });

  function localTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date).replace(' ', 'T');
  }
  function toIso(value) {
    const local = String(value || '').trim();
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) return null;
    const date = new Date(local + ':00+09:00');
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function valueFrom(row, key) {
    return key.endsWith('_at') ? localTime(row?.[key]) : String(row?.[key] ?? '');
  }

  function mount(slot, { portal = false } = {}) {
    const doc = slot.ownerDocument;
    const fragment = doc.createDocumentFragment();
    const fields = new Map();
    let titleLabel, endMark;
    const educationOnly = [];
    for (const [key, id, label, kind, column, max, group] of definitions) {
      const wrap = doc.createElement('div');
      wrap.className = column;
      if (group) {
        if (!portal) wrap.id = group;
        educationOnly.push(wrap);
      }
      const input = doc.createElement(kind === 'textarea' ? kind : 'input');
      input.id = portal ? 'eduPilot-' + key : id;
      input.className = 'form-control';
      if (kind === 'textarea') input.rows = 3;
      else input.type = kind;
      const limit = max || (portal && key === 'education_content' ? 5000 : null);
      if (limit) input.maxLength = limit;
      if (portal) input.required = true;
      const caption = doc.createElement('label');
      caption.className = 'form-label fw-bold';
      caption.htmlFor = input.id;
      caption.textContent = label;
      if (key === 'title') titleLabel = caption;
      if (key === 'ends_at') {
        endMark = doc.createElement('span');
        endMark.className = 'text-danger';
        endMark.textContent = '*';
        endMark.setAttribute('aria-hidden', 'true');
        caption.append(' ', endMark);
      }
      wrap.append(caption, input);
      fragment.append(wrap);
      fields.set(key, input);
    }
    slot.replaceWith(fragment);
    function setEducation(education) {
      titleLabel.textContent = education ? labels.title : '행사명';
      endMark.classList.toggle('d-none', !education);
      for (const wrap of educationOnly) wrap.classList.toggle('d-none', !education);
    }
    setEducation(portal);
    function read({ education = true } = {}) {
      const values = Object.fromEntries([...fields].map(([key, input]) => [key, input.value.trim()]));
      if (!values.title) throw new Error(education ? '교육명을 입력하세요.' : '행사명을 입력하세요.');
      const start = toIso(values.starts_at), end = toIso(values.ends_at);
      if (!start) throw new Error('시작 일시를 입력하세요.');
      if (!values.location) throw new Error('장소를 입력하세요.');
      if (values.ends_at && !end) throw new Error('종료 일시를 확인하세요.');
      if (end && end < start) throw new Error('종료 일시는 시작 일시보다 빠를 수 없습니다.');
      if (education) {
        if (!end) throw new Error('교육 종료 일시를 입력하세요.');
        if (!values.education_content) throw new Error('교육 내용을 입력하세요.');
        if (!values.instructor) throw new Error('강사를 입력하세요.');
      }
      return values;
    }
    return Object.freeze({ fields, setEducation, read });
  }
  root.CoopEducationEventForm = Object.freeze({ mount, labels, localTime, toIso, valueFrom });
})(window);
