-- Version: v1.0.3
-- Change: Add file_urls and signer_ids columns for minutes attachments/signers.

-- Minutes/Notice schema + RLS policies (non-ERP)
-- Assumes coop_members.id == auth.users.id for membership checks.
-- If your membership mapping differs, adjust is_member()/is_official() accordingly.

-- Base tables (safe if already exists)
CREATE TABLE IF NOT EXISTS public.minutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'OPEN',
    author_id UUID REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.doc_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    minute_id UUID REFERENCES public.minutes(id) ON DELETE CASCADE,
    official_id BIGINT REFERENCES public.coop_officials(id),
    member_uuid UUID REFERENCES auth.users(id),
    signature_url TEXT NOT NULL,
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT,
    UNIQUE (minute_id, member_uuid)
);

-- 1) Minutes table (extend)
ALTER TABLE public.minutes
    ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'MINUTES',
    ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'MEMBERS',
    ADD COLUMN IF NOT EXISTS requires_sign BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES auth.users(id);

-- Optional status constraint (DRAFT/OPEN/CLOSED)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'minutes_status_check'
    ) THEN
        ALTER TABLE public.minutes
            ADD CONSTRAINT minutes_status_check
            CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED'));
    END IF;
END $$;

-- doc_type constraint (MINUTES/NOTICE)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'minutes_doc_type_check'
    ) THEN
        ALTER TABLE public.minutes
            ADD CONSTRAINT minutes_doc_type_check
            CHECK (doc_type IN ('MINUTES', 'NOTICE'));
    END IF;
END $$;

-- visibility constraint (MEMBERS/PUBLIC)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'minutes_visibility_check'
    ) THEN
        ALTER TABLE public.minutes
            ADD CONSTRAINT minutes_visibility_check
            CHECK (visibility IN ('MEMBERS', 'PUBLIC'));
    END IF;
END $$;

-- 2) Signatures table (ensure official_id + unique)
-- coop_officials.id is BIGINT (not UUID). Ensure type matches.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='doc_signatures' AND column_name='official_id'
    ) THEN
        -- Drop FK if present to allow type change
        BEGIN
            ALTER TABLE public.doc_signatures DROP CONSTRAINT IF EXISTS doc_signatures_official_id_fkey;
        EXCEPTION WHEN undefined_object THEN
            NULL;
        END;

        -- Attempt type change if needed
        BEGIN
            ALTER TABLE public.doc_signatures
                ALTER COLUMN official_id TYPE BIGINT USING official_id::bigint;
        EXCEPTION WHEN others THEN
            -- If cast fails (e.g., UUID text), drop and re-add column
            ALTER TABLE public.doc_signatures DROP COLUMN IF EXISTS official_id;
            ALTER TABLE public.doc_signatures ADD COLUMN official_id BIGINT;
        END;
    ELSE
        ALTER TABLE public.doc_signatures ADD COLUMN official_id BIGINT;
    END IF;

    -- Re-add FK
    ALTER TABLE public.doc_signatures
        ADD CONSTRAINT doc_signatures_official_id_fkey
        FOREIGN KEY (official_id) REFERENCES public.coop_officials(id);
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'doc_signatures_minute_official_unique'
    ) THEN
        ALTER TABLE public.doc_signatures
            ADD CONSTRAINT doc_signatures_minute_official_unique UNIQUE (minute_id, official_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doc_signatures_minute_id ON public.doc_signatures(minute_id);

-- 3) Helper functions
CREATE OR REPLACE FUNCTION public.is_member()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coop_members m
    WHERE m.id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coop_admins a WHERE a.id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.coop_members m WHERE m.id = auth.uid() AND m.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_official()
RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.coop_officials o
      JOIN public.coop_members m ON m.member_id = o.member_id
     WHERE o.status = 'active'
       AND m.id = auth.uid()
  );
$$;

-- 4) RLS policies
ALTER TABLE public.minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minutes_select_policy ON public.minutes;
DROP POLICY IF EXISTS minutes_insert_policy ON public.minutes;
DROP POLICY IF EXISTS minutes_update_policy ON public.minutes;
DROP POLICY IF EXISTS minutes_delete_policy ON public.minutes;

CREATE POLICY minutes_select_policy ON public.minutes
  FOR SELECT USING (
    public.is_admin()
    OR public.is_official()
    OR (published_at IS NOT NULL AND (visibility = 'PUBLIC' OR public.is_member()))
  );

CREATE POLICY minutes_insert_policy ON public.minutes
  FOR INSERT WITH CHECK (public.is_admin());

CREATE POLICY minutes_update_policy ON public.minutes
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY minutes_delete_policy ON public.minutes
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS doc_signatures_select_policy ON public.doc_signatures;
DROP POLICY IF EXISTS doc_signatures_insert_policy ON public.doc_signatures;
DROP POLICY IF EXISTS doc_signatures_update_policy ON public.doc_signatures;
DROP POLICY IF EXISTS doc_signatures_delete_policy ON public.doc_signatures;

CREATE POLICY doc_signatures_select_policy ON public.doc_signatures
  FOR SELECT USING (
    public.is_admin()
    OR public.is_official()
    OR EXISTS (
        SELECT 1 FROM public.minutes m
        WHERE m.id = doc_signatures.minute_id
          AND m.published_at IS NOT NULL
          AND (m.visibility = 'PUBLIC' OR public.is_member())
    )
  );

CREATE POLICY doc_signatures_insert_policy ON public.doc_signatures
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.coop_officials o
        JOIN public.coop_members m ON m.member_id = o.member_id
       WHERE o.id = doc_signatures.official_id
         AND o.status = 'active'
         AND m.id = auth.uid()
    )
  );

CREATE POLICY doc_signatures_update_policy ON public.doc_signatures
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY doc_signatures_delete_policy ON public.doc_signatures
  FOR DELETE USING (public.is_admin());


-- 4) Minutes document fields (doc number + receiver/via)
ALTER TABLE public.minutes
    ADD COLUMN IF NOT EXISTS doc_no TEXT,
    ADD COLUMN IF NOT EXISTS receiver TEXT,
    ADD COLUMN IF NOT EXISTS via TEXT;
-- 6) Minutes signer list (selected officials)
ALTER TABLE public.minutes
    ADD COLUMN IF NOT EXISTS signer_ids BIGINT[];
