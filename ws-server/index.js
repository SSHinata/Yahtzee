const http = require('http')
const express = require('express')
const { WebSocketServer } = require('ws')
let getConfig = null
try {
  ;({ getConfig } = require('./config'))
} catch (e) {
  getConfig = () => ({
    port: Number(process.env.PORT) || 3000,
    notifyToken: typeof process.env.NOTIFY_TOKEN === 'string' ? process.env.NOTIFY_TOKEN : ''
  })
}

function normalizeRoomId(roomId) {
  if (typeof roomId !== 'string') return ''
  return roomId.trim().toUpperCase()
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function nowTs() {
  return Date.now()
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const rooms = new Map()
const wsMeta = new WeakMap()
let wsSeq = 0

function cleanupWs(ws) {
  const meta = wsMeta.get(ws)
  if (!meta) return
  const { roomId, uidKey } = meta
  const byUid = rooms.get(roomId)
  if (byUid && byUid.get(uidKey) === ws) {
    byUid.delete(uidKey)
    if (byUid.size === 0) rooms.delete(roomId)
  }
  wsMeta.delete(ws)
}

function subscribe(ws, payload) {
  const roomId = normalizeRoomId(payload && payload.roomId)
  if (!roomId) return { ok: false, code: 'BAD_REQUEST', message: 'missing roomId' }
  const uid = typeof payload.uid === 'string' ? payload.uid.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : ''

  const uidKey = uid || `anon:${ws.__id}`

  const prev = wsMeta.get(ws)
  if (prev && (prev.roomId !== roomId || prev.uidKey !== uidKey)) {
    cleanupWs(ws)
  }

  let byUid = rooms.get(roomId)
  if (!byUid) {
    byUid = new Map()
    rooms.set(roomId, byUid)
  }

  const existing = byUid.get(uidKey)
  if (existing && existing !== ws) {
    try {
      existing.close(4000, 'replaced')
    } catch (e) {
    }
    cleanupWs(existing)
  }

  byUid.set(uidKey, ws)
  wsMeta.set(ws, { roomId, uidKey, uid: uid || null, name: name || null, clientId: clientId || null })
  return { ok: true, roomId, uid: uid || null, name: name || null, clientId: clientId || null }
}

function broadcastRoom(roomId, data) {
  const byUid = rooms.get(roomId)
  if (!byUid || byUid.size === 0) return 0
  const raw = JSON.stringify(data)
  let delivered = 0
  for (const ws of byUid.values()) {
    if (!ws || ws.readyState !== ws.OPEN) continue
    try {
      ws.send(raw)
      delivered++
    } catch (e) {
    }
  }
  return delivered
}

function broadcastRoomExcept(roomId, data, exceptWs) {
  const byUid = rooms.get(roomId)
  if (!byUid || byUid.size === 0) return 0
  const raw = JSON.stringify(data)
  let delivered = 0
  for (const ws of byUid.values()) {
    if (!ws || ws === exceptWs || ws.readyState !== ws.OPEN) continue
    try {
      ws.send(raw)
      delivered++
    } catch (e) {
    }
  }
  return delivered
}

function pickStringToken(v) {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  return s ? s : ''
}

function getHeader(req, key) {
  if (!req || !req.headers) return ''
  const v = req.headers[key]
  if (Array.isArray(v)) return pickStringToken(v[0])
  return pickStringToken(v)
}

function extractNotifyToken(req) {
  const auth = getHeader(req, 'authorization') || getHeader(req, 'Authorization')
  if (auth && auth.startsWith('Bearer ')) return pickStringToken(auth.slice(7))

  const headerToken =
    getHeader(req, 'x-notify-token') ||
    getHeader(req, 'x-notify-token'.toUpperCase()) ||
    getHeader(req, 'x-notifytoken') ||
    getHeader(req, 'x-notifytoken'.toUpperCase())
  if (headerToken) return headerToken

  const q = req && req.query ? req.query : null
  const queryToken =
    pickStringToken(q && (q.token || q.notifyToken || q.notify_token || q.NOTIFY_TOKEN)) ||
    pickStringToken(q && (q.Token || q.NotifyToken))
  if (queryToken) return queryToken

  const b = req && req.body ? req.body : null
  const bodyToken =
    pickStringToken(b && (b.token || b.notifyToken || b.notify_token || b.NOTIFY_TOKEN)) ||
    pickStringToken(b && (b.Token || b.NotifyToken))
  return bodyToken
}

function isNotifyAuthorized(req) {
  const token = getConfig().notifyToken
  if (!token) return true
  return extractNotifyToken(req) === token
}

app.get('/health', (req, res) => {
  res.json({ ok: true, ts: nowTs() })
})

app.post('/notify', (req, res) => {
  if (!isNotifyAuthorized(req)) {
    res.status(401).json({ ok: false, code: 'UNAUTHORIZED' })
    return
  }

  const roomId = normalizeRoomId(req.body && req.body.roomId)
  if (!roomId) {
    res.status(400).json({ ok: false, code: 'BAD_REQUEST', message: 'missing roomId' })
    return
  }

  const ts = nowTs()
  const version = req.body && (typeof req.body.version === 'number' ? req.body.version : null)
  const updatedAt = req.body && (typeof req.body.updatedAt === 'number' ? req.body.updatedAt : null)
  const patch = req.body && req.body.patch && typeof req.body.patch === 'object' ? req.body.patch : null
  const state = req.body && req.body.state && typeof req.body.state === 'object' ? req.body.state : null
  const action = req.body && typeof req.body.action === 'string' ? req.body.action : null
  const actorSeatIndex = req.body && typeof req.body.actorSeatIndex === 'number' ? req.body.actorSeatIndex : null
  const message = { type: 'roomUpdated', roomId, ts, version, updatedAt, patch, state, action, actorSeatIndex }

  const delivered = broadcastRoom(roomId, message)
  res.json({ ok: true, roomId, delivered, ts })
})

wss.on('connection', (ws) => {
  wsSeq += 1
  ws.__id = `${nowTs().toString(36)}_${wsSeq.toString(36)}`
  ws.isAlive = true

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (raw) => {
    const msg = safeJsonParse(String(raw || ''))
    if (!msg || typeof msg.type !== 'string') return
    if (msg.type === 'subscribe') {
      const out = subscribe(ws, msg)
      try {
        ws.send(JSON.stringify({ type: 'subscribed', ok: out.ok, roomId: out.roomId || null, ts: nowTs() }))
      } catch (e) {
      }
      return
    }

    if (msg.type === 'action') {
      const meta = wsMeta.get(ws)
      if (!meta || !meta.roomId) return
      const roomId = normalizeRoomId(msg.roomId)
      if (!roomId || roomId !== meta.roomId) return
      const action = typeof msg.action === 'string' ? msg.action.trim() : ''
      if (!action) return
      const payload = msg && typeof msg.payload === 'object' ? msg.payload : null
      const seq = typeof msg.seq === 'string' ? msg.seq : null
      const ts = nowTs()
      const out = {
        type: 'peerAction',
        roomId,
        action,
        payload,
        seq,
        from: meta.uid || meta.uidKey,
        fromClientId: meta.clientId || null,
        ts
      }
      broadcastRoomExcept(roomId, out, ws)
    }
  })

  ws.on('close', () => cleanupWs(ws))
  ws.on('error', () => cleanupWs(ws))
})

const heartbeatIntervalMs = Number(process.env.WS_HEARTBEAT_MS || 30000)
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      try {
        ws.terminate()
      } catch (e) {
      }
      continue
    }
    ws.isAlive = false
    try {
      ws.ping()
    } catch (e) {
    }
  }
}, heartbeatIntervalMs)

heartbeat.unref()

server.on('close', () => clearInterval(heartbeat))

const port = getConfig().port
server.listen(port, () => {
  console.log(`[ws-server] listening on :${port}`)
})
