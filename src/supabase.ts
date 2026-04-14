import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://mmjlsyonrmnhplkdxofv.supabase.co";
const supabaseAnonKey = "sb_publishable_pPusqavk61CBkzCwUbaTTA_9AzwOTkC";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
