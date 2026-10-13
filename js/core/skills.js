// 技能钩子集合 — 每个武将技能在此绑定到 state.emit 事件
import { UI } from './ui-bridge.js';
import { AI } from './ai-bridge.js';
import { draw, addToDiscard, removeFromHand, areEnemies, areAllies } from './state.js';
import { drawCards, damage, heal, loseHp, judge, askForCard, pinPoint, distance, checkGameEnd } from './engine.js';
import { discardFromHand } from './turn.js';
import { CARD_DEFS } from '../data/cards.js';

export const Skills = {
  installAll(state) {
    // 全局钩子：血裔（袁绍主公技）手牌上限 + 群势力人数
    state.on('onTurnStart', () => {
      state.players.forEach(x => {
        if (x.hasSkill('xueyi') && x.isLord()) {
          const others = state.alivePlayers().filter(p => p !== x && p.fac === '群');
          x._xueCount = others.length;
        } else {
          x._xueCount = 0;
        }
      });
    });
    // 回合结束清理临时标记
    state.on('onTurnEnd', ({ p }) => {
      p.mark.noShanResponse = false;
      p.mark.cantRecover = false;
      p.mark.jinfanBlocked = false;
      p.mark.shaDisabled = false;
      p.mark.shaTargetPlus = 0;
      p.mark.mingguangUsed = false;
      p.skillUseFlag.clear();
    });
    // 为每个玩家安装技能钩子
    state.players.forEach(p => {
      // 奸雄（曹操）：受伤害后获得造成伤害的牌
      if (p.hasSkill('jianxiong')) {
        state.on('onDamageTaken', async ({ src, target, amount, cause, source }) => {
          if (target !== p || !p.alive) return;
          if (!source || !source._virtual) {
            if (source && state.discard.length) {
              // 找到该 source 牌（应该已经在弃牌堆或某处）
              const idx = state.discard.findIndex(c => c.id === source.id);
              if (idx >= 0) {
                if (await UI.askYesNo(p, '奸雄', `获得造成伤害的牌【${source.name}】？`)) {
                  const c = state.discard.splice(idx, 1)[0];
                  p.hand.push(c);
                  state.log(`<b>${p.name}</b>【奸雄】获得【${c.name}】`);
                }
              }
            }
          }
        });
      }
      // 魏王（曹操主公技）：其他魏势力角色每回合限一次可让主公摸一张
      if (p.hasSkill('weiwang') && p.isLord()) {
        state.on('onDrawPhaseDone', async ({ p: pp }) => {
          if (pp === p || !pp.alive || pp.fac !== '魏') return;
          if (pp._weiwangUsed) return;
          if (!p.alive) return;
          if (await UI.askYesNo(pp, '魏王', '让主公摸一张牌？（本回合限一次）')) {
            pp._weiwangUsed = true;
            drawCards(state, p, 1);
            state.log(`<b>${pp.name}</b>【魏王】让主公 <b>${p.name}</b> 摸一张牌`);
          }
        });
      }
      // 反馈（司马）：受伤害后获得来源一张牌
      if (p.hasSkill('fankui')) {
        state.on('onDamageTaken', async ({ src, target }) => {
          if (target !== p || !p.alive) return;
          if (!src || !src.alive) return;
          if (!src.hand.length && !Object.values(src.equip).some(Boolean)) return;
          if (await UI.askYesNo(p, '反馈', `获得 <b>${src.name}</b> 的一张牌？`)) {
            const pick = await takeOneCardOf(state, p, src);
            if (pick) state.log(`<b>${p.name}</b>【反馈】获得 <b>${src.name}</b> 的一张牌`);
          }
        });
      }
      // 刚烈（夏侯惇）：受伤害后判定，不为♥则来源弃两张或受1点伤
      if (p.hasSkill('ganglie')) {
        state.on('onDamageTaken', async ({ src, target }) => {
          if (target !== p || !p.alive) return;
          if (!src || !src.alive) return;
          if (await UI.askYesNo(p, '刚烈', `进行判定（不为♥：来源弃两张牌或受1点伤害）？`)) {
            const r = await judge(state, p, { name:'刚烈', judgeFilter: c => c.suit === 'h' });
            if (r && !r.ok) {
              const choice = src.isHuman
                ? await UI.askMultiChoice(src, '刚烈', ['弃两张牌', '受到1点伤害'])
                : (src.hand.length >= 2 ? '弃两张牌' : '受到1点伤害');
              if (choice === '弃两张牌') {
                const pick = src.isHuman ? await UI.chooseDiscard(state, src, 2) : AI.pickDiscard(state, src, 2);
                if (pick && pick.length >= 1) discardFromHand(state, src, pick.slice(0, 2), '刚烈');
              } else {
                await damage(state, p, src, { amount: 1, cause: 'ganglie' });
              }
            }
          }
        });
      }
      // 突袭（张辽）已在 turn.js 处理
      // 遗计（郭嘉）：受伤害后摸2张然后分配
      if (p.hasSkill('yiji')) {
        state.on('onDamageTaken', async ({ target }) => {
          if (target !== p || !p.alive) return;
          if (await UI.askYesNo(p, '遗计', '摸两张牌然后分配给任意角色？')) {
            const got = drawCards(state, p, 2);
            // 分配
            const alive = state.alivePlayers();
            if (got.length && alive.length > 1) {
              if (p.isHuman) await UI.distributeCards(p, got, alive);
              else {
                // AI 简单分配：全留或分给队友
                const friends = alive.filter(x => x !== p && areAllies(state, p, x));
                const give = friends.length ? got.slice(0,1) : [];
                give.forEach(c => {
                  const i = p.hand.indexOf(c); if (i>=0) p.hand.splice(i,1);
                  friends[0].hand.push(c);
                });
              }
            }
          }
        });
      }
      // 天妒（郭嘉）：判定牌生效后可获得 — engine.judge 已处理
      // 洛神（甄姬）：准备阶段判定，黑色收入手牌
      if (p.hasSkill('luoshen')) {
        state.on('onPrepare', async ({ target }) => {
          if (target !== p) return;
          let loop = 0;
          while (loop++ < 8) {
            if (!p.alive) break;
            if (!await UI.askYesNo(p, '洛神', '进行洛神判定（黑色收入手牌）？')) break;
            const r = await judge(state, p, { name:'洛神', judgeFilter: c => c.suit === 's' || c.suit === 'c' });
            if (r && r.ok) {
              // 从弃牌堆拿回来
              const idx = state.discard.findIndex(c => c.id === r.card.id);
              if (idx >= 0) {
                const c = state.discard.splice(idx,1)[0];
                p.hand.push(c);
                state.log(`<b>${p.name}</b>【洛神】获得【${c.name}】`);
              }
            } else {
              state.log(`<b>${p.name}</b>【洛神】判定红色，弃置`);
              break;
            }
          }
        });
      }
      // 观星（诸葛亮）
      if (p.hasSkill('guanxing')) {
        state.on('onPrepare', async ({ target }) => {
          if (target !== p) return;
          if (!await UI.askYesNo(p, '观星', '观看牌堆顶X张牌并重新排列？')) return;
          const n = Math.min(state.alivePlayers().length, 5);
          const view = state.deck.slice(0, n);
          if (view.length === 0) return;
          const top = p.isHuman ? await UI.chooseGuanxing(p, view) : AI.chooseGuanxing(state, p, view);
          // 简单版：返回 { top: [cards], bottom: [cards] }
          const topCards = top.top || [];
          const botCards = top.bottom || [];
          state.deck.splice(0, n);
          state.deck.unshift(...topCards);
          state.deck.push(...botCards);
          state.log(`<b>${p.name}</b>【观星】看了 ${n} 张牌并重新排列`);
        });
      }
      // 涯角（赵云）：使用牌结算后可看牌堆顶一张并选择
      if (p.hasSkill('yajiao')) {
        state.on('onCardResolved', async ({ p: pp }) => {
          if (pp !== p || !p.alive) return;
          if (state.deck.length === 0) return;
          if (!await UI.askYesNo(p, '涯角', '观看牌堆顶一张牌（收为手牌或弃置）？')) return;
          const c = state.deck[0];
          const take = p.isHuman
            ? await UI.askMultiChoice(p, '涯角', [`收为手牌`, `弃置`]) === '收为手牌'
            : Math.random() < 0.7;
          state.deck.shift();
          if (take) { p.hand.push(c); state.log(`<b>${p.name}</b>【涯角】收【${c.name}】为手牌`); }
          else { addToDiscard(state, c); state.log(`<b>${p.name}</b>【涯角】弃置【${c.name}】`); }
        });
      }
      // 集智（黄月英）：使用锦囊后摸一张
      if (p.hasSkill('jizhi')) {
        state.on('onCardUsed', async ({ p: pp, card }) => {
          if (pp !== p) return;
          if (card.type !== 'trick') return;
          drawCards(state, p, 1);
          state.log(`<b>${p.name}</b>【集智】摸一张牌`);
        });
      }
      // 闭月（貂蝉）：结束阶段摸一张
      if (p.hasSkill('biyue')) {
        state.on('onEnd', async ({ target }) => {
          if (target !== p) return;
          if (await UI.askYesNo(p, '闭月', '结束阶段摸一张牌？')) {
            drawCards(state, p, 1);
            state.log(`<b>${p.name}</b>【闭月】摸一张牌`);
          }
        });
      }
      // 崩坏（董卓）：结束阶段处理 — 已在 turn.js 中处理
      // 黄天（张角主公技）：其他群势力出牌阶段可交闪/闪电给你 — 简化：主动询问
      // 魏王/黄天/救援/暴虐 主公技 — 简化实现
      // 反间（周瑜）：主动技 — 在出牌阶段调用
      // 苦肉（黄盖）：主动技 — 出牌阶段
      // 制衡（孙权）：主动技
      // 义绝（关羽）：主动技
      // 天义（太史慈）：主动技
      // 辕门（吕布）：主动技
      // 离间（貂蝉）：主动技
      // 青囊（华佗）：主动技
      // 仁德（刘备）：主动技
      // 化身（左慈）：见 startGame
      // 新生（左慈）：受到伤害后获得新化身牌（略）
      // 突袭/英姿/裸衣/双雄/克己/勤学 — turn.js 处理
      // 天香（小乔）：engine.damage 中调用
      // 雷击（张角）：cards-resolver.askShan 中调用
      // 鬼才/鬼道：engine.judge 中调用
    });
  },

  async tryGuicai(state, p, currentCard, target, judgeName) {
    if (!p.alive || !p.hand.length) return null;
    // AI 策略或玩家询问
    const use = p.isHuman
      ? await UI.askGuicai(p, currentCard, target, judgeName)
      : await AI.tryGuicai(state, p, currentCard, target, judgeName);
    if (!use) return null;
    if (p.isHuman) return use;
    const idx = p.hand.indexOf(use);
    if (idx >= 0) {
      removeFromHand(p, use);
      addToDiscard(state, use);
      return use;
    }
    return null;
  },
  async tryGuidao(state, p, currentCard, target, judgeName) {
    if (!p.alive) return null;
    // 只能用黑色牌
    const blacks = p.hand.filter(c => c.suit === 's' || c.suit === 'c');
    if (!blacks.length) return null;
    const use = p.isHuman
      ? await UI.askGuidao(p, currentCard, target, judgeName, blacks)
      : await AI.tryGuidao(state, p, currentCard, target, judgeName);
    if (!use) return null;
    removeFromHand(p, use);
    addToDiscard(state, use);
    return use;
  },
  async tryTianxiang(state, p, ctx) {
    // 小乔天香：受伤害时弃一张红桃牌转移
    if (!p.alive) return null;
    const hong = p.hand.filter(c => c.suit === 'h');
    if (!hong.length) return null;
    const use = p.isHuman
      ? await UI.askYesNo(p, '天香', `弃一张红桃【${hong[0].name}】将伤害转移给一名角色？`)
      : AI.shouldUseTianxiang(state, p, ctx);
    if (!use) return null;
    const chosen = p.isHuman
      ? await UI.chooseOneHandCardOf(p, hong, '选择要弃置的红桃牌')
      : hong[0];
    if (!chosen) return null;
    removeFromHand(p, [chosen]);
    addToDiscard(state, chosen);
    const cands = state.alivePlayers().filter(x => x !== p);
    if (!cands.length) return null;
    const target = p.isHuman
      ? (await UI.chooseTargets(p, cands, { min:1, max:1, title:'天香：选择转移目标' }))[0]
      : AI.decideTargets(state, p, 'tianxiang', cands, 1)[0];
    return target;
  },
  async onPrepare(state, p) {
    await state.emit('onPrepare', { target: p });
  },
  async onEnd(state, p) {
    await state.emit('onEnd', { target: p });
  },
  async onDrawPhaseDone(state, p) {
    await state.emit('onDrawPhaseDone', { p });
  }
};

async function takeOneCardOf(state, asker, target) {
  const hand = target.hand;
  const equips = Object.values(target.equip).filter(Boolean);
  if (!hand.length && !equips.length) return null;
  let pick;
  if (hand.length && !equips.length) pick = hand[Math.floor(Math.random()*hand.length)];
  else if (!hand.length && equips.length) pick = equips[Math.floor(Math.random()*equips.length)];
  else pick = await UI.chooseOneOfAnyCard(asker, target);
  if (!pick) return null;
  // 移除
  for (const k of ['weapon','armor','horseA','horseD']) {
    if (target.equip[k]?.id === pick.id) {
      const c = target.equip[k];
      target.equip[k] = null;
      asker.hand.push(c);
      return c;
    }
  }
  removeFromHand(target, [pick]);
  asker.hand.push(pick);
  return pick;
}
