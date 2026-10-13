// 引擎核心 — 回合流程 / 距离 / 判定 / 伤害 / 濒死 / 牌局推进
import { defOf, CARD_DEFS, isRed, suitColor, RANK_NAME } from '../data/cards.js';
import { draw, addToDiscard, removeFromHand, Player, GameState } from './state.js';

// ============ 距离 =============
export function distance(state, from, to) {
  if (from === to) return 0;
  if (!from.alive || !to.alive) return Infinity;
  const alive = state.alivePlayers();
  const fi = alive.indexOf(from), ti = alive.indexOf(to);
  if (fi < 0 || ti < 0) return Infinity;
  const n = alive.length;
  let d = Math.min(Math.abs(fi - ti), n - Math.abs(fi - ti));
  // 攻击方修正
  if (from.equip.horseA) d -= 1;
  if (from.hasSkill('jixing')) d -= 1;      // 疾行
  if (from.hasSkill('mashu')) d -= 1;        // 马术
  // 防御方修正
  if (to.equip.horseD) d += 1;
  if (to.hasSkill('jixing')) d -= 0; // 疾行只影响自己
  return Math.max(d, 1);
}
export function canAttack(state, from, to) {
  if (from === to || !to.alive) return false;
  // 白马/神射：无视距离
  if (from.equip.horseA?.defId === 'baima') return true;
  if (from.hasSkill('shenshe')) return true;
  const r = from.attackRange();
  return distance(state, from, to) <= r;
}

// ============ 牌堆基础 ============
export function drawCards(state, p, n, opts = {}) {
  const cards = draw(state, n);
  p.hand.push(...cards);
  state.emit('onDraw', { p, cards, opts });
  if (!opts.silent) state.log(`<b>${p.name}</b> 摸了 ${cards.length} 张牌`);
  return cards;
}

// ============ 判定 ============
// opts: { name, judgeFilter, onResult, skipGuiCai } -> { card, suit, rank, ok }
export async function judge(state, p, opts = {}) {
  const name = opts.name || '判定';
  let card = draw(state, 1)[0];
  if (!card) return null;
  state.log(`<b>${p.name}</b> 进行【${name}】判定…`);
  await UI.revealJudgement(p, card, name);
  // 触发 鬼才 / 鬼道（在生效前替换）
  const mods = [];
  for (const other of state.players) {
    if (!other.alive) continue;
    if (other.hasSkill('guicai') && !opts.skipGuiCai) {
      // 司马：任意手牌
      const use = await Skills.tryGuicai(state, other, card, p, name);
      if (use) mods.push({ from: other, card: use });
    }
    if (other.hasSkill('guidao') && !opts.skipGuiDao) {
      const use = await Skills.tryGuidao(state, other, card, p, name);
      if (use) mods.push({ from: other, card: use });
    }
  }
  // 只采用最后一个（按座位顺序）
  let finalCard = card;
  if (mods.length) {
    finalCard = mods[mods.length - 1].card;
    state.log(`<b>${mods[mods.length-1].from.name}</b> 用【${finalCard.name}】替换判定牌`);
    addToDiscard(state, card);
    await UI.revealJudgement(p, finalCard, name);
  }
  // 天妒：郭嘉可获得自己的判定牌
  if (p.hasSkill('tiandu')) {
    if (await UI.askYesNo(p, '天妒', `是否获得判定牌【${finalCard.name}】？`)) {
      removeFromHand(p, finalCard);
      p.hand.push(finalCard);
      state.log(`<b>${p.name}</b> 【天妒】获得判定牌`);
      return { card: finalCard, suit: finalCard.suit, rank: finalCard.rank, ok: opts.judgeFilter ? opts.judgeFilter(finalCard) : true };
    }
  }
  addToDiscard(state, finalCard);
  const ok = opts.judgeFilter ? opts.judgeFilter(finalCard) : true;
  if (opts.onResult) await opts.onResult(finalCard, ok);
  return { card: finalCard, suit: finalCard.suit, rank: finalCard.rank, ok };
}

// ============ 求响应牌 =============
// kinds: ['sha'|'shan'|'tao'] 等；source: 谁在使用；ctx 附加上下文
export async function askForCard(state, p, kinds, ctx = {}) {
  if (!p.alive) return null;
  const prompt = { p, kinds, ctx, source: ctx.source || null, target: ctx.target || null };
  state.pendingPrompt = prompt;
  UI.onPrompt(prompt);
  let ans;
  if (p.isHuman) {
    ans = await UI.waitHumanResponse(prompt);
  } else {
    ans = await AI.respond(state, prompt);
  }
  state.pendingPrompt = null;
  UI.onPrompt(null);
  return ans;
}

// ============ 使用牌 vs 打出牌 =============
// 使用牌：走完整结算（锦囊/装备/杀）
// 打出牌：作为响应（闪、求桃时不打出、无懈可击）
export async function useCard(state, p, card, opts = {}) {
  if (!card) return false;
  // 从手中移除
  if (card._virtual) {
    // 虚拟牌：消耗源牌
    if (card._sources) removeFromHand(p, card._sources);
  } else {
    removeFromHand(p, card);
  }
  const realCard = card._virtual ? { ...card._base, ...card, id: card.id || 'v_' + Math.random().toString(36).slice(2,8) } : card;
  const target = opts.targets || [];
  // 展示
  UI.showUsed(state, p, realCard, target);
  state.log(`<b>${p.name}</b> 使用【${realCard.name}】${target.length ? '→ ' + target.map(t => t.name).join('、') : ''}`);
  // 使用牌后钩子（集智：锦囊使用后摸1张）
  await state.emit('onCardUsed', { p, card: realCard, targets: target });
  // 分派
  const defId = realCard.defId || realCard.id.split('#')[0];
  // 非延时锦囊：先询问无懈可击（对每个目标独立判定）
  const isDelay = realCard.type === 'trick' && realCard.subtype === 'delay';
  const isNonDelayTrick = realCard.type === 'trick' && !isDelay && defId !== 'wuxie';
  if (isNonDelayTrick && !opts.skipCounter) {
    // 对单体锦囊（过河/顺手/决斗/借刀/火攻/知己/乐/兵）询问一次
    const singleTarget = ['guohe','shunshou','juedou','jiedao','huogong','zhiji','le','bingliang'].includes(defId);
    if (singleTarget) {
      const t = target[0];
      const countered = await CardResolver.tryCounterTrick(state, defId, p, t, p);
      if (countered) {
        state.log(`【${realCard.name}】被【无懈可击】抵消`);
        return true;
      }
    } else {
      // 群体锦囊（南蛮/万箭/桃园/五谷/无中生有）：对每个目标询问
      let anyNotCounter = false;
      const keptTargets = [];
      for (const t of target) {
        const countered = await CardResolver.tryCounterTrick(state, defId, p, t, p);
        if (!countered) { anyNotCounter = true; keptTargets.push(t); }
        else state.log(`【${realCard.name}】对 <b>${t.name}</b> 被抵消`);
      }
      if (!anyNotCounter) return true;
      // 用剩余目标结算
      await CardResolver.resolve(state, p, defId, realCard, keptTargets, opts);
      await state.emit('onCardResolved', { p, card: realCard, targets: keptTargets });
      return true;
    }
  }
  await CardResolver.resolve(state, p, defId, realCard, target, opts);
  // 结算后
  await state.emit('onCardResolved', { p, card: realCard, targets: target });
  return true;
}

export async function playCard(state, p, card, ctx = {}) {
  // 打出牌：只作为响应（不触发 onCardUsed），例如闪、无懈（无懈算使用但也可视为响应）
  if (!card) return false;
  if (card._virtual && card._sources) removeFromHand(p, card._sources);
  else if (!card._virtual) removeFromHand(p, card);
  const realCard = card._virtual ? { ...card._base, ...card } : card;
  UI.showPlayed(state, p, realCard);
  state.log(`<b>${p.name}</b> 打出【${realCard.name}】`);
  return true;
}

// ============ 伤害 ============
// opts: { amount, type:'normal'|'fire'|'thunder', source: card, cause: 'sha'|'juedou'|'nanman'|..., noDodge }
export async function damage(state, src, target, opts = {}) {
  if (!target || !target.alive) return { dealt: 0 };
  let amount = opts.amount || 1;
  let type = opts.type || 'normal';
  // 藤甲加成
  if (target.equip.armor?.defId === 'tengjia') {
    if (type === 'fire') { amount += 1; }
    if (opts.cause === 'sha' && type === 'normal') return { dealt: 0, blocked: 'tengjia' };
    if ((opts.cause === 'nanman' || opts.cause === 'wanjian') && type === 'normal') return { dealt: 0, blocked: 'tengjia' };
  }
  // 酒加成
  if (src && src.mark.wineNext) {
    if (opts.cause === 'sha') { amount += src.mark.wineNext; delete src.mark.wineNext; }
  }
  // 裸衣
  if (src && src.mark.luoyiActive && (opts.cause === 'sha' || opts.cause === 'juedou')) amount += 1;
  // 啖睛
  if (src && src.mark.danjingNext && opts.cause === 'sha') { amount += src.mark.danjingNext; delete src.mark.danjingNext; }
  // 触发 天香（小乔受伤害转移）
  if (target.hasSkill('tianxiang')) {
    const t = await Skills.tryTianxiang(state, target, { src, amount, type, cause: opts.cause });
    if (t) {
      state.log(`<b>${target.name}</b> 【天香】将伤害转移给 <b>${t.name}</b>`);
      target = t;
      // 转移后摸X张
      const n = t.lostHp();
      if (n > 0) drawCards(state, t, n, { tag:'tianxiang' });
    }
  }
  // 真正扣血前，触发 onDamageTaken hook（受伤害方 / 来源方）
  await state.emit('onDamagePre', { src, target, amount, type, cause: opts.cause, source: opts.source });
  target.hp -= amount;
  const dmgLabel = type === 'fire' ? '火焰' : (type === 'thunder' ? '雷电' : '');
  state.log(`<b>${target.name}</b> 受到 ${amount} 点${dmgLabel}伤害${src ? `（来源：${src.name}）` : ''}`, 'dmg');
  UI.showDamage(target, amount, type);
  // 触发 onDamageTaken
  await state.emit('onDamageTaken', { src, target, amount, type, cause: opts.cause, source: opts.source });
  // 铁索传导
  if ((type === 'fire' || type === 'thunder') && target.chained) {
    const chained = state.alivePlayers().filter(p => p.chained && p !== target);
    for (const c of chained) {
      c.chained = false;
      state.log(`<b>${c.name}</b> 因铁索连环受到 ${amount} 点${dmgLabel}伤害`, 'dmg');
      c.hp -= amount;
      UI.showDamage(c, amount, type);
      await state.emit('onDamageTaken', { src, target: c, amount, type, cause: opts.cause, source: opts.source });
      if (c.hp <= 0) await dying(state, c, src);
    }
    target.chained = false;   // 传导后解除
  }
  // 濒死
  if (target.hp <= 0) await dying(state, target, src);
  return { dealt: amount, type };
}

// ============ 失去体力（不触发伤害钩子）============
export async function loseHp(state, target, amount = 1, reason = '') {
  if (!target.alive) return;
  target.hp -= amount;
  state.log(`<b>${target.name}</b> 失去 ${amount} 点体力${reason ? '（' + reason + '）' : ''}`, 'dmg');
  UI.showDamage(target, amount, 'lose');
  await state.emit('onLoseHp', { target, amount, reason });
  if (target.hp <= 0) await dying(state, target, null);
}

// ============ 回复体力 ============
export async function heal(state, target, amount = 1, src = null) {
  if (!target.alive) return 0;
  if (target.mark.cantRecover) {
    state.log(`<b>${target.name}</b> 因【义绝】不能回复体力`);
    return 0;
  }
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const gained = target.hp - before;
  if (gained > 0) {
    state.log(`<b>${target.name}</b> 回复 ${gained} 点体力`, 'heal');
    UI.showHeal(target, gained);
    await state.emit('onHeal', { target, amount: gained, src });
  }
  return gained;
}

// ============ 濒死 ============
export async function dying(state, target, src) {
  if (state.finished) return;
  if (target.hp > 0) return;
  target.alive = false; // 临死；如果救回则 alive = true
  state.log(`<b>${target.name}</b> 进入濒死！`, 'dead');
  UI.showDying(target);
  // 替身（张飞）每局一次
  if (target.hasSkill('tishen') && !target._tishenUsed) {
    if (await UI.askYesNo(target, '替身', '你即将死亡，是否使用【替身】摸两张并回复至1点体力？')) {
      target._tishenUsed = true;
      target.hp = 1;
      target.alive = true;
      drawCards(state, target, 2);
      state.log(`<b>${target.name}</b> 使用【替身】起死回生！`, 'heal');
      UI.showHeal(target, 1);
      return;
    }
  }
  // 求桃：按座位顺序（濒死角色优先自求）
  const order = [target, ...state.alivePlayers().filter(p => p !== target)];
  for (const savior of order) {
    while (target.hp < 1) {
      const card = await askForCard(state, savior, ['tao'], { source: null, target, cause: 'dying', isSelf: savior === target });
      if (!card) break;
      await playCard(state, savior, card);
      await heal(state, target, 1, savior);
      state.log(`<b>${savior.name}</b> 对 <b>${target.name}</b> 使用【桃】`, 'heal');
    }
    if (target.hp >= 1) break;
  }
  if (target.hp < 1) {
    state.log(`<b>${target.name}</b> 死亡！`, 'dead');
    UI.onPlayerDead(target);
    await state.emit('onDeath', { target, killer: src });
    checkGameEnd(state);
  } else {
    target.alive = true;
    UI.onPlayerRevive(target);
    state.log(`<b>${target.name}</b> 脱离险境`, 'heal');
  }
}

// ============ 弃牌 =============
export function discardCards(state, p, cards, reason = '') {
  const arr = Array.isArray(cards) ? cards : [cards];
  const removed = removeFromHand(p, arr);
  addToDiscard(state, removed);
  if (removed.length && reason) state.log(`<b>${p.name}</b> ${reason}弃置 ${removed.length} 张牌`);
  return removed;
}
export async function discardToHandLimit(state, p) {
  const limit = p.handLimit();
  let over = p.hand.length - limit;
  if (over <= 0) return;
  // 克己
  if (p.hasSkill('keji') && !p.turnData?.usedSha) {
    if (await UI.askYesNo(p, '克己', '本回合未使用【杀】，是否跳过弃牌阶段？')) {
      state.log(`<b>${p.name}</b> 【克己】跳过弃牌阶段`);
      await state.emit('onSkipDiscard', { p });
      if (p.hasSkill('qinxue') && await UI.askYesNo(p, '勤学', '【勤学】摸一张牌？')) {
        drawCards(state, p, 1);
      }
      return;
    }
  }
  while (p.hand.length > p.handLimit()) {
    let pick;
    if (p.isHuman) pick = await UI.chooseDiscard(state, p, 1);
    else pick = AI.pickDiscard(state, p, 1);
    if (!pick || !pick.length) break;
    discardCards(state, p, pick, '弃牌阶段');
    UI.flash();
  }
}

// ============ 求响应"杀" ============
export async function askForSha(state, p, ctx = {}) {
  return askForCard(state, p, ['sha'], ctx);
}
export async function askForShan(state, p, ctx = {}) {
  return askForCard(state, p, ['shan'], ctx);
}

// ============ 拼点 =============
// 按文档 5.3：K>Q>J>10>...>2>A；同点数算没赢；A 最小
export function comparePinPoint(a, b) {
  if (a.rank > b.rank) return 1;
  if (a.rank < b.rank) return -1;
  return 0;
}
export async function pinPoint(state, a, b) {
  const pickOne = async (p) => {
    if (p.hand.length === 0) return null;
    if (p.isHuman) return await UI.choosePinPointCard(p);
    return AI.pickPinPointCard(state, p);
  };
  const ca = await pickOne(a);
  const cb = await pickOne(b);
  if (!ca || !cb) { state.log(`拼点失败（无手牌）`); return null; }
  UI.showPinPoint(a, b, ca, cb);
  const SUIT = { s:'♠', h:'♥', c:'♣', d:'♦' };
  state.log(`<b>${a.name}</b>（${SUIT[ca.suit]}${RANK_NAME[ca.rank]||ca.rank}） vs <b>${b.name}</b>（${SUIT[cb.suit]}${RANK_NAME[cb.rank]||cb.rank}）拼点`);
  addToDiscard(state, [ca, cb]);
  removeFromHand(a, [ca]); removeFromHand(b, [cb]);
  const c = comparePinPoint(ca, cb);
  if (c > 0) return { winner: a, loser: b, ca, cb };
  if (c < 0) return { winner: b, loser: a, ca, cb };
  return { winner: null, loser: null, ca, cb };
}

// ============ 求牌堆顶 ============
export function topCard(state) {
  if (state.deck.length === 0) reshuffleIfNeeded(state);
  return state.deck[0];
}
function reshuffleIfNeeded(state) {
  if (state.discard.length) { state.deck = state.discard; state.discard = []; }
}

// ============ 结束检测 ============
export function checkGameEnd(state) {
  if (state.finished) return;
  const alive = state.alivePlayers();
  if (state.mode === 'identity') {
    const lords = alive.filter(p => p.isLord() || p.isLoyal());
    const rebels = alive.filter(p => p.isRebel());
    const spies = alive.filter(p => p.isSpy());
    if (lords.length === 0) {
      // 主公死
      if (alive.length === 1 && alive[0].isSpy()) {
        finishGame(state, alive[0], 'spy');
      } else {
        finishGame(state, rebels, 'rebel');
      }
      return;
    }
    if (rebels.length === 0 && spies.length === 0) {
      finishGame(state, lords, 'lord');
      return;
    }
  } else {
    // 2v2 / 3v3：一队全灭
    const a = alive.filter(p => p.team === 'A');
    const b = alive.filter(p => p.team === 'B');
    if (a.length === 0) { finishGame(state, b, 'teamB'); return; }
    if (b.length === 0) { finishGame(state, a, 'teamA'); return; }
  }
}
function finishGame(state, winners, kind) {
  state.finished = true;
  state.winner = Array.isArray(winners) ? winners : [winners];
  state.winnerKind = kind;
  state.log(`游戏结束 · ${kindToCN(kind)}方胜利！`, 'hdr');
  UI.onGameEnd(state);
}
function kindToCN(k) {
  return { lord:'主公', rebel:'反贼', spy:'内奸', teamA:'红队 A', teamB:'蓝队 B' }[k] || k;
}

// 占位：UI / AI / Skills / CardResolver
import { UI } from './ui-bridge.js';
import { AI } from './ai-bridge.js';
import { Skills } from './skills.js';
import { CardResolver } from './cards-resolver.js';
export { UI, AI, Skills, CardResolver };
