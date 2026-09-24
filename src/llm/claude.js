'use strict';

const axios = require('axios');
const { config, requireConfig } = require('../config');

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

module.exports = { complete };
