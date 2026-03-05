import type { SupabaseClient } from "@supabase/supabase-js"

export async function logAudit(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  await supabase.from("audit_log").insert({
    tenant_id: tenantId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  })
}
