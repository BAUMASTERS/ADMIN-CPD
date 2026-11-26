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
  const sheet = spreadsheet.getSheetByName(sheetName);
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
