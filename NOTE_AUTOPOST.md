# note 自動投稿で小遣いを稼ぐ仕組み

## 1. 何が動くのか

```
data/topics.json        ネタ帳（自分で足す or Claude が補充）
      │
      ▼  src/topics.js       まだ書いていないネタを1つ選ぶ
      ▼  src/generator.js    Claude が本文・タイトル・ハッシュタグを書く
      ▼                      検品（文字数・定型文・タグの有無）に落ちたら書き直し
      ▼  src/note/client.js  Playwright が note のエディタを操作して下書き保存
      ▼  src/notify.js       結果をログに残す（通知は既定でオフ）
      ▼  note のアプリか npm run note -- publish <ID>  → 公開
```

| ファイル | 役割 |
| --- | --- |
| `src/cli.js` | コマンドの入口 |
| `src/pipeline.js` | ネタ出し〜投稿〜通知の流れ |
| `src/generator.js` | 記事の生成と検品 |
| `src/topics.js` | ネタ帳の管理・補充 |
| `src/note/client.js` | note のブラウザ操作（ログイン・下書き・公開） |
| `src/note/selectors.js` | note の画面が変わったときに直す場所 |
| `src/note/stats.js` | PV などの取得 |
| `src/store.js` | 書いた記事の履歴（`data/state.json`） |
| `src/notify.js` | お知らせ（既定はログのみ。LINE や Webhook を設定すればそこへ） |
| `src/server.js` | 常駐させる場合の定期実行と `/health`・`/cron/*` |

note には記事投稿の公開 API がないため、ブラウザ操作（Playwright）で自分のアカウントを動かしています。
つまり **自分の手作業を自動化している**だけで、note の非公開APIを叩いて投稿しているわけではありません。

## 2. セットアップ

```bash
npm install
npx playwright install chromium     # 初回のみ
cp env.example .env
```

`.env` に最低限これだけ入れれば動きます。

```
CLAUDE_API_KEY=sk-ant-...
```

これだけで動きます。通知は既定でオフで、外部には何も送りません。

### 毎朝の確認（通知なし運用）

スマホの note アプリを開き、「下書き」に入っている今日の記事を読んで、よければ公開ボタンを押します。
通知サービスの登録は要りません。

PC からは `npm run note:drafts` で公開待ちの下書きがURL付きで出ます。
GitHub Actions で回している場合は、実行結果のページ（Actions タブ → 実行をクリック）に
その日の下書きURLが残り、失敗したときだけ GitHub から自動でメールが届きます。

### 通知が欲しくなったら（任意）

**LINE に送る**

1. https://developers.line.biz/console/ に LINE アカウントでログイン
2. プロバイダーを作る → **Messaging API** のチャネルを1つ作る
3. チャネルの画面にあるQRコードを、自分のスマホの LINE で友だち追加する
4. 「Messaging API設定」タブ → **チャネルアクセストークン（長期）** を発行してコピー
5. `.env` に貼って、`npm run note -- notify-test` で届くか確認

```
LINE_CHANNEL_ACCESS_TOKEN=（コピーしたトークン）
LINE_TO=                    # 空のままでよい（友だち全員＝自分に届く）
```

`LINE_TO` を空にすると「友だち全員に送る」動きになるので、ユーザーIDを調べる手間が省けます。
同じチャネルを他人に友だち追加させないでください。
旧 LINE Notify は2025年3月末で終了しているため、上の Messaging API を使います。
無料枠は月200通程度なので1日1通知なら収まります（最新の条件は LINE の公式情報で確認してください）。

**Slack / Discord に送る**

Incoming Webhook の URL を `NOTIFY_WEBHOOK_URL` に入れるだけです。

### note にログインする

```bash
npm run note:login
```

ブラウザが開くので、いつも通りログインしてください（2段階認証もここで通ります）。
`data/note-auth.json` に Cookie が保存され、以後の投稿はこれを使います。
Cookie が切れたら同じコマンドをもう一度実行します。

2段階認証を使っていなければ `NOTE_EMAIL` / `NOTE_PASSWORD` を `.env` に入れておくと、
Cookie が切れたときに自動で入り直します。

### まず1本、目で見る

```bash
npm run note -- generate     # note には一切触らず、原稿だけ表示
npm run note:run             # 気に入ったら下書き保存まで
```

## 3. 運用モードを決める

| モード | 設定 | 向いている人 |
| --- | --- | --- |
| 承認制（既定・推奨） | `NOTE_PUBLISH_MODE=draft` | 中身を見てから出したい。`npm run note -- publish <ID>` で公開 |
| 全自動 | `NOTE_PUBLISH_MODE=publish` | 毎日回して量を出したい。ただし事故が表に出る |
| 有料記事 | `CONTENT_PAID=true` | 無料パート＋有料パート構成で書く。値段設定は note の画面で手動（自動公開はしない） |

### 毎日自動で回す

**A. サーバ常駐（Render など）**

```
AUTO_POST_ENABLED=true
AUTO_POST_CRON=0 8 * * *
TZ=Asia/Tokyo
```

`data/` を永続ディスクに置いてください（`DATA_DIR=/var/data`）。
ここに Cookie と記事履歴が入っているので、消えると同じネタを書き直します。

**B. GitHub Actions（サーバ不要・無料枠でいける）**

`.github/workflows/note-auto-post.yml` が毎日 8:00 JST に1本作ります。
リポジトリの Secrets にこれらを登録してください。

```bash
# Cookie をシークレットに入れる形に変換
base64 -w0 data/note-auth.json    # mac は base64 -i data/note-auth.json
```

| Secret | 中身 |
| --- | --- |
| `CLAUDE_API_KEY` | Claude の API キー |
| `NOTE_AUTH_STATE_B64` | 上の base64 |
| `LINE_CHANNEL_ACCESS_TOKEN` | 通知を使う場合だけ（任意） |

**C. 外部スケジューラ / 手元の cron**

```
# サーバを立てている場合
POST https://<your-app>/cron/post     ヘッダ: x-cron-secret: <CRON_SECRET>
POST https://<your-app>/cron/report   週1のレポート用

# PC の cron で回すだけでもよい（毎朝8時に1本）
0 8 * * * cd /path/to/note-auto-post && /usr/bin/npm run note:run >> data/cron.log 2>&1
```

## 4. 小遣いになるまでの設計

**個人アカウントで、自分の財布から払う読者を相手にする**前提の設計です。
既定のターゲットは「社員数人の会社のひとり社長・個人事業主で、経理を自分でやっている人」。
読む人と払う人が同じなので、有料記事やメンバーシップがそのまま収益になります。

会社の経理担当者（会社員）は読者としては多いのですが、会社の経費では買えず自腹になるため
購入率が落ちます。同業（会計事務所の人）は一番読んでくれますが、ほぼ収益になりません。
どちらも「読まれた」に惑わされないよう、`npm run note:report` の数字は購入と分けて見てください。

| 経路 | 仕込み方 | 現実的な感覚 |
| --- | --- | --- |
| 有料記事 | `CONTENT_PAID=true`。無料パートで課題、有料パートで手順・テンプレ | 300円×月10本で3,000円。最初の数か月はほぼ売れない |
| メンバーシップ | `NOTE_FOOTER` に毎回の導線を入れ、テンプレを配る | 記事が20〜30本たまってから効く。積み上がると一番安定する |
| サポート（投げ銭） | 実体験・失敗談の記事に付きやすい | おまけ程度 |
| 外部リンク（Amazonアソシエイト等） | `NOTE_FOOTER` に入れる。各サービスの規約に従うこと | 道具紹介系なら現実的 |

**コストの目安**: Claude で1記事あたりおよそ 5〜15円（2,000〜3,000文字の場合、モデルと長さによる）。
月30本でも数百円。サーバ代のほうが高いので、GitHub Actions で回すのが一番安く済みます。

**効く順番**:
1. テーマを1つに絞る（`CONTENT_THEME`）。雑多だと読者がつかない
2. 自分の実務が入ったネタを `data/topics.json` に足す。AI 任せのネタは薄くなりがち
3. 出した記事の PV を `npm run note:report` で見て、読まれたテーマの周辺を厚くする
4. 読まれる記事が20本ほど出てきてから、有料パートとメンバーシップを付ける

**書ける範囲**: 個人アカウントでも、勤務先や顧問先の具体例は書けません（業種と地域で特定されます）。
「よくあるパターン」まで抽象化してから書いてください。また、個別の税務判断に踏み込まず、
手順・段取り・ツールの使い方に寄せるほうが安全です（判断は「顧問税理士に確認を」で止める）。
既定の `CONTENT_PERSONA` はこの前提で書くようになっています。

## 5. 品質を落とさないための仕掛け

- **検品**（`src/generator.js` の `validate`）: 文字数不足・「いかがでしたか」等の空虚な定型文・タグなしを弾き、1回だけ書き直させます
- **ネタの重複防止**: 書いたネタは `data/state.json` に記録され、二度選ばれません
- **人の目**: 既定が下書き止まりなのはこのためです。最低限、数字と固有名詞だけは自分で確認してください

## 6. 気をつけること

- **note の規約**: 自分のアカウントに自分のコンテンツを投稿する自動化ですが、**中身のない記事の大量投稿はスパム扱いの対象**です。1日1本を上限の目安に、質が落ちたら止めてください
- **AI生成である旨**: 全文 AI 生成をそのまま出す場合、その旨を書いておくほうが読者との揉め事を避けられます
- **事実確認**: 法令・料金・仕様の数字は AI が間違えます。断定的な記述は必ず一次情報で確認を
- **著作権・実在の人や会社**: 生成物に実在の固有名詞が入っていないか目を通してください
- **Cookie の扱い**: `data/note-auth.json` は note にログインできる鍵そのものです。`.gitignore` 済みですが、共有しないこと

## 7. うまく動かないとき

| 症状 | 対処 |
| --- | --- |
| `ログインしていません` | `npm run note:login` をやり直す。Cookie は数週間で切れます |
| `エディタのタイトル欄が見つかりません` | note の画面変更。`src/note/selectors.js` のセレクタを追加すれば直ります |
| 投稿が途中で止まる | `data/shots/` に失敗時のスクリーンショットが残ります。`NOTE_HEADLESS=false` で動きを目視できます |
| 見出しや箇条書きが反映されない | エディタの入力は1行ずつ打って書式ショートカットを効かせています。`NOTE_SLOW_MO=50` を試してください |
| 統計が取れない | note 側の内部APIの仕様変更。取れなくても投稿自体は動きます |
| 今日の記事が見つからない | `npm run note:drafts`、または note アプリの「下書き」を見る |
| LINE が届かない | `npm run note -- notify-test` で確認。トークンの貼り間違いか、公式アカウントを友だち追加していないことが大半 |
| 同じようなネタばかり出る | `data/state.json` が消えていないか確認（サーバなら永続ディスク、Actions ならキャッシュ） |

## 8. 自分好みにする

- テーマ・読者・文体 … `.env` の `CONTENT_*`
- 記事の型（見出し数・構成）… `src/generator.js` の `buildPrompt`
- 検品ルール … 同ファイルの `validate`
- お知らせの出し先 … `src/notify.js`
- サーバのエンドポイント … `src/server.js`
