const ADMIN_SPREADSHEET_ID = '1Wqkll2nltkSJ593bgmDKbWgwXcS59nzzsdR7cqY3h8E';
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
  const template = HtmlService.createTemplateFromFile('index');
  template.isAppsScript = true;
  return template.evaluate()
    .setTitle('CPD MASTER · Quản trị')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function adminListRecords(section, hostGroup) {
  const spreadsheet = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
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
    const sheet = requireHostSheet_(spreadsheet, hostGroup);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 3, lastRow - 1, 2).getDisplayValues()
      .map((row, index) => ({
        rowNumber: index + 2,
        version: makeRowVersion_(row),
        values: { name: row[0] || '', hostCode: row[1] || '' }
      }))
      .filter(record => record.values.name || record.values.hostCode);
  }

  throw new Error('Loại dữ liệu không được hỗ trợ.');
}

function adminSaveRecord(section, hostGroup, record) {
  if (!record || typeof record !== 'object' || !record.values || typeof record.values !== 'object') {
    throw new Error('Dữ liệu gửi lên không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
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

function adminDeleteRecord(section, hostGroup, rowNumber, version) {
  const row = Number(rowNumber);
  const firstDataRow = section === 'titles' ? 1 : 2;
  if (!Number.isInteger(row) || row < firstDataRow) {
    throw new Error('Dòng dữ liệu cần xóa không hợp lệ.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const spreadsheet = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    const sheet = getSectionSheet_(spreadsheet, section, hostGroup);
    const width = section === 'hosts' ? 2 : (section === 'schedules' ? 20 : 8);
    const startColumn = section === 'hosts' ? 3 : 1;
    verifyCurrentRow_(sheet, row, startColumn, width, version);
    if (section === 'schedules') {
      sheet.deleteRow(row);
    } else if (section === 'titles') {
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
  validateRequired_(values, ['platform', 'brand', 'date', 'startTime', 'endTime']);
  validateScheduleDate_(values.date);
  validateTime_(values.startTime, 'Giờ bắt đầu');
  validateTime_(values.endTime, 'Giờ kết thúc');

  let rowNumber = getTargetRow_(sheet, record, 20);
  let row = rowNumber ? sheet.getRange(rowNumber, 1, 1, 20).getDisplayValues()[0] : Array(20).fill('');
  Object.keys(ADMIN_SCHEDULE_COLUMNS).forEach(key => {
    row[ADMIN_SCHEDULE_COLUMNS[key]] = cleanText_(values[key] || '', key);
  });
  writeRowCells_(sheet, rowNumber, Object.keys(ADMIN_SCHEDULE_COLUMNS).map(key => ADMIN_SCHEDULE_COLUMNS[key] + 1),
    Object.keys(ADMIN_SCHEDULE_COLUMNS).map(key => row[ADMIN_SCHEDULE_COLUMNS[key]]));
}

function saveBackgroundRecord_(spreadsheet, record) {
  const sheet = requireSheet_(spreadsheet, 'BG');
  const values = record.values;
  validateRequired_(values, ['platform', 'brand']);
  if (!String(values.link1 || '').trim() && !String(values.link2 || '').trim()) {
    throw new Error('Vui lòng nhập ít nhất một đường dẫn background.');
  }
  const rowNumber = getTargetRow_(sheet, record, 8);
  const row = rowNumber ? sheet.getRange(rowNumber, 1, 1, 8).getDisplayValues()[0] : Array(8).fill('');
  [0, 1, 2, 3, 4, 5, 6, 7].forEach((column, index) => {
    const keys = ['platform', 'brand', 'type', 'link1', 'note1', 'link2', 'note2', 'sharedNote'];
    row[column] = cleanText_(values[keys[index]] || '', keys[index]);
  });
  writeEntireRow_(sheet, rowNumber, row);
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
  const sheet = requireHostSheet_(spreadsheet, hostGroup);
  const values = record.values;
  validateRequired_(values, ['name', 'hostCode']);
  const rowNumber = getTargetRow_(sheet, record, 2, 3);
  const row = [
    cleanText_(values.name, 'name'),
    cleanText_(values.hostCode, 'hostCode')
  ];
  writeRowCells_(sheet, rowNumber, [3, 4], row);
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
  if (section === 'hosts') return requireHostSheet_(spreadsheet, hostGroup);
  throw new Error('Loại dữ liệu không được hỗ trợ.');
}

function getActiveScheduleSheet_(spreadsheet) {
  const selector = requireSheet_(spreadsheet, 'ACTURAL');
  const sheetName = String(selector.getRange('A2').getDisplayValue() || '').trim();
  if (!sheetName) throw new Error('Ô ACTURAL!A2 chưa có tên sheet lịch đang hoạt động.');
  return requireSheet_(spreadsheet, sheetName);
}

function requireHostSheet_(spreadsheet, hostGroup) {
  if (hostGroup !== 'ECO ID' && hostGroup !== 'CPD ID') {
    throw new Error('Danh sách mã host không hợp lệ.');
  }
  return requireSheet_(spreadsheet, hostGroup);
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
