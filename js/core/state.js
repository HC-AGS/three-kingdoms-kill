// 游戏状态、玩家、事件总线
import { buildDeck } from '../data/cards.js';
import { GENERALS } from '../data/generals.js';

let pidSeq = 0;
export function nextPid() { return `p${++pidSeq}`; }

export class Player {
  constructor({ idx, name, isHuman, general, role, team, faction }) {
    this.idx = idx;
    this.id = `p${idx}`;
    this.name = name;
    this.isHuman = !!isHuman;
    this.general = general;         // gen 定义
    this.genId = general.id;
    this.fac = general.fac;          // 魏/蜀/吴/群
    this.gender = general.gender;
    this.maxHp = general.hp;
    this.hp = general.hp;
    this.role = role;                // identity '主'|'忠'|'反'|'内'  |  team mode 'A'|'B'|'lord'
    this.team = team;                // 2v2/3v3 team
    this.alive = true;
    this.hand = [];
    this.equip = { weapon: null, armor: null, horseA: null, horseD: null };
    this.judges = [];                // 头顶延时锦囊 [{card, defId, srcIdx}]
    this.chained = false;            // 铁索连环
    this.mark = {};                  // e.g. wineDmg, noShan, cantRecover, shaLimitBonus, handLimitBonus
    this.turnData = null;
    this.skills = general.skills.map(s => ({ ...s, used:0 })); // 附加运行时
    this.skillUseFlag = new Set();   // 记录本回合已使用过的主动技 id
  }
  get skillIds() { return this.skills.map(s => s.id); }
  hasSkill(id) { return this.skills.some(s => s.id === id); }
  getSkill(id) { return this.skills.find(s => s.id === id); }
  isLord()   { return this.role === '主' || this.role === 'lord'; }
  isLoyal()  { return this.role === '忠'; }
  isRebel()  { return this.role === '反'; }
  isSpy()    { return this.role === '内'; }
  lostHp()   { return this.maxHp - this.hp; }
  handLimit() {
    let n = Math.max(this.hp, 0);
    if (this.mark.handLimitBonus) n += this.mark.handLimitBonus;
    if (this.equip.horseA?.defId === 'zhaohuang') n += 1;
    // 血裔（袁绍）：手牌上限 + 其他群势力角色数
    if (this.hasSkill('xueyi') && this._xueCount) n += this._xueCount;
    return n;
  }
  attackRange() {
    if (this.equip.weapon) return this.equip.weapon.range || 1;
    return 1;
  }
}

export class GameState {
  constructor({ mode, count, humanNames, difficulty }) {
    this.mode = mode;         // 'identity' | '2v2' | '3v3'
    this.count = count;
    this.difficulty = difficulty || 'normal';
    this.humanNames = humanNames;
    this.players = [];
    this.deck = [];
    this.discard = [];
    this.used = [];            // 临时展示区（当前正在使用的牌）
    this.reveals = [];         // 揭示区
    this.currentIdx = 0;
    this.turnCount = 0;
    this.round = 0;
    this.phase = 'idle';       // 'prepare'|'judge'|'draw'|'play'|'discard'|'end'|'dying'|'done'
    this.finished = false;
    this.winner = null;
    this.logs = [];
    this.hooks = new Map();    // hookName -> [fn]
    this.pendingPrompt = null; // 当前正在等待的响应
  }
  currentPlayer() { return this.players[this.currentIdx]; }
  alivePlayers() { return this.players.filter(p => p.alive); }
  deadPlayers() { return this.players.filter(p => !p.alive); }
  nextAliveFrom(i, step = 1) {
    let j = i;
    for (let k = 0; k < this.players.length; k++) {
      j = (j + step + this.players.length) % this.players.length;
      if (this.players[j].alive) return j;
    }
    return i;
  }
  // 事件钩子
  on(name, fn) {
    if (!this.hooks.has(name)) this.hooks.set(name, []);
    this.hooks.get(name).push(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    const arr = this.hooks.get(name);
    if (!arr) return;
    const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1);
  }
  async emit(name, payload) {
    const arr = (this.hooks.get(name) || []).slice();
    let ret = null;
    for (const fn of arr) {
      const v = await fn(payload);
      if (v != null && v !== false) ret = v;
    }
    return ret;
  }
  async *collect(name, payload) {
    const arr = (this.hooks.get(name) || []).slice();
    for (const fn of arr) {
      const v = await fn(payload);
      if (v != null) yield v;
    }
  }
  log(msg, kind = '') {
    this.logs.push({ msg, kind, t: Date.now() });
  }
}

// 牌堆操作
export function draw(state, n = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) reshuffleDiscard(state);
    const c = state.deck.shift();
    if (!c) break;
    out.push(c);
  }
  return out;
}
export function reshuffleDiscard(state) {
  if (state.discard.length === 0) return;
  state.deck = buildDeck.length ? state.discard : state.discard;
  for (let i = state.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
  }
  state.discard = [];
  state.log('牌堆耗尽，弃牌堆已洗回。', 'hdr');
}
export function addToDiscard(state, cards) {
  if (!Array.isArray(cards)) cards = [cards];
  cards.forEach(c => { if (c) state.discard.push(c); });
}
export function removeFromHand(p, cards) {
  const ids = new Set((Array.isArray(cards) ? cards : [cards]).map(c => c.id));
  const removed = [];
  p.hand = p.hand.filter(c => { if (ids.has(c.id)) { removed.push(c); return false; } return true; });
  return removed;
}
export function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// 身份配置表
export const ROLE_TABLE = {
  4: ['主','忠','反','内'],
  5: ['主','忠','反','反','内'],
  6: ['主','忠','反','反','反','内'],
  7: ['主','忠','忠','反','反','反','内'],
  8: ['主','忠','忠','反','反','反','反','内']
};

export function assignRoles(mode, count) {
  if (mode === 'identity') {
    const roles = ROLE_TABLE[count] || ROLE_TABLE[6];
    // 主公固定第 0 位，其余随机
    const rest = roles.slice(1);
    shuffle(rest);
    return ['主', ...rest];
  }
  if (mode === '2v2') {
    // 4 人：0/2 一队 A, 1/3 一队 B
    return ['A','B','A','B'];
  }
  if (mode === '3v3') {
    if (count !== 6) throw new Error('3v3 需要 6 人');
    return ['A','B','A','B','A','B'];
  }
  return [];
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 团队判定 — 敌对关系
export function areEnemies(state, a, b) {
  if (!a || !b || a === b) return false;
  if (state.mode === 'identity') {
    const ar = a.role, br = b.role;
    // 主公/忠臣 vs 反贼/内奸
    if (ar === '主' || ar === '忠') return br === '反' || br === '内';
    if (ar === '反') return br === '主' || br === '忠' || br === '反'; // 反贼之间也算敌对（避免自杀判定），但AI会尽量不杀队友
    if (ar === '内') return false; // 内奸不主动树敌
    return false;
  }
  return a.team !== b.team;
}
export function areAllies(state, a, b) {
  if (!a || !b || a === b) return false;
  if (state.mode === 'identity') {
    if (a.role === '主' && b.role === '忠') return true;
    if (a.role === '忠' && (b.role === '主' || b.role === '忠')) return true;
    if (a.role === '反' && b.role === '反') return true;
    return false;
  }
  return a.team === b.team;
}
// AI 视角的"敌友猜测"（不完美信息）— 团队模式直接可见
export function knownEnemies(state, a) {
  if (state.mode === 'identity') {
    // 主公/忠臣视角：所有反贼+内奸为敌（但内奸身份未明）
    return state.players.filter(p => p.alive && p !== a && (p.isRebel() || p.isSpy()));
  }
  return state.players.filter(p => p.alive && p !== a && p.team !== a.team);
}
export function knownAllies(state, a) {
  if (state.mode === 'identity') {
    return state.players.filter(p => p.alive && p !== a && ((a.isLord() || a.isLoyal()) && (p.isLord() || p.isLoyal())));
  }
  return state.players.filter(p => p.alive && p !== a && p.team === a.team);
}

export function generalPool(count, mode) {
  return shuffle(GENERALS.slice()).map(g => g.id);
}
