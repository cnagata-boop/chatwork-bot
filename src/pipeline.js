'use strict';

const { config } = require('./config');
const topics = require('./topics');
const generator = require('./generator');
const store = require('./store');
const { notify } = require('./notify');
const noteClient = require('./note/client');
const { fetchStats } = require('./note/stats');
const log = require('./logger');

const truncate = (text, len) => (text && text.length > len ? `${text.slice(0, len)}…` : text || '');

function draftLines(post) {
  return [
    `要約: ${truncate(post.summary, 120)}`,
    `タグ: ${(post.tags || []).join(' / ')}`,
    post.paid
      ? `※有料記事の構成です。値段の設定は note の画面で行ってください（想定 ${config.content.paidPrice}円）`
      : '',
    '',
    '▼ 中身を見て、よければ note の「公開」ボタンを押してください',
    post.editUrl || '(下書きURLなし)',
    '',
    `PCから公開する場合: npm run note -- publish ${post.id}`,
  ];
}

function publishedLines(post) {
  return [
    `URL: ${post.publishedUrl || post.editUrl}`,
    `タグ: ${(post.tags || []).join(' / ')}`,
  ];
}

/**
 * ネタ出し → 執筆 → note 投稿 までを1本流す。
 * @param {{publish?: boolean, dryRun?: boolean, topic?: string, notify?: boolean}} options
 */
async function runOnce(options = {}) {
  const { dryRun = false, notify: shouldNotify = true } = options;
  const publish = options.publish !== undefined
    ? options.publish
    : config.note.publishMode === 'publish';

  const topic = options.topic || (await topics.pickTopic());
  if (!topic) throw new Error('書くネタがありません（data/topics.json を確認してください）');
  log(`今回のネタ: ${topic}`);

  const article = await generator.generateArticle(topic);
  log(`原稿ができました: ${article.title}（${article.body.length}文字）`);

  const post = store.addPost({
    topic,
    title: article.title,
    body: article.body,
    tags: article.tags,
    summary: article.summary,
    paid: article.paid,
    status: dryRun ? 'generated' : 'posting',
  });

  if (dryRun) {
    log('dry-run なので note には投稿しません');
    return post;
  }

  // 有料記事は値段の設定が画面でしかできないので、自動公開はせず必ず下書きで止める
  const shouldPublish = publish && !article.paid;
  if (publish && article.paid) {
    log.warn('有料記事のため自動公開はせず下書きで止めます');
  }

  try {
    const { editUrl, publishedUrl } = await noteClient.postArticle(article, { publish: shouldPublish });
    const updated = store.updatePost(post.id, {
      editUrl,
      publishedUrl,
      status: publishedUrl ? 'published' : 'draft',
      publishedAt: publishedUrl ? new Date().toISOString() : null,
    });

    if (shouldNotify) {
      await (updated.publishedUrl
        ? notify(`note に公開しました: ${updated.title}`, publishedLines(updated))
        : notify(`note の下書きができました: ${updated.title}`, draftLines(updated)));
    }
    return updated;
  } catch (error) {
    const failed = store.updatePost(post.id, { status: 'failed', error: error.message });
    if (shouldNotify) {
      await notify('note の投稿に失敗しました', [
        `記事: ${post.title}`,
        `理由: ${error.message}`,
        `原稿は残っています。中身は npm run note -- show ${post.id}`,
      ]);
    }
    error.post = failed;
    throw error;
  }
}

/** 下書きを公開する */
async function approve(id, { notify: shouldNotify = true } = {}) {
  const post = store.getPost(id);
  if (!post) throw new Error(`記事が見つかりません: ${id}`);
  if (post.status === 'published') return post;
  if (!post.editUrl) throw new Error(`下書きURLがありません: ${id}`);

  const { publishedUrl } = await noteClient.publishDraft(post.editUrl, post.tags);
  const updated = store.updatePost(id, {
    status: 'published',
    publishedUrl,
    publishedAt: new Date().toISOString(),
  });
  if (shouldNotify) await notify(`note に公開しました: ${updated.title}`, publishedLines(updated));
  return updated;
}

/** 下書きを採用しないことにする（note 側の下書きは残る） */
function reject(id) {
  const post = store.getPost(id);
  if (!post) throw new Error(`記事が見つかりません: ${id}`);
  return store.updatePost(id, { status: 'rejected' });
}

const REPORT_TITLE = 'note 自動投稿レポート';

/** 直近の成果（公開本数・PVなど）をまとめる */
async function buildReportLines({ days = 7 } = {}) {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const posts = store.listPosts({ limit: 200 }).filter((p) => new Date(p.createdAt).getTime() >= since);

  const published = posts.filter((p) => p.status === 'published');
  const drafts = posts.filter((p) => p.status === 'draft');
  const failed = posts.filter((p) => p.status === 'failed');

  const stats = await fetchStats();
  const lines = [
    `期間: 直近${days}日`,
    `公開: ${published.length}本 / 下書き待ち: ${drafts.length}本 / 失敗: ${failed.length}本`,
  ];

  if (stats) {
    lines.push(
      `全記事の合計PV: ${stats.total.pv} / スキ: ${stats.total.likes} / コメント: ${stats.total.comments}`,
      '',
      '読まれている記事:',
      ...stats.top.map((t, i) => `${i + 1}. ${truncate(t.name, 40)}（${t.pv}PV / ♡${t.likes}）`),
    );
  } else {
    lines.push('※note の統計は取得できませんでした（ログイン切れの可能性）');
  }

  if (drafts.length) {
    lines.push('', '公開待ちの下書き:', ...drafts.map((d) => `- ${d.id} ${truncate(d.title, 40)}`));
  }

  return lines;
}

async function buildReport(options) {
  return [REPORT_TITLE, ...(await buildReportLines(options))].join('\n');
}

async function sendReport(options) {
  const lines = await buildReportLines(options);
  await notify(REPORT_TITLE, lines);
  return [REPORT_TITLE, ...lines].join('\n');
}

module.exports = {
  runOnce,
  approve,
  reject,
  buildReport,
  buildReportLines,
  sendReport,
  draftLines,
  publishedLines,
};
