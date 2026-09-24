'use strict';

const { config } = require('../config');
const claude = require('./claude');
const gemini = require('./gemini');

const PROVIDERS = { claude, gemini };

/**
 * 使う AI を決める。LLM_PROVIDER で明示できるが、指定がなければ
 * 「置いてあるAPIキー」から判断する（無料の Gemini だけ入れた人がそのまま動くように）。
 */
function resolveProvider({ provider, claudeKey, geminiKey } = {}) {
  const explicit = (provider || '').toLowerCase();
  if (explicit) {
    if (!PROVIDERS[explicit]) {
      throw new Error(`LLM_PROVIDER が不正です: ${explicit}（claude か gemini）`);
    }
    return explicit;
  }
  if (geminiKey && !claudeKey) return 'gemini';
  return 'claude';
}

function currentProvider() {
  return resolveProvider({
    provider: config.llm.provider,
    claudeKey: config.claude.apiKey,
    geminiKey: config.gemini.apiKey,
  });
}

async function complete(options) {
  return PROVIDERS[currentProvider()].complete(options);
}

/**
 * 返答から JSON を取り出す。```json フェンスや前後の地の文があっても拾う。
 */
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error(`JSONが見つかりません: ${text.slice(0, 200)}`);

  const opening = candidate[start];
  const closing = opening === '{' ? '}' : ']';
  const end = candidate.lastIndexOf(closing);
  if (end === -1) throw new Error(`JSONが閉じていません: ${text.slice(0, 200)}`);

  return JSON.parse(candidate.slice(start, end + 1));
}

async function completeJson(options) {
  return extractJson(await complete(options));
}

module.exports = { complete, completeJson, extractJson, currentProvider, resolveProvider };
