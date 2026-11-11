export type ModuleKey = "schedules" | "backgrounds" | "titles" | "hosts";
export type ThemeMode = "light" | "dark" | "system";
export type Accent = "mauve" | "purple" | "blue" | "green";

export type RecordItem = {
  id: string;
  rowNumber: number;
  version: string;
  values: Record<string, string>;
};

export type FieldConfig = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "time" | "select" | "url";
  required?: boolean;
  options?: string[];
  hint?: string;
  group?: string;
};

export type ModuleConfig = {
  title: string;
  description: string;
  singular: string;
  columns: { key: string; label: string }[];
  fields: FieldConfig[];
};

export const moduleConfig: Record<ModuleKey, ModuleConfig> = {
  schedules: {
    title: "Lịch phát sóng",
    description: "Quản lý lịch live, nhân sự và thông tin vận hành.",
    singular: "khung giờ",
    columns: [
      { key: "date", label: "Ngày" }, { key: "time", label: "Khung giờ" },
      { key: "platform", label: "Sàn" }, { key: "brand", label: "Thương hiệu" },
      { key: "host", label: "Host / PIC" }, { key: "room", label: "Phòng" },
      { key: "status", label: "Trạng thái" }
    ],
    fields: [
      { key: "host", label: "Host", group: "Nhân sự" },
      { key: "douHost", label: "Đa host", group: "Nhân sự" },
      { key: "hostEco", label: "Host ECO", group: "Nhân sự" },
      { key: "room", label: "Phòng / Room", group: "Vận hành" },
      { key: "status", label: "Trạng thái", type: "select", options: ["Đang hoạt động", "Sắp live", "Đang live", "Hoàn tất", "Hủy"], group: "Vận hành" },
      { key: "isKeep", label: "ISKEEP", group: "Vận hành" }
    ]
  },
  backgrounds: {
    title: "Background",
    description: "Cập nhật hình ảnh, ghi chú và loại background theo sàn và thương hiệu.",
    singular: "background",
    columns: [
      { key: "platform", label: "Sàn" }, { key: "brand", label: "Thương hiệu" },
      { key: "type", label: "Loại" }, { key: "link1", label: "Background 1" },
      { key: "link2", label: "Background 2" }, { key: "sharedNote", label: "Ghi chú" }
    ],
    fields: [
      { key: "type", label: "Loại background", group: "Thông tin chung" },
      { key: "link1", label: "Đường dẫn background 1", type: "url", hint: "URL hoặc ID Google Drive", group: "Tài nguyên" },
      { key: "note1", label: "Ghi chú background 1", type: "textarea", group: "Tài nguyên" },
      { key: "link2", label: "Đường dẫn background 2", type: "url", group: "Tài nguyên" },
      { key: "note2", label: "Ghi chú background 2", type: "textarea", group: "Tài nguyên" },
      { key: "sharedNote", label: "Ghi chú chung", type: "textarea", group: "Ghi chú" }
    ]
  },
  titles: {
    title: "Tiêu đề live",
    description: "Quản lý mẫu tiêu đề và các thành phần ghép tự động.",
    singular: "tiêu đề",
    columns: [
      { key: "platform", label: "Sàn" }, { key: "brand", label: "Thương hiệu" },
      { key: "title", label: "Mẫu tiêu đề" }, { key: "flags", label: "Thành phần ghép" }
    ],
    fields: [
      { key: "title", label: "Mẫu tiêu đề", type: "textarea", required: true, group: "Nội dung" },
      { key: "hostFlag", label: "Ghép mã host", type: "select", options: ["0", "1"], required: true, group: "Thành phần ghép" },
      { key: "timeFlag", label: "Ghép giờ", type: "select", options: ["0", "1"], required: true, group: "Thành phần ghép" },
      { key: "dateFlag", label: "Ghép ngày", type: "select", options: ["0", "1"], required: true, group: "Thành phần ghép" }
    ]
  },
  hosts: {
    title: "Mã host",
    description: "Quản lý tên host và mã tham chiếu dùng trong lịch phát sóng.",
    singular: "mã host",
    columns: [{ key: "name", label: "Tên host" }, { key: "hostCode", label: "Mã host" }],
    fields: [
      { key: "name", label: "Tên host", required: true, group: "Thông tin host" },
      { key: "hostCode", label: "Mã host", required: true, group: "Thông tin host" }
    ]
  }
};

export const moduleKeys: ModuleKey[] = ["schedules", "backgrounds", "titles", "hosts"];
