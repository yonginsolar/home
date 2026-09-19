/*
Version: v1.4.0
Change: 2026-09-19 - Persist editable regular-assembly booklet source data with each meeting package.
*/
import { supabase } from '../shared/supabase-client.js';

export const MEETING_PACKAGE_FILE_BUCKET = 'meeting-package-files';

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
      .select('id,meeting_type,assembly_kind,fiscal_year,title,meeting_number,meeting_date,location,status,published_minute_id,created_at,updated_at'),
    coopId
  ).order('updated_at', { ascending: false });
  return { data: data || [], error };
}

async function listMeetingHistory() {
  const { coop_id: coopId } = await getRuntime();
  const { data, error } = await scope(
    supabase
      .from('minutes')
      .select('title,doc_type,created_at'),
    coopId
  )
    .order('created_at', { ascending: false })
    .limit(500);
  return { data: data || [], error };
}

async function getPackage(id) {
  const { coop_id: coopId } = await getRuntime();
  const [packageResult, agendaResult, documentResult, attachmentResult] = await Promise.all([
    scope(supabase.from('meeting_packages').select('*').eq('id', id), coopId).maybeSingle(),
    scope(supabase.from('meeting_package_agendas').select('*').eq('package_id', id), coopId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    scope(supabase.from('meeting_package_documents').select('*').eq('package_id', id), coopId)
      .order('document_type', { ascending: true }),
    scope(supabase.from('meeting_package_pdf_attachments').select('*').eq('package_id', id), coopId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
  ]);
  const error = packageResult.error || agendaResult.error || documentResult.error || attachmentResult.error;
  return {
    data: error ? null : {
      package: packageResult.data || null,
      agendas: agendaResult.data || [],
      documents: documentResult.data || [],
      pdfAttachments: attachmentResult.data || []
    },
    error
  };
}

async function uploadPdfAttachment(packageId, file, payload) {
  const runtime = await getRuntime();
  const session = await supabase.auth.getSession();
  const userId = session.data?.session?.user?.id || null;
  if (!userId) return { data: null, error: new Error('로그인이 필요합니다.') };
  if (!(file instanceof File) || (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || ''))) {
    return { data: null, error: new Error('PDF 파일만 첨부할 수 있습니다.') };
  }
  if (file.size < 1 || file.size > 20 * 1024 * 1024) {
    return { data: null, error: new Error('PDF 파일은 20MB 이하만 첨부할 수 있습니다.') };
  }
  const objectId = crypto.randomUUID();
  const storagePath = `${runtime.coop_id}/${packageId}/${objectId}.pdf`;
  const upload = await supabase.storage.from(MEETING_PACKAGE_FILE_BUCKET).upload(storagePath, file, {
    contentType: 'application/pdf',
    cacheControl: '3600',
    upsert: false
  });
  if (upload.error) return { data: null, error: upload.error };

  const row = withCoop({
    package_id: packageId,
    title: payload.title,
    insert_after_chapter_id: payload.insert_after_chapter_id,
    storage_path: storagePath,
    original_filename: file.name,
    file_size: file.size,
    page_count: payload.page_count,
    sort_order: payload.sort_order || 0,
    created_by: userId
  }, runtime.coop_id);
  const inserted = await supabase.from('meeting_package_pdf_attachments').insert(row).select('*').single();
  if (inserted.error) {
    await supabase.storage.from(MEETING_PACKAGE_FILE_BUCKET).remove([storagePath]);
    return { data: null, error: inserted.error };
  }
  return inserted;
}

async function deletePdfAttachment(id) {
  const { coop_id: coopId } = await getRuntime();
  const lookup = await scope(
    supabase.from('meeting_package_pdf_attachments').select('id,storage_path').eq('id', id),
    coopId
  ).maybeSingle();
  if (lookup.error || !lookup.data) return { data: null, error: lookup.error || new Error('첨부 PDF를 찾을 수 없습니다.') };
  const storageDelete = await supabase.storage.from(MEETING_PACKAGE_FILE_BUCKET).remove([lookup.data.storage_path]);
  if (storageDelete.error) return { data: null, error: storageDelete.error };
  return await scope(supabase.from('meeting_package_pdf_attachments').delete().eq('id', id), coopId);
}

async function createPdfAttachmentSignedUrl(storagePath, expiresIn = 1800) {
  return await supabase.storage.from(MEETING_PACKAGE_FILE_BUCKET).createSignedUrl(storagePath, expiresIn);
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
  const attachments = await scope(
    supabase.from('meeting_package_pdf_attachments').select('storage_path').eq('package_id', id),
    coopId
  );
  if (attachments.error) return { data: null, error: attachments.error };
  const paths = (attachments.data || []).map(row => row.storage_path).filter(Boolean);
  if (paths.length) {
    const removed = await supabase.storage.from(MEETING_PACKAGE_FILE_BUCKET).remove(paths);
    if (removed.error) return { data: null, error: removed.error };
  }
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
    document_notes: row.document_notes || null,
    private_notes: row.private_notes || null,
    requires_article_comparison: row.requires_article_comparison === true,
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
  const { data, error } = await supabase
    .rpc('publish_meeting_package_minute', {
      p_package_id: packageId,
      p_title: payload.title,
      p_content: payload.content
    })
    .single();
  return { data: data || null, error };
}

async function getAssemblySources(packageId) {
  const { data, error } = await supabase.rpc('get_meeting_package_assembly_sources', {
    p_package_id: packageId
  });
  return { data: data || null, error };
}

async function prepareAuditReport(packageId, payload) {
  const { data, error } = await supabase
    .rpc('prepare_meeting_audit_report', {
      p_package_id: packageId,
      p_title: payload.title,
      p_content: payload.content
    })
    .single();
  return { data: data || null, error };
}

export const MeetingPackageService = {
  getRuntime,
  listPackages,
  listMeetingHistory,
  getPackage,
  createPackage,
  updatePackage,
  deletePackage,
  saveAgendas,
  saveDocument,
  createMinuteFromPackage,
  getAssemblySources,
  prepareAuditReport,
  uploadPdfAttachment,
  deletePdfAttachment,
  createPdfAttachmentSignedUrl
};
