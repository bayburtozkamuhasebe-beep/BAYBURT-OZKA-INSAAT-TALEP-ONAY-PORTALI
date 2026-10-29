import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://gboathwmaanqxuwsryud.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_XAJvSuJtLj6_b0HDWBUUCA_2M-2dDQ7';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
