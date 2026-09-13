'use strict';

const { config } = require('./config');
const { completeJson } = require('./claude');
const log = require('./logger');

const PAID_MARKER = '───ここから有料エリア───';

const SYSTEM_PROMPT = [
  'あなたは日本語で note の記事を書くプロのライターです。',
  '守ること:',
  '- 実務で手を動かした人にしか書けない具体性（手順・数字・失敗例）を入れる',
  '- 事実をでっち上げない。法令・料金・仕様など変わりやすい数字は「2024年時点」等と断るか、断定を避ける',
  '- 「いかがでしたか」「本記事では〜について解説します」のような中身のない定型文を書かない',
  '- AIが書いたことを匂わせる免責や、記事と関係ない前置きを書かない',
  '- 誇大な収益保証や、根拠のない断定をしない',
].join('\n');

function buildPrompt(topic) {
  const { persona, audience, tone, minChars, maxChars } = config.content;
  const paid = config.content.paidEnabled;

  return [
    `書き手の設定: ${persona}`,
    `読者: ${audience}`,
    `文体: ${tone}`,
    `記事のテーマ: ${topic}`,
    '',
    `本文は${minChars}〜${maxChars}文字。見出し（## ）を3〜5個使い、各見出しの下に2〜4段落を書いてください。`,
    '箇条書きは「- 」で始めてください。マークダウンの強調（**）やリンク記法は使わないでください。',
    paid
      ? [
          '記事は無料パートと有料パートに分けてください。',
          `無料パートだけで読者が「何が問題か」を理解でき、有料パートに具体的な手順やテンプレートが来る構成にします。`,
          `有料パートの前に、区切り行として「${PAID_MARKER}」だけの行を1行入れてください。`,
        ].join('\n')
      : '',
    '',
    '出力は次のJSONだけ。前後に説明を書かないこと。',
    '{',
    '  "title": "30文字前後。読者の困りごとか数字が入った具体的なタイトル",',
    '  "body": "本文。改行は \\n 。マークダウンの見出しは ## 、箇条書きは - 。",',
    '  "tags": ["ハッシュタグ", "5個まで", "#は付けない"],',
    '  "summary": "本文の要点を80文字以内で"',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeBody(body) {
  return String(body)
    .replace(/\r\n/g, '\n')
    .replace(/\*\*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();
}

function normalizeTags(tags) {
  return [...new Set((tags || [])
    .filter((t) => typeof t === 'string')
    .map((t) => t.replace(/^#/, '').replace(/\s+/g, '').trim())
    .filter(Boolean))]
    .slice(0, config.note.maxTags);
}

/**
 * 出来上がりが投稿に耐えるかの最低限チェック。
 * 落ちたら理由を返す（呼び出し側で再生成・通知に使う）。
 */
function validate(article) {
  const problems = [];
  const len = article.body.replace(/\s/g, '').length;

  if (!article.title || article.title.length < 8) problems.push('タイトルが短すぎます');
  if (article.title && article.title.length > 60) problems.push('タイトルが長すぎます（60文字超）');
  if (len < config.content.minChars * 0.6) problems.push(`本文が短すぎます（${len}文字）`);
  if (!article.tags.length) problems.push('ハッシュタグがありません');
  if (/いかがでしたか/.test(article.body)) problems.push('中身のない定型文（いかがでしたか）が含まれます');
  if (config.content.paidEnabled && !article.body.includes(PAID_MARKER)) {
    problems.push('有料エリアの区切り行がありません');
  }
  return problems;
}

/**
 * ネタから記事を1本生成する。検品に落ちたら1回だけ書き直させる。
 */
async function generateArticle(topic, { retries = 1 } = {}) {
  let lastProblems = [];

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const prompt = attempt === 0
      ? buildPrompt(topic)
      : `${buildPrompt(topic)}\n\n前回の原稿は次の点で不合格でした。直して書き直してください:\n- ${lastProblems.join('\n- ')}`;

    const raw = await completeJson({ system: SYSTEM_PROMPT, prompt, temperature: 1 });

    const article = {
      topic,
      title: String(raw.title || '').trim(),
      body: normalizeBody(raw.body || ''),
      tags: normalizeTags(raw.tags),
      summary: String(raw.summary || '').trim(),
      paid: Boolean(config.content.paidEnabled),
    };

    if (config.note.footer) {
      article.body = `${article.body}\n\n${config.note.footer}`;
    }

    lastProblems = validate(article);
    if (!lastProblems.length) return article;

    log.warn(`原稿の検品に落ちました(${attempt + 1}回目): ${lastProblems.join(' / ')}`);
  }

  const error = new Error(`原稿が検品を通りませんでした: ${lastProblems.join(' / ')}`);
  error.problems = lastProblems;
  throw error;
}

module.exports = { generateArticle, validate, normalizeBody, normalizeTags, PAID_MARKER };
