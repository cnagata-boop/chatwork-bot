#!/usr/bin/env node
'use strict';

const pipeline = require('./pipeline');
const store = require('./store');
const topicsLib = require('./topics');
const noteClient = require('./note/client');
const { fetchStats } = require('./note/stats');
const log = require('./logger');

function parseArgs(argv) {
  const args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args.flags[key] = true;
      } else {
        args.flags[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

const HELP = `
note 自動投稿ツール

  npm run note -- <コマンド> [オプション]

コマンド:
  login                     ブラウザを開いて note に手動ログインし、Cookieを保存する
  run [--publish] [--dry-run] [--topic "ネタ"]
                            ネタ出し→執筆→note投稿まで1本流す（既定は下書きまで）
  generate [--topic "ネタ"] 原稿だけ作って画面に出す（note には触らない）
  show <id>                 保存した原稿の中身を表示する
  list [--status draft] [--limit 20]
                            これまでの記事を一覧する
  publish <id>              下書きを公開する
  reject <id>               下書きを不採用にする
  topics [--refill 10] [--add "ネタ"]
                            ネタ帳の確認・補充・追加
  stats                     note の PV などを取得する
  report [--send] [--days 7]
                            成果レポートを作る（--send で通知先にも流す）
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || 'help';

  switch (command) {
    case 'login': {
      await noteClient.interactiveLogin();
      log('完了しました。以後はこのCookieで自動投稿できます');
      break;
    }

    case 'run': {
      const post = await pipeline.runOnce({
        publish: args.flags.publish === true,
        dryRun: args.flags['dry-run'] === true,
        topic: typeof args.flags.topic === 'string' ? args.flags.topic : undefined,
      });
      console.log(`\n${post.status}: ${post.title}`);
      console.log(post.publishedUrl || post.editUrl || '(未投稿)');
      console.log(`ID: ${post.id}`);
      break;
    }

    case 'generate': {
      const post = await pipeline.runOnce({
        dryRun: true,
        topic: typeof args.flags.topic === 'string' ? args.flags.topic : undefined,
      });
      console.log(`\n# ${post.title}\n`);
      console.log(post.body);
      console.log(`\nタグ: ${post.tags.join(' / ')}`);
      console.log(`ID: ${post.id}`);
      break;
    }

    case 'show': {
      const post = store.getPost(args._[1]);
      if (!post) throw new Error(`記事が見つかりません: ${args._[1]}`);
      console.log(`# ${post.title}\n`);
      console.log(post.body);
      console.log(`\nタグ: ${(post.tags || []).join(' / ')}`);
      console.log(`状態: ${post.status}  URL: ${post.publishedUrl || post.editUrl || '-'}`);
      break;
    }

    case 'list': {
      const posts = store.listPosts({
        status: typeof args.flags.status === 'string' ? args.flags.status : undefined,
        limit: parseInt(args.flags.limit, 10) || 20,
      });
      if (!posts.length) {
        console.log('まだ記事がありません');
        break;
      }
      for (const post of posts) {
        const when = post.createdAt.slice(0, 16).replace('T', ' ');
        console.log(`${post.id}  ${post.status.padEnd(9)} ${when}  ${post.title}`);
      }
      break;
    }

    case 'publish': {
      const post = await pipeline.approve(args._[1]);
      console.log(`公開しました: ${post.publishedUrl || post.editUrl}`);
      break;
    }

    case 'reject': {
      const post = pipeline.reject(args._[1]);
      console.log(`不採用にしました: ${post.title}`);
      break;
    }

    case 'topics': {
      if (typeof args.flags.add === 'string') {
        topicsLib.addTopics([args.flags.add]);
        console.log('ネタを追加しました');
      }
      if (args.flags.refill) {
        const count = parseInt(args.flags.refill, 10) || 10;
        const fresh = await topicsLib.generateTopics(count);
        console.log(`${fresh.length}件補充しました`);
      }
      const used = new Set(store.usedTopics());
      const all = topicsLib.loadTopics();
      console.log(`\nネタ帳: ${all.length}件（未使用 ${all.filter((t) => !used.has(t)).length}件）`);
      all.filter((t) => !used.has(t)).slice(0, 20).forEach((t) => console.log(`- ${t}`));
      break;
    }

    case 'stats': {
      const stats = await fetchStats();
      if (!stats) {
        console.log('統計を取得できませんでした（`npm run note:login` でログインし直してください）');
        break;
      }
      console.log(`記事数: ${stats.noteCount}`);
      console.log(`合計PV: ${stats.total.pv} / スキ: ${stats.total.likes} / コメント: ${stats.total.comments}`);
      stats.top.forEach((t, i) => console.log(`${i + 1}. ${t.name}（${t.pv}PV / ♡${t.likes}）`));
      break;
    }

    case 'report': {
      const days = parseInt(args.flags.days, 10) || 7;
      const text = args.flags.send ? await pipeline.sendReport({ days }) : await pipeline.buildReport({ days });
      if (!args.flags.send) console.log(text);
      break;
    }

    default:
      console.log(HELP);
  }
}

main().catch((error) => {
  log.error(error.message);
  process.exitCode = 1;
});
