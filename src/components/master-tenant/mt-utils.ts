// ─── Master Tenant Utilities ─────────────────────────────────

/** Build auth headers for master tenant API calls */
export function mtHeaders(token: string | null, json = true): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}