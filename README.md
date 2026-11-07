# CPD MASTER – Frontend foundation

Frontend React + Vite + TypeScript, thiết kế theo desktop reference (dark charcoal + mauve) và mobile-first CRUD.

## Chạy local

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Phạm vi bản này

- 4 module: Lịch phát sóng, Background, Tiêu đề live, Mã host.
- Desktop: sidebar + toolbar + data table.
- Mobile: card list + bottom navigation + form toàn màn hình.
- Light / Dark / System mode.
- Accent color: Mauve / Purple / Blue / Green.
- CRUD đang chạy trên mock data trong trình duyệt để hoàn thiện FE.

## Chưa kết nối

Bản này chưa gọi Google Sheets, Apps Script, Supabase hoặc Vercel API. Không đưa dữ liệu demo vào Google Sheets. Bước tiếp theo là thay `src/services/records.ts` bằng API client sau khi thống nhất hợp đồng API.
