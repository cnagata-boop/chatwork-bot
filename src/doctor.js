'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config } = require('./config');
const { resolveProvider } = require('./llm');
const store = require('./store');
const topics = require('./topics');

const DAY_MS = 24 * 60 * 60 * 1000;

/** ファイルの更新からの経過日数。無ければ null */
function fileAgeDays(file) {
  try {
    return Math.floor((Date.now() - fs.statSync(file).mtimeMs) / DAY_MS);
  } catch (_) {
    return null;
  }
}

/** 記事を書く AI の準備ができているか */
function checkAi() {
  const hasClaude = Boolean(config.claude.apiKey);
  const hasGemini = Boolean(config.gemini.apiKey);

  if (!hasClaude && !hasGemini) {
    return {
      name: '記事を書くAI',
      ok: false,
      detail: 'APIキーが未設定',
      hint: '無料で始めるなら https://aistudio.google.com/apikey でキーを取り、.env の GEMINI_API_KEY に貼る',
    };
  }

  const provider = resolveProvider({
    provider: config.llm.provider,
    claudeKey: config.claude.apiKey,
    geminiKey: config.gemini.apiKey,
  });
  const model = provider === 'gemini' ? config.gemini.model : config.claude.model;

  return {
    name: '記事を書くAI',
    ok: true,
    detail: `${provider} / ${model}${provider === 'gemini' ? '（無料枠で回せます）' : '（従量課金）'}`,
  };
}

/** note を操作するブラウザが入っているか */
function checkBrowser() {
  const custom = config.note.browserPath;
  const file = custom || chromium.executablePath();

  if (file && fs.existsSync(file)) {
    return { name: 'ブラウザ(Chromium)', ok: true, detail: file };
  }
  return {
    name: 'ブラウザ(Chromium)',
    ok: false,
    detail: '見つかりません',
    hint: 'npx playwright install chromium を実行する',
  };
}

/** note のログイン状態（Cookie）が生きているか */
function checkNoteAuth() {
  const file = config.note.authStatePath;
  const age = fileAgeDays(file);

  if (age === null) {
    return {
      name: 'note のログイン',
      ok: false,
      detail: '未ログイン',
      hint: 'npm run note:login を実行してブラウザでログインする',
    };
  }
  if (age > 21) {
    return {
      name: 'note のログイン',
      ok: false,
      detail: `${age}日前のCookie。切れている可能性が高い`,
      hint: 'npm run note:login をやり直す',
    };
  }
  return { name: 'note のログイン', ok: true, detail: `${age}日前に保存` };
}

/** 書くネタが残っているか */
function checkTopics() {
  const used = new Set(store.usedTopics());
  const remaining = topics.loadTopics().filter((t) => !used.has(t)).length;

  if (remaining === 0) {
    return {
      name: 'ネタ帳',
      ok: true,
      detail: '在庫なし（次回の実行時にAIが自動で補充します）',
    };
  }
  return { name: 'ネタ帳', ok: true, detail: `未使用 ${remaining}件` };
}

/** 履歴の保存先に書き込めるか（サーバ運用で永続ディスクを忘れると同じネタを書き続ける） */
function checkDataDir() {
  try {
    const probe = path.join(config.dataDir, '.write-test');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return { name: '保存先', ok: true, detail: config.dataDir };
  } catch (error) {
    return {
      name: '保存先',
      ok: false,
      detail: `${config.dataDir} に書けません（${error.code || error.message}）`,
      hint: 'DATA_DIR を書き込めるパスにする',
    };
  }
}

/** 公開の設定と、自動実行の設定 */
function checkMode() {
  const posts = store.listPosts({ limit: 500 });
  const drafts = posts.filter((p) => p.status === 'draft').length;
  const published = posts.filter((p) => p.status === 'published').length;

  return [
    {
      name: '公開のしかた',
      ok: true,
      detail: config.note.publishMode === 'publish'
        ? '生成から公開まで自動（NOTE_PUBLISH_MODE=publish）'
        : '下書きで止める（あなたが公開ボタンを押す）',
    },
    {
      name: 'これまでの記事',
      ok: true,
      detail: `公開 ${published}本 / 公開待ちの下書き ${drafts}本`,
    },
  ];
}

/** すべての点検結果を集める */
function collect() {
  return [checkAi(), checkBrowser(), checkNoteAuth(), checkTopics(), checkDataDir(), ...checkMode()];
}

/** 点検結果を画面に出す形にする */
function format(checks) {
  const lines = checks.map((c) => {
    const mark = c.ok ? '✓' : '✗';
    const hint = c.ok || !c.hint ? '' : `\n    → ${c.hint}`;
    return `${mark} ${c.name}: ${c.detail}${hint}`;
  });

  const failed = checks.filter((c) => !c.ok);
  lines.push('');
  lines.push(
    failed.length
      ? `${failed.length}件、対応が必要です。上の → を順にやってください。`
      : 'すべて準備できています。npm run note:run で1本作れます。',
  );
  return lines.join('\n');
}

module.exports = { collect, format, fileAgeDays };
