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

function seatLabel(index) {
  return index === 0 ? '玩家1' : '玩家2'
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

function randomUniqueFruitName(existingNames) {
  const fruits = ['苹果', '香蕉', '橘子', '葡萄', '草莓', '芒果', '菠萝', '西瓜', '樱桃', '梨子', '柚子', '火龙果', '猕猴桃', '蓝莓']
  const used = new Set(Array.isArray(existingNames) ? existingNames.filter(Boolean) : [])
  const candidates = fruits.filter((n) => !used.has(n))
  const pool = candidates.length > 0 ? candidates : fruits
  return pool[Math.floor(Math.random() * pool.length)]
}

function ensureSeats(input) {
  const seats = Array.isArray(input) ? input.slice(0, 2) : []
  while (seats.length < 2) seats.push(null)
  return seats.map((s, idx) => {
    if (s && typeof s === 'object') {
      return {
        uid: s.uid || null,
        clientId: s.clientId || null,
        name: typeof s.name === 'string' ? s.name : seatLabel(idx),
        online: !!s.online,
        joinedAt: s.joinedAt || null
      }
    }
    return { uid: null, clientId: null, name: seatLabel(idx), online: false, joinedAt: null }
  })
}

exports.main = async (event) => {
  try {
    if (!cloud || !db) throw err('MISSING_DEP', '缺少依赖 wx-server-sdk，请重新部署云函数并安装依赖')

    const uid = getUid()
    if (!uid) throw err('UNAUTHORIZED', '未获取到用户身份')

    const roomId = normalizeRoomId(event && event.roomId)
    if (!roomId) throw err('BAD_REQUEST', '缺少roomId')
    const clientId = normalizeClientId(event && event.clientId)
    const debug = normalizeDebug(event && event.debug)

    const now = db.serverDate()
    let seatIndex = -1
    let isOwner = false

    const room = await db.runTransaction(async (txn) => {
      const ref = txn.collection('rooms').doc(roomId)
      const snap = await ref.get().catch((e) => {
        const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
        if (msg && msg.includes('does not exist')) return null
        throw e
      })
      const data = snap && snap.data
      if (!data) throw err('ROOM_NOT_FOUND', '房间不存在')

      const seats = ensureSeats(data.seats)
      const existingIndex = clientId ? seats.findIndex((s) => s && s.clientId === clientId) : -1
      const existingByUidIndex = seats.findIndex((s) => s && s.uid === uid)

      if (existingIndex >= 0) {
        seatIndex = existingIndex
        const nextSeats = seats.map((s, idx) => {
          if (!s) return s
          if (idx !== existingIndex) return s
          return {
            ...s,
            online: true
          }
        })
        await ref.update({ data: { seats: nextSeats, updatedAt: now } })
        const updated = await ref.get()
        return updated.data
      }

      if (data.status !== 'waiting') {
        if (existingByUidIndex >= 0) {
          seatIndex = existingByUidIndex
          const nextSeats = seats.map((s, idx) => {
            if (!s) return s
            if (idx !== existingByUidIndex) return s
            return {
              ...s,
              clientId: (debug ? (s.clientId || clientId || null) : (clientId || s.clientId || null)),
              online: true
            }
          })
          await ref.update({ data: { seats: nextSeats, updatedAt: now } })
          const updated = await ref.get()
          return updated.data
        }
        throw err('ROOM_NOT_WAITING', '房间已开始或不可加入')
      }

      if (existingByUidIndex >= 0 && debug) {
        const emptyIndex = seats.findIndex((s) => s && !s.uid)
        if (emptyIndex >= 0) {
          seatIndex = emptyIndex
          const existingNames = seats.map((s) => (s && typeof s.name === 'string' ? s.name : '')).filter(Boolean)
          const nextSeats = seats.map((s, idx) => {
            if (!s) return s
            if (idx !== emptyIndex) return s
            return {
              uid,
              clientId: clientId || null,
              name: randomUniqueFruitName(existingNames),
              online: true,
              joinedAt: now
            }
          })
          await ref.update({ data: { seats: nextSeats, updatedAt: now } })
          const updated = await ref.get()
          return updated.data
        }
        seatIndex = existingByUidIndex
        const nextSeats = seats.map((s, idx) => {
          if (!s) return s
          if (idx !== existingByUidIndex) return s
          return {
            ...s,
            clientId: (s.clientId || clientId || null),
            online: true
          }
        })
        await ref.update({ data: { seats: nextSeats, updatedAt: now } })
        const updated = await ref.get()
        return updated.data
      }

      if (existingByUidIndex >= 0) {
        seatIndex = existingByUidIndex
        const nextSeats = seats.map((s, idx) => {
          if (!s) return s
          if (idx !== existingByUidIndex) return s
          return {
            ...s,
            clientId: (clientId || s.clientId || null),
            online: true
          }
        })
        await ref.update({ data: { seats: nextSeats, updatedAt: now } })
        const updated = await ref.get()
        return updated.data
      }

      const emptyIndex = seats.findIndex((s) => s && !s.uid)
      if (emptyIndex < 0) throw err('ROOM_FULL', '房间已满')
      seatIndex = emptyIndex

      const existingNames = seats.map((s) => (s && typeof s.name === 'string' ? s.name : '')).filter(Boolean)
      const nextSeats = seats.map((s, idx) => {
        if (!s) return s
        if (idx !== emptyIndex) return s
        return {
          uid,
          clientId: clientId || null,
          name: randomUniqueFruitName(existingNames),
          online: true,
          joinedAt: now
        }
      })

      await ref.update({ data: { seats: nextSeats, updatedAt: now } })
      const updated = await ref.get()
      return updated.data
    })

    isOwner = seatIndex === 0
    return { ok: true, roomId, room, self: { isOwner, seatIndex } }
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : 'FUNCTION_ERROR',
      message: e && e.message ? e.message : '加入房间失败'
    }
  }
}
