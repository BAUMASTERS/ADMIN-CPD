import type { ModuleKey, RecordItem } from "../types";

// Mock adapter cho giai đoạn thiết kế FE.
// Sau khi API Apps Script/Vercel sẵn sàng, thay implementation tại file này.
const seed: Record<ModuleKey, RecordItem[]> = {
  schedules: [
    { id: "sch-001", rowNumber: 2, version: "demo-1", values: { date: "07/11", startTime: "09:00", endTime: "11:00", platform: "Shopee", brand: "Brand A", host: "Nguyễn A", pic: "Trần B", room: "Phòng 01", status: "Đang live" } },
    { id: "sch-002", rowNumber: 3, version: "demo-2", values: { date: "07/11", startTime: "13:00", endTime: "15:00", platform: "TikTok", brand: "Brand B", host: "Nguyễn C", pic: "Trần D", room: "Phòng 02", status: "Sắp live" } },
    { id: "sch-003", rowNumber: 4, version: "demo-3", values: { date: "08/11", startTime: "15:00", endTime: "17:00", platform: "Shopee", brand: "Brand C", host: "Nguyễn E", pic: "Trần F", room: "Phòng 03", status: "Đang hoạt động" } }
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

let data = structuredClone(seed);

const wait = (ms = 180) => new Promise(resolve => setTimeout(resolve, ms));

export async function listRecords(module: ModuleKey): Promise<RecordItem[]> {
  await wait();
  return structuredClone(data[module]);
}

export async function saveRecord(module: ModuleKey, values: Record<string, string>, existing?: RecordItem): Promise<void> {
  await wait(260);
  if (module !== "hosts" && !existing) {
    throw new Error("Chỉ có thể tạo mới mã host.");
  }
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

export async function deleteRecord(module: ModuleKey, record: RecordItem): Promise<void> {
  await wait(220);
  if (module !== "hosts") {
    throw new Error("Chỉ có thể xóa mã host.");
  }
  data[module] = data[module].filter(item => item.id !== record.id);
}
