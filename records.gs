function adminListRecords(token, section, hostGroup, division) {
  requireAdminDivisionAccess_(token, division);
  if (section === 'schedules') {
    return getScheduleSourcesForDivision_(division)
      .reduce((records, source) => records.concat(listScheduleRecordsFromSheet_(source)), []);
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

function listScheduleRecordsFromSheet_(source) {
  const sheet = source.sheet;
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
        sourceId: source.id,
        version: makeRowVersion_([source.id, row]),
        values: values
      };
    })
    .filter(record => Object.keys(record.values).some(key => record.values[key] !== ''));
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
  const sourceId = record.sourceId || 'mega';
  const sheet = getScheduleSheetBySource_(sourceId, division);
  const columnIndexes = getScheduleColumnIndexes_(sheet);
  const width = Math.max(sheet.getLastColumn(), 20);
  const values = record.values;
  const editableFields = ['host', 'douHost', 'hostEco', 'room', 'status', 'isKeep'];
  if (record.rowNumber === undefined || record.rowNumber === null || record.rowNumber === '') {
    throw new Error('Không được tạo lịch thủ công; lịch được import từ brand.');
  }
  const rowNumber = Number(record.rowNumber);
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error('Bản ghi lịch không còn tồn tại. Hãy tải lại danh sách.');
  }
  const currentRow = sheet.getRange(rowNumber, 1, 1, width).getDisplayValues()[0];
  if (!record.version || makeRowVersion_([sourceId, currentRow]) !== record.version) {
    throw new Error('Lịch đã thay đổi ở nơi khác. Hãy tải lại rồi thử lại.');
  }
  const currentValues = {};
  Object.keys(columnIndexes).forEach(key => {
    currentValues[key] = currentRow[columnIndexes[key]] || '';
  });
  validateRecordUpdate_(
    values,
    currentValues,
    editableFields,
    ['platform', 'brand', 'date', 'type', 'startTime', 'endTime', 'pic', 'kolLive', 'day', 'hour']
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
    hostEco: ['host eco', 'hosteco', 'eco host', 'eco'],
    douHost: ['douhost', 'đa host', 'host phụ', 'duo op'],
    room: ['room', 'phòng', 'phòng live'],
    status: ['status', 'trạng thái'],
    isKeep: ['iskeep', 'is keep', 'keep'],
    kolLive: ['kol live', 'kol', 'người live'],
    day: ['day', 'ngày trong tuần'],
    hour: ['hour', 'giờ']
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
  return getScheduleSheetBySource_('mega', division);
}

function getScheduleSheetBySource_(sourceId, division) {
  const source = getScheduleSourcesForDivision_(division).find(item => item.id === sourceId);
  if (!source) throw new Error('Nguồn lịch không hợp lệ hoặc không thuộc division đang làm việc.');
  return source.sheet;
}

function getScheduleSourcesForDivision_(division) {
  const normalizedDivision = String(division || '').trim().toUpperCase();
  if (normalizedDivision !== 'CPD' && normalizedDivision !== 'P&G') {
    throw new Error('Phải chọn division CPD hoặc P&G trước khi truy cập dữ liệu.');
  }
  const sources = [];
  if (normalizedDivision === 'CPD') {
    const cpdSpreadsheet = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
    sources.push({
      id: 'web-data',
      sheet: requireSheet_(cpdSpreadsheet, ADMIN_WEB_DATA_SHEET_NAME)
    });
  }
  const megaSpreadsheet = SpreadsheetApp.openById(ADMIN_MEGA_SCHEDULE_SPREADSHEET_ID);
  sources.push({
    id: 'mega',
    sheet: requireSheet_(megaSpreadsheet, ADMIN_MEGA_SCHEDULE_SHEET_NAME)
  });
  return sources;
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
