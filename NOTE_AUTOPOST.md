# note 自動投稿で小遣いを稼ぐ仕組み

## 1. 何が動くのか

```
data/topics.json        ネタ帳（自分で足す or Claude が補充）
      │
      ▼  src/topics.js       まだ書いていないネタを1つ選ぶ
      ▼  src/generator.js    Claude が本文・タイトル・ハッシュタグを書く
      ▼                      検品（文字数・定型文・タグの有無）に落ちたら書き直し
      ▼  src/note/client.js  Playwright が note のエディタを操作して下書き保存
      ▼  src/chatwork.js     「下書きできました」を Chatwork に通知
      ▼  「note 公開 <ID>」  → 公開。URL が Chatwork に返る
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
| `chatwork-bot.js` | Webhook・定期実行・`/cron/*` |

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
CHATWORK_TOKEN=...        # 通知が要らなければ空でOK
CHATWORK_ROOM_ID=...      # 同上
```

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
| 承認制（既定・推奨） | `NOTE_PUBLISH_MODE=draft` | 中身を見てから出したい。Chatwork で `note 公開 <ID>` |
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
| `CHATWORK_TOKEN` / `CHATWORK_ROOM_ID` | 通知先（任意） |

**C. 外部スケジューラ**

```
POST https://<your-app>/cron/post     ヘッダ: x-cron-secret: <CRON_SECRET>
POST https://<your-app>/cron/report   週1のレポート用
```

## 4. 小遣いになるまでの設計

note でお金が入る経路は主に4つ。**記事を出すこと自体はお金にならない**ので、
どれに載せるかを先に決めてから回してください。

| 経路 | 仕込み方 | 現実的な感覚 |
| --- | --- | --- |
| 有料記事 | `CONTENT_PAID=true`。無料パートで課題、有料パートで手順・テンプレ | 300円×月10本売れて3,000円。最初の数か月はほぼ売れない |
| メンバーシップ・マガジン | `NOTE_FOOTER` に毎回の導線を入れる | 記事数が溜まってから効く |
| サポート（投げ銭） | 実体験・失敗談の記事に付きやすい | おまけ程度 |
| 外部リンク（Amazonアソシエイト等） | `NOTE_FOOTER` に入れる。各サービスの規約に従うこと | 書評・道具紹介系なら現実的 |
| 仕事の問い合わせ | プロフィールと footer に連絡先 | 単価が一番大きい。本業がある人はここが本命 |

**コストの目安**: Claude で1記事あたりおよそ 5〜15円（2,000〜3,000文字の場合、モデルと長さによる）。
月30本でも数百円。サーバ代のほうが高いので、GitHub Actions で回すのが一番安く済みます。

**効く順番**:
1. テーマを1つに絞る（`CONTENT_THEME`）。雑多だと読者がつかない
2. 自分の実務が入ったネタを `data/topics.json` に足す。AI 任せのネタは薄くなりがち
3. 出した記事の PV を `npm run note:report` で見て、読まれたテーマの周辺を厚くする
4. 読まれる記事が出てきてから有料パートやメンバーシップを付ける

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
| 同じようなネタばかり出る | `data/state.json` が消えていないか確認（サーバなら永続ディスク、Actions ならキャッシュ） |

## 8. 自分好みにする

- テーマ・読者・文体 … `.env` の `CONTENT_*`
- 記事の型（見出し数・構成）… `src/generator.js` の `buildPrompt`
- 検品ルール … 同ファイルの `validate`
- Chatwork のコマンド … `chatwork-bot.js` の `noteCommands`
