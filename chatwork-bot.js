const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const CHATWORK_TOKEN = process.env.CHATWORK_TOKEN;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

// Webhookエンドポイント
app.post('/webhook', async (req, res) => {
  try {
    const { webhook_event_id, account_id, from_account_id, body, room_id } = req.body;

    // メッセージ本文を取得
    if (!body) {
      return res.status(200).json({ status: 'ok' });
    }

    // "@Botti" で始まるメッセージのみ処理
    if (!body.includes('@Botti')) {
      return res.status(200).json({ status: 'ok' });
    }

    // @Botti を削除してAIに送信
    const userMessage = body.replace(/@Botti\s*/g, '').trim();

    // Claude APIに送信
    const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
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

    const aiResponse = claudeResponse.data.content[0].text;

    // Chatworkに返信
    await axios.post(
      `${CHATWORK_API_BASE}/rooms/${room_id}/messages`,
      { body: `[rp aid=${from_account_id}]\n${aiResponse}` },
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
  console.log(`Bot running on port ${PORT}`);
});
