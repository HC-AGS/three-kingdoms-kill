// AI 桥 — 由 ai/bot.js 注入实现
export const AI = {
  respond: async () => null,
  pickDiscard: () => [],
  pickPinPointCard: () => null,
  decidePlayPhase: async () => {},
  decideSkillUse: async () => false,
  decideTarget: () => null,
  decideTargets: () => [],
  pickCardFromOwnHandFor: () => null,
  chooseFromReveal: async () => null
};
