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

function genRoomId() {
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

async function isRoomIdUsed(roomId) {
  const res = await db.collection('rooms').doc(roomId).get().catch((e) => {
    const msg = (e && (e.message || e.errMsg)) ? (e.message || e.errMsg) : ''
    if (msg && msg.includes('does not exist')) return null
    throw e
  })
  return !!(res && res.data)
}

function normalizeClientId(v) {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  if (!s) return ''
  return s.slice(0, 64)
}

function randomUniqueFruitName(existingNames) {
  const fruits = ['苹果', '香蕉', '橘子', '葡萄', '草莓', '芒果', '菠萝', '西瓜', '樱桃', '梨子', '柚子', '火龙果', '猕猴桃', '蓝莓']
  const used = new Set(Array.isArray(existingNames) ? existingNames.filter(Boolean) : [])
  const candidates = fruits.filter((n) => !used.has(n))
  const pool = candidates.length > 0 ? candidates : fruits
  return pool[Math.floor(Math.random() * pool.length)]
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
    const clientId = normalizeClientId(event && event.clientId)

    let roomId = ''
    for (let i = 0; i < 6; i++) {
      const candidate = genRoomId()
      const used = await isRoomIdUsed(candidate)
      if (!used) {
        roomId = candidate
        break
      }
    }
    if (!roomId) throw err('ROOM_ID_CONFLICT', '创建房间失败，请重试')

    const now = db.serverDate()
    const room = {
      _id: roomId,
      roomId,
      ownerUid: uid,
      ownerClientId: clientId || null,
      playerCount: 2,
      status: 'waiting',
      seats: [
        { uid, clientId: clientId || null, name: randomUniqueFruitName([]), online: true, joinedAt: now },
        { uid: null, name: '玩家2', online: false, joinedAt: null }
      ],
      createdAt: now,
      updatedAt: now
    }

    await db.collection('rooms').add({ data: room }).catch((e) => {
      if (e && e.errCode === 409) throw err('ROOM_ID_CONFLICT', '房间号冲突，请重试')
      throw e
    })

    await notifyRoomUpdated(roomId, { updatedAt: Date.now() }).catch(() => {})

    return { ok: true, roomId, room, self: { isOwner: true, seatIndex: 0 } }
  } catch (e) {
    return {
      ok: false,
      code: e && e.code ? e.code : 'FUNCTION_ERROR',
      message: e && e.message ? e.message : '创建房间失败'
    }
  }
}
