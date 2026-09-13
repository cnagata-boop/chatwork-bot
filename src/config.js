'use strict';

const path = require('path');
const fs = require('fs');

try {
  require('dotenv').config();
} catch (_) {
  // dotenv 未インストールでも環境変数だけで動かせるようにする
}

const toBool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const toInt = (value, fallback) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

fs.mkdirSync(dataDir, { recursive: true });

const config = {
  dataDir,

  claude: {
    apiKey: process.env.CLAUDE_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
    maxTokens: toInt(process.env.CLAUDE_MAX_TOKENS, 4000),
  },

  notify: {
    // 「下書きができました」などのお知らせ先。空ならログに出すだけ。
    // Slack / Discord などの Incoming Webhook URL をそのまま入れられる。
    webhookUrl: process.env.NOTIFY_WEBHOOK_URL || '',
  },

  note: {
    email: process.env.NOTE_EMAIL,
    password: process.env.NOTE_PASSWORD,
    authStatePath: process.env.NOTE_AUTH_STATE_PATH || path.join(dataDir, 'note-auth.json'),
    // 'draft'   … 下書き保存だけ（既定。人がチェックしてから公開する）
    // 'publish' … 生成からそのまま公開まで走らせる
    publishMode: (process.env.NOTE_PUBLISH_MODE || 'draft').toLowerCase(),
    headless: toBool(process.env.NOTE_HEADLESS, true),
    // システムに入れた Chromium を使いたいときの逃げ道（例: /usr/bin/chromium）
    browserPath: process.env.NOTE_BROWSER_PATH || '',
    slowMo: toInt(process.env.NOTE_SLOW_MO, 0),
    timeoutMs: toInt(process.env.NOTE_TIMEOUT_MS, 45000),
    maxTags: toInt(process.env.NOTE_MAX_TAGS, 5),
    // 記事末尾に必ず足す一言（メンバーシップ誘導・Amazonアソシエイト等の導線）
    footer: process.env.NOTE_FOOTER || '',
  },

  content: {
    persona: process.env.CONTENT_PERSONA || '中小企業の経理・バックオフィス改善を手伝ってきた実務家',
    audience: process.env.CONTENT_AUDIENCE || '中小企業の経理担当者・個人事業主',
    theme: process.env.CONTENT_THEME || '経理業務の効率化とAI活用',
    tone: process.env.CONTENT_TONE || '具体例が多く、手を動かせる実務寄りの語り口',
    minChars: toInt(process.env.CONTENT_MIN_CHARS, 1200),
    maxChars: toInt(process.env.CONTENT_MAX_CHARS, 3000),
    // true にすると「無料パート＋有料パート」の構成で書かせる。
    // 値段の設定は note の画面でしかできないので、有料記事は必ず下書き止まりにする。
    paidEnabled: toBool(process.env.CONTENT_PAID, false),
    paidPrice: toInt(process.env.NOTE_PRICE, 300),
  },

  schedule: {
    enabled: toBool(process.env.AUTO_POST_ENABLED, false),
    cron: process.env.AUTO_POST_CRON || '0 8 * * *',
    timezone: process.env.TZ || 'Asia/Tokyo',
    // /cron エンドポイントを外部スケジューラから叩くときの合言葉
    secret: process.env.CRON_SECRET || '',
  },
};

/**
 * 必要な環境変数が揃っているか確認する。
 * @param {string[]} keys 'claude.apiKey' のようなドット区切りパス
 */
function requireConfig(keys) {
  const missing = keys.filter((key) => {
    const value = key.split('.').reduce((acc, part) => (acc ? acc[part] : undefined), config);
    return value === undefined || value === '';
  });
  if (missing.length) {
    const envNames = {
      'claude.apiKey': 'CLAUDE_API_KEY',
      'note.email': 'NOTE_EMAIL',
      'note.password': 'NOTE_PASSWORD',
    };
    const names = missing.map((key) => envNames[key] || key).join(', ');
    throw new Error(`環境変数が足りません: ${names}`);
  }
}

module.exports = { config, requireConfig, toBool, toInt };
