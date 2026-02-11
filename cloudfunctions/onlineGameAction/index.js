let cloud
try {
  cloud = require('wx-server-sdk')
} catch (e) {
  cloud = null
}

const https = require('https')

let db = null
if (cloud) {
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
  db = cloud.database()
}

function getUid() {
  const wxContext = cloud.getWXContext()
  return wxContext.OPENID || wxContext.UNIONID || ''
}

function err(code, message) {
  const e = new Error(message)
  e.code = code
  return e
}

function normalizeRoomId(roomId) {
  if (typeof roomId !== 'string') return ''
  return roomId.trim().toUpperCase()
}

function normalizeClientId(v) {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (!s) return ''
  return s.slice(0, 64)
}

function normalizeDebug(v) {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '1' || s === 'true' || s === 'yes') return true
    if (s === '0' || s === 'false' || s === 'no') return false
  }
  return false
}

function notifyRoomUpdated(roomId, extra) {
  const cfg = require('./notifyConfig')
  const base = process.env.WS_NOTIFY_BASE || process.env.NOTIFY_BASE || (cfg && cfg.notifyBase) || 'https://ws-server-224791-6-1402157537.sh.run.tcloudbase.com'
  const url = new URL('/notify', base)
  const token = process.env.WS_NOTIFY_TOKEN || process.env.NOTIFY_TOKEN || (cfg && cfg.notifyToken) || ''
  const payload = { roomId, ...(extra || {}) }
  if (token) payload.token = token
  const body = JSON.stringify(payload)
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
  if (token) headers.Authorization = `Bearer ${token}`

  return new Promise((resolve) => {
    const req = https.request(
      {
        method: 'POST',
        hostname: url.hostname,
        path: url.pathname,
        port: url.port ? Number(url.port) : 443,
        headers,
        timeout: 800
      },
      (res) => {
        res.on('data', () => {})
        res.on('end', () => resolve(true))
      }
    )
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.on('error', () => resolve(false))
    req.write(body)
    req.end()
  })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientDbError(e) {
  const code = e && (e.errCode || e.errCode === 0 ? e.errCode : null)
  if (code === -501001 || code === 501001) return true
  const msg = e && (e.message || e.errMsg) ? String(e.message || e.errMsg) : ''
  if (msg && msg.toLowerCase().includes('resource system')) return true
  return false
}

async function runWithRetry(fn, maxAttempts) {
  const tries = Math.max(1, Number(maxAttempts) || 1)
  for (let i = 0; i < tries; i += 1) {
    try {
      return await fn()
    } catch (e) {
      const isLast = i === tries - 1
      if (isLast || !isTransientDbError(e)) throw e
      const base = 80 * Math.pow(2, i)
      const jitter = Math.floor(Math.random() * 40)
      await sleep(base + jitter)
    }
  }
  return await fn()
}

const ScoreKey = {
  ONE: 'ONE',
  TWO: 'TWO',
  THREE: 'THREE',
  FOUR: 'FOUR',
  FIVE: 'FIVE',
  SIX: 'SIX',
  THREE_KIND: 'THREE_KIND',
  FOUR_KIND: 'FOUR_KIND',
  FULL_HOUSE: 'FULL_HOUSE',
  SMALL_STRAIGHT: 'SMALL_STRAIGHT',
  LARGE_STRAIGHT: 'LARGE_STRAIGHT',
  YAHTZEE: 'YAHTZEE',
  CHANCE: 'CHANCE'
}

const UPPER_KEYS = [ScoreKey.ONE, ScoreKey.TWO, ScoreKey.THREE, ScoreKey.FOUR, ScoreKey.FIVE, ScoreKey.SIX]
const UPPER_BONUS_SCORE = 35
const EXTRA_YAHTZEE_BONUS = 100
const MAX_ROLLS_PER_TURN = 3

const Phase = {
  ROLLING: 'ROLLING',
  SELECT_SCORE: 'SELECT_SCORE',
  GAME_END: 'GAME_END'
}

function getCounts(dice) {
  const counts = new Map()
  for (let v = 1; v <= 6; v += 1) counts.set(v, 0)
  for (const v of dice) {
    if (v >= 1 && v <= 6) counts.set(v, counts.get(v) + 1)
  }
  return counts
}

function getSortedUniqueFaces(dice) {
  const set = new Set(dice)
  const arr = Array.from(set)
  arr.sort((a, b) => a - b)
  return arr
}

function isYahtzee(dice) {
  const counts = getCounts(dice)
  let max = 0
  counts.forEach((v) => {
    if (v > max) max = v
  })
  return max === 5
}

function hasNOfAKind(dice, n) {
  const counts = getCounts(dice)
  let max = 0
  counts.forEach((v) => {
    if (v > max) max = v
  })
  return max >= n
}

function isFullHouse(dice) {
  const counts = getCounts(dice)
  const freqs = []
  counts.forEach((v) => {
    if (v > 0) freqs.push(v)
  })
  freqs.sort((a, b) => a - b)
  if (freqs.length !== 2) return false
  return freqs[0] === 2 && freqs[1] === 3
}

function containsAll(arr, target) {
  return target.every((v) => arr.indexOf(v) !== -1)
}

function isSmallStraight(dice) {
  const faces = getSortedUniqueFaces(dice)
  if (containsAll(faces, [1, 2, 3, 4])) return true
  if (containsAll(faces, [2, 3, 4, 5])) return true
  if (containsAll(faces, [3, 4, 5, 6])) return true
  return false
}

function isLargeStraight(dice) {
  const faces = getSortedUniqueFaces(dice)
  if (faces.length !== 5) return false
  const a = [1, 2, 3, 4, 5]
  const b = [2, 3, 4, 5, 6]
  const okA = faces.every((v, i) => v === a[i])
  const okB = faces.every((v, i) => v === b[i])
  return okA || okB
}

function sumDice(dice) {
  return dice.reduce((acc, v) => acc + v, 0)
}

function mapKeyToNumber(key) {
  if (key === ScoreKey.ONE) return 1
  if (key === ScoreKey.TWO) return 2
  if (key === ScoreKey.THREE) return 3
  if (key === ScoreKey.FOUR) return 4
  if (key === ScoreKey.FIVE) return 5
  if (key === ScoreKey.SIX) return 6
  return null
}

function calcScoreForKey(dice, key) {
  const n = mapKeyToNumber(key)
  if (n != null) return dice.filter((v) => v === n).reduce((acc, v) => acc + v, 0)
  switch (key) {
    case ScoreKey.THREE_KIND:
      return hasNOfAKind(dice, 3) ? sumDice(dice) : 0
    case ScoreKey.FOUR_KIND:
      return hasNOfAKind(dice, 4) ? sumDice(dice) : 0
    case ScoreKey.FULL_HOUSE:
      return isFullHouse(dice) ? 25 : 0
    case ScoreKey.SMALL_STRAIGHT:
      return isSmallStraight(dice) ? 30 : 0
    case ScoreKey.LARGE_STRAIGHT:
      return isLargeStraight(dice) ? 40 : 0
    case ScoreKey.YAHTZEE:
      return isYahtzee(dice) ? 50 : 0
    case ScoreKey.CHANCE:
      return sumDice(dice)
    default:
      return 0
  }
}

function calcUpperSectionSum(scoreCard) {
  let sum = 0
  for (const key of UPPER_KEYS) {
    const cell = scoreCard[key]
    if (cell && cell.used && typeof cell.score === 'number') sum += cell.score
  }
  return sum
}

function shouldGrantUpperBonus(player) {
  if (player.upperBonusGiven) return false
  return calcUpperSectionSum(player.scoreCard) >= 63
}

function detectExtraYahtzee(dice, player) {
  return !!(player && player.yahtzeeScoredOnce) && isYahtzee(dice)
}

function calcPlayerTotal(player) {
  let base = 0
  const scoreCard = player && player.scoreCard ? player.scoreCard : {}
  Object.keys(scoreCard).forEach((key) => {
    const cell = scoreCard[key]
    if (cell && cell.used && typeof cell.score === 'number') base += cell.score
  })
  const upperBonus = player && player.upperBonusGiven ? UPPER_BONUS_SCORE : 0
  const extraYahtzee = player && player.extraYahtzeeBonus ? player.extraYahtzeeBonus : 0
  return base + upperBonus + extraYahtzee
}

function randomDieFace() {
  return Math.floor(Math.random() * 6) + 1
}

function rollDice(dice, held) {
  const next = dice.slice()
  for (let i = 0; i < next.length; i += 1) {
    if (!held[i]) next[i] = randomDieFace()
  }
  return next
}

function toggleHold(held, index) {
  const next = held.slice()
  next[index] = !next[index]
  return next
}

function currentPlayer(state) {
  return state.players[state.currentPlayerIndex]
}

function actionRoll(state) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许掷骰')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('ROLLS_EXHAUSTED', '本回合掷骰次数已用尽')

  const newDice = rollDice(state.turn.dice, state.turn.held)
  const newRollCount = state.turn.rollCount + 1
  const player = currentPlayer(state)
  const isExtra = detectExtraYahtzee(newDice, player)

  return {
    ...state,
    turn: {
      ...state.turn,
      dice: newDice,
      rollCount: newRollCount,
      prevHeld: null,
      isExtraYahtzee: isExtra,
      lastRollAt: Date.now()
    }
  }
}

function actionEnterScoreSelection(state) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许进入计分')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '至少掷骰一次后才能计分')
  return {
    ...state,
    phase: Phase.SELECT_SCORE,
    turn: {
      ...state.turn,
      prevHeld: state.turn.held.slice(),
      held: [true, true, true, true, true]
    }
  }
}

function actionToggleHold(state, index) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许保留骰子')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '必须掷过至少一次才能保留')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('BAD_REQUEST', '本回合已结束掷骰')
  if (typeof index !== 'number' || index < 0 || index > 4) throw err('BAD_REQUEST', '无效骰子索引')
  return {
    ...state,
    turn: {
      ...state.turn,
      held: toggleHold(state.turn.held, index)
    }
  }
}

function actionToggleHoldBatch(state, indices) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许保留骰子')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '必须掷过至少一次才能保留')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('BAD_REQUEST', '本回合已结束掷骰')
  if (!Array.isArray(indices)) throw err('BAD_REQUEST', '缺少indices')
  const parity = [0, 0, 0, 0, 0]
  for (const v of indices) {
    if (typeof v !== 'number' || v < 0 || v > 4) throw err('BAD_REQUEST', '无效骰子索引')
    parity[v] += 1
  }
  let nextHeld = state.turn.held
  for (let i = 0; i < 5; i += 1) {
    if (parity[i] % 2 === 1) nextHeld = toggleHold(nextHeld, i)
  }
  return {
    ...state,
    turn: {
      ...state.turn,
      held: nextHeld
    }
  }
}

function actionSetHold(state, index, held) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许保留骰子')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '必须掷过至少一次才能保留')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('BAD_REQUEST', '本回合已结束掷骰')
  if (typeof index !== 'number' || index < 0 || index > 4) throw err('BAD_REQUEST', '无效骰子索引')
  const targetHeld = !!held
  const nextHeld = state.turn.held.slice()
  nextHeld[index] = targetHeld
  return {
    ...state,
    turn: {
      ...state.turn,
      held: nextHeld
    }
  }
}

function actionSetHoldBatch(state, held) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许保留骰子')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '必须掷过至少一次才能保留')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('BAD_REQUEST', '本回合已结束掷骰')
  if (!Array.isArray(held) || held.length < 5) throw err('BAD_REQUEST', '缺少held数组')
  const nextHeld = held.slice(0, 5).map((v) => !!v)
  return {
    ...state,
    turn: {
      ...state.turn,
      held: nextHeld
    }
  }
}

function actionStopRolling(state) {
  if (state.phase !== Phase.ROLLING) throw err('INVALID_PHASE', '当前阶段不允许停止掷骰')
  if (state.turn.rollCount < 1) throw err('BAD_REQUEST', '至少掷骰一次后才能停止')
  const player = currentPlayer(state)
  const isExtra = detectExtraYahtzee(state.turn.dice, player)
  return {
    ...state,
    phase: Phase.SELECT_SCORE,
    turn: {
      ...state.turn,
      prevHeld: state.turn.held.slice(),
      held: [true, true, true, true, true],
      isExtraYahtzee: isExtra
    }
  }
}

function actionCancelScoreSelection(state) {
  if (state.phase !== Phase.SELECT_SCORE) throw err('INVALID_PHASE', '当前阶段不允许返回掷骰')
  if (state.turn.rollCount >= MAX_ROLLS_PER_TURN) throw err('BAD_REQUEST', '掷骰次数已满，不能返回掷骰')
  const restoredHeld = state.turn.prevHeld ? state.turn.prevHeld.slice() : [false, false, false, false, false]
  return {
    ...state,
    phase: Phase.ROLLING,
    turn: {
      ...state.turn,
      held: restoredHeld,
      prevHeld: null
    }
  }
}

function actionApplyScoreAndAdvance(state, key) {
  if (state.phase !== Phase.SELECT_SCORE) throw err('INVALID_PHASE', '当前阶段不允许计分')
  if (typeof key !== 'string') throw err('BAD_REQUEST', '缺少计分项')
  const player = currentPlayer(state)
  const cell = player && player.scoreCard ? player.scoreCard[key] : null
  if (!cell || cell.used) throw err('BAD_REQUEST', '该计分格已使用')

  const dice = state.turn.dice
  let score = calcScoreForKey(dice, key)

  const player2 = JSON.parse(JSON.stringify(player))
  player2.scoreCard[key] = { used: true, score }
  if (key === ScoreKey.YAHTZEE && score > 0) player2.yahtzeeScoredOnce = true
  if (state.turn.isExtraYahtzee) player2.extraYahtzeeBonus += EXTRA_YAHTZEE_BONUS
  if (shouldGrantUpperBonus(player2)) player2.upperBonusGiven = true

  const players2 = state.players.slice()
  players2[state.currentPlayerIndex] = player2

  const allUsed = players2.every((p) => Object.keys(p.scoreCard).every((k) => p.scoreCard[k].used))
  if (allUsed) {
    return {
      ...state,
      players: players2,
      phase: Phase.GAME_END
    }
  }

  const nextIndex = (state.currentPlayerIndex + 1) % players2.length
  let round2 = state.round
  if (nextIndex === state.firstPlayerIndex) round2 += 1

  return {
    ...state,
    players: players2,
    currentPlayerIndex: nextIndex,
    round: round2,
    phase: Phase.ROLLING,
    turn: { rollCount: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], prevHeld: null, isExtraYahtzee: false, lastRollAt: null }
  }
}

function computeWinner(gameState, seats) {
  const totals = (gameState.players || []).map((p) => calcPlayerTotal(p))
  const max = Math.max(...totals)
  const winners = totals.map((t, idx) => ({ t, idx })).filter((x) => x.t === max).map((x) => x.idx)
  if (winners.length !== 1) {
    return { isTie: true, winners, maxScore: max }
  }
  const idx = winners[0]
  const name = (seats && seats[idx] && seats[idx].name) ? seats[idx].name : (gameState.players[idx] ? gameState.players[idx].name : '')
  return { isTie: false, winnerIndex: idx, winnerName: name, maxScore: max }
}

exports.main = async (event) => {
  try {
    if (!cloud || !db) throw err('MISSING_DEP', '缺少依赖 wx-server-sdk，请重新部署云函数并安装依赖')

    const uid = getUid()
    if (!uid) throw err('UNAUTHORIZED', '未获取到用户身份')
    const roomId = normalizeRoomId(event && event.roomId)
    if (!roomId) throw err('BAD_REQUEST', '缺少roomId')
    const clientId = normalizeClientId(event && event.clientId)
    if (!clientId) throw err('BAD_REQUEST', '缺少clientId')
    const debug = normalizeDebug(event && event.debug)
    const action = (event && event.action) ? String(event.action) : ''
    if (!action) throw err('BAD_REQUEST', '缺少action')

    const now = db.serverDate()

    const result = await runWithRetry(() => db.runTransaction(async (txn) => {
      const ref = txn.collection('rooms').doc(roomId)
      const snap = await ref.get().catch((e) => {
        const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
        if (msg && msg.includes('does not exist')) return null
        throw e
      })
      const room = snap && snap.data
      if (!room) throw err('ROOM_NOT_FOUND', '房间不存在')
      if (room.status !== 'playing') throw err('ROOM_NOT_PLAYING', '房间未开始')
      if (!room.gameState) throw err('GAME_NOT_STARTED', '对局状态未初始化')

      const seats = Array.isArray(room.seats) ? room.seats : []
      let seatIndex = seats.findIndex((s) => s && s.clientId === clientId)
      if (seatIndex < 0) seatIndex = seats.findIndex((s) => s && s.uid === uid)
      if (seatIndex < 0) throw err('NOT_IN_ROOM', '未在房间内')
      if (!(seats[seatIndex] && seats[seatIndex].uid === uid)) throw err('FORBIDDEN', '身份校验失败')

      const gameState = room.gameState
      const isMyTurn = gameState && typeof gameState.currentPlayerIndex === 'number' && gameState.currentPlayerIndex === seatIndex

      const nextSeats = seats.map((s, idx) => {
        if (!s) return s
        if (idx !== seatIndex) return s
        if (!s.uid) return s
        const nextClientId = debug ? (s.clientId || clientId || null) : clientId
        return { ...s, clientId: nextClientId, online: true }
      })

      let nextState = gameState
      if (action === 'ROLL') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionRoll(gameState)
      } else if (action === 'TOGGLE_HOLD') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionToggleHold(gameState, event && event.index)
      } else if (action === 'TOGGLE_HOLD_BATCH') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionToggleHoldBatch(gameState, event && event.indices)
      } else if (action === 'SET_HOLD') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionSetHold(gameState, event && event.index, event && event.held)
      } else if (action === 'SET_HOLD_BATCH') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionSetHoldBatch(gameState, event && event.held)
      } else if (action === 'STOP') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionStopRolling(gameState)
      } else if (action === 'ENTER_SCORE') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionEnterScoreSelection(gameState)
      } else if (action === 'CANCEL_SCORE') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionCancelScoreSelection(gameState)
      } else if (action === 'APPLY_SCORE') {
        if (!isMyTurn) throw err('TURN_NOT_YOURS', '未轮到你操作')
        nextState = actionApplyScoreAndAdvance(gameState, event && event.key)
      } else {
        throw err('BAD_REQUEST', '未知action')
      }

      const nextVersion = typeof room.gameVersion === 'number' ? room.gameVersion + 1 : 1
      const update = { seats: nextSeats, gameState: nextState, gameVersion: nextVersion, updatedAt: now }

      if (nextState.phase === Phase.GAME_END) {
        update.gameResult = computeWinner(nextState, seats)
      }

      await ref.update({ data: update })
      const updated = await ref.get()
      return { room: updated.data, seatIndex, action, actorSeatIndex: seatIndex, nextState }
    }), 3)

    const version = result && result.room && typeof result.room.gameVersion === 'number' ? result.room.gameVersion : null
    const stateForPatch = result && result.nextState ? result.nextState : (result && result.room ? result.room.gameState : null)
    const patch = stateForPatch
      ? {
          phase: stateForPatch.phase,
          currentPlayerIndex: stateForPatch.currentPlayerIndex,
          turn: stateForPatch.turn
            ? {
                held: Array.isArray(stateForPatch.turn.held) ? stateForPatch.turn.held.slice(0, 5).map((v) => !!v) : null,
                rollCount: typeof stateForPatch.turn.rollCount === 'number' ? stateForPatch.turn.rollCount : null,
                lastRollAt: typeof stateForPatch.turn.lastRollAt === 'number' ? stateForPatch.turn.lastRollAt : null
              }
            : null
        }
      : null
    await notifyRoomUpdated(roomId, {
      version: version || null,
      updatedAt: Date.now(),
      action: result && result.action ? result.action : action,
      actorSeatIndex: result && typeof result.actorSeatIndex === 'number' ? result.actorSeatIndex : null,
      patch,
      state: stateForPatch || null
    }).catch(() => {})
    return { ok: true, roomId, room: result.room, self: { seatIndex: result.seatIndex } }
  } catch (e) {
    return { ok: false, code: e && e.code ? e.code : 'FUNCTION_ERROR', message: e && e.message ? e.message : '操作失败' }
  }
}
