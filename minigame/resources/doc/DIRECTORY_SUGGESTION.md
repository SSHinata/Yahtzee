根据你提供的 README 文档，我为你设计了一个**微信小程序项目的目录结构**，并提供了**核心逻辑代码**的框架。这个目录结构考虑了后续的可扩展性（如添加云开发，游戏更新等），同时适用于小程序的开发。

以下是项目的**核心目录结构设计**及相关文件的简要说明。

---

## **1. 项目目录结构设计**

```
minigame/
  ├── project.config.json        # 微信开发工具项目配置
  ├── game.json                  # 游戏页面配置
  ├── app.js                     # 小程序主入口文件
  ├── app.json                   # 小程序配置文件
  ├── app.wxss                   # 全局样式
  
  ├── pages/                     # 小程序页面
  │   ├── home/                  # 首页（游戏开始、玩家选择）
  │   │   ├── index.wxml         # 页面结构
  │   │   ├── index.wxss         # 样式
  │   │   └── index.js           # 页面逻辑
  │   ├── game/                  # 游戏界面（掷骰、计分）
  │   │   ├── index.wxml         # 页面结构
  │   │   ├── index.wxss         # 样式
  │   │   └── index.js           # 页面逻辑
  │   ├── result/                # 游戏结束页面（显示得分）
  │   │   ├── index.wxml         # 页面结构
  │   │   ├── index.wxss         # 样式
  │   │   └── index.js           # 页面逻辑
  │   └── (lobby/)               # V1: 房间界面（可选）
  
  ├── components/                # 可复用组件
  │   ├── dice-cup/              # 摇骰子组件
  │   │   ├── index.wxml         # 组件结构
  │   │   ├── index.wxss         # 组件样式
  │   │   └── index.js           # 组件逻辑
  │   ├── dice-tray/             # 显示骰子的组件
  │   ├── score-card/            # 计分卡组件
  │   ├── turn-banner/           # 当前回合信息组件
  │   └── ui/                    # 其他UI组件，如提示框、动画等
  
  ├── core/                      # 核心游戏逻辑
  │   ├── engine/                # 游戏引擎（回合管理、计分）
  │   │   ├── gameEngine.js      # 游戏状态管理（回合、玩家切换等）
  │   │   ├── dice.js            # 骰子操作（掷骰、保留、重摇等）
  │   │   ├── scoring.js         # 计分规则（13类、奖分）
  │   │   └── rules.js           # 规则常量、枚举定义
  │   ├── store/                 # 游戏状态管理（全局状态）
  │   │   ├── state.js           # 状态初始化、管理
  │   │   └── reducers.js        # 可选：状态更新函数
  │   └── utils/                 # 实用工具（时间、随机数、数组操作等）
  
  ├── assets/                    # 图片、音效等资源
  │   ├── images/                # 图片资源
  │   │   ├── icon/              # 图标
  │   │   ├── dice/              # 骰子图标
  │   │   └── backgrounds/       # 背景
  │   ├── audio/                 # 音效
  │   └── fonts/                 # 字体
  
  ├── adapters/                  # 可插拔模块（如联机、存储）
  │   ├── net/                   # 网络适配器（V1 才需要）
  │   ├── persist/               # 持久化适配器（本地存储 / 云存储）
  
  ├── docs/                      # 项目文档
  │   └── spec.md                # 项目规格文档
```

---

## **2. 核心逻辑文件骨架设计**

### 2.1 **core/engine/gameEngine.js**：游戏引擎

```js
// 初始化游戏状态
function createNewGame(playerInfos) {
  // 初始化玩家状态、回合和其他基础设置
  return {
    players: playerInfos.map(player => createPlayerState(player)),
    currentPlayerIndex: 0,
    round: 1,
    phase: 'TURN_START', 
    turn: initTurnState(),
  };
}

// 开始新回合
function startTurn(state) {
  return {
    ...state,
    phase: 'ROLLING',
    turn: initTurnState()
  };
}

// 结束回合，切换到下一个玩家
function endTurnAndAdvance(state) {
  let nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  let nextRound = (nextPlayerIndex === 0) ? state.round + 1 : state.round;

  return {
    ...state,
    currentPlayerIndex: nextPlayerIndex,
    round: nextRound,
    phase: 'TURN_START',
    turn: initTurnState(),
  };
}

// 初始化回合
function initTurnState() {
  return {
    rollCount: 0,
    dice: [0, 0, 0, 0, 0],
    held: [false, false, false, false, false],
  };
}
```

### 2.2 **core/engine/scoring.js**：计分规则

```js
function calcScoreForKey(dice, key) {
  switch(key) {
    case 'ONE': return sumDice(dice, 1);
    case 'TWO': return sumDice(dice, 2);
    case 'THREE': return sumDice(dice, 3);
    case 'FOUR': return sumDice(dice, 4);
    case 'FIVE': return sumDice(dice, 5);
    case 'SIX': return sumDice(dice, 6);
    case 'THREE_KIND': return hasNOfAKind(dice, 3) ? sumDice(dice) : 0;
    case 'FOUR_KIND': return hasNOfAKind(dice, 4) ? sumDice(dice) : 0;
    case 'FULL_HOUSE': return isFullHouse(dice) ? 25 : 0;
    case 'SMALL_STRAIGHT': return isSmallStraight(dice) ? 30 : 0;
    case 'LARGE_STRAIGHT': return isLargeStraight(dice) ? 40 : 0;
    case 'YAHTZEE': return isYahtzee(dice) ? 50 : 0;
    case 'CHANCE': return sumDice(dice);
    default: return 0;
  }
}

// 计算骰子的总和
function sumDice(dice, n) {
  return dice.filter(d => d === n).reduce((sum, value) => sum + value, 0);
}
```

### 2.3 **core/engine/dice.js**：骰子操作

```js
// 随机掷骰
function rollDice(dice, held, rng=Math.random) {
  let newDice = [...dice];
  for (let i = 0; i < dice.length; i++) {
    if (!held[i]) {
      newDice[i] = Math.floor(rng() * 6) + 1;
    }
  }
  return newDice;
}

// 切换保留骰子
function toggleHold(held, index) {
  let newHeld = [...held];
  newHeld[index] = !newHeld[index];
  return newHeld;
}
```

### 2.4 **core/store/state.js**：游戏状态管理

```js
// 获取当前玩家状态
function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

// 更新玩家分数
function updatePlayerScore(state, playerIndex, score) {
  let player = state.players[playerIndex];
  player.scoreCard[score.key] = { used: true, score: score.value };
  return state;
}
```

### 2.5 **core/utils/time.js**：时间工具（可选）

```js
// 获取当前时间戳
function getCurrentTimestamp() {
  return new Date().getTime();
}
```

---

## **3. 开发步骤指导**

### 3.1 初始化项目

1. 创建微信小程序项目，命名为「快艇骰子」。
2. 初始化项目目录结构，按上述结构创建文件夹与文件。
3. 在 `app.js` 中初始化游戏状态并渲染首页。

### 3.2 创建游戏逻辑

1. 在 `core/engine` 中实现骰子的基本操作，如掷骰、保留。
2. 设计计分系统，包括 13 格计分和额外奖分规则。
3. 在 `core/store` 中管理游戏状态，包括当前回合、玩家状态等。

### 3.3 UI 设计与交互

1. 在 `pages/game` 中实现游戏界面，展示骰子、计分卡等。
2. 使用 `components` 中的 `DiceTray`、`ScoreCard`、`TurnBanner` 等组件来渲染界面。
3. 实现游戏的基本交互，包括掷骰、计分、回合切换等。

---

## **4. 下一步**

1. **实现游戏回合和状态切换**：确保游戏的状态（如掷骰、计分、玩家切换）能够正确管理。
2. **UI 设计与动画**：为骰子摇动、回合切换等操作添加动画效果，提高用户体验。
3. **测试与优化**：进行本地多人游戏测试，确保所有规则和流程都能顺利进行。

---

你可以按照这个目录结构和设计骨架来逐步搭建你的小游戏。每个模块都有独立的责任和功能，可以根据需要进一步扩展。
