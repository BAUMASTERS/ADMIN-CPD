import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Cloud, Command, Flame,
  Database, FileText, LockKeyhole, Menu, Monitor, Moon,
  MoreHorizontal, Package, Pencil, Plus, Search, Settings, Sun, Trash2, Upload,
  Users, X, Check, Bell, Library, Clock3, Image,
  CircleHelp, ExternalLink, ShieldCheck
} from "lucide-react";
import { deleteRecord, listRecords, saveRecord } from "./services/records";
import { moduleConfig, moduleKeys, type Accent, type ModuleKey, type RecordItem, type ThemeMode } from "./types";

type Screen = ModuleKey | "library" | "admin-users" | "livestream-checking" | "warning-checking";
type Division = "CPD" | "P&G";
type CalendarView = "month" | "week" | "day";
type LibraryItem = { id: string; name: string; division: Division; description: string; updated: string };
type CalendarSource = { id: string; name: string; color: string };
type AdminAccount = { username: string; role: "admin" | "superadmin"; active: boolean };

const icons = {
  schedules: CalendarDays,
  backgrounds: Package,
  titles: FileText,
  hosts: Users
};

const initialSources: CalendarSource[] = [
  { id: "mega", name: "Lịch mega", color: "var(--accent)" },
  { id: "booking", name: "Booking host", color: "var(--blue)" },
  { id: "campaign", name: "Lịch campaign", color: "var(--green)" }
];

const initialLibrary: LibraryItem[] = [
  { id: "lib-1", name: "Master lịch livestream", division: "CPD", description: "Sheet nguồn lịch live theo tuần.", updated: "12/11/2026" },
  { id: "lib-2", name: "Booking host", division: "CPD", description: "Lịch booking host và phòng live.", updated: "11/11/2026" },
  { id: "lib-3", name: "P&G livestream master", division: "P&G", description: "Sheet nguồn dành cho division P&G.", updated: "10/11/2026" }
];

const initialAccounts: AdminAccount[] = [
  { username: "root.admin", role: "superadmin", active: true },
  { username: "ops.admin", role: "admin", active: true },
  { username: "content.team", role: "admin", active: false }
];

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
  const parts = value.split(/[/-]/).map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const [first, second, third] = parts;
  const day = first > 31 ? third : first;
  const month = second;
  const recordYear = first > 31 ? first : third || year;
  if (!day || month < 1 || month > 12 || day > 31) return null;
  return new Date(recordYear, month - 1, day);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(date);
}

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  start.setHours(0, 0, 0, 0);
  return start;
}

export default function App() {
  const [screen, setActiveScreen] = useState<Screen>("schedules");
  const [division, setDivision] = useState<Division>("CPD");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("cpd-theme") as ThemeMode) || "dark");
  const [accent, setAccent] = useState<Accent>(() => {
    const savedAccent = localStorage.getItem("cpd-accent");
    return savedAccent === "ember" || savedAccent === "blue" || savedAccent === "green" ? savedAccent : "phoenix";
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem | undefined>();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [hostGroup, setHostGroup] = useState("ECO ID");
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
  const [demoRole, setDemoRole] = useState<"admin" | "superadmin">("admin");
  const [localImageUrl, setLocalImageUrl] = useState("");
  const [accounts, setAccounts] = useState(initialAccounts);
  const [accountModal, setAccountModal] = useState(false);
  const [accountDraft, setAccountDraft] = useState({ username: "", password: "" });

  const isDataModule = moduleKeys.includes(screen as ModuleKey);
  const module = (isDataModule ? screen : "schedules") as ModuleKey;
  const config = moduleConfig[module];
  const canCreate = module === "hosts";
  const canDelete = module === "hosts";
  const canManageLibrary = demoRole === "superadmin";
  const effectiveTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("cpd-theme", theme);
    localStorage.setItem("cpd-accent", accent);
  }, [theme, accent, effectiveTheme]);

  useEffect(() => {
    if (!isDataModule) return;
    let active = true;
    listRecords(module, division, hostGroup).then(result => { if (active) setRecords(result); });
    setQuery("");
    return () => { active = false; };
  }, [module, isDataModule, division, hostGroup]);

  useEffect(() => () => {
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
  }, [localImageUrl]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => records.filter(record =>
    !query || JSON.stringify(record.values).toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))
  ), [records, query]);

  const scheduleRecords = useMemo(() => records.filter(record => {
    const sourceName = record.values.type || "Lịch mega";
    const source = sources.find(item => item.name === sourceName) || initialSources.find(item => item.name === sourceName);
    return !source || visibleSources.includes(source.id);
  }), [records, sources, visibleSources]);

  const activeCount = records.filter(record => !/hủy|hoàn tất/i.test(record.values.status || "")).length;
  const screenTitle = isDataModule ? config.title
    : screen === "library" ? "Thư viện" : screen === "admin-users" ? "Tài khoản admin"
      : screen === "livestream-checking" ? "Livestream Checking" : "Warning Checking";
  const visibleLibrary = library.filter(item => libraryFilter === "all" || item.division === libraryFilter);

  async function refresh() {
    if (!isDataModule) return;
    setRecords(await listRecords(module, division, hostGroup));
    setToast("Đã làm mới dữ liệu demo.");
  }

  function openCreate() {
    setEditing(undefined);
    setFormValues(Object.fromEntries(config.fields.map(field => [field.key, field.type === "select" ? (field.options?.[0] || "0") : ""])));
    setFormOpen(true);
  }

  function openEdit(record: RecordItem) {
    setEditing(record);
    setFormValues({ ...record.values });
    setFormOpen(true);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await saveRecord(module, formValues, editing, division);
      setRecords(await listRecords(module, division, hostGroup));
      setFormOpen(false);
      setToast(editing ? "Đã cập nhật bản ghi trong phiên demo." : "Đã tạo bản ghi trong phiên demo.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Không thể lưu bản ghi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: RecordItem) {
    if (!window.confirm("Bạn có chắc muốn xóa mã host này trong dữ liệu demo?")) return;
    try {
      await deleteRecord(module, record, division);
      setRecords(await listRecords(module, division, hostGroup));
      setToast("Đã xóa mã host khỏi phiên demo.");
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
    else next.setDate(next.getDate() + direction * (calendarView === "week" ? 7 : 1));
    setSelectedDate(next);
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

  function saveAdminAccount(event: FormEvent) {
    event.preventDefault();
    const username = accountDraft.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
      setToast("Tên tài khoản cần dài 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.");
      return;
    }
    if (accountDraft.password.length < 12) {
      setToast("Mật khẩu cần tối thiểu 12 ký tự.");
      return;
    }
    if (accounts.some(account => account.username === username)) {
      setToast("Tên tài khoản đã tồn tại.");
      return;
    }
    setAccounts(current => [...current, { username, role: "admin", active: true }]);
    setAccountDraft({ username: "", password: "" });
    setAccountModal(false);
    setToast("Đã thêm tài khoản trong phiên demo.");
  }

  function openAccountCreate() {
    setAccountDraft({ username: "", password: "" });
    setAccountModal(true);
  }

  const changeFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast("Vui lòng chọn tệp hình ảnh.");
      return;
    }
    if (localImageUrl) URL.revokeObjectURL(localImageUrl);
    const previewUrl = URL.createObjectURL(file);
    setLocalImageUrl(previewUrl);
    setFormValues(current => ({ ...current, link1: `LOCAL DEMO · ${file.name}` }));
    setToast("Đã chọn hình. Bản xem trước chỉ lưu trong phiên này, chưa tải lên Drive.");
  };

  const navButton = (key: Screen, label: string, Icon: typeof CalendarDays, badge?: string) => (
    <button key={key} className={`nav-item ${screen === key ? "active" : ""}`} onClick={() => setScreen(key)}>
      <Icon size={18}/><span>{label}</span>{badge && <small className="nav-badge">{badge}</small>}
      {screen === key && <span className="nav-indicator"/>}
    </button>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở menu"><Menu/></button>
        <a className="brand" href="#" onClick={event => event.preventDefault()}>
          <span className="brand-symbol"><Flame size={25}/><Activity size={14}/></span>
          <span>CPD MASTER<small>DARK PHOENIX · OPERATIONS</small></span>
        </a>
        <div className="global-search"><Search size={18}/><input aria-label="Tìm kiếm dữ liệu" placeholder="Tìm kiếm dữ liệu..." value={query} onChange={event => setQuery(event.target.value)}/><kbd>⌘ K</kbd></div>
        <div className="top-actions">
          <label className="division-picker"><span>Division</span><select value={division} onChange={event => setDivision(event.target.value as Division)}><option value="CPD">CPD</option><option value="P&G">P&amp;G</option></select><ChevronDown size={14}/></label>
          <button className="icon-button" aria-label="Thông báo"><Bell size={19}/></button>
          {isDataModule && canCreate && <button className="create-button" onClick={openCreate}><Plus size={17}/><span>Tạo {config.singular}</span></button>}
          <button className="icon-button settings-trigger" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt giao diện"><Settings size={19}/></button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
          <div className="workspace-caption">KHÔNG GIAN LÀM VIỆC</div>
          <label className="workspace-switch"><span className="workspace-avatar">{division === "CPD" ? "C" : "P"}</span><span><b>{division} MASTER</b><small>Chuyển division phía trên</small></span><ChevronDown size={16}/></label>
          <div className="nav-caption">QUẢN LÝ DỮ LIỆU</div>
          <nav className="side-nav">
            {moduleKeys.map(key => navButton(key, moduleConfig[key].title, icons[key]))}
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
            <div className="connection-card demo-connection"><span className="connection-dot"/><span><b>Chế độ giao diện demo</b><small>Dữ liệu chỉ lưu trong phiên</small></span></div>
            <button className="profile-button" onClick={() => setDemoRole(current => current === "admin" ? "superadmin" : "admin")} title="Chuyển vai trò mô phỏng">
              <span className="profile-avatar">AD</span><span><b>Admin CPD</b><small>{demoRole === "superadmin" ? "Superadmin · mô phỏng" : "Admin · mô phỏng"}</small></span>
              <MoreHorizontal size={18}/>
            </button>
          </div>
        </aside>
        {mobileMenu && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobileMenu(false)}/>}

        <main className="main-content">
          <div className="breadcrumb"><span>{division} MASTER</span><span>/</span><b>{screenTitle}</b></div>
          <section className="page-heading">
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
          </section>

          {isDataModule && <>
            {module === "schedules" && <section className="phoenix-hero">
              <div className="phoenix-hero-copy">
                <span className="phoenix-kicker"><Flame size={14}/> PHOENIX OPERATIONS · {division}</span>
                <h2>Mọi phiên live,<br/><em>đúng nhịp vận hành.</em></h2>
                <p>Lịch phát sóng trong ngày được gom tại một nơi. Chọn ngày để xem lịch theo ca.</p>
                <div className="phoenix-hero-actions">
                  <button className="hero-primary" onClick={() => { setSelectedDate(new Date()); setCalendarView("day"); }}>Xem lịch hôm nay <ChevronRight size={16}/></button>
                  <button className="hero-secondary" onClick={() => setCalendarView("week")}>Xem cả tuần</button>
                </div>
              </div>
              <div className="phoenix-orbit" aria-hidden="true"><div className="phoenix-orbit-ring"/><div className="phoenix-orbit-core"><Flame size={48}/></div><i/><i/><i/></div>
              <div className="phoenix-hero-stats"><span><b>{scheduleRecords.length}</b><small>lịch trong mẫu</small></span><span><b>{sources.length}</b><small>nguồn đang theo dõi</small></span><span><b>{division}</b><small>workspace</small></span></div>
            </section>}
            {module === "schedules" && <nav className="quick-services" aria-label="Thao tác nhanh">
              <span className="quick-services-label">Truy cập nhanh</span>
              {moduleKeys.filter(key => key !== "schedules").map(key => {
                const Icon = icons[key];
                return <button key={key} onClick={() => setScreen(key)}><span><Icon size={17}/></span><b>{moduleConfig[key].title}</b><ChevronRight size={14}/></button>;
              })}
              <button onClick={() => setScreen("library")}><span><Library size={17}/></span><b>Thư viện</b><ChevronRight size={14}/></button>
            </nav>}
            <section className="metric-row">
              <div className="metric-card"><span className="metric-icon"><Database size={18}/></span><span><small>{`Tổng ${config.singular}`}</small><b>{records.length}</b></span></div>
              <div className="metric-card"><span className="metric-icon metric-icon-green"><Check size={18}/></span><span><small>Đang hoạt động</small><b>{activeCount}</b></span></div>
              <div className="metric-note"><span className="note-icon"><Command size={17}/></span><span><b>{division} workspace</b><small>Dữ liệu demo · chưa kết nối Sheets</small></span></div>
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
                    <button className="outline-button today-button" onClick={() => { setSelectedDate(new Date()); if (window.innerWidth < 760) setCalendarView("day"); }}>Hôm nay</button>
                  </div>
                  <div className="calendar-view-switch">{(["month", "week", "day"] as CalendarView[]).map(view => <button key={view} className={calendarView === view ? "selected" : ""} onClick={() => setCalendarView(view)}>{view === "month" ? "Tháng" : view === "week" ? "Tuần" : "Ngày"}</button>)}</div>
                </div>
                <div className="calendar-source-row">
                  <div className="calendar-source-list">{sources.map(source => <span className="calendar-source-chip" key={source.id}>
                    <button className={!visibleSources.includes(source.id) ? "source-hidden" : ""} onClick={() => toggleSource(source.id)}><i style={{ background: source.color }}/>{source.name}</button>
                    <button className="source-remove" onClick={() => removeSource(source.id)} aria-label={`Bỏ ${source.name}`}><X size={12}/></button>
                  </span>)}</div>
                  <button className="filter-button" onClick={() => setSourceModal(true)}><Plus size={15}/><span>Thêm lịch xem</span></button>
                </div>
                {calendarView === "month" ? (
                  <div className="month-grid">
                    {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(day => <div className="weekday-heading" key={day}>{day}</div>)}
                    {(() => {
                      const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                      const firstCell = startOfWeek(monthStart);
                      return Array.from({ length: 42 }, (_, index) => {
                        const date = new Date(firstCell);
                        date.setDate(firstCell.getDate() + index);
                        const events = getRecordsForDate(date);
                        return <button key={dateKey(date)} className={`month-cell ${date.getMonth() !== selectedDate.getMonth() ? "outside-month" : ""} ${dateKey(date) === dateKey(selectedDate) ? "selected-day" : ""}`} onClick={() => { setSelectedDate(date); if (window.innerWidth < 760) setCalendarView("day"); }}>
                          <span className="month-cell-date">{date.getDate()}</span>
                          <span className="month-cell-events">{events.slice(0, 2).map(event => <span className="calendar-event" key={event.id}><i style={{ background: sources.find(source => source.name === (event.values.type || "Lịch mega"))?.color || "var(--accent)" }}/><b>{event.values.startTime} {event.values.brand}</b></span>)}{events.length > 2 && <small>+{events.length - 2} lịch</small>}</span>
                        </button>;
                      });
                    })()}
                  </div>
                ) : (
                  <div className={`agenda-view ${calendarView === "day" ? "single-day" : ""}`}>
                    {(calendarView === "day" ? [selectedDate] : Array.from({ length: 7 }, (_, index) => {
                      const date = startOfWeek(selectedDate); date.setDate(date.getDate() + index); return date;
                    })).map(date => {
                      const events = getRecordsForDate(date);
                      return <section className="agenda-day" key={dateKey(date)}>
                        <div className="agenda-date"><b>{date.getDate()}</b><span>{new Intl.DateTimeFormat("vi-VN", { weekday: "short" }).format(date)}</span></div>
                        <div className="agenda-events">{events.length ? events.map(event => <button className="agenda-event" key={event.id} onClick={() => openEdit(event)}>
                          <span className="agenda-event-time">{event.values.startTime || "--:--"}<small>{event.values.endTime || "--:--"}</small></span>
                          <span className="agenda-event-main"><b>{event.values.brand}</b><small>{event.values.type} · {event.values.platform} · Host: {event.values.host || "Chưa gán"}</small></span>
                          <span className={statusClass(event.values.status)}>{event.values.status || "Chưa đặt"}</span><Pencil size={15}/>
                        </button>) : <div className="agenda-empty">Không có lịch</div>}</div>
                      </section>;
                    })}
                  </div>
                )}
                <div className="calendar-legend"><LockKeyhole size={14}/> Lịch import chỉ cho phép sửa host, phòng, trạng thái và ISKEEP. Không thể thêm hoặc xóa.</div>
              </section>
            ) : module === "backgrounds" ? (
              <section className="data-panel">
                <div className="panel-heading"><div><h2>Background theo thương hiệu</h2><p>{filtered.length} hồ sơ · chỉ chỉnh sửa record sẵn có</p></div><div className="filters"><label className="table-search"><Search size={16}/><input placeholder="Tìm thương hiệu..." value={query} onChange={event => setQuery(event.target.value)}/></label></div></div>
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
              <div className="panel-heading"><div><h2>Danh sách tài khoản truy cập</h2><p>{accounts.length} tài khoản · tài khoản do quản trị viên cấp</p></div><div className="account-heading-actions"><span className="permission-note"><ShieldCheck size={14}/> Superadmin</span><button className="create-button" onClick={openAccountCreate}><Plus size={15}/> Tạo tài khoản</button></div></div>
              <div className="account-list">{accounts.map(account => <article className="account-row" key={account.username}>
                <span className="profile-avatar">{account.username.slice(0, 2).toUpperCase()}</span>
                <span className="account-details"><b>{account.username}</b><small>{account.role === "superadmin" ? "Superadmin" : "Admin"} · nội bộ</small></span>
                <span className={`status ${account.active ? "status-green" : "status-red"}`}>{account.active ? "Đang hoạt động" : "Đã khóa"}</span>
                <button className="outline-button account-toggle" disabled={account.role === "superadmin"} onClick={() => setAccounts(current => current.map(item => item.username === account.username ? { ...item, active: !item.active } : item))}>{account.active ? "Khóa" : "Mở khóa"}</button>
              </article>)}</div>
              <div className="asset-notice"><LockKeyhole size={15}/> Quản lý tài khoản chỉ dành cho Superadmin. Tạo/khóa ở đây hiện chỉ mô phỏng, chưa gọi Apps Script.</div>
            </> : <div className="permission-denied"><LockKeyhole size={25}/><h2>Không đủ quyền truy cập</h2><p>Chỉ Superadmin mới được xem và quản lý tài khoản admin.</p><span>Dùng nút hồ sơ ở sidebar để chuyển vai trò demo.</span></div>}
          </section>}

          <div className="page-footnote"><span className="connection-dot"/> Giao diện demo · Chưa kết nối Google Sheets hoặc Google Drive</div>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Điều hướng nhanh">
        {([
          ["schedules", "Lịch", CalendarDays],
          ["backgrounds", "Nền", Package],
          ["titles", "Title", FileText],
          ["hosts", "Host", Users],
          ["library", "Thư viện", Library]
        ] as const).map(([key, label, Icon]) => <button key={key} className={screen === key ? "active" : ""} onClick={() => setScreen(key)}><Icon size={18}/><span>{label}</span></button>)}
      </nav>

      {settingsOpen && <div className="popover-backdrop" onClick={() => setSettingsOpen(false)}><section className="settings-popover" onClick={event => event.stopPropagation()}>
        <div className="popover-title"><div><b>Tùy chỉnh giao diện</b><small>Cá nhân hóa không gian làm việc</small></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button></div>
        <label className="setting-label">Chế độ hiển thị</label><div className="theme-options">
          {([{ value: "light", label: "Sáng", Icon: Sun }, { value: "dark", label: "Tối", Icon: Moon }, { value: "system", label: "Theo thiết bị", Icon: Monitor }] as const).map(item => <button className={theme === item.value ? "selected" : ""} key={item.value} onClick={() => setTheme(item.value)}><item.Icon size={17}/>{item.label}</button>)}
        </div>
        <label className="setting-label">Màu nhấn</label>
        <div className="accent-options">{(["phoenix", "ember", "blue", "green"] as Accent[]).map(color => <button key={color} className={`accent-swatch ${color} ${accent === color ? "selected" : ""}`} onClick={() => setAccent(color)} aria-label={color} title={color === "phoenix" ? "Phoenix đỏ" : color === "ember" ? "Hổ phách" : color === "blue" ? "Xanh" : "Lục"}>{accent === color && <Check size={15}/>}</button>)}</div>
        <p className="settings-hint">Lựa chọn được lưu trên trình duyệt này. Vai trò và dữ liệu hiện chỉ là mô phỏng giao diện.</p>
      </section></div>}

      {formOpen && <div className="form-overlay"><form className="record-form" onSubmit={handleSave}>
        <div className="form-header"><div><span className="eyebrow">{division} · QUẢN LÝ DỮ LIỆU</span><h2>{editing ? "Cập nhật bản ghi" : `Tạo ${config.singular} mới`}</h2><p>{module === "schedules" ? "Chỉ được cập nhật thông tin vận hành của lịch đã import." : module === "backgrounds" ? "Chỉ cập nhật tài nguyên của record brand đã có." : module === "titles" ? "Chỉ sửa title và các tùy chọn ghép." : "Nhập thông tin mã host."}</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content">
          {module === "backgrounds" && <div className="upload-demo-box">
            <div className="upload-demo-copy"><span className="upload-icon"><Upload size={19}/></span><span><b>Tải hình background</b><small>Chọn hình để xem trước · chưa tải lên Google Drive</small></span></div>
            <label className="outline-button upload-button"><Upload size={15}/> Chọn hình<input type="file" accept="image/*" onChange={event => changeFile(event.target.files?.[0])}/></label>
            {localImageUrl && <img className="upload-preview" src={localImageUrl} alt="Xem trước background đã chọn"/>}
          </div>}
          {module === "schedules" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.date} · {editing.values.startTime}–{editing.values.endTime} · {editing.values.brand} <small>Thông tin import được khóa</small></div>}
          {module === "backgrounds" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.platform} · {editing.values.brand}<small>Record brand được khóa, chỉ sửa phần background</small></div>}
          {module === "titles" && editing && <div className="locked-record"><LockKeyhole size={15}/> {editing.values.platform} · {editing.values.brand}<small>Không thể đổi sàn/thương hiệu hoặc thêm/xóa title</small></div>}
          {Array.from(new Set(config.fields.map(field => field.group || "Thông tin"))).map(group => <section className="form-section" key={group}><h3>{group}</h3><div className="form-grid">
            {config.fields.filter(field => (field.group || "Thông tin") === group).map(field => <label className={`form-field ${field.type === "textarea" ? "field-full" : ""}`} key={field.key}>
              <span>{field.label}{field.required && <i> *</i>}</span>
              {field.type === "textarea" ? <textarea required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}/> :
                field.type === "select" ? <select required={field.required} value={formValues[field.key] ?? field.options?.[0] ?? ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}>{field.options?.map(option => <option key={option} value={option}>{field.key.endsWith("Flag") ? (option === "1" ? "Có" : "Không") : option}</option>)}</select> :
                  <input type={field.type === "time" ? "time" : "text"} required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={event => setFormValues(current => ({ ...current, [field.key]: event.target.value }))}/>}
              {field.hint && <small>{field.hint}</small>}
            </label>)}
          </div></section>)}
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

      {accountModal && <div className="form-overlay"><form className="small-modal" onSubmit={saveAdminAccount}>
        <div className="form-header"><div><span className="eyebrow">SUPERADMIN · MÔ PHỎNG</span><h2>Tạo tài khoản admin</h2><p>Cấp tài khoản nội bộ do Superadmin quản lý.</p></div><button type="button" className="icon-button" onClick={() => setAccountModal(false)} aria-label="Đóng"><X/></button></div>
        <div className="form-content"><div className="form-grid">
          <label className="form-field"><span>Tên tài khoản *</span><input autoComplete="off" required value={accountDraft.username} onChange={event => setAccountDraft(current => ({ ...current, username: event.target.value }))}/></label>
          <label className="form-field"><span>Mật khẩu *</span><input type="password" autoComplete="new-password" minLength={12} required value={accountDraft.password} onChange={event => setAccountDraft(current => ({ ...current, password: event.target.value }))}/><small>Tối thiểu 12 ký tự. Mật khẩu không được lưu trong giao diện demo.</small></label>
        </div></div>
        <div className="form-footer"><button type="button" className="outline-button" onClick={() => setAccountModal(false)}>Hủy</button><button className="create-button"><Check size={16}/> Tạo tài khoản</button></div>
      </form></div>}

      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}
