function safeInt(v, fallback) {
  const n = Number(v)
  if (Number.isFinite(n) && n > 0) return Math.floor(n)
  return fallback
}

function pickString(v) {
  if (typeof v !== 'string') return ''
  const s = v.trim()
  return s ? s : ''
}

function loadLocalConfig() {
  try {
    return require('./config.local')
  } catch (e) {
    return null
  }
}

function getConfig() {
  const local = loadLocalConfig() || {}
  const port = safeInt(process.env.PORT, safeInt(local.PORT, 3000))
  const notifyToken = pickString(process.env.NOTIFY_TOKEN) || pickString(local.NOTIFY_TOKEN) || ''
  return { port, notifyToken }
}

module.exports = { getConfig }

