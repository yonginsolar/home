// Both roster editors preserve the original row when moving a regional assignment.
export function planVoterAssignments({ target, districts, members, rows, includeCommon = false }) {
    const byDistrict = new Map(districts.map(d => [String(d.id), d]));
    const targetId = String(target);
    if (!byDistrict.has(targetId) || !Array.isArray(rows)) throw new Error('명부를 다시 확인해 주세요.');
    const byMember = new Map(members.map(member => [String(member.id), []]));
    for (const row of rows) {
        const existing = byMember.get(String(row.member_uuid));
        const districtId = String(row.district_id);
        if (!existing || !row.id || !byDistrict.has(districtId) || existing.some(old => String(old.district_id) === districtId)) {
            throw new Error('기존 선거구 배정을 확인하지 못했습니다. 명부를 다시 확인해 주세요.');
        }
        existing.push(row);
    }
    return [...byMember].map(([memberId, existing]) => {
        const regional = existing.filter(row => !byDistrict.get(String(row.district_id)).is_common);
        const hasTarget = existing.some(row => String(row.district_id) === targetId);
        const targetCommon = byDistrict.get(targetId).is_common;
        if (!targetCommon && regional.length > 1) throw new Error('지역구가 여러 곳에 배정된 조합원이 있습니다. 명부에서 기존 배정을 먼저 확인해 주세요.');
        const move = !targetCommon && !hasTarget && regional.length === 1 ? regional[0] : null;
        const adds = new Set(!move && !hasTarget ? [targetId] : []);
        if (includeCommon) {
            for (const [id, district] of byDistrict) {
                if (district.is_common && !existing.some(row => String(row.district_id) === id)) adds.add(id);
            }
        }
        return { memberId, move, adds: [...adds] };
    });
}

export async function moveVoterAssignment(client, { coopId, electionId, districtId }, row) {
    const { data, error } = await client.from('election_voters')
        .update({ district_id: districtId })
        .eq('coop_id', coopId)
        .eq('election_id', electionId)
        .eq('id', row.id)
        .eq('member_uuid', row.member_uuid)
        .eq('district_id', row.district_id)
        .select('id,member_uuid,district_id');
    if (error || !Array.isArray(data) || data.length !== 1 ||
        String(data[0].id) !== String(row.id) || String(data[0].member_uuid) !== String(row.member_uuid) ||
        String(data[0].district_id) !== String(districtId)) {
        throw new Error('지역구 변경을 확인하지 못했습니다. 명부를 다시 확인해 주세요.');
    }
}

export async function insertVoterAssignments(client, payload) {
    if (!payload.length) return;
    const { data, error } = await client.from('election_voters').insert(payload).select('member_uuid,district_id');
    const key = row => JSON.stringify([String(row.member_uuid), String(row.district_id)]);
    if (error || !Array.isArray(data) || data.length !== payload.length) throw new Error('등록 결과를 확인하지 못했습니다. 명부를 다시 확인해 주세요.');
    const actual = new Set(data.map(key));
    if (actual.size !== payload.length || !payload.every(row => actual.has(key(row)))) {
        throw new Error('등록 결과를 확인하지 못했습니다. 명부를 다시 확인해 주세요.');
    }
}
