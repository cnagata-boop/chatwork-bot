'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync('/tmp/note-test-');

const generator = require('../src/generator');
const store = require('../src/store');
const { notify, trimForLine, LINE_MAX_CHARS } = require('../src/notify');
const pipeline = require('../src/pipeline');
const { app } = require('../src/server');

test('タグは # を外して重複を消し、上限で切る', () => {
  const tags = generator.normalizeTags(['#経理', '経理', 'AI 活用', '', 'a', 'b', 'c', 'd']);
  assert.strictEqual(tags[0], '経理');
  assert.strictEqual(tags[1], 'AI活用');
  assert.ok(tags.length <= 5);
});

test('検品は短すぎる原稿と定型文をはじく', () => {
  const short = { title: 'テストのタイトルです', body: 'あ'.repeat(100), tags: ['経理'] };
  assert.ok(generator.validate(short).some((p) => p.includes('本文が短すぎます')));

  const cliche = { title: 'テストのタイトルです', body: `${'あ'.repeat(2000)}いかがでしたか`, tags: ['経理'] };
  assert.ok(generator.validate(cliche).some((p) => p.includes('定型文')));

  const ok = { title: 'テストのタイトルです', body: 'あ'.repeat(2000), tags: ['経理'] };
  assert.deepStrictEqual(generator.validate(ok), []);
});

test('本文の整形で余分な空行と強調記号を落とす', () => {
  assert.strictEqual(generator.normalizeBody('**太字**\n\n\n\n次の段落  '), '太字\n\n次の段落');
});

test('記事を保存して状態を更新できる', () => {
  const post = store.addPost({ topic: 'ネタ', title: 'タイトル', body: '本文', tags: ['経理'] });
  assert.strictEqual(post.status, 'draft');

  store.updatePost(post.id, { status: 'published', publishedUrl: 'https://note.com/x/n/y' });
  assert.strictEqual(store.getPost(post.id).status, 'published');
  assert.ok(store.usedTopics().includes('ネタ'));
});

test('通知先が未設定ならログに出すだけで落ちない', async () => {
  const result = await notify('テスト', ['1行目']);
  assert.strictEqual(result.sent, false);
  assert.match(result.text, /テスト\n1行目/);
});

test('LINE の文字数上限で切り詰める', () => {
  assert.strictEqual(trimForLine('短い文'), '短い文');
  const long = trimForLine('あ'.repeat(LINE_MAX_CHARS + 500));
  assert.strictEqual(long.length, LINE_MAX_CHARS);
  assert.ok(long.endsWith('…'));
});

test('下書きのお知らせに note のURLが入る（スマホからそのまま開ける）', () => {
  const lines = pipeline.draftLines({
    id: 'p1',
    topic: 'ネタ',
    summary: '要約',
    tags: ['経理'],
    editUrl: 'https://note.com/notes/n123/edit',
  });
  assert.ok(lines.includes('https://note.com/notes/n123/edit'));
});

test('/health が記事の状況を返す', async () => {
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(body.status, 'ok');
    assert.strictEqual(body.publishMode, 'draft');
    assert.ok(body.posts.total >= 1);
  } finally {
    server.close();
  }
});

test('合言葉が設定されていれば /cron/post は弾かれる', async () => {
  const { config } = require('../src/config');
  const original = config.schedule.secret;
  config.schedule.secret = 'himitsu';
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/cron/post`, { method: 'POST' });
    assert.strictEqual(res.status, 401);
  } finally {
    config.schedule.secret = original;
    server.close();
  }
});
