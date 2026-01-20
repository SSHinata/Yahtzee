/**
 * 游戏规则常量与枚举定义
 */

/** 五骰 */
const DICE_COUNT = 5;

/** 每回合最多掷骰次数 */
const MAX_ROLLS_PER_TURN = 3;

/** 上层奖分阈值 */
const UPPER_BONUS_THRESHOLD = 63;

/** 上层奖分分数 */
const UPPER_BONUS_SCORE = 35;

/** 快艇基础分 */
const YAHTZEE_SCORE = 50;

/** 快艇额外奖分 */
const EXTRA_YAHTZEE_BONUS = 100;

/** 计分格 Key 定义 */
const ScoreKey = {
  // 上层
  ONE: 'ONE',
  TWO: 'TWO',
  THREE: 'THREE',
  FOUR: 'FOUR',
  FIVE: 'FIVE',
  SIX: 'SIX',
  
  // 下层
  THREE_KIND: 'THREE_KIND',   // 三条
  FOUR_KIND: 'FOUR_KIND',     // 四条
  FULL_HOUSE: 'FULL_HOUSE',   // 葫芦
  SMALL_STRAIGHT: 'SMALL_STRAIGHT', // 小顺
  LARGE_STRAIGHT: 'LARGE_STRAIGHT', // 大顺
  YAHTZEE: 'YAHTZEE',         // 快艇
  CHANCE: 'CHANCE',           // 全选
};

/** 上层 Key 集合，便于计算上层总分 */
const UPPER_KEYS = [
  ScoreKey.ONE,
  ScoreKey.TWO,
  ScoreKey.THREE,
  ScoreKey.FOUR,
  ScoreKey.FIVE,
  ScoreKey.SIX
];

/** 游戏阶段枚举 */
const Phase = {
  INIT: 'INIT',             // 初始化/决定先手
  TURN_START: 'TURN_START', // 回合开始
  ROLLING: 'ROLLING',       // 掷骰阶段
  SELECT_SCORE: 'SELECT_SCORE', // 选择计分
  TURN_END: 'TURN_END',     // 回合结束
  GAME_END: 'GAME_END',     // 游戏结束
};

module.exports = {
  DICE_COUNT,
  MAX_ROLLS_PER_TURN,
  UPPER_BONUS_THRESHOLD,
  UPPER_BONUS_SCORE,
  YAHTZEE_SCORE,
  EXTRA_YAHTZEE_BONUS,
  ScoreKey,
  UPPER_KEYS,
  Phase
};
