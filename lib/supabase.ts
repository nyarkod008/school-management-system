import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "https://ylyrlmrhoeostlummgft.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlseXJsbXJob2Vvc3RsdW1tZ2Z0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NjI0NzgsImV4cCI6MjA4OTUzODQ3OH0.Sw4WObss3GxlDtiikmMf1J93rM9GXfak6zvINm1Vde8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);