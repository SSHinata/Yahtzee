/**
 * 计分计算逻辑
 */
const { ScoreKey, UPPER_KEYS, UPPER_BONUS_SCORE, EXTRA_YAHTZEE_BONUS } = require('./rules');
const {
  hasNOfAKind,
  isFullHouse,
  isSmallStraight,
  isLargeStraight,
  isYahtzee,
  sumDice
} = require('./analyze');

/**
 * 将计分 Key 映射为对应的数字（针对 1-6 点）
 */
function mapKeyToNumber(key) {
  if (key === ScoreKey.ONE) return 1;
  if (key === ScoreKey.TWO) return 2;
  if (key === ScoreKey.THREE) return 3;
  if (key === ScoreKey.FOUR) return 4;
  if (key === ScoreKey.FIVE) return 5;
  if (key === ScoreKey.SIX) return 6;
  return null;
}

/**
 * 计算某个计分格在当前骰子下的得分（不修改状态，纯计算）
 * @param {number[]} dice 
 * @param {string} key 
 */
function calcScoreForKey(dice, key) {
  const n = mapKeyToNumber(key);
  
  // 1. 上层数字格 (1-6)
  if (n != null) {
    return dice.filter(v => v === n).reduce((acc, v) => acc + v, 0);
  }

  // 2. 下层组合格
  switch (key) {
    case ScoreKey.THREE_KIND:
      return hasNOfAKind(dice, 3) ? sumDice(dice) : 0;
      
    case ScoreKey.FOUR_KIND:
      return hasNOfAKind(dice, 4) ? sumDice(dice) : 0;
      
    case ScoreKey.FULL_HOUSE:
      return isFullHouse(dice) ? 25 : 0;
      
    case ScoreKey.SMALL_STRAIGHT:
      return isSmallStraight(dice) ? 30 : 0;
      
    case ScoreKey.LARGE_STRAIGHT:
      return isLargeStraight(dice) ? 40 : 0;
      
    case ScoreKey.YAHTZEE:
      return isYahtzee(dice) ? 50 : 0;
      
    case ScoreKey.CHANCE:
      return sumDice(dice);
      
    default:
      return 0;
  }
}

/**
 * 获取当前所有计分格的预览状态（用于 UI 展示）
 * @param {number[]} dice 
 * @param {Object} scoreCard 
 */
function getScorePreviewMap(dice, scoreCard) {
  const map = {};
  Object.keys(ScoreKey).forEach(k => {
    const key = ScoreKey[k];
    const cell = scoreCard[key];
    if (cell && cell.used) {
      map[key] = { enabled: false, preview: cell.score || 0 };
    } else {
      map[key] = { enabled: true, preview: calcScoreForKey(dice, key) };
    }
  });
  return map;
}

/**
 * 计算上层得分总和
 */
function calcUpperSectionSum(scoreCard) {
  let sum = 0;
  UPPER_KEYS.forEach(key => {
    const cell = scoreCard[key];
    if (cell && cell.used && typeof cell.score === 'number') {
      sum += cell.score;
    }
  });
  return sum;
}

/**
 * 判断是否应该给予上层奖分
 */
function shouldGrantUpperBonus(player) {
  if (player.upperBonusGiven) return false;
  return calcUpperSectionSum(player.scoreCard) >= 63;
}

/**
 * 检测是否触发快艇额外奖分
 * 触发条件：玩家已经使用过 YAHTZEE 格（且得分>0），且本次掷骰又是快艇
 */
function detectExtraYahtzee(dice, player) {
  // 注意：标准规则通常要求第一次 Yahtzee 必须得分为 50 才算激活后续奖励。
  // 如果第一次 Yahtzee 被迫记 0 分（比如之前掷骰没出快艇但被迫选了 Yahtzee 格），
  // 则后续再出快艇不能拿额外分。
  // 我们通过 yahtzeeScoredOnce 字段来标记“是否成功计过一次快艇分”。
  return player.yahtzeeScoredOnce && isYahtzee(dice);
}

/**
 * 计算玩家总分
 */
function calcPlayerTotal(player) {
  let base = 0;
  // 累加所有已使用格子的分数
  Object.keys(player.scoreCard).forEach(key => {
    const cell = player.scoreCard[key];
    if (cell && cell.used && typeof cell.score === 'number') {
      base += cell.score;
    }
  });
  
  const upperBonus = player.upperBonusGiven ? UPPER_BONUS_SCORE : 0;
  const extraYahtzee = player.extraYahtzeeBonus || 0;
  
  return base + upperBonus + extraYahtzee;
}

module.exports = {
  calcScoreForKey,
  getScorePreviewMap,
  calcUpperSectionSum,
  shouldGrantUpperBonus,
  detectExtraYahtzee,
  calcPlayerTotal,
  EXTRA_YAHTZEE_BONUS
};
