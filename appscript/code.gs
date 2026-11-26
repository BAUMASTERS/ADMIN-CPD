const ADMIN_SPREADSHEET_ID = '1Wqkll2nltkSJ593bgmDKbWgwXcS59nzzsdR7cqY3h8E';
const ADMIN_SESSION_SECONDS = 21600;
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOGIN_WINDOW_SECONDS = 900;
const ADMIN_ACCOUNT_DIRECTORY_SPREADSHEET_ID = '1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U';
const ADMIN_ACCOUNT_DIRECTORY_SHEET_NAME = 'LIST';
const ADMIN_WEB_DATA_SHEET_NAME = 'WEB_DATA';
const ADMIN_MEGA_SCHEDULE_SPREADSHEET_ID = '1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U';
const ADMIN_MEGA_SCHEDULE_SHEET_NAME = 'LỊCH SẮP TỚI';
const ADMIN_TRACKING_SPREADSHEET_ID = '1bNco8_NAVBWDxeotX9AZrIrougKND7xhRLZhO9NFid8';
const ADMIN_TRACKING_SHEET_NAME = 'TRACKING (CPD)';
const ADMIN_TRACKING_PG_SPREADSHEET_ID = '1-c5kYP09R_uuxM_161N3P_oC2L0gOjyE8fOdL7uSf3w';
const ADMIN_TRACKING_PG_SHEET_NAME = "26'TRACKING";
const ADMIN_TRACKING_MAX_ROWS = 500;
const ADMIN_TRACKING_MAX_COLUMNS = 400;
const SHOPEE_TITLE_BLOCKED_TERMS = [
  'số 1', 'duy nhất', 'tốt nhất', 'hoàn tiền 100%', 'chắc chắn hết',
  'cam kết chữa khỏi', 'trị dứt điểm', 'chuyển khoản', 'ck', 'ngân hàng',
  'số tài khoản', 'số điện thoại', 'zalo', 'facebook', 'địa chỉ', 'link ngoài',
  'tiktok', 'lazada', 'tiki'
];
const ADMIN_SCHEDULE_COLUMNS = {
  platform: 0,
  brand: 1,
  date: 2,
  type: 3,
  startTime: 6,
  endTime: 7,
  pic: 8,
  host: 9,
  douHost: 15,
  hostEco: 16,
  room: 17,
  status: 18,
  isKeep: 19
};

function doGet() {
  return jsonOutput_({
    success: true,
    data: { service: 'Force Shadow Apps Script API', status: 'ready' }
  });
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents);
    if (!request || typeof request.action !== 'string') {
      throw new Error('Request cần action hợp lệ.');
    }
    return jsonOutput_({
      success: true,
      data: dispatchApiAction_(request.action, request.payload || {})
    });
  } catch (error) {
    return jsonOutput_({
      success: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function dispatchApiAction_(action, payload) {
  switch (action) {
    case 'adminLogin':
      return adminLogin(payload.username, payload.password);
    case 'adminLogout':
      return adminLogout(payload.token);
    case 'adminListRecords':
      return adminListRecords(payload.token, payload.section, payload.hostGroup, payload.division);
    case 'adminSaveRecord':
      return adminSaveRecord(payload.token, payload.section, payload.hostGroup, payload.record, payload.division);
    case 'adminDeleteRecord':
      return adminDeleteRecord(
        payload.token,
        payload.section,
        payload.hostGroup,
        payload.rowNumber,
        payload.version,
        payload.division
      );
    case 'adminListUsers':
      return adminListUsers(payload.token);
    case 'adminCreateUser':
      return adminCreateUser(payload.token, payload.username, payload.password);
    case 'adminSaveUser':
      return adminSaveUser(payload.token, payload.account);
    case 'adminDeleteUser':
      return adminDeleteUser(payload.token, payload.username);
    case 'adminSetUserActive':
      return adminSetUserActive(payload.token, payload.username, payload.active);
    case 'adminUpdateOwnProfile':
      return adminUpdateOwnProfile(payload.token, payload.profile);
    case 'adminListDashboardTracking':
      return adminListDashboardTracking(payload.token, payload.division);
    case 'adminSaveDashboardTracking':
      return adminSaveDashboardTracking(payload.token, payload.division, payload.record);
    default:
      throw new Error('API action không được hỗ trợ.');
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
