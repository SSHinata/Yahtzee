let cloud
try {
  cloud = require('wx-server-sdk')
} catch (e) {
  cloud = null
}

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

function bothJoined(seats) {
  if (!Array.isArray(seats) || seats.length < 2) return false
  return !!(seats[0] && seats[0].uid && seats[0].online) && !!(seats[1] && seats[1].uid && seats[1].online)
}

function createEmptyScoreCard() {
  const keys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'THREE_KIND', 'FOUR_KIND', 'FULL_HOUSE', 'SMALL_STRAIGHT', 'LARGE_STRAIGHT', 'YAHTZEE', 'CHANCE']
  const scoreCard = {}
  for (const key of keys) scoreCard[key] = { used: false, score: null }
  return scoreCard
}

function createInitialGameState(roomId, seats) {
  const p1 = seats[0] && seats[0].name ? seats[0].name : '玩家1'
  const p2 = seats[1] && seats[1].name ? seats[1].name : '玩家2'
  return {
    gameId: `room_${roomId}_${Date.now()}`,
    players: [
      { id: 'p1', name: p1, scoreCard: createEmptyScoreCard(), upperBonusGiven: false, yahtzeeScoredOnce: false, extraYahtzeeBonus: 0 },
      { id: 'p2', name: p2, scoreCard: createEmptyScoreCard(), upperBonusGiven: false, yahtzeeScoredOnce: false, extraYahtzeeBonus: 0 }
    ],
    currentPlayerIndex: 0,
    firstPlayerIndex: 0,
    round: 1,
    turn: { rollCount: 0, dice: [0, 0, 0, 0, 0], held: [false, false, false, false, false], prevHeld: null, isExtraYahtzee: false, lastRollAt: null },
    phase: 'ROLLING',
    log: []
  }
}

exports.main = async (event) => {
  try {
    if (!cloud || !db) throw err('MISSING_DEP', '缺少依赖 wx-server-sdk，请重新部署云函数并安装依赖')

    const uid = getUid()
    if (!uid) throw err('UNAUTHORIZED', '未获取到用户身份')
    const clientId = normalizeClientId(event && event.clientId)
    if (!clientId) throw err('BAD_REQUEST', '缺少clientId')

    const roomId = normalizeRoomId(event && event.roomId)
    if (!roomId) throw err('BAD_REQUEST', '缺少roomId')

    const now = db.serverDate()

    const room = await db.runTransaction(async (txn) => {
      const ref = txn.collection('rooms').doc(roomId)
      const snap = await ref.get().catch((e) => {
        const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
        if (msg && msg.includes('does not exist')) return null
        throw e
      })
      const data = snap && snap.data
      if (!data) throw err('ROOM_NOT_FOUND', '房间不存在')

      const seatIndex = Array.isArray(data.seats) ? data.seats.findIndex((s) => s && s.clientId === clientId) : -1
      if (seatIndex !== 0) throw err('FORBIDDEN', '仅房主可开始')
      if (data.status !== 'waiting') throw err('ROOM_NOT_WAITING', '房间已开始或不可开始')
      if (!bothJoined(data.seats)) throw err('PLAYER_NOT_READY', '需要两位玩家都加入')

      const nextGameState = createInitialGameState(roomId, Array.isArray(data.seats) ? data.seats : [])
      await ref.update({ data: { status: 'playing', gameState: nextGameState, gameVersion: 1, updatedAt: now } })
      const updated = await ref.get()
      return updated.data
    })

    const seats = Array.isArray(room.seats) ? room.seats : []
    const seatIndex = Array.isArray(seats) ? seats.findIndex((s) => s && s.clientId === clientId) : -1
    return { ok: true, roomId, room, self: { isOwner: seatIndex === 0, seatIndex } }
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : 'FUNCTION_ERROR',
      message: e && e.message ? e.message : '开始失败'
    }
  }
}
