export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

const CACHE_PREFIX = "seiko-api-cache:";

function cacheKey(action: string, payload: Record<string, unknown>) {
  return `${CACHE_PREFIX}${action}:${JSON.stringify(payload)}`;
}

export function readSeikoCache<T>(action: string, payload: Record<string, unknown> = {}): ApiResult<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = sessionStorage.getItem(cacheKey(action, payload));
    return saved ? JSON.parse(saved) as ApiResult<T> : null;
  } catch { return null; }
}

export async function callSeiko<T>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch("/api/seiko", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    const result = await response.json() as ApiResult<T>;
    if (result.ok && typeof window !== "undefined" && (action === "labelBootstrap" || action === "labelRecords")) {
      sessionStorage.setItem(cacheKey(action, payload), JSON.stringify(result));
    }
    return result;
  } catch {
    return readSeikoCache<T>(action, payload) || { ok: false, code: "NETWORK_ERROR", message: "No connection. Your work remains on this device." };
  }
}
