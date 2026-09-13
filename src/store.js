'use strict';

const fs = require('fs');
const path = require('path');
const { config } = require('./config');

const STATE_PATH = path.join(config.dataDir, 'state.json');

const EMPTY_STATE = {
  posts: [],
  usedTopics: [],
  lastRunAt: null,
};

function readState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    return { ...EMPTY_STATE, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`state.json を読めませんでした: ${error.message}`);
    }
    return { ...EMPTY_STATE };
  }
}

function writeState(state) {
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, STATE_PATH);
}

function update(mutator) {
  const state = readState();
  const result = mutator(state);
  writeState(state);
  return result;
}

function newId() {
  const d = new Date();
  const ymd = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = Math.random().toString(36).slice(2, 6);
  return `p${ymd}-${rand}`;
}

/**
 * 記事を1件登録する。status は draft / published / rejected / failed。
 */
function addPost(post) {
  const record = {
    id: newId(),
    status: 'draft',
    createdAt: new Date().toISOString(),
    ...post,
  };
  update((state) => {
    state.posts.unshift(record);
    if (record.topic) state.usedTopics.unshift(record.topic);
    state.usedTopics = state.usedTopics.slice(0, 200);
    state.lastRunAt = record.createdAt;
  });
  return record;
}

function updatePost(id, patch) {
  return update((state) => {
    const post = state.posts.find((p) => p.id === id);
    if (!post) return null;
    Object.assign(post, patch, { updatedAt: new Date().toISOString() });
    return post;
  });
}

function getPost(id) {
  return readState().posts.find((p) => p.id === id) || null;
}

function listPosts({ status, limit = 20 } = {}) {
  const posts = readState().posts;
  return (status ? posts.filter((p) => p.status === status) : posts).slice(0, limit);
}

function usedTopics() {
  return readState().usedTopics;
}

module.exports = {
  STATE_PATH,
  readState,
  writeState,
  addPost,
  updatePost,
  getPost,
  listPosts,
  usedTopics,
};
