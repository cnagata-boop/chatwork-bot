const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const CHATWORK_TOKEN = process.env.CHATWORK_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// 使用するAI（'openai' または 'claude'）。未指定ならOpenAIキーがあればOpenAIを使う
const AI_PROVIDER = (process.env.AI_PROVIDER || (OPENAI_API_KEY ? 'openai' : 'claude')).toLowerCase();
const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

// ChatGPT (OpenAI API) に送信
async function askChatGPT(userMessage) {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: OPENAI_MODEL,
    max_completion_tokens: 500,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  }, {
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    }
  });

  return response.data.choices[0].message.content;
}

// Claude APIに送信
async function askClaude(userMessage) {
  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-opus-4-1',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  }, {
    headers: {
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    }
  });

  return response.data.content[0].text;
}

function askAI(userMessage) {
  return AI_PROVIDER === 'openai' ? askChatGPT(userMessage) : askClaude(userMessage);
}

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
  try {
    // Chatwork Webhookはメッセージ情報を webhook_event の中に入れて送ってくる
    const event = req.body.webhook_event || req.body;
    const { from_account_id, body, room_id, message_id } = event;
    const isMention = req.body.webhook_event_type === 'mention_to_me';

    // メッセージ本文を取得
    if (!body) {
      return res.status(200).json({ status: 'ok' });
    }

    // Botへのメンション（[To:...]）または "@Botti" を含むメッセージのみ処理
    if (!isMention && !body.includes('@Botti')) {
      return res.status(200).json({ status: 'ok' });
    }

    // [To:...] / [rp ...] / @Botti を削除してAIに送信
    const userMessage = body
      .replace(/\[(To|rp)[^\]]*\]/g, '')
      .replace(/@Botti\s*/g, '')
      .trim();

    // AIに送信
    const aiResponse = await askAI(userMessage);

    // Chatworkに返信
    await axios.post(
      `${CHATWORK_API_BASE}/rooms/${room_id}/messages`,
      // Chatwork APIはフォーム形式で受け付ける
      new URLSearchParams({ body: `[rp aid=${from_account_id} to=${room_id}-${message_id}]\n${aiResponse}` }),
      {
        headers: {
          'X-ChatWorkToken': CHATWORK_TOKEN
        }
      }
    );

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot running on port ${PORT} (AI: ${AI_PROVIDER})`);
});
