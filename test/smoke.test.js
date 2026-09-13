'use strict';

const test = require('node:test');
const assert = require('node:assert');

process.env.DATA_DIR = process.env.DATA_DIR || require('node:fs').mkdtempSync('/tmp/note-test-');

const { stripChatworkTags, normalizeEvent } = require('../chatwork-bot');
const generator = require('../src/generator');
const store = require('../src/store');

test('Chatwork のタグを落として素の文面にする', () => {
  assert.strictEqual(stripChatworkTags('[To:123]@Botti note 公開 p1'), 'note 公開 p1');
  assert.strictEqual(stripChatworkTags('[rp aid=9]@Botti  こんにちは '), 'こんにちは');
});

test('Webhook は入れ子でも平たくても読める', () => {
  const nested = normalizeEvent({ webhook_event: { body: 'a', room_id: 1, account_id: 2 } });
  assert.deepStrictEqual(nested, { body: 'a', roomId: 1, fromAccountId: 2, messageId: undefined });

  const flat = normalizeEvent({ body: 'b', room_id: 3, from_account_id: 4 });
  assert.strictEqual(flat.roomId, 3);
  assert.strictEqual(flat.fromAccountId, 4);
});

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

test('記事を保存して状態を更新できる', () => {
  const post = store.addPost({ topic: 'ネタ', title: 'タイトル', body: '本文', tags: ['経理'] });
  assert.strictEqual(post.status, 'draft');

  store.updatePost(post.id, { status: 'published', publishedUrl: 'https://note.com/x/n/y' });
  assert.strictEqual(store.getPost(post.id).status, 'published');
  assert.ok(store.usedTopics().includes('ネタ'));
});
