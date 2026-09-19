# note 自動投稿ツール

**note の記事を Claude に書かせて、自動で投稿する仕組み**です。外部サービスへの連携は不要で、
手元（またはサーバ・GitHub Actions）だけで完結します。

```
ネタ帳 ──▶ Claude が執筆 ──▶ 検品 ──▶ note に下書き保存
                                            │
        朝、note アプリの「下書き」を開いて読む ─┘ → よければ公開ボタン
```

通知は既定でオフです。外部サービスの登録も設定も要りません。

既定では **下書きまで**しか進みません。中身を自分で見てから公開する運用が前提です
（丸投げの自動公開は note 側のスパム判定リスクがあり、収益にもつながりにくいため）。

## 3分セットアップ

```bash
npm install
npx playwright install chromium
cp env.example .env         # CLAUDE_API_KEY を記入

npm run note:login          # ブラウザが開くので note にログイン（Cookieを保存）
npm run note -- generate    # まず原稿だけ見てみる（note には触らない）
npm run note:run            # 執筆して note に下書き保存
```

## よく使うコマンド

| コマンド | 何をするか |
| --- | --- |
| `npm run note:login` | ブラウザで手動ログインして Cookie を保存 |
| `npm run note:run` | ネタ出し→執筆→note に下書き保存（`--publish` で公開まで） |
| `npm run note -- generate` | 原稿だけ作って表示（note には投稿しない） |
| `npm run note:list` | これまでの記事と状態を一覧 |
| `npm run note -- show <ID>` | 原稿の中身を表示 |
| `npm run note -- publish <ID>` | 下書きを公開 |
| `npm run note -- reject <ID>` | 下書きを不採用にする |
| `npm run note -- topics --refill 10` | ネタ帳を Claude に補充させる |
| `npm run note:report` | PV・公開本数のレポート |
| `npm run note:drafts` | 公開待ちの下書きをURL付きで表示 |
| `npm run note -- notify-test` | 通知を設定した場合に、届くか試す |
| `npm test` | 動作確認（外部APIを叩かない範囲） |

## 自動で回す

- **GitHub Actions**（サーバ不要）: `.github/workflows/note-auto-post.yml`（毎日 8:00 JST）
- **サーバ常駐**: `npm start` + `AUTO_POST_ENABLED=true` / `AUTO_POST_CRON=0 8 * * *`
- **外部スケジューラ**: `POST /cron/post`（ヘッダ `x-cron-secret`）

## 毎朝やること

スマホの note アプリを開く → 「下書き」に今日の記事がある → 読む → 公開ボタン。以上です。

PC から確認したいときは：

```bash
npm run note:drafts    # 公開待ちの下書きをURL付きで表示
```

GitHub Actions で回している場合は、実行結果のページにその日の下書きURLが残ります
（Actions タブ → 実行をクリック）。失敗したときだけ GitHub から自動でメールが届きます。

通知を使いたくなったら `LINE_CHANNEL_ACCESS_TOKEN`（LINE）か `NOTIFY_WEBHOOK_URL`
（Slack / Discord）を `.env` に足すだけで有効になります。手順は
[NOTE_AUTOPOST.md](NOTE_AUTOPOST.md) に書いてあります。

詳しい手順・小遣い稼ぎとしての設計・トラブル対応は **[NOTE_AUTOPOST.md](NOTE_AUTOPOST.md)**、
サーバへのデプロイは [DEPLOY.md](DEPLOY.md) を見てください。

---

`chatwork-bot.js` はこのリポジトリに元からあった Chatwork ボットです。note の仕組みからは
一切参照していません。使わないなら削除して構いません。
