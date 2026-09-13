'use strict';

const express = require('express');
const cron = require('node-cron');

const { config } = require('./src/config');
const { complete } = require('./src/claude');
const chatwork = require('./src/chatwork');
const pipeline = require('./src/pipeline');
const store = require('./src/store');
const log = require('./src/logger');

const app = express();
app.use(express.json());

const BOT = config.chatwork.botName;

/**
 * Chatwork の Webhook は
 *   { webhook_event: { body, room_id, account_id, ... } }
 * の形で飛んでくる。テスト用に平たいJSONも受けられるようにしておく。
 */
function normalizeEvent(payload = {}) {
  const event = payload.webhook_event || payload;
  return {
    body: event.body || '',
    roomId: event.room_id || payload.room_id,
    fromAccountId: event.account_id || event.from_account_id || payload.from_account_id,
    messageId: event.message_id,
  };
}

/** [To:...] や [rp aid=...] などのタグを落として素の文面にする */
function stripChatworkTags(body) {
  return body
    .replace(/\[(?:To|rp aid=|qt|piconname:)[^\]]*\]/g, ' ')
    .replace(/\[\/?[a-z]+\]/g, ' ')
    .replace(new RegExp(`@${BOT}`, 'g'), ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const noteCommands = {
  async 生成(_arg, ctx) {
    await chatwork.sendMessage('note の原稿を書いています。数分かかります。', ctx);
    await pipeline.runOnce({ notify: true });
    return null; // 結果は pipeline 側が通知する
  },

  async 公開(id, ctx) {
    if (!id) return '記事IDを付けてください（例: note 公開 p20260913-ab12）';
    await chatwork.sendMessage(`${id} を公開します。`, ctx);
    await pipeline.approve(id);
    return null;
  },

  async 却下(id) {
    if (!id) return '記事IDを付けてください（例: note 却下 p20260913-ab12）';
    const post = pipeline.reject(id);
    return `不採用にしました: ${post.title}`;
  },

  async 一覧() {
    const posts = store.listPosts({ limit: 10 });
    if (!posts.length) return 'まだ記事がありません。';
    const lines = posts.map((p) => `${p.id} [${p.status}] ${p.title}\n${p.publishedUrl || p.editUrl || ''}`);
    return `[info][title]note 記事一覧（最新10件）[/title]${lines.join('\n')}[/info]`;
  },

  async レポート() {
    return pipeline.buildReport({ days: 7 });
  },
};

const COMMAND_ALIASES = {
  作成: '生成', 書いて: '生成', new: '生成', generate: '生成',
  publish: '公開', approve: '公開',
  reject: '却下', 破棄: '却下',
  list: '一覧', 状況: '一覧',
  report: 'レポート', 成果: 'レポート',
};

/** note コマンドなら処理して true を返す */
async function handleNoteCommand(text, ctx) {
  const match = text.match(/^note\s+(\S+)\s*(.*)$/i);
  if (!match) return false;

  const name = COMMAND_ALIASES[match[1]] || match[1];
  const handler = noteCommands[name];
  if (!handler) {
    await chatwork.sendMessage(
      `使えるコマンド: note 生成 / note 公開 <ID> / note 却下 <ID> / note 一覧 / note レポート`,
      ctx,
    );
    return true;
  }

  try {
    const reply = await handler(match[2].trim(), ctx);
    if (reply) await chatwork.sendMessage(reply, ctx);
  } catch (error) {
    log.error(`note コマンド失敗: ${error.message}`);
    await chatwork.sendMessage(`note コマンドでエラーが出ました: ${error.message}`, ctx);
  }
  return true;
}

async function handleAiReply(text, ctx) {
  const answer = await complete({ prompt: text, maxTokens: 800 });
  await chatwork.sendMessage(answer, ctx);
}

async function processMessage(event) {
  const text = stripChatworkTags(event.body);
  if (!text) return;

  const ctx = { roomId: event.roomId, toAccountId: event.fromAccountId };

  if (await handleNoteCommand(text, ctx)) return;
  await handleAiReply(text, ctx);
}

app.post('/webhook', (req, res) => {
  const event = normalizeEvent(req.body);

  // note の投稿は数分かかるので、Webhook には先に 200 を返しておく
  res.status(200).json({ status: 'ok' });

  if (!event.body || !event.body.includes(`@${BOT}`)) return;

  processMessage(event).catch((error) => log.error(`処理に失敗: ${error.message}`));
});

/** 外部スケジューラ（cron-job.org / GitHub Actions など）から叩く用 */
app.post('/cron/post', (req, res) => {
  const token = req.get('x-cron-secret') || req.query.secret;
  if (config.schedule.secret && token !== config.schedule.secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.status(202).json({ status: 'accepted' });
  pipeline.runOnce().catch((error) => log.error(`自動投稿に失敗: ${error.message}`));
});

app.post('/cron/report', (req, res) => {
  const token = req.get('x-cron-secret') || req.query.secret;
  if (config.schedule.secret && token !== config.schedule.secret) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  res.status(202).json({ status: 'accepted' });
  pipeline.sendReport().catch((error) => log.error(`レポート送信に失敗: ${error.message}`));
});

app.get('/health', (_req, res) => {
  const posts = store.listPosts({ limit: 500 });
  res.json({
    status: 'ok',
    autoPost: config.schedule.enabled ? config.schedule.cron : 'disabled',
    publishMode: config.note.publishMode,
    posts: {
      total: posts.length,
      draft: posts.filter((p) => p.status === 'draft').length,
      published: posts.filter((p) => p.status === 'published').length,
    },
  });
});

if (config.schedule.enabled) {
  cron.schedule(
    config.schedule.cron,
    () => {
      log('定期実行: note の記事を作ります');
      pipeline.runOnce().catch((error) => log.error(`自動投稿に失敗: ${error.message}`));
    },
    { timezone: config.schedule.timezone },
  );
  log(`自動投稿を有効にしました（${config.schedule.cron} ${config.schedule.timezone}）`);
}

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => log(`Bot running on port ${PORT}`));
}

module.exports = { app, normalizeEvent, stripChatworkTags };
