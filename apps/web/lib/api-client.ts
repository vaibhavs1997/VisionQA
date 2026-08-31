import { Project, Scan, ScanPage, IssueSummary, UiIssue, User, Workspace } from "./types";
import { getClientToken, getServerToken } from "./session";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

/** Resolves the bearer token in either a server component (via
 * next/headers, only available there) or a client component (via the
 * document.cookie helper) — callers never need to know which context
 * they're in. */
async function resolveToken(explicitToken?: string): Promise<string | null> {
  if (explicitToken) return explicitToken;
  if (typeof window !== "undefined") return getClientToken();
  return getServerToken();
}

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const token = await resolveToken(init?.token);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? body.error ?? `Request failed with status ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (input: { firstName: string; lastName: string; email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/api/auth/login", { method: "POST", body: JSON.stringify(input) }),
  me: (token?: string) => request<User>("/api/auth/me", { token }),

  listWorkspaces: (token?: string) => request<{ workspaces: Workspace[] }>("/api/workspaces", { token }),
  createWorkspace: (input: { name: string }, token?: string) =>
    request<Workspace>("/api/workspaces", { method: "POST", body: JSON.stringify(input), token }),
  getWorkspace: (workspaceId: string) => request<Workspace>(`/api/workspaces/${workspaceId}`),

  listProjects: (workspaceId: string) =>
    request<{ projects: Project[] }>(`/api/workspaces/${workspaceId}/projects`),
  createProject: (workspaceId: string, input: { name: string; baseUrl: string }) =>
    request<Project>(`/api/workspaces/${workspaceId}/projects`, { method: "POST", body: JSON.stringify(input) }),
  getProject: (workspaceId: string, projectId: string) =>
    request<Project>(`/api/workspaces/${workspaceId}/projects/${projectId}`),
  listScansForProject: (workspaceId: string, projectId: string) =>
    request<{ scans: Scan[] }>(`/api/workspaces/${workspaceId}/projects/${projectId}/scans`),

  createScan: (
    workspaceId: string,
    input: {
      projectId: string;
      url?: string;
      viewports: string[];
      crawlMode?: string;
      maxPages?: number;
      options?: { ai: string };
    }
  ) =>
    request<{ scanId: string; status: string }>(`/api/workspaces/${workspaceId}/scans`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  getScanStatus: (workspaceId: string, scanId: string) =>
    request<{ status: Scan["status"]; currentStep: string | null; issueCount?: number }>(
      `/api/workspaces/${workspaceId}/scans/${scanId}/status`
    ),
  cancelScan: (workspaceId: string, scanId: string) =>
    request<{ scanId: string; status: string; failureReason: string }>(
      `/api/workspaces/${workspaceId}/scans/${scanId}/cancel`,
      { method: "POST" }
    ),
  getScan: (workspaceId: string, scanId: string) =>
    request<{ scan: Scan; summary: IssueSummary; pages: ScanPage[] }>(`/api/workspaces/${workspaceId}/scans/${scanId}`),
  getScanIssues: (
    workspaceId: string,
    scanId: string,
    filters?: { severity?: string; category?: string; viewport?: string }
  ) => {
    const params = new URLSearchParams();
    if (filters?.severity) params.set("severity", filters.severity);
    if (filters?.category) params.set("category", filters.category);
    if (filters?.viewport) params.set("viewport", filters.viewport);
    const qs = params.toString();
    return request<{ issues: UiIssue[] }>(`/api/workspaces/${workspaceId}/scans/${scanId}/issues${qs ? `?${qs}` : ""}`);
  },

  getIssue: (workspaceId: string, issueId: string) =>
    request<{ issue: UiIssue; evidence: Record<string, unknown>; relatedIssues: UiIssue[] }>(
      `/api/workspaces/${workspaceId}/issues/${issueId}`
    ),
  submitFeedback: (workspaceId: string, issueId: string, feedback: "valid" | "false_positive" | "ignored") =>
    request<{ ok: true }>(`/api/workspaces/${workspaceId}/issues/${issueId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ feedback }),
    }),

  getProjectTrends: (workspaceId: string, projectId: string) =>
    request<{ trends: { scanId: string; createdAt: string; score: number | null; totalIssues: number; status: string }[] }>(
      `/api/workspaces/${workspaceId}/projects/${projectId}/trends`
    ),
};
