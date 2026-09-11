import { firebaseAuth } from "./firebase";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8787").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, token?: string | null): Promise<T> {
  const authToken = token === undefined ? await firebaseAuth?.currentUser?.getIdToken() : token;
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init.headers
    }
  });

  if (!response.ok) {
    let code = "request_failed";
    try { code = (await response.json() as { error?: string }).error || code; } catch { /* resposta sem JSON */ }
    throw new ApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}
