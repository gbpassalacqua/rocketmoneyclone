import { supabase } from "@/lib/supabase"
import type { UserProfile } from "@/types"

export async function signUpWithEmail(email: string, password: string) {
  return supabase.auth.signUp({ email, password })
}

export async function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password })
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({ provider: "google" })
}

export async function signOut() {
  return supabase.auth.signOut()
}

export async function getCurrentUser() {
  return supabase.auth.getUser()
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single()
  return data
}
