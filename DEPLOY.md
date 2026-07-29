# Chatwork Bot デプロイ手順（Render.com版）

## 準備

### 1. APIトークン取得

**Chatwork APIトークン：**
- Chatwork管理画面 → サービス連携 → API
- APIトークンを発行・コピー

**Claude APIキー：**
- https://console.anthropic.com/account/keys
- APIキーを発行・コピー

### 2. GitHubにアップロード
```bash
# ローカルで実行
git init
git add .
git commit -m "Initial Chatwork Bot"
git remote add origin https://github.com/YOU/chatwork-bot.git
git push -u origin main
```

### 3. Render.comでデプロイ

1. https://render.com にアクセス → 無料アカウント作成
2. **New → Web Service**
3. GitHubリポジトリを接続
4. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. **Environment Variables** に追加：
   ```
   CHATWORK_TOKEN=（コピペ）
   CLAUDE_API_KEY=（コピペ）
   ```
6. **Create Web Service** → デプロイ完了

**デプロイURLが取得される** → これをChatwork Webhook URLに設定

### 4. Chatwork Webhook設定

- Webhook URL: `https://your-service-name.onrender.com/webhook`
- Webhook名: `Botti`
- イベント: `アカウントイベント`
- 保存

### 5. 使用方法

Chatworkで：
```
@Botti 来週の予定をまとめて
```

→ Botが自動応答 ✓

---

## トラブル対応

**Botが応答しない場合：**
- Render ログ確認 → Messages タブ
- `curl -X POST https://your-url/webhook -d '{"body":"test"}' -H 'Content-Type: application/json'`

**料金：**
- Render: $7/月（無料枠は2つまで）
- Claude API: 使用量に応じて課金（従量制）
