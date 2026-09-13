'use strict';

const axios = require('axios');
const { config, requireConfig } = require('./config');

const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Claude Messages API を1回叩いてテキストを返す。
 */
async function complete({ system, prompt, maxTokens, model, temperature } = {}) {
  requireConfig(['claude.apiKey']);

  const body = {
    model: model || config.claude.model,
    max_tokens: maxTokens || config.claude.maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (system) body.system = system;
  if (temperature !== undefined) body.temperature = temperature;

  const res = await axios.post(API_URL, body, {
    headers: {
      'x-api-key': config.claude.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    timeout: 180000,
  });

  return (res.data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
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
  const text = await complete(options);
  return extractJson(text);
}

module.exports = { complete, completeJson, extractJson };
