const STORAGE_KEY = 'yahtzee_single_leaderboard';
const MAX_RECORDS = 10;

function hasWxStorage() {
  return typeof wx !== 'undefined' &&
    typeof wx.getStorageSync === 'function' &&
    typeof wx.setStorageSync === 'function';
}

function safeParseRecords(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(r => r && typeof r.score === 'number' && typeof r.time === 'number')
    .map(r => ({ score: r.score, time: r.time }));
}

function loadRecords() {
  if (!hasWxStorage()) return [];
  try {
    return safeParseRecords(wx.getStorageSync(STORAGE_KEY));
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  if (!hasWxStorage()) return;
  try {
    wx.setStorageSync(STORAGE_KEY, records);
  } catch (e) {
  }
}

function sortRecords(records) {
  return records.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.time - a.time;
  });
}

export function getSingleLeaderboard() {
  return sortRecords(loadRecords()).slice(0, MAX_RECORDS);
}

export function addSingleScore(score, time = Date.now()) {
  const existing = loadRecords();
  const entry = { score, time };
  const combined = sortRecords(existing.concat([entry]));
  const rank = combined.findIndex(r => r.time === time && r.score === score) + 1;
  const nextTop = combined.slice(0, MAX_RECORDS);
  saveRecords(nextTop);
  return { entry, rank, inTop10: rank > 0 && rank <= MAX_RECORDS, records: nextTop };
}

export function clearSingleLeaderboard() {
  saveRecords([]);
}

export function formatMMDD(ts) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

