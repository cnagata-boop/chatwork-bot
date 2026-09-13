'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { config, requireConfig } = require('../config');
const S = require('./selectors');
const log = require('../logger');

const SHOT_DIR = path.join(config.dataDir, 'shots');

/**
 * GitHub Actions などでは Cookie を base64 のシークレットで渡す。
 * NOTE_AUTH_STATE_B64 があればファイルに書き戻す。
 */
function materializeAuthState() {
  const b64 = process.env.NOTE_AUTH_STATE_B64;
  if (!b64 || fs.existsSync(config.note.authStatePath)) return;
  fs.mkdirSync(path.dirname(config.note.authStatePath), { recursive: true });
  fs.writeFileSync(config.note.authStatePath, Buffer.from(b64, 'base64').toString('utf8'), 'utf8');
  log('NOTE_AUTH_STATE_B64 からログイン状態を復元しました');
}

function hasAuthState() {
  materializeAuthState();
  return fs.existsSync(config.note.authStatePath);
}

async function openBrowser({ headless = config.note.headless } = {}) {
  materializeAuthState();

  const browser = await chromium.launch({
    headless,
    slowMo: config.note.slowMo,
    executablePath: config.note.browserPath || undefined,
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 1280, height: 900 },
    storageState: hasAuthState() ? config.note.authStatePath : undefined,
  });
  context.setDefaultTimeout(config.note.timeoutMs);

  return { browser, context };
}

async function saveAuthState(context) {
  fs.mkdirSync(path.dirname(config.note.authStatePath), { recursive: true });
  await context.storageState({ path: config.note.authStatePath });
  log(`ログイン状態を保存しました: ${config.note.authStatePath}`);
}

async function screenshot(page, label) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const file = path.join(SHOT_DIR, `${Date.now()}-${label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    log.warn(`画面を保存しました: ${file}`);
    return file;
  } catch (_) {
    return null;
  }
}

/** 候補セレクタを上から試して、最初に見つかったものを返す */
async function firstVisible(page, selectors, { timeout = 8000 } = {}) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: timeout / selectors.length });
      return locator;
    } catch (_) {
      // 次の候補へ
    }
  }
  return null;
}

/** ボタン名の候補を上から試してクリック */
async function clickByText(page, names, { timeout = 10000 } = {}) {
  for (const name of names) {
    const candidates = [
      page.getByRole('button', { name, exact: false }),
      page.getByRole('link', { name, exact: false }),
      page.locator(`text="${name}"`),
    ];
    for (const locator of candidates) {
      const target = locator.first();
      try {
        await target.waitFor({ state: 'visible', timeout: timeout / (names.length * 3) });
        await target.click();
        return name;
      } catch (_) {
        // 次の候補へ
      }
    }
  }
  return null;
}

async function isLoggedIn(page) {
  await page.goto(S.urls.top, { waitUntil: 'domcontentloaded' });
  const marker = await firstVisible(page, S.loggedInMarkers, { timeout: 8000 });
  return Boolean(marker);
}

async function loginWithPassword(page) {
  requireConfig(['note.email', 'note.password']);
  log('メールアドレスとパスワードでログインします');

  await page.goto(S.urls.login, { waitUntil: 'domcontentloaded' });

  const email = await firstVisible(page, S.login.email);
  const password = await firstVisible(page, S.login.password);
  if (!email || !password) throw new Error('ログインフォームが見つかりません（画面構成が変わった可能性）');

  await email.fill(config.note.email);
  await password.fill(config.note.password);
  await clickByText(page, S.login.submit);
  await page.waitForLoadState('networkidle').catch(() => {});

  if (!(await isLoggedIn(page))) {
    await screenshot(page, 'login-failed');
    throw new Error(
      'ログインできませんでした。2段階認証やreCAPTCHAが出ている可能性があります。' +
        '`npm run note:login` で手動ログインしてCookieを保存してください。',
    );
  }
  log('ログインしました');
}

async function ensureLoggedIn(context, page) {
  if (await isLoggedIn(page)) return;

  if (!config.note.email || !config.note.password) {
    throw new Error('note にログインしていません。`npm run note:login` を実行してください。');
  }
  await loginWithPassword(page);
  await saveAuthState(context);
}

/**
 * note のエディタは ProseMirror。1行ずつ打つと「## 」などのショートカットが効いて
 * 見出し・箇条書きになる。fill() だと書式が付かないので使わない。
 */
async function typeBody(page, body) {
  const editor = await firstVisible(page, S.editor.body);
  if (!editor) throw new Error('本文エリアが見つかりません');

  await editor.click();
  const lines = body.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim()) {
      await page.keyboard.type(line, { delay: 1 });
    }
    // 空行でも Enter は打つ。箇条書きや引用から抜けるのがこの操作なので省略しない
    if (i < lines.length - 1) {
      await page.keyboard.press('Enter');
    }
  }
}

async function addHashtags(page, tags) {
  if (!tags || !tags.length) return;
  const input = await firstVisible(page, S.editor.hashtagInput, { timeout: 6000 });
  if (!input) {
    log.warn('ハッシュタグ入力欄が見つかりませんでした。タグなしで進めます');
    return;
  }
  for (const tag of tags) {
    await input.click();
    await page.keyboard.type(tag, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }
}

/**
 * 記事を下書きとして保存する。
 * @returns {Promise<{editUrl: string}>}
 */
async function createDraft(page, article) {
  log(`下書きを作成します: ${article.title}`);
  await page.goto(S.urls.newNote, { waitUntil: 'domcontentloaded' });

  const title = await firstVisible(page, S.editor.title);
  if (!title) {
    await screenshot(page, 'editor-not-found');
    throw new Error('エディタのタイトル欄が見つかりません（note の画面構成が変わった可能性）');
  }

  await title.click();
  await page.keyboard.type(article.title, { delay: 5 });
  await typeBody(page, article.body);

  const clicked = await clickByText(page, S.editor.saveDraft);
  if (!clicked) {
    await screenshot(page, 'save-draft-not-found');
    throw new Error('「下書き保存」ボタンが見つかりません');
  }

  await page.waitForTimeout(2500);
  await page.waitForURL(/note\.com\/notes\/.+/, { timeout: 15000 }).catch(() => {});

  const editUrl = page.url();
  log(`下書きを保存しました: ${editUrl}`);
  return { editUrl };
}

/**
 * エディタを開いている状態から公開まで進める。
 * @returns {Promise<{publishedUrl: string|null}>}
 */
async function publishCurrent(page, { tags = [] } = {}) {
  const proceeded = await clickByText(page, S.editor.proceedToPublish);
  if (!proceeded) {
    await screenshot(page, 'publish-step-not-found');
    throw new Error('「公開に進む」が見つかりません');
  }
  await page.waitForTimeout(1500);

  await addHashtags(page, tags);

  const published = await clickByText(page, S.editor.publish, { timeout: 15000 });
  if (!published) {
    await screenshot(page, 'publish-button-not-found');
    throw new Error('「投稿する」が見つかりません（下書きは残っています）');
  }

  await page.waitForTimeout(4000);
  await page.waitForURL(/note\.com\/[^/]+\/n\/[^/]+/, { timeout: 20000 }).catch(() => {});

  const url = page.url();
  const publishedUrl = /\/n\//.test(url) ? url.replace(/\/edit.*$/, '') : null;
  log(publishedUrl ? `公開しました: ${publishedUrl}` : '公開処理は通りましたがURLを取得できませんでした');
  return { publishedUrl };
}

/**
 * 記事を投稿する（既定は下書きまで）。
 * @param {{title: string, body: string, tags: string[], paid?: boolean}} article
 * @param {{publish?: boolean}} options
 */
async function postArticle(article, { publish = false } = {}) {
  const { browser, context } = await openBrowser();
  try {
    const page = await context.newPage();
    await ensureLoggedIn(context, page);

    const { editUrl } = await createDraft(page, article);
    let publishedUrl = null;

    if (publish) {
      ({ publishedUrl } = await publishCurrent(page, { tags: article.tags }));
    }

    await saveAuthState(context);
    return { editUrl, publishedUrl };
  } finally {
    await browser.close();
  }
}

/** 既存の下書きを開いて公開する */
async function publishDraft(editUrl, tags = []) {
  const { browser, context } = await openBrowser();
  try {
    const page = await context.newPage();
    await ensureLoggedIn(context, page);
    await page.goto(editUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const result = await publishCurrent(page, { tags });
    await saveAuthState(context);
    return result;
  } finally {
    await browser.close();
  }
}

/** ブラウザを目の前で開いて、人間がログインし終わるのを待つ（2段階認証もこれで通る） */
async function interactiveLogin({ waitMs = 240000 } = {}) {
  const { browser, context } = await openBrowser({ headless: false });
  try {
    const page = await context.newPage();
    await page.goto(S.urls.login, { waitUntil: 'domcontentloaded' });
    log('ブラウザで note にログインしてください（最大4分待ちます）');

    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3000);
      if (await isLoggedIn(page)) {
        await saveAuthState(context);
        return true;
      }
    }
    throw new Error('時間内にログインが確認できませんでした');
  } finally {
    await browser.close();
  }
}

module.exports = {
  openBrowser,
  saveAuthState,
  hasAuthState,
  ensureLoggedIn,
  isLoggedIn,
  createDraft,
  publishCurrent,
  publishDraft,
  postArticle,
  interactiveLogin,
  firstVisible,
  clickByText,
};
