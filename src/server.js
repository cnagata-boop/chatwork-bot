'use strict';

const express = require('express');
const cron = require('node-cron');

const { config } = require('./config');
const pipeline = require('./pipeline');
const store = require('./store');
const log = require('./logger');

const app = express();
app.use(express.json());

/** /cron/* を外から叩かせる場合の合言葉チェック */
function checkSecret(req, res) {
  const token = req.get('x-cron-secret') || req.query.secret;
  if (config.schedule.secret && token !== config.schedule.secret) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

app.get('/health', (_req, res) => {
  const posts = store.listPosts({ limit: 500 });
  res.json({
    status: 'ok',
    autoPost: config.schedule.enabled ? `${config.schedule.cron} (${config.schedule.timezone})` : 'disabled',
    publishMode: config.note.publishMode,
    posts: {
      total: posts.length,
      draft: posts.filter((p) => p.status === 'draft').length,
      published: posts.filter((p) => p.status === 'published').length,
      failed: posts.filter((p) => p.status === 'failed').length,
    },
    lastPost: posts[0] ? { id: posts[0].id, title: posts[0].title, status: posts[0].status } : null,
  });
});

/** 下書き一覧（公開待ちの確認用） */
app.get('/drafts', (req, res) => {
  if (!checkSecret(req, res)) return;
  res.json(
    store.listPosts({ status: 'draft', limit: 50 }).map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      editUrl: p.editUrl,
      createdAt: p.createdAt,
    })),
  );
});

/** 記事を1本作る（外部スケジューラ用） */
app.post('/cron/post', (req, res) => {
  if (!checkSecret(req, res)) return;
  res.status(202).json({ status: 'accepted' });
  pipeline.runOnce().catch((error) => log.error(`自動投稿に失敗: ${error.message}`));
});

/** 成果レポートを出す */
app.post('/cron/report', (req, res) => {
  if (!checkSecret(req, res)) return;
  res.status(202).json({ status: 'accepted' });
  pipeline.sendReport().catch((error) => log.error(`レポートに失敗: ${error.message}`));
});

/** 下書きを公開する */
app.post('/posts/:id/publish', (req, res) => {
  if (!checkSecret(req, res)) return;
  pipeline
    .approve(req.params.id)
    .then((post) => res.json({ status: 'published', url: post.publishedUrl || post.editUrl }))
    .catch((error) => res.status(400).json({ error: error.message }));
});

function startSchedule() {
  if (!config.schedule.enabled) return null;
  const task = cron.schedule(
    config.schedule.cron,
    () => {
      log('定期実行: note の記事を作ります');
      pipeline.runOnce().catch((error) => log.error(`自動投稿に失敗: ${error.message}`));
    },
    { timezone: config.schedule.timezone },
  );
  log(`自動投稿を有効にしました（${config.schedule.cron} ${config.schedule.timezone}）`);
  return task;
}

if (require.main === module) {
  startSchedule();
  const port = process.env.PORT || 3000;
  app.listen(port, () => log(`note 自動投稿サーバを起動しました: port ${port}`));
}

module.exports = { app, startSchedule };
