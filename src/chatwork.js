'use strict';

const axios = require('axios');
const { config } = require('./config');
const log = require('./logger');

const API_BASE = 'https://api.chatwork.com/v2';

/**
 * Chatwork にメッセージを送る。トークンや部屋IDが未設定なら黙ってスキップする
 * （Chatwork なしでも note 投稿だけ回せるようにするため）。
 */
async function sendMessage(body, { roomId = config.chatwork.roomId, toAccountId } = {}) {
  if (!config.chatwork.token || !roomId) {
    log.warn('Chatwork の設定がないので通知をスキップしました');
    return false;
  }

  const text = toAccountId ? `[rp aid=${toAccountId}]\n${body}` : body;

  try {
    await axios.post(
      `${API_BASE}/rooms/${roomId}/messages`,
      new URLSearchParams({ body: text }).toString(),
      {
        headers: {
          'X-ChatWorkToken': config.chatwork.token,
          'content-type': 'application/x-www-form-urlencoded',
        },
        timeout: 20000,
      },
    );
    return true;
  } catch (error) {
    log.error(`Chatwork 送信に失敗: ${error.message}`);
    return false;
  }
}

module.exports = { sendMessage, API_BASE };
