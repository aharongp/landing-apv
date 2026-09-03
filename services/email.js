'use strict';

const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const { once } = require('events');

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function emailAddress(value) {
  const raw = cleanHeader(value);
  const bracketed = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracketed) return bracketed[1];
  const direct = raw.match(/[^\s<>]+@[^\s<>]+/);
  return direct ? direct[0] : '';
}

function fromHeader(configured, smtpUser) {
  const raw = cleanHeader(configured);
  const configuredAddress = emailAddress(raw);
  if (configuredAddress && configuredAddress.toLowerCase() === smtpUser.toLowerCase()) return raw;
  const displayName = (raw.match(/^\s*"?([^"<]+)"?\s*</) || [])[1]?.trim() || 'APV Motors';
  return `"${displayName.replace(/"/g, '')}" <${smtpUser}>`;
}

function smtpConfig() {
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 465),
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || ''),
    from: String(process.env.SMTP_FROM || '').trim(),
    timeoutMs: Math.max(3000, Number(process.env.SMTP_TIMEOUT_MS || 12000))
  };
}

function getSmtpConfigStatus() {
  const config = smtpConfig();
  return {
    configured: Boolean(config.host && config.port && config.user && config.pass),
    host: config.host,
    port: config.port,
    from: config.user ? fromHeader(config.from, config.user) : ''
  };
}

function createReplyReader(socket) {
  let buffer = '';
  let current = null;
  let failure = null;
  const queued = [];
  const waiters = [];

  function deliver(reply) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(reply);
    else queued.push(reply);
  }

  function fail(err) {
    failure = err;
    while (waiters.length) waiters.shift().reject(err);
  }

  function onData(chunk) {
    buffer += chunk.toString('utf8');
    let newline;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      const match = line.match(/^(\d{3})([- ])(.*)$/);
      if (!match) continue;
      const code = Number(match[1]);
      if (!current || current.code !== code) current = { code, lines: [] };
      current.lines.push(match[3]);
      if (match[2] === ' ') {
        deliver(current);
        current = null;
      }
    }
  }

  socket.on('data', onData);
  socket.on('error', fail);
  socket.on('end', () => fail(new Error('El servidor SMTP cerró la conexión.')));

  return {
    next(timeoutMs) {
      if (queued.length) return Promise.resolve(queued.shift());
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve(reply) {
            clearTimeout(waiter.timer);
            resolve(reply);
          },
          reject(err) {
            clearTimeout(waiter.timer);
            reject(err);
          },
          timer: null
        };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error('Tiempo de espera agotado al comunicarse con SMTP.'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close() {
      socket.off('data', onData);
      socket.off('error', fail);
    }
  };
}

function expectCode(reply, expected, action) {
  if (!expected.includes(reply.code)) {
    const detail = reply.lines.join(' ').slice(0, 240);
    const err = new Error(`SMTP rechazó ${action} (${reply.code}${detail ? `: ${detail}` : ''}).`);
    err.code = 'SMTP_REJECTED';
    err.smtpCode = reply.code;
    throw err;
  }
  return reply;
}

async function command(socket, reader, value, expected, action, timeoutMs) {
  const response = reader.next(timeoutMs);
  socket.write(`${value}\r\n`);
  return expectCode(await response, expected, action);
}

async function connectAndAuthenticate() {
  const config = smtpConfig();
  if (!config.host || !config.port || !config.user || !config.pass) {
    const err = new Error('SMTP no está configurado completamente.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  let socket;
  if (config.port === 465) {
    socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: true });
    await once(socket, 'secureConnect');
  } else {
    socket = net.connect({ host: config.host, port: config.port });
    await once(socket, 'connect');
  }
  socket.setTimeout(config.timeoutMs, () => socket.destroy(new Error('Tiempo de espera agotado en SMTP.')));

  let reader = createReplyReader(socket);
  expectCode(await reader.next(config.timeoutMs), [220], 'la conexión');
  const clientName = os.hostname().replace(/[^a-zA-Z0-9.-]/g, '') || 'apv-motors';
  let hello = await command(socket, reader, `EHLO ${clientName}`, [250], 'EHLO', config.timeoutMs);

  if (!(socket instanceof tls.TLSSocket)) {
    const supportsStartTls = hello.lines.some((line) => /^STARTTLS\b/i.test(line));
    if (!supportsStartTls) {
      socket.destroy();
      const err = new Error('El servidor SMTP no ofrece STARTTLS; no se enviarán credenciales sin cifrar.');
      err.code = 'SMTP_TLS_REQUIRED';
      throw err;
    }
    await command(socket, reader, 'STARTTLS', [220], 'STARTTLS', config.timeoutMs);
    reader.close();
    socket = tls.connect({ socket, servername: config.host, rejectUnauthorized: true });
    await once(socket, 'secureConnect');
    reader = createReplyReader(socket);
    hello = await command(socket, reader, `EHLO ${clientName}`, [250], 'EHLO seguro', config.timeoutMs);
  }

  const supportsAuth = hello.lines.some((line) => /^AUTH\b/i.test(line));
  if (!supportsAuth) throw new Error('El servidor SMTP no anunció autenticación compatible.');
  await command(socket, reader, 'AUTH LOGIN', [334], 'AUTH LOGIN', config.timeoutMs);
  await command(socket, reader, Buffer.from(config.user).toString('base64'), [334], 'el usuario SMTP', config.timeoutMs);
  await command(socket, reader, Buffer.from(config.pass).toString('base64'), [235], 'la contraseña SMTP', config.timeoutMs);

  return { socket, reader, config };
}

function verificationMessage(toEmail, code, config) {
  const boundary = `apv-${crypto.randomBytes(12).toString('hex')}`;
  const sender = fromHeader(config.from, config.user);
  const subject = `=?UTF-8?B?${Buffer.from('APV Motors - Código de verificación').toString('base64')}?=`;
  const text = `Tu código de verificación de APV Motors es: ${code}. Caduca en 15 minutos. Si no solicitaste esta cuenta, ignora este mensaje.`;
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:20px"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0"><h1 style="color:#dc2626;text-align:center;margin:0 0 6px">APV MOTORS</h1><p style="color:#64748b;text-align:center">Verificación de cuenta para subastas</p><div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin:24px 0"><p>Tu código de verificación es:</p><div style="font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a">${code}</div><p style="color:#64748b;font-size:12px">Caduca en 15 minutos.</p></div><p style="color:#64748b;font-size:13px;text-align:center">Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p></div></body></html>`;
  return [
    `From: ${sender}`,
    `To: ${cleanHeader(toEmail)}`,
    `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${config.host}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    `--${boundary}--`,
    ''
  ].join('\r\n').replace(/\r\n\./g, '\r\n..');
}

async function sendVerificationEmail(toEmail, code) {
  const recipient = emailAddress(toEmail);
  if (!recipient || /[\r\n]/.test(String(toEmail))) throw new Error('Destinatario de correo inválido.');
  const session = await connectAndAuthenticate();
  const { socket, reader, config } = session;
  try {
    await command(socket, reader, `MAIL FROM:<${config.user}>`, [250], 'el remitente', config.timeoutMs);
    await command(socket, reader, `RCPT TO:<${recipient}>`, [250, 251], 'el destinatario', config.timeoutMs);
    await command(socket, reader, 'DATA', [354], 'el contenido del correo', config.timeoutMs);
    const accepted = reader.next(config.timeoutMs);
    socket.write(`${verificationMessage(recipient, code, config)}\r\n.\r\n`);
    expectCode(await accepted, [250], 'el envío del correo');
    try { await command(socket, reader, 'QUIT', [221], 'QUIT', config.timeoutMs); } catch (_) {}
    return true;
  } finally {
    socket.end();
  }
}

async function verifySmtpConnection() {
  const session = await connectAndAuthenticate();
  try { await command(session.socket, session.reader, 'QUIT', [221], 'QUIT', session.config.timeoutMs); } catch (_) {}
  session.socket.end();
  return true;
}

module.exports = { getSmtpConfigStatus, sendVerificationEmail, verifySmtpConnection };
