// AI bot — 用于所有非玩家角色（单机模式）
import { UI } from './ui-bridge.js';
import { AI } from './ai-bridge.js';
import { areEnemies, areAllies, addToDiscard, removeFromHand } from './state.js';
import {
  distance, canAttack, useCard, drawCards, damage, heal, loseHp,
  pinPoint, discardCards, playCard, askForCard
} from './engine.js';
import { CardResolver } from './cards-resolver.js';
import { CARD_DEFS, isRed } from '../data/cards.js';

const DIFF = { easy: 0.55, normal: 0.78, hard: 0.92 };

export function installAI(state) {
  const d = DIFF[state.difficulty] || 0.75;

  AI.respond = async (st, prompt) => {
    const p = prompt.p;
    const kinds = prompt.kinds;
    const ctx = prompt.ctx || {};
    if (kinds.includes('tao')) {
      const isSelf = ctx.isSelf;
      if (isSelf) return _pickBest(p, 'tao');
      const target = ctx.target;
      if (!target) return null;
      if (!_isAllyLike(st, p, target)) return null;
      // 急救（华佗）：红色牌当桃
      if (p.hasSkill('jijiu')) {
        const reds = p.hand.filter(c => isRed(c.suit));
        if (reds.length) return _virtualCardFrom(p, reds[0], 'tao');
      }
      return _pickBest(p, 'tao');
    }
    if (kinds.includes('shan')) {
      return _pickShan(st, p);
    }
    if (kinds.includes('sha')) {
      return _pickSha(st, p);
    }
    return null;
  };

  AI.pickDiscard = (st, p, n = 1) => {
    if (!p.hand.length) return [];
    return p.hand.slice().sort((a,b) => _discardScore(b) - _discardScore(a)).slice(0, n);
  };

  AI.pickPinPointCard = (st, p) => {
    if (!p.hand.length) return null;
    return p.hand.slice().sort((a,b) => b.rank - a.rank)[0];
  };

  AI.decideTargets = (st, p, skill, targets, max = 1) => {
    if (!targets.length) return [];
    const sorted = targets.slice().sort((a,b) => {
      const as = (areEnemies(st,p,a) ? 100 : 0) - a.hp * 3 + a.hand.length;
      const bs = (areEnemies(st,p,b) ? 100 : 0) - b.hp * 3 + b.hand.length;
      return bs - as;
    });
    return sorted.slice(0, max);
  };

  AI.decideSkillUse = async () => Math.random() < d * 0.6;

  AI.decidePlayPhase = async (st, p) => {
    let loops = 0;
    while (loops++ < 24 && !st.finished && p.alive) {
      const ok = await _botTryPlayOneCard(st, p);
      if (!ok) break;
      await UI.syncAll(st);
    }
    await _botTryActiveSkills(st, p);
    UI.endPlayPhase();
  };
}

function _discardScore(c) {
  let s = 0;
  if (c.defId === 'sha') s += 3;
  if (c.defId === 'shan') s += 2;
  if (c.defId === 'tao') s -= 2;
  if (c.defId === 'jiu') s -= 1;
  if (c.defId === 'wuxie') s -= 2;
  if (c.type === 'equip') s -= 3;
  if (c.type === 'trick') s -= 1;
  return s;
}
function _pickBest(p, kind) {
  const list = p.hand.filter(c => c.defId === kind);
  if (!list.length) return null;
  return list.sort((a,b) => b.rank - a.rank)[0];
}
function _pickShan(st, p) {
  // 龙胆：把杀当闪
  if (p.hasSkill('longdan')) {
    const shas = p.hand.filter(c => c.defId === 'sha');
    if (shas.length >= 2) return shas[0];
  }
  // 倾国：黑色手牌当闪
  if (p.hasSkill('qingguo')) {
    const blacks = p.hand.filter(c => (c.suit === 's' || c.suit === 'c') && c.defId !== 'tao' && c.defId !== 'wuxie');
    if (blacks.length) return _virtualCardFrom(p, blacks[0], 'shan');
  }
  return p.hand.find(c => c.defId === 'shan') || null;
}
function _pickSha(st, p) {
  // 武圣：红色牌当杀
  if (p.hasSkill('wusheng')) {
    const reds = p.hand.filter(c => isRed(c.suit) && c.defId !== 'tao' && c.defId !== 'wuxie');
    if (reds.length) return _virtualCardFrom(p, reds[0], 'sha');
  }
  // 龙胆：闪当杀
  if (p.hasSkill('longdan')) {
    const shans = p.hand.filter(c => c.defId === 'shan');
    if (shans.length) return _virtualCardFrom(p, shans[0], 'sha');
  }
  // 丈八蛇矛
  if (p.equip.weapon?.defId === 'zhangba' && p.hand.length >= 2) {
    const [a, b] = p.hand;
    return _virtualCardFrom(p, [a,b], 'sha');
  }
  return p.hand.find(c => c.defId === 'sha') || null;
}
function _virtualCardFrom(p, src, defId) {
  const base = CARD_DEFS[defId];
  const sources = Array.isArray(src) ? src : [src];
  return {
    id: `v_${defId}_${Math.random().toString(36).slice(2,6)}`,
    defId, ...base, suit: sources[0].suit, rank: sources[0].rank, _virtual: true, _sources: sources, _base: base
  };
}
function _isAllyLike(st, p, t) {
  if (p === t) return true;
  if (st.mode === 'identity') {
    if (p.isLord() || p.isLoyal()) return t.isLord() || t.isLoyal();
    if (p.isRebel()) return t.isRebel() ? true : false;
    return false;
  }
  return p.team === t.team;
}

async function _botTryPlayOneCard(st, p) {
  if (!p.alive || st.finished) return false;
  const enemies = st.alivePlayers().filter(x => x !== p && areEnemies(st, p, x));
  const allies  = st.alivePlayers().filter(x => x !== p && areAllies(st, p, x));

  // 1. 桃 — 濒血自救
  if (p.hp < p.maxHp) {
    const tao = p.hand.find(c => c.defId === 'tao');
    if (tao && p.hp <= 2) { await useCard(st, p, tao, { targets:[p] }); return true; }
  }
  // 2. 酒 — 有杀在手时用
  const shaCount = _countShaLike(p);
  if (p.mark.wineNext === 0 && shaCount >= 1 && p.hp > 1) {
    const jiu = p.hand.find(c => c.defId === 'jiu');
    if (jiu && !p.turnData?.usedSha) { await useCard(st, p, jiu, { targets:[p] }); return true; }
  }
  // 3. 装备
  for (const c of p.hand.slice()) {
    if (c.type === 'equip') { await useCard(st, p, c, { targets:[p] }); return true; }
  }
  // 4. 无中生有
  const wzsy = p.hand.find(c => c.defId === 'wuzhongseng');
  if (wzsy) { await useCard(st, p, wzsy, { targets:[p] }); return true; }
  // 5. 五谷丰登（人少时）
  const wugu = p.hand.find(c => c.defId === 'wugu');
  if (wugu && st.alivePlayers().length <= 3) {
    await useCard(st, p, wugu, { targets: st.alivePlayers() }); return true;
  }
  // 6. 桃园结义
  const taoyuan = p.hand.find(c => c.defId === 'taoyuan');
  if (taoyuan) {
    const lowAllies = allies.filter(a => a.hp < a.maxHp).length;
    if (lowAllies >= 1 || p.hp < p.maxHp) {
      await useCard(st, p, taoyuan, { targets: st.alivePlayers() }); return true;
    }
  }
  if (enemies.length) {
    const others = st.alivePlayers().filter(x => x !== p);
    // 7. 万箭齐发
    const wanjian = p.hand.find(c => c.defId === 'wanjian');
    if (wanjian && enemies.length >= 2) { await useCard(st, p, wanjian, { targets: others }); return true; }
    // 8. 南蛮入侵
    const nanman = p.hand.find(c => c.defId === 'nanman');
    if (nanman && enemies.length >= 2) { await useCard(st, p, nanman, { targets: others }); return true; }
    // 9. 决斗
    const juedou = p.hand.find(c => c.defId === 'juedou');
    if (juedou && shaCount >= 2) {
      const t = _pickFoe(st, p, enemies, 'juedou');
      if (t) { await useCard(st, p, juedou, { targets:[t] }); return true; }
    }
    // 10. 杀
    if (_canUseShaThisTurn(p)) {
      const card = _pickShaCard(p);
      if (card) {
        const t = _pickFoe(st, p, enemies, 'sha');
        if (t) { await useCard(st, p, card, { targets:[t] }); return true; }
      }
    }
    // 11. 顺手牵羊
    const shunshou = p.hand.find(c => c.defId === 'shunshou');
    if (shunshou) {
      const cand = enemies.filter(e => distance(st,p,e) <= 1 && (e.hand.length || Object.values(e.equip).some(Boolean)));
      if (cand.length) { await useCard(st, p, shunshou, { targets:[cand[0]] }); return true; }
    }
    // 12. 过河拆桥
    const guohe = p.hand.find(c => c.defId === 'guohe');
    if (guohe) {
      const cand = enemies.filter(e => e.hand.length || Object.values(e.equip).some(Boolean));
      if (cand.length) { await useCard(st, p, guohe, { targets:[cand[0]] }); return true; }
    }
    // 13. 火攻
    const huogong = p.hand.find(c => c.defId === 'huogong');
    if (huogong && p.hand.length >= 2) { await useCard(st, p, huogong, { targets:[enemies[0]] }); return true; }
    // 14. 借刀杀人
    const jiedao = p.hand.find(c => c.defId === 'jiedao');
    if (jiedao) {
      const actor = st.alivePlayers().find(x => x !== p && x.equip.weapon && enemies.some(e => canAttack(st, x, e)));
      const victim = enemies.find(e => actor && canAttack(st, actor, e));
      if (actor && victim) { await useCard(st, p, jiedao, { targets:[actor, victim] }); return true; }
    }
    // 15. 铁索连环
    const tiesuo = p.hand.find(c => c.defId === 'tiesuo');
    if (tiesuo) { await useCard(st, p, tiesuo, { targets: enemies.slice(0, 2) }); return true; }
    // 16. 延时锦囊
    const le = p.hand.find(c => c.defId === 'le');
    if (le && enemies.length) {
      const t = _pickFoe(st, p, enemies, 'le');
      if (t && !t.judges.some(j => j.defId === 'le')) { await useCard(st, p, le, { targets:[t] }); return true; }
    }
    const bl = p.hand.find(c => c.defId === 'bingliang');
    if (bl && enemies.length) {
      const t = _pickFoe(st, p, enemies, 'bing');
      if (t && !t.judges.some(j => j.defId === 'bingliang')) { await useCard(st, p, bl, { targets:[t] }); return true; }
    }
    const sd = p.hand.find(c => c.defId === 'shandian');
    if (sd && !p.judges.some(j => j.defId === 'shandian')) { await useCard(st, p, sd, { targets:[p] }); return true; }
    // 17. 知己知彼
    const zhiji = p.hand.find(c => c.defId === 'zhiji');
    if (zhiji && enemies.length) { await useCard(st, p, zhiji, { targets:[enemies[0]] }); return true; }
  } else {
    const tao = p.hand.find(c => c.defId === 'tao');
    if (tao && p.hp < p.maxHp) { await useCard(st, p, tao, { targets:[p] }); return true; }
  }
  return false;
}
function _countShaLike(p) {
  let n = p.hand.filter(c => c.defId === 'sha').length;
  if (p.hasSkill('wusheng')) n += p.hand.filter(c => isRed(c.suit) && c.defId !== 'tao' && c.defId !== 'wuxie').length;
  if (p.hasSkill('longdan')) n += p.hand.filter(c => c.defId === 'shan').length;
  return n;
}
function _canUseShaThisTurn(p) {
  if (p.mark.shaDisabled) return false;
  const used = p.turnData?.usedSha ? 1 : 0;
  const limit = (p.hasSkill('paoxiao') || p.equip.weapon?.defId === 'nuliang') ? Infinity : 1 + (p.mark.extraShaAllowed || 0);
  return used < limit;
}
function _pickShaCard(p) {
  const sha = p.hand.find(c => c.defId === 'sha');
  if (sha) return sha;
  if (p.hasSkill('wusheng')) {
    const r = p.hand.find(c => isRed(c.suit) && c.defId !== 'tao' && c.defId !== 'wuxie');
    if (r) return _virtualCardFrom(p, r, 'sha');
  }
  if (p.hasSkill('longdan')) {
    const s = p.hand.find(c => c.defId === 'shan');
    if (s) return _virtualCardFrom(p, s, 'sha');
  }
  if (p.equip.weapon?.defId === 'zhangba' && p.hand.length >= 2) {
    return _virtualCardFrom(p, p.hand.slice(0,2), 'sha');
  }
  return null;
}
function _pickFoe(st, p, enemies, kind) {
  if (!enemies.length) return null;
  const inRange = enemies.filter(e => kind === 'sha' ? canAttack(st, p, e) : true);
  if (!inRange.length) return null;
  const sorted = inRange.slice().sort((a,b) => (a.hp - b.hp) || (a.hand.length - b.hand.length));
  if (kind === 'sha') {
    const canBeSha = sorted.filter(e => !(e.hasSkill('kongcheng') && e.hand.length === 0));
    if (canBeSha.length) return canBeSha[0];
  }
  return sorted[0];
}

async function _botTryActiveSkills(st, p) {
  if (st.finished || !p.alive) return;
  for (const s of p.skills) {
    if (s.type !== 'active') continue;
    if (p.skillUseFlag.has(s.id)) continue;
    if (!p.hasSkill(s.id)) continue;
    await _runSingleActiveSkill(st, p, s.id, null);
  }
}

// 供 API AI 调用：执行一个指定的主动技
export async function botRunActiveSkill(st, p, skillId, targetIds) {
  if (!p.alive || st.finished) return false;
  if (!p.hasSkill(skillId)) return false;
  const s = p.skills.find(x => x.id === skillId);
  if (s?.type !== 'active') return false;
  if (p.skillUseFlag.has(skillId)) return false;
  return await _runSingleActiveSkill(st, p, skillId, targetIds);
}

async function _runSingleActiveSkill(st, p, skillId, targetIds) {
  if (st.finished || !p.alive) return false;
  const pickedTarget = (targetIds || []).map(id => st.players.find(x => String(x.idx) === String(id))).filter(Boolean);
  switch (skillId) {
    case 'zhiheng': {
      const bad = p.hand.filter(c => _discardScore(c) > 0);
      if (bad.length < 1) return false;
      p.skillUseFlag.add('zhiheng');
      const pick = bad.slice(0, Math.min(bad.length, 3));
      discardCards(st, p, pick, '制衡');
      drawCards(st, p, pick.length);
      st.log(`<b>${p.name}</b>【制衡】弃 ${pick.length} 张，摸 ${pick.length} 张`);
      return true;
    }
    case 'kurou': {
      if (p.hp < 2) return false;
      p.skillUseFlag.add('kurou');
      await loseHp(st, p, 1, '苦肉');
      if (p.alive) drawCards(st, p, 2);
      st.log(`<b>${p.name}</b>【苦肉】失去1点体力，摸两张牌`);
      return true;
    }
    case 'qingnang': {
      if (p.hand.length < 1) return false;
      const t = pickedTarget[0] || st.alivePlayers().find(x => x.hp < x.maxHp && (x === p || areAllies(st, p, x)));
      if (!t) return false;
      p.skillUseFlag.add('qingnang');
      discardCards(st, p, [p.hand[0]], '青囊');
      await heal(st, t, 1, p);
      st.log(`<b>${p.name}</b>【青囊】令 <b>${t.name}</b> 回复1点体力`);
      return true;
    }
    case 'rende': {
      const t = pickedTarget[0] || st.alivePlayers().find(x => x !== p && areAllies(st, p, x) && x.hand.length <= 2);
      if (!t || p.hand.length < 2) return false;
      p.skillUseFlag.add('rende');
      const give = p.hand.slice(0, 2);
      removeFromHand(p, give);
      t.hand.push(...give);
      st.log(`<b>${p.name}</b>【仁德】给 <b>${t.name}</b> 两张牌`);
      if (give.length >= 2 && p.hp < p.maxHp) await heal(st, p, 1, p);
      return true;
    }
    case 'fanjian': {
      const t = pickedTarget[0] || st.alivePlayers().find(x => x !== p && areEnemies(st, p, x));
      if (!t || !p.hand.length) return false;
      p.skillUseFlag.add('fanjian');
      const suits = ['s','h','c','d'];
      const chosen = t.isHuman ? await UI.askChooseColorSuit(t, '反间：选择一种花色') : suits[Math.floor(Math.random()*4)];
      const show = p.hand[Math.floor(Math.random() * p.hand.length)];
      UI.revealCard(show, `${p.name}【反间】展示`);
      if (show.suit !== chosen) {
        await damage(st, p, t, { amount: 1, cause: 'fanjian' });
        st.log(`<b>${p.name}</b>【反间】花色不符，<b>${t.name}</b> 受1点伤害`);
      } else {
        removeFromHand(p, [show]);
        t.hand.push(show);
        st.log(`<b>${p.name}</b>【反间】花色符合，<b>${t.name}</b> 获得【${show.name}】`);
      }
      return true;
    }
    case 'yijue': {
      const t = pickedTarget[0] || st.alivePlayers().find(x => x !== p && areEnemies(st, p, x));
      if (!t || !p.hand.length) return false;
      p.skillUseFlag.add('yijue');
      const r = await pinPoint(st, p, t);
      if (r && r.winner === p) {
        t.mark.noShanResponse = true;
        t.mark.cantRecover = true;
        st.log(`<b>${p.name}</b>【义绝】胜！<b>${t.name}</b> 本回合不能出闪/不能回复`);
      } else if (r) st.log(`<b>${p.name}</b>【义绝】未胜`);
      return true;
    }
    case 'tianyi': {
      const t = pickedTarget[0] || st.alivePlayers().find(x => x !== p && areEnemies(st, p, x));
      if (!t || !p.hand.length) return false;
      p.skillUseFlag.add('tianyi');
      const r = await pinPoint(st, p, t);
      if (r && r.winner === p) {
        p.mark.extraShaAllowed = (p.mark.extraShaAllowed || 0) + 1;
        st.log(`<b>${p.name}</b>【天义】胜！本回合【杀】次数+1`);
      } else if (r && r.winner) {
        p.mark.shaDisabled = true;
        st.log(`<b>${p.name}</b>【天义】负！本回合不能使用【杀】`);
      }
      return true;
    }
    case 'yuanmen': {
      const t = pickedTarget[0] || st.alivePlayers().find(x => x !== p && areEnemies(st, p, x));
      if (!t || !p.hand.length) return false;
      p.skillUseFlag.add('yuanmen');
      const r = await pinPoint(st, p, t);
      if (r && r.winner === p) {
        const vSha = { id:'v_sha_yuan', defId:'sha', name:'杀', type:'basic', suit:'s', rank:1, _virtual: true };
        st.log(`<b>${p.name}</b>【辕门】胜！视为对 <b>${t.name}</b> 使用一张【杀】`);
        UI.showUsed(st, p, vSha, [t]);
        await CardResolver.resolveSha(st, p, t, vSha, { unblockable: true });
      }
      return true;
    }
    case 'lijian': {
      const males = st.alivePlayers().filter(x => x !== p && x.gender === 'M');
      if (males.length < 2 || !p.hand.length) return false;
      let a, b;
      if (pickedTarget.length >= 2) { a = pickedTarget[0]; b = pickedTarget[1]; }
      else {
        const enemies = males.filter(x => areEnemies(st, p, x));
        [a, b] = enemies.length >= 2 ? [enemies[0], enemies[1]]
                                       : (enemies[0] ? [enemies[0], males.find(m => m !== enemies[0])] : [males[0], males[1]]);
      }
      if (!a || !b || a === b) return false;
      p.skillUseFlag.add('lijian');
      discardCards(st, p, [p.hand[0]], '离间');
      st.log(`<b>${p.name}</b>【离间】让 <b>${a.name}</b> 与 <b>${b.name}</b> 决斗，先手：${a.name}`);
      await _juedouFirstA(st, a, b);
      return true;
    }
  }
  return false;
}

async function _juedouFirstA(st, a, b) {
  const { askForCard } = await import('./engine.js');
  let cur = a, opp = b;
  while (cur && cur.alive && opp && opp.alive) {
    const need = (opp.hasSkill('wushuang') && cur === a) ? 2 : 1;
    let gave = 0;
    for (let i = 0; i < need; i++) {
      const ans = await askForCard(st, cur, ['sha'], { source: b, target: cur, cause: 'juedou' });
      if (!ans) break;
      await playCard(st, cur, ans);
      gave++;
    }
    if (gave < need) { await damage(st, opp, cur, { amount: 1, cause: 'juedou' }); break; }
    const t = cur; cur = opp; opp = t;
  }
}

// 附加 AI 方法
AI.pickFromWuGu = (st, p, pool) => {
  if (!pool.length) return null;
  const pref = ['tao','sha','jiu','wuxie','wuzhongseng','shunshou','guohe','juedou','huogong','wanjian','nanman','shan'];
  return pool.slice().sort((a,b) => {
    const ia = pref.indexOf(a.defId), ib = pref.indexOf(b.defId);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  })[0];
};
AI.pickFireAttackShow = (st, p, t) => {
  const cnt = { s:0, h:0, c:0, d:0 };
  p.hand.forEach(c => cnt[c.suit]++);
  const suits = Object.keys(cnt).sort((a,b) => cnt[a] - cnt[b]);
  return p.hand.find(c => c.suit === suits[0]) || p.hand[0];
};
AI.shouldUseWuxie = (st, p, defId, source, target) => {
  const critical = ['juedou','nanman','wanjian','shandian','le','bingliang','huogong','tiesuo'].includes(defId);
  if (!critical) return false;
  return areEnemies(st, p, target) || p === target;
};
AI.shouldCounterWuxie = (st, p, wuUser, defId, target) => {
  return areAllies(st, p, wuUser) && !areAllies(st, p, target);
};
AI.shouldUseTianxiang = (st, p, ctx) => {
  if ((ctx.amount || 0) < 1) return false;
  const enemies = st.alivePlayers().filter(x => x !== p && areEnemies(st, p, x));
  return enemies.length > 0 && p.hand.some(c => c.suit === 'h');
};
AI.tryGuicai = (st, p, currentCard, target, judgeName) => {
  const critical = ['shandian','le','bingliang','tieqi','ganglie','luoshen','tiandu'].includes(judgeName);
  if (!critical) return null;
  const isEnemyTarget = areEnemies(st, p, target);
  if (judgeName === 'shandian') {
    if (isEnemyTarget) {
      const sp = p.hand.filter(c => c.suit === 's' && c.rank >= 2 && c.rank <= 9);
      if (sp.length) return sp[0];
    } else {
      const good = p.hand.filter(c => !(c.suit === 's' && c.rank >= 2 && c.rank <= 9));
      if (good.length) return good[0];
    }
  }
  return null;
};
AI.tryGuidao = (st, p, currentCard, target, judgeName) => {
  const critical = ['shandian','le','bingliang','tieqi','ganglie','luoshen','tiandu'].includes(judgeName);
  if (!critical) return null;
  const isEnemyTarget = areEnemies(st, p, target);
  const blacks = p.hand.filter(c => c.suit === 's' || c.suit === 'c');
  if (!blacks.length) return null;
  if (judgeName === 'shandian' && isEnemyTarget) {
    const sp = blacks.filter(c => c.suit === 's' && c.rank >= 2 && c.rank <= 9);
    if (sp.length) return sp[0];
  }
  return null;
};
AI.chooseGuanxing = (st, p, view) => {
  const good = ['tao','sha','jiu','wuxie','wuzhongseng','shunshou','guohe','nuliang'];
  const top = view.filter(c => good.includes(c.defId) || c.type === 'equip');
  const bot = view.filter(c => !top.includes(c));
  return { top: top.length ? top : view.slice(0,1), bottom: bot.length ? bot : view.slice(1) };
};
