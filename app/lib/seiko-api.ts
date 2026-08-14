export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function callSeiko<T>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  try {
    const response = await fetch("/api/seiko", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    return await response.json() as ApiResult<T>;
  } catch {
    return { ok: false, code: "NETWORK_ERROR", message: "No connection. Your work remains on this device." };
  }
}

