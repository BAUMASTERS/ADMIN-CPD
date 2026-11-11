import type { ModuleKey, RecordItem } from "../types";

// Mock adapter cho giai đoạn thiết kế FE.
// Sau khi API Apps Script/Vercel sẵn sàng, thay implementation tại file này.
function demoDate(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

const seed: Record<ModuleKey, RecordItem[]> = {
  schedules: [
    { id: "sch-001", rowNumber: 2, version: "demo-1", values: { date: demoDate(0), startTime: "09:00", endTime: "11:00", type: "Lịch mega", platform: "Shopee", brand: "Brand A", host: "Nguyễn A", pic: "Trần B", room: "Phòng 01", status: "Đang live" } },
    { id: "sch-002", rowNumber: 3, version: "demo-2", values: { date: demoDate(0), startTime: "13:00", endTime: "15:00", type: "Booking host", platform: "TikTok", brand: "Brand B", host: "Nguyễn C", pic: "Trần D", room: "Phòng 02", status: "Sắp live" } },
    { id: "sch-003", rowNumber: 4, version: "demo-3", values: { date: demoDate(1), startTime: "15:00", endTime: "17:00", type: "Lịch mega", platform: "Shopee", brand: "Brand C", host: "Nguyễn E", pic: "Trần F", room: "Phòng 03", status: "Đang hoạt động" } },
    { id: "sch-004", rowNumber: 5, version: "demo-4", values: { date: demoDate(4), startTime: "10:00", endTime: "12:00", type: "Lịch campaign", platform: "TikTok", brand: "Brand D", host: "Nguyễn G", pic: "Trần H", room: "Phòng 04", status: "Sắp live" } },
    { id: "sch-005", rowNumber: 6, version: "demo-5", values: { date: demoDate(6), startTime: "19:00", endTime: "21:00", type: "Booking host", platform: "Shopee", brand: "Brand E", host: "Nguyễn I", pic: "Trần K", room: "Phòng 02", status: "Đang hoạt động" } }
  ],
  backgrounds: [
    { id: "bg-001", rowNumber: 2, version: "demo-1", values: { platform: "Shopee", brand: "Brand A", type: "Main", link1: "Google Drive", note1: "Background chính", sharedNote: "Đã duyệt" } },
    { id: "bg-002", rowNumber: 3, version: "demo-2", values: { platform: "TikTok", brand: "Brand B", type: "Campaign", link1: "Google Drive", link2: "Google Drive", sharedNote: "Dùng cho chiến dịch tháng 11" } }
  ],
  titles: [
    { id: "title-001", rowNumber: 1, version: "demo-1", values: { platform: "Shopee", brand: "Brand A", title: "LIVE SIÊU SALE | {HOST} | {TIME}", hostFlag: "1", timeFlag: "1", dateFlag: "0" } },
    { id: "title-002", rowNumber: 2, version: "demo-2", values: { platform: "TikTok", brand: "Brand B", title: "ƯU ĐÃI ĐỘC QUYỀN {DATE}", hostFlag: "0", timeFlag: "0", dateFlag: "1" } }
  ],
  hosts: [
    { id: "host-001", rowNumber: 2, version: "demo-1", values: { name: "Nguyễn A", hostCode: "ECO001" } },
    { id: "host-002", rowNumber: 3, version: "demo-2", values: { name: "Trần B", hostCode: "CPD012" } }
  ]
};

type Division = "CPD" | "P&G";
const dataByDivision: Record<Division, Record<ModuleKey, RecordItem[]>> = {
  CPD: structuredClone(seed),
  "P&G": structuredClone(seed)
};

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

export async function listRecords(module: ModuleKey, division: Division = "CPD", hostGroup = "ECO ID"): Promise<RecordItem[]> {
  await wait();
  const rows = dataByDivision[division][module];
  const selectedRows = module === "hosts"
    ? rows.filter(item => hostGroup === "ECO ID"
      ? item.values.hostCode?.startsWith("ECO")
      : !item.values.hostCode?.startsWith("ECO"))
    : rows;
  return structuredClone(selectedRows);
}

export async function saveRecord(module: ModuleKey, values: Record<string, string>, existing?: RecordItem, division: Division = "CPD"): Promise<void> {
  await wait(260);
  if (module !== "hosts" && !existing) {
    throw new Error("Chỉ có thể tạo mới mã host.");
  }
  const data = dataByDivision[division];
  if (existing) {
    if (module === "titles" &&
      (values.platform !== existing.values.platform || values.brand !== existing.values.brand)) {
      throw new Error("Không thể thay đổi sàn hoặc thương hiệu của title.");
    }
    data[module] = data[module].map(item => item.id === existing.id
      ? { ...item, values: { ...values }, version: `demo-${Date.now()}` }
      : item);
  } else {
    const next = { id: `${module}-${Date.now()}`, rowNumber: data[module].length + 2, version: `demo-${Date.now()}`, values: { ...values } };
    data[module] = [next, ...data[module]];
  }
}

export async function deleteRecord(module: ModuleKey, record: RecordItem, division: Division = "CPD"): Promise<void> {
  await wait(220);
  if (module !== "hosts") {
    throw new Error("Chỉ có thể xóa mã host.");
  }
  dataByDivision[division][module] = dataByDivision[division][module].filter(item => item.id !== record.id);
}
