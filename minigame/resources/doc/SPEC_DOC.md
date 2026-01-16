
---

## 1) 项目总体设计

### 1.1 开发阶段建议

* **V0（单机/本地多人轮流）**：不接云开发、不联网；先把规则、UI、流程跑通。
* **V1（线上多人房间）**：再接云开发（或自建后端）；加入房间码、实时同步、断线重连。
* **V2（排行榜/战绩）**：持久化与统计。

你之前说不想额外成本，建议先做 **V0**，结构上把“联机/存储”做成可插拔。

### 1.2 核心模块

* **GameEngine（规则引擎）**：纯 JS、无 UI 依赖；负责掷骰/重掷/校验/计分/回合推进。
* **StateStore（状态管理）**：管理当前局面 state（玩家、骰子、计分表、阶段等）。
* **UI 层**：页面 + 组件（骰子区、计分卡、提示区、结算弹窗）。
* **(可选) NetAdapter**：联机时的状态同步（V1 才需要）。
* **(可选) PersistAdapter**：本地缓存/云存储（V1/V2 才需要）。

---

## 2) 数据模型设计（建议先定死）

### 2.1 基础枚举

* `Phase`（局内阶段）

  * `INIT`（初始化/决定先手）
  * `TURN_START`
  * `ROLLING`（第 1~3 次掷骰）
  * `SELECT_SCORE`（选择计分格）
  * `TURN_END`
  * `GAME_END`

* `ScoreKey`（计分格 13 类）

  * 上层：`ONE..SIX`
  * 下层：`THREE_KIND`(三条), `FOUR_KIND`(四条), `FULL_HOUSE`(葫芦), `SMALL_STRAIGHT`(小顺), `LARGE_STRAIGHT`(大顺), `YAHTZEE`(快艇), `CHANCE`(全选)

### 2.2 状态结构（建议）

```js
GameState = {
  gameId,
  players: [
    { id, name, totalScore, upperScore, upperBonusGiven, yahtzeeScoredOnce, extraYahtzeeBonus, scoreCard: { [ScoreKey]: { used: boolean, score: number|null } } }
  ],
  currentPlayerIndex,
  round: 1, // 1..13（对所有玩家统一的“轮次”）
  turn: { // 当前玩家的回合态
    rollCount: 0, // 0..3
    dice: [1..6]*5,
    held: [boolean]*5,
    lastRollAt,
  },
  phase,
  firstPlayerIndex,
  log: [] // 可选：回放/调试
}
```

---

## 3) 计分与规则引擎设计

### 3.1 计分接口（强烈建议纯函数）

```js
score(rollDiceArray, scoreKey, playerState) -> {
  score: number,
  meta?: { isValid: boolean, reason?: string, isExtraYahtzee?: boolean, jokerAllowed?: boolean }
}
```

### 3.2 计分规则要点（按 README）

* **一点至六点**：选 N，统计所有等于 N 的骰子点数之和。
* **三条**：至少 3 个相同点数 → 5 颗总和，否则 0（建议）
* **四条**：至少 4 个相同点数 → 5 颗总和，否则 0
* **葫芦**：3+2 → 25，否则 0
* **小顺**：任意连续 4 → 30，否则 0
* **大顺**：连续 5 → 40，否则 0
* **快艇**：5 个相同 → 50，否则 0
* **全选**：5 颗总和
* **上层奖分**：ONE..SIX 合计 ≥ 63，+35（只给一次）
* **快艇额外奖分**：若“快艇格已计过分”，后续再掷出快艇：

  * 立即 +100
  * 允许把该回合骰子按“其他未用格”计分（你 README 的表述是允许“记入其他还未使用的计分格”）
    建议实现为：进入 `SELECT_SCORE` 时，如果检测到 extra yahtzee，UI 提示“本回合为快艇加成，可选择任一未用计分格结算”。

---

## 4) 页面与组件设计（小程序视角）

### 4.1 页面（pages）

1. `pages/home`：进入、创建房间/本地开始、规则入口
2. `pages/lobby`：房间准备（V1 才需要；V0 可省略）
3. `pages/game`：核心对局界面
4. `pages/result`：结算/再来一局

### 4.2 组件（components）

* `DiceCup`：摇骰按钮、摇骰动画触发
* `DiceTray`：5 颗骰子展示、点击“保留/取消保留”
* `ScoreCard`：13 格列表 + 每格预览分（hover/点击显示“本回合可得分”）
* `TurnBanner`：当前玩家、回合数、掷骰次数提示
* `ModalConfirm`：选择计分格确认
* `Toast`：错误提示（如：已用过该计分格）

---

## 5) 关键流程设计（你要写代码最依赖的部分）

### 5.1 开局流程（决定先手）

1. `INIT`：每位玩家掷 5 颗（一次即可）
2. 计算总和最大者为 `firstPlayerIndex`（同分建议：并列者重掷一次，直到分出）
3. `currentPlayerIndex = firstPlayerIndex`
4. 进入 `TURN_START`

### 5.2 单回合流程（3 次掷骰 + 选格计分）

1. `TURN_START`：

   * turn 状态 reset：`rollCount=0, held=all false`
2. `ROLLING`：

   * 玩家点“摇骰”
   * `rollCount++`
   * 对未 held 的骰子重新随机 1..6
   * 若 `rollCount < 3`：允许继续“选择保留并重摇”
   * 若 `rollCount == 3`：自动进入 `SELECT_SCORE`
3. `SELECT_SCORE`：

   * UI 展示 13 格：

     * 已使用格 disabled
     * 未使用格显示“本回合若选此格的得分预览”
   * 玩家点击某格 → `applyScore(scoreKey)`
4. `TURN_END`：

   * 更新该玩家计分表、总分、上层奖分状态、快艇额外奖分累计
   * 切换到下一个玩家
   * 若所有玩家都已填满 13 格 → `GAME_END` 否则 `TURN_START`

### 5.3 结束流程

* `GAME_END`：

  * 计算各玩家 `totalScore`
  * 排名 + 展示明细（上层/下层/奖分/快艇额外）
  * 提供“再来一局”（复用房间/本地重开）

---

## 6) 目录结构设计（推荐：可扩展、好维护）

以微信小游戏（原生 JS）为例：

```
minigame/
  project.config.json
  game.json
  app.js
  app.json
  app.wxss

  pages/
    home/
      index.wxml
      index.wxss
      index.js
    game/
      index.wxml
      index.wxss
      index.js
    result/
      index.wxml
      index.wxss
      index.js
    (lobby/...)           # V1 再加

  components/
    dice-cup/
      index.wxml
      index.wxss
      index.js
    dice-tray/
      index.wxml
      index.wxss
      index.js
    score-card/
      index.wxml
      index.wxss
      index.js
    turn-banner/
      index.wxml
      index.wxss
      index.js
    ui/
      modal-confirm/...
      toast/...

  core/                   # 纯逻辑层（重点）
    engine/
      gameEngine.js       # phase / turn / applyScore / nextPlayer / end判定
      dice.js             # rollDice, rerollDice, validateDice
      scoring.js          # score calculators (13类)
      rules.js            # 常量、枚举、配置
    store/
      state.js            # state 初始化、get/set、订阅机制（轻量）
      reducers.js         # 可选：纯函数 reducer
    utils/
      random.js
      array.js
      time.js

  assets/
    images/
      icon/
      dice/
    audio/
    fonts/

  adapters/               # 可插拔：先留空，后续再实现
    net/
      none.js             # V0：空实现
      cloud.js            # V1：云开发/WS 同步
    persist/
      local.js            # wx.setStorage
      cloud.js            # 云数据库

  docs/
    spec.md               # 你要的 specDoc（后续可扩写）
```

> 关键原则：**UI 不直接写规则判断**，统一调用 `core/engine`；以后接联机时才能不推倒重来。

---

## 7) 最小可行版本（MVP）清单

**必须有**

* 2–4 本地玩家轮流
* 5 骰、最多 3 次掷骰、可保留重掷
* 13 格计分 + 禁止重复使用
* 上层奖分 + 快艇额外奖分（至少先做加 100 + 可选未用格）
* 结算页

**可后做**

* 动画细化
* 断线重连
* 房间匹配
* 战绩/排行榜

---