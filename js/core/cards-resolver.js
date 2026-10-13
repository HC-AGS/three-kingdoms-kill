// 卡牌结算 — 每张牌的具体效果
import { UI } from './ui-bridge.js';
import { AI } from './ai-bridge.js';
import { draw, addToDiscard, removeFromHand, areEnemies, areAllies } from './state.js';
import { CARD_DEFS } from '../data/cards.js';
import {
  drawCards, judge, damage, heal, loseHp, askForCard, useCard, playCard,
  pinPoint, distance, canAttack, checkGameEnd, dying
} from './engine.js';

function suitTxt(c) { return { s:'♠', h:'♥', c:'♣', d:'♦' }[c.suit] + c.rank; }

export const CardResolver = {
  CARD_DEFS,

  async resolve(st, user, defId, card, targets, opts = {}) {
    const fn = HANDLERS[defId];
    if (fn) await fn(st, user, card, targets, opts);
    else st.log(`未实现【${defId}】`);
    await UI.syncAll(st);
  },

  // ====== 求响应"闪"（含八卦阵判定） ======
  async askShan(st, from, target, ctx = {}) {
    if (!target.alive) return null;
    // 落日弓 已令其本回合不能用闪响应
    if (target.mark.noShanResponse) return null;
    // 藤甲挡普通杀（在 damage 阶段处理），此处仍求闪
    // 八卦阵判定
    if (target.equip.armor?.defId === 'bagua' && !ctx.ignoreArmor) {
      if (await UI.askYesNo(target, '八卦阵', '进行判定（红色视为使用【闪】）？')) {
        const r = await judge(st, target, { name: '八卦阵', judgeFilter: c => c.suit === 'h' || c.suit === 'd' });
        if (r && r.ok) return { _virtualShan: true, card: null };
      }
    }
    // 明光铠：成为杀目标后可弃一张抵消
    if (target.equip.armor?.defId === 'mingguang' && ctx.cause === 'sha' && !target.mark.mingguangUsed) {
      if (await UI.askYesNo(target, '明光铠', '弃一张牌抵消此【杀】？（每回合限一次）')) {
        if (target.hand.length) {
          const pick = target.isHuman ? await UI.chooseDiscard(st, target, 1) : AI.pickDiscard(st, target, 1);
          if (pick) {
            removeFromHand(target, pick);
            addToDiscard(st, pick);
            target.mark.mingguangUsed = true;
            st.log(`<b>${target.name}</b>【明光铠】抵消此【杀】`);
            return { _blocked: true };
          }
        }
      }
    }
    // 需要几张闪
    let need = 1;
    // 无双（吕布）
    if (from?.hasSkill('wushuang')) need = 2;
    // 肉林（董卓）
    if (from?.hasSkill('roulin')) {
      if (from.gender === 'M' && target.gender === 'F') need = 2;
      if (target.gender === 'M' && from.gender === 'F') need = 2;
    }
    // 笃烈（太史慈）受杀时
    if (target.hasSkill('dulie') && ctx.cause === 'sha') {
      if (await UI.askYesNo(target, '笃烈', '令此【杀】需两张【闪】才能抵消？')) need = 2;
    }
    for (let i = 0; i < need; i++) {
      const ans = await askForCard(st, target, ['shan'], { source: from, target, cause: ctx.cause });
      if (!ans) return null;
      await playCard(st, target, ans);
      st.log(`<b>${target.name}</b> 打出【闪】(${i+1}/${need})`);
      // 雷击（张角）
      if (target.hasSkill('leiji')) {
        const targets = st.alivePlayers().filter(x => x !== target);
        if (targets.length) {
          const use = await (target.isHuman
            ? UI.askYesNo(target, '雷击', `使用【闪】后是否发动雷击？`)
            : AI.decideSkillUse(st, target, 'leiji'));
          if (use) {
            const pick = target.isHuman
              ? (await UI.chooseTargets(target, targets, { min:1, max:1, title:'雷击：选择判定角色' }))[0]
              : AI.decideTargets(st, target, 'leiji', targets, 1)[0];
            if (pick) {
              const r = await judge(st, pick, { name:'雷击', judgeFilter: c => c.suit === 's' });
              st.log(`<b>${pick.name}</b> 雷击判定`);
              if (r && r.ok) {
                await damage(st, target, pick, { amount: 2, type: 'thunder', cause: 'leiji' });
              }
            }
          }
        }
      }
    }
    return true;
  },

  // ====== 求【杀】响应（决斗 / 南蛮 / 借刀） ======
  async askSha(st, from, target, ctx = {}) {
    return askForCard(st, target, ['sha'], { source: from, target, cause: ctx.cause });
  },

  // ====== 求【桃】 ======
  async askTao(st, target, ctx = {}) {
    return askForCard(st, target, ['tao'], { cause: ctx.cause, target, isSelf: ctx.isSelf });
  },

  // ====== 无懈可击询问 ======
  // 当一张锦囊牌 effectTargeted 前询问：所有存活玩家（可对自己或对方使用无懈）
  async tryCounterTrick(st, defId, source, target, actor = null) {
    const trick = CARD_DEFS[defId];
    if (!trick || trick.type !== 'trick') return false;
    const defName = trick.name;
    // 无懈可击可以打给别人身上的锦囊
    let counterUsed = false;
    let rounds = 0;
    let countering = false; // 当前询问是否要抵消
    while (rounds++ < 20) {
      let someone = null;
      for (const p of st.alivePlayers()) {
        if (counterUsed) break;
        if (!countering) {
          // 询问是否使用无懈可击
          const wantUse = p.hand.some(c => c.defId === 'wuxie') || (p.hasSkill('qicai') && p.equip && Object.values(p.equip).filter(Boolean).length);
          if (!wantUse) continue;
          const shouldCounter = p.isHuman
            ? await UI.askYesNo(p, '无懈可击', `是否使用【无懈可击】抵消【${defName}】对 <b>${target.name}</b> 的效果？`)
            : AI.shouldUseWuxie(st, p, defId, source, target);
          if (shouldCounter) { someone = p; break; }
        }
      }
      if (!someone) break;
      // 打出无懈可击
      const card = pickWuxieFromHand(someone);
      if (!card) break;
      await useCard(st, someone, card, { targets: [target] });
      counterUsed = true;
      st.log(`<b>${someone.name}</b> 使用【无懈可击】`);
      countering = true;
      // 询问是否再用无懈可击抵消前一张
      let counteredCounter = false;
      for (const p of st.alivePlayers()) {
        const wantUse = p.hand.some(c => c.defId === 'wuxie');
        if (!wantUse) continue;
        const should = p.isHuman
          ? await UI.askYesNo(p, '反无懈', `是否用【无懈可击】抵消 <b>${someone.name}</b> 的【无懈可击】？`)
          : AI.shouldCounterWuxie(st, p, someone, defId, target);
        if (should) {
          const c2 = pickWuxieFromHand(p);
          if (!c2) continue;
          await useCard(st, p, c2, { targets: [someone] });
          counterUsed = false;
          counteredCounter = true;
          break;
        }
      }
      if (!counteredCounter) break;
      countering = false;
    }
    return counterUsed;
  },

  // ====== 杀：主要结算 ======
  async resolveSha(st, from, target, card, opts = {}) {
    if (!target || !target.alive) return;
    st.log(`<b>${from.name}</b> 对 <b>${target.name}</b> 使用【杀】`);
    // 触发杀指定目标后（铁骑/烈弓/落日弓/雌雄双股剑）
    await st.emit('onShaAssignTarget', { from, target, card, opts });
    // 雌雄双股剑
    if (from.equip.weapon?.defId === 'shuanggu' && from.gender !== target.gender) {
      const use = await UI.askYesNo(from, '雌雄双股剑', '发动武器效果？');
      if (use) {
        const choice = target.isHuman
          ? await UI.askMultiChoice(target, '雌雄双股剑', ['弃一张手牌', '让其摸一张牌'])
          : (Math.random() < 0.5 ? '弃一张手牌' : '让其摸一张牌');
        if (choice === '弃一张手牌') {
          if (target.hand.length) {
            const pick = target.isHuman ? await UI.chooseDiscard(st, target, 1) : AI.pickDiscard(st, target, 1);
            if (pick) { removeFromHand(target, pick); addToDiscard(st, pick); }
          }
        } else {
          drawCards(st, from, 1);
        }
      }
    }
    // 落日弓
    if (from.equip.weapon?.defId === 'luori') {
      const use = await UI.askYesNo(from, '落日弓', '令本回合该角色不能用【闪】响应下一张【杀】？');
      if (use) {
        target.mark.noShanResponse = true;
        target._noShanFrom = from.idx;
        st.log(`<b>${target.name}</b> 本回合不能用【闪】响应下一张【杀】`);
      }
    }
    // 铁骑（马超）
    if (from.hasSkill('tieqi') && !opts.unblockable) {
      const use = await UI.askYesNo(from, '铁骑', '进行判定：若不为♥，此【杀】不可被【闪】响应？');
      if (use) {
        const r = await judge(st, from, { name:'铁骑', judgeFilter: c => c.suit === 'h' });
        if (r && !r.ok) opts.unblockable = true;
      }
    }
    // 烈弓（黄忠）
    if (from.hasSkill('liegong') && !opts.unblockable) {
      const cond1 = target.hand.length >= from.hp;
      const cond2 = target.hand.length <= from.attackRange();
      if (cond1 || cond2) {
        const use = await UI.askYesNo(from, '烈弓', `满足条件（目标手牌${target.hand.length}张，你体力${from.hp}攻击范围${from.attackRange()}）：此【杀】不可被【闪】响应？`);
        if (use) opts.unblockable = true;
      }
    }
    // 仁王盾：黑色杀无效
    const effCard = card;
    if (target.equip.armor?.defId === 'renwang' && !opts.ignoreArmor && (effCard.suit === 's' || effCard.suit === 'c')) {
      if (from.equip.weapon?.defId !== 'qinggang') {
        st.log(`<b>${target.name}</b>【仁王盾】挡下黑色【杀】`);
        return await this.afterShaNoDamage(st, from, target, opts);
      }
    }
    // 青釭剑：无视目标防具
    const ignoreArmor = from.equip.weapon?.defId === 'qinggang' || opts.ignoreArmor;
    // 藤甲：普通杀无效（已在 damage 里判定），此处提前
    if (!ignoreArmor && target.equip.armor?.defId === 'tengjia') {
      st.log(`<b>${target.name}</b>【藤甲】挡下普通【杀】`);
      return await this.afterShaNoDamage(st, from, target, opts);
    }
    // 流离（大乔）
    if (target.hasSkill('liuli') && !opts.unblockable) {
      const use = await UI.askYesNo(target, '流离', '弃一张牌，将此【杀】转移给距离1以内的另一名角色？');
      if (use) {
        const others = st.alivePlayers().filter(p => p !== target && p !== from && distance(st, target, p) <= 1 && canHitTarget_(st, from, p, 'sha'));
        if (others.length) {
          const pick = target.isHuman
            ? (await UI.chooseTargets(target, others, { min:1, max:1, title:'流离：选择新目标' }))[0]
            : AI.decideTargets(st, target, 'liuli', others, 1)[0];
          if (pick) {
            if (target.hand.length) {
              const dpick = target.isHuman ? await UI.chooseDiscard(st, target, 1) : AI.pickDiscard(st, target, 1);
              if (dpick) { removeFromHand(target, dpick); addToDiscard(st, dpick); }
            }
            st.log(`<b>${target.name}</b>【流离】把【杀】转移给 <b>${pick.name}</b>`);
            return await this.resolveSha(st, from, pick, card, { ...opts, liuli: true });
          }
        }
      }
    }
    // 空城（诸葛亮）：无手牌不能成为杀目标 — 检查
    if (target.hasSkill('kongcheng') && target.hand.length === 0) {
      st.log(`<b>${target.name}</b>【空城】不受【杀】影响`);
      return await this.afterShaNoDamage(st, from, target, opts);
    }
    // 求闪
    if (!opts.unblockable) {
      const shanRes = await this.askShan(st, from, target, { cause: 'sha', ignoreArmor });
      if (shanRes && shanRes._blocked) {
        return await this.afterShaNoDamage(st, from, target, opts);
      }
      if (shanRes) {
        // 闪成功抵挡 —— 青龙偃月刀 / 贯石斧
        const blocked = true;
        if (from.equip.weapon?.defId === 'qinglong') {
          const use = await UI.askYesNo(from, '青龙偃月刀', '再追加一张【杀】？');
          if (use) {
            const extra = await (from.isHuman
              ? UI.chooseCardsFromHandForSha(from)
              : AI.pickShaFromHand(st, from));
            if (extra) {
              await useCard(st, from, extra, { targets: [target] });
              return;
            }
          }
        }
        if (from.equip.weapon?.defId === 'guanshi') {
          const use = await UI.askYesNo(from, '贯石斧', '弃两张手牌使【杀】仍然造成伤害？');
          if (use && from.hand.length >= 2) {
            const pick = from.isHuman ? await UI.chooseDiscard(st, from, 2) : AI.pickDiscard(st, from, 2);
            if (pick && pick.length === 2) {
              removeFromHand(from, pick);
              addToDiscard(st, pick);
              await damage(st, from, target, { amount: 1, cause: 'sha', source: card, ignoreArmor });
              return await this.afterShaDamage(st, from, target, card, opts);
            }
          }
        }
        return await this.afterShaNoDamage(st, from, target, opts);
      }
    }
    // 造成伤害
    await damage(st, from, target, { amount: 1, cause: 'sha', source: card, ignoreArmor });
    await this.afterShaDamage(st, from, target, card, opts);
  },
  async afterShaDamage(st, from, target, card, opts) {
    from.turnData && (from.turnData.usedSha = true);
    // 麒麟弓
    if (from.equip.weapon?.defId === 'qilin' && target.alive) {
      const hasHorse = target.equip.horseA || target.equip.horseD;
      if (hasHorse) {
        const use = await UI.askYesNo(from, '麒麟弓', '弃置目标一匹马？');
        if (use) {
          const which = (target.equip.horseA && target.equip.horseD)
            ? (from.isHuman ? await UI.askMultiChoice(from, '麒麟弓', ['弃进攻马', '弃防御马']) : '弃进攻马')
            : target.equip.horseA ? '弃进攻马' : '弃防御马';
          const key = which === '弃进攻马' ? 'horseA' : 'horseD';
          const h = target.equip[key];
          if (h) {
            target.equip[key] = null;
            addToDiscard(st, h);
            st.log(`<b>${from.name}</b>【麒麟弓】弃掉 <b>${target.name}</b> 的【${h.name}】`);
          }
        }
      }
    }
    // 虎痴（许褚）
    if (from.hasSkill('huchi') && target.alive && target.hand.length) {
      const use = await UI.askYesNo(from, '虎痴', '弃目标一张牌？');
      if (use) {
        const pickCard = target.isHuman ? target.hand[0] : target.hand[Math.floor(Math.random()*target.hand.length)];
        removeFromHand(target, [pickCard]);
        addToDiscard(st, pickCard);
        st.log(`<b>${from.name}</b>【虎痴】弃掉 <b>${target.name}</b> 一张牌`);
      }
    }
    // 奸雄（曹操）：受到伤害后获得造成伤害的牌 — 在 damage 后由 onDamageTaken 触发，此处不处理
    checkGameEnd(st);
  },
  async afterShaNoDamage(st, from, target, opts) {
    // 开山大斧：使用【杀】未造成伤害后，可弃置目标一张牌
    if (from.equip.weapon?.defId === 'kaishan' && target.alive) {
      if (target.hand.length || Object.values(target.equip).some(Boolean)) {
        const use = await UI.askYesNo(from, '开山大斧', '弃置目标一张牌？');
        if (use) {
          const pick = await pickARandomCardOf(st, from, target);
          if (pick) {
            takeOffEquipOrHand(st, target, pick);
            addToDiscard(st, pick);
            st.log(`<b>${from.name}</b>【开山大斧】弃掉 <b>${target.name}</b> 的【${pick.name}】`);
          }
        }
      }
    }
    from.turnData && (from.turnData.usedSha = true);
  },
};
function canHitTarget_(st, from, to, kind) {
  if (kind === 'sha') {
    if (to.hasSkill('kongcheng') && to.hand.length === 0) return false;
  }
  return true;
}
function pickWuxieFromHand(p) {
  // 优先使用【无懈可击】牌；奇才可用装备牌当无懈可击
  const idx = p.hand.findIndex(c => c.defId === 'wuxie');
  if (idx >= 0) return p.hand[idx];
  if (p.hasSkill('qicai')) {
    const eq = Object.values(p.equip).find(Boolean);
    if (eq) return { _virtual:true, _sources:[eq], _base: CARD_DEFS.wuxie, defId: 'wuxie', name:'无懈可击', type:'trick', suit: eq.suit, rank: eq.rank };
  }
  return null;
}
async function pickARandomCardOf(st, asker, target) {
  // 让 asker 选 target 的一张牌（手牌/装备）
  const hand = target.hand;
  const equips = Object.values(target.equip).filter(Boolean);
  if (hand.length === 0 && equips.length === 0) return null;
  if (hand.length && equips.length === 0) return hand[Math.floor(Math.random()*hand.length)];
  if (hand.length === 0) return equips[Math.floor(Math.random()*equips.length)];
  if (asker.isHuman) {
    return await UI.chooseOneOfAnyCard(asker, target);
  }
  return Math.random() < 0.5 ? hand[Math.floor(Math.random()*hand.length)] : equips[Math.floor(Math.random()*equips.length)];
}
function takeOffEquipOrHand(st, target, card) {
  for (const k of ['weapon','armor','horseA','horseD']) {
    if (target.equip[k] && target.equip[k].id === card.id) { target.equip[k] = null; return; }
  }
  removeFromHand(target, [card]);
  // 干将莫邪：失去时
  if (card.defId === 'ganjiang') {
    // 简化：让一名角色摸牌
    const aliveAll = st.alivePlayers();
    if (aliveAll.length) {
      const pick = aliveAll[0];
      drawCards(st, pick, 1);
      st.log(`<b>${pick.name}</b> 因【干将莫邪】失去摸一张牌`);
    }
  }
}

// =============== 每张牌的处理器 ===============
const HANDLERS = {
  // ===== 基本牌 =====
  async sha(st, from, card, targets) {
    if (!targets || !targets.length) return;
    for (const t of targets) {
      await CardResolver.resolveSha(st, from, t, card, {});
      if (st.finished) return;
    }
  },
  async shan(st, p, card, targets) {
    // 闪作为使用牌通常无目标；仅打出。这里空实现。
  },
  async tao(st, p, card, targets) {
    if (!targets || !targets.length) targets = [p];
    const t = targets[0];
    // 只能对自己 或 濒死角色
    if (t === p || t.hp < t.maxHp) await heal(st, t, 1, p);
  },
  async jiu(st, p, card, targets) {
    // 使用【酒】：本回合下一张【杀】伤害+1
    p.mark.wineNext = (p.mark.wineNext || 0) + 1;
    st.log(`<b>${p.name}</b> 使用【酒】，本回合下一张【杀】伤害+1`);
  },

  // ===== 延时锦囊（放置头顶） =====
  async le(st, from, card, targets) {
    for (const t of targets) await placeDelay(st, from, t, 'le', card);
  },
  async shandian(st, from, card, targets) {
    for (const t of targets) await placeDelay(st, from, t, 'shandian', card);
  },
  async bingliang(st, from, card, targets) {
    for (const t of targets) await placeDelay(st, from, t, 'bingliang', card);
  },

  // ===== 普通锦囊 =====
  async wuzhongseng(st, p, card) {
    drawCards(st, p, 2);
  },
  async guohe(st, p, card, targets) {
    for (const t of targets) {
      await discardOneAnyCardOf(st, p, t);
      // 锦帆：甘宁
      if (p.hasSkill('jinfan') && t.alive) {
        const use = await UI.askYesNo(p, '锦帆', `令 <b>${t.name}</b> 本回合不能使用与被弃置牌同类型的牌？`);
        if (use) {
          t.mark.jinfanBlocked = true;
          t._jinfanBy = p.idx;
        }
      }
    }
  },
  async shunshou(st, p, card, targets) {
    for (const t of targets) {
      const pick = await pickARandomCardOf(st, p, t);
      if (pick) {
        takeOffEquipOrHand(st, t, pick);
        p.hand.push(pick);
        st.log(`<b>${p.name}</b> 【顺手牵羊】获得 <b>${t.name}</b> 的【${pick.name}】`);
      }
    }
  },
  async juedou(st, p, card, targets) {
    const t = targets[0];
    if (!t) return;
    // 无双：吕布对目标需两张杀
    const needShaPerTurn = (target) => (p.hasSkill('wushuang') && target !== p) ? 2 : 1;
    let cur = t; // 由被指定者先出
    while (cur && cur.alive) {
      const need = needShaPerTurn(cur);
      let gave = 0;
      for (let i = 0; i < need; i++) {
        const ans = await askForCard(st, cur, ['sha'], { source: p, target: cur, cause: 'juedou' });
        if (!ans) break;
        await playCard(st, cur, ans);
        gave++;
      }
      if (gave < need) {
        // 未打出 => 受1点伤害
        await damage(st, p, cur, { amount: 1, cause: 'juedou' });
        if (p.hasSkill('xiaoyong')) {
          drawCards(st, p, 1);
          st.log(`<b>${p.name}</b>【骁勇】摸一张牌`);
        }
        break;
      }
      cur = cur === t ? p : t;
    }
  },
  async nanman(st, p, card, targets) {
    const order = st.alivePlayers().filter(x => x !== p);
    for (const t of order) {
      if (!t.alive) continue;
      // 藤甲挡南蛮
      if (t.equip.armor?.defId === 'tengjia') { st.log(`<b>${t.name}</b>【藤甲】挡下南蛮入侵`); continue; }
      const ans = await askForCard(st, t, ['sha'], { source: p, target: t, cause: 'nanman' });
      if (ans) { await playCard(st, t, ans); }
      else {
        await damage(st, p, t, { amount: 1, cause: 'nanman' });
      }
    }
  },
  async wanjian(st, p, card, targets) {
    const order = st.alivePlayers().filter(x => x !== p);
    for (const t of order) {
      if (!t.alive) continue;
      // 藤甲挡万箭
      if (t.equip.armor?.defId === 'tengjia') { st.log(`<b>${t.name}</b>【藤甲】挡下万箭齐发`); continue; }
      const res = await CardResolver.askShan(st, p, t, { cause: 'wanjian' });
      if (!res) await damage(st, p, t, { amount: 1, cause: 'wanjian' });
    }
  },
  async taoyuan(st, p, card, targets) {
    for (const t of st.alivePlayers()) {
      if (t.hp < t.maxHp) await heal(st, t, 1, p);
    }
  },
  async wugu(st, p, card, targets) {
    const alive = st.alivePlayers();
    const n = alive.length;
    const revealed = draw(st, n);
    const pool = revealed.slice();
    UI.showWuGuReveal(pool);
    st.log(`【五谷丰登】亮出 ${pool.length} 张牌`);
    // 从当前使用者开始
    const order = [];
    let idx = p.idx;
    for (let i = 0; i < n; i++) {
      while (!st.players[idx].alive) idx = (idx + 1) % st.players.length;
      order.push(st.players[idx]);
      idx = (idx + 1) % st.players.length;
    }
    for (const who of order) {
      if (pool.length === 0) break;
      const pick = who.isHuman
        ? await UI.chooseWuGu(who, pool)
        : AI.pickFromWuGu(st, who, pool);
      if (pick) {
        const i = pool.indexOf(pick);
        if (i >= 0) pool.splice(i, 1);
        who.hand.push(pick);
        st.log(`<b>${who.name}</b> 从五谷中获得【${pick.name}】`);
      }
    }
    // 剩下的入弃牌堆
    addToDiscard(st, pool);
    UI.hideWuGu();
  },
  async wuxie(st, p, card, targets) {
    // 已经在使用时触发，这里不做额外处理
  },
  async jiedao(st, p, card, targets) {
    // 借刀杀人：需要两个目标 — [装备武器者, 其攻击范围内角色]
    const [actor, victim] = targets;
    if (!actor || !victim) return;
    if (!actor.equip.weapon) return;
    const range = actor.attackRange();
    // 检查是否在攻击范围内
    const dist = distance(st, actor, victim);
    const canHit = actor.equip.horseA?.defId === 'baima' || dist <= range;
    if (!canHit) return;
    // 求 actor 对 victim 使用【杀】
    const ans = await askForCard(st, actor, ['sha'], { source: p, target: victim, cause: 'jiedao' });
    if (ans) {
      await playCard(st, actor, ans);
      // 视为使用一张杀（结算）
      const vSh = { ...ans, _fromJiedao: true };
      await CardResolver.resolveSha(st, actor, victim, vSh, {});
    } else {
      // 武器装备转给 p
      const w = actor.equip.weapon;
      actor.equip.weapon = null;
      p.hand.push(w);
      st.log(`<b>${p.name}</b> 获得 <b>${actor.name}</b> 的【${w.name}】`);
    }
  },
  async huogong(st, p, card, targets) {
    // 火攻：p 展示一张手牌；target 展示一张同花色手牌；target 弃之，否则受1火焰伤害
    if (!targets.length) return;
    const t = targets[0];
    if (!p.hand.length) return;
    const show = p.isHuman ? await UI.chooseOneHandCardOf(p, p.hand, '火攻：展示一张手牌') : AI.pickFireAttackShow(st, p, t);
    if (!show) return;
    UI.revealCard(show, `${p.name} 【火攻】展示`);
    if (t.hand.length === 0) { await damage(st, p, t, { amount: 1, type: 'fire', cause: 'huogong' }); return; }
    const same = t.hand.filter(c => c.suit === show.suit);
    if (same.length === 0) { await damage(st, p, t, { amount: 1, type: 'fire', cause: 'huogong' }); return; }
    const pick = t.isHuman ? await UI.chooseOneHandCardOf(t, same, `火攻：弃一张${suitTxt(show)}手牌`) : same[0];
    if (pick) {
      removeFromHand(t, [pick]);
      addToDiscard(st, pick);
      UI.revealCard(pick, `${t.name} 弃置`);
      st.log(`<b>${t.name}</b> 弃置同花色牌`);
    }
  },
  async tiesuo(st, p, card, targets) {
    if (!targets.length) {
      // 解除所有连环
      st.alivePlayers().forEach(x => { if (x.chained) { x.chained = false; st.log(`<b>${x.name}</b> 的连环状态被解除`); } });
      return;
    }
    for (const t of targets) {
      t.chained = !t.chained;
      st.log(`<b>${t.name}</b> ${t.chained ? '进入' : '解除'}连环状态`);
    }
  },
  async zhiji(st, p, card, targets) {
    const t = targets[0];
    if (!t) return;
    if (t.hand.length === 0) { st.log(`<b>${t.name}</b> 无手牌`); return; }
    await UI.revealHandCards(t);
    st.log(`<b>${p.name}</b>【知己知彼】查看了 <b>${t.name}</b> 的手牌`);
  },

  // ===== 装备 =====
  // 装备作为使用牌 —— 直接穿上
  async nuliang(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async shuanggu(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async qinggang(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async qinglong(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async zhangba(st, p, card, targets, opts) {
    // 丈八蛇矛：可将两张手牌当【杀】使用 — 使用此牌本身即装备
    if (opts.fromEquip) return; // 已经装备
    equipSlot(st, p, card, 'weapon');
  },
  async guanshi(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async fangtian(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async qilin(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async ganjiang(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async kaishan(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async luori(st, p, card) { equipSlot(st, p, card, 'weapon'); },
  async bagua(st, p, card) { equipSlot(st, p, card, 'armor'); },
  async renwang(st, p, card) { equipSlot(st, p, card, 'armor'); },
  async tengjia(st, p, card) { equipSlot(st, p, card, 'armor'); },
  async mingguang(st, p, card) { equipSlot(st, p, card, 'armor'); },
  async chitu(st, p, card) { equipSlot(st, p, card, 'horseA'); },
  async dilu(st, p, card) { equipSlot(st, p, card, 'horseD'); },
  async jueying(st, p, card) { equipSlot(st, p, card, 'horseD'); },
  async zhaohuang(st, p, card) { equipSlot(st, p, card, 'horseA'); },
  async baima(st, p, card) { equipSlot(st, p, card, 'horseA'); },
  async zixin(st, p, card) { equipSlot(st, p, card, 'horseD'); },
  async jingfan(st, p, card) { equipSlot(st, p, card, 'horseA'); }, // 惊帆既算攻又算防；为简化按 horseA 处理但 distance 里 horseD 也加成 — 这里特殊：作为 horseA，且 distance 函数额外检测
  async kuaihang(st, p, card) { equipSlot(st, p, card, 'horseA'); }
};

// ============ 装备穿戴 ============
export function equipSlot(st, p, card, slot) {
  const old = p.equip[slot];
  if (old) {
    addToDiscard(st, old);
    st.log(`<b>${p.name}</b> 替换装备：弃掉【${old.name}】`);
    // 干将莫邪被替换：一名角色摸1张
    if (old.defId === 'ganjiang') {
      const alive = st.alivePlayers();
      if (alive.length) {
        const pick = alive[0];
        drawCards(st, pick, 1);
        st.log(`<b>${pick.name}</b> 因【干将莫邪】失去而摸牌`);
      }
    }
  }
  removeFromHand(p, [card]);
  p.equip[slot] = card;
  st.log(`<b>${p.name}</b> 装备了【${card.name}】`);
  // 惊帆特殊：视为既 horseA 又 horseD 的效果 — 我们已在 distance 里检测
}
export async function placeDelay(st, from, target, defId, card) {
  target.judges.push({ defId, card, srcIdx: from.idx, srcPlayer: from });
  st.log(`<b>${target.name}</b> 头顶放上【${CARD_DEFS[defId].name}】`);
}
async function discardOneAnyCardOf(st, asker, target) {
  const pick = await pickARandomCardOf(st, asker, target);
  if (!pick) return null;
  takeOffEquipOrHand(st, target, pick);
  addToDiscard(st, pick);
  st.log(`<b>${asker.name}</b> 弃置 <b>${target.name}</b> 的【${pick.name}】`);
  return pick;
}
