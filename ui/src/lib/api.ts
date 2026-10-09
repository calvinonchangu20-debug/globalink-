export const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

/**
 * Checks if a JWT token is expired using its payload exp claim.
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const { exp } = JSON.parse(jsonPayload);
    if (!exp) return false;
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

/**
 * Handles instant session teardown and redirect when a 401 Unauthorized is encountered.
 */
export function handleUnauthorized() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  window.dispatchEvent(new Event("auth:logout"));

  const currentPath = window.location.pathname;
  if (!currentPath.includes("/login") && !currentPath.includes("/register")) {
    window.location.href = `/login?expired=true&redirect=${encodeURIComponent(currentPath)}`;
  }
}

/**
 * Universal fetch wrapper that attaches Authorization header and intercepts 401s.
 */
export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const token = localStorage.getItem("auth_token");

  // Check if token is locally known to be expired before even sending the request
  if (token && isTokenExpired(token)) {
    handleUnauthorized();
    return new Response(JSON.stringify({ error: "Token expired" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
}

/**
 * Safely parse JSON from a fetch Response, avoiding syntax crashes when servers return HTML.
 */
export async function safeJson<T = any>(res: Response, fallback: T | null = null): Promise<T | null> {
  try {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return fallback;
    }
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}
