'use strict';

const axios = require('axios');
const { config } = require('./config');
const log = require('./logger');

const LINE_API = 'https://api.line.me/v2/bot/message';
const LINE_MAX_CHARS = 4800; // LINE の上限は5000文字。余裕を見て切る

/** LINE に送るテキストを上限内に収める */
function trimForLine(text) {
  return text.length > LINE_MAX_CHARS ? `${text.slice(0, LINE_MAX_CHARS - 1)}…` : text;
}

/**
 * LINE に送る。LINE_TO があればその人へ push、無ければ友だち全員へ broadcast。
 * broadcast なら自分のユーザーIDを調べなくてよいので設定がラク。
 */
async function sendLine(text) {
  const { token, to } = config.notify.line;
  if (!token) return false;

  const endpoint = to ? `${LINE_API}/push` : `${LINE_API}/broadcast`;
  const body = { messages: [{ type: 'text', text: trimForLine(text) }] };
  if (to) body.to = to;

  try {
    await axios.post(endpoint, body, {
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      timeout: 15000,
    });
    return true;
  } catch (error) {
    const detail = error.response ? `${error.response.status} ${JSON.stringify(error.response.data)}` : error.message;
    log.warn(`LINE への送信に失敗しました: ${detail}`);
    return false;
  }
}

async function sendWebhook(text, title) {
  const url = config.notify.webhookUrl;
  if (!url) return false;

  try {
    await axios.post(
      url,
      { text, content: text, title },
      { headers: { 'content-type': 'application/json' }, timeout: 15000 },
    );
    return true;
  } catch (error) {
    log.warn(`Webhook への送信に失敗しました: ${error.message}`);
    return false;
  }
}

/**
 * お知らせを出す。設定してある宛先に送り、いつでもログには残す。
 * 送信に失敗しても処理は止めない（記事はもう note に保存されているため）。
 */
async function notify(title, lines = []) {
  const text = [title, ...lines.filter(Boolean)].join('\n');
  log(`\n${text}\n`);

  const results = await Promise.all([sendLine(text), sendWebhook(text, title)]);
  return { text, sent: results.some(Boolean) };
}

module.exports = { notify, trimForLine, LINE_MAX_CHARS };
