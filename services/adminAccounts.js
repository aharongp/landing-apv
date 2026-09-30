'use strict';

const columns = `id, name, email, phone, createdAt, lastLoginAt,
  CASE WHEN emailVerified = 1 THEN 1 ELSE 0 END AS verified,
  CASE WHEN COALESCE(googleSub, '') != '' THEN 'Google' ELSE 'Correo' END AS provider`;

function selection(params) {
  const query = (params.get('q') || '').trim().slice(0, 200);
  const status = params.get('status') || 'all';
  if (!['all', 'verified', 'pending'].includes(status)) {
    const error = new Error('Estado de verificación inválido.');
    error.statusCode = 400;
    throw error;
  }
  const clauses = [], values = [];
  if (query) {
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    clauses.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");
    values.push(pattern, pattern, pattern);
  }
  if (status === 'verified') clauses.push('emailVerified = 1');
  if (status === 'pending') clauses.push('COALESCE(emailVerified, 0) != 1');
  return { where: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', values };
}

function listAccounts(db, params) {
  const { where, values } = selection(params);
  const total = db.prepare('SELECT COUNT(*) AS total FROM users' + where).get(...values).total;
  const pageSize = 25, pages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = Number(params.get('page') || 1);
  const page = Math.min(pages, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const accounts = db.prepare(`SELECT ${columns} FROM users${where} ORDER BY createdAt DESC, id ASC LIMIT ? OFFSET ?`)
    .all(...values, pageSize, (page - 1) * pageSize);
  return { accounts, total, page, pageSize, pages };
}

function csvCell(value) {
  let text = String(value ?? '');
  // Keep spreadsheet formulas inert, including international phone numbers.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

function exportAccounts(db, params) {
  const { where, values } = selection(params);
  const rows = [['ID', 'Nombre', 'Correo', 'Teléfono', 'Correo verificado', 'Acceso', 'Fecha de registro (UTC)', 'Último acceso (UTC)']];
  for (const account of db.prepare(`SELECT ${columns} FROM users${where} ORDER BY createdAt DESC, id ASC`).iterate(...values)) {
    rows.push([account.id, account.name, account.email, account.phone, account.verified ? 'Sí' : 'No', account.provider, account.createdAt, account.lastLoginAt]);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

module.exports = { listAccounts, exportAccounts };
