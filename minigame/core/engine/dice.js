/**
 * 骰子操作逻辑
 */

/**
 * 生成 1-6 的随机整数
 * @param {Function} rng - 随机数生成器，默认为 Math.random
 */
function randomDieFace(rng) {
  const f = rng || Math.random;
  return Math.floor(f() * 6) + 1;
}

/**
 * 初始化回合内的骰子状态
 */
function initTurnState() {
  return {
    rollCount: 0,
    dice: [0, 0, 0, 0, 0], // 0 表示尚未掷出
    held: [false, false, false, false, false],
    isExtraYahtzee: false, // 本回合是否触发快艇额外奖分
    lastRollAt: null       // 上次掷骰时间戳
  };
}

/**
 * 执行一次掷骰
 * @param {number[]} dice - 当前骰子数组
 * @param {boolean[]} held - 保留状态数组
 * @param {Function} rng - 随机数生成器
 */
function rollDice(dice, held, rng) {
  const f = rng || Math.random;
  const newDice = dice.slice();
  for (let i = 0; i < newDice.length; i += 1) {
    if (!held[i]) {
      newDice[i] = randomDieFace(f);
    }
  }
  return newDice;
}

/**
 * 切换骰子的保留状态
 * @param {boolean[]} held - 当前保留状态数组
 * @param {number} index - 骰子索引 0-4
 */
function toggleHold(held, index) {
  const newHeld = held.slice();
  newHeld[index] = !newHeld[index];
  return newHeld;
}

module.exports = {
  randomDieFace,
  initTurnState,
  rollDice,
  toggleHold
};
