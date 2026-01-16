/**
 * 游戏主逻辑引擎
 */
const { Phase, ScoreKey } = require('./rules');
const {
  initTurnState,
  rollDice,
  toggleHold
} = require('./dice');
const {
  calcScoreForKey,
  shouldGrantUpperBonus,
  detectExtraYahtzee,
  EXTRA_YAHTZEE_BONUS
} = require('./scoring');

/**
 * 辅助：创建空的计分卡
 */
function createEmptyScoreCard() {
  const scoreCard = {};
  Object.keys(ScoreKey).forEach(k => {
    const key = ScoreKey[k];
    scoreCard[key] = { used: false, score: null };
  });
  return scoreCard;
}

/**
 * 辅助：创建初始玩家状态
 */
function createPlayerState({ id, name }) {
  return {
    id,
    name,
    scoreCard: createEmptyScoreCard(),
    upperBonusGiven: false,
    yahtzeeScoredOnce: false, // 是否已经成功计过一次快艇分（50分）
    extraYahtzeeBonus: 0
  };
}

/**
 * 获取当前玩家
 */
function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

/**
 * 1. 创建新游戏
 */
function createNewGame(playerInfos, options) {
  const opts = options || {};
  const gameId = opts.gameId || `local_${Date.now()}`;
  const players = playerInfos.map(p => createPlayerState(p));
  
  return {
    gameId,
    players,
    currentPlayerIndex: 0,
    firstPlayerIndex: 0, // 默认为 0，如果需要掷骰决定先手，可在 Phase.INIT 阶段处理
    round: 1,
    turn: initTurnState(),
    phase: Phase.INIT, // 初始阶段，可在此阶段做决定先手动画，或者直接跳到 TURN_START
    log: []
  };
}

/**
 * 2. 开始新回合（重置 turn 状态）
 */
function startTurn(state) {
  return {
    ...state,
    phase: Phase.ROLLING,
    turn: initTurnState()
  };
}

/**
 * 3. 动作：掷骰
 */
function actionRoll(state, rng) {
  if (state.phase !== Phase.ROLLING) return state;
  if (state.turn.rollCount >= 3) return state;

  const newDice = rollDice(state.turn.dice, state.turn.held, rng);
  const newRollCount = state.turn.rollCount + 1;
  const player = currentPlayer(state);
  
  // 达到3次自动进入选分阶段
  // const shouldSelect = newRollCount === 3; // 移除自动切换
  
  // 检查是否触发额外快艇奖励（仅在最后一次掷骰或玩家主动停止时检查，这里简化为每次掷骰都算一下状态）
  // 实际上只有在计分时才会真正结算奖励，但需要在 UI 上提示
  const isExtra = detectExtraYahtzee(newDice, player);
  
  // 即使达到3次，这里也不切 Phase，等待前端动画结束后手动调用 actionEnterScoreSelection
  const nextPhase = Phase.ROLLING; 
  // 掷骰时，自动清空 prevHeld，因为掷骰后之前的保留状态已经没有意义了（骰子值都变了）
  // 但 nextHeld 保持不变（保留的继续保留）
  const nextHeld = state.turn.held;

  return {
    ...state,
    phase: nextPhase,
    turn: {
      ...state.turn,
      dice: newDice,
      held: nextHeld,
      prevHeld: null, // 清空 prevHeld
      rollCount: newRollCount,
      isExtraYahtzee: isExtra,
      lastRollAt: Date.now()
    }
  };
}

/**
 * 3.5 动作：动画结束后，如果次数已满，强制进入选分阶段
 */
function actionEnterScoreSelection(state) {
  if (state.phase !== Phase.ROLLING) return state;
  
  return {
    ...state,
    phase: Phase.SELECT_SCORE,
    turn: {
      ...state.turn,
      prevHeld: [...state.turn.held], // 记录当前的 held 状态
      held: [true, true, true, true, true] // 锁定所有骰子
    }
  };
}

/**
 * 4. 动作：切换保留状态
 */
function actionToggleHold(state, index) {
  if (state.phase !== Phase.ROLLING) return state;
  // 必须掷过至少一次才能保留
  if (state.turn.rollCount < 1) return state;
  // 第三次掷完后通常直接选分，不能再改保留状态（除非允许撤销，这里暂定不允许）
  if (state.turn.rollCount >= 3) return state;

  return {
    ...state,
    turn: {
      ...state.turn,
      held: toggleHold(state.turn.held, index)
    }
  };
}

/**
 * 4.5. 动作：提前结束掷骰，进入选分阶段
 */
function actionStopRolling(state) {
  if (state.phase !== Phase.ROLLING) return state;
  if (state.turn.rollCount < 1) return state; // 至少掷一次

  const player = currentPlayer(state);
  // 手动结束时，也要计算一次是否快艇（虽然掷骰时算过，但这里确保状态同步）
  const isExtra = detectExtraYahtzee(state.turn.dice, player);

  return {
    ...state,
    phase: Phase.SELECT_SCORE,
    turn: {
      ...state.turn,
      // 进入选分阶段时，视觉上应该“锁定”所有骰子
      // 逻辑上 held 全部置 true，防止误操作，也符合“停止掷骰”的含义
      prevHeld: [...state.turn.held], // 记录当前的 held 状态
      held: [true, true, true, true, true],
      isExtraYahtzee: isExtra
    }
  };
}

/**
 * 4.6 动作：取消选分，返回掷骰阶段
 * 仅当 rollCount < 3 时允许
 */
function actionCancelScoreSelection(state) {
  if (state.phase !== Phase.SELECT_SCORE) return state;
  // 如果已经掷满3次，不能退回
  if (state.turn.rollCount >= 3) return state;

  // 恢复之前的 held 状态
  const restoredHeld = state.turn.prevHeld ? [...state.turn.prevHeld] : [false, false, false, false, false];

  return {
    ...state,
    phase: Phase.ROLLING,
    turn: {
      ...state.turn,
      held: restoredHeld,
      prevHeld: null // 清空备份
    }
  };
}

/**
 * 5. 动作：选择计分格并计分
 */
function actionApplyScore(state, key) {
  if (state.phase !== Phase.SELECT_SCORE) {
    return { state, error: '当前阶段不允许计分' };
  }
  
  const player = currentPlayer(state);
  const cell = player.scoreCard[key];
  
  // 校验：该格是否已使用
  if (!cell || cell.used) {
    // 特殊情况：如果是“快艇额外奖励”触发，规则允许填入“其他未使用的格”。
    // 这意味着 key 指向的必须是一个未使用的格。
    // 所以这里只需校验 cell.used 即可。
    return { state, error: '该计分格已使用' };
  }

  const dice = state.turn.dice;
  let score = calcScoreForKey(dice, key);
  
  // 复制玩家对象以进行修改
  const player2 = JSON.parse(JSON.stringify(player));
  
  // 标记该格已使用
  player2.scoreCard[key] = { used: true, score };
  
  // 逻辑：如果选的是 YAHTZEE 格，且得分为 50，标记 yahtzeeScoredOnce
  if (key === ScoreKey.YAHTZEE && score > 0) {
    player2.yahtzeeScoredOnce = true;
  }
  
  // 逻辑：快艇额外奖分
  // 条件：本回合是快艇（isExtraYahtzee 为 true，意味着 dice 是快艇且 player.yahtzeeScoredOnce 已经是 true）
  if (state.turn.isExtraYahtzee) {
    player2.extraYahtzeeBonus += EXTRA_YAHTZEE_BONUS;
    // 注意：这里的 score 变量是 key 对应的格子的分。
    // 如果 key 不是 YAHTZEE（比如填入 Full House），该格照常计分。
    // 强制规则：如果触发了额外快艇，且此时不得不选一个格子：
    //  - 如果对应的格子满足条件（比如 Full House），计 Full House 分。
    //  - 如果不满足（比如选了 Large Straight 但其实 dice 是 5 个 6），
    //    标准规则里：快艇可以作为万能牌填入 Full House, Straight, Chance 拿满分。
    //    *但简化起见，这里暂不实现 Joker 规则（万能牌），只给 +100 分，格子分按实际 dice 算。*
    //    *如果需要 Joker 规则，需修改 calcScoreForKey 传入 isJoker 上下文。*
  }
  
  // 逻辑：检查上层奖分
  if (shouldGrantUpperBonus(player2)) {
    player2.upperBonusGiven = true;
  }
  
  // 更新玩家列表
  const players2 = state.players.slice();
  players2[state.currentPlayerIndex] = player2;
  
  const state2 = {
    ...state,
    players: players2,
    phase: Phase.TURN_END // 计分完成，进入回合结束阶段（等待动画或自动切换）
  };
  
  return { state: state2 };
}

/**
 * 辅助：检查游戏是否结束
 */
function isGameOver(players) {
  // 所有玩家的所有格子都已使用
  return players.every(p =>
    Object.keys(p.scoreCard).every(k => p.scoreCard[k].used)
  );
}

/**
 * 6. 结束当前回合，切换到下一玩家
 */
function endTurnAndAdvance(state) {
  if (state.phase !== Phase.TURN_END) return state;

  if (isGameOver(state.players)) {
    return {
      ...state,
      phase: Phase.GAME_END
    };
  }

  const nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  let round2 = state.round;
  
  // 如果回到第一个玩家，轮次 +1
  if (nextIndex === state.firstPlayerIndex) {
    round2 += 1;
  }

  return {
    ...state,
    currentPlayerIndex: nextIndex,
    round: round2,
    phase: Phase.ROLLING,
    turn: initTurnState()
  };
}

module.exports = {
  currentPlayer,
  createNewGame,
  startTurn,
  actionRoll,
  actionEnterScoreSelection,
  actionToggleHold,
  actionStopRolling,
  actionCancelScoreSelection,
  actionApplyScore,
  endTurnAndAdvance,
  isGameOver
};
