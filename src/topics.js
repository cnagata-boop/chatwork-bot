'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('./config');
const { completeJson } = require('./claude');
const store = require('./store');
const log = require('./logger');

const USER_TOPICS_PATH = path.join(config.dataDir, 'topics.json');
const SEED_TOPICS_PATH = path.join(__dirname, '..', 'data', 'topics.seed.json');

function readTopicsFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const topics = Array.isArray(parsed) ? parsed : parsed.topics;
    return Array.isArray(topics) ? topics.filter((t) => typeof t === 'string' && t.trim()) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') log.warn(`${file} を読めません: ${error.message}`);
    return [];
  }
}

/** data/topics.json（自分で足したネタ）と seed を合わせたネタ帳 */
function loadTopics() {
  const merged = [...readTopicsFile(USER_TOPICS_PATH), ...readTopicsFile(SEED_TOPICS_PATH)];
  return [...new Set(merged)];
}

function saveUserTopics(topics) {
  const unique = [...new Set(topics.map((t) => t.trim()).filter(Boolean))];
  fs.writeFileSync(USER_TOPICS_PATH, `${JSON.stringify({ topics: unique }, null, 2)}\n`, 'utf8');
  return unique;
}

function addTopics(newTopics) {
  return saveUserTopics([...readTopicsFile(USER_TOPICS_PATH), ...newTopics]);
}

/** Claude にネタを出させてネタ帳に足す */
async function generateTopics(count = 10) {
  const used = store.usedTopics().slice(0, 40);
  const { theme, audience } = config.content;

  const data = await completeJson({
    maxTokens: 1500,
    temperature: 1,
    prompt: [
      `あなたは「${theme}」の分野で note を書いている書き手です。`,
      `読者は${audience}です。`,
      '検索や回遊で読まれやすく、実務経験がないと書けない具体的な記事ネタを考えてください。',
      used.length ? `ただし次のネタは既に書いたので避けてください:\n- ${used.join('\n- ')}` : '',
      `${count}件、次の形式のJSONだけを出力してください。`,
      '{"topics": ["ネタ1", "ネタ2"]}',
      'ネタは20〜40文字程度の日本語で、読者の困りごとが分かる書き方にしてください。',
    ]
      .filter(Boolean)
      .join('\n'),
  });

  const topics = (data.topics || []).filter((t) => typeof t === 'string' && t.trim());
  if (!topics.length) throw new Error('ネタを生成できませんでした');
  addTopics(topics);
  return topics;
}

/**
 * まだ書いていないネタを1件返す。在庫が切れたら Claude に補充させる。
 */
async function pickTopic({ autoRefill = true } = {}) {
  const used = new Set(store.usedTopics());
  const available = loadTopics().filter((t) => !used.has(t));
  if (available.length) return available[0];

  if (!autoRefill) return null;
  log('ネタ帳が空になったので補充します');
  const fresh = await generateTopics(10);
  const stillUsed = new Set(store.usedTopics());
  return fresh.find((t) => !stillUsed.has(t)) || fresh[0];
}

module.exports = {
  USER_TOPICS_PATH,
  loadTopics,
  addTopics,
  generateTopics,
  pickTopic,
};
