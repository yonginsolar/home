/*
Version: v1.0.0
Change: 2026-03-16 - Centralize live Supabase client for vote and minutes modules.
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://ifdqlwxgqgsvnawmhlfc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmZHFsd3hncWdzdm5hd21obGZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxODQ3NDIsImV4cCI6MjA4Mjc2MDc0Mn0.UKUvMOl58KuDH24seC3oSgla7mK5lr-vXjqtpalnl6k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
