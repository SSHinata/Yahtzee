下面给你一份「关键逻辑代码」的**函数签名 + 伪代码（micro-pseudocode）**清单，专门按你 README 里的规则来（5 骰、每回合最多 3 次掷骰、13 格计分、上层奖分、快艇额外奖分）。你后续把这份直接丢给 AI 让它写实现，基本不会跑偏。


---

## 0) 常量与类型（建议先定死）

### 0.1 枚举/常量

```js
/** 五骰 */
const DICE_COUNT = 5;
/** 每回合最多掷骰次数 */
const MAX_ROLLS_PER_TURN = 3;
/** 上层奖分阈值与分数 */
const UPPER_BONUS_THRESHOLD = 63;
const UPPER_BONUS_SCORE = 35;
/** 快艇基础分与额外奖分 */
const YAHTZEE_SCORE = 50;
const EXTRA_YAHTZEE_BONUS = 100;
```

### 0.2 计分格 key（13 个）

```js
const ScoreKey = {
  ONE:'ONE', TWO:'TWO', THREE:'THREE', FOUR:'FOUR', FIVE:'FIVE', SIX:'SIX',
  THREE_KIND:'THREE_KIND',   // 三条
  FOUR_KIND:'FOUR_KIND',     // 四条
  FULL_HOUSE:'FULL_HOUSE',   // 葫芦
  SMALL_STRAIGHT:'SMALL_STRAIGHT', // 小顺
  LARGE_STRAIGHT:'LARGE_STRAIGHT', // 大顺
  YAHTZEE:'YAHTZEE',         // 快艇
  CHANCE:'CHANCE',           // 全选
}
const UPPER_KEYS = [ONE,TWO,THREE,FOUR,FIVE,SIX]; // 便于算上层奖分
```

### 0.3 状态结构（核心字段）

```js
// 单局状态 GameState（建议 immutable 更新）
GameState = {
  players: PlayerState[],
  currentPlayerIndex: number,
  phase: 'TURN_START' | 'ROLLING' | 'SELECT_SCORE' | 'TURN_END' | 'GAME_END',
  round: number, // 1..13（所有玩家共享轮次）
  turn: {
    rollCount: number,      // 0..3
    dice: number[5],        // 1..6
    held: boolean[5],       // 是否保留
    isExtraYahtzee: boolean,// 本回合是否触发“快艇额外奖分”
  }
}

PlayerState = {
  id: string,
  name: string,
  scoreCard: { [ScoreKey]: { used: boolean, score: number|null } },
  upperBonusGiven: boolean,
  yahtzeeScoredOnce: boolean, // “快艇格是否已计过分”
  extraYahtzeeBonus: number,  // 累计+100的总额（可选）
}
```

---

## 1) dice.js：掷骰与保留逻辑

### 1.1 生成随机点数

```js
function randomDieFace(rng=Math.random): number
// return integer 1..6
```

伪代码：

```js
return floor(rng()*6) + 1
```

### 1.2 初始化回合骰子

```js
function initTurnState(): TurnState
```

伪代码：

```js
return {
  rollCount: 0,
  dice: [0,0,0,0,0],   // 0 表示尚未掷
  held: [false,false,false,false,false],
  isExtraYahtzee: false
}
```

### 1.3 执行一次掷骰（只掷未保留的）

```js
function rollDice(dice:number[], held:boolean[], rng=Math.random): number[]
```

伪代码：

```js
newDice = dice.clone()
for i in 0..4:
  if held[i] == false:
    newDice[i] = randomDieFace(rng)
return newDice
```

### 1.4 切换保留状态

```js
function toggleHold(held:boolean[], index:number): boolean[]
```

伪代码：

```js
newHeld = held.clone()
newHeld[index] = !newHeld[index]
return newHeld
```

---

## 2) analyze.js：骰子组合分析（给计分函数复用）

### 2.1 点数频次统计

```js
function getCounts(dice:number[]): Map<number, number>
// e.g. {1:0..5,2:..}
```

伪代码：

```js
counts = new Map([[1,0],[2,0],[3,0],[4,0],[5,0],[6,0]])
for v in dice: counts[v]++
return counts
```

### 2.2 排序后的点数（便于顺子判断）

```js
function getSortedUniqueFaces(dice:number[]): number[]
```

伪代码：

```js
unique = set(dice)
arr = Array.from(unique)
arr.sort()
return arr
```

### 2.3 是否为快艇（五同）

```js
function isYahtzee(dice:number[]): boolean
```

伪代码：

```js
counts = getCounts(dice)
return max(counts.values()) == 5
```

### 2.4 是否满足 N 条（至少 N 个同点）

```js
function hasNOfAKind(dice:number[], n:number): boolean
```

伪代码：

```js
counts = getCounts(dice)
return max(counts.values()) >= n
```

### 2.5 葫芦判断（3+2）

```js
function isFullHouse(dice:number[]): boolean
```

伪代码：

```js
freqs = sort(getCounts(dice).values().filter(v>0)) // 例如 [2,3]
return freqs.length == 2 && freqs[0]==2 && freqs[1]==3
```

### 2.6 小顺/大顺判断

```js
function isSmallStraight(dice:number[]): boolean
function isLargeStraight(dice:number[]): boolean
```

伪代码（小顺）：

```js
faces = getSortedUniqueFaces(dice)
// 允许重复，所以用 unique
// 判定是否包含任一长度4的连续序列： [1,2,3,4] or [2,3,4,5] or [3,4,5,6]
return containsAll(faces, [1,2,3,4]) ||
       containsAll(faces, [2,3,4,5]) ||
       containsAll(faces, [3,4,5,6])
```

伪代码（大顺）：

```js
faces = getSortedUniqueFaces(dice)
if faces.length != 5: return false
return (faces == [1,2,3,4,5]) || (faces == [2,3,4,5,6])
```

### 2.7 总和

```js
function sumDice(dice:number[]): number
```

伪代码：

```js
return dice.reduce((a,b)=>a+b,0)
```

---

## 3) scoring.js：计分计算（纯函数，关键）

> 计分规则源自 README 。
> 建议：所有不满足条件的组合计 0（符合 Yahtzee 传统，也最易理解）。

### 3.1 单格计分（不写入状态，只计算）

```js
function calcScoreForKey(dice:number[], key:ScoreKey): number
```

伪代码：

```js
switch(key):
  case ONE..SIX:
    N = mapKeyToNumber(key)
    return sum(v for v in dice if v==N)

  case THREE_KIND:
    return hasNOfAKind(dice,3) ? sumDice(dice) : 0

  case FOUR_KIND:
    return hasNOfAKind(dice,4) ? sumDice(dice) : 0

  case FULL_HOUSE:
    return isFullHouse(dice) ? 25 : 0

  case SMALL_STRAIGHT:
    return isSmallStraight(dice) ? 30 : 0

  case LARGE_STRAIGHT:
    return isLargeStraight(dice) ? 40 : 0

  case YAHTZEE:
    return isYahtzee(dice) ? 50 : 0

  case CHANCE:
    return sumDice(dice)
```

### 3.2 “可选计分格”与预览（UI 用）

```js
function getScorePreviewMap(dice:number[], scoreCard): Map<ScoreKey, {enabled:boolean, preview:number}>
```

伪代码：

```js
map = {}
for each key in ScoreKey:
  if scoreCard[key].used:
     map[key] = {enabled:false, preview: scoreCard[key].score ?? 0}
  else:
     map[key] = {enabled:true, preview: calcScoreForKey(dice,key)}
return map
```

### 3.3 上层奖分检测

```js
function calcUpperSectionSum(scoreCard): number
function shouldGrantUpperBonus(player:PlayerState): boolean
```

伪代码：

```js
sum = 0
for key in UPPER_KEYS:
  if scoreCard[key].used: sum += scoreCard[key].score
  else sum += 0
return sum

return (!player.upperBonusGiven) && (calcUpperSectionSum(player.scoreCard) >= 63)
```

### 3.4 快艇额外奖分判定（回合级）

规则来自 README：若“快艇格已计过分”，后续再掷出快艇则 +100，并允许把该次骰子记入其他未用格。

```js
function detectExtraYahtzee(dice:number[], player:PlayerState): boolean
```

伪代码：

```js
return player.yahtzeeScoredOnce && isYahtzee(dice)
```

---

## 4) engine.js：回合推进与落子（最关键的状态机）

### 4.1 创建新游戏

```js
function createNewGame(playerInfos:{id,name}[], rngSeed?): GameState
```

伪代码：

```js
players = playerInfos.map(p => createPlayerState(p))
state = {
  players,
  currentPlayerIndex: 0,
  phase:'TURN_START',
  round: 1,
  turn: initTurnState()
}
return state
```

### 4.2 创建玩家

```js
function createPlayerState({id,name}): PlayerState
```

伪代码：

```js
scoreCard = {}
for key in ScoreKey: scoreCard[key] = {used:false, score:null}
return {
  id, name,
  scoreCard,
  upperBonusGiven:false,
  yahtzeeScoredOnce:false,
  extraYahtzeeBonus:0
}
```

### 4.3 开始一个玩家回合

```js
function startTurn(state:GameState): GameState
```

伪代码：

```js
return {
  ...state,
  phase:'ROLLING',
  turn: initTurnState()
}
```

### 4.4 掷骰动作（按钮触发）

```js
function actionRoll(state:GameState, rng=Math.random): GameState
```

伪代码：

```js
assert state.phase == 'ROLLING'
assert state.turn.rollCount < MAX_ROLLS_PER_TURN

newDice = rollDice(state.turn.dice, state.turn.held, rng)
newRollCount = state.turn.rollCount + 1

// 第3次掷完，自动进入选择计分
newPhase = (newRollCount == MAX_ROLLS_PER_TURN) ? 'SELECT_SCORE' : 'ROLLING'

// 检查“快艇额外奖分”只需要在进入SELECT_SCORE前算一次即可
player = currentPlayer(state)
isExtra = (newRollCount == MAX_ROLLS_PER_TURN) ? detectExtraYahtzee(newDice, player) : false

return {
  ...state,
  phase: newPhase,
  turn: { ...state.turn, dice:newDice, rollCount:newRollCount, isExtraYahtzee:isExtra }
}
```

> 也可以允许玩家在 rollCount==3 前手动“结束掷骰并计分”，那就再加一个 `actionEndRolling()`。

### 4.5 切换保留（点骰子）

```js
function actionToggleHold(state:GameState, index:number): GameState
```

伪代码：

```js
assert state.phase == 'ROLLING'
assert state.turn.rollCount >= 1      // 第一次掷完才能保留
assert state.turn.rollCount < 3       // 第三次后不能再改

return { ...state, turn:{...state.turn, held: toggleHold(state.turn.held,index)} }
```

### 4.6 应用计分（玩家点击计分格）

```js
function actionApplyScore(state:GameState, key:ScoreKey): { state:GameState, error?:string }
```

伪代码：

```js
assert state.phase == 'SELECT_SCORE'
player = currentPlayer(state)
if player.scoreCard[key].used: return {state, error:'该计分格已使用'}

dice = state.turn.dice

// 计算本格得分
score = calcScoreForKey(dice, key)

// 写入计分卡
player2 = deepClone(player)
player2.scoreCard[key] = {used:true, score}

// 处理：若key==YAHTZEE 且本次是快艇成立，则标记 yahtzeeScoredOnce
if key == YAHTZEE && isYahtzee(dice):
   player2.yahtzeeScoredOnce = true

// 处理：快艇额外奖分（本回合掷出了快艇且玩家已计过快艇格）
// 规则：立即 +100；且仍允许把本回合骰子记入其他未用格（就是当前选择的 key）
if state.turn.isExtraYahtzee:
   player2.extraYahtzeeBonus += EXTRA_YAHTZEE_BONUS

// 处理上层奖分：在本次落子后检查是否达标
if shouldGrantUpperBonus(player2):
   player2.upperBonusGiven = true
   // 你可以把+35记成一个独立字段，不一定写入某个格
   // totalScore 在计算时加上该奖分即可

// 写回 players
players2 = state.players.clone()
players2[state.currentPlayerIndex] = player2

state2 = { ...state, players:players2, phase:'TURN_END' }
return { state: state2 }
```

### 4.7 结束回合并切换玩家

```js
function endTurnAndAdvance(state:GameState): GameState
```

伪代码：

```js
assert state.phase == 'TURN_END'

// 判断是否游戏结束：所有玩家的scoreCard都used==true(13格)
if isGameOver(state.players):
  return { ...state, phase:'GAME_END' }

nextIndex = (state.currentPlayerIndex + 1) % state.players.length

// 如果从最后一名玩家回到第一名玩家，round+1
round2 = state.round
if nextIndex == state.firstPlayerIndex: round2 += 1 // 或者用“每次轮回”判断

return {
  ...state,
  currentPlayerIndex: nextIndex,
  round: round2,
  phase:'TURN_START',
  turn: initTurnState()
}
```

> 你如果不维护 `firstPlayerIndex`，也可以用：`if nextIndex == 0 then round++`（前提：玩家顺序固定从 0 开始）。

### 4.8 计算总分（结算/实时展示）

```js
function calcPlayerTotal(player:PlayerState): number
```

伪代码：

```js
base = 0
for key in ScoreKey:
  if player.scoreCard[key].used: base += player.scoreCard[key].score
upperBonus = player.upperBonusGiven ? UPPER_BONUS_SCORE : 0
extraYahtzee = player.extraYahtzeeBonus || 0
return base + upperBonus + extraYahtzee
```

### 4.9 游戏结束判定

```js
function isGameOver(players:PlayerState[]): boolean
```

伪代码：

```js
for each player in players:
  for each key in ScoreKey:
    if !player.scoreCard[key].used: return false
return true
```

---

## 5) UI 交互需要的“辅助函数签名”（给页面写起来很顺）

### 5.1 当前玩家

```js
function currentPlayer(state:GameState): PlayerState
```

### 5.2 当前阶段允许的按钮状态

```js
function getUIFlags(state:GameState): {
  canRoll:boolean,
  canToggleHold:boolean,
  canSelectScore:boolean
}
```

伪代码：

```js
return {
  canRoll: state.phase=='ROLLING' && state.turn.rollCount < 3,
  canToggleHold: state.phase=='ROLLING' && state.turn.rollCount>=1 && state.turn.rollCount<3,
  canSelectScore: state.phase=='SELECT_SCORE'
}
```

### 5.3 计分预览（ScoreCard 组件用）

```js
function getScoreOptionsForUI(state:GameState): { key, enabled, preview }[]
```

内部直接用 `getScorePreviewMap(state.turn.dice, currentPlayer.scoreCard)`。

---

## 6) 两个容易出错的点（我替你提前钉住）

1. **快艇额外奖分触发条件**：
   必须满足：`player.yahtzeeScoredOnce == true` 且本回合 `isYahtzee(dice)==true` 才 +100。

> 注意：这里不要求你本回合选择“快艇格”，因为 README 允许“记入其他未用格”。

2. **顺子判断必须去重**：
   小顺/大顺都要用 unique faces，否则 [1,2,2,3,4] 会被误判失败。

---
