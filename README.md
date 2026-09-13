# Botti — Chatwork Bot + note 自動投稿

Chatwork の AI ボットに、**note の記事を自動で書いて投稿する仕組み**を足したものです。

```
ネタ帳 ──▶ Claude が執筆 ──▶ 検品 ──▶ note に下書き保存 ──▶ Chatwork に通知
                                                   │
                                  「note 公開 <ID>」で公開 ─┘
```

既定では **下書きまで**しか進みません。中身を自分で見てから公開する運用が前提です
（丸投げの自動公開は note 側のスパム判定リスクがあり、収益にもつながりにくいため）。

## 3分セットアップ

```bash
npm install
npx playwright install chromium
cp env.example .env   # CLAUDE_API_KEY などを記入

npm run note:login    # ブラウザが開くので note にログイン（Cookieを保存）
npm run note -- generate   # まず原稿だけ見てみる（note には触らない）
npm run note:run           # 執筆して note に下書き保存
```

## よく使うコマンド

| コマンド | 何をするか |
| --- | --- |
| `npm run note:login` | ブラウザで手動ログインして Cookie を保存 |
| `npm run note:run` | ネタ出し→執筆→note に下書き保存（`--publish` で公開まで） |
| `npm run note -- generate` | 原稿だけ作って表示（note には投稿しない） |
| `npm run note:list` | これまでの記事と状態を一覧 |
| `npm run note -- publish <ID>` | 下書きを公開 |
| `npm run note -- topics --refill 10` | ネタ帳を Claude に補充させる |
| `npm run note:report` | PV・公開本数のレポート |
| `npm test` | 動作確認（API を叩かない範囲） |

## Chatwork から操作する

```
@Botti note 生成            … 記事を1本書いて下書き保存
@Botti note 公開 p20260913-ab12
@Botti note 却下 p20260913-ab12
@Botti note 一覧
@Botti note レポート
```

`note` で始まらないメッセージは、これまで通り Claude がそのまま返事します。

## 自動で回す

- **サーバ常駐**: `AUTO_POST_ENABLED=true` + `AUTO_POST_CRON=0 8 * * *`（Render 等）
- **GitHub Actions**: `.github/workflows/note-auto-post.yml`（毎日 8:00 JST）
- **外部スケジューラ**: `POST /cron/post`（ヘッダ `x-cron-secret`）

詳しい手順・小遣い稼ぎとしての設計・トラブル対応は **[NOTE_AUTOPOST.md](NOTE_AUTOPOST.md)** に書いてあります。
デプロイ手順は [DEPLOY.md](DEPLOY.md)。
