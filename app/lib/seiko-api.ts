export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const CACHE_PREFIX = "seiko-api-cache:";

function cacheKey(businessId: string | undefined, action: string, payload: Record<string, unknown>) {
  return `${CACHE_PREFIX}${businessId || "foundation"}:${action}:${JSON.stringify(payload)}`;
}

export function readSeikoCache<T>(action: string, payload: Record<string, unknown> = {}, businessId?: string): ApiResult<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(cacheKey(businessId, action, payload));
    return saved ? JSON.parse(saved) as ApiResult<T> : null;
  } catch { return null; }
}

export async function callSeiko<T>(action: string, payload: Record<string, unknown> = {}, businessId?: string): Promise<ApiResult<T>> {
  try {
    const response = await fetch("/api/seiko", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload, businessId }),
    });
    const result = await response.json() as ApiResult<T>;
    if (result.ok && typeof window !== "undefined" && (action === "labelBootstrap" || action === "labelRecords")) {
      sessionStorage.setItem(cacheKey(businessId, action, payload), JSON.stringify(result));
    }
    return result;
  } catch {
    return readSeikoCache<T>(action, payload, businessId) || { ok: false, code: "NETWORK_ERROR", message: "No connection. Your work remains on this device." };
  }
}
