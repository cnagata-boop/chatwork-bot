# デプロイ手順

サーバを立てなくても **GitHub Actions か手元の cron** で回せます（下の「2. サーバを使わない」参照）。
毎日決まった時間に自動で動かしたい、という程度ならそちらで十分です。

## 0. 事前準備

**Claude APIキー**
- https://console.anthropic.com/account/keys で発行

**note のログイン情報（Cookie）**
```bash
npm install
npx playwright install chromium
npm run note:login                 # ブラウザで note にログイン
base64 -w0 data/note-auth.json     # mac は base64 -i data/note-auth.json
```
出てきた文字列をシークレット `NOTE_AUTH_STATE_B64` として使います。

## 1. Render.com で常駐させる

1. https://render.com でアカウント作成 → **New → Web Service**
2. GitHub リポジトリを接続
3. 設定：
   - **Build Command**: `npm install && npx playwright install --with-deps chromium`
   - **Start Command**: `npm start`
   - **Disk**: マウント先 `/var/data`（Cookie と記事履歴の保存先。無いと毎回同じネタを書きます）
4. **Environment Variables**：
   ```
   CLAUDE_API_KEY=（コピペ）
   NOTE_AUTH_STATE_B64=（上で作った文字列）
   DATA_DIR=/var/data
   NOTE_PUBLISH_MODE=draft
   AUTO_POST_ENABLED=true
   AUTO_POST_CRON=0 8 * * *
   TZ=Asia/Tokyo
   CRON_SECRET=（任意の文字列）
   ```
5. **Create Web Service** → デプロイ

確認とふだんの操作：

```bash
curl https://your-service.onrender.com/health
curl -H "x-cron-secret: <CRON_SECRET>" https://your-service.onrender.com/drafts
curl -X POST -H "x-cron-secret: <CRON_SECRET>" https://your-service.onrender.com/posts/<ID>/publish
```

**料金**: Render は $7/月（無料枠はスリープするので定期実行が飛びます）。
Claude API は1記事あたり5〜15円程度の従量課金。

## 2. サーバを使わない

**GitHub Actions**（無料枠で足ります）

リポジトリの Settings → Secrets に `CLAUDE_API_KEY` と `NOTE_AUTH_STATE_B64`
（LINE通知を使うなら `LINE_CHANNEL_ACCESS_TOKEN` も）を登録すれば、
`.github/workflows/note-auto-post.yml` が毎日 8:00 JST に1本作ります。
手動で流したいときは Actions タブから「note 自動投稿」→ Run workflow。

**手元の PC の cron**

```
0 8 * * * cd /path/to/note-auto-post && /usr/bin/npm run note:run >> data/cron.log 2>&1
```

## 3. トラブル対応

| 症状 | 対処 |
| --- | --- |
| `note にログインしていません` | Cookie の期限切れ。`npm run note:login` → `NOTE_AUTH_STATE_B64` を入れ直す |
| ブラウザが起動しない | Build Command の `npx playwright install --with-deps chromium` を確認 |
| 同じネタばかり書く | `DATA_DIR` が永続ディスクを向いているか確認（`data/state.json` が消えている） |
| 投稿が途中で止まる | `data/shots/` のスクリーンショットを確認。詳細は [NOTE_AUTOPOST.md](NOTE_AUTOPOST.md) |

※ 以前あった Chatwork ボットのデプロイ手順は git の履歴に残っています（`git show 5deafb2:DEPLOY.md`）。
