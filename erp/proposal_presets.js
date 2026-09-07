/* Version: v1.4.0 | Named site starting points; supplied capacities are not field surveys. */
(() => {
  'use strict';
  const common = {
    facilityName: '', facilityType: 'public', regionFull: '용인시', regionShort: '용인',
    siteAddress: '', siteOverlayLabel: '신규 설치 검토 대상지',
    siteFeatureLines: '', siteCheckLines: '대상지 주소·소유 및 관리 주체\n설치 가능 면적·차량과 보행 동선\n의무 적용 여부·기존 설비·계통 여건',
    siteProposalNote: '', mandatoryKnown: false, mandatoryKw: '', noMandatory: false, voluntaryBaseKw: '',
    existingInstallationKnown: false, hasExistingInstallation: false, existingKw: '',
    expandedMinKw: '', expandedKw: '', keepNamsaOverlay: false, useSamplePhoto: false
  };
  const items = [
    { id: 'mohyeon', name: '모현 다목적복지관', mandatoryKw: '118',
      siteFeatureLines: '복지관 이용자의 주차 편의와 그늘 확보를 함께 검토\n주차공간의 햇빛발전소 조성 검토',
      siteProposalNote: '제공받은 의무용량은 118kW입니다. 복지관 이용자의 보행·승하차 동선과 그늘 확보를 함께 고려해 설치 범위를 검토할 것을 제안합니다.' },
    { id: 'giheung', name: '기흥 습지공원', mandatoryKw: '110',
      siteFeatureLines: '공원 이용자의 주차 편의와 그늘 확보를 함께 검토\n공원 경관·생태환경과 보행 동선을 고려한 배치 검토',
      siteProposalNote: '제공받은 의무용량은 110kW입니다. 공원 경관과 생태환경에 미치는 영향을 확인하면서 이용자에게 그늘을 제공하는 배치를 검토할 것을 제안합니다.' },
    { id: 'yubang2', name: '유방동 제2공영주차장', mandatoryKw: '103',
      siteFeatureLines: '제2공영주차장과 제1공영주차장의 연계 사업 검토\n두 주차장의 이용 동선과 그늘 확보를 함께 검토',
      siteProposalNote: '제2공영주차장의 의무용량은 제공받은 자료 기준 103kW입니다. 제1공영주차장도 함께 조사해 설계·시공·유지관리를 연계하는 방안을 제안합니다. 제1공영주차장의 용량은 별도로 확인하며, 103kW를 두 곳의 합산 의무량으로 보지는 않습니다.' },
    ...['현암고등학교', '흥덕고등학교', '홍천고등학교', '지곡초등학교'].map((name, index) => ({
      id: ['hyeonam', 'heungdeok', 'hongcheon', 'jigok'][index], name, facilityType: 'school', noMandatory: true,
      siteFeatureLines: '학생·교직원의 안전과 교육활동을 우선하는 배치 검토\n주차공간의 그늘·비가림과 재생에너지 생산을 함께 검토',
      siteCheckLines: '학교·교육청의 소유·관리 및 부지 사용 절차\n통학·보행·소방 동선과 공사 가능 일정\n설치 가능 면적·기존 설비·계통 여건\n연계 교육의 대상·횟수·일정',
      siteProposalNote: '의무 설치 대응이 아닌, 학교의 자발적인 에너지 전환 사업으로 제안합니다. 발전소 조성과 함께 조합이 태양광·에너지 전환·기후 교육을 진행할 수 있습니다. 교육 대상·횟수·일정은 학교와 협의하며, 학생 안전과 교육활동에 지장이 없는 설치·운영 방안을 함께 마련합니다.'
    }))
  ].map((item) => Object.freeze({ id: item.id, name: item.name, fields: Object.freeze({
    ...common, ...item, facilityName: item.name, mandatoryKnown: Boolean(item.mandatoryKw)
  }) }));
  const api = Object.freeze({ items: Object.freeze(items), blank: () => ({ ...common }) });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.ProposalPresets = api;
})();
