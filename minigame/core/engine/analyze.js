/**
 * 骰子组合分析工具函数
 */

/**
 * 统计每个点数的频次
 * @param {number[]} dice 
 * @returns {Map<number, number>}
 */
function getCounts(dice) {
  const counts = new Map();
  for (let v = 1; v <= 6; v += 1) {
    counts.set(v, 0);
  }
  dice.forEach(v => {
    if (v >= 1 && v <= 6) {
      counts.set(v, counts.get(v) + 1);
    }
  });
  return counts;
}

/**
 * 获取去重并排序后的点数数组
 * @param {number[]} dice 
 */
function getSortedUniqueFaces(dice) {
  const set = new Set(dice);
  const arr = Array.from(set);
  arr.sort((a, b) => a - b);
  return arr;
}

/**
 * 是否为快艇（5个全同）
 */
function isYahtzee(dice) {
  const counts = getCounts(dice);
  let max = 0;
  counts.forEach(v => {
    if (v > max) max = v;
  });
  return max === 5;
}

/**
 * 是否满足 N 条（至少 N 个相同）
 */
function hasNOfAKind(dice, n) {
  const counts = getCounts(dice);
  let max = 0;
  counts.forEach(v => {
    if (v > max) max = v;
  });
  return max >= n;
}

/**
 * 是否为葫芦（3个同 + 2个同）
 */
function isFullHouse(dice) {
  const counts = getCounts(dice);
  const freqs = [];
  counts.forEach(v => {
    if (v > 0) freqs.push(v);
  });
  freqs.sort((a, b) => a - b);
  // 可能情况：[2, 3] 或者 [5] (也是一种特殊的full house? 通常规则要求必须有2种不同点数，但也有些规则允许5个同也是葫芦)
  // 标准Yahtzee规则中，Full House 定义为 "Three of one number and two of another".
  // 这里严格遵循：必须是2种不同点数，一个2个，一个3个。
  if (freqs.length !== 2) return false;
  return freqs[0] === 2 && freqs[1] === 3;
}

/**
 * 辅助：检查数组是否包含目标子序列的所有元素
 */
function containsAll(arr, target) {
  return target.every(v => arr.indexOf(v) !== -1);
}

/**
 * 小顺（至少4个连续点数）
 */
function isSmallStraight(dice) {
  const faces = getSortedUniqueFaces(dice);
  // 可能的组合：1-2-3-4, 2-3-4-5, 3-4-5-6
  if (containsAll(faces, [1, 2, 3, 4])) return true;
  if (containsAll(faces, [2, 3, 4, 5])) return true;
  if (containsAll(faces, [3, 4, 5, 6])) return true;
  return false;
}

/**
 * 大顺（5个连续点数）
 */
function isLargeStraight(dice) {
  const faces = getSortedUniqueFaces(dice);
  if (faces.length !== 5) return false;
  // 只有两种情况：1-2-3-4-5 或 2-3-4-5-6
  const a = [1, 2, 3, 4, 5];
  const b = [2, 3, 4, 5, 6];
  const okA = faces.every((v, i) => v === a[i]);
  const okB = faces.every((v, i) => v === b[i]);
  return okA || okB;
}

/**
 * 计算骰子总和
 */
function sumDice(dice) {
  return dice.reduce((acc, v) => acc + v, 0);
}

module.exports = {
  getCounts,
  getSortedUniqueFaces,
  isYahtzee,
  hasNOfAKind,
  isFullHouse,
  isSmallStraight,
  isLargeStraight,
  sumDice
};
