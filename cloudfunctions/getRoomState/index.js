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

exports.main = async (event) => {
  try {
    if (!cloud) throw err('MISSING_DEP', '缺少依赖 wx-server-sdk，请重新部署云函数并安装依赖')

    const uid = getUid()
    if (!uid) throw err('UNAUTHORIZED', '未获取到用户身份')
    const clientId = normalizeClientId(event && event.clientId)

    const roomId = normalizeRoomId(event && event.roomId)
    if (!roomId) throw err('BAD_REQUEST', '缺少roomId')

    const res = await db.collection('rooms').doc(roomId).get().catch((e) => {
      const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
      if (msg && msg.includes('does not exist')) return null
      throw e
    })
    if (!res || !res.data) throw err('ROOM_NOT_FOUND', '房间不存在')

    const room = res.data
    const seats = Array.isArray(room.seats) ? room.seats : []
    let seatIndex = clientId ? seats.findIndex((s) => s && s.clientId === clientId) : -1
    if (seatIndex < 0) seatIndex = seats.findIndex((s) => s && s.uid === uid)
    const isOwner = seatIndex === 0 && room.ownerUid === uid

    return { ok: true, roomId, room, self: { isOwner, seatIndex } }
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : 'FUNCTION_ERROR',
      message: e && e.message ? e.message : '获取房间状态失败'
    }
  }
}
