'use strict';

/**
 * note.com は画面がちょくちょく変わる。壊れたらこのファイルだけ直せば済むように、
 * 「候補を上から順に試す」方式で1か所に集めてある。
 */
module.exports = {
  urls: {
    top: 'https://note.com/',
    login: 'https://note.com/login',
    newNote: 'https://note.com/notes/new',
  },

  loggedInMarkers: [
    'a[href="/notes/new"]',
    'a[href*="/settings/account"]',
    '[data-testid="header-user-menu"]',
    'button[aria-label*="アカウント"]',
  ],

  login: {
    email: ['#email', 'input[name="email"]', 'input[type="email"]', 'input[placeholder*="mail"]'],
    password: ['#password', 'input[name="password"]', 'input[type="password"]'],
    submit: ['ログイン'],
  },

  editor: {
    title: [
      'textarea[placeholder*="記事タイトル"]',
      'textarea[placeholder*="タイトル"]',
      '[data-testid="note-title"] textarea',
      'textarea',
    ],
    body: [
      'div.ProseMirror[contenteditable="true"]',
      '[data-testid="note-body"] [contenteditable="true"]',
      'div[contenteditable="true"]',
    ],
    saveDraft: ['下書き保存', '保存'],
    proceedToPublish: ['公開に進む', '公開設定', '次へ'],
    hashtagInput: [
      'input[placeholder*="ハッシュタグ"]',
      'input[placeholder*="ハッシュタグを追加"]',
      'input[placeholder*="タグ"]',
    ],
    publish: ['投稿する', '公開する', '有料エリア設定を確認して投稿する'],
    publishedMarkers: ['記事を投稿しました', 'おめでとう', 'シェア'],
  },

  stats: {
    // note の内部API。認証済みCookieで叩ける。仕様変更で落ちても致命傷にならない使い方にする。
    pv: 'https://note.com/api/v1/stats/pv?filter=all&page=1&sort=pv',
    me: 'https://note.com/api/v2/current_user',
  },
};
