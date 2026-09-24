'use strict';

const axios = require('axios');
const { config, requireConfig } = require('../config');

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini API を1回叩いてテキストを返す。
 * Google AI Studio の無料枠（Flash系）で動かせるので、稼ぐまでの期間はこちらで回せる。
 */
async function complete({ system, prompt, maxTokens, model, temperature } = {}) {
  requireConfig(['gemini.apiKey']);

  const name = model || config.gemini.model;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: maxTokens || config.gemini.maxTokens,
      ...(temperature !== undefined ? { temperature } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await axios.post(`${API_BASE}/models/${name}:generateContent`, body, {
      headers: { 'content-type': 'application/json', 'x-goog-api-key': config.gemini.apiKey },
      timeout: 180000,
    });
  } catch (error) {
    const status = error.response && error.response.status;
    if (status === 404) {
      throw new Error(
        `モデル "${name}" が見つかりません。`
          + '`npm run note -- models` で使えるモデル名を確認し、GEMINI_MODEL に設定してください。',
      );
    }
    if (status === 429) {
      throw new Error('Gemini の無料枠の上限に当たりました。時間をおいて実行してください。');
    }
    throw error;
  }

  const candidate = (res.data.candidates || [])[0];
  if (!candidate) {
    const reason = res.data.promptFeedback && res.data.promptFeedback.blockReason;
    throw new Error(`Gemini が応答を返しませんでした${reason ? `（${reason}）` : ''}`);
  }

  return ((candidate.content && candidate.content.parts) || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
}

/** 使えるモデル名の一覧。無料枠で使えるものを選ぶために使う。 */
async function listModels() {
  requireConfig(['gemini.apiKey']);
  const res = await axios.get(`${API_BASE}/models`, {
    headers: { 'x-goog-api-key': config.gemini.apiKey },
    timeout: 60000,
  });
  return (res.data.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => ({
      name: String(m.name || '').replace(/^models\//, ''),
      displayName: m.displayName,
    }));
}

module.exports = { complete, listModels };
