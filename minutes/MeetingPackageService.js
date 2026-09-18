/*
Version: v1.0.0
Change: 2026-09-18 - Add tenant-scoped meeting package CRUD for materials, scenario and minutes drafts.
*/
import { supabase } from '../shared/supabase-client.js';

let runtimeCache = null;

async function getRuntime() {
  if (runtimeCache?.coop_id) return runtimeCache;
  const { data, error } = await supabase.rpc('get_my_erp_runtime');
  if (error) throw error;
  if (!data?.coop_id) throw new Error('조합 운영 정보를 확인할 수 없습니다.');
  runtimeCache = data;
  return runtimeCache;
}

function scope(query, coopId) {
  return query.eq('coop_id', coopId || '00000000-0000-0000-0000-000000000000');
}

function withCoop(payload, coopId) {
  return { ...(payload || {}), coop_id: coopId };
}

async function listPackages() {
  const { coop_id: coopId } = await getRuntime();
  const { data, error } = await scope(
    supabase
      .from('meeting_packages')
      .select('id,meeting_type,title,meeting_number,meeting_date,location,status,published_minute_id,updated_at'),
    coopId
  ).order('updated_at', { ascending: false });
  return { data: data || [], error };
}

async function getPackage(id) {
  const { coop_id: coopId } = await getRuntime();
  const [packageResult, agendaResult, documentResult] = await Promise.all([
    scope(supabase.from('meeting_packages').select('*').eq('id', id), coopId).maybeSingle(),
    scope(supabase.from('meeting_package_agendas').select('*').eq('package_id', id), coopId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    scope(supabase.from('meeting_package_documents').select('*').eq('package_id', id), coopId)
      .order('document_type', { ascending: true })
  ]);
  const error = packageResult.error || agendaResult.error || documentResult.error;
  return {
    data: error ? null : {
      package: packageResult.data || null,
      agendas: agendaResult.data || [],
      documents: documentResult.data || []
    },
    error
  };
}

async function createPackage(payload) {
  const runtime = await getRuntime();
  const session = await supabase.auth.getSession();
  const userId = session.data?.session?.user?.id || null;
  if (!userId) return { data: null, error: new Error('로그인이 필요합니다.') };
  return await supabase
    .from('meeting_packages')
    .insert(withCoop({ ...payload, created_by: userId, updated_by: userId }, runtime.coop_id))
    .select('*')
    .single();
}

async function updatePackage(id, payload) {
  const runtime = await getRuntime();
  const session = await supabase.auth.getSession();
  const userId = session.data?.session?.user?.id || null;
  if (!userId) return { data: null, error: new Error('로그인이 필요합니다.') };
  return await scope(
    supabase
      .from('meeting_packages')
      .update(withCoop({ ...payload, updated_by: userId }, runtime.coop_id))
      .eq('id', id),
    runtime.coop_id
  ).select('*').single();
}

async function deletePackage(id) {
  const { coop_id: coopId } = await getRuntime();
  return await scope(supabase.from('meeting_packages').delete().eq('id', id), coopId);
}

async function saveAgendas(packageId, agendas) {
  const { coop_id: coopId } = await getRuntime();
  const safeRows = (Array.isArray(agendas) ? agendas : []).map((row, index) => ({
    ...(row.id ? { id: row.id } : {}),
    package_id: packageId,
    coop_id: coopId,
    agenda_kind: row.agenda_kind,
    title: row.title,
    summary: row.summary || null,
    background: row.background || null,
    proposal_text: row.proposal_text || null,
    office_report: row.office_report || null,
    scenario_notes: row.scenario_notes || null,
    decision_draft: row.decision_draft || null,
    decision_result: row.decision_result || null,
    discussion_notes: row.discussion_notes || null,
    private_notes: row.private_notes || null,
    sort_order: index
  }));

  const { data: existing, error: existingError } = await scope(
    supabase.from('meeting_package_agendas').select('id').eq('package_id', packageId),
    coopId
  );
  if (existingError) return { data: null, error: existingError };

  const existingRows = safeRows.filter(row => row.id);
  const newRows = safeRows.filter(row => !row.id);
  let saved = [];
  if (existingRows.length > 0) {
    const { data, error } = await supabase
      .from('meeting_package_agendas')
      .upsert(existingRows, { onConflict: 'id' })
      .select('*');
    if (error) return { data: null, error };
    saved = saved.concat(data || []);
  }
  if (newRows.length > 0) {
    const { data, error } = await supabase
      .from('meeting_package_agendas')
      .insert(newRows)
      .select('*');
    if (error) return { data: null, error };
    saved = saved.concat(data || []);
  }

  const retainedExistingIds = new Set(existingRows.map(row => row.id));
  const removedIds = (existing || []).map(row => row.id).filter(id => !retainedExistingIds.has(id));
  if (removedIds.length > 0) {
    const { error: deleteError } = await scope(
      supabase.from('meeting_package_agendas').delete().eq('package_id', packageId).in('id', removedIds),
      coopId
    );
    if (deleteError) return { data: saved, error: deleteError };
  }
  return { data: saved.sort((a, b) => a.sort_order - b.sort_order), error: null };
}

async function saveDocument(packageId, documentType, payload) {
  const { coop_id: coopId } = await getRuntime();
  return await supabase
    .from('meeting_package_documents')
    .upsert(withCoop({
      package_id: packageId,
      document_type: documentType,
      title: payload.title,
      content_html: payload.content_html,
      version: payload.version || 1,
      manually_edited: payload.manually_edited === true,
      generated_at: payload.generated_at || null
    }, coopId), { onConflict: 'package_id,document_type' })
    .select('*')
    .single();
}

async function createMinuteFromPackage(packageId, payload) {
  const runtime = await getRuntime();
  const session = await supabase.auth.getSession();
  const userId = session.data?.session?.user?.id || null;
  if (!userId) return { data: null, error: new Error('로그인이 필요합니다.') };

  const { data: packageRow, error: packageError } = await scope(
    supabase.from('meeting_packages').select('id,published_minute_id').eq('id', packageId),
    runtime.coop_id
  ).maybeSingle();
  if (packageError) return { data: null, error: packageError };
  if (packageRow?.published_minute_id) {
    return { data: { id: packageRow.published_minute_id, alreadyCreated: true }, error: null };
  }

  const { data: docNo, error: docNoError } = await supabase.rpc('get_next_official_doc_no');
  if (docNoError) return { data: null, error: docNoError };
  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .insert(withCoop({
      title: payload.title,
      content: payload.content,
      status: 'OPEN',
      author_id: userId,
      doc_type: payload.doc_type,
      visibility: 'OFFICIALS',
      requires_sign: true,
      signer_ids: payload.signer_ids,
      doc_no: docNo || null
    }, runtime.coop_id))
    .select('id,doc_no')
    .single();
  if (minuteError) return { data: null, error: minuteError };

  const updateResult = await updatePackage(packageId, {
    published_minute_id: minute.id,
    status: 'FINAL'
  });
  if (updateResult.error) return { data: minute, error: updateResult.error };
  return { data: minute, error: null };
}

export const MeetingPackageService = {
  getRuntime,
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
  deletePackage,
  saveAgendas,
  saveDocument,
  createMinuteFromPackage
};
