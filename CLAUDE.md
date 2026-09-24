# このリポジトリについて

note の記事を AI に書かせて自動投稿するツール。リポジトリ名は旧 Chatwork ボット時代のもので、
中身は入れ替わっている（旧ボットのコードは git 履歴のみ）。

## 構成

```
src/cli.js        コマンドの入口（npm run note -- <command>）
src/pipeline.js   ネタ出し→執筆→投稿→お知らせ の流れ
src/generator.js  記事の生成と検品（validate が品質の最後の砦）
src/topics.js     ネタ帳。使ったネタは state.json に記録して二度選ばない
src/llm/          記事を書く AI。claude と gemini を置いてあるキーで切り替える
src/note/         Playwright による note 操作。selectors.js が画面変更時の修正点
src/notify.js     お知らせ（既定はログのみ。LINE / Webhook は任意）
src/doctor.js     セットアップの点検
src/server.js     常駐させる場合の定期実行と HTTP エンドポイント
src/store.js      記事の履歴（data/state.json）
```

## 決めごと

- **既定は下書きまで。** 公開は人が判断する（`NOTE_PUBLISH_MODE=publish` で全自動にもできる）。
- **通知は既定でオフ。** 何も設定していなければ外部に一切送らない。
- **note に投稿APIはない**ため、ブラウザ操作で自分のアカウントを動かしている。
  画面変更で壊れるのは想定内で、`src/note/selectors.js` の候補を足せば直るようにしてある。
- **利用者は開発者ではない。** エラーメッセージには必ず「次に何をすればよいか」を書く。
- ドキュメントとコメントは日本語。

## 作業するとき

```bash
npm test                      # 外部APIを叩かない範囲の確認
npm run note:doctor           # 設定の点検
npm run note -- generate      # note に触らず記事だけ生成（APIキーが要る）
npm run note -- check-note    # 投稿せず note の画面だけ確認（ログインが要る）
```

外部サービス（note / Claude / Gemini）への接続は手元でしか確認できない。
テストはそれらを叩かない範囲に保つこと。
