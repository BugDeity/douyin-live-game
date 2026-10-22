// 拔河游戏：观众发弹幕加入阵营，弹幕 / 点赞 / 礼物为本方加分，倒计时结束分高者胜
import { CONFIG } from './config.js';
import { connectDyhub, startMock } from './source.js';

const params = new URLSearchParams(location.search);
const roomId = (params.get('roomId') || '').trim();
const useMock = params.has('mock') || !roomId;
const autoLoop = params.get('auto') === '1';
const duration = (Number(params.get('duration')) || CONFIG.duration) * 1000;
const dyhubUrl = params.get('dyhub') || 'ws://127.0.0.1:8757/ws';
const P = CONFIG.points;
const TEAMS = CONFIG.teams;

const $ = (sel) => document.querySelector(sel);

// ---------- 状态 ----------

let round;

function newRound() {
  round = {
    phase: 'ready', // ready → playing ⇄ paused → ended
    endsAt: 0,
    remaining: duration,
    members: new Map(), // userId → { team, nickname, avatar, score, lastChatAt }
    scores: Object.fromEntries(TEAMS.map((t) => [t.key, 0])),
    counts: Object.fromEntries(TEAMS.map((t) => [t.key, 0])),
    giftSeen: new Map(), // 连击礼物已计入的次数，避免重复推送重复计分
  };
  $('#feed').replaceChildren();
  for (const t of TEAMS) $(`#avatars-${t.key}`).replaceChildren();
  hideResult();
  markDirty();
}

function start() {
  if (round.phase === 'ended') newRound();
  if (round.phase === 'ready' || round.phase === 'paused') {
    round.endsAt = Date.now() + round.remaining;
    round.phase = 'playing';
  }
}

function pause() {
  if (round.phase !== 'playing') return;
  round.remaining = Math.max(0, round.endsAt - Date.now());
  round.phase = 'paused';
}

function finish() {
  round.phase = 'ended';
  round.remaining = 0;
  showResult();
  if (autoLoop) {
    setTimeout(() => {
      newRound();
      start();
    }, CONFIG.resultSeconds * 1000);
  }
}

// ---------- 事件处理 ----------

function matchTeam(text) {
  for (const team of TEAMS) {
    // 单字符关键词（如 "1"）要求整条弹幕就是它，避免 "11点了" 之类误判；多字符关键词包含即可
    if (team.keywords.some((k) => (k.length === 1 ? text === k : text.includes(k)))) return team;
  }
  return null;
}

function handleEvent(ev) {
  if (round.phase !== 'playing') return;
  const user = ev.user;
  if (!user?.id) return;
  let member = round.members.get(user.id);

  if (ev.type === 'chat') {
    const text = (ev.data?.content || '').trim();
    if (!member) {
      const team = matchTeam(text);
      if (!team) return;
      member = join(user, team);
      addScore(member, P.join);
      pushFeed(member, `加入${team.name}`);
      return;
    }
    const now = Date.now();
    if (now - member.lastChatAt < P.chatCooldownMs) return;
    member.lastChatAt = now;
    addScore(member, P.chat);
  } else if (ev.type === 'like') {
    if (!member) return;
    addScore(member, P.like * (ev.data?.count || 1));
  } else if (ev.type === 'gift') {
    if (!member) return;
    const { points, count } = giftPoints(ev);
    if (points <= 0) return;
    addScore(member, points);
    pushFeed(member, `送出 ${ev.data.giftName || '礼物'}×${count}`, `+${points}`, true);
    if (points >= 1000) popup(member, ev.data.giftName, points);
  }
}

function join(user, team) {
  const member = {
    team: team.key,
    nickname: user.nickname || '神秘观众',
    avatar: user.avatar || '',
    score: 0,
    lastChatAt: Date.now(),
  };
  round.members.set(user.id, member);
  round.counts[team.key]++;
  // 头像墙只追加新成员，不整体重绘，免得入场动画反复播放
  const wall = $(`#avatars-${team.key}`);
  wall.prepend(avatarEl(member));
  while (wall.children.length > 10) wall.lastChild.remove();
  return member;
}

function addScore(member, points) {
  member.score += points;
  round.scores[member.team] += points;
  markDirty();
}

/** 连击礼物会多次推送，repeatCount 是本组累计次数，只计新增部分 */
function giftPoints(ev) {
  const d = ev.data || {};
  const repeat = d.repeatCount || 1;
  let delta = repeat;
  if (d.groupId && d.groupId !== '0') {
    const key = `${ev.user.id}:${d.giftId}:${d.groupId}`;
    const prev = round.giftSeen.get(key) || 0;
    delta = Math.max(0, repeat - prev);
    round.giftSeen.set(key, Math.max(prev, repeat));
  }
  const count = delta * (d.groupCount || 1);
  return { points: count * (d.diamondCount || 0) * P.diamond, count };
}

// ---------- 渲染 ----------

let dirty = true;
let lastBoardAt = 0;
let shownRatio = 0.5;

function markDirty() {
  dirty = true;
}

function teamOf(key) {
  return TEAMS.find((t) => t.key === key);
}

function render() {
  requestAnimationFrame(render);

  // 计时
  if (round.phase === 'playing') {
    round.remaining = Math.max(0, round.endsAt - Date.now());
    if (round.remaining === 0) finish();
  }
  const sec = Math.ceil(round.remaining / 1000);
  $('#timer').textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  $('#timer').classList.toggle('urgent', round.phase === 'playing' && sec <= 10);
  $('#phase').textContent = { ready: '按空格开始', paused: '已暂停', playing: '', ended: '' }[round.phase];

  // 绳子位置平滑过渡到目标比例
  const [a, b] = TEAMS.map((t) => round.scores[t.key]);
  const target = a + b === 0 ? 0.5 : a / (a + b);
  shownRatio += (target - shownRatio) * 0.08;
  const pct = (shownRatio * 100).toFixed(2);
  $('#bar-left').style.width = `${pct}%`;
  // 绳结图标不能跑出绳子两端
  $('#knot').style.left = `${Math.min(95, Math.max(5, pct))}%`;

  if (!dirty) return;
  dirty = false;
  for (const t of TEAMS) {
    $(`#score-${t.key}`).textContent = Math.round(round.scores[t.key]).toLocaleString();
    $(`#count-${t.key}`).textContent = `${round.counts[t.key]} 人`;
  }
  // 排行榜不必每帧刷新
  const now = performance.now();
  if (now - lastBoardAt < 300) {
    dirty = true;
    return;
  }
  lastBoardAt = now;
  for (const t of TEAMS) renderBoard($(`#board-${t.key}`), topMembers(t.key, 3));
}

function topMembers(teamKey, n) {
  const top = [];
  for (const m of round.members.values()) {
    if (m.team !== teamKey) continue;
    top.push(m);
    if (top.length > n * 4) {
      top.sort((x, y) => y.score - x.score);
      top.length = n;
    }
  }
  return top.sort((x, y) => y.score - x.score).slice(0, n);
}

function avatarEl(member, cls = 'avatar') {
  const el = document.createElement('div');
  el.className = cls;
  el.style.borderColor = teamOf(member.team).color;
  if (member.avatar) {
    const img = document.createElement('img');
    img.src = member.avatar;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.remove();
    el.append(img);
  }
  el.dataset.initial = [...member.nickname][0] || '?';
  return el;
}

function renderBoard(container, members) {
  container.replaceChildren(
    ...members.map((m, i) => {
      const row = document.createElement('li');
      const rank = document.createElement('span');
      rank.className = 'rank';
      rank.textContent = ['🥇', '🥈', '🥉'][i];
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = m.nickname;
      const score = document.createElement('span');
      score.className = 'pts';
      score.textContent = Math.round(m.score).toLocaleString();
      row.append(rank, avatarEl(m, 'avatar small'), name, score);
      return row;
    }),
  );
}

function pushFeed(member, text, extra = '', highlight = false) {
  const feed = $('#feed');
  const item = document.createElement('div');
  item.className = `feed-item${highlight ? ' gift' : ''}`;
  const name = document.createElement('b');
  name.textContent = member.nickname;
  name.style.color = teamOf(member.team).color;
  item.append(name, ` ${text} `);
  if (extra) {
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = extra;
    item.append(pts);
  }
  feed.prepend(item);
  while (feed.children.length > 7) feed.lastChild.remove();
}

function popup(member, giftName, points) {
  const el = document.createElement('div');
  el.className = 'popup';
  el.style.background = teamOf(member.team).color;
  const name = document.createElement('div');
  name.textContent = `${member.nickname} 送出 ${giftName}`;
  const pts = document.createElement('div');
  pts.className = 'popup-pts';
  pts.textContent = `${teamOf(member.team).name} +${points.toLocaleString()}`;
  el.append(name, pts);
  $('#stage').append(el);
  setTimeout(() => el.remove(), 2500);
}

function showResult() {
  const [a, b] = TEAMS;
  const sa = round.scores[a.key];
  const sb = round.scores[b.key];
  const winner = sa === sb ? null : sa > sb ? a : b;
  $('#result-title').textContent = winner ? `${winner.name} 获胜！` : '平局！';
  $('#result-title').style.color = winner ? winner.color : '#fff';
  $('#result-score').textContent = `${Math.round(sa).toLocaleString()} : ${Math.round(sb).toLocaleString()}`;
  const mvp = winner ? topMembers(winner.key, 1)[0] : null;
  const mvpBox = $('#result-mvp');
  mvpBox.replaceChildren();
  if (mvp) {
    const label = document.createElement('div');
    label.textContent = '本局 MVP';
    const name = document.createElement('div');
    name.className = 'mvp-name';
    name.textContent = `${mvp.nickname} · ${Math.round(mvp.score).toLocaleString()} 分`;
    mvpBox.append(label, avatarEl(mvp, 'avatar big'), name);
  }
  $('#result').hidden = false;
}

function hideResult() {
  $('#result').hidden = true;
}

// ---------- 初始化 ----------

function setStatus(status, detail = '') {
  const text = {
    mock: '模拟弹幕',
    connecting: `正在连接直播间 ${roomId}…（首次约 10-30 秒）`,
    live: `直播间 ${roomId} 已连接`,
    reconnecting: detail,
    error: detail,
  }[status];
  $('#status').textContent = text;
  $('#status').dataset.status = status;
}

function fitStage() {
  const scale = Math.min(innerWidth / 1080, innerHeight / 1920);
  $('#stage').style.transform = `translate(-50%, -50%) scale(${scale})`;
}

function init() {
  document.title = CONFIG.title;
  $('#title').textContent = CONFIG.title;
  const [a, b] = TEAMS;
  $('#tip').textContent = `发送「${a.keywords[0]}」加入${a.name}　发送「${b.keywords[0]}」加入${b.name}`;
  $('#rules').textContent = `弹幕 +${P.chat}　点赞 +${P.like}　礼物每抖币 +${P.diamond}`;
  for (const t of TEAMS) {
    $(`#name-${t.key}`).textContent = t.name;
    document.documentElement.style.setProperty(`--${t.key}`, t.color);
  }

  newRound();
  if (useMock) {
    startMock(handleEvent);
    setStatus('mock');
  } else {
    connectDyhub({ url: dyhubUrl, roomId, onEvent: handleEvent, onStatus: setStatus });
  }

  addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      round.phase === 'playing' ? pause() : start();
    } else if (e.key === 'r' || e.key === 'R') {
      newRound();
    } else if (e.key === 'h' || e.key === 'H') {
      $('#help').hidden = !$('#help').hidden;
    }
  });
  $('#stage').addEventListener('dblclick', () => (round.phase === 'playing' ? pause() : start()));

  addEventListener('resize', fitStage);
  fitStage();
  if (autoLoop) start();
  render();
}

init();
