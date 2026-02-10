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

function seatLabel(index) {
  return index === 0 ? '玩家1' : '玩家2'
}

function normalizeExit(v) {
  if (v === true) return true
  if (v === false) return false
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === '1' || s === 'true' || s === 'yes') return true
    if (s === '0' || s === 'false' || s === 'no') return false
  }
  return false
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

exports.main = async (event) => {
  try {
    if (!cloud || !db) throw err('MISSING_DEP', '缺少依赖 wx-server-sdk，请重新部署云函数并安装依赖')

    const uid = getUid()
    if (!uid) throw err('UNAUTHORIZED', '未获取到用户身份')

    const roomId = normalizeRoomId(event && event.roomId)
    if (!roomId) throw err('BAD_REQUEST', '缺少roomId')
    const clientId = normalizeClientId(event && event.clientId)
    const exit = normalizeExit(event && event.exit)

    const now = db.serverDate()

    const result = await db.runTransaction(async (txn) => {
      const ref = txn.collection('rooms').doc(roomId)
      const snap = await ref.get().catch((e) => {
        const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
        if (msg && msg.includes('does not exist')) return null
        throw e
      })
      const data = snap && snap.data
      if (!data) throw err('ROOM_NOT_FOUND', '房间不存在')

      const seats = ensureSeats(data.seats)
      let seatIndex = clientId ? seats.findIndex((s) => s && s.clientId === clientId) : -1
      if (seatIndex < 0) seatIndex = seats.findIndex((s) => s && s.uid === uid)
      if (seatIndex < 0) return { action: 'noop', room: data, seatIndex: -1 }

      const seat = seats[seatIndex]
      if (seat && seat.uid && seat.uid !== uid) throw err('FORBIDDEN', '身份校验失败')

      const isOwnerSeat = seatIndex === 0 && data.ownerUid === uid
      if (isOwnerSeat && exit) {
        await ref.remove()
        return { action: 'removed', room: null, seatIndex }
      }

      const nextSeats = seats.map((s, idx) => {
        if (!s) return s
        if (idx !== seatIndex) return s
        if (!s.uid) return s
        if (exit) {
          return { uid: null, clientId: null, name: seatLabel(idx), online: false, joinedAt: null }
        }
        return { ...s, online: false }
      })
      await ref.update({ data: { seats: nextSeats, updatedAt: now } })
      const updated = await ref.get()
      return { action: 'offline', room: updated.data, seatIndex }
    })

    await notifyRoomUpdated(roomId, { updatedAt: Date.now() }).catch(() => {})
    return { ok: true, roomId, ...result }
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : 'FUNCTION_ERROR',
      message: e && e.message ? e.message : '退出房间失败'
    }
  }
}
