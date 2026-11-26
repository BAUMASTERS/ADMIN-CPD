const ADMIN_SPREADSHEET_ID = '1Wqkll2nltkSJ593bgmDKbWgwXcS59nzzsdR7cqY3h8E';
const ADMIN_SESSION_SECONDS = 21600;
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOGIN_WINDOW_SECONDS = 900;
const ADMIN_ACCOUNT_DIRECTORY_SPREADSHEET_ID = '1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U';
const ADMIN_ACCOUNT_DIRECTORY_SHEET_NAME = 'LIST';
const ADMIN_MEGA_SCHEDULE_SPREADSHEET_ID = '1h2Np6UVDI6RmjBtJyZByi8gaDapV9g-RtNvElzpDc4U';
const ADMIN_MEGA_SCHEDULE_SHEET_NAME = 'LỊCH SẮP TỚI';
const ADMIN_TRACKING_SPREADSHEET_ID = '1bNco8_NAVBWDxeotX9AZrIrougKND7xhRLZhO9NFid8';
const ADMIN_TRACKING_SHEET_NAME = 'TRACKING (UNRELEASE)';
const ADMIN_TRACKING_LEGACY_SHEET_NAME = 'TRACKING (CPD)';
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

function adminLogin(username, password) {
  const normalizedUsername = normalizeUsername_(username);
  if (!normalizedUsername || !password) {
    return { success: false, message: 'Tên tài khoản hoặc mật khẩu không đúng.' };
  }

  const cache = CacheService.getScriptCache();
  const failureKey = 'login-fail:' + normalizedUsername;
  const loginLock = LockService.getScriptLock();
  loginLock.waitLock(5000);
  try {
    const failures = Number(cache.get(failureKey) || 0);
    if (failures >= ADMIN_LOGIN_LIMIT) {
      return { success: false, message: 'Đã thử đăng nhập quá nhiều lần. Hãy thử lại sau 15 phút.' };
    }
    cache.put(failureKey, String(failures + 1), ADMIN_LOGIN_WINDOW_SECONDS);
  } finally {
    loginLock.releaseLock();
  }

  const directoryUser = findAccountDirectoryUser_(normalizedUsername, true);
  if (!directoryUser || !directoryUser.active ||
    !constantTimeEquals_(password, directoryUser.password)) {
    return { success: false, message: 'Tên tài khoản hoặc mật khẩu không đúng.' };
  }

  cache.remove(failureKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(token, JSON.stringify({
    username: directoryUser.username,
    role: directoryUser.role,
    passwordVersion: directoryUser.passwordVersion
  }), ADMIN_SESSION_SECONDS);
  return {
    success: true,
    token: token,
    username: directoryUser.username,
    role: directoryUser.role
  };
}

function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove(String(token));
  return { success: true };
}

function adminListUsers(token) {
  const requester = requireAdminAccess_(token);
  if (requester.role !== 'superadmin') {
    return [{
      username: requester.username,
      name: requester.name || requester.username,
      role: requester.role,
      avatar: requester.avatar,
      active: true,
      provisioned: true
    }];
  }
  const sheet = getAccountDirectorySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const rows = sheet.getRange(2, 2, lastRow - 1, 6).getDisplayValues();
  return rows.map(row => {
    const username = normalizeUsername_(row[0]);
    if (!username) return null;
    return {
      username: username,
      name: row[2] || username,
      role: normalizeDirectoryRole_(row[3]),
      avatar: row[4] || '',
      active: isDirectoryUserActive_(row[5]),
      provisioned: Boolean(row[1])
    };
  }).filter(Boolean);
}

function adminCreateUser(token, username, password) {
  requireAdminAccess_(token, 'superadmin');
  const account = findAccountDirectoryUser_(username);
  if (!account) throw new Error('Không tìm thấy user trong sheet LIST.');
  account.originalUsername = account.username;
  account.password = password;
  return adminSaveUser(token, account);
}

function adminSaveUser(token, account) {
  const requester = requireAdminAccess_(token, 'superadmin');
  if (!account || typeof account !== 'object') throw new Error('Thông tin tài khoản không hợp lệ.');
  const username = normalizeUsername_(account.username);
  validateUsername_(username);
  const password = account.password === undefined || account.password === null
    ? ''
    : String(account.password);
  if (password) validateNewUser_(username, password);
  const name = cleanAccountField_(account.name, 'Tên', 100, true);
  const avatar = cleanAccountField_(account.avatar, 'Avatar', 1000, false);
  const role = normalizeDirectoryRole_(account.role);
  const active = account.active !== false;
  const originalUsername = normalizeUsername_(account.originalUsername);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getAccountDirectorySheet_();
    ensureAccountActiveColumn_(sheet);
    const existing = originalUsername ? findAccountDirectoryUser_(originalUsername, true) : null;
    const collision = findAccountDirectoryUser_(username);
    if (originalUsername && !existing) {
      throw new Error('Không tìm thấy tài khoản cần chỉnh sửa trong sheet LIST.');
    }
    if (collision && (!existing || collision.rowNumber !== existing.rowNumber)) {
      throw new Error('Tên tài khoản đã tồn tại.');
    }
    if (existing) {
      const currentPassword = existing.password;
      const nextPassword = password || currentPassword;
      if (existing.role === 'superadmin' && (!active || role !== 'superadmin')) {
        ensureAnotherActiveSuperadmin_(sheet, existing.rowNumber);
      }
      sheet.getRange(existing.rowNumber, 3).setNumberFormat('@');
      sheet.getRange(existing.rowNumber, 2, 1, 5).setValues([[
        username,
        nextPassword,
        name,
        role,
        avatar
      ]]);
      sheet.getRange(existing.rowNumber, 7).setValue(Boolean(active));
    } else {
      if (collision) throw new Error('Tên tài khoản đã tồn tại.');
      if (!password) throw new Error('Cần nhập mật khẩu cho tài khoản mới.');
      const rowNumber = Math.max(2, sheet.getLastRow() + 1);
      sheet.getRange(rowNumber, 3).setNumberFormat('@');
      sheet.getRange(rowNumber, 2, 1, 6).setValues([[
        username,
        password,
        name,
        role,
        avatar,
        Boolean(active)
      ]]);
    }
    const sessionInvalidated = Boolean(existing &&
      existing.username === requester.username &&
      (existing.username !== username || Boolean(password) || existing.role !== role || !active));
    if (sessionInvalidated) CacheService.getScriptCache().remove(String(token));
    return { success: true, sessionInvalidated: sessionInvalidated };
  } finally {
    lock.releaseLock();
  }
}

function adminDeleteUser(token, username) {
  const requester = requireAdminAccess_(token, 'superadmin');
  const normalizedUsername = normalizeUsername_(username);
  if (!normalizedUsername) throw new Error('Tên tài khoản không hợp lệ.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getAccountDirectorySheet_();
    const user = findAccountDirectoryUser_(normalizedUsername);
    if (!user) throw new Error('Không tìm thấy tài khoản trong sheet LIST.');
    if (user.role === 'superadmin' && user.active) {
      ensureAnotherActiveSuperadmin_(sheet, user.rowNumber);
    }
    sheet.deleteRow(user.rowNumber);
    const sessionInvalidated = user.username === requester.username;
    if (sessionInvalidated) CacheService.getScriptCache().remove(String(token));
    return { success: true, sessionInvalidated: sessionInvalidated };
  } finally {
    lock.releaseLock();
  }
}

function adminUpdateOwnProfile(token, profile) {
  const user = requireAdminAccess_(token);
  if (!profile || typeof profile !== 'object') throw new Error('Thông tin hồ sơ không hợp lệ.');
  if (Object.keys(profile).some(key => key !== 'password' && key !== 'avatar')) {
    throw new Error('Chỉ được thay đổi avatar và mật khẩu của chính mình.');
  }
  const avatar = cleanAccountField_(profile.avatar, 'Avatar', 1000, false);
  const password = profile.password === undefined || profile.password === null
    ? ''
    : String(profile.password);
  if (password) validateNewUser_(user.username, password);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const current = findAccountDirectoryUser_(user.username);
    if (!current) throw new Error('Không tìm thấy tài khoản trong sheet LIST.');
    const sheet = getAccountDirectorySheet_();
    sheet.getRange(current.rowNumber, 6).setValue(avatar);
    if (password) {
      sheet.getRange(current.rowNumber, 3).setNumberFormat('@');
      sheet.getRange(current.rowNumber, 3).setValue(password);
      CacheService.getScriptCache().remove(String(token));
    }
    return { success: true, passwordChanged: Boolean(password) };
  } finally {
    lock.releaseLock();
  }
}

function adminSetUserActive(token, username, active) {
  requireAdminAccess_(token, 'superadmin');
  const normalizedUsername = normalizeUsername_(username);
  if (!normalizedUsername) throw new Error('Tên tài khoản không hợp lệ.');
  if (typeof active !== 'boolean') throw new Error('Trạng thái tài khoản không hợp lệ.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const directoryUser = findAccountDirectoryUser_(normalizedUsername);
    if (!directoryUser) throw new Error('Không tìm thấy tài khoản trong sheet LIST.');
    if (directoryUser.role === 'superadmin' && !active) {
      throw new Error('Không thể khóa tài khoản superadmin.');
    }
    const sheet = getAccountDirectorySheet_();
    ensureAccountActiveColumn_(sheet);
    sheet.getRange(directoryUser.rowNumber, 7).setValue(Boolean(active));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function adminListRecords(token, section, hostGroup, division) {
  requireAdminDivisionAccess_(token, division);
  if (section === 'schedules') {
    const sheet = getScheduleSheetForDivision_(division);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const columnIndexes = getScheduleColumnIndexes_(sheet);
    const width = Math.max(sheet.getLastColumn(), 20);
    return sheet.getRange(2, 1, lastRow - 1, width).getDisplayValues()
      .map((row, index) => {
        const values = {};
        Object.keys(columnIndexes).forEach(key => {
          values[key] = row[columnIndexes[key]] || '';
        });
        return {
          rowNumber: index + 2,
          version: makeRowVersion_(row),
          values: values
        };
      })
      .filter(record => Object.keys(record.values).some(key => record.values[key] !== ''));
  }

  const spreadsheet = getAdminSpreadsheet_(division);
  if (section === 'backgrounds' || section === 'titles') {
    const sheetName = section === 'backgrounds' ? 'BG' : 'TITLE';
    const sheet = requireSheet_(spreadsheet, sheetName);
    const lastRow = sheet.getLastRow();
    const firstDataRow = section === 'backgrounds' ? 2 : 1;
    if (lastRow < firstDataRow) return [];
    const rows = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, 8).getDisplayValues();
    return rows.map((row, index) => ({
      rowNumber: index + firstDataRow,
      version: makeRowVersion_(row),
      values: section === 'backgrounds' ? {
        platform: row[0] || '',
        brand: row[1] || '',
        type: row[2] || '',
        link1: row[3] || '',
        note1: row[4] || '',
        link2: row[5] || '',
        note2: row[6] || '',
        sharedNote: row[7] || ''
      } : {
        platform: row[0] || '',
        brand: row[1] || '',
        hostFlag: row[3] || '0',
        timeFlag: row[4] || '0',
        dateFlag: row[5] || '0',
        title: row[6] || ''
      }
    })).filter(record => Object.values(record.values).some(value => value !== ''));
  }

  if (section === 'hosts') {
    const hostConfig = getHostConfig_(spreadsheet, hostGroup);
    const sheet = hostConfig.sheet;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, hostConfig.nameColumn, lastRow - 1, 2).getDisplayValues()
      .map((row, index) => ({
        rowNumber: index + 2,
        version: makeRowVersion_(row),
        values: { name: row[0] || '', hostCode: row[1] || '' }
      }))
      .filter(record => record.values.name || record.values.hostCode);
  }

  throw new Error('Loại dữ liệu không được hỗ trợ.');
}

function adminListDashboardTracking(token, division) {
  requireAdminDivisionAccess_(token, division);
  const context = getDashboardTrackingContext_(division);
  if (!context.rows.length) return [];
  const rows = context.rows;
  const headerRowIndex = context.headerRowIndex;
  const headerIndexes = context.headerIndexes;
  const records = [];
  let currentSection = '';
  let currentFilterKey = '';
  rows.slice(headerRowIndex + 1).forEach((row, index) => {
    const section = String(row[headerIndexes.section] || '').trim();
    const status = String(row[headerIndexes.status] || '').trim();
    const content = String(row[headerIndexes.content] || '').trim();
    const startDate = String(row[headerIndexes.start] || '').trim();
    const endDate = String(row[headerIndexes.end] || '').trim();
    if (!startDate && !endDate) {
      if (section) {
        currentSection = section;
        currentFilterKey = String(row[1] || section).trim();
      }
      return;
    }
    if ((!content && !section && !currentSection) || !startDate || !endDate) return;
    records.push({
      rowNumber: headerRowIndex + index + 2,
      version: makeRowVersion_(row),
      values: {
        section: currentSection,
        name: section,
        filterKey: String(row[1] || currentFilterKey || section || currentSection).trim(),
        status: status,
        content: content,
        startDate: startDate,
        endDate: endDate
      }
    });
  });
  return records;
}

function adminSaveDashboardTracking(token, division, record) {
  const user = requireAdminDivisionAccess_(token, division);
  const normalizedDivision = String(division || '').trim().toUpperCase();
  if (user.role !== 'superadmin' &&
    ((user.role === 'admincpd' && normalizedDivision !== 'CPD') ||
      (user.role === 'adminpng' && normalizedDivision !== 'P&G'))) {
    throw new Error('Bạn không có quyền chỉnh sửa tổng quan của division này.');
  }
  if (!record || typeof record !== 'object' || !record.values || typeof record.values !== 'object') {
    throw new Error('Dữ liệu tracking không hợp lệ.');
  }
  const rowNumber = Number(record.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2) throw new Error('Dòng tracking không hợp lệ.');
  const values = record.values;
  const editableFields = ['status', 'content', 'startDate', 'endDate'];
  validateRecordUpdate_(values, {}, editableFields, []);
  const context = getDashboardTrackingContext_(division);
  if (rowNumber <= context.headerRowIndex + 1 || rowNumber > context.rows.length) {
    throw new Error('Không tìm thấy dòng tracking.');
  }
  const currentRow = context.rows[rowNumber - 1];
  if (makeRowVersion_(currentRow) !== record.version) {
    throw new Error('Dữ liệu tracking đã thay đổi. Hãy tải lại rồi thử lại.');
  }
  const columns = {
    status: context.headerIndexes.status,
    content: context.headerIndexes.content,
    startDate: context.headerIndexes.start,
    endDate: context.headerIndexes.end
  };
  const cleanedValues = {};
  editableFields.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    const value = cleanText_(values[key], key);
    if ((key === 'startDate' || key === 'endDate') &&
      !/^(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)$/.test(value)) {
      throw new Error('Ngày bắt đầu và kết thúc cần có định dạng YYYY-MM-DD hoặc dd/MM/yyyy.');
    }
    cleanedValues[key] = value;
  });
  const updatedStart = Object.prototype.hasOwnProperty.call(values, 'startDate')
    ? cleanedValues.startDate
    : String(currentRow[columns.startDate] || '').trim();
  const updatedEnd = Object.prototype.hasOwnProperty.call(values, 'endDate')
    ? cleanedValues.endDate
    : String(currentRow[columns.endDate] || '').trim();
  const parsedStart = parseDashboardDate_(updatedStart);
  const parsedEnd = parseDashboardDate_(updatedEnd);
  if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd)) {
    throw new Error('Ngày bắt đầu và kết thúc không hợp lệ.');
  }
  if (parsedStart > parsedEnd) {
    throw new Error('Ngày bắt đầu không thể sau ngày kết thúc.');
  }
  Object.keys(cleanedValues).forEach(key => {
    context.sheet.getRange(rowNumber, columns[key] + 1).setValue(cleanedValues[key]);
  });
  return { success: true };
}

function parseDashboardDate_(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return validDashboardDate_(
    Number(match[1]), Number(match[2]), Number(match[3])
  );
  match = text.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/);
  if (!match) return NaN;
  const year = match[3] ? Number(match[3].length === 2 ? '20' + match[3] : match[3]) : new Date().getFullYear();
  return validDashboardDate_(year, Number(match[2]), Number(match[1]));
}

function validDashboardDate_(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return NaN;
  }
  return date.getTime();
}

function getDashboardTrackingContext_(division) {
  const normalizedDivision = String(division || '').trim().toUpperCase();
  let spreadsheetId = '';
  let sheetName = '';
  if (normalizedDivision === 'CPD') {
    spreadsheetId = ADMIN_TRACKING_SPREADSHEET_ID;
    sheetName = ADMIN_TRACKING_SHEET_NAME;
  } else if (normalizedDivision === 'P&G') {
    spreadsheetId = ADMIN_TRACKING_PG_SPREADSHEET_ID;
    sheetName = ADMIN_TRACKING_PG_SHEET_NAME;
  } else {
    throw new Error('Division không hợp lệ.');
  }
  if (!spreadsheetId || !sheetName) {
    throw new Error('Sheet tracking của division ' + normalizedDivision + ' chưa được cấu hình.');
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet && normalizedDivision === 'CPD') {
    sheet = spreadsheet.getSheetByName(ADMIN_TRACKING_LEGACY_SHEET_NAME);
  }
  if (!sheet) throw new Error('Không tìm thấy sheet "' + sheetName + '".');
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) return { sheet: sheet, rows: [], headerRowIndex: -1, headerIndexes: {} };
  if (lastRow > ADMIN_TRACKING_MAX_ROWS || lastColumn > ADMIN_TRACKING_MAX_COLUMNS) {
    throw new Error(
      'Sheet "' + sheetName + '" vượt giới hạn đọc an toàn (' +
      ADMIN_TRACKING_MAX_ROWS + ' hàng × ' + ADMIN_TRACKING_MAX_COLUMNS + ' cột).'
    );
  }
  const rows = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headerRowIndex = rows.findIndex(row => {
    const headers = row.map(value => String(value).trim().toLowerCase());
    return ['section', 'status', 'content', 'start', 'end'].every(header => headers.includes(header));
  });
  if (headerRowIndex < 0) {
    throw new Error('Không tìm thấy hàng tiêu đề Section, Status, Content, Start, End trong tracking sheet.');
  }
  const headerIndexes = {};
  rows[headerRowIndex].forEach((value, index) => {
    headerIndexes[String(value).trim().toLowerCase()] = index;
  });
  return {
    sheet: sheet,
    rows: rows,
    headerRowIndex: headerRowIndex,
    headerIndexes: headerIndexes
  };
}

function adminSaveRecord(token, section, hostGroup, record, division) {
  requireAdminDivisionAccess_(token, division);
  if (!record || typeof record !== 'object' || !record.values || typeof record.values !== 'object') {
    throw new Error('Dữ liệu gửi lên không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (section === 'schedules') {
      saveScheduleRecord_(record, division);
    } else if (section === 'backgrounds') {
      const spreadsheet = getAdminSpreadsheet_(division);
      saveBackgroundRecord_(spreadsheet, record);
    } else if (section === 'titles') {
      const spreadsheet = getAdminSpreadsheet_(division);
      saveTitleRecord_(spreadsheet, record);
    } else if (section === 'hosts') {
      const spreadsheet = getAdminSpreadsheet_(division);
      saveHostRecord_(spreadsheet, hostGroup, record);
    } else {
      throw new Error('Loại dữ liệu không được hỗ trợ.');
    }
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function adminDeleteRecord(token, section, hostGroup, rowNumber, version, division) {
  requireAdminDivisionAccess_(token, division);
  if (section === 'schedules') {
    throw new Error('Không được xóa lịch đã import từ brand.');
  }
  if (section === 'backgrounds') {
    throw new Error('Background được tạo theo brand và không thể xóa riêng.');
  }
  if (section === 'titles') {
    throw new Error('Không được xóa title đã được cấu hình.');
  }
  const row = Number(rowNumber);
  const firstDataRow = 2;
  if (!Number.isInteger(row) || row < firstDataRow) {
    throw new Error('Dòng dữ liệu cần xóa không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getAdminSpreadsheet_(division);
    const sheet = getSectionSheet_(spreadsheet, section, hostGroup, division);
    const hostConfig = section === 'hosts' ? getHostConfig_(spreadsheet, hostGroup) : null;
    const width = section === 'hosts' ? 2 : 20;
    const startColumn = hostConfig ? hostConfig.nameColumn : 1;
    verifyCurrentRow_(sheet, row, startColumn, width, version);
    sheet.getRange(row, startColumn, 1, width).clearContent();
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function saveScheduleRecord_(record, division) {
  const sheet = getScheduleSheetForDivision_(division);
  const columnIndexes = getScheduleColumnIndexes_(sheet);
  const width = Math.max(sheet.getLastColumn(), 20);
  const values = record.values;
  const editableFields = ['host', 'douHost', 'hostEco', 'room', 'status', 'isKeep'];
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    throw new Error('Không được tạo lịch thủ công; lịch được import từ brand.');
  }
  const rowNumber = getTargetRow_(sheet, record, width);
  if (rowNumber < 2) throw new Error('Không được sửa dòng tiêu đề của sheet lịch.');
  const currentRow = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  const currentValues = {};
  Object.keys(columnIndexes).forEach(key => {
    currentValues[key] = currentRow[columnIndexes[key]] || '';
  });
  validateRecordUpdate_(
    values,
    currentValues,
    editableFields,
    ['platform', 'brand', 'date', 'type', 'startTime', 'endTime', 'pic']
  );

  const fieldsToWrite = editableFields.filter(key => Object.prototype.hasOwnProperty.call(values, key));
  const columns = fieldsToWrite.map(key => columnIndexes[key] + 1);
  const updatedValues = fieldsToWrite.map(key => cleanText_(values[key], key));
  writeRowCells_(sheet, rowNumber, columns, updatedValues);
}

function getScheduleColumnIndexes_(sheet) {
  const aliases = {
    platform: ['platform', 'sàn', 'sàn live', 'nền tảng'],
    brand: ['brand', 'tên brand', 'thương hiệu'],
    date: ['date', 'ngày', 'ngày live', 'ngày phát sóng', 'ngày chạy live'],
    type: ['type', 'loại lịch', 'loại', 'nguồn', 'source'],
    startTime: ['start time', 'starttime', 'time start', 'start', 'from', 'giờ bắt đầu', 'bắt đầu', 'giờ live'],
    endTime: ['end time', 'endtime', 'time end', 'end', 'to', 'giờ kết thúc', 'kết thúc'],
    pic: ['pic', 'người phụ trách', 'người quản lý', 'phụ trách'],
    host: ['host', 'mã host'],
    douHost: ['douhost', 'đa host', 'host phụ'],
    hostEco: ['host eco', 'hosteco', 'eco host'],
    room: ['room', 'phòng', 'phòng live'],
    status: ['status', 'trạng thái'],
    isKeep: ['iskeep', 'is keep', 'keep']
  };
  const indexes = Object.assign({}, ADMIN_SCHEDULE_COLUMNS);
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) return indexes;
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function(value) {
      return String(value || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    });
  Object.keys(aliases).forEach(function(key) {
    const matches = aliases[key].map(function(alias) {
      return alias.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    });
    const headerIndex = headers.findIndex(function(header) {
      return matches.indexOf(header) >= 0;
    });
    if (headerIndex >= 0) indexes[key] = headerIndex;
  });
  return indexes;
}

function saveBackgroundRecord_(spreadsheet, record) {
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    throw new Error('Background phải được tạo trong luồng khởi tạo brand, không thể thêm riêng.');
  }
  const sheet = requireSheet_(spreadsheet, 'BG');
  const values = record.values;
  const editableFields = ['type', 'link1', 'note1', 'link2', 'note2', 'sharedNote'];
  const rowNumber = getTargetRow_(sheet, record, 8);
  const row = sheet.getRange(rowNumber, 1, 1, 8).getDisplayValues()[0];
  const currentValues = {
    platform: row[0] || '',
    brand: row[1] || '',
    type: row[2] || '',
    link1: row[3] || '',
    note1: row[4] || '',
    link2: row[5] || '',
    note2: row[6] || '',
    sharedNote: row[7] || ''
  };
  validateRecordUpdate_(values, currentValues, editableFields, ['platform', 'brand']);
  const columns = {
    type: 3,
    link1: 4,
    note1: 5,
    link2: 6,
    note2: 7,
    sharedNote: 8
  };
  const fieldsToWrite = editableFields.filter(key => Object.prototype.hasOwnProperty.call(values, key));
  writeRowCells_(sheet, rowNumber, fieldsToWrite.map(key => columns[key]),
    fieldsToWrite.map(key => cleanText_(values[key], key)));
}

function saveTitleRecord_(spreadsheet, record) {
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    throw new Error('Không được tạo title mới; chỉ có thể chỉnh sửa title đã có.');
  }
  const sheet = requireSheet_(spreadsheet, 'TITLE');
  const values = record.values;
  validateRequired_(values, ['platform', 'brand', 'title', 'hostFlag', 'timeFlag', 'dateFlag']);
  ['hostFlag', 'timeFlag', 'dateFlag'].forEach(key => {
    if (!['0', '1'].includes(String(values[key]))) {
      throw new Error('Các tùy chọn tiền tố chỉ nhận giá trị 0 hoặc 1.');
    }
  });
  const rowNumber = getTargetRow_(sheet, record, 8, 1, 1);
  const row = sheet.getRange(rowNumber, 1, 1, 8).getDisplayValues()[0];
  const currentValues = {
    platform: row[0] || '',
    brand: row[1] || '',
    hostFlag: row[3] || '0',
    timeFlag: row[4] || '0',
    dateFlag: row[5] || '0',
    title: row[6] || ''
  };
  const updatedValues = {
    hostFlag: Object.prototype.hasOwnProperty.call(values, 'hostFlag') ? String(values.hostFlag) : currentValues.hostFlag,
    timeFlag: Object.prototype.hasOwnProperty.call(values, 'timeFlag') ? String(values.timeFlag) : currentValues.timeFlag,
    dateFlag: Object.prototype.hasOwnProperty.call(values, 'dateFlag') ? String(values.dateFlag) : currentValues.dateFlag,
    title: Object.prototype.hasOwnProperty.call(values, 'title') ? cleanText_(values.title, 'title') : currentValues.title
  };
  validateTitleRules_(spreadsheet, currentValues.platform, updatedValues);
  const editableFields = ['hostFlag', 'timeFlag', 'dateFlag', 'title'];
  validateRecordUpdate_(values, currentValues, editableFields, ['platform', 'brand']);
  const columns = { hostFlag: 4, timeFlag: 5, dateFlag: 6, title: 7 };
  const fieldsToWrite = editableFields.filter(key => Object.prototype.hasOwnProperty.call(values, key));
  writeRowCells_(sheet, rowNumber, fieldsToWrite.map(key => columns[key]),
    fieldsToWrite.map(key => key.endsWith('Flag') ? String(values[key]) : cleanText_(values[key], key)));
}

function validateTitleRules_(spreadsheet, platform, values) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  if (normalizedPlatform.indexOf('tiktok') >= 0 || normalizedPlatform === 'tts') {
    const lengths = [];
    if (values.hostFlag === '1') lengths.push(getMaxHostCodeLength_(spreadsheet));
    if (values.timeFlag === '1') lengths.push(2);
    if (values.dateFlag === '1') lengths.push(5);
    lengths.push(Array.from(String(values.title || '')).length);
    const composedLength = lengths.reduce(function(total, length) { return total + length; }, Math.max(0, lengths.length - 1));
    if (composedLength > 32) {
      throw new Error('Title TTS sau khi ghép vượt giới hạn 32 ký tự (đã tính mã host dài nhất).');
    }
  }
  if (normalizedPlatform.indexOf('shopee') >= 0 || normalizedPlatform === 'shp') {
    const normalizedTitle = ' ' + normalizeTitleForPolicy_(values.title) + ' ';
    const blockedTerm = SHOPEE_TITLE_BLOCKED_TERMS.find(function(term) {
      const normalizedTerm = normalizeTitleForPolicy_(term);
      return normalizedTerm === 'ck'
        ? /(^|\s)ck(\s|$)/.test(normalizedTitle)
        : normalizedTitle.indexOf(' ' + normalizedTerm + ' ') >= 0;
    });
    if (blockedTerm) {
      throw new Error('Title Shopee có cụm từ cần tránh: "' + blockedTerm + '".');
    }
  }
}

function getMaxHostCodeLength_(spreadsheet) {
  const sheetColumns = [
    { name: 'ECO ID', column: 4 },
    { name: 'CPD ID', column: 3 }
  ];
  let maxLength = 0;
  sheetColumns.forEach(function(config) {
    const sheet = spreadsheet.getSheetByName(config.name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const codes = sheet.getRange(2, config.column, sheet.getLastRow() - 1, 1).getDisplayValues();
    codes.forEach(function(row) {
      maxLength = Math.max(maxLength, Array.from(String(row[0] || '')).length);
    });
  });
  if (!maxLength) {
    throw new Error('Không thể kiểm tra ghép mã host: chưa có mã host trong ECO ID hoặc CPD ID.');
  }
  return maxLength;
}

function normalizeTitleForPolicy_(value) {
  return String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim();
}

function saveHostRecord_(spreadsheet, hostGroup, record) {
  const hostConfig = getHostConfig_(spreadsheet, hostGroup);
  const values = record.values;
  validateRequired_(values, ['name', 'hostCode']);
  const rowNumber = getTargetRow_(hostConfig.sheet, record, 2, hostConfig.nameColumn);
  const row = [
    cleanText_(values.name, 'name'),
    cleanText_(values.hostCode, 'hostCode')
  ];
  writeRowCells_(hostConfig.sheet, rowNumber, [hostConfig.nameColumn, hostConfig.hostCodeColumn], row);
}

function getTargetRow_(sheet, record, width, startColumn, firstDataRow) {
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    return appendRowNumber_(sheet, firstDataRow || 2);
  }
  const rowNumber = Number(record.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < (firstDataRow || 2) || rowNumber > sheet.getLastRow()) {
    throw new Error('Bản ghi không còn tồn tại. Hãy tải lại danh sách.');
  }
  verifyCurrentRow_(sheet, rowNumber, startColumn || 1, width, record.version);
  return rowNumber;
}

function verifyCurrentRow_(sheet, rowNumber, startColumn, width, expectedVersion) {
  if (!expectedVersion) {
    throw new Error('Thiếu phiên bản dữ liệu. Hãy tải lại danh sách trước khi lưu.');
  }
  const currentRow = sheet.getRange(rowNumber, startColumn, 1, width).getDisplayValues()[0];
  if (makeRowVersion_(currentRow) !== expectedVersion) {
    throw new Error('Bản ghi đã được thay đổi ở nơi khác. Hãy tải lại rồi thử lại.');
  }
}

function writeEntireRow_(sheet, rowNumber, values) {
  const targetRow = rowNumber || appendRowNumber_(sheet);
  writeRowCells_(sheet, targetRow, values.map((value, index) => index + 1), values);
}

function writeRowCells_(sheet, rowNumber, columns, values) {
  const targetRow = rowNumber || appendRowNumber_(sheet);
  columns.forEach((column, index) => {
    const value = cleanText_(values[index] || '', 'dữ liệu');
    sheet.getRange(targetRow, column).setNumberFormat('@');
    sheet.getRange(targetRow, column).setValue(value);
  });
}

function appendRowNumber_(sheet, firstDataRow) {
  const rowNumber = Math.max(firstDataRow || 2, sheet.getLastRow() + 1);
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowAfter(sheet.getMaxRows());
  return rowNumber;
}

function getSectionSheet_(spreadsheet, section, hostGroup, division) {
  if (section === 'schedules') return getScheduleSheetForDivision_(division);
  if (section === 'backgrounds') return requireSheet_(spreadsheet, 'BG');
  if (section === 'titles') return requireSheet_(spreadsheet, 'TITLE');
  if (section === 'hosts') return getHostConfig_(spreadsheet, hostGroup).sheet;
  throw new Error('Loại dữ liệu không được hỗ trợ.');
}

function getScheduleSheetForDivision_(division) {
  const normalizedDivision = String(division || '').trim().toUpperCase();
  if (normalizedDivision !== 'CPD' && normalizedDivision !== 'P&G') {
    throw new Error('Phải chọn division CPD hoặc P&G trước khi truy cập dữ liệu.');
  }
  const spreadsheet = SpreadsheetApp.openById(ADMIN_MEGA_SCHEDULE_SPREADSHEET_ID);
  const sheet = spreadsheet.getSheetByName(ADMIN_MEGA_SCHEDULE_SHEET_NAME);
  if (!sheet) {
    throw new Error('Không tìm thấy sheet "' + ADMIN_MEGA_SCHEDULE_SHEET_NAME +
      '" trong workbook lịch/account đã kết hợp.');
  }
  return sheet;
}

function getHostConfig_(spreadsheet, hostGroup) {
  if (hostGroup === 'ECO ID') {
    return {
      sheet: requireSheet_(spreadsheet, 'ECO ID'),
      nameColumn: 3,
      hostCodeColumn: 4
    };
  }
  if (hostGroup === 'BAS' || hostGroup === 'CPD ID') {
    return {
      sheet: requireSheet_(spreadsheet, 'CPD ID'),
      nameColumn: 2,
      hostCodeColumn: 3
    };
  }
  throw new Error('Danh sách mã host không hợp lệ.');
}

function getAdminSpreadsheet_(division) {
  const normalizedDivision = String(division || '').trim().toUpperCase();
  if (!normalizedDivision) throw new Error('Phải chọn division CPD hoặc P&G trước khi truy cập dữ liệu.');
  if (normalizedDivision === 'P&G') {
    throw new Error('Title, Background và mã host hiện chỉ được cấu hình cho CPD.');
  }
  if (normalizedDivision !== 'CPD') throw new Error('Division không hợp lệ. Chọn CPD hoặc P&G.');
  return SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
}

function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error('Không tìm thấy sheet "' + name + '".');
  return sheet;
}

function validateRequired_(values, keys) {
  keys.forEach(key => {
    if (!String(values[key] === undefined || values[key] === null ? '' : values[key]).trim()) {
      throw new Error('Vui lòng nhập đầy đủ thông tin bắt buộc.');
    }
  });
}

function validateScheduleDate_(value) {
  if (!/^\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?$/.test(String(value || '').trim())) {
    throw new Error('Ngày cần có định dạng dd/MM, ví dụ 06/11.');
  }
}

function validateTime_(value, label) {
  const match = String(value || '').match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new Error(label + ' cần có định dạng HH:mm.');
}

function cleanText_(value, fieldName) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (text.charAt(0) === '=') {
    throw new Error('Trường "' + fieldName + '" không được bắt đầu bằng dấu =.');
  }
  return text;
}

function makeRowVersion_(row) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(row),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function getAccountDirectorySheet_() {
  const spreadsheet = SpreadsheetApp.openById(ADMIN_ACCOUNT_DIRECTORY_SPREADSHEET_ID);
  return requireSheet_(spreadsheet, ADMIN_ACCOUNT_DIRECTORY_SHEET_NAME);
}

function findAccountDirectoryUser_(username, includePassword) {
  const sheet = getAccountDirectorySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const usernames = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const profiles = sheet.getRange(2, 4, lastRow - 1, 3).getDisplayValues();
  const activeValues = sheet.getRange(2, 7, lastRow - 1, 1).getDisplayValues();
  const normalizedUsername = normalizeUsername_(username);
  let matchedUser = null;
  for (let index = 0; index < usernames.length; index++) {
    if (normalizeUsername_(usernames[index][0]) !== normalizedUsername) continue;
    if (matchedUser) throw new Error('userid bị trùng trong sheet LIST.');
    const rowNumber = index + 2;
    const password = includePassword
      ? String(sheet.getRange(rowNumber, 3).getDisplayValue() || '')
      : '';
    matchedUser = {
      rowNumber: rowNumber,
      username: normalizedUsername,
      name: String(profiles[index][0] || '').trim(),
      role: normalizeDirectoryRole_(profiles[index][1]),
      avatar: String(profiles[index][2] || '').trim(),
      active: isDirectoryUserActive_(activeValues[index][0]),
      password: password,
      passwordVersion: password ? makeRowVersion_([normalizedUsername, password]) : ''
    };
  }
  return matchedUser;
}

function isDirectoryUserActive_(value) {
  if (value === false) return false;
  const normalized = String(value === undefined || value === null ? '' : value)
    .trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' &&
    normalized !== 'inactive' && normalized !== 'no';
}

function ensureAccountActiveColumn_(sheet) {
  const header = String(sheet.getRange(1, 7).getDisplayValue() || '').trim().toLowerCase();
  if (!header) {
    sheet.getRange(1, 7).setValue('active');
  } else if (header !== 'active') {
    throw new Error('Cột G của LIST phải để trống hoặc có tiêu đề active.');
  }
}

function ensureAnotherActiveSuperadmin_(sheet, excludedRowNumber) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('Phải giữ lại ít nhất một superadmin đang hoạt động.');
  const rows = sheet.getRange(2, 2, lastRow - 1, 6).getDisplayValues();
  const anotherActiveSuperadmin = rows.some((row, index) =>
    index + 2 !== excludedRowNumber &&
    String(row[3] || '').trim().toLowerCase() === 'superadmin' &&
    isDirectoryUserActive_(row[5])
  );
  if (!anotherActiveSuperadmin) {
    throw new Error('Không thể xóa hoặc vô hiệu hóa superadmin cuối cùng đang hoạt động.');
  }
}

function normalizeDirectoryRole_(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'superadmin' || role === 'admincpd' || role === 'adminpng') return role;
  throw new Error('Role trong sheet LIST không hợp lệ.');
}

function validateNewUser_(username, password) {
  validateUsername_(username);
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Mật khẩu cần dài từ 12 đến 128 ký tự.');
  }
}

function validateUsername_(username) {
  if (!/^[a-z0-9._-]{3,40}$/.test(normalizeUsername_(username))) {
    throw new Error('Tên tài khoản cần dài 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  }
}

function cleanAccountField_(value, fieldName, maxLength, required) {
  const text = cleanText_(value, fieldName);
  if (required && !text) throw new Error(fieldName + ' không được để trống.');
  if (text.length > maxLength) throw new Error(fieldName + ' không được vượt quá ' + maxLength + ' ký tự.');
  return text;
}

function normalizeUsername_(username) {
  return String(username || '').trim().toLowerCase();
}

function constantTimeEquals_(left, right) {
  const first = String(left || '');
  const second = String(right || '');
  let difference = first.length ^ second.length;
  const length = Math.max(first.length, second.length);
  for (let index = 0; index < length; index++) {
    difference |= (first.charCodeAt(index) || 0) ^ (second.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function requireAdminAccess_(token, requiredRole) {
  const sessionValue = token
    ? CacheService.getScriptCache().get(String(token))
    : null;
  if (!sessionValue) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');

  let session;
  try {
    session = JSON.parse(sessionValue);
  } catch (error) {
    CacheService.getScriptCache().remove(String(token));
    throw new Error('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  }
  const username = normalizeUsername_(session.username);
  let directoryUser = null;
  try {
    directoryUser = findAccountDirectoryUser_(username, true);
  } catch (error) {
    CacheService.getScriptCache().remove(String(token));
    throw error;
  }
  if (!directoryUser || !directoryUser.active || !directoryUser.password ||
    directoryUser.role !== session.role ||
    directoryUser.passwordVersion !== session.passwordVersion) {
    CacheService.getScriptCache().remove(String(token));
    throw new Error('Tài khoản đã bị khóa hoặc thay đổi quyền. Vui lòng đăng nhập lại.');
  }
  if (requiredRole === 'superadmin' && directoryUser.role !== 'superadmin') {
    throw new Error('Bạn không có quyền thực hiện thao tác quản trị tài khoản.');
  }
  return {
    username: directoryUser.username,
    role: directoryUser.role,
    name: directoryUser.name,
    avatar: directoryUser.avatar,
    passwordVersion: directoryUser.passwordVersion
  };
}

function requireAdminDivisionAccess_(token, division) {
  const user = requireAdminAccess_(token);
  const normalizedDivision = String(division || '').trim().toUpperCase();
  if (normalizedDivision !== 'CPD' && normalizedDivision !== 'P&G') {
    throw new Error('Phải chọn division CPD hoặc P&G trước khi truy cập dữ liệu.');
  }
  if (user.role === 'admincpd' && normalizedDivision !== 'CPD') {
    throw new Error('Tài khoản này chỉ có quyền truy cập division CPD.');
  }
  if (user.role === 'adminpng' && normalizedDivision !== 'P&G') {
    throw new Error('Tài khoản này chỉ có quyền truy cập division P&G.');
  }
  return user;
}

function validateRecordUpdate_(values, currentValues, editableFields, immutableFields) {
  const allowedFields = editableFields.concat(immutableFields);
  const suppliedFields = Object.keys(values);
  const invalidFields = suppliedFields.filter(key => allowedFields.indexOf(key) === -1);
  if (invalidFields.length) {
    throw new Error('Có trường không hợp lệ: ' + invalidFields.join(', '));
  }
  const changedImmutableFields = immutableFields.filter(key =>
    Object.prototype.hasOwnProperty.call(values, key) &&
    String(values[key] === undefined || values[key] === null ? '' : values[key]) !== currentValues[key]
  );
  if (changedImmutableFields.length) {
    throw new Error('Không được chỉnh sửa trường: ' + changedImmutableFields.join(', '));
  }
  if (!editableFields.some(key => Object.prototype.hasOwnProperty.call(values, key))) {
    throw new Error('Không có trường nào được phép chỉnh sửa.');
  }
  editableFields.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] === null) {
      throw new Error('Giá trị trường "' + key + '" không hợp lệ.');
    }
  });
}
