-- Version: v1.0.1
-- Change: Add approval-linked notice fields (source_approval_id, file_urls) and extend RPC for draft publishing.
-- Coop notices doc number support (홈페이지 공문)
-- Format: 제YYYY-NNN호

ALTER TABLE public.coop_notices
    ADD COLUMN IF NOT EXISTS doc_no TEXT;

ALTER TABLE public.coop_notices
    ADD COLUMN IF NOT EXISTS source_approval_id bigint;

ALTER TABLE public.coop_notices
    ADD COLUMN IF NOT EXISTS file_urls text[];

CREATE UNIQUE INDEX IF NOT EXISTS coop_notices_doc_no_uq
    ON public.coop_notices (doc_no)
    WHERE doc_no IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coop_notices_source_approval_uq
    ON public.coop_notices (source_approval_id)
    WHERE source_approval_id IS NOT NULL;

-- Update RPC to accept doc number + attachments + approval linkage
-- NOTE: Adjust column list if your coop_notices schema differs.
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
            doc_no = COALESCE(p_doc_no, doc_no),
            source_approval_id = COALESCE(p_source_approval_id, source_approval_id)
        WHERE id = p_id;
    END IF;
END;
$$;
