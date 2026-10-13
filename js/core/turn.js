// 回合流程 & 主动阶段驱动
import { UI } from './ui-bridge.js';
import { AI } from './ai-bridge.js';
import { draw, addToDiscard, removeFromHand, areEnemies, areAllies } from './state.js';
import { drawCards, judge, damage, heal, loseHp, discardToHandLimit, askForCard, useCard, checkGameEnd, pinPoint } from './engine.js';
import { Skills } from './skills.js';
import { CardResolver } from './cards-resolver.js';

export const Turn = {
  // 游戏开始后的第一个回合入口
  async begin(gameState) {
    const st = gameState;
    // 找主公（身份局）或队伍 A 首位
    let startIdx = 0;
    if (st.mode === 'identity') startIdx = st.players.findIndex(p => p.isLord());
    if (startIdx < 0) startIdx = 0;
    st.currentIdx = startIdx;
    st.round = 1;
    await this.turn(st);
  },
  async turn(st) {
    if (st.finished) return;
    const p = st.currentPlayer();
    if (!p.alive) { await this.next(st); return; }
    st.turnCount++;
    await st.emit('onTurnStart', { p });
    p.turnData = { usedSha: false, shaCount: 0, usedSkills: new Set(), converted: new Set(), luoyi: false, extraTargets: 0, noShan: false, wineNext: 0, danjingNext: 0 };
    // 清理上回合的临时标记
    p.mark.wineNext = 0;
    p.mark.danjingNext = 0;
    p.mark.luoyiActive = false;
    p.mark.tianyiWon = false;
    p.mark.tianyiLost = false;
    p.mark.extraShaAllowed = 0;
    p.mark.shaLimit = 1;
    p.mark.noRecover = false;
    UI.setTurnCount(st.turnCount, st.round);
    UI.setCurrentPlayer(p);
    st.log(`—— 第 ${st.round} 轮 · <b>${p.name}</b> 的回合 ——`, 'hdr');

    // 1. 准备阶段
    await this.phase(st, 'prepare', async () => {
      await Skills.onPrepare(st, p);
    });

    // 2. 判定阶段（延时锦囊）
    await this.phaseIf(st, p, 'judge', async () => {
      await resolveJudges(st, p);
    });

    // 3. 摸牌阶段
    await this.phaseIf(st, p, 'draw', async () => {
      if (p.mark.skipDraw) {
        st.log(`<b>${p.name}</b> 因【兵粮寸断】跳过摸牌阶段`);
        p.mark.skipDraw = false;
        return;
      }
      let skip = false;
      // 神速（夏侯渊）：跳过判定+摸牌
      if (p.hasSkill('shensu') && !p.turnData.shensuSkipped) {
        const choice = await UI.askSkillChoice(p, 'shensu', [
          { id: 'skipJudgeDraw', label: '跳过判定+摸牌阶段，视为使用一张【杀】' },
          { id: 'skipPlayDiscard', label: '跳过出牌+弃牌阶段，视为使用一张【杀】' },
          { id: 'none', label: '不发动' }
        ]);
        if (choice === 'skipJudgeDraw') {
          p.turnData.shensuSkipped = true;
          p.turnData.shensuSkipPlayDiscard = false;
          skip = true;
          // 视为使用一张【杀】（跳过后续阶段直接结算）
          await useVirtualSha(st, p, '神速');
        } else if (choice === 'skipPlayDiscard') {
          p.turnData.shensuSkipped = true;
          p.turnData.shensuSkipPlayDiscard = true;
          await useVirtualSha(st, p, '神速');
          // 直接结束回合
          await this.phase(st, 'end', async () => { await Skills.onEnd(st, p); });
          return await this.afterTurn(st, p, { skippedPlay: true });
        }
      }
      // 突袭（张辽）
      if (!skip && p.hasSkill('tuxi')) {
        const targets = st.alivePlayers().filter(t => t !== p && t.hand.length > 0);
        if (targets.length) {
          const use = await UI.askYesNo(p, '突袭', '是否放弃摸牌，改为获得至多两名其他角色的手牌？');
          if (use) {
            const picked = await (p.isHuman ? UI.chooseTargets(p, targets, { min:1, max:2, title:'突袭：选择最多两名角色' }) : AI.decideTargets(st, p, 'tuxi', targets, 2));
            if (picked && picked.length) {
              skip = true;
              let gained = 0;
              for (const t of picked) {
                if (t.hand.length === 0) continue;
                const card = t.isHuman ? t.hand[0] : t.hand[Math.floor(Math.random() * t.hand.length)];
                // 随机抽取（其他玩家手牌背面）
                const pick = t.hand.splice(Math.floor(Math.random() * t.hand.length), 1)[0];
                p.hand.push(pick);
                gained++;
                st.log(`<b>${p.name}</b> 【突袭】获得 <b>${t.name}</b> 的一张手牌`);
              }
              if (gained && p.hasSkill('zhengchen')) {
                if (await UI.askYesNo(p, '征尘', '本回合手牌上限+2？')) {
                  p.mark.handLimitBonus = (p.mark.handLimitBonus || 0) + 2;
                }
              }
            }
          }
        }
      }
      // 英姿（周瑜）
      let drawN = 2;
      if (!skip && p.hasSkill('yingzi')) drawN = 3;
      // 裸衣（许褚）
      if (!skip && p.hasSkill('luoyi')) {
        if (await UI.askYesNo(p, '裸衣', '少摸1张牌，本回合【杀】/【决斗】伤害+1？')) {
          drawN = Math.max(0, drawN - 1);
          p.mark.luoyiActive = true;
        }
      }
      // 双雄（颜良文丑）
      if (!skip && p.hasSkill('shuangxiong')) {
        const use = await UI.askYesNo(p, '双雄', '是否摸牌阶段改为展示牌堆顶一张牌并获得？');
        if (use) {
          const c = draw(st, 1)[0];
          if (c) {
            UI.revealCard(c, `${p.name} 【双雄】展示`);
            p.hand.push(c);
            p.mark.shuangxiongSuit = c.suit;
            st.log(`<b>${p.name}</b> 【双雄】展示获得【${c.name}】(${suitText(c)})，本回合可将不同花色的手牌当【决斗】使用`);
            skip = true;
          }
        }
      }
      if (!skip) drawCards(st, p, drawN);
      await Skills.onDrawPhaseDone(st, p);
    });

    // 4. 出牌阶段
    if (!p.turnData.shensuSkipPlayDiscard) {
      let skipPlay = false;
      // 乐不思蜀在判定阶段处理，若已标记 skipPlay 则跳过
      if (p.mark.skipPlay) { skipPlay = true; p.mark.skipPlay = false; }
      if (!skipPlay) {
        await this.phase(st, 'play', async () => {
          if (p.isHuman) {
            // 由玩家驱动，等待"结束出牌"按钮
            await UI.waitEndPlayPhase(p);
          } else {
            await AI.decidePlayPhase(st, p);
          }
        });
      }
    } else {
      st.log(`<b>${p.name}</b> 跳过出牌阶段（神速）`);
    }

    // 5. 弃牌阶段
    if (!p.turnData.shensuSkipPlayDiscard) {
      await this.phase(st, 'discard', async () => {
        await discardToHandLimit(st, p);
      });
    } else {
      st.log(`<b>${p.name}</b> 跳过弃牌阶段（神速）`);
    }

    // 快航：跳过出牌阶段后（已用神速）可弃此牌摸两张 — 简化：主动询问
    if (p.equip.horseA?.defId === 'kuaihang' && p.turnData.shensuSkipPlayDiscard) {
      if (await UI.askYesNo(p, '快航', '弃掉【快航】改为摸两张牌？')) {
        addToDiscard(st, p.equip.horseA);
        p.equip.horseA = null;
        drawCards(st, p, 2);
      }
    }

    // 6. 结束阶段
    await this.phase(st, 'end', async () => {
      await Skills.onEnd(st, p);
      // 崩坏（董卓）
      if (p.hasSkill('bengtui')) {
        const minHp = Math.min(...st.alivePlayers().map(x => x.hp));
        if (p.hp > minHp) {
          // 失去1点体力 或 弃一张牌（AI/玩家选择）
          const choice = await (p.isHuman
            ? UI.askMultiChoice(p, '崩坏', ['失去1点体力', '弃一张手牌'])
            : (p.hand.length > 0 ? ['discard'] : ['loseHp']));
          if (choice === '失去1点体力' || choice === 'loseHp') await loseHp(st, p, 1, '崩坏');
          else if (p.hand.length) {
            const pick = p.isHuman ? await UI.chooseDiscard(st, p, 1) : AI.pickDiscard(st, p, 1);
            if (pick) discardFromHand(st, p, pick, '崩坏');
          }
        }
      }
    });

    await this.afterTurn(st, p);
  },
  async afterTurn(st, p, opts = {}) {
    // 清理本回合标记
    await st.emit('onTurnEnd', { p });
    if (p.mark.handLimitBonus) { p.mark.handLimitBonus = 0; }
    p.mark.wineNext = 0;
    p.mark.danjingNext = 0;
    p.mark.luoyiActive = false;
    p.mark.tianyiWon = false;
    p.mark.tianyiLost = false;
    p.mark.extraShaAllowed = 0;
    p.mark.noRecover = false;
    p.turnData = null;
    if (st.finished) return;
    await this.next(st);
  },
  async next(st) {
    if (st.finished) return;
    st.currentIdx = st.nextAliveFrom(st.currentIdx, 1);
    // 新一轮
    if (st.currentIdx <= (st._lastIdx ?? -1)) st.round++;
    st._lastIdx = st.currentIdx;
    // 每回合重置各武将回合外的"每角色每回合限一次"标记
    st.players.forEach(pp => { pp._perTurnSkillUsed = null; });
    await this.turn(st);
  },
  async phase(st, phase, fn) {
    if (st.finished) return;
    st.phase = phase;
    UI.setPhase(phase, st.currentPlayer());
    await fn();
    await UI.syncAll(st);
  },
  async phaseIf(st, p, phase, fn) {
    if (st.finished) return;
    st.phase = phase;
    UI.setPhase(phase, p);
    await fn();
    await UI.syncAll(st);
  }
};

function suitText(c) { return { s:'♠', h:'♥', c:'♣', d:'♦' }[c.suit] + c.rank; }

export function discardFromHand(st, p, cards, reason = '') {
  const arr = Array.isArray(cards) ? cards : [cards];
  const removed = removeFromHand(p, arr);
  addToDiscard(st, removed);
  if (removed.length && reason) st.log(`<b>${p.name}</b> ${reason}弃置${removed.length}张牌`);
  return removed;
}

// 神速：视为使用一张【杀】
export async function useVirtualSha(st, p, from = '') {
  // 选目标（在攻击范围内）
  const targets = st.alivePlayers().filter(t => t !== p && canHitTarget(st, p, t, 'sha'));
  if (targets.length === 0) { st.log(`<b>${p.name}</b>【${from}】无目标`); return; }
  const chosen = p.isHuman
    ? await UI.chooseTargets(p, targets, { min:1, max:1, title:`${from}：选择【杀】的目标` })
    : AI.decideTargets(st, p, 'sha', targets, 1);
  if (!chosen || !chosen.length) return;
  const virtualSha = makeVirtualCard('sha');
  st.log(`<b>${p.name}</b>【${from}】视为使用一张【杀】→ <b>${chosen[0].name}</b>`);
  UI.showUsed(st, p, virtualSha, chosen);
  await CardResolver.resolveSha(st, p, chosen[0], virtualSha, { noShanFrom: 'shensu', fromSkill: 'shensu', unblockable: false });
  await checkGameEnd(st);
}
export function makeVirtualCard(defId, extra = {}) {
  const def = require_carddef(defId);
  return {
    id: 'v_' + defId + '_' + Math.random().toString(36).slice(2, 6),
    defId, name: def.name, type: def.type, subtype: def.subtype || '',
    suit: 's', rank: 1, _virtual: true, _base: def, ...extra
  };
}
function require_carddef(defId) {
  // 动态避免循环 import
  const m = CardResolver.CARD_DEFS;
  return m[defId] || { name: defId, type:'trick' };
}

// ============ 判定阶段（延时锦囊） ============
export async function resolveJudges(st, p) {
  while (p.judges.length) {
    // 从最后放置的开始（后放的先结）
    const j = p.judges[p.judges.length - 1];
    p.judges.pop();
    const defId = j.defId;
    st.log(`处理 <b>${p.name}</b> 头顶的【${CardResolver.CARD_DEFS[defId].name}】`);
    UI.showDelayJudge(p, CardResolver.CARD_DEFS[defId].name);
    // 无懈可击询问
    const countered = await CardResolver.tryCounterTrick(st, defId, p, p, j.srcPlayer || null);
    if (countered) {
      addToDiscard(st, j.card);
      continue;
    }
    if (defId === 'le') {
      const r = await judge(st, p, { name:'乐不思蜀', judgeFilter: c => c.suit === 'h' });
      if (r && !r.ok) {
        p.mark.skipPlay = true;
        st.log(`<b>${p.name}</b> 判定不为♥ —— 跳过出牌阶段`);
      } else {
        st.log(`<b>${p.name}</b> 判定为♥ —— 乐不思蜀不生效`);
      }
      addToDiscard(st, j.card);
    } else if (defId === 'shandian') {
      const r = await judge(st, p, { name:'闪电', judgeFilter: c => c.suit === 's' && c.rank >= 2 && c.rank <= 9 });
      if (r && r.ok) {
        addToDiscard(st, j.card);
        await damage(st, null, p, { amount: 3, type: 'thunder', cause: 'shandian' });
      } else {
        // 传到下家（若下家已判定过或有闪电则继续传）
        let nextIdx = st.nextAliveFrom(p.idx, 1);
        let guard = 0;
        while (guard++ < 20) {
          const nxt = st.players[nextIdx];
          if (!nxt.judges.some(j2 => j2.defId === 'shandian')) break;
          nextIdx = st.nextAliveFrom(nextIdx, 1);
        }
        const nxt = st.players[nextIdx];
        nxt.judges.push({ ...j });
        st.log(`闪电未被触发，转移到 <b>${nxt.name}</b> 头顶`);
      }
    } else if (defId === 'bingliang') {
      const r = await judge(st, p, { name:'兵粮寸断', judgeFilter: c => c.suit === 'c' });
      if (r && !r.ok) {
        p.mark.skipDraw = true;
        st.log(`<b>${p.name}</b> 判定不为♣ —— 跳过摸牌阶段`);
      } else {
        st.log(`<b>${p.name}</b> 判定为♣ —— 兵粮寸断不生效`);
      }
      addToDiscard(st, j.card);
    }
    await UI.syncAll(st);
  }
}

// 目标可成为【杀】目标（考虑空城、明光铠触发等）
export function canHitTarget(st, from, to, kind) {
  if (kind === 'sha') {
    if (to.hasSkill('kongcheng') && to.hand.length === 0) return false;
  }
  return true;
}
