import api from "@/lib/api";
import type {
  Asset,
  Paginated,
  Presentation,
  PresentationListItem,
  PublicLink,
} from "./types";

const BASE = "/presentations";

// ───── Presentations ──────────────────────────────────────────────────────────

export function listPresentations(params?: { search?: string; status?: string }) {
  const qs: Record<string, string> = {};
  if (params?.search) qs.search = params.search;
  if (params?.status) qs.status = params.status;
  return api.get<Paginated<PresentationListItem>>(`${BASE}/presentations/`, qs);
}

export function getPresentation(id: string) {
  return api.get<Presentation>(`${BASE}/presentations/${id}/`);
}

export function createPresentation(payload: { name: string; client_name?: string }) {
  return api.post<Presentation>(`${BASE}/presentations/`, payload);
}

export function updatePresentation(id: string, payload: Partial<Presentation>) {
  return api.patch<Presentation>(`${BASE}/presentations/${id}/`, payload);
}

export function deletePresentation(id: string) {
  return api.delete(`${BASE}/presentations/${id}/`);
}

export function duplicatePresentation(id: string) {
  return api.post<Presentation>(`${BASE}/presentations/${id}/duplicate/`);
}

export async function uploadThumbnail(id: string, blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "thumbnail.png");
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}${BASE}/presentations/${id}/thumbnail/`,
    { method: "POST", body: form, credentials: "include" },
  );
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  return (await res.json()) as { thumbnail_url: string };
}

// ───── Public links ───────────────────────────────────────────────────────────

export function listLinks(presentationId: string) {
  return api.get<Paginated<PublicLink>>(`${BASE}/links/`, { presentation: presentationId });
}

export function createLink(payload: {
  presentation: string;
  label: string;
  password?: string | null;
  expires_at?: string | null;
}) {
  return api.post<PublicLink>(`${BASE}/links/`, payload);
}

export function revokeLink(id: string) {
  return api.post<PublicLink>(`${BASE}/links/${id}/revoke/`);
}

export function deleteLink(id: string) {
  return api.delete(`${BASE}/links/${id}/`);
}

// ───── Assets ────────────────────────────────────────────────────────────────

export function listAssets() {
  return api.get<Paginated<Asset>>(`${BASE}/assets/`);
}

export async function uploadAsset(file: File, kind: Asset["kind"] = "logo") {
  const form = new FormData();
  form.append("name", file.name);
  form.append("kind", kind);
  form.append("file", file);
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}${BASE}/assets/`,
    { method: "POST", body: form, credentials: "include" },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`upload failed: ${res.status} ${body}`);
  }
  return (await res.json()) as Asset;
}

export function deleteAsset(id: string) {
  return api.delete(`${BASE}/assets/${id}/`);
}

// ───── Public (no auth) — used by the /p/[token] page ─────────────────────────

const PUBLIC_BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "/api/v1"}/public-presentations`;

export interface PublicMeta {
  name: string;
  client_name: string;
  password_required: boolean;
  label: string;
  thumbnail_url: string | null;
}

export interface PublicContent {
  session_id: number;
  name: string;
  client_name: string;
  canvas_json: Record<string, unknown>;
  timeline_json: Record<string, unknown>;
  config_json: Record<string, unknown>;
}

async function publicGet<T>(path: string): Promise<T> {
  const r = await fetch(`${PUBLIC_BASE}${path}`, { credentials: "omit" });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Object.assign(new Error(`public-get ${r.status}`), { status: r.status, body: b });
  }
  return r.json();
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${PUBLIC_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "omit",
  });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw Object.assign(new Error(`public-post ${r.status}`), { status: r.status, body: b });
  }
  return r.json();
}

export function fetchPublicMeta(token: string) {
  return publicGet<PublicMeta>(`/${token}/meta/`);
}

export function fetchPublicContent(token: string) {
  return publicGet<PublicContent>(`/${token}/content/`);
}

export function unlockPublic(token: string, password: string) {
  return publicPost<PublicContent>(`/${token}/unlock/`, { password });
}

export async function heartbeatPublic(token: string, sessionId: number, durationSeconds: number) {
  try {
    await publicPost(`/${token}/heartbeat/`, { session_id: sessionId, duration_seconds: durationSeconds });
  } catch {
    /* best-effort */
  }
}
