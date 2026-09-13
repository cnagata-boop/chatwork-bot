'use strict';

const axios = require('axios');
const { config } = require('./config');
const log = require('./logger');

/**
 * お知らせの出し先。既定はログだけ。
 * NOTIFY_WEBHOOK_URL を設定すると、そのURLにJSONをPOSTする
 * （Slack / Discord / IFTTT など、text か content を読むサービスならそのまま使える）。
 */
async function notify(title, lines = []) {
  const text = [title, ...lines.filter(Boolean)].join('\n');
  log(`\n${text}\n`);

  const url = config.notify.webhookUrl;
  if (!url) return { text, sent: false };

  try {
    await axios.post(
      url,
      { text, content: text, title },
      { headers: { 'content-type': 'application/json' }, timeout: 15000 },
    );
    return { text, sent: true };
  } catch (error) {
    log.warn(`通知の送信に失敗しました: ${error.message}`);
    return { text, sent: false };
  }
}

module.exports = { notify };
