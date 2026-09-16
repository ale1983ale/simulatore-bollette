import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = "https://mmjlsyonrmnhplkdxofv.supabase.co";
export const supabaseAnonKey = "sb_publishable_pPusqavk61CBkzCwUbaTTA_9AzwOTkC";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
