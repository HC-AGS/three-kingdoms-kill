// 武将数据（32名）— 依据「三国杀·烽烟革新版」文档
// 每个武将: { id, name, fac(魏蜀吴群), hp, gender, skills:[{id,name,desc,type,tag}], lord? }
// skill.type: 'active'(主动) / 'trigger'(触发) / 'passive'(锁定)
// skill.tag: 'lord' | 'attack' | 'defense' | 'utility' | 'burst'
export const GENERALS = [
  // ============ 魏国 8 ============
  { id:'caocao', name:'曹操', fac:'魏', hp:4, gender:'M', title:'魏武帝', color:'#c9a24a', lordSkill:true,
    skills:[
      { id:'jianxiong', name:'奸雄', type:'trigger', tag:'utility', desc:'当你受到伤害后，可获得造成伤害的牌。' },
      { id:'weiwang',   name:'魏王', type:'trigger', tag:'lord',    desc:'主公技：其他魏势力角色每回合可令你摸一张牌（每角色限一次）。' }
    ]},
  { id:'simayi', name:'司马懿', fac:'魏', hp:3, gender:'M', title:'狼顾之鬼', color:'#7a5a9a',
    skills:[
      { id:'guicai', name:'鬼才', type:'trigger', tag:'utility', desc:'在一名角色的判定牌生效前，你可打出一张手牌代替之。' },
      { id:'fankui', name:'反馈', type:'trigger', tag:'defense', desc:'当你受到伤害后，可获得来源的一张牌。' }
    ]},
  { id:'xiahoudun', name:'夏侯惇', fac:'魏', hp:4, gender:'M', title:'独眼苍狼', color:'#8a6a25',
    skills:[
      { id:'ganglie', name:'刚烈', type:'trigger', tag:'defense', desc:'当你受到伤害后，可进行判定：若结果不为♥，来源需弃两张牌或受到1点伤害。' },
      { id:'danjing', name:'啖睛', type:'active',  tag:'burst',   desc:'出牌阶段限一次：失去1点体力，本回合下一张【杀】伤害+1且不可被【闪】响应。' }
    ]},
  { id:'zhangliao', name:'张辽', fac:'魏', hp:4, gender:'M', title:'虎步关右', color:'#2b5b8a',
    skills:[
      { id:'tuxi',    name:'突袭', type:'trigger', tag:'attack',  desc:'摸牌阶段：可改为获得至多两名其他角色的各一张手牌。' },
      { id:'zhengchen',name:'征尘',type:'trigger', tag:'utility', desc:'当你获得他人手牌后，可令自己本回合手牌上限+2。' }
    ]},
  { id:'xuchu', name:'许褚', fac:'魏', hp:4, gender:'M', title:'虎痴', color:'#8a3a1e',
    skills:[
      { id:'luoyi', name:'裸衣', type:'trigger', tag:'burst',   desc:'摸牌阶段：可少摸1张牌，本回合【杀】/【决斗】伤害+1。' },
      { id:'huchi', name:'虎痴', type:'trigger', tag:'attack',  desc:'当你使用【杀】造成伤害后，可弃目标一张牌。' }
    ]},
  { id:'guojia', name:'郭嘉', fac:'魏', hp:3, gender:'M', title:'奇才', color:'#3a7f8a',
    skills:[
      { id:'tiandu', name:'天妒', type:'trigger', tag:'utility', desc:'当你的判定牌生效后，可获得之。' },
      { id:'yiji',   name:'遗计', type:'trigger', tag:'defense', desc:'当你受到伤害后，可摸两张牌，然后将其中任意张分配给任意角色。' }
    ]},
  { id:'zhenji', name:'甄姬', fac:'魏', hp:3, gender:'F', title:'洛神', color:'#7a3a8a',
    skills:[
      { id:'qingguo', name:'倾国', type:'passive', tag:'defense', desc:'你可将一张黑色手牌当【闪】使用或打出。' },
      { id:'luoshen', name:'洛神', type:'trigger', tag:'burst',   desc:'准备阶段：进行判定，若为黑色收为手牌并重复；若为红色弃置。' }
    ]},
  { id:'xiahouyuan', name:'夏侯渊', fac:'魏', hp:4, gender:'M', title:'妙才', color:'#3a7f4a',
    skills:[
      { id:'shensu',  name:'神速', type:'trigger', tag:'attack',  desc:'你可以跳过判定+摸牌阶段，视为使用一张【杀】；或跳过出牌+弃牌阶段，视为使用一张【杀】。' },
      { id:'jixing',  name:'疾行', type:'passive', tag:'attack',  desc:'锁定技：你计算与其他角色的距离-1。' }
    ]},

  // ============ 蜀国 8 ============
  { id:'liubei', name:'刘备', fac:'蜀', hp:4, gender:'M', title:'昭烈帝', color:'#c9a24a', lordSkill:true,
    skills:[
      { id:'rende', name:'仁德', type:'active',  tag:'utility', desc:'出牌阶段：可将任意张手牌交给其他角色；若给出≥2张，回复1点体力（每回合限一次）。' },
      { id:'jijiang', name:'激将', type:'trigger', tag:'lord',  desc:'主公技：其他蜀势力角色可替你打出【杀】。' }
    ]},
  { id:'guanyu', name:'关羽', fac:'蜀', hp:4, gender:'M', title:'武圣', color:'#8a1e1e',
    skills:[
      { id:'wusheng', name:'武圣', type:'passive', tag:'attack',  desc:'你可将一张红色牌当【杀】使用或打出。' },
      { id:'yijue',   name:'义绝', type:'active',  tag:'utility', desc:'出牌阶段限一次：与一名角色拼点，若你赢，本回合该角色不能使用【闪】且不能回复体力。' }
    ]},
  { id:'zhangfei', name:'张飞', fac:'蜀', hp:4, gender:'M', title:'万夫不当', color:'#3a2410',
    skills:[
      { id:'paoxiao', name:'咆哮', type:'passive', tag:'attack',  desc:'锁定技：出牌阶段使用【杀】无次数限制。' },
      { id:'tishen',  name:'替身', type:'trigger', tag:'defense', desc:'当你进入濒死状态时，可摸两张牌，然后将体力回复至1点（每局限一次）。' }
    ]},
  { id:'zhugeliang', name:'诸葛亮', fac:'蜀', hp:3, gender:'M', title:'卧龙', color:'#4a7f8a',
    skills:[
      { id:'guanxing', name:'观星', type:'trigger', tag:'utility', desc:'准备阶段：观看牌堆顶X张牌（X=存活人数，最多5），并以任意顺序放回牌堆顶或牌堆底。' },
      { id:'kongcheng',name:'空城', type:'passive', tag:'defense', desc:'锁定技：若你没有手牌，你不能成为【杀】和【决斗】的目标。' }
    ]},
  { id:'zhaoyun', name:'赵云', fac:'蜀', hp:4, gender:'M', title:'常山赵子龙', color:'#8a8aa8',
    skills:[
      { id:'longdan', name:'龙胆', type:'passive', tag:'attack',  desc:'你可将【杀】当【闪】、【闪】当【杀】使用或打出。' },
      { id:'yajiao',  name:'涯角', type:'trigger', tag:'utility', desc:'当你使用一张牌结算后，可观看牌堆顶一张牌：收为手牌或弃置。' }
    ]},
  { id:'machao', name:'马超', fac:'蜀', hp:4, gender:'M', title:'锦马超', color:'#c94a3a',
    skills:[
      { id:'mashu',  name:'马术', type:'passive', tag:'attack',  desc:'锁定技：你计算与其他角色的距离-1。' },
      { id:'tieqi',  name:'铁骑', type:'trigger', tag:'attack',  desc:'当你使用【杀】指定目标后：进行判定，若结果不为♥，此【杀】不可被【闪】响应。' }
    ]},
  { id:'huangyueying', name:'黄月英', fac:'蜀', hp:3, gender:'F', title:'木牛流马', color:'#4a7f5b',
    skills:[
      { id:'jizhi',  name:'集智', type:'trigger', tag:'utility', desc:'当你使用一张锦囊牌后，可摸一张牌。' },
      { id:'qicai',  name:'奇才', type:'passive', tag:'utility', desc:'锁定技：你使用锦囊牌无距离限制；你可以将一张装备牌当【无懈可击】使用。' }
    ]},
  { id:'huangzhong', name:'黄忠', fac:'蜀', hp:4, gender:'M', title:'老当益壮', color:'#8a6a25',
    skills:[
      { id:'liegong', name:'烈弓', type:'trigger', tag:'attack', desc:'当你使用【杀】指定目标后：若目标手牌数≥你的体力值，或≤你的攻击范围，此【杀】不可被【闪】响应。' },
      { id:'shenshe', name:'神射', type:'passive', tag:'attack', desc:'锁定技：你使用【杀】无距离限制。' }
    ]},

  // ============ 吴国 8 ============
  { id:'sunquan', name:'孙权', fac:'吴', hp:4, gender:'M', title:'吴大帝', color:'#c94a3a', lordSkill:true,
    skills:[
      { id:'zhiheng', name:'制衡', type:'active',  tag:'utility', desc:'出牌阶段限一次：弃置任意张手牌，然后摸等量的牌。' },
      { id:'jiuyuan', name:'救援', type:'trigger', tag:'lord',    desc:'主公技：其他吴势力角色的回合中，若你处于濒死状态，其可将一张【桃】视为对你额外使用一次。' }
    ]},
  { id:'zhouyu', name:'周瑜', fac:'吴', hp:3, gender:'M', title:'美周郎', color:'#a8242a',
    skills:[
      { id:'yingzi', name:'英姿', type:'trigger', tag:'utility', desc:'摸牌阶段：你可以多摸1张牌。' },
      { id:'fanjian',name:'反间', type:'active',  tag:'burst',   desc:'出牌阶段限一次：令一名角色选择一种花色，展示你的一张手牌——若不符，该角色受1点伤害；若符合，其获得此牌。' }
    ]},
  { id:'xiaoqiao', name:'小乔', fac:'吴', hp:3, gender:'F', title:'乱世佳人', color:'#c93a5b',
    skills:[
      { id:'tianxiang', name:'天香', type:'trigger', tag:'defense', desc:'当你受到伤害时：可弃一张红桃牌，将此伤害转移给任意角色，其摸X张牌（X=其已损体力）。' },
      { id:'xq_guose',  name:'国色', type:'active',  tag:'utility', desc:'出牌阶段限一次：将一张方块牌当【乐不思蜀】使用。' }
    ]},
  { id:'ganning', name:'甘宁', fac:'吴', hp:4, gender:'M', title:'锦帆贼', color:'#8a3a1e',
    skills:[
      { id:'qixi',   name:'奇袭', type:'passive', tag:'attack',  desc:'你可以将一张黑色牌当【过河拆桥】使用。' },
      { id:'jinfan', name:'锦帆', type:'trigger', tag:'attack',  desc:'当你使用【过河拆桥】弃置牌后：可令被弃置牌的角色本回合不能使用该类牌。' }
    ]},
  { id:'taishici', name:'太史慈', fac:'吴', hp:4, gender:'M', title:'东莱猛将', color:'#4a5a8a',
    skills:[
      { id:'tianyi',  name:'天义', type:'active',  tag:'burst',   desc:'出牌阶段限一次：与一名角色拼点。若你赢，本回合使用【杀】次数+1，且【杀】可额外指定一个目标；若没赢，本回合不能使用【杀】。' },
      { id:'dulie',   name:'笃烈', type:'trigger', tag:'defense', desc:'当你成为【杀】的目标后：可令此【杀】需两张【闪】才能抵消。' }
    ]},
  { id:'lvmeng', name:'吕蒙', fac:'吴', hp:4, gender:'M', title:'白衣渡江', color:'#3a7f8a',
    skills:[
      { id:'keji', name:'克己', type:'trigger', tag:'defense', desc:'若你本回合未使用过【杀】，可跳过弃牌阶段。' },
      { id:'qinxue',name:'勤学',type:'trigger', tag:'utility', desc:'当你跳过弃牌阶段后，可摸一张牌。' }
    ]},
  { id:'huanggai', name:'黄盖', fac:'吴', hp:4, gender:'M', title:'苦肉老将', color:'#7a3a1e',
    skills:[
      { id:'kurou',  name:'苦肉', type:'active',  tag:'burst',   desc:'出牌阶段限一次：失去1点体力，然后摸两张牌。' },
      { id:'zhaxiang',name:'诈降',type:'trigger', tag:'attack',  desc:'当你失去体力后，本回合下一张【杀】不可被【闪】响应。' }
    ]},
  { id:'daqiao', name:'大乔', fac:'吴', hp:3, gender:'F', title:'江东之花', color:'#a8c93a',
    skills:[
      { id:'dq_guose', name:'国色', type:'active',  tag:'utility', desc:'出牌阶段：将一张方块牌当【乐不思蜀】使用。' },
      { id:'liuli',    name:'流离', type:'trigger', tag:'defense', desc:'当你成为【杀】的目标后：可弃一张牌，将此【杀】转移给距离1以内的另一名角色。' }
    ]},

  // ============ 群雄 8 ============
  { id:'huatuo', name:'华佗', fac:'群', hp:3, gender:'M', title:'神医', color:'#4a7f5b',
    skills:[
      { id:'qingnang', name:'青囊', type:'active',  tag:'utility', desc:'出牌阶段限一次：弃一张手牌，令一名角色回复1点体力。' },
      { id:'jijiu',    name:'急救', type:'passive', tag:'defense', desc:'锁定技：你的回合外，你可以将红色牌当【桃】使用。' }
    ]},
  { id:'lvbu', name:'吕布', fac:'群', hp:4, gender:'M', title:'飞将', color:'#8a2a1e',
    skills:[
      { id:'wushuang', name:'无双', type:'passive', tag:'attack',  desc:'锁定技：你使用的【杀】需两张【闪】才能抵消；与你进行【决斗】的角色每次需打出两张【杀】。' },
      { id:'yuanmen',  name:'辕门', type:'active',  tag:'burst',   desc:'出牌阶段限一次：与一名角色拼点。若你赢，视为对其使用一张【杀】（不可被【闪】响应）。' }
    ]},
  { id:'diaochan', name:'貂蝉', fac:'群', hp:3, gender:'F', title:'闭月', color:'#c93a8a',
    skills:[
      { id:'lijian', name:'离间', type:'active',  tag:'burst',   desc:'出牌阶段限一次：令一名男性角色与另一名男性角色进行【决斗】，由前者先出【杀】。' },
      { id:'biyue',  name:'闭月', type:'trigger', tag:'defense', desc:'结束阶段：可摸一张牌。' }
    ]},
  { id:'zhangjiao', name:'张角', fac:'群', hp:3, gender:'M', title:'黄天', color:'#c9a24a', lordSkill:true,
    skills:[
      { id:'leiji',   name:'雷击', type:'trigger', tag:'burst',   desc:'当你使用或打出【闪】时：可令一名角色进行判定，若为♠，对其造成2点雷电伤害。' },
      { id:'guidao',  name:'鬼道', type:'trigger', tag:'utility', desc:'在一名角色的判定牌生效前，你可用一张黑色牌替换之。' },
      { id:'huangtian',name:'黄天',type:'trigger', tag:'lord',    desc:'主公技：其他群势力角色的出牌阶段，可将一张【闪】或【闪电】交给你。' }
    ]},
  { id:'yuanshao', name:'袁绍', fac:'群', hp:4, gender:'M', title:'四世三公', color:'#7a5a8a', lordSkill:true,
    skills:[
      { id:'luanji',  name:'乱击', type:'active',  tag:'burst',   desc:'出牌阶段：将两张同花色手牌当【万箭齐发】使用。' },
      { id:'xueyi',   name:'血裔', type:'passive', tag:'defense', desc:'主公技：你的手牌上限+X（X=其他群势力角色数）。' }
    ]},
  { id:'yanwen', name:'颜良文丑', fac:'群', hp:4, gender:'M', title:'河北双雄', color:'#8a3a5b', shortName:'颜良&文丑',
    skills:[
      { id:'shuangxiong',name:'双雄',type:'trigger',tag:'burst',  desc:'摸牌阶段：可改为展示牌堆顶一张牌——获得此牌，本回合可将与该牌不同花色的手牌当【决斗】使用。' },
      { id:'xiaoyong',   name:'骁勇',type:'trigger',tag:'utility',desc:'当你使用【决斗】造成伤害后，可摸一张牌。' }
    ]},
  { id:'dongzhuo', name:'董卓', fac:'群', hp:8, gender:'M', title:'魔王', color:'#3a1a1a', lordSkill:true,
    skills:[
      { id:'jiuchi',   name:'酒池', type:'passive', tag:'utility', desc:'你可以将一张黑桃牌当【酒】使用。' },
      { id:'roulin',   name:'肉林', type:'passive', tag:'defense', desc:'锁定技：你对女性角色使用【杀】时其需两张【闪】；女性角色对你使用【杀】时你需两张【闪】。' },
      { id:'bengtui',  name:'崩坏', type:'trigger', tag:'defense', desc:'结束阶段：若你不是体力最少的角色，失去1点体力或弃一张牌。' },
      { id:'baonue',   name:'暴虐', type:'trigger', tag:'lord',    desc:'主公技：其他群势力角色造成伤害后：可令你进行判定，若为♠，你回复1点体力。' }
    ]},
  { id:'zuoci', name:'左慈', fac:'群', hp:3, gender:'M', title:'仙人', color:'#7f5ac9',
    skills:[
      { id:'huashen',  name:'化身', type:'trigger', tag:'utility', desc:'游戏开始时：随机获得两个武将的技能（每局限一次更换其中一个）。' },
      { id:'xinsheng', name:'新生', type:'trigger', tag:'defense', desc:'当你受到伤害后，可获得一个新的化身技能牌。' }
    ]}
];

// 索引
export const GEN_BY_ID = new Map(GENERALS.map(g => [g.id, g]));
export function genOf(id) { return GEN_BY_ID.get(id); }
export const FAC_COLOR = { '魏':'#2b5b8a', '蜀':'#1e6f3d', '吴':'#a8241c', '群':'#7a5a1e' };
export const FAC_CN = { '魏':'魏', '蜀':'蜀', '吴':'吴', '群':'群' };
export function genCounts() {
  const c = { 魏:0, 蜀:0, 吴:0, 群:0 };
  GENERALS.forEach(g => c[g.fac]++);
  return c;
}
export const TOTAL_GENERALS = GENERALS.length; // 32
