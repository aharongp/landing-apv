'use strict';
const crypto = require('node:crypto');
const TTL = 15 * 60 * 1000;
const digest = (email, code) => crypto.createHash('sha256').update(email + ':' + code).digest('hex');
function createPasswordReset({ db, sendEmail, hashPassword, now = Date.now, generateCode = () => String(crypto.randomInt(100000, 1000000)) }) {
  const limits = new Map();
  function rateLimit(ip) {
    const time = now();
    for (const [key, value] of limits) if (value.until <= time) limits.delete(key);
    const item = limits.get(ip) || { count: 0, until: time + TTL };
    item.count++; limits.set(ip, item);
    if (item.count > 20) { const e = new Error('Espera unos minutos antes de volver a intentarlo.'); e.statusCode = 429; throw e; }
  }
  const normalize = value => String(value || '').trim().toLowerCase().slice(0, 254);
  async function request(emailValue, ip = '') {
    rateLimit(ip);
    const email = normalize(emailValue), time = now();
    const old = db.prepare('SELECT requestedAt FROM password_resets WHERE email = ?').get(email);
    if (old && time - old.requestedAt < 60000) return;
    const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND emailVerified = 1').get(email);
    // Store a challenge for all addresses so repeat responses do not reveal account existence.
    const code = generateCode();
    db.prepare(`INSERT INTO password_resets(email,codeHash,expiresAt,attempts,requestedAt) VALUES(?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET codeHash=excluded.codeHash,expiresAt=excluded.expiresAt,attempts=0,requestedAt=excluded.requestedAt`).run(email, digest(email, code), time + TTL, time);
    db.prepare('DELETE FROM password_resets WHERE expiresAt < ?').run(time - TTL);
    if (user) {
      // Request endpoint responds before SMTP completion, uniformly for existing and unknown accounts.
      Promise.resolve().then(() => sendEmail(email, code)).catch(() => {
        db.prepare('DELETE FROM password_resets WHERE email = ? AND codeHash = ?').run(email, digest(email, code));
        console.error('[password-reset] No se pudo entregar el correo; revisar SMTP.');
      });
    }
  }
  function confirm(emailValue, codeValue, password, ip = '') {
    rateLimit(ip);
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      const e = new Error('Usa una contraseña de entre 8 y 256 caracteres.'); e.statusCode = 400; throw e;
    }
    const email = normalize(emailValue), code = String(codeValue || '');
    const challenge = db.prepare('SELECT * FROM password_resets WHERE email = ?').get(email);
    const invalid = () => {const e = new Error('El código es incorrecto o venció. Solicita uno nuevo.');e.statusCode = 400;throw e;};
    if (!challenge || challenge.expiresAt <= now() || challenge.attempts >= 5) invalid();
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?').run(email);
    if (!/^\d{6}$/.test(code) || !crypto.timingSafeEqual(Buffer.from(challenge.codeHash), Buffer.from(digest(email, code)))) invalid();
    const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND emailVerified = 1').get(email);
    if (!user) invalid();
    const credentials = hashPassword(password);
    db.exec('BEGIN IMMEDIATE');
    try {
      const consumed = db.prepare('DELETE FROM password_resets WHERE email = ? AND codeHash = ? AND expiresAt > ?').run(email, challenge.codeHash, now());
      if (!consumed.changes) invalid();
      db.prepare('UPDATE users SET passwordSalt = ?, passwordHash = ?, sessionVersion = sessionVersion + 1 WHERE id = ?').run(credentials.salt, credentials.digest, user.id);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  return { request, confirm };
}
module.exports = { createPasswordReset };
