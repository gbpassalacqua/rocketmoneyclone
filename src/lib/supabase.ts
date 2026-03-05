import { createClient, SupabaseClient } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = !!(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http")
)

let supabaseInstance: SupabaseClient | null = null

try {
  supabaseInstance = isSupabaseConfigured
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null
} catch (e) {
  console.error("Failed to initialize Supabase client:", e)
}

export const supabase: SupabaseClient = supabaseInstance as SupabaseClient
