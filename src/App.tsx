import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent } from "react";
import {
  Activity, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Command,
  Database, FileText, FolderOpen, LockKeyhole, Menu, Moon,
  MoreHorizontal, Package, Pencil, Plus, Search, Sun, Trash2,
  Users, X, Check, Bell, Library, Clock3, Image, LayoutDashboard,
  CircleHelp, ExternalLink, ShieldCheck
} from "lucide-react";
import { deleteRecord, listRecords, saveRecord } from "./services/records";
import {
  checkBackendConnection,
  clearAdminSession,
  deleteAdminAccount,
  getAdminSession,
  isBackendEnabled,
  listAdminAccounts,
  listDashboardTracking,
  loginAdmin,
  logoutAdmin,
  saveAdminAccountRecord,
  saveDashboardTracking,
  setAdminAccountActive,
  updateOwnAdminProfile,
  type AdminAccountDraft,
  type AdminRole,
  type AdminSession
} from "./services/api";
import { moduleConfig, moduleKeys, type ModuleKey, type RecordItem, type ThemeMode } from "./types";

type Screen = "dashboard" | ModuleKey | "library" | "admin-users" | "livestream-checking" | "warning-checking";
type Division = "CPD" | "P&G";
type CalendarView = "month" | "day";
type LibraryItem = { id: string; name: string; division: Division; description: string; updated: string };
type CalendarSource = { id: string; name: string; color: string };
type AdminAccount = { username: string; role: AdminRole; active: boolean; name?: string; avatar?: string; provisioned?: boolean };
type GanttItem = { record: RecordItem; startDay: number; durationDays: number };
type DashboardEditDraft = { status: string; content: string; startDate: string; endDate: string };

const GANTT_DAYS = 7;
const CPD_TRACKING_BRANDS = ["3ce", "drg", "gar", "mny", "oap"];

const icons = {
  schedules: CalendarDays,
  backgrounds: Package,
  titles: FileText,
  hosts: Users
};

const initialSources: CalendarSource[] = [
  { id: "mega", name: "Lịch mega", color: "var(--ice-blue)" },
  { id: "booking", name: "Booking host", color: "var(--accent)" },
  { id: "campaign", name: "Lịch campaign", color: "var(--amber)" }
];

const initialLibrary: LibraryItem[] = [
  { id: "lib-1", name: "Master lịch livestream", division: "CPD", description: "Sheet nguồn lịch live theo tuần.", updated: "12/11/2026" },
  { id: "lib-2", name: "Booking host", division: "CPD", description: "Lịch booking host và phòng live.", updated: "11/11/2026" },
  { id: "lib-3", name: "P&G livestream master", division: "P&G", description: "Sheet nguồn dành cho division P&G.", updated: "10/11/2026" }
];

const initialAccounts: AdminAccount[] = [
  { username: "root.admin", role: "superadmin", active: true, name: "Root Admin", provisioned: true },
  { username: "ops.admin", role: "admincpd", active: true, name: "Operations CPD", provisioned: true },
  { username: "content.team", role: "adminpng", active: false, name: "Content P&G", provisioned: true }
];

function getRoleLabel(role: AdminRole) {
  if (role === "superadmin") return "Superadmin";
  return role === "admincpd" ? "Admin CPD" : "Admin P&G";
}

const SHOPEE_BLOCKED_TITLE_TERMS = [
  "số 1", "duy nhất", "tốt nhất", "hoàn tiền 100%", "chắc chắn hết",
  "cam kết chữa khỏi", "trị dứt điểm", "chuyển khoản", "ck", "ngân hàng",
  "số tài khoản", "số điện thoại", "zalo", "facebook", "địa chỉ", "link ngoài",
  "tiktok", "lazada", "tiki"
];

function normalizeTitleText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d").toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}%]+/gu, " ").trim();
}

function getShopeeBlockedTerm(title: string) {
  const normalizedTitle = ` ${normalizeTitleText(title)} `;
  return SHOPEE_BLOCKED_TITLE_TERMS.find(term => {
    const normalizedTerm = normalizeTitleText(term);
    return normalizedTerm === "ck"
      ? new RegExp(`(^|\\s)${normalizedTerm}(\\s|$)`).test(normalizedTitle)
      : normalizedTitle.includes(` ${normalizedTerm} `);
  });
}

function getComposedTitleLength(values: Record<string, string>, maxHostCodeLength: number) {
  const parts: number[] = [];
  if (values.hostFlag === "1") parts.push(maxHostCodeLength);
  if (values.timeFlag === "1") parts.push(2);
  if (values.dateFlag === "1") parts.push(5);
  parts.push(Array.from(values.title || "").length);
  return parts.reduce((total, length) => total + length, Math.max(0, parts.length - 1));
}

function canAccessDivision(role: AdminRole | undefined, division: Division) {
  if (role === "admincpd") return division === "CPD";
  if (role === "adminpng") return division === "P&G";
  return true;
}

function getDisplayValue(module: ModuleKey, record: RecordItem, key: string) {
  const value = record.values;
  if (module === "schedules" && key === "time") return `${value.startTime || "—"} – ${value.endTime || "—"}`;
  if (module === "schedules" && key === "host") {
    return [value.host, value.pic ? `PIC: ${value.pic}` : ""].filter(Boolean).join(" · ") || "—";
  }
  if (module === "titles" && key === "flags") {
    return [["Mã host", value.hostFlag], ["Giờ", value.timeFlag], ["Ngày", value.dateFlag]]
      .filter(([, flag]) => flag === "1").map(([label]) => label).join(" · ") || "Không ghép";
  }
  return value[key] || "—";
}

function statusClass(value = "") {
  if (/hủy|cancel|declined/i.test(value)) return "status status-red";
  if (/hoàn tất|done|accepted|đang live|đang hoạt động/i.test(value)) return "status status-green";
  if (/sắp live|processing|pending/i.test(value)) return "status status-amber";
  return "status status-blue";
}

function parseRecordDate(value: string, year: number) {
  const text = String(value || "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const localized = text.match(/^(\d{1,2})[/. -](\d{1,2})(?:[/. -](\d{2,4}))?/);
  let recordYear: number;
  let month: number;
  let day: number;
  if (iso) {
    recordYear = Number(iso[1]);
    month = Number(iso[2]);
    day = Number(iso[3]);
  } else if (localized) {
    day = Number(localized[1]);
    month = Number(localized[2]);
    recordYear = localized[3]
      ? Number(localized[3].length === 2 ? `20${localized[3]}` : localized[3])
      : year;
  } else {
    return null;
  }
  const parsed = new Date(recordYear, month - 1, day);
  if (parsed.getFullYear() !== recordYear || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

function platformFilterKey(value: string) {
  const normalized = value.trim().toLocaleUpperCase("vi");
  if (normalized.includes("TIKTOK") || normalized === "TTS") return "TTS";
  if (normalized.includes("SHOPEE") || normalized === "SHP") return "SHP";
  return normalized;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(date);
}

export default function App() {
  const [screen, setActiveScreen] = useState<Screen>("dashboard");
  const [division, setDivision] = useState<Division>("CPD");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => localStorage.getItem("force-shadow-theme-v2") === "dark" ? "dark" : "light");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("fs-sidebar-collapsed") === "true");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceMenuPosition, setWorkspaceMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const [ganttPixelsPerDay, setGanttPixelsPerDay] = useState(() => window.innerWidth <= 760 ? 110 : 150);
  const [trackingRecords, setTrackingRecords] = useState<RecordItem[]>([]);
  const [trackingError, setTrackingError] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(() => getAdminSession());
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginPending, setLoginPending] = useState(false);
  const [backendStatus, setBackendStatus] = useState(isBackendEnabled ? "checking" : "demo");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem | undefined>();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [hostGroup, setHostGroup] = useState("ECO ID");
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [maxHostCodeLength, setMaxHostCodeLength] = useState(6);
  const [calendarView, setCalendarView] = useState<CalendarView>(() =>
    window.matchMedia("(max-width: 760px)").matches ? "day" : "month"
  );
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [sources, setSources] = useState(initialSources);
  const [visibleSources, setVisibleSources] = useState<string[]>(initialSources.map(source => source.id));
  const [sourceModal, setSourceModal] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [library, setLibrary] = useState(initialLibrary);
  const [libraryFilter, setLibraryFilter] = useState<"all" | Division>("all");
  const [libraryModal, setLibraryModal] = useState(false);
  const [editingLibraryId, setEditingLibraryId] = useState<string | undefined>();
  const [libraryDraft, setLibraryDraft] = useState({ name: "", description: "" });
  const [demoRole, setDemoRole] = useState<AdminRole>("admincpd");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountModal, setAccountModal] = useState(false);
  const [accountModalMode, setAccountModalMode] = useState<"create" | "edit" | "profile">("create");
  const [accountDraft, setAccountDraft] = useState<AdminAccountDraft>({
    username: "", password: "", name: "", role: "admincpd", avatar: "", active: true
  });
  const [profileDraft, setProfileDraft] = useState({ password: "", avatar: "" });
  const [trackingWeekOffset, setTrackingWeekOffset] = useState(0);
  const [dashboardPlatform, setDashboardPlatform] = useState("TTS");
  const [dashboardBrand, setDashboardBrand] = useState("all");
  const [editingTracking, setEditingTracking] = useState<RecordItem | null>(null);
  const [dashboardEditDraft, setDashboardEditDraft] = useState<DashboardEditDraft>({
    status: "", content: "", startDate: "", endDate: ""
  });

  const isDataModule = moduleKeys.includes(screen as ModuleKey);
  const module = (isDataModule ? screen : "schedules") as ModuleKey;
  const config = moduleConfig[module];
  const canCreate = module === "hosts" && division === "CPD";
  const canDelete = module === "hosts" && division === "CPD";
  const canManageLibrary = isBackendEnabled ? adminSession?.role === "superadmin" : demoRole === "superadmin";

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("force-shadow-theme-v2", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("fs-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    setFilterPlatform("all");
    setFilterBrand("all");
  }, [screen, division]);

  useEffect(() => {
    const updateGanttScale = () => setGanttPixelsPerDay(window.innerWidth <= 760 ? 110 : 150);
    window.addEventListener("resize", updateGanttScale);
    return () => window.removeEventListener("resize", updateGanttScale);
  }, []);

  useEffect(() => {
    if (!isBackendEnabled) return;
    let active = true;
    checkBackendConnection()
      .then(result => {
        if (!result.success) throw new Error(result.error || "Apps Script chưa sẵn sàng.");
        if (active) setBackendStatus("connected");
      })
      .catch(error => {
        if (active) setBackendStatus(error instanceof Error ? error.message : "Không thể kết nối Apps Script.");
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isDataModule) return;
    setRecords([]);
    setQuery("");
    if (isBackendEnabled && !adminSession) return;
    let active = true;
    listRecords(module, division, hostGroup)
      .then(result => { if (active) setRecords(result); })
      .catch(error => {
        if (!active) return;
        setRecords([]);
        const message = error instanceof Error ? error.message : "Không thể tải dữ liệu.";
        setToast(message);
        if (/phiên đăng nhập hết hạn|phiên đăng nhập không hợp lệ/i.test(message)) {
          clearAdminSession();
          setAdminSession(null);
        }
      });
    return () => { active = false; };
  }, [module, isDataModule, division, hostGroup, adminSession]);

  useEffect(() => {
    if (screen !== "dashboard") return;
    setTrackingRecords([]);
    if (!isBackendEnabled) {
      setTrackingError("Dashboard Gantt cần kết nối Apps Script để đọc TRACKING (UNRELEASE) hoặc sheet CPD dự phòng.");
      return;
    }
    if (!adminSession) {
      setTrackingError("Đăng nhập để xem dữ liệu tracking.");
      return;
    }
    let active = true;
    setTrackingLoading(true);
    setTrackingError("");
    listDashboardTracking(division)
      .then(result => { if (active) setTrackingRecords(result); })
      .catch(error => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Không thể tải dữ liệu tracking.";
        setTrackingError(message);
        if (/phiên đăng nhập hết hạn|phiên đăng nhập không hợp lệ/i.test(message)) {
          clearAdminSession();
          setAdminSession(null);
        }
      })
      .finally(() => { if (active) setTrackingLoading(false); });
    return () => { active = false; };
  }, [screen, adminSession, division]);

  useEffect(() => {
    if (screen !== "admin-users" || !isBackendEnabled || !adminSession) return;
    let active = true;
    listAdminAccounts()
      .then(result => { if (active) setAccounts(result); })
      .catch(error => {
        if (active) setToast(error instanceof Error ? error.message : "Không thể tải danh sách tài khoản.");
      });
    return () => { active = false; };
  }, [screen, adminSession]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const recordBrands = useMemo(() => Array.from(new Set(records
    .map(record => record.values.brand?.trim())
    .filter((brand): brand is string => Boolean(brand))))
    .sort((left, right) => left.localeCompare(right, "vi")), [records]);
  const filtered = useMemo(() => records.filter(record => {
    const matchesQuery = !query ||
      JSON.stringify(record.values).toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"));
    if (!matchesQuery || !["backgrounds", "titles"].includes(module)) return matchesQuery;
    const matchesPlatform = filterPlatform === "all" ||
      platformFilterKey(record.values.platform || "") === filterPlatform;
    const matchesBrand = filterBrand === "all" ||
      (record.values.brand || "").toLocaleLowerCase("vi") === filterBrand.toLocaleLowerCase("vi");
    return matchesPlatform && matchesBrand;
  }), [records, query, module, filterPlatform, filterBrand]);

  const scheduleRecords = useMemo(() => records.filter(record => {
    const sourceName = record.values.type || "Lịch mega";
    const source = sources.find(item => item.name === sourceName) || initialSources.find(item => item.name === sourceName);
    return !source || visibleSources.includes(source.id);
  }), [records, sources, visibleSources]);
  const dailyScheduleRecords = useMemo(() => scheduleRecords.filter(record => {
    const recordDate = parseRecordDate(record.values.date || "", selectedDate.getFullYear());
    if (!recordDate || dateKey(recordDate) !== dateKey(selectedDate)) return false;
    if (filterPlatform !== "all" &&
      platformFilterKey(record.values.platform || "") !== filterPlatform) return false;
    if (filterBrand !== "all" &&
      (record.values.brand || "").toLocaleLowerCase("vi") !== filterBrand.toLocaleLowerCase("vi")) return false;
    return true;
  }).sort((left, right) => (left.values.startTime || "").localeCompare(right.values.startTime || "")),
  [scheduleRecords, selectedDate, filterPlatform, filterBrand]);
  const dailyRooms = useMemo(() => Array.from(new Set(dailyScheduleRecords.map(record =>
    `${record.values.studio || "Chưa phân loại"}|${record.values.room || "Chưa xếp phòng"}`
  ))), [dailyScheduleRecords]);

  const activeCount = records.filter(record => /đang hoạt động|online/i.test(record.values.status || "")).length;
  const rooms = Array.from(new Set(records.map(record => `${record.values.studio || "Chưa phân loại"}|${record.values.room || "Chưa xếp phòng"}`)));
  const trackingWeekStart = new Date();
  trackingWeekStart.setHours(0, 0, 0, 0);
  trackingWeekStart.setDate(trackingWeekStart.getDate() + trackingWeekOffset * GANTT_DAYS);
  const trackingDates = Array.from({ length: GANTT_DAYS }, (_, index) => {
    const date = new Date(trackingWeekStart);
    date.setDate(date.getDate() + index);
    return date;
  });
  const trackingWeekEnd = trackingDates[trackingDates.length - 1];
  const dashboardBrands = division === "CPD" ? CPD_TRACKING_BRANDS : [];
  const canEditDashboard = isBackendEnabled && Boolean(adminSession) &&
    (adminSession?.role === "superadmin" ||
      (adminSession?.role === "admincpd" && division === "CPD") ||
      (adminSession?.role === "adminpng" && division === "P&G"));
  const dashboardRecords = useMemo(() => trackingRecords.filter(record => {
    const filterKey = String(record.values.filterKey || record.values.name || record.values.section || "")
      .toLocaleLowerCase("vi");
    const platformMatches = !dashboardPlatform || filterKey.includes(dashboardPlatform.toLocaleLowerCase("vi"));
    const brandMatches = dashboardBrand === "all" ||
      filterKey.includes(dashboardBrand.toLocaleLowerCase("vi"));
    return platformMatches && brandMatches;
  }), [trackingRecords, dashboardPlatform, dashboardBrand]);
  const ganttSchedule = useMemo(() => {
    const items: GanttItem[] = [];
    let unplacedCount = 0;
    const rangeStart = Date.UTC(trackingWeekStart.getFullYear(), trackingWeekStart.getMonth(), trackingWeekStart.getDate());
    const rangeEnd = rangeStart + GANTT_DAYS * 24 * 60 * 60 * 1000;

    dashboardRecords.forEach(record => {
      const startDate = parseRecordDate(record.values.startDate || "", trackingWeekStart.getFullYear());
      const endDate = parseRecordDate(record.values.endDate || "", trackingWeekStart.getFullYear());
      if (!startDate || !endDate || endDate < startDate) {
        unplacedCount += 1;
        return;
      }
      const startDay = (Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) - rangeStart) / (24 * 60 * 60 * 1000);
      const endDay = (Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate()) - rangeStart) / (24 * 60 * 60 * 1000) + 1;
      const visibleStart = Math.max(0, startDay);
      const visibleEnd = Math.min(GANTT_DAYS, endDay);
      if (visibleEnd > visibleStart) items.push({ record, startDay: visibleStart, durationDays: visibleEnd - visibleStart });
    });

    items.sort((a, b) => a.startDay - b.startDay);
    return { items, unplacedCount };
  }, [dashboardRecords, trackingWeekStart.getTime()]);
  const screenTitle = isDataModule ? config.title
    : screen === "dashboard" ? "Tổng quan" : screen === "library" ? "Thư viện" : screen === "admin-users" ? "Tài khoản admin"
      : screen === "livestream-checking" ? "Livestream Checking" : "Warning Checking";
  const visibleLibrary = library.filter(item => libraryFilter === "all" || item.division === libraryFilter);
  const ownAccount = accounts.find(account =>
    account.username === (isBackendEnabled ? adminSession?.username : undefined)
  ) || accounts.find(account => account.role === demoRole);
  const activeProfile = ownAccount;

  function toggleWorkspaceMenu(event: MouseEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const isDesktopCollapsed = window.innerWidth > 760 && sidebarCollapsed;
    setWorkspaceMenuPosition({
      top: bounds.bottom + 7,
      left: isDesktopCollapsed ? bounds.right + 7 : bounds.left,
      width: isDesktopCollapsed ? 215 : bounds.width
    });
    setWorkspaceOpen(current => !current);
  }

  async function refresh() {
    if (screen === "dashboard") {
      setTrackingLoading(true);
      setTrackingError("");
      try {
        setTrackingRecords(await listDashboardTracking(division));
        setToast("Đã làm mới tracking từ Google Sheets.");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không thể tải dữ liệu tracking.";
        setTrackingError(message);
        setToast(message);
      } finally {
        setTrackingLoading(false);
      }
      return;
    }
    if (!isDataModule) return;
    try {
      setRecords(await listRecords(module, division, hostGroup));
      setToast(isBackendEnabled ? "Đã làm mới dữ liệu từ Apps Script." : "Đã làm mới dữ liệu demo.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể tải dữ liệu.");
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setLoginPending(true);
    setLoginError("");
    try {
      const session = await loginAdmin(loginUsername, loginPassword);
      setAdminSession(session);
      setDemoRole(session.role);
      if (session.role === "admincpd") setDivision("CPD");
      if (session.role === "adminpng") setDivision("P&G");
      setLoginPassword("");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Không thể đăng nhập.");
    } finally {
      setLoginPending(false);
    }
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xác nhận đăng xuất với Apps Script.");
    } finally {
      clearAdminSession();
      setAdminSession(null);
      setRecords([]);
    }
  }

  function openCreate() {
    setEditing(undefined);
    setFormValues(Object.fromEntries(config.fields.map(field => [field.key, field.type === "select" ? (field.options?.[0] || "0") : ""])));
    setFormOpen(true);
  }

  async function openEdit(record: RecordItem) {
    if (module === "titles" && platformFilterKey(record.values.platform || "") === "TTS") {
      try {
        const [ecoHosts, basHosts] = await Promise.all([
          listRecords("hosts", division, "ECO ID"),
          listRecords("hosts", division, "CPD ID")
        ]);
        const codes = [...ecoHosts, ...basHosts]
          .map(host => host.values.hostCode || "")
          .filter(Boolean);
        if (codes.length) {
          setMaxHostCodeLength(Math.max(...codes.map(code => Array.from(code).length)));
        }
      } catch (error) {
        setToast(`Không thể tải mã host để ước tính độ dài: ${error instanceof Error ? error.message : "Lỗi không xác định"}`);
      }
    }
    setEditing(record);
    setFormValues({ ...record.values });
    setFormOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (module === "titles") {
      const platform = platformFilterKey(editing?.values.platform || "");
      if (platform === "TTS" && getComposedTitleLength(formValues, maxHostCodeLength) > 32) {
        setToast(`Title sau khi ghép vượt 32 ký tự (mã host tối đa ${maxHostCodeLength} ký tự).`);
        return;
      }
      if (platform === "SHP") {
        const blockedTerm = getShopeeBlockedTerm(formValues.title || "");
        if (blockedTerm) {
          setToast(`Title có cụm từ Shopee cần tránh: "${blockedTerm}".`);
          return;
        }
      }
    }
    setSaving(true);
    try {
      await saveRecord(module, formValues, editing, division, hostGroup);
      setRecords(await listRecords(module, division, hostGroup));
      setFormOpen(false);
      setToast(isBackendEnabled ? "Đã lưu dữ liệu lên Google Sheets." : editing ? "Đã cập nhật bản ghi trong phiên demo." : "Đã tạo bản ghi trong phiên demo.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể lưu bản ghi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: RecordItem) {
    if (!window.confirm("Bạn có chắc muốn xóa mã host này trong dữ liệu demo?")) return;
    try {
      await deleteRecord(module, record, division, hostGroup);
      setRecords(await listRecords(module, division, hostGroup));
      setToast(isBackendEnabled ? "Đã xóa mã host khỏi Google Sheets." : "Đã xóa mã host khỏi phiên demo.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xóa bản ghi.");
    }
  }

  function setScreen(nextScreen: Screen) {
    setActiveScreen(nextScreen);
    setMobileMenu(false);
  }

  function shiftCalendar(direction: number) {
    const next = new Date(selectedDate);
    if (calendarView === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction);
    setSelectedDate(next);
  }

  function getRecordsForRoomDay(roomKey: string, day: number) {
    const [studio, room] = roomKey.split("|");
    const targetDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    return records.filter(record => {
      const recordDate = parseRecordDate(record.values.date || "", targetDate.getFullYear());
      return record.values.studio === studio && record.values.room === room &&
        recordDate !== null && dateKey(recordDate) === dateKey(targetDate);
    });
  }

  function getRecordsForDate(date: Date) {
    return scheduleRecords.filter(record => {
      const recordDate = parseRecordDate(record.values.date || "", date.getFullYear());
      return recordDate && dateKey(recordDate) === dateKey(date);
    });
  }

  function toggleSource(id: string) {
    setVisibleSources(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }

  function addSource(event: FormEvent) {
    event.preventDefault();
    const name = sourceName.trim();
    if (!name) return;
    if (sources.some(source => source.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"))) {
      setToast("Lịch này đã có trong danh sách.");
      return;
    }
    const id = `custom-${Date.now()}`;
    setSources(current => [...current, { id, name, color: "var(--amber)" }]);
    setVisibleSources(current => [...current, id]);
    setSourceName("");
    setSourceModal(false);
    setToast("Đã thêm lịch vào danh sách xem (demo).");
  }

  function removeSource(id: string) {
    setSources(current => current.filter(source => source.id !== id));
    setVisibleSources(current => current.filter(sourceId => sourceId !== id));
    setToast("Đã bỏ lịch khỏi danh sách xem (demo).");
  }

  function saveLibraryItem(event: FormEvent) {
    event.preventDefault();
    const name = libraryDraft.name.trim();
    if (!name) return;
    if (editingLibraryId) {
      setLibrary(current => current.map(item => item.id === editingLibraryId
        ? { ...item, name, description: libraryDraft.description.trim(), updated: "Vừa cập nhật" }
        : item));
    } else {
      setLibrary(current => [{ id: `lib-${Date.now()}`, name, division, description: libraryDraft.description.trim(), updated: "Vừa cập nhật" }, ...current]);
    }
    setLibraryDraft({ name: "", description: "" });
    setEditingLibraryId(undefined);
    setLibraryModal(false);
    setToast(editingLibraryId ? "Đã cập nhật sheet trong thư viện demo." : "Đã thêm sheet vào thư viện demo.");
  }

  function openLibraryEdit(item: LibraryItem) {
    setEditingLibraryId(item.id);
    setLibraryDraft({ name: item.name, description: item.description });
    setLibraryModal(true);
  }

  async function saveAdminAccount(event: FormEvent) {
    event.preventDefault();
    if (accountModalMode === "profile") {
      if (profileDraft.password && profileDraft.password.length < 12) {
        setToast("Mật khẩu cần tối thiểu 12 ký tự.");
        return;
      }
      try {
        if (!isBackendEnabled) throw new Error("Hồ sơ chỉ cập nhật được khi đã kết nối Apps Script.");
        const passwordChanged = await updateOwnAdminProfile(profileDraft);
        if (passwordChanged) {
          clearAdminSession();
          setAdminSession(null);
          setToast("Đã đổi mật khẩu. Vui lòng đăng nhập lại bằng mật khẩu mới.");
        } else {
          setAccounts(await listAdminAccounts());
          setToast("Đã cập nhật avatar của bạn.");
        }
        setAccountModal(false);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "Không thể cập nhật hồ sơ.");
      }
      return;
    }

    const username = accountDraft.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      setToast("Tên tài khoản cần dài 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.");
      return;
    }
    if (accountModalMode === "create" && accountDraft.password && accountDraft.password.length < 12) {
      setToast("Mật khẩu cần tối thiểu 12 ký tự.");
      return;
    }
    try {
      if (isBackendEnabled) {
        const sessionInvalidated = await saveAdminAccountRecord({ ...accountDraft, username });
        if (sessionInvalidated) {
          clearAdminSession();
          setAdminSession(null);
          setAccountModal(false);
          setToast("Tài khoản của bạn đã thay đổi. Vui lòng đăng nhập lại.");
          return;
        }
        setAccounts(await listAdminAccounts());
        setToast(accountModalMode === "create" ? "Đã thêm tài khoản." : "Đã cập nhật tài khoản.");
      } else {
        if (accountModalMode === "create" && accounts.some(account => account.username === username)) {
          setToast("Tên tài khoản đã tồn tại.");
          return;
        }
        setAccounts(current => accountModalMode === "create"
          ? [...current, { username, name: accountDraft.name, role: accountDraft.role, avatar: accountDraft.avatar, active: accountDraft.active, provisioned: true }]
          : current.map(account => account.username === accountDraft.originalUsername
            ? { username, name: accountDraft.name, role: accountDraft.role, avatar: accountDraft.avatar, active: accountDraft.active, provisioned: true }
            : account));
        setToast(accountModalMode === "create" ? "Đã thêm tài khoản trong phiên demo." : "Đã cập nhật tài khoản demo.");
      }
      setAccountDraft({ username: "", password: "", name: "", role: "admincpd", avatar: "", active: true });
      setAccountModal(false);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể lưu tài khoản.");
    }
  }

  async function removeAdminAccount(account: AdminAccount) {
    if (!window.confirm(`Xóa tài khoản ${account.username}?`)) return;
    try {
      if (isBackendEnabled) {
        const sessionInvalidated = await deleteAdminAccount(account.username);
        if (sessionInvalidated) {
          clearAdminSession();
          setAdminSession(null);
          setToast("Đã xóa tài khoản của bạn.");
          return;
        }
        setAccounts(await listAdminAccounts());
      } else {
        setAccounts(current => current.filter(item => item.username !== account.username));
      }
      setToast("Đã xóa tài khoản.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể xóa tài khoản.");
    }
  }

  async function toggleAdminAccount(account: AdminAccount) {
    try {
      if (isBackendEnabled) {
        await setAdminAccountActive(account.username, !account.active);
        setAccounts(await listAdminAccounts());
      } else {
        setAccounts(current => current.map(item => item.username === account.username
          ? { ...item, active: !item.active }
          : item));
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể cập nhật tài khoản.");
    }
  }

  function openAccountCreate() {
    setAccountModalMode("create");
    setAccountDraft({ username: "", password: "", name: "", role: "admincpd", avatar: "", active: true });
    setAccountModal(true);
  }

  function openAccountEdit(account: AdminAccount) {
    setAccountModalMode("edit");
    setAccountDraft({
      originalUsername: account.username,
      username: account.username,
      password: "",
      name: account.name || "",
      role: account.role,
      avatar: account.avatar || "",
      active: account.active
    });
    setAccountModal(true);
  }

  function openOwnProfile() {
    setAccountModalMode("profile");
    setProfileDraft({ password: "", avatar: ownAccount?.avatar || "" });
    setAccountModal(true);
  }

  async function saveDashboardEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingTracking) return;
    try {
      await saveDashboardTracking({
        ...editingTracking,
        values: dashboardEditDraft
      }, division);
      setTrackingRecords(await listDashboardTracking(division));
      setEditingTracking(null);
      setToast("Đã cập nhật mục tổng quan.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể cập nhật mục tổng quan.");
    }
  }

  const navButton = (key: Screen, label: string, Icon: typeof CalendarDays, badge?: string, disabled = false) => (
    <button key={key} className={`nav-item ${screen === key ? "active" : ""}`} onClick={() => setScreen(key)} title={sidebarCollapsed ? label : undefined} disabled={disabled}>
      <Icon size={18}/><span>{label}</span>{badge && <small className="nav-badge">{badge}</small>}
      {screen === key && <span className="nav-indicator"/>}
    </button>
  );

  if (isBackendEnabled && !adminSession) {
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="auth-brand"><span className="brand-symbol"><b>FS</b></span><span>FORCE SHADOW<small>OPERATIONS WORKSPACE</small></span></div>
          <span className={`auth-connection ${backendStatus === "connected" ? "connected" : backendStatus === "checking" ? "checking" : "disconnected"}`}><i/>{backendStatus === "connected" ? "Đã kết nối Apps Script" : backendStatus === "checking" ? "Đang kiểm tra kết nối..." : backendStatus === "demo" ? "Chưa bật backend" : backendStatus}</span>
          <h1>Đăng nhập quản trị</h1>
          <p>Dùng tài khoản admin đã được cấp trong hệ thống.</p>
          <label className="form-field"><span>Tên tài khoản</span><input autoComplete="username" required value={loginUsername} onChange={event => setLoginUsername(event.target.value)}/></label>
          <label className="form-field"><span>Mật khẩu</span><input type="password" autoComplete="current-password" required value={loginPassword} onChange={event => setLoginPassword(event.target.value)}/></label>
          {loginError && <p className="auth-error" role="alert">{loginError}</p>}
          <button className="create-button auth-submit" disabled={loginPending}>{loginPending ? "Đang đăng nhập..." : "Đăng nhập"}</button>
          <span className="auth-security"><LockKeyhole size={13}/> Phiên đăng nhập được xác thực bởi Apps Script.</span>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở menu"><Menu/></button>
        <a className="brand" href="#" onClick={event => { event.preventDefault(); setScreen("dashboard"); }}>
          <span className="brand-symbol"><b>FS</b></span>
          <span>FORCE SHADOW<small>OPERATIONS WORKSPACE</small></span>
        </a>
        <a className="room-web-link" href="https://baumasters.github.io/WEB-BAU-MASTER/" target="_blank" rel="noreferrer"><ExternalLink size={16}/><span>Web phòng</span></a>
        <div className="top-actions">
          <label className="division-picker"><span>Division</span><select value={division} onChange={event => setDivision(event.target.value as Division)}><option value="CPD" disabled={!canAccessDivision(adminSession?.role, "CPD")}>CPD</option><option value="P&G" disabled={!canAccessDivision(adminSession?.role, "P&G")}>P&amp;G</option></select><ChevronDown size={14}/></label>
          <button className="icon-button" aria-label="Thông báo"><Bell size={19}/></button>
          {isDataModule && canCreate && <button className="create-button" onClick={openCreate}><Plus size={17}/><span>Tạo {config.singular}</span></button>}
          <button className="icon-button theme-toggle" onClick={() => setTheme(current => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"}>{theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}</button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileMenu ? "sidebar-open" : ""}`}>
          <div className="sidebar-header"><span className="workspace-caption">FORCE SHADOW</span><button className="sidebar-toggle desktop-sidebar-toggle" onClick={() => setSidebarCollapsed(current => !current)} aria-label={sidebarCollapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"} title={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}>{sidebarCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}</button></div>
          <div className="workspace-selector">
            <button className="workspace-switch" aria-expanded={workspaceOpen} aria-haspopup="true" aria-label={`Division đang làm việc: ${division} MASTER`} onClick={toggleWorkspaceMenu}>
              <span className="workspace-avatar">{division === "CPD" ? "C" : "P"}</span><span className="sidebar-copy"><b>{division} MASTER</b><small>Division đang làm việc</small></span><ChevronDown size={16}/>
            </button>
            {workspaceOpen && <div className="workspace-menu" style={{ position: "fixed", top: workspaceMenuPosition.top, left: workspaceMenuPosition.left, width: workspaceMenuPosition.width }} role="group" aria-label="Chọn division">
              {(["CPD", "P&G"] as Division[]).map(option => <button key={option} className={division === option ? "selected" : ""} disabled={!canAccessDivision(adminSession?.role, option)} onClick={() => { setDivision(option); setWorkspaceOpen(false); }}><span className="workspace-avatar">{option === "CPD" ? "C" : "P"}</span><span><b>{option} MASTER</b><small>{division === option ? "Đang làm việc" : canAccessDivision(adminSession?.role, option) ? "Chuyển division" : "Không có quyền"}</small></span>{canAccessDivision(adminSession?.role, option) && <Check size={15}/>}</button>)}
            </div>}
          </div>
          <div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div>
          <nav className="side-nav">{navButton("dashboard", "Tổng quan", LayoutDashboard)}</nav>
          <div className="nav-caption secondary-nav-caption">QUẢN LÝ DỮ LIỆU</div>
          <nav className="side-nav">
            {moduleKeys.map(key => navButton(
              key,
              moduleConfig[key].title,
              icons[key],
              division === "P&G" && key !== "schedules" ? "CPD" : undefined,
              division === "P&G" && key !== "schedules"
            ))}
            {navButton("library", "Thư viện", Library)}
          </nav>
          <div className="nav-caption secondary-nav-caption">KIỂM TRA</div>
          <nav className="side-nav">
            {navButton("livestream-checking", "Livestream Checking", Clock3, "Sắp có")}
            {navButton("warning-checking", "Warning Checking", CircleHelp, "Sắp có")}
          </nav>
          <div className="nav-caption secondary-nav-caption">QUẢN TRỊ</div>
          <nav className="side-nav">{navButton("admin-users", "Tài khoản admin", ShieldCheck)}</nav>
          <div className="sidebar-bottom">
            <div className={`connection-card ${isBackendEnabled ? "backend-connection" : "demo-connection"}`}><span className="connection-dot"/><span className="sidebar-copy"><b>{isBackendEnabled ? "Đã kết nối Apps Script" : "Chế độ giao diện demo"}</b><small>{isBackendEnabled ? "Dữ liệu Google Sheets" : "Dữ liệu chỉ lưu trong phiên"}</small></span></div>
            <button className="profile-button" onClick={() => isBackendEnabled ? void handleLogout() : setDemoRole(current => current === "superadmin" ? "admincpd" : "superadmin")} title={isBackendEnabled ? "Đăng xuất" : "Chuyển vai trò mô phỏng"}>
              <span className="profile-avatar">{activeProfile?.avatar ? <img className="account-avatar-image" src={activeProfile.avatar} alt=""/> : isBackendEnabled ? (adminSession?.username.slice(0, 2).toUpperCase() || "AD") : "AD"}</span><span className="sidebar-copy"><b>{activeProfile?.name || (isBackendEnabled ? adminSession?.username : "Admin CPD")}</b><small>{isBackendEnabled ? `${getRoleLabel(adminSession?.role || "admincpd")} · Đăng xuất` : `${getRoleLabel(demoRole)} · mô phỏng`}</small></span>
              <MoreHorizontal size={18}/>
            </button>
          </div>
        </aside>
        {mobileMenu && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobileMenu(false)}/>}

        <main className="main-content">
          {screen !== "dashboard" && <div className="breadcrumb"><span>FORCE SHADOW</span><span>/</span><span>{division}</span><span>/</span><b>{screenTitle}</b></div>}
          {screen !== "dashboard" && <section className="page-heading">
            <div>
              <div className="eyebrow"><span/> TRUNG TÂM VẬN HÀNH · {division}</div>
              <h1>{screenTitle}</h1>
              <p>{isDataModule ? config.description : screen === "library" ? "Danh mục sheet dùng trong vận hành theo từng division." : "Tính năng đang được chuẩn bị cho giai đoạn tiếp theo."}</p>
            </div>
            <div className="heading-actions">
              {isDataModule && <button className="outline-button" onClick={refresh}><Activity size={16}/> Làm mới</button>}
              {isDataModule && canCreate && <button className="create-button desktop-create" onClick={openCreate}><Plus size={17}/> Tạo mã host</button>}
              {screen === "library" && canManageLibrary && <button className="create-button desktop-create" onClick={() => { setEditingLibraryId(undefined); setLibraryDraft({ name: "", description: "" }); setLibraryModal(true); }}><Plus size={17}/> Thêm sheet</button>}
            </div>
          </section>}

          {screen === "dashboard" && <div className="dashboard-content">
            <section className="tracking-section">
              <div className="tracking-section-heading">
                <div><span className="section-kicker">TRACKING</span><h2>Lịch theo dõi</h2></div>
                <div className="gantt-heading-actions">
                  <div className="gantt-date-control"><button className="outline-button" aria-label="Tuần trước" onClick={() => setTrackingWeekOffset(offset => offset - 1)}><ChevronLeft size={16}/></button><span>{new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short" }).format(trackingWeekStart)} – {new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "short", year: "numeric" }).format(trackingWeekEnd)}</span><button className="outline-button" aria-label="Tuần sau" onClick={() => setTrackingWeekOffset(offset => offset + 1)}><ChevronRight size={16}/></button></div>
                  <button className="outline-button" onClick={() => void refresh()} disabled={trackingLoading}><Activity size={16}/> Làm mới</button>
                  <button className="outline-button" onClick={() => setScreen("schedules")}><CalendarDays size={16}/> Lịch</button>
                </div>
              </div>
              <div className="gantt-toolbar">
                <span className="gantt-total">{ganttSchedule.items.length} mục tracking</span>
                <div className="dashboard-filters">
                  <label><span>Sàn</span><select value={dashboardPlatform} onChange={event => setDashboardPlatform(event.target.value)}><option value="TTS">TTS</option><option value="SHP">SHP</option></select></label>
                  <label><span>Brand</span><select value={dashboardBrand} onChange={event => setDashboardBrand(event.target.value)} disabled={!dashboardBrands.length}><option value="all">Tất cả</option>{dashboardBrands.map(brand => <option value={brand} key={brand}>{brand.toUpperCase()}</option>)}</select></label>
                </div>
              </div>
              <div className="gantt-scroll" role="region" aria-label="Biểu đồ Gantt tracking" tabIndex={0}>
                <div className="gantt-board" style={{
                  "--gantt-day-width": `${ganttPixelsPerDay}px`
                } as CSSProperties}>
                  <div className="gantt-header-row">
                    <div className="gantt-task-heading">SECTION / CONTENT</div>
                    <div className="gantt-axis" style={{ width: `${GANTT_DAYS * ganttPixelsPerDay}px` }}>
                      {trackingDates.map(date => <div className={`gantt-day-heading ${dateKey(date) === dateKey(new Date()) ? "is-today" : ""}`} key={dateKey(date)}>
                        <b>{new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "numeric", month: "short" }).format(date)}</b>
                        {dateKey(date) === dateKey(new Date()) && <small>Hôm nay</small>}
                      </div>)}
                    </div>
                  </div>
                  {ganttSchedule.items.map(({ record, startDay, durationDays }) => {
                    const startDate = parseRecordDate(record.values.startDate || "", trackingWeekStart.getFullYear());
                    const endDate = parseRecordDate(record.values.endDate || "", trackingWeekStart.getFullYear());
                    return <div className="gantt-row" key={record.id}>
                      <div className="gantt-task-label">
                        <b>{record.values.section || "Tracking"} · {record.values.name || "Mục"}</b>
                        <span>{record.values.content || record.values.name}</span>
                        <small>{record.values.status} · {record.values.startDate} – {record.values.endDate}</small>
                        {canEditDashboard && <button className="gantt-edit-button" onClick={() => {
                          setEditingTracking(record);
                          setDashboardEditDraft({
                            status: record.values.status || "",
                            content: record.values.content || "",
                            startDate: record.values.startDate || "",
                            endDate: record.values.endDate || ""
                          });
                        }} aria-label="Chỉnh sửa mục tổng quan"><Pencil size={14}/> Sửa</button>}
                      </div>
                      <div className="gantt-track" style={{ width: `${GANTT_DAYS * ganttPixelsPerDay}px` }}>
                        <span className="gantt-bar gantt-bar-mega" style={{ left: `${startDay * ganttPixelsPerDay}px`, width: `${durationDays * ganttPixelsPerDay}px` }} title={`${record.values.content} · ${record.values.startDate} – ${record.values.endDate}${record.values.status ? ` · ${record.values.status}` : ""}`} aria-label={`${record.values.content}, ${record.values.startDate} đến ${record.values.endDate}`} />
                      </div>
                    </div>;
                  })}
                  {!ganttSchedule.items.length && <div className="gantt-empty"><CalendarDays size={19}/><span>{trackingLoading ? "Đang tải tracking..." : trackingError || "Không có dữ liệu phù hợp với bộ lọc và khoảng thời gian này."}</span></div>}
                </div>
              </div>
              {ganttSchedule.unplacedCount > 0 && <div className="gantt-unplaced"><CircleHelp size={14}/>{ganttSchedule.unplacedCount} mục tracking có ngày bắt đầu/kết thúc không hợp lệ.</div>}
            </section>
          </div>}

          {isDataModule && <>
            <section className="metric-row">
              <div className="metric-card"><span className="metric-icon"><Database size={18}/></span><span><small>{`Tổng ${config.singular}`}</small><b>{records.length}</b></span></div>
              <div className="metric-card"><span className="metric-icon metric-icon-green"><Check size={18}/></span><span><small>Đang hoạt động</small><b>{activeCount}</b></span></div>
              {!isBackendEnabled && <div className="metric-note"><span className="note-icon"><Command size={17}/></span><span><b>{division} workspace</b><small>Dữ liệu demo · chưa kết nối Sheets</small></span></div>}
            </section>

            {module === "schedules" ? (
              <section className="calendar-panel">
                <div className="calendar-toolbar">
                  <div className="calendar-date-control">
                    <div className="calendar-nav">
                      <button className="outline-button" aria-label="Lùi" onClick={() => shiftCalendar(-1)}><ChevronLeft size={17}/></button>
                      <button className="outline-button" aria-label="Tiến" onClick={() => shiftCalendar(1)}><ChevronRight size={17}/></button>
                    </div>
                    <h2>{formatMonth(selectedDate)}</h2>
                    <button className="outline-button today-button" onClick={() => { setSelectedDate(new Date()); setCalendarView("month"); }}>Tháng này</button>
                  </div>
                  <div className="calendar-view-switch">{(["month", "day"] as CalendarView[]).map(view => <button key={view} className={calendarView === view ? "selected" : ""} onClick={() => setCalendarView(view)}>{view === "month" ? "Tháng" : "Theo ngày"}</button>)}</div>
                </div>
                <div className="calendar-source-row">
                  <div className="calendar-source-list">{sources.map(source => <span className="calendar-source-chip" key={source.id}>
                    <button className={!visibleSources.includes(source.id) ? "source-hidden" : ""} onClick={() => toggleSource(source.id)}><i style={{ background: source.color }}/>{source.name}</button>
                    <button className="source-remove" onClick={() => removeSource(source.id)} aria-label={`Bỏ ${source.name}`}><X size={12}/></button>
                  </span>)}</div>
                  <button className="filter-button" onClick={() => setSourceModal(true)}><Plus size={15}/><span>Thêm lịch xem</span></button>
                </div>
                {calendarView === "month" ? (
                  <div className="room-schedule-scroll">
                    <div className="room-schedule-grid" style={{ gridTemplateColumns: `190px repeat(${new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate()}, minmax(52px, 1fr))` }}>
                      <div className="room-grid-corner">STUDIO / PHÒNG</div>
                      {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() }, (_, index) => {
                        const day = index + 1;
                        const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                        return <button key={day} className={`room-grid-day ${dateKey(date) === dateKey(new Date()) ? "room-grid-today" : ""}`} onClick={() => { setSelectedDate(date); setCalendarView("day"); }}>
                          <b>{day}</b><small>{new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date)}</small>
                        </button>;
                      })}
                      {rooms.map(roomKey => {
                        const [studio, room] = roomKey.split("|");
                        return <div className="room-grid-row" key={roomKey} style={{ display: "contents" }}>
                          <div className="room-grid-label"><small>{studio}</small><b>{room}</b></div>
                          {Array.from({ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() }, (_, index) => {
                            const day = index + 1;
                            const events = getRecordsForRoomDay(roomKey, day).filter(event => {
                              const sourceName = event.values.type || "Lịch mega";
                              const source = sources.find(item => item.name === sourceName) || initialSources.find(item => item.name === sourceName);
                              return !source || visibleSources.includes(source.id);
                            });
                            return <div className="room-grid-cell" key={`${roomKey}-${day}`}>
                              {events.map(event => <button key={event.id} className={`room-booking ${/đang live/i.test(event.values.status || "") ? "booking-live" : ""}`} title={`${event.values.brand} · ${event.values.startTime}–${event.values.endTime}`} onClick={() => openEdit(event)}>{event.values.brand}</button>)}
                            </div>;
                          })}
                        </div>;
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="daily-room-list">
                    <div className="daily-date-heading"><button className="outline-button" aria-label="Ngày trước" onClick={() => shiftCalendar(-1)}><ChevronLeft size={16}/></button><b>{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(selectedDate)}</b><button className="outline-button" aria-label="Ngày sau" onClick={() => shiftCalendar(1)}><ChevronRight size={16}/></button></div>
                    <div className="calendar-record-filters">
                      <label><span>Sàn</span><select value={filterPlatform} onChange={event => setFilterPlatform(event.target.value)}><option value="all">Tất cả sàn</option><option value="TTS">TTS</option><option value="SHP">SHP</option></select></label>
                      <label><span>Brand</span><select value={filterBrand} onChange={event => setFilterBrand(event.target.value)}><option value="all">Tất cả brand</option>{recordBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></label>
                    </div>
                    {dailyRooms.map(roomKey => {
                      const [studio, room] = roomKey.split("|");
                      const events = dailyScheduleRecords.filter(record =>
                        (record.values.studio || "Chưa phân loại") === studio &&
                        (record.values.room || "Chưa xếp phòng") === room
                      );
                      if (!events.length) return null;
                      return <article className="daily-room-card" key={roomKey}><div><small>{studio}</small><b>{room}</b></div><div className="daily-room-events">{events.map(event => <button key={event.id} onClick={() => openEdit(event)}><b>{event.values.startTime}–{event.values.endTime}</b><span>{event.values.platform} · {event.values.brand} · {event.values.host || "Chưa gán"}</span><i className={statusClass(event.values.status)}>{event.values.status}</i></button>)}</div></article>;
                    })}
                    {!dailyScheduleRecords.length && <div className="empty-state"><CalendarDays size={25}/><b>Không có lịch trong ngày</b><span>Thử chọn ngày khác hoặc đổi bộ lọc.</span></div>}
                  </div>
                )}
                {!isBackendEnabled && <div className="calendar-legend"><LockKeyhole size={14}/> Dữ liệu lịch mẫu trong phiên demo.</div>}
              </section>
            ) : module === "backgrounds" ? (
              <section className="data-panel">
                <div className="panel-heading"><div><h2>Background theo thương hiệu</h2><p>{filtered.length} hồ sơ</p></div><div className="filters"><label className="select-wrap"><select aria-label="Lọc background theo sàn" value={filterPlatform} onChange={event => setFilterPlatform(event.target.value)}><option value="all">Tất cả sàn</option><option value="TTS">TTS</option><option value="SHP">SHP</option></select><ChevronDown size={15}/></label><label className="select-wrap"><select aria-label="Lọc background theo brand" value={filterBrand} onChange={event => setFilterBrand(event.target.value)}><option value="all">Tất cả brand</option>{recordBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select><ChevronDown size={15}/></label><label className="table-search"><Search size={16}/><input placeholder="Tìm thương hiệu..." value={query} onChange={event => setQuery(event.target.value)}/></label></div></div>
                <div className="background-grid">{filtered.map(record => <article className="background-card" key={record.id}>
                  <div className="background-preview"><Image size={26}/><span>BG · {record.values.type || "Chưa phân loại"}</span></div>
                  <div className="background-card-content"><div className="background-card-title"><span><small>{record.values.platform}</small><b>{record.values.brand}</b></span><button className="icon-button" onClick={() => openEdit(record)} aria-label="Sửa background"><Pencil size={16}/></button></div>
                    <div className="background-links"><span><Image size={14}/> {record.values.link1 || "Chưa có hình 1"}</span><span><Image size={14}/> {record.values.link2 || "Chưa có hình 2"}</span></div>
                    <p>{record.values.sharedNote || "Chưa có ghi chú"}</p><button className="outline-button background-edit" onClick={() => openEdit(record)}><Pencil size={14}/> Chỉnh sửa hồ sơ</button>
                  </div>
                </article>)}</div>
                {!filtered.length && <div className="empty-state"><Database size={25}/><b>Không có background</b><span>Thử tìm theo tên thương hiệu.</span></div>}
                <div className="asset-notice"><LockKeyhole size={15}/> Background chỉ được thêm thông qua khung record brand; không thể tạo hoặc xóa record tại đây.</div>
              </section>
            ) : (
              <section className="data-panel">
                <div className="panel-heading"><div><h2>{module === "titles" ? "Mẫu tiêu đề theo thương hiệu" : `Danh sách ${config.singular}`}</h2><p>{filtered.length} bản ghi được hiển thị</p></div>
                  <div className="filters"><label className="table-search"><Search size={16}/><input placeholder="Tìm trong danh sách..." value={query} onChange={event => setQuery(event.target.value)}/></label>
                    {module === "titles" && <><label className="select-wrap"><select aria-label="Lọc title theo sàn" value={filterPlatform} onChange={event => setFilterPlatform(event.target.value)}><option value="all">Tất cả sàn</option><option value="TTS">TTS</option><option value="SHP">SHP</option></select><ChevronDown size={15}/></label><label className="select-wrap"><select aria-label="Lọc title theo brand" value={filterBrand} onChange={event => setFilterBrand(event.target.value)}><option value="all">Tất cả brand</option>{recordBrands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select><ChevronDown size={15}/></label></>}
                    {module === "hosts" && <label className="select-wrap"><select value={hostGroup} onChange={event => setHostGroup(event.target.value)}><option>ECO ID</option><option>CPD ID</option></select><ChevronDown size={15}/></label>}
                  </div>
                </div>
                <div className="desktop-table-wrap"><table className="data-table">
                  <thead><tr>{config.columns.map(column => <th key={column.key}>{column.label}</th>)}<th>Thao tác</th></tr></thead>
                  <tbody>{filtered.map(record => <tr key={record.id}>
                    {config.columns.map(column => <td key={column.key}>{column.key === "flags" ? <span className="cell-chip">{getDisplayValue(module, record, column.key)}</span> : <span className={["brand", "title", "name", "hostCode"].includes(column.key) ? "cell-strong" : ""}>{getDisplayValue(module, record, column.key)}</span>}</td>)}
                    <td><div className="row-actions"><button onClick={() => openEdit(record)} aria-label="Sửa"><Pencil size={16}/></button>{canDelete && <button onClick={() => handleDelete(record)} aria-label="Xóa"><Trash2 size={16}/></button>}</div></td>
                  </tr>)}</tbody>
                </table>{!filtered.length && <div className="empty-state"><Database size={25}/><b>Không có dữ liệu</b><span>{canCreate ? "Thử từ khóa khác hoặc tạo mã host mới." : "Thử thay đổi từ khóa tìm kiếm."}</span></div>}</div>
                <div className="mobile-record-list">{filtered.map(record => <article className="record-card" key={record.id}>
                  <div className="record-card-top"><div><span className="record-overline">{module === "hosts" ? record.values.hostCode : record.values.platform}</span><h3>{record.values.brand || record.values.name}</h3></div></div>
                  <div className="record-details">{config.columns.slice(1).map(column => <div key={column.key}><small>{column.label}</small><span>{getDisplayValue(module, record, column.key)}</span></div>)}</div>
                  <div className="record-card-actions"><button onClick={() => openEdit(record)}><Pencil size={15}/> Chỉnh sửa</button>{canDelete && <button className="danger-action" onClick={() => handleDelete(record)}><Trash2 size={15}/> Xóa</button>}</div>
                </article>)}</div>
                <div className="panel-footer"><span>Hiển thị {filtered.length} / {records.length} bản ghi</span></div>
                {module === "titles" && <div className="asset-notice"><LockKeyhole size={15}/> Title chỉ được sửa nội dung và thành phần ghép. Không thể thêm/xóa; sàn và thương hiệu được khóa.</div>}
                {module === "hosts" && <div className="asset-notice"><ShieldCheck size={15}/> Danh sách mã host đang xem: {hostGroup === "ECO ID" ? "ECO" : "BAS"}.</div>}
              </section>
            )}
          </>}

          {screen === "library" && <section className="data-panel library-panel">
            <div className="library-toolbar"><div className="library-filter-tabs"><button className={libraryFilter === "all" ? "selected" : ""} onClick={() => setLibraryFilter("all")}>Tất cả</button><button className={libraryFilter === "CPD" ? "selected" : ""} onClick={() => setLibraryFilter("CPD")}>CPD</button><button className={libraryFilter === "P&G" ? "selected" : ""} onClick={() => setLibraryFilter("P&G")}>P&amp;G</button></div>
              {canManageLibrary ? <button className="create-button library-mobile-create" onClick={() => { setEditingLibraryId(undefined); setLibraryDraft({ name: "", description: "" }); setLibraryModal(true); }}><Plus size={16}/> Thêm sheet</button> : <span className="permission-note"><LockKeyhole size={14}/> Chỉ superadmin được quản lý danh mục</span>}
            </div>
            <div className="library-grid">{visibleLibrary.map(item => <article className="library-card" key={item.id}>
              <div className="library-icon"><FileText size={22}/></div><div className="library-card-heading"><span className="division-tag">{item.division}</span>{canManageLibrary && <span className="library-card-actions"><button className="icon-button" aria-label="Sửa sheet" onClick={() => openLibraryEdit(item)}><Pencil size={15}/></button><button className="icon-button" aria-label="Xóa sheet" onClick={() => setLibrary(current => current.filter(row => row.id !== item.id))}><Trash2 size={15}/></button></span>}</div>
              <h3>{item.name}</h3><p>{item.description}</p><div className="library-card-footer"><span>Cập nhật {item.updated}</span><button className="text-button" onClick={() => setToast("Liên kết sheet sẽ hoạt động khi kết nối backend.")}>Mở sheet <ExternalLink size={14}/></button></div>
            </article>)}</div>
            <div className="asset-notice"><LockKeyhole size={15}/> Danh sách chỉ xem với Admin. Nút quản lý mô phỏng quyền Superadmin; chưa áp dụng phân quyền thật.</div>
          </section>}

          {(screen === "livestream-checking" || screen === "warning-checking") && <section className="future-panel">
            <div className="future-icon"><Clock3 size={28}/></div><span className="status status-amber">SẮP PHÁT TRIỂN</span><h2>{screenTitle}</h2>
            <p>Phân hệ này được giữ chỗ trong giao diện để triển khai ở giai đoạn sau. Hiện chưa có thao tác hoặc dữ liệu thật.</p>
            <button className="outline-button" onClick={() => setScreen("schedules")}><CalendarDays size={16}/> Quay lại lịch live</button>
          </section>}

          {screen === "admin-users" && <section className="data-panel">
            {canManageLibrary ? <>
              <div className="panel-heading"><div><h2>Danh sách tài khoản</h2><p>{accounts.length} tài khoản</p></div><div className="account-heading-actions"><span className="permission-note"><ShieldCheck size={14}/> Superadmin</span><button className="create-button" onClick={openAccountCreate}><Plus size={15}/> Thêm tài khoản</button></div></div>
              <div className="account-list">{accounts.map(account => <article className="account-row" key={account.username}>
                <span className="profile-avatar">{account.avatar ? <img className="account-avatar-image" src={account.avatar} alt=""/> : (account.name || account.username).slice(0, 2).toUpperCase()}</span>
                <span className="account-details"><b>{account.name || account.username}</b><small>{account.username} · {getRoleLabel(account.role)}</small></span>
                <span className={`status ${!account.provisioned ? "status-amber" : account.active ? "status-green" : "status-red"}`}>{!account.provisioned ? "Chưa cấp mật khẩu" : account.active ? "Đang hoạt động" : "Đã khóa"}</span>
                <div className="account-actions"><button className="outline-button account-toggle" onClick={() => openAccountEdit(account)} aria-label={`Sửa ${account.username}`}><Pencil size={14}/><span>Sửa</span></button><button className="outline-button account-toggle" disabled={account.role === "superadmin" || !account.provisioned} onClick={() => void toggleAdminAccount(account)}>{account.active ? "Khóa" : "Mở khóa"}</button><button className="outline-button account-delete" onClick={() => void removeAdminAccount(account)} aria-label={`Xóa ${account.username}`}><Trash2 size={14}/></button></div>
              </article>)}</div>
            </> : <>
              <div className="panel-heading"><div><h2>Hồ sơ của tôi</h2><p>Chỉ bạn mới xem được thông tin tài khoản này.</p></div><button className="create-button" onClick={openOwnProfile}><Pencil size={15}/> Sửa mật khẩu / avatar</button></div>
              {ownAccount && <article className="own-account-card" key={ownAccount.username}>
                <span className="profile-avatar own-account-avatar">{ownAccount.avatar ? <img className="account-avatar-image" src={ownAccount.avatar} alt=""/> : (ownAccount.name || ownAccount.username).slice(0, 2).toUpperCase()}</span>
                <div><h3>{ownAccount.name || ownAccount.username}</h3><p>{ownAccount.username}</p><span className="status status-blue">{getRoleLabel(ownAccount.role)}</span></div>
              </article>}
            </>}
          </section>}

          {!isBackendEnabled && screen !== "dashboard" && <div className="page-footnote"><span className="connection-dot"/> Giao diện demo · Chưa kết nối Google Sheets hoặc Google Drive</div>}
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh">
        {([
          ["dashboard", "Tổng quan", LayoutDashboard],
          ["schedules", "Lịch", CalendarDays],
          ["backgrounds", "BG", Package],
          ["hosts", "Host", Users],
          ["titles", "Title", FileText]
        ] as const).map(([key, label, Icon]) => {
          const disabled = division === "P&G" && key !== "schedules" && key !== "dashboard";
          return <button key={key} className={screen === key ? "active" : ""} onClick={() => setScreen(key)} disabled={disabled}><Icon size={18}/><span>{label}</span></button>;
        })}
      </nav>

      {formOpen && <div className="form-overlay"><form className="record-form" onSubmit={handleSave}>
        <div className="form-header"><div><span className="eyebrow">{division} · QUẢN LÝ DỮ LIỆU</span><h2>{editing ? "Cập nhật bản ghi" : `Tạo ${config.singular} mới`}</h2><p>{module === "schedules" ? "Chỉ được cập nhật thông tin vận hành của lịch đã import." : module === "backgrounds" ? "Chỉ cập nhật tài nguyên của record brand đã có." : module === "titles" ? "Chỉ sửa title và các tùy chọn ghép." : "Nhập thông tin mã host."}</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content">
          {module === "backgrounds" && <div className="upload-demo-box">
            <div className="upload-demo-copy"><span className="upload-icon"><FolderOpen size={19}/></span><span><b>Chọn thư mục background trên Drive</b><small>Drive mở riêng; lưu link hình vào record brand hiện có.</small></span></div>
            <a className="outline-button upload-button" href="https://drive.google.com/drive/my-drive" target="_blank" rel="noreferrer"><FolderOpen size={15}/> Mở Google Drive</a>
          </div>}
          {module === "schedules" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.date} · {editing.values.startTime}–{editing.values.endTime} · {editing.values.brand} <small>Thông tin import được khóa</small></div>}
          {module === "backgrounds" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.platform} · {editing.values.brand}<small>Record brand được khóa, chỉ sửa phần background</small></div>}
          {module === "titles" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.platform} · {editing.values.brand}<small>Không thể đổi sàn/thương hiệu hoặc thêm/xóa title. Shopee cần tránh các cụm từ tuyệt đối, kéo giao dịch ra ngoài nền tảng và nội dung nhạy cảm/hàng cấm.</small></div>}
          {Array.from(new Set(config.fields.map(field => field.group || "Thông tin"))).map(group => <section className="form-section" key={group}><h3>{group}</h3><div className="form-grid">
            {config.fields.filter(field => (field.group || "Thông tin") === group).map(field => <label className={`form-field ${field.type === "textarea" ? "field-full" : ""}`} key={field.key}>
              <span>{field.label}{field.required && <i> *</i>}</span>
              {field.type === "textarea" ? <textarea required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}/> :
                field.type === "select" ? <select required={field.required} value={formValues[field.key] ?? field.options?.[0] ?? ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map(option => <option key={option} value={option}>{field.key.endsWith("Flag") ? (option === "1" ? "Có" : "Không") : option}</option>)}</select> :
                  <input type={field.type === "time" ? "time" : "text"} required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}/>}
              {field.hint && <small>{field.hint}</small>}
            </label>)}
          </div></section>)}
          {module === "titles" && editing && platformFilterKey(editing.values.platform || "") === "TTS" && <div className={`title-length-check ${getComposedTitleLength(formValues, maxHostCodeLength) > 32 ? "over-limit" : ""}`}>
            <b>{getComposedTitleLength(formValues, maxHostCodeLength)} / 32 ký tự</b>
            <span>Đã tính mã host tối đa {maxHostCodeLength} ký tự, giờ (hh), ngày (dd/mm) và dấu gạch dưới.</span>
          </div>}
          {module === "titles" && editing && platformFilterKey(editing.values.platform || "") === "SHP" && <div className="title-length-check title-policy-note">
            <b>Kiểm tra nội dung Shopee</b>
            <span>Tự động kiểm tra các cụm từ được liệt kê; nội dung nhạy cảm, hàng cấm, bản quyền và thông tin sai lệch cần kiểm tra thủ công.</span>
          </div>}
        </div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Hủy</button><button className="create-button" disabled={saving}><Check size={16}/>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
      </form></div>}

      {sourceModal && <div className="form-overlay"><form className="small-modal" onSubmit={addSource}>
        <div className="form-header"><div><h2>Thêm lịch vào danh sách xem</h2><p>Thêm nguồn lịch để bật/tắt trên màn hình lịch.</p></div><button type="button" className="icon-button" onClick={() => setSourceModal(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content"><label className="form-field"><span>Tên lịch</span><input autoFocus required value={sourceName} placeholder="Ví dụ: Lịch booking host" onChange={event => setSourceName(event.target.value)}/></label></div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setSourceModal(false)}>Hủy</button><button className="create-button"><Plus size={16}/> Thêm lịch</button></div>
      </form></div>}

      {libraryModal && <div className="form-overlay"><form className="small-modal" onSubmit={saveLibraryItem}>
        <div className="form-header"><div><span className="eyebrow">SUPERADMIN · MÔ PHỎNG</span><h2>{editingLibraryId ? "Sửa sheet trong thư viện" : "Thêm sheet vào thư viện"}</h2><p>Danh mục sheet được quản lý bởi người có thẩm quyền.</p></div><button type="button" className="icon-button" onClick={() => setLibraryModal(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content"><div className="form-grid">
          <label className="form-field"><span>Tên sheet *</span><input required value={libraryDraft.name} onChange={event => setLibraryDraft(current => ({ ...current, name: event.target.value }))}/></label>
          <label className="form-field"><span>Division</span><input disabled value={division}/></label>
          <label className="form-field field-full"><span>Mô tả</span><textarea value={libraryDraft.description} onChange={event => setLibraryDraft(current => ({ ...current, description: event.target.value }))}/></label>
        </div></div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setLibraryModal(false)}>Hủy</button><button className="create-button"><Check size={16}/> Lưu vào thư viện</button></div>
      </form></div>}

      {editingTracking && <div className="form-overlay"><form className="small-modal" onSubmit={saveDashboardEdit}>
        <div className="form-header"><div><span className="eyebrow">{division} · TỔNG QUAN</span><h2>Chỉnh sửa mục tracking</h2></div><button type="button" className="icon-button" onClick={() => setEditingTracking(null)} aria-label="Đóng"><X/></button></div>
        <div className="form-content"><div className="form-grid">
          <label className="form-field"><span>Trạng thái</span><input value={dashboardEditDraft.status} onChange={event => setDashboardEditDraft(current => ({ ...current, status: event.target.value }))}/></label>
          <label className="form-field field-full"><span>Nội dung</span><textarea required value={dashboardEditDraft.content} onChange={event => setDashboardEditDraft(current => ({ ...current, content: event.target.value }))}/></label>
          <label className="form-field"><span>Bắt đầu</span><input required value={dashboardEditDraft.startDate} onChange={event => setDashboardEditDraft(current => ({ ...current, startDate: event.target.value }))}/></label>
          <label className="form-field"><span>Kết thúc</span><input required value={dashboardEditDraft.endDate} onChange={event => setDashboardEditDraft(current => ({ ...current, endDate: event.target.value }))}/></label>
        </div></div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setEditingTracking(null)}>Hủy</button><button className="create-button"><Check size={16}/> Lưu thay đổi</button></div>
      </form></div>}

      {accountModal && <div className="form-overlay"><form className="small-modal" onSubmit={saveAdminAccount}>
        <div className="form-header"><div><span className="eyebrow">{accountModalMode === "profile" ? "HỒ SƠ CÁ NHÂN" : "SUPERADMIN"}</span><h2>{accountModalMode === "profile" ? "Cập nhật hồ sơ" : accountModalMode === "create" ? "Thêm tài khoản" : "Chỉnh sửa tài khoản"}</h2></div><button type="button" className="icon-button" onClick={() => setAccountModal(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content"><div className="form-grid">
          {accountModalMode === "profile" ? <>
            <label className="form-field field-full"><span>Avatar URL</span><input type="url" value={profileDraft.avatar} onChange={event => setProfileDraft(current => ({ ...current, avatar: event.target.value }))}/></label>
            <label className="form-field field-full"><span>Mật khẩu mới</span><input type="password" autoComplete="new-password" minLength={12} value={profileDraft.password} onChange={event => setProfileDraft(current => ({ ...current, password: event.target.value }))}/><small>Để trống nếu chỉ đổi avatar. Mật khẩu mới tối thiểu 12 ký tự.</small></label>
          </> : <>
            <label className="form-field"><span>User ID *</span><input autoComplete="off" required value={accountDraft.username} onChange={event => setAccountDraft(current => ({ ...current, username: event.target.value }))}/></label>
            <label className="form-field"><span>Tên hiển thị *</span><input required value={accountDraft.name} onChange={event => setAccountDraft(current => ({ ...current, name: event.target.value }))}/></label>
            <label className="form-field"><span>Role</span><select value={accountDraft.role} onChange={event => setAccountDraft(current => ({ ...current, role: event.target.value as AdminRole }))}><option value="superadmin">Superadmin</option><option value="admincpd">Admin CPD</option><option value="adminpng">Admin P&amp;G</option></select></label>
            <label className="form-field"><span>Avatar URL</span><input type="url" value={accountDraft.avatar} onChange={event => setAccountDraft(current => ({ ...current, avatar: event.target.value }))}/></label>
            <label className="form-field field-full"><span>{accountModalMode === "create" ? "Mật khẩu *" : "Mật khẩu mới"}</span><input type="password" autoComplete="new-password" minLength={12} required={accountModalMode === "create"} value={accountDraft.password || ""} onChange={event => setAccountDraft(current => ({ ...current, password: event.target.value }))}/><small>{accountModalMode === "create" ? "Ít nhất 12 ký tự." : "Để trống nếu không đổi mật khẩu."} Cột active trong LIST sẽ được đồng bộ khi khóa/mở.</small></label>
            <label className="form-field account-active-field"><span>Trạng thái</span><span className="account-active-control"><input type="checkbox" checked={accountDraft.active} onChange={event => setAccountDraft(current => ({ ...current, active: event.target.checked }))}/> Đang hoạt động</span></label>
          </>}
        </div></div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setAccountModal(false)}>Hủy</button><button className="create-button"><Check size={16}/> Lưu</button></div>
      </form></div>}

      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}
