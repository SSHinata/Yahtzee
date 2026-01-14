/**
 * UI 辅助选择器
 * 负责将 GameState 转换为 UI 易读的 flags 或数据结构
 */
const { Phase, MAX_ROLLS_PER_TURN } = require('./rules');
const { currentPlayer } = require('./gameEngine');
const { getScorePreviewMap } = require('./scoring');

/**
 * 获取当前 UI 交互按钮的可用状态
 */
function getUIFlags(state) {
  return {
    // 是否能摇骰：处于 ROLLING 阶段 且 次数未用完
    canRoll:
      state.phase === Phase.ROLLING &&
      state.turn.rollCount < MAX_ROLLS_PER_TURN,
    
    // 是否能保留骰子：处于 ROLLING 阶段 且 至少摇过一次 且 还没结束
    canToggleHold:
      state.phase === Phase.ROLLING &&
      state.turn.rollCount >= 1 &&
      state.turn.rollCount < MAX_ROLLS_PER_TURN,
      
    // 是否能选择计分：处于 SELECT_SCORE 阶段
    canSelectScore: state.phase === Phase.SELECT_SCORE
  };
}

/**
 * 获取计分板列表数据（包含预览分、是否可用等）
 */
function getScoreOptionsForUI(state) {
  const player = currentPlayer(state);
  const map = getScorePreviewMap(state.turn.dice, player.scoreCard);
  
  // 将 Map 转为数组，方便 wx:for 遍历
  return Object.keys(map).map(key => ({
    key,
    ...map[key] // { enabled, preview }
  }));
}

module.exports = {
  getUIFlags,
  getScoreOptionsForUI
};
