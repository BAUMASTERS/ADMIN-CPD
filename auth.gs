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
