import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, CalendarDays, ChevronDown, Cloud, Command, Database, FileText,
  LayoutDashboard, Menu, Moon, MoreHorizontal, Pencil, Plus, Search, Settings,
  Sun, Trash2, Users, X, Monitor, SlidersHorizontal, Package, Check, Bell
} from "lucide-react";
import { deleteRecord, listRecords, saveRecord } from "./services/records";
import { moduleConfig, moduleKeys, type Accent, type ModuleKey, type RecordItem, type ThemeMode } from "./types";

const icons = {
  schedules: CalendarDays,
  backgrounds: Package,
  titles: FileText,
  hosts: Users
};

function getDisplayValue(module: ModuleKey, record: RecordItem, key: string) {
  const v = record.values;
  if (module === "schedules" && key === "time") return `${v.startTime || "—"} – ${v.endTime || "—"}`;
  if (module === "schedules" && key === "host") return [v.host, v.pic ? `PIC: ${v.pic}` : ""].filter(Boolean).join(" · ") || "—";
  if (module === "titles" && key === "flags") {
    return [["Mã host", v.hostFlag], ["Giờ", v.timeFlag], ["Ngày", v.dateFlag]].filter(([, flag]) => flag === "1").map(([label]) => label).join(" · ") || "Không ghép";
  }
  return v[key] || "—";
}

function statusClass(value = "") {
  if (/hủy|cancel|declined/i.test(value)) return "status status-red";
  if (/hoàn tất|done|accepted|đang live|đang hoạt động/i.test(value)) return "status status-green";
  if (/sắp live|processing|pending/i.test(value)) return "status status-amber";
  return "status status-blue";
}

export default function App() {
  const [module, setModule] = useState<ModuleKey>("schedules");
  const [records, setRecords] = useState<RecordItem[]>([]);
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("cpd-theme") as ThemeMode) || "dark");
  const [accent, setAccent] = useState<Accent>(() => (localStorage.getItem("cpd-accent") as Accent) || "mauve");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RecordItem | undefined>();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [hostGroup, setHostGroup] = useState("ECO ID");

  const config = moduleConfig[module];
  const effectiveTheme = theme === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.accent = accent;
    localStorage.setItem("cpd-theme", theme);
    localStorage.setItem("cpd-accent", accent);
  }, [theme, accent, effectiveTheme]);

  async function refresh() {
    const result = await listRecords(module);
    setRecords(result);
  }

  useEffect(() => { refresh(); setQuery(""); }, [module]);

  const filtered = useMemo(() => records.filter(record =>
    !query || JSON.stringify(record.values).toLocaleLowerCase("vi").includes(query.toLocaleLowerCase("vi"))
  ), [records, query]);

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
      await saveRecord(module, formValues, editing);
      await refresh();
      setFormOpen(false);
      setToast(editing ? "Đã cập nhật bản ghi (demo)." : "Đã tạo bản ghi (demo).");
    } catch {
      setToast("Không thể lưu bản ghi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(record: RecordItem) {
    if (!window.confirm("Bạn có chắc muốn xóa bản ghi này?")) return;
    await deleteRecord(module, record);
    await refresh();
    setToast("Đã xóa bản ghi (demo).");
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const activeCount = records.filter(r => !/hủy|hoàn tất/i.test(r.values.status || "")).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Mở menu"><Menu /></button>
        <a className="brand" href="#" onClick={e => e.preventDefault()}>
          <span className="brand-symbol"><Cloud size={25}/><Activity size={16}/></span>
          <span>CPD MASTER<small>OPERATIONS WORKSPACE</small></span>
        </a>
        <div className="global-search"><Search size={18}/><input placeholder="Tìm kiếm dữ liệu..." value={query} onChange={e => setQuery(e.target.value)}/><kbd>⌘ K</kbd></div>
        <div className="top-actions">
          <button className="icon-button" aria-label="Thông báo"><Bell size={19}/></button>
          <button className="create-button" onClick={openCreate}><Plus size={17}/> <span>Tạo {module === "schedules" ? "khung giờ" : config.singular}</span></button>
          <button className="icon-button settings-trigger" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Cài đặt giao diện"><Settings size={19}/></button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
          <div className="workspace-caption">KHÔNG GIAN LÀM VIỆC</div>
          <div className="workspace-switch"><span className="workspace-avatar">C</span><span><b>CPD MASTER</b><small>Quản trị nội dung</small></span><ChevronDown size={16}/></div>
          <div className="nav-caption">QUẢN LÝ DỮ LIỆU</div>
          <nav className="side-nav">
            {moduleKeys.map(key => {
              const Icon = icons[key];
              return <button key={key} className={`nav-item ${module === key ? "active" : ""}`} onClick={() => { setModule(key); setMobileMenu(false); }}>
                <Icon size={18}/><span>{moduleConfig[key].title}</span>{module === key && <span className="nav-indicator"/>}
              </button>;
            })}
          </nav>
          <div className="sidebar-bottom">
            <div className="connection-card"><span className="connection-dot"/><span><b>Data workspace</b><small>Chế độ giao diện demo</small></span></div>
            <button className="profile-button" onClick={() => setSettingsOpen(true)}><span className="profile-avatar">AD</span><span><b>Admin CPD</b><small>Quản trị viên</small></span><MoreHorizontal size={18}/></button>
          </div>
        </aside>
        {mobileMenu && <button className="sidebar-scrim" aria-label="Đóng menu" onClick={() => setMobileMenu(false)}/>}

        <main className="main-content">
          <div className="breadcrumb"><span>CPD MASTER</span><span>/</span><b>{config.title}</b></div>
          <section className="page-heading">
            <div><div className="eyebrow"><span/> TRUNG TÂM VẬN HÀNH</div><h1>{config.title}</h1><p>{config.description}</p></div>
            <div className="heading-actions">
              <button className="outline-button" onClick={refresh}><Activity size={16}/> Làm mới</button>
              <button className="create-button desktop-create" onClick={openCreate}><Plus size={17}/> Tạo mới</button>
            </div>
          </section>

          <section className="metric-row">
            <div className="metric-card"><span className="metric-icon"><Database size={18}/></span><span><small>{`Tổng ${config.singular}`}</small><b>{records.length}</b></span></div>
            <div className="metric-card"><span className="metric-icon metric-icon-green"><Check size={18}/></span><span><small>Đang hoạt động</small><b>{activeCount}</b></span></div>
            <div className="metric-note"><span className="note-icon"><Command size={17}/></span><span><b>Quản lý tập trung</b><small>Giao diện desktop & mobile</small></span></div>
          </section>

          <section className="data-panel">
            <div className="panel-heading">
              <div><h2>{config.title === "Lịch phát sóng" ? "Danh sách khung giờ" : `Danh sách ${config.singular}`}</h2><p>{filtered.length} bản ghi được hiển thị</p></div>
              <div className="filters">
                <label className="table-search"><Search size={16}/><input placeholder="Tìm trong danh sách..." value={query} onChange={e => setQuery(e.target.value)}/></label>
                {module === "hosts" && <label className="select-wrap"><select value={hostGroup} onChange={e => setHostGroup(e.target.value)}><option>ECO ID</option><option>CPD ID</option></select><ChevronDown size={15}/></label>}
                <button className="filter-button" onClick={() => setSettingsOpen(true)}><SlidersHorizontal size={15}/><span>Tùy chỉnh</span></button>
              </div>
            </div>

            <div className="desktop-table-wrap">
              <table className="data-table">
                <thead><tr><th className="check-col"><input type="checkbox" aria-label="Chọn tất cả"/></th>{config.columns.map(col => <th key={col.key}>{col.label}</th>)}<th>Thao tác</th></tr></thead>
                <tbody>
                  {filtered.map(record => <tr key={record.id}>
                    <td><input type="checkbox" aria-label="Chọn bản ghi"/></td>
                    {config.columns.map(col => <td key={col.key}>
                      {col.key === "status" ? <span className={statusClass(getDisplayValue(module, record, col.key))}>{getDisplayValue(module, record, col.key)}</span> :
                        <span className={["brand","title","name","date","time"].includes(col.key) ? "cell-strong" : ""}>{getDisplayValue(module, record, col.key)}</span>}
                    </td>)}
                    <td><div className="row-actions"><button onClick={() => openEdit(record)} aria-label="Sửa"><Pencil size={16}/></button><button onClick={() => handleDelete(record)} aria-label="Xóa"><Trash2 size={16}/></button></div></td>
                  </tr>)}
                </tbody>
              </table>
              {filtered.length === 0 && <div className="empty-state"><Database size={25}/><b>Không có dữ liệu</b><span>Thử thay đổi từ khóa tìm kiếm hoặc tạo bản ghi mới.</span></div>}
            </div>

            <div className="mobile-record-list">
              {filtered.map(record => <article className="record-card" key={record.id}>
                <div className="record-card-top">
                  <div><span className="record-overline">{module === "schedules" ? getDisplayValue(module, record, "date") : config.title}</span><h3>{record.values.brand || record.values.name || record.values.platform || config.singular}</h3></div>
                  {module === "schedules" && <span className={statusClass(record.values.status)}>{record.values.status || "Chưa đặt"}</span>}
                </div>
                {module === "schedules" ? <><strong className="record-time">{getDisplayValue(module, record, "time")}</strong><p>Host: {record.values.host || "Chưa gán"} · {record.values.room || "Chưa có phòng"}</p><p className="record-sub">{record.values.platform} · PIC: {record.values.pic || "—"}</p></> :
                  <div className="record-details">{config.columns.slice(0, 3).map(col => <div key={col.key}><small>{col.label}</small><span>{getDisplayValue(module, record, col.key)}</span></div>)}</div>}
                <div className="record-card-actions"><button onClick={() => openEdit(record)}><Pencil size={15}/> Chỉnh sửa</button><button className="danger-action" onClick={() => handleDelete(record)}><Trash2 size={15}/> Xóa</button></div>
              </article>)}
              {filtered.length === 0 && <div className="empty-state"><Database size={25}/><b>Không có dữ liệu</b><span>Thử từ khóa khác hoặc tạo bản ghi mới.</span></div>}
            </div>
            <div className="panel-footer"><span>Hiển thị {filtered.length} / {records.length} bản ghi</span><div className="pagination"><button disabled>‹</button><button className="current-page">1</button><button disabled>›</button></div></div>
          </section>
          <div className="page-footnote"><span className="connection-dot"/> Dữ liệu minh họa · Chưa kết nối Google Sheets</div>
        </main>
      </div>

      {settingsOpen && <div className="popover-backdrop" onClick={() => setSettingsOpen(false)}><section className="settings-popover" onClick={e => e.stopPropagation()}>
        <div className="popover-title"><div><b>Tùy chỉnh giao diện</b><small>Cá nhân hóa không gian làm việc</small></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={17}/></button></div>
        <label className="setting-label">Chế độ hiển thị</label>
        <div className="theme-options">
          {([{value:"light",label:"Sáng",Icon:Sun},{value:"dark",label:"Tối",Icon:Moon},{value:"system",label:"Theo thiết bị",Icon:Monitor}] as const).map(item => <button className={theme === item.value ? "selected" : ""} key={item.value} onClick={() => setTheme(item.value)}><item.Icon size={17}/>{item.label}</button>)}
        </div>
        <label className="setting-label">Màu nhấn</label>
        <div className="accent-options">
          {(["mauve","purple","blue","green"] as Accent[]).map(color => <button key={color} className={`accent-swatch ${color} ${accent === color ? "selected" : ""}`} onClick={() => setAccent(color)} aria-label={color}>{accent === color && <Check size={15}/>}</button>)}
        </div>
        <p className="settings-hint">Lựa chọn được lưu trên trình duyệt này. Đồng bộ theo tài khoản sẽ được bổ sung ở giai đoạn authentication.</p>
      </section></div>}

      {formOpen && <div className="form-overlay">
        <form className="record-form" onSubmit={handleSave}>
          <div className="form-header"><div><span className="eyebrow">CPD MASTER · QUẢN LÝ DỮ LIỆU</span><h2>{editing ? "Cập nhật bản ghi" : `Tạo ${config.singular} mới`}</h2><p>Nhập thông tin bên dưới để lưu bản ghi.</p></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)}><X/></button></div>
          <div className="form-content">
            {Array.from(new Set(config.fields.map(field => field.group || "Thông tin"))).map(group => <section className="form-section" key={group}>
              <h3>{group}</h3><div className="form-grid">
                {config.fields.filter(field => (field.group || "Thông tin") === group).map(field => <label className={`form-field ${field.type === "textarea" ? "field-full" : ""}`} key={field.key}>
                  <span>{field.label}{field.required && <i> *</i>}</span>
                  {field.type === "textarea" ? <textarea required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={e => setFormValues(v => ({...v,[field.key]:e.target.value}))}/> :
                    field.type === "select" ? <select required={field.required} value={formValues[field.key] ?? field.options?.[0] ?? ""} onChange={e => setFormValues(v => ({...v,[field.key]:e.target.value}))}>{field.options?.map(option => <option key={option} value={option}>{field.key.endsWith("Flag") ? (option === "1" ? "Có" : "Không") : option}</option>)}</select> :
                    <input type={field.type === "time" ? "time" : "text"} required={field.required} value={formValues[field.key] || ""} placeholder={field.hint || ""} onChange={e => setFormValues(v => ({...v,[field.key]:e.target.value}))}/>}
                  {field.hint && <small>{field.hint}</small>}
                </label>)}
              </div>
            </section>)}
          </div>
          <div className="form-footer"><button type="button" className="outline-button" onClick={() => setFormOpen(false)}>Hủy</button><button className="create-button" disabled={saving}><Check size={16}/>{saving ? "Đang lưu..." : "Lưu thay đổi"}</button></div>
        </form>
      </div>}

      {toast && <div className="toast"><Check size={16}/>{toast}</div>}
    </div>
  );
}
