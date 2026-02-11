-- Version: v1.0.2
-- Change: Support multiple attachments with original filenames for coop_notices.

ALTER TABLE public.coop_notices
    ADD COLUMN IF NOT EXISTS file_names text[];

-- Extend RPC to accept file_names (original names)
CREATE OR REPLACE FUNCTION public.upsert_notice_secure(
    p_id bigint,
    p_title text,
    p_content text,
    p_category text,
    p_status text,
    p_is_popup boolean,
    p_file_url text,
    p_doc_no text,
    p_file_urls text[],
    p_file_names text[],
    p_source_approval_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_id IS NULL THEN
        INSERT INTO public.coop_notices (
            title,
            content,
            category,
            status,
            is_popup,
            file_url,
            file_urls,
            file_names,
            doc_no,
            source_approval_id
        ) VALUES (
            p_title,
            p_content,
            p_category,
            p_status,
            p_is_popup,
            p_file_url,
            p_file_urls,
            p_file_names,
            p_doc_no,
            p_source_approval_id
        );
    ELSE
        UPDATE public.coop_notices
        SET title = p_title,
            content = p_content,
            category = p_category,
            status = p_status,
            is_popup = p_is_popup,
            file_url = p_file_url,
            file_urls = p_file_urls,
            file_names = p_file_names,
            doc_no = COALESCE(p_doc_no, doc_no),
            source_approval_id = COALESCE(p_source_approval_id, source_approval_id)
        WHERE id = p_id;
    END IF;
END;
$$;
