'use strict';

const { openBrowser } = require('./client');
const S = require('./selectors');
const log = require('../logger');

/**
 * note のダッシュボード相当の数字（PV・スキ・コメント）をまとめて取る。
 * 内部APIなので仕様変更で落ちうる。落ちても null を返すだけで止めない。
 */
async function fetchStats() {
  let browser;
  try {
    const opened = await openBrowser();
    browser = opened.browser;
    const { context } = opened;

    const res = await context.request.get(S.stats.pv, {
      headers: { accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    });
    if (!res.ok()) {
      log.warn(`統計APIが ${res.status()} を返しました`);
      return null;
    }

    const json = await res.json();
    const notes = (json && json.data && json.data.note_stats) || [];
    const total = notes.reduce(
      (acc, note) => ({
        pv: acc.pv + (note.read_count || 0),
        likes: acc.likes + (note.like_count || 0),
        comments: acc.comments + (note.comment_count || 0),
      }),
      { pv: 0, likes: 0, comments: 0 },
    );

    const top = [...notes]
      .sort((a, b) => (b.read_count || 0) - (a.read_count || 0))
      .slice(0, 5)
      .map((n) => ({ name: n.name, pv: n.read_count || 0, likes: n.like_count || 0 }));

    return { total, top, noteCount: notes.length, fetchedAt: new Date().toISOString() };
  } catch (error) {
    log.warn(`統計を取得できませんでした: ${error.message}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = { fetchStats };
