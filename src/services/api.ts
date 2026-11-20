import type { ModuleKey, RecordItem } from "../types";

export type AdminRole = "superadmin" | "admincpd" | "adminpng";

export type AdminSession = {
  token: string;
  username: string;
  role: AdminRole;
};

export type BackendAdminAccount = {
  username: string;
  name: string;
  role: AdminRole;
  avatar: string;
  active: boolean;
  provisioned: boolean;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "";
const SESSION_KEY = "force-shadow-session";

export const isBackendEnabled = API_BASE_URL.length > 0;

export function getAdminSession(): AdminSession | null {
  if (!isBackendEnabled) return null;
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    const session = JSON.parse(saved) as AdminSession;
    return session.token && session.username && isAdminRole(session.role)
      ? session
      : null;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function clearAdminSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export async function checkBackendConnection() {
  return request<ApiEnvelope<{ service: string; status: string }>>("", { method: "GET" });
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  const envelope = await request<ApiEnvelope<{
    success: boolean;
    message?: string;
    token?: string;
    username?: string;
    role?: AdminRole;
  }>>("", {
    method: "POST",
    body: JSON.stringify({ action: "adminLogin", payload: { username, password } })
  });
  if (!envelope.success) throw new Error(envelope.error || "Đăng nhập Apps Script thất bại.");
  const result = envelope.data;
  if (!result) throw new Error("Apps Script trả phản hồi đăng nhập không hợp lệ.");
  if (!result.success) throw new Error(result.message || "Tên tài khoản hoặc mật khẩu không đúng.");
  if (!result.token || !result.username || !isAdminRole(result.role)) {
    throw new Error("Apps Script trả thông tin phiên không hợp lệ.");
  }
  const session = { token: result.token, username: result.username, role: result.role };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function logoutAdmin() {
  const session = getAdminSession();
  clearAdminSession();
  if (!session) return;
  await callBackend("adminLogout", { token: session.token });
}

export async function listBackendRecords(
  module: ModuleKey,
  division: "CPD" | "P&G",
  hostGroup: string
): Promise<RecordItem[]> {
  const session = requireSession();
  const result = await callBackend<Array<Omit<RecordItem, "id">>>("adminListRecords", {
    token: session.token,
    section: module,
    hostGroup,
    division
  });
  return result.map(record => ({ ...record, id: String(record.rowNumber) }));
}

export async function listDashboardTracking(division: "CPD" | "P&G"): Promise<RecordItem[]> {
  const session = requireSession();
  const result = await callBackend<Array<Omit<RecordItem, "id">>>("adminListDashboardTracking", {
    token: session.token,
    division
  });
  return result.map(record => ({ ...record, id: String(record.rowNumber) }));
}

export async function listAdminAccounts(): Promise<BackendAdminAccount[]> {
  const session = requireSession();
  return callBackend<BackendAdminAccount[]>("adminListUsers", { token: session.token });
}

export async function createAdminAccount(username: string, password: string): Promise<void> {
  const session = requireSession();
  await callBackend("adminCreateUser", { token: session.token, username, password });
}

export async function setAdminAccountActive(username: string, active: boolean): Promise<void> {
  const session = requireSession();
  await callBackend("adminSetUserActive", { token: session.token, username, active });
}

export async function saveBackendRecord(
  module: ModuleKey,
  values: Record<string, string>,
  existing: RecordItem | undefined,
  division: "CPD" | "P&G",
  hostGroup: string
) {
  const session = requireSession();
  await callBackend("adminSaveRecord", {
    token: session.token,
    section: module,
    hostGroup,
    division,
    record: { rowNumber: existing?.rowNumber, version: existing?.version, values }
  });
}

export async function deleteBackendRecord(
  module: ModuleKey,
  record: RecordItem,
  division: "CPD" | "P&G",
  hostGroup: string
) {
  const session = requireSession();
  await callBackend("adminDeleteRecord", {
    token: session.token,
    section: module,
    hostGroup,
    division,
    rowNumber: record.rowNumber,
    version: record.version
  });
}

async function callBackend<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const envelope = await request<ApiEnvelope<T>>("", {
    method: "POST",
    body: JSON.stringify({ action, payload })
  });
  if (!envelope.success) throw new Error(envelope.error || "Apps Script request thất bại.");
  if (!("data" in envelope)) throw new Error("Apps Script trả phản hồi không đầy đủ.");
  return envelope.data as T;
}

function requireSession() {
  const session = getAdminSession();
  if (!session) throw new Error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.");
  return session;
}

function isAdminRole(role: unknown): role is AdminRole {
  return role === "superadmin" || role === "admincpd" || role === "adminpng";
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    },
    cache: "no-store"
  });
  let result: ApiEnvelope<T>;
  try {
    result = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error(`API trả phản hồi không đọc được (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(result.error || `API request thất bại (HTTP ${response.status}).`);
  return result as T;
}
