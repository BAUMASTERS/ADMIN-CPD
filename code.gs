const ADMIN_SPREADSHEET_ID = '1Wqkll2nltkSJ593bgmDKbWgwXcS59nzzsdR7cqY3h8E';
const ADMIN_PASSWORD_HASH_ITERATIONS = 60000;
const ADMIN_SESSION_SECONDS = 21600;
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOGIN_WINDOW_SECONDS = 900;
const ADMIN_USERS_SHEET_NAME = 'ADMIN_USERS';
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
  const template = HtmlService.createTemplateFromFile('Index');
  template.isAppsScript = true;
  template.bootstrapEnabled = Boolean(
    PropertiesService.getScriptProperties().getProperty('ADMIN_SETUP_KEY')
  );
  return template.evaluate()
    .setTitle('CPD MASTER · Quản trị')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function adminBootstrap(setupKey, username, password) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const configuredKey = properties.getProperty('ADMIN_SETUP_KEY');
    if (configuredKey && configuredKey.length < 32) {
      throw new Error('ADMIN_SETUP_KEY cần tối thiểu 32 ký tự ngẫu nhiên.');
    }
    if (!configuredKey || !constantTimeEquals_(setupKey, configuredKey)) {
      throw new Error('Setup key không hợp lệ hoặc đã được sử dụng.');
    }

    const sheet = getAdminUsersSheet_();
    if (sheet.getLastRow() > 1) {
      throw new Error('Đã có tài khoản admin. Bootstrap chỉ dùng một lần.');
    }
    validateNewUser_(username, password);
    appendAdminUser_(sheet, username, password, 'superadmin');
    properties.deleteProperty('ADMIN_SETUP_KEY');
    return { success: true };
  } finally {
    lock.releaseLock();
  }
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

  const sheet = getAdminUsersSheet_();
  const user = findAdminUser_(sheet, normalizedUsername);
  const candidateHash = hashAdminPassword_(password, user ? user.salt : 'unknown-user-salt');
  const passwordMatches = user
    ? constantTimeEquals_(candidateHash, user.passwordHash)
    : constantTimeEquals_(candidateHash, 'invalid-password-hash');
  if (!user || !user.active || !passwordMatches) {
    return { success: false, message: 'Tên tài khoản hoặc mật khẩu không đúng.' };
  }

  cache.remove(failureKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(token, JSON.stringify({
    username: user.username,
    role: user.role
  }), ADMIN_SESSION_SECONDS);
  return {
    success: true,
    token: token,
    username: user.username,
    role: user.role
  };
}

function adminLogout(token) {
  if (token) CacheService.getScriptCache().remove(String(token));
  return { success: true };
}

function adminListUsers(token) {
  requireAdminAccess_(token, 'superadmin');
  const sheet = getAdminUsersSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 6).getDisplayValues()
    .filter(row => row[0])
    .map(row => ({
      username: row[0],
      role: row[3],
      active: row[4] === 'TRUE'
    }));
}

function adminCreateUser(token, username, password) {
  requireAdminAccess_(token, 'superadmin');
  validateNewUser_(username, password);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getAdminUsersSheet_();
    if (findAdminUser_(sheet, normalizeUsername_(username))) {
      throw new Error('Tên tài khoản đã tồn tại.');
    }
    appendAdminUser_(sheet, username, password, 'admin');
    return { success: true };
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
    const sheet = getAdminUsersSheet_();
    const user = findAdminUser_(sheet, normalizedUsername);
    if (!user) throw new Error('Không tìm thấy tài khoản.');
    if (user.role === 'superadmin' && !active) {
      throw new Error('Không thể khóa tài khoản superadmin.');
    }
    sheet.getRange(user.rowNumber, 5).setValue(Boolean(active));
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function adminListRecords(token, section, hostGroup, division) {
  requireAdminAccess_(token);
  const spreadsheet = getAdminSpreadsheet_(division);
  if (section === 'schedules') {
    const sheet = getActiveScheduleSheet_(spreadsheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    return sheet.getRange(2, 1, lastRow - 1, 20).getDisplayValues()
      .map((row, index) => {
        const values = {};
        Object.keys(ADMIN_SCHEDULE_COLUMNS).forEach(key => {
          values[key] = row[ADMIN_SCHEDULE_COLUMNS[key]] || '';
        });
        return {
          rowNumber: index + 2,
          version: makeRowVersion_(row),
          values: values
        };
      })
      .filter(record => Object.keys(record.values).some(key => record.values[key] !== ''));
  }

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

function adminSaveRecord(token, section, hostGroup, record, division) {
  requireAdminAccess_(token);
  if (!record || typeof record !== 'object' || !record.values || typeof record.values !== 'object') {
    throw new Error('Dữ liệu gửi lên không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getAdminSpreadsheet_(division);
    if (section === 'schedules') {
      saveScheduleRecord_(spreadsheet, record);
    } else if (section === 'backgrounds') {
      saveBackgroundRecord_(spreadsheet, record);
    } else if (section === 'titles') {
      saveTitleRecord_(spreadsheet, record);
    } else if (section === 'hosts') {
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
  requireAdminAccess_(token);
  if (section === 'schedules') {
    throw new Error('Không được xóa lịch đã import từ brand.');
  }
  if (section === 'backgrounds') {
    throw new Error('Background được tạo theo brand và không thể xóa riêng.');
  }
  const row = Number(rowNumber);
  const firstDataRow = section === 'titles' ? 1 : 2;
  if (!Number.isInteger(row) || row < firstDataRow) {
    throw new Error('Dòng dữ liệu cần xóa không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = getAdminSpreadsheet_(division);
    const sheet = getSectionSheet_(spreadsheet, section, hostGroup);
    const hostConfig = section === 'hosts' ? getHostConfig_(spreadsheet, hostGroup) : null;
    const width = section === 'hosts' ? 2 : (section === 'schedules' ? 20 : 8);
    const startColumn = hostConfig ? hostConfig.nameColumn : 1;
    verifyCurrentRow_(sheet, row, startColumn, width, version);
    if (section === 'titles') {
      sheet.getRange(row, 1, 1, 2).clearContent();
      sheet.getRange(row, 4, 1, 4).clearContent();
    } else {
      sheet.getRange(row, startColumn, 1, width).clearContent();
    }
    return { success: true };
  } finally {
    lock.releaseLock();
  }
}

function saveScheduleRecord_(spreadsheet, record) {
  const sheet = getActiveScheduleSheet_(spreadsheet);
  const values = record.values;
  const editableFields = ['host', 'douHost', 'hostEco', 'room', 'status', 'isKeep'];
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    throw new Error('Không được tạo lịch thủ công; lịch được import từ brand.');
  }
  const rowNumber = getTargetRow_(sheet, record, 20);
  if (rowNumber < 2) throw new Error('Không được sửa dòng tiêu đề của sheet lịch.');
  const currentRow = sheet.getRange(rowNumber, 1, 1, 20).getDisplayValues()[0];
  const currentValues = {};
  Object.keys(ADMIN_SCHEDULE_COLUMNS).forEach(key => {
    currentValues[key] = currentRow[ADMIN_SCHEDULE_COLUMNS[key]] || '';
  });
  validateRecordUpdate_(
    values,
    currentValues,
    editableFields,
    ['platform', 'brand', 'date', 'type', 'startTime', 'endTime', 'pic']
  );

  const fieldsToWrite = editableFields.filter(key => Object.prototype.hasOwnProperty.call(values, key));
  const columns = fieldsToWrite.map(key => ADMIN_SCHEDULE_COLUMNS[key] + 1);
  const updatedValues = fieldsToWrite.map(key => cleanText_(values[key], key));
  writeRowCells_(sheet, rowNumber, columns, updatedValues);
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
  const sheet = requireSheet_(spreadsheet, 'TITLE');
  const values = record.values;
  validateRequired_(values, ['platform', 'brand', 'title']);
  ['hostFlag', 'timeFlag', 'dateFlag'].forEach(key => {
    if (!['0', '1'].includes(String(values[key]))) {
      throw new Error('Các tùy chọn tiền tố chỉ nhận giá trị 0 hoặc 1.');
    }
  });
  const rowNumber = getTargetRow_(sheet, record, 8, 1, 1);
  const row = rowNumber ? sheet.getRange(rowNumber, 1, 1, 8).getDisplayValues()[0] : Array(8).fill('');
  row[0] = cleanText_(values.platform, 'platform');
  row[1] = cleanText_(values.brand, 'brand');
  row[3] = String(values.hostFlag);
  row[4] = String(values.timeFlag);
  row[5] = String(values.dateFlag);
  row[6] = cleanText_(values.title, 'title');
  writeEntireRow_(sheet, rowNumber, row);
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

function getSectionSheet_(spreadsheet, section, hostGroup) {
  if (section === 'schedules') return getActiveScheduleSheet_(spreadsheet);
  if (section === 'backgrounds') return requireSheet_(spreadsheet, 'BG');
  if (section === 'titles') return requireSheet_(spreadsheet, 'TITLE');
  if (section === 'hosts') return getHostConfig_(spreadsheet, hostGroup).sheet;
  throw new Error('Loại dữ liệu không được hỗ trợ.');
}

function getActiveScheduleSheet_(spreadsheet) {
  const selector = requireSheet_(spreadsheet, 'ACTURAL');
  const sheetName = String(selector.getRange('A2').getDisplayValue() || '').trim();
  if (!sheetName) throw new Error('Ô ACTURAL!A2 chưa có tên sheet lịch đang hoạt động.');
  return requireSheet_(spreadsheet, sheetName);
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
  if (!normalizedDivision) {
    throw new Error('Phải chọn division CPD hoặc P&G trước khi truy cập dữ liệu.');
  }
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId;
  if (normalizedDivision === 'CPD') {
    spreadsheetId = properties.getProperty('ADMIN_SPREADSHEET_ID_CPD') || ADMIN_SPREADSHEET_ID;
  } else if (normalizedDivision === 'P&G') {
    spreadsheetId = properties.getProperty('ADMIN_SPREADSHEET_ID_PG');
  } else {
    throw new Error('Division không hợp lệ. Chọn CPD hoặc P&G.');
  }
  if (!spreadsheetId) {
    throw new Error('Chưa cấu hình spreadsheet ID cho division ' + normalizedDivision + '.');
  }
  return SpreadsheetApp.openById(spreadsheetId);
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

function getAdminUsersSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty('ADMIN_USERS_SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('Chưa cấu hình ADMIN_USERS_SPREADSHEET_ID trong Script Properties.');
  }
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(ADMIN_USERS_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(ADMIN_USERS_SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 6).setValues([[
      'username', 'salt', 'passwordHash', 'role', 'active', 'createdAt'
    ]]);
  }
  return sheet;
}

function findAdminUser_(sheet, username) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (normalizeUsername_(row[0]) === username) {
      return {
        rowNumber: index + 2,
        username: normalizeUsername_(row[0]),
        salt: String(row[1] || ''),
        passwordHash: String(row[2] || ''),
        role: String(row[3] || ''),
        active: row[4] === true || String(row[4]).toUpperCase() === 'TRUE'
      };
    }
  }
  return null;
}

function appendAdminUser_(sheet, username, password, role) {
  const normalizedUsername = normalizeUsername_(username);
  const salt = Utilities.getUuid() + Utilities.getUuid();
  const rowNumber = Math.max(2, sheet.getLastRow() + 1);
  sheet.getRange(rowNumber, 1, 1, 6).setValues([[
    normalizedUsername,
    salt,
    hashAdminPassword_(password, salt),
    role,
    true,
    new Date()
  ]]);
}

function validateNewUser_(username, password) {
  const normalizedUsername = normalizeUsername_(username);
  if (!/^[a-z0-9._-]{3,40}$/.test(normalizedUsername)) {
    throw new Error('Tên tài khoản cần dài 3–40 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.');
  }
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new Error('Mật khẩu cần dài từ 12 đến 128 ký tự.');
  }
}

function normalizeUsername_(username) {
  return String(username || '').trim().toLowerCase();
}

function hashAdminPassword_(password, salt) {
  const saltBytes = Utilities.newBlob(salt).getBytes();
  let block = Utilities.computeHmacSha256Signature(
    saltBytes.concat([0, 0, 0, 1]),
    password
  );
  const derivedKey = block.slice();
  for (let iteration = 1; iteration < ADMIN_PASSWORD_HASH_ITERATIONS; iteration++) {
    block = Utilities.computeHmacSha256Signature(block, password);
    for (let index = 0; index < derivedKey.length; index++) {
      derivedKey[index] = (derivedKey[index] ^ block[index]) & 0xff;
    }
  }
  return 'pbkdf2-sha256$' + ADMIN_PASSWORD_HASH_ITERATIONS + '$' +
    Utilities.base64Encode(derivedKey);
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
  const user = findAdminUser_(getAdminUsersSheet_(), normalizeUsername_(session.username));
  if (!user || !user.active || user.role !== session.role) {
    CacheService.getScriptCache().remove(String(token));
    throw new Error('Tài khoản đã bị khóa hoặc thay đổi quyền. Vui lòng đăng nhập lại.');
  }
  if (requiredRole === 'superadmin' && user.role !== 'superadmin') {
    throw new Error('Bạn không có quyền thực hiện thao tác quản trị tài khoản.');
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
