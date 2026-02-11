import { createNewGame, startTurn, actionRoll, actionEnterScoreSelection, actionToggleHold, actionStopRolling, actionCancelScoreSelection, actionApplyScore, endTurnAndAdvance } from '../core/engine/gameEngine';
import { Phase } from '../core/engine/rules';
import { calcPlayerTotal } from '../core/engine/scoring';
import Renderer from './render';
import InputHandler from './input';
import { addSingleScore, clearSingleLeaderboard, getSingleLeaderboard } from './scoreStorage';
import { online2pConfig } from './online2pConfig'

const WS_URL = online2pConfig.wsUrl
const CLOUD_ENV_ID = online2pConfig.cloudEnvId
const WS_SERVICE = online2pConfig.wsService
const WS_PATH = online2pConfig.wsPath || '/ws'

/**
 * 游戏主入口
 */
export default class Main {
  constructor() {
    // 监听全局错误
    wx.onError((err) => {
      console.error('Game Error:', err);
    });

    try {
      // 适配屏幕尺寸
      const info = wx.getSystemInfoSync();
      const { windowWidth, windowHeight, pixelRatio, safeArea } = info;
      const safeAreaTop = safeArea ? safeArea.top : 20; // 默认给20px
      const safeAreaBottomInset = safeArea ? Math.max(0, windowHeight - safeArea.bottom) : 0;
      
      // 获取上屏 Canvas
      // 注意：在小游戏中，wx.createCanvas() 首次调用返回的是主 Canvas
      this.canvas = wx.createCanvas();
      
      // 显式设置物理像素宽高
      this.canvas.width = windowWidth * pixelRatio;
      this.canvas.height = windowHeight * pixelRatio;

      this.ctx = this.canvas.getContext('2d');
      
      // 缩放 Context 以适配 DPR
      this.ctx.scale(pixelRatio, pixelRatio);

      // 记录逻辑宽高供渲染器使用
      this.logicWidth = windowWidth;
      this.logicHeight = windowHeight;

      this.mode = 'local2p';
      this.players = this.getPlayerInfosByMode(this.mode);
      this.state = createNewGame(this.players);

      this.screen = 'menu';
      this.pressedKey = null;
      this.ui = {
        dev: this.detectDevMode(),
        confirmBackToMenuOpen: false,
        modeSelectOpen: false,
        onlineEntryOpen: false,
        wsPrewarmAt: 0,
        leaderboardOpen: false,
        leaderboardFromGameEnd: false,
        leaderboardRecords: [],
        leaderboardHighlightTime: null,
        leaderboardHint: '',
        confirmClearLeaderboardOpen: false,
        leaderboardShownGameId: null,
        quickRefVisible: false,
        quickRefAnim: null,
        scoreSummaryVisible: false,
        scoreSummaryAnim: null,
        lobby: {
          roomId: '',
          room: null,
          self: null,
          error: '',
          dismissed: false,
          lastAnimatedRollAt: 0,
          pollEnabled: false,
          peerOnline: null,
        lastPollErrorAt: 0,
          pollBackoffMs: 0,
          creating: false,
          joining: false,
          starting: false,
          pollInFlight: false,
          lastPollAt: 0
        }
      };

      this.clientId = this.getClientId()
      this.realtime = {
        socketTask: null,
        roomId: '',
        connecting: false,
        connected: false,
        reconnectAttempt: 0,
        reconnectTimer: null,
        pendingConnectKey: '',
        pullTimer: null,
        lastNotifiedVersion: 0,
        lastNotifiedUpdatedAt: 0,
        lastAppliedVersion: 0,
        expectedVersionMin: 0,
        localActionInFlight: 0,
        actionChain: null,
        pendingHoldState: null,
        holdFlushTimer: null,
        lastHoldTapAt: 0,
        recentPeerSeqSet: new Set(),
        recentPeerSeqQueue: [],
        pendingVersion: 0,
        pendingUpdatedAt: 0,
        pullInFlight: false,
        lastPullAt: 0
      }
      
      // 动画状态
      this.animState = { active: false, startTime: 0, dice: [] };

      // 初始化渲染器
      this.renderer = new Renderer(this.ctx, this.logicWidth, this.logicHeight, safeAreaTop, safeAreaBottomInset);
      
      // 初始化输入处理
      this.inputHandler = new InputHandler(this);

      if (wx && typeof wx.showShareMenu === 'function') {
        wx.showShareMenu({ withShareTicket: false });
      }

      this.handleLaunchOptions(wx.getLaunchOptionsSync());
      wx.onShow((res) => {
        this.handleLaunchOptions(res)
        this.handleAppShow()
      });
      wx.onHide(() => this.handleAppHide());

      // 开始渲染循环
      this.loop = this.loop.bind(this);
      // 使用全局 requestAnimationFrame (不带 window.)
      this.aniId = requestAnimationFrame(this.loop);
      
    } catch (e) {
      console.error('Init Error:', e);
    }
  }

  /**
   * 游戏主循环
   */
  loop() {
    this.update();
    this.render();
    this.aniId = requestAnimationFrame(this.loop);
  }

  update() {
    // 逻辑更新
    this.updateAnimation();
    this.updateSingleLeaderboardAutoPopup();
    this.updateQuickRefAnimation();
    this.updateScoreSummaryAnimation();
    this.updateLobbyPolling();
    this.updateOnlineGamePolling();
  }

  detectDevMode() {
    try {
      const sys = wx.getSystemInfoSync ? wx.getSystemInfoSync() : null
      const isDevtools = !!(sys && sys.platform === 'devtools')
      const getAccountInfoSync = wx && typeof wx.getAccountInfoSync === 'function' ? wx.getAccountInfoSync : null
      const account = getAccountInfoSync ? getAccountInfoSync() : null
      const envVersion = (account && account.miniProgram && account.miniProgram.envVersion) ||
        (account && account.miniGame && account.miniGame.envVersion) ||
        (typeof __wxConfig !== 'undefined' && __wxConfig && __wxConfig.envVersion ? __wxConfig.envVersion : '')
      if (envVersion === 'release') return false
      if (envVersion) return true
      return isDevtools
    } catch (e) {
      return false
    }
  }

  getClientId() {
    try {
      const key = 'onlineClientId'
      const existing = wx.getStorageSync ? wx.getStorageSync(key) : ''
      if (existing) return String(existing)
      const id = `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
      if (wx.setStorageSync) wx.setStorageSync(key, id)
      return id
    } catch (e) {
      return `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
    }
  }

  normalizeRoomId(roomId) {
    if (typeof roomId !== 'string') return ''
    return roomId.trim().toUpperCase()
  }

  getOnlineIdentityForRoom(roomId) {
    const rid = this.normalizeRoomId(roomId)
    const lobby = this.ui && this.ui.lobby ? this.ui.lobby : null
    if (!lobby || !rid) return { uid: '', name: '' }
    if (this.normalizeRoomId(lobby.roomId) !== rid) return { uid: '', name: '' }
    const seatIndex = lobby.self && typeof lobby.self.seatIndex === 'number' ? lobby.self.seatIndex : -1
    const seats = lobby.room && Array.isArray(lobby.room.seats) ? lobby.room.seats : []
    const seat = seatIndex >= 0 ? seats[seatIndex] : null
    const uid = seat && typeof seat.uid === 'string' ? seat.uid : ''
    const name = seat && typeof seat.name === 'string' ? seat.name : ''
    return { uid, name, clientId: this.clientId || '' }
  }

  stopRoomRealtime() {
    const rt = this.realtime
    if (!rt) return
    if (rt.reconnectTimer) {
      clearTimeout(rt.reconnectTimer)
      rt.reconnectTimer = null
    }
    if (rt.pullTimer) {
      clearTimeout(rt.pullTimer)
      rt.pullTimer = null
    }
    rt.reconnectAttempt = 0
    rt.connecting = false
    rt.connected = false
    rt.roomId = ''
    rt.pendingConnectKey = ''
    rt.pendingVersion = 0
    rt.pendingUpdatedAt = 0
    rt.lastNotifiedVersion = 0
    rt.lastNotifiedUpdatedAt = 0
    rt.expectedVersionMin = 0
    rt.localActionInFlight = 0
    rt.actionChain = null
    rt.pendingHoldState = null
    rt.lastHoldTapAt = 0
    rt.recentPeerSeqSet = new Set()
    rt.recentPeerSeqQueue = []
    if (rt.holdFlushTimer) {
      clearTimeout(rt.holdFlushTimer)
      rt.holdFlushTimer = null
    }
    if (rt.socketTask) {
      try {
        rt.socketTask.close({ code: 1000, reason: 'leave' })
      } catch (e) {
        try {
          rt.socketTask.close()
        } catch (e2) {
        }
      }
      rt.socketTask = null
    }
  }

  scheduleRealtimeReconnect(roomId) {
    const rt = this.realtime
    if (!rt) return
    if (rt.reconnectTimer) return
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    const attempt = Math.min(6, Math.max(0, rt.reconnectAttempt || 0))
    const delay = Math.min(10000, 600 * Math.pow(2, attempt))
    rt.reconnectTimer = setTimeout(() => {
      rt.reconnectTimer = null
      this.ensureRoomRealtime(rid)
    }, delay)
  }

  ensureRoomRealtime(roomId) {
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    if (!wx) return

    const lobby = this.ui && this.ui.lobby ? this.ui.lobby : null
    if (!lobby || lobby.dismissed) return
    if (!(this.screen === 'lobby' || (this.screen === 'game' && this.mode === 'online2p'))) return
    if (this.normalizeRoomId(lobby.roomId) !== rid) return

    const rt = this.realtime
    if (!rt) return
    if (rt.connected && rt.roomId === rid && rt.socketTask) return
    if (rt.connecting && rt.roomId === rid) return

    if (rt.socketTask) {
      try {
        rt.socketTask.close({ code: 1000, reason: 'switch' })
      } catch (e) {
      }
      rt.socketTask = null
    }

    rt.roomId = rid
    rt.connecting = true
    rt.connected = false
    rt.reconnectAttempt = rt.reconnectAttempt || 0
    rt.pendingVersion = 0
    rt.pendingUpdatedAt = 0
    rt.lastNotifiedVersion = 0
    rt.lastNotifiedUpdatedAt = 0
    rt.expectedVersionMin = 0
    rt.localActionInFlight = 0
    rt.actionChain = null
    rt.pendingHoldState = null
    rt.lastHoldTapAt = 0
    rt.recentPeerSeqSet = new Set()
    rt.recentPeerSeqQueue = []
    if (rt.holdFlushTimer) {
      clearTimeout(rt.holdFlushTimer)
      rt.holdFlushTimer = null
    }

    const onCloseOrError = () => {
      const lobby2 = this.ui && this.ui.lobby ? this.ui.lobby : null
      if (!this.realtime) return
      if (this.realtime.roomId !== rid) return
      if (this.realtime.pendingConnectKey && this.realtime.pendingConnectKey !== connectKey) return
      if (this.realtime.socketTask && this.realtime.socketTask !== taskRef.current) return
      this.realtime.socketTask = null
      this.realtime.connecting = false
      this.realtime.connected = false
      this.realtime.pendingConnectKey = ''
      this.realtime.reconnectAttempt = (this.realtime.reconnectAttempt || 0) + 1
      if (lobby2 && this.normalizeRoomId(lobby2.roomId) === rid && !lobby2.dismissed) {
        lobby2.pollEnabled = true
        this.scheduleRealtimeReconnect(rid)
      }
    }

    const connectKey = `${rid}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
    rt.pendingConnectKey = connectKey

    const taskRef = { current: null }

    const bindTask = (task) => {
      if (!task) return false
      const lobby3 = this.ui && this.ui.lobby ? this.ui.lobby : null
      if (!this.realtime || this.realtime.roomId !== rid) return false
      if (!lobby3 || lobby3.dismissed) return false
      if (this.realtime.pendingConnectKey !== connectKey) return false
      this.realtime.socketTask = task
      taskRef.current = task

      task.onOpen(() => {
        if (!this.realtime || this.realtime.socketTask !== task) return
        const id = this.getOnlineIdentityForRoom(rid)
        const payload = { type: 'subscribe', roomId: rid, uid: id.uid, name: id.name, clientId: id.clientId }
        try {
          task.send({ data: JSON.stringify(payload) })
        } catch (e) {
        }
      })

      task.onMessage((res) => {
        const raw = res && res.data ? res.data : ''
        let msg = null
        try {
          msg = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch (e) {
          msg = null
        }
        if (!msg || typeof msg.type !== 'string') return

        if (msg.type === 'subscribed') {
          if (!this.ui || !this.ui.lobby) return
          if (this.normalizeRoomId(this.ui.lobby.roomId) !== rid) return
          if (!this.realtime || this.realtime.socketTask !== task) return
          this.realtime.connecting = false
          this.realtime.connected = true
          this.realtime.reconnectAttempt = 0
          this.realtime.pendingConnectKey = ''
          this.ui.lobby.pollEnabled = false
          const hasRoom = !!(this.ui && this.ui.lobby && this.ui.lobby.room)
          if (!hasRoom) this.schedulePullRoomStateFromWs(rid)
          return
        }

        if (msg.type === 'roomUpdated') {
          const msgRid = this.normalizeRoomId(msg.roomId)
          if (!msgRid || msgRid !== rid) return
          const incomingVersion = typeof msg.version === 'number' ? msg.version : 0
          const incomingUpdatedAt = typeof msg.updatedAt === 'number' ? msg.updatedAt : 0
          const patch = msg && msg.patch && typeof msg.patch === 'object' ? msg.patch : null
          const action = msg && typeof msg.action === 'string' ? msg.action : ''
          const actorSeatIndex = msg && typeof msg.actorSeatIndex === 'number' ? msg.actorSeatIndex : -1
          if (action === 'removed') {
            this.handleRoomDismissed()
            return
          }
          if (this.realtime) {
            if (incomingVersion > 0) {
              const currentVersion =
                this.ui && this.ui.lobby && this.ui.lobby.room && typeof this.ui.lobby.room.gameVersion === 'number'
                  ? this.ui.lobby.room.gameVersion
                  : 0
              if (currentVersion > 0 && incomingVersion <= currentVersion) {
                if (incomingVersion > (this.realtime.lastNotifiedVersion || 0)) this.realtime.lastNotifiedVersion = incomingVersion
                return
              }
              if (incomingVersion <= (this.realtime.lastNotifiedVersion || 0)) return
              this.realtime.lastNotifiedVersion = incomingVersion
            }
            if (incomingUpdatedAt > 0) {
              if (incomingUpdatedAt <= (this.realtime.lastNotifiedUpdatedAt || 0)) return
              this.realtime.lastNotifiedUpdatedAt = incomingUpdatedAt
            }
            if (incomingVersion > (this.realtime.pendingVersion || 0)) this.realtime.pendingVersion = incomingVersion
            if (incomingUpdatedAt > (this.realtime.pendingUpdatedAt || 0)) this.realtime.pendingUpdatedAt = incomingUpdatedAt
          }
          if (this.applyRoomUpdatedPatch(msgRid, incomingVersion, patch, action, actorSeatIndex)) return
          this.schedulePullRoomStateFromWs(rid)
        }

        if (msg.type === 'peerAction') {
          const msgRid = this.normalizeRoomId(msg.roomId)
          if (!msgRid || msgRid !== rid) return
          this.applyPeerAction(msg)
        }
      })

      task.onClose(onCloseOrError)
      task.onError(onCloseOrError)
      return true
    }

    const useContainer =
      !!(wx.cloud && typeof wx.cloud.connectContainer === 'function' && CLOUD_ENV_ID && WS_SERVICE)

    if (useContainer) {
      let out = null
      try {
        out = wx.cloud.connectContainer({ config: { env: CLOUD_ENV_ID }, service: WS_SERVICE, path: WS_PATH })
      } catch (e) {
        out = null
      }

      if (out && typeof out.then === 'function') {
        out
          .then((res) => {
            const task = res && res.socketTask ? res.socketTask : null
            if (!bindTask(task)) onCloseOrError()
          })
          .catch(() => onCloseOrError())
        return
      }

      if (out && out.socketTask) {
        if (!bindTask(out.socketTask)) onCloseOrError()
        return
      }
    }

    if (typeof wx.connectSocket !== 'function') {
      onCloseOrError()
      return
    }

    const task = wx.connectSocket({ url: WS_URL })
    bindTask(task)
  }

  schedulePullRoomStateFromWs(roomId) {
    const rt = this.realtime
    if (!rt) return
    if (rt.pullTimer) return
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    const delay = (rt.localActionInFlight || 0) > 0 ? 350 : 120
    rt.pullTimer = setTimeout(() => {
      if (this.realtime) this.realtime.pullTimer = null
      this.pullRoomStateFromWs(rid)
    }, delay)
  }

  async pullRoomStateFromWs(roomId) {
    if (!this.ui || !this.ui.lobby) return
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    if (this.normalizeRoomId(this.ui.lobby.roomId) !== rid) return

    const rt = this.realtime
    const now = Date.now()
    if (rt.pullInFlight) return
    if (now - (rt.lastPullAt || 0) < 250) return
    rt.lastPullAt = now
    rt.pullInFlight = true
    try {
      const result = await this.callCloudFunction('getRoomState', { roomId: rid, clientId: this.clientId })
      this.applyRoomStateResult(rid, result)
    } catch (e) {
    } finally {
      rt.pullInFlight = false
    }
  }

  applyRoomUpdatedPatch(roomId, version, patch, action, actorSeatIndex) {
    const rid = this.normalizeRoomId(roomId)
    if (!rid || !patch || typeof patch !== 'object') return false
    const isHoldAction = action === 'SET_HOLD' || action === 'SET_HOLD_BATCH' || action === 'TOGGLE_HOLD' || action === 'TOGGLE_HOLD_BATCH'
    if (!isHoldAction) return false
    if (!this.ui || !this.ui.lobby) return false
    if (this.normalizeRoomId(this.ui.lobby.roomId) !== rid) return false
    if (this.screen !== 'game' || this.mode !== 'online2p') return false

    const rt = this.realtime
    const v = typeof version === 'number' ? version : 0
    if (rt && v > 0 && v <= (rt.lastAppliedVersion || 0)) return true

    const lobby = this.ui.lobby
    const seatIndex = this.getOnlineSelfSeatIndex()
    const isMyAction = seatIndex >= 0 && actorSeatIndex >= 0 && seatIndex === actorSeatIndex
    const canApplyHeld = !!(patch.turn && Array.isArray(patch.turn.held) && patch.turn.held.length >= 5)

    const nextState = this.state && typeof this.state === 'object' ? { ...this.state } : null
    if (!nextState || !nextState.turn) return false

    if (typeof patch.phase === 'string') nextState.phase = patch.phase
    if (typeof patch.currentPlayerIndex === 'number') nextState.currentPlayerIndex = patch.currentPlayerIndex

    const nextTurn = { ...nextState.turn }
    if (patch.turn && typeof patch.turn.rollCount === 'number') nextTurn.rollCount = patch.turn.rollCount
    if (patch.turn && typeof patch.turn.lastRollAt === 'number') nextTurn.lastRollAt = patch.turn.lastRollAt
    if (canApplyHeld && (!action.startsWith('SET_HOLD') || isMyAction || !this.isOnlineMyTurn())) {
      nextTurn.held = patch.turn.held.slice(0, 5).map((x) => !!x)
    }
    nextState.turn = nextTurn

    this.state = this.mergeOnlineGameStateFromServer(nextState)
    if (lobby.room && lobby.room.gameState) {
      lobby.room = {
        ...lobby.room,
        gameState: this.state,
        gameVersion: v > 0 ? v : lobby.room.gameVersion
      }
    }
    if (rt && v > 0) {
      rt.lastAppliedVersion = v
      if (rt.expectedVersionMin > 0 && v >= rt.expectedVersionMin) rt.expectedVersionMin = 0
      if (rt.pendingVersion > 0 && v >= rt.pendingVersion) rt.pendingVersion = 0
    }

    const prevAnimated = typeof lobby.lastAnimatedRollAt === 'number' ? lobby.lastAnimatedRollAt : 0
    const nextLastRollAt = this.state && this.state.turn && typeof this.state.turn.lastRollAt === 'number' ? this.state.turn.lastRollAt : 0
    if (nextLastRollAt && nextLastRollAt !== prevAnimated) {
      lobby.lastAnimatedRollAt = nextLastRollAt
      if (!this.animState || !this.animState.active) this.startRollAnimation()
    }
    return true
  }

  handleRoomDismissed() {
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    lobby.room = null
    lobby.self = null
    lobby.error = '房间已解散'
    lobby.dismissed = true
    this.stopRoomRealtime()
    if (wx && typeof wx.showModal === 'function') {
      wx.showModal({
        title: '联机对战',
        content: '房间已解散',
        confirmText: '返回',
        showCancel: false,
        success: (res) => {
          if (res && res.confirm) this.lobbyExit()
        }
      })
      return
    }
    this.showBlockingError('房间已解散')
    this.lobbyExit()
  }

  applyRoomStateResult(roomId, result) {
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    if (!this.ui || !this.ui.lobby) return
    if (this.normalizeRoomId(this.ui.lobby.roomId) !== rid) return
    const lobby = this.ui.lobby

    if (result && result.ok === false) {
      const code = result.code || ''
      if (code === 'ROOM_NOT_FOUND') {
        this.handleRoomDismissed()
        return
      }
      if (this.screen === 'lobby') {
        lobby.error = result.message || '获取房间状态失败'
      }
      return
    }

    const prevRoom = lobby.room || null
    let nextRoom = result && result.room ? result.room : null
    const rt0 = this.realtime
    const incomingVersion = nextRoom && typeof nextRoom.gameVersion === 'number' ? nextRoom.gameVersion : 0
    if (rt0 && rt0.roomId === rid && incomingVersion > 0 && incomingVersion < (rt0.lastAppliedVersion || 0)) {
      return
    }
    if (rt0 && rt0.roomId === rid && rt0.expectedVersionMin > 0 && incomingVersion > 0 && incomingVersion < rt0.expectedVersionMin) {
      if (prevRoom && prevRoom.gameState) {
        nextRoom = { ...nextRoom, gameState: prevRoom.gameState, gameVersion: prevRoom.gameVersion }
      }
    }
    lobby.room = nextRoom
    if (result && result.self) lobby.self = result.self
    if (lobby.error) lobby.error = ''

    const rt = this.realtime
    if (rt && rt.roomId === rid) {
      const room = lobby.room || null
      const v = room && typeof room.gameVersion === 'number' ? room.gameVersion : 0
      if (v > 0) rt.lastAppliedVersion = v
      if (rt.expectedVersionMin > 0 && v > 0 && v >= rt.expectedVersionMin) rt.expectedVersionMin = 0
      if (rt.pendingVersion > 0 && rt.lastAppliedVersion >= rt.pendingVersion) rt.pendingVersion = 0
      if (rt.pendingUpdatedAt > 0 && rt.lastNotifiedUpdatedAt >= rt.pendingUpdatedAt) rt.pendingUpdatedAt = 0
    }

    const seatIndex = lobby.self && typeof lobby.self.seatIndex === 'number' ? lobby.self.seatIndex : -1
    if (lobby.room && Array.isArray(lobby.room.seats) && lobby.room.seats.length >= 2 && seatIndex >= 0) {
      const peer = lobby.room.seats[seatIndex === 0 ? 1 : 0]
      const nextPeerOnline = peer && peer.uid ? !!peer.online : null
      const prevPeerOnline = lobby.peerOnline
      if (prevPeerOnline !== nextPeerOnline && wx && typeof wx.showToast === 'function') {
        if (typeof prevPeerOnline === 'boolean' && typeof nextPeerOnline === 'boolean') {
          wx.showToast({ title: nextPeerOnline ? '对方已重连' : '对方已离线', icon: 'none' })
        } else if (prevPeerOnline === true && nextPeerOnline === null) {
          wx.showToast({ title: '对方已退出', icon: 'none' })
        } else if (prevPeerOnline === null && nextPeerOnline === false) {
          wx.showToast({ title: '对方已离线', icon: 'none' })
        }
      }
      lobby.peerOnline = nextPeerOnline
    }

    if (this.screen === 'lobby') {
      if (lobby.room && lobby.room.status === 'playing') {
        if (seatIndex >= 0) {
          this.startOnlineGameFromRoom(rid, lobby.room)
        }
      }
      return
    }

    if (this.screen !== 'game' || this.mode !== 'online2p') return

    if (seatIndex < 0) {
      lobby.dismissed = true
      this.stopRoomRealtime()
      if (wx && typeof wx.showModal === 'function') {
        wx.showModal({
          title: '联机对战',
          content: '你已不在房间中',
          confirmText: '返回',
          showCancel: false,
          success: () => this.lobbyExit()
        })
      } else {
        this.showBlockingError('你已不在房间中')
        this.lobbyExit()
      }
      return
    }

    if (lobby.room && lobby.room.gameState) {
      this.state = this.mergeOnlineGameStateFromServer(lobby.room.gameState)
      if (this.state && this.state.phase === 'GAME_END') {
        lobby.pollEnabled = false
        this.stopRoomRealtime()
      }
      const prevAnimated = typeof lobby.lastAnimatedRollAt === 'number' ? lobby.lastAnimatedRollAt : 0
      const nextLastRollAt = this.state && this.state.turn && typeof this.state.turn.lastRollAt === 'number' ? this.state.turn.lastRollAt : 0
      if (nextLastRollAt && nextLastRollAt !== prevAnimated) {
        lobby.lastAnimatedRollAt = nextLastRollAt
        if (!this.animState || !this.animState.active) this.startRollAnimation()
      }
    }
  }

  mergeOnlineGameStateFromServer(serverState) {
    if (!serverState || typeof serverState !== 'object') return serverState
    const rt = this.realtime
    const pending = rt && Array.isArray(rt.pendingHoldState) ? rt.pendingHoldState : null
    if (!pending || pending.length < 5) return serverState

    if (!serverState.turn || !Array.isArray(serverState.turn.held)) {
      if (rt) rt.pendingHoldState = null
      return serverState
    }

    const currentVersion =
      this.ui && this.ui.lobby && this.ui.lobby.room && typeof this.ui.lobby.room.gameVersion === 'number'
        ? this.ui.lobby.room.gameVersion
        : 0
    const expectedMin = rt && typeof rt.expectedVersionMin === 'number' ? rt.expectedVersionMin : 0
    const needsProtect = expectedMin > 0 && currentVersion > 0 && currentVersion < expectedMin

    const pendingNormalized = pending.slice(0, 5).map((v) => !!v)
    const serverNormalized = serverState.turn.held.slice(0, 5).map((v) => !!v)
    const aligned = pendingNormalized.every((v, i) => v === serverNormalized[i])

    if (aligned) {
      if (rt) rt.pendingHoldState = null
      return serverState
    }

    if (!needsProtect) {
      if (rt) rt.pendingHoldState = null
      return serverState
    }

    return {
      ...serverState,
      turn: {
        ...serverState.turn,
        held: pendingNormalized
      }
    }
  }

  async callCloudFunction(name, data) {
    if (!wx || !wx.cloud || typeof wx.cloud.callFunction !== 'function') {
      throw new Error('云能力未就绪')
    }
    const payload = data || {}
    try {
      const res = await wx.cloud.callFunction({ name, data: payload })
      const result = res && res.result ? res.result : res
      if (result && result.ok === false) {
        console.warn('[cloud] call biz-fail:', name, result)
      } else {
        console.log('[cloud] call ok:', name, result)
      }
      return result
    } catch (e) {
      console.error('[cloud] call failed:', name, payload, this.serializeError(e))
      throw e
    }
  }

  serializeError(e) {
    if (!e) return { message: 'unknown error' }
    const out = {
      message: e.message || '',
      errMsg: e.errMsg || '',
      stack: e.stack || '',
      code: e.code || '',
      errCode: e.errCode || ''
    }
    return out
  }

  formatError(e) {
    if (!e) return '未知错误'
    const msg = e.message || e.errMsg || ''
    if (msg) return String(msg)
    try {
      return JSON.stringify(e)
    } catch (_) {
      return String(e)
    }
  }

  showBlockingError(content) {
    console.error('[online] error:', String(content || ''))
    if (wx && typeof wx.showModal === 'function') {
      wx.showModal({ title: '联机对战', content: String(content || ''), showCancel: false })
      return
    }
    if (wx && typeof wx.showToast === 'function') {
      wx.showToast({ title: String(content || ''), icon: 'none' })
    }
  }

  getOnlineSelfSeatIndex() {
    const self = this.ui && this.ui.lobby ? this.ui.lobby.self : null
    const seatIndex = self && typeof self.seatIndex === 'number' ? self.seatIndex : -1
    return seatIndex
  }

  isOnlineMyTurn() {
    if (this.mode !== 'online2p') return false
    const seatIndex = this.getOnlineSelfSeatIndex()
    if (seatIndex < 0) return false
    return this.state && typeof this.state.currentPlayerIndex === 'number' && this.state.currentPlayerIndex === seatIndex
  }

  async onlineAction(action, extra, options) {
    if (!this.ui || !this.ui.lobby) throw new Error('房间未就绪')
    const roomId = this.normalizeRoomId(this.ui.lobby.roomId)
    if (!roomId) throw new Error('房间未就绪')
    const payload = { roomId, clientId: this.clientId, debug: !!this.ui.dev, action, ...(extra || {}) }
    const runOnce = async () => {
      this.bumpExpectedVersionMin()
      const rt = this.realtime
      if (rt) rt.localActionInFlight = (rt.localActionInFlight || 0) + 1
      let result = null
      try {
        result = await this.callCloudFunction('onlineGameAction', payload)
      } finally {
        if (rt) rt.localActionInFlight = Math.max(0, (rt.localActionInFlight || 0) - 1)
      }
      if (result && result.ok === false) {
        const msg = result.message || '操作失败'
        wx.showToast({ title: msg, icon: 'none' })
        throw new Error(msg)
      }
      if (result && result.room) {
        this.ui.lobby.room = result.room
        if (result.room.gameState) this.state = this.mergeOnlineGameStateFromServer(result.room.gameState)
        const v = result.room && typeof result.room.gameVersion === 'number' ? result.room.gameVersion : 0
        if (rt && v > 0) {
          rt.lastAppliedVersion = v
          if (rt.expectedVersionMin > 0 && v >= rt.expectedVersionMin) rt.expectedVersionMin = 0
        }
      }
      return result
    }

    const rt = this.realtime
    if (!rt) return runOnce()
    if (options && options.bypassQueue) return runOnce()

    const prev = rt.actionChain || Promise.resolve()
    let resolveOut = null
    let rejectOut = null
    const out = new Promise((resolve, reject) => {
      resolveOut = resolve
      rejectOut = reject
    })
    rt.actionChain = prev
      .catch(() => {})
      .then(async () => {
        try {
          const res = await runOnce()
          resolveOut(res)
        } catch (e) {
          rejectOut(e)
        }
      })
    return out
  }

  applyOptimisticOnlineState(reducer) {
    if (this.mode !== 'online2p') return null
    const prev = this.state
    if (!prev) return null
    let next = null
    try {
      next = reducer(prev)
    } catch (e) {
      next = null
    }
    if (!next) return null
    this.state = next
    if (this.ui && this.ui.lobby && this.ui.lobby.room) {
      this.ui.lobby.room.gameState = next
    }
    return () => {
      if (this.mode !== 'online2p') return
      this.state = prev
      if (this.ui && this.ui.lobby && this.ui.lobby.room) {
        this.ui.lobby.room.gameState = prev
      }
    }
  }

  sendPeerAction(action, payload) {
    const lobby = this.ui && this.ui.lobby ? this.ui.lobby : null
    const rid = this.normalizeRoomId(lobby && lobby.roomId)
    if (!rid) return false
    const rt = this.realtime
    const task = rt && rt.socketTask ? rt.socketTask : null
    if (!task || !rt || !rt.connected) return false
    const seq = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
    try {
      task.send({ data: JSON.stringify({ type: 'action', roomId: rid, action, payload: payload || null, seq }) })
      return true
    } catch (e) {
      return false
    }
  }

  bumpExpectedVersionMin() {
    const rt = this.realtime
    if (!rt) return
    const lobby = this.ui && this.ui.lobby ? this.ui.lobby : null
    const room = lobby && lobby.room ? lobby.room : null
    const currentVersion = room && typeof room.gameVersion === 'number' ? room.gameVersion : 0
    const base = Math.max(currentVersion, rt.expectedVersionMin || 0)
    if (base <= 0) return
    const next = base + 1
    if (next > (rt.expectedVersionMin || 0)) rt.expectedVersionMin = next
  }

  rememberPeerSeq(seq) {
    const rt = this.realtime
    if (!rt || typeof seq !== 'string' || !seq) return false
    if (!(rt.recentPeerSeqSet instanceof Set)) rt.recentPeerSeqSet = new Set()
    if (!Array.isArray(rt.recentPeerSeqQueue)) rt.recentPeerSeqQueue = []
    if (rt.recentPeerSeqSet.has(seq)) return true
    rt.recentPeerSeqSet.add(seq)
    rt.recentPeerSeqQueue.push(seq)
    const max = 200
    while (rt.recentPeerSeqQueue.length > max) {
      const old = rt.recentPeerSeqQueue.shift()
      if (old) rt.recentPeerSeqSet.delete(old)
    }
    return false
  }

  scheduleFlushHoldToggles(roomId) {
    const rt = this.realtime
    if (!rt) return
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    if (rt.holdFlushTimer) return
    rt.holdFlushTimer = setTimeout(() => {
      if (!this.realtime) return
      const rt2 = this.realtime
      rt2.holdFlushTimer = null
      const held = Array.isArray(rt2.pendingHoldState) ? rt2.pendingHoldState.slice(0, 5) : null
      rt2.pendingHoldState = null
      if (!held || held.length < 5) return
      const normalized = held.map((v) => !!v)
      this.onlineAction('SET_HOLD_BATCH', { held: normalized }, { bypassQueue: true }).catch(() => {
        if (this.realtime) this.realtime.expectedVersionMin = 0
        this.schedulePullRoomStateFromWs(rid)
      })
    }, 120)
  }

  applyPeerAction(msg) {
    if (!msg || typeof msg.action !== 'string') return
    if (msg.fromClientId && msg.fromClientId === this.clientId) return
    if (this.rememberPeerSeq(msg.seq)) return
    const action = msg.action
    const payload = msg && typeof msg.payload === 'object' ? msg.payload : null

    if (this.screen !== 'game' || this.mode !== 'online2p') return
    if (this.isOnlineMyTurn()) return

    if (action === 'ROLL') {
      const nextRollCount = this.state && this.state.turn && typeof this.state.turn.rollCount === 'number' ? this.state.turn.rollCount + 1 : 0
      this.bumpExpectedVersionMin()
      this.startRollAnimationAwaiting(nextRollCount)
      return
    }
    if (action === 'SET_HOLD_BATCH' || action === 'SET_HOLD' || action === 'TOGGLE_HOLD_BATCH' || action === 'TOGGLE_HOLD') {
      // 对手锁定状态只以服务端版本状态为准，避免 peerAction 与快照竞争导致闪烁
      this.bumpExpectedVersionMin()
      return
    }

    if (action === 'STOP') {
      this.bumpExpectedVersionMin()
      this.applyOptimisticOnlineState((s) => actionStopRolling(s))
      return
    }
    if (action === 'ENTER_SCORE') {
      this.bumpExpectedVersionMin()
      this.applyOptimisticOnlineState((s) => actionEnterScoreSelection(s))
      return
    }
    if (action === 'CANCEL_SCORE') {
      this.bumpExpectedVersionMin()
      this.applyOptimisticOnlineState((s) => actionCancelScoreSelection(s))
      return
    }
    if (action === 'APPLY_SCORE') {
      const key = payload && typeof payload.key === 'string' ? payload.key : ''
      if (!key) return
      this.bumpExpectedVersionMin()
      const out = actionApplyScore(this.state, key)
      if (out && !out.error && out.state) {
        this.state = out.state
        if (this.ui && this.ui.lobby && this.ui.lobby.room) {
          this.ui.lobby.room.gameState = out.state
        }
        if (this.state.phase === Phase.TURN_END) {
          setTimeout(() => {
            if (this.mode !== 'online2p') return
            if (this.screen !== 'game') return
            this.state = endTurnAndAdvance(this.state)
            if (this.ui && this.ui.lobby && this.ui.lobby.room) this.ui.lobby.room.gameState = this.state
          }, 1000)
        }
      }
    }
  }

  handleLaunchOptions(options) {
    const query = options && options.query ? options.query : null
    const roomId = query && query.roomId ? this.normalizeRoomId(query.roomId) : ''
    if (!roomId) return
    if (this.screen === 'game') return
    if (this.ui && this.ui.lobby && this.normalizeRoomId(this.ui.lobby.roomId) === roomId) return
    this.tryJoinRoomByCode(roomId)
  }

  handleAppHide() {
    if (this.screen !== 'lobby' && !(this.screen === 'game' && this.mode === 'online2p')) return
    if (!this.ui || !this.ui.lobby) return
    if (this.ui.lobby.dismissed) return
    const roomId = this.normalizeRoomId(this.ui.lobby.roomId)
    if (!roomId) return
    this.ui.lobby.pollEnabled = false
    this.stopRoomRealtime()
    this.leaveRoom(roomId, false)
  }

  async handleAppShow() {
    if (!(this.screen === 'lobby' || (this.screen === 'game' && this.mode === 'online2p'))) return
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    if (lobby.dismissed) return
    const roomId = this.normalizeRoomId(lobby.roomId)
    if (!roomId) return
    if (!lobby.pollEnabled) lobby.pollEnabled = true
    try {
      const result = await this.callCloudFunction('joinRoom', { roomId, clientId: this.clientId, debug: !!this.ui.dev })
      if (result && result.ok === false) return
      if (this.ui && this.ui.lobby && this.normalizeRoomId(this.ui.lobby.roomId) === roomId) {
        this.ui.lobby.room = result.room || this.ui.lobby.room
        if (result.self) this.ui.lobby.self = result.self
      }
    } catch (e) {
    }
    this.ensureRoomRealtime(roomId)
  }

  enterLobby(roomId) {
    this.ui.modeSelectOpen = false
    this.ui.leaderboardOpen = false
    this.ui.confirmClearLeaderboardOpen = false
    this.ui.confirmBackToMenuOpen = false
    this.screen = 'lobby'
    this.ui.lobby = {
      roomId: roomId || '',
      room: null,
      self: null,
      error: '',
      dismissed: false,
      lastAnimatedRollAt: 0,
      pollEnabled: true,
      peerOnline: null,
      lastPollErrorAt: 0,
      pollBackoffMs: 0,
      creating: false,
      joining: false,
      starting: false,
      pollInFlight: false,
      lastPollAt: 0
    }
    this.pressedKey = null
  }

  startOnlineBattle() {
    this.enterLobby('')
    this.createRoom()
  }

  openOnlineEntry() {
    this.ui.modeSelectOpen = false
    this.ui.leaderboardOpen = false
    this.ui.confirmClearLeaderboardOpen = false
    this.ui.onlineEntryOpen = true
    this.prewarmWsServer()
    this.pressedKey = null
  }

  prewarmWsServer() {
    if (!wx || !wx.cloud || typeof wx.cloud.callContainer !== 'function') return
    if (!CLOUD_ENV_ID || !WS_SERVICE) return
    const now = Date.now()
    if (this.ui && typeof this.ui.wsPrewarmAt === 'number' && now - this.ui.wsPrewarmAt < 60000) return
    if (this.ui) this.ui.wsPrewarmAt = now
    try {
      wx.cloud.callContainer({
        config: { env: CLOUD_ENV_ID },
        path: '/health',
        method: 'GET',
        header: { 'X-WX-SERVICE': WS_SERVICE }
      }).catch(() => {})
    } catch (e) {
    }
  }

  closeOnlineEntry() {
    this.ui.onlineEntryOpen = false
    this.pressedKey = null
  }

  onlineEntryCreateRoom() {
    this.closeOnlineEntry()
    this.startOnlineBattle()
  }

  onlineEntryJoinRoom() {
    this.closeOnlineEntry()
    if (!wx || typeof wx.showModal !== 'function') {
      this.showBlockingError('当前环境不支持输入弹窗，请改用真机/更新基础库')
      return
    }
    wx.showModal({
      title: '加入房间',
      content: '',
      editable: true,
      placeholderText: '请输入房间号（6位）',
      confirmText: '加入',
      cancelText: '取消',
      success: (res) => {
        if (!res || !res.confirm) return
        const input = res.content || res.inputValue || ''
        const roomId = this.normalizeRoomId(String(input || ''))
        if (!roomId) {
          this.showBlockingError('房间号不能为空')
          return
        }
        this.tryJoinRoomByCode(roomId)
      },
      fail: () => {
        this.showBlockingError('当前环境不支持输入弹窗，请改用真机/更新基础库')
      }
    })
  }

  async createRoom() {
    if (!this.ui || !this.ui.lobby) return
    this.ui.lobby.creating = true
    this.ui.lobby.error = ''
    try {
      const result = await this.callCloudFunction('createRoom', { clientId: this.clientId })
      if (result && result.ok === false) {
        const msg = result.message || '创建房间失败'
        this.ui.lobby.error = msg
        this.showBlockingError(msg)
        return
      }
      const roomId = this.normalizeRoomId(result && result.roomId)
      if (!roomId) throw new Error('创建房间失败：未返回roomId')
      this.enterLobby(roomId)
      this.ui.lobby.room = result.room || null
      this.ui.lobby.self = result.self || { isOwner: true, seatIndex: 0 }
      this.ui.lobby.pollEnabled = false
      this.ensureRoomRealtime(roomId)
    } catch (e) {
      const msg = this.formatError(e)
      this.ui.lobby.error = msg
      this.showBlockingError(msg)
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.creating = false
    }
  }

  async joinRoom(roomId) {
    if (!this.ui || !this.ui.lobby) return
    const rid = this.normalizeRoomId(roomId || this.ui.lobby.roomId)
    if (!rid) return
    this.ui.lobby.joining = true
    this.ui.lobby.error = ''
    try {
      const result = await this.callCloudFunction('joinRoom', { roomId: rid, clientId: this.clientId, debug: !!this.ui.dev })
      if (result && result.ok === false) {
        const msg = result.message || '加入房间失败'
        this.ui.lobby.error = msg
        this.showBlockingError(msg)
        return
      }
      this.ui.lobby.roomId = rid
      this.ui.lobby.room = result.room || null
      this.ui.lobby.self = result.self || null
      this.ui.lobby.pollEnabled = false
      this.ensureRoomRealtime(rid)
    } catch (e) {
      const msg = this.formatError(e)
      this.ui.lobby.error = msg
      this.showBlockingError(msg)
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.joining = false
    }
  }

  async updateLobbyPolling() {
    if (this.screen !== 'lobby') return
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    if (lobby.dismissed) return
    const roomId = this.normalizeRoomId(lobby.roomId)
    if (!roomId) return
    const now = Date.now()
    if (lobby.pollInFlight) return
    const rt = this.realtime
    const wsConnected = !!(rt && rt.connected && this.normalizeRoomId(rt.roomId) === roomId)
    const seats = lobby.room && Array.isArray(lobby.room.seats) ? lobby.room.seats : []
    const waitingPeer = !(seats[0] && seats[0].uid && seats[1] && seats[1].uid)
    const base = lobby.pollEnabled ? (waitingPeer ? 3000 : 2000) : (wsConnected ? (waitingPeer ? 8000 : 5000) : 2000)
    const backoff = typeof lobby.pollBackoffMs === 'number' ? lobby.pollBackoffMs : 0
    const interval = Math.max(base, backoff)
    const wsConnecting = !!(rt && rt.connecting && this.normalizeRoomId(rt.roomId) === roomId)
    if (!lobby.pollEnabled && wsConnected === false && !wsConnecting) lobby.pollEnabled = true
    if (now - (lobby.lastPollAt || 0) < interval) return

    lobby.lastPollAt = now
    lobby.pollInFlight = true
    try {
      const result = await this.callCloudFunction('getRoomState', { roomId, clientId: this.clientId })
      this.applyRoomStateResult(roomId, result)
      lobby.pollBackoffMs = 0
    } catch (e) {
      this.ui.lobby.error = this.formatError(e)
      const prev = typeof lobby.pollBackoffMs === 'number' ? lobby.pollBackoffMs : 0
      lobby.pollBackoffMs = prev > 0 ? Math.min(10000, prev * 2) : 1500
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.pollInFlight = false
    }
  }

  async updateOnlineGamePolling() {
    if (this.screen !== 'game') return
    if (this.mode !== 'online2p') return
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    if (lobby.dismissed) return
    const roomId = this.normalizeRoomId(lobby.roomId)
    if (!roomId) return
    const now = Date.now()
    if (lobby.pollInFlight) return
    const rt = this.realtime
    const wsConnected = !!(rt && rt.connected && this.normalizeRoomId(rt.roomId) === roomId)
    const myTurn = this.isOnlineMyTurn()
    const base = lobby.pollEnabled ? (myTurn ? 1200 : 900) : (wsConnected ? (myTurn ? 6000 : 5000) : 900)
    const backoff = typeof lobby.pollBackoffMs === 'number' ? lobby.pollBackoffMs : 0
    const interval = Math.max(base, backoff)
    const wsConnecting = !!(rt && rt.connecting && this.normalizeRoomId(rt.roomId) === roomId)
    if (!lobby.pollEnabled && wsConnected === false && !wsConnecting) lobby.pollEnabled = true
    if (now - (lobby.lastPollAt || 0) < interval) return

    lobby.lastPollAt = now
    lobby.pollInFlight = true
    try {
      const result = await this.callCloudFunction('getRoomState', { roomId, clientId: this.clientId })
      this.applyRoomStateResult(roomId, result)
      lobby.pollBackoffMs = 0
    } catch (e) {
      const msg = this.formatError(e)
      lobby.error = msg
      const prev = typeof lobby.pollBackoffMs === 'number' ? lobby.pollBackoffMs : 0
      lobby.pollBackoffMs = prev > 0 ? Math.min(10000, prev * 2) : 1500
      const lastErrAt = typeof lobby.lastPollErrorAt === 'number' ? lobby.lastPollErrorAt : 0
      if (wx && typeof wx.showToast === 'function' && now - lastErrAt > 3000) {
        lobby.lastPollErrorAt = now
        wx.showToast({ title: '网络异常', icon: 'none' })
      }
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.pollInFlight = false
    }
  }

  lobbyShare() {
    if (!this.ui || !this.ui.lobby) return
    const roomId = this.normalizeRoomId(this.ui.lobby.roomId)
    if (!roomId) return
    if (!wx || typeof wx.shareAppMessage !== 'function') return
    wx.shareAppMessage({
      title: `来加入房间 ${roomId} 一起玩`,
      query: `roomId=${encodeURIComponent(roomId)}`
    })
  }

  async lobbyStart() {
    if (this.screen !== 'lobby') return
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    const roomId = this.normalizeRoomId(lobby.roomId)
    const room = lobby.room
    const self = lobby.self || {}

    if (!roomId) return
    if (!self.isOwner) {
      this.showBlockingError('仅房主可开始')
      return
    }
    if (!room || room.status !== 'waiting') return
    const seats = room && Array.isArray(room.seats) ? room.seats : []
    if (!(seats[0] && seats[0].uid && seats[1] && seats[1].uid)) return
    if (lobby.starting) return

    lobby.starting = true
    lobby.error = ''
    try {
      const result = await this.callCloudFunction('startGame', { roomId, clientId: this.clientId })
      if (result && result.ok === false) {
        const msg = result.message || '开始失败'
        lobby.error = msg
        this.showBlockingError(msg)
        return
      }
      const nextRoom = result.room || null
      if (!nextRoom) throw new Error('开始失败')
      this.startOnlineGameFromRoom(roomId, nextRoom)
    } catch (e) {
      const msg = this.formatError(e)
      lobby.error = msg
      this.showBlockingError(msg)
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.starting = false
    }
  }

  lobbyExit() {
    const roomId = this.ui && this.ui.lobby ? this.normalizeRoomId(this.ui.lobby.roomId) : ''
    this.stopRoomRealtime()
    if (roomId) this.leaveRoom(roomId, true)
    this.goMenu()
    if (this.ui && this.ui.lobby) {
      this.ui.lobby = {
        roomId: '',
        room: null,
        self: null,
        error: '',
        dismissed: false,
        lastAnimatedRollAt: 0,
        pollEnabled: false,
        peerOnline: null,
        lastPollErrorAt: 0,
        pollBackoffMs: 0,
        creating: false,
        joining: false,
        starting: false,
        pollInFlight: false,
        lastPollAt: 0
      }
    }
  }

  async leaveRoom(roomId, exit) {
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    try {
      const result = await this.callCloudFunction('leaveRoom', { roomId: rid, clientId: this.clientId, exit: !!exit })
      if (result && result.ok === false) {
        console.warn('[online] leaveRoom failed:', result)
      }
    } catch (e) {
      console.warn('[online] leaveRoom error:', this.serializeError(e))
    }
  }

  async tryJoinRoomByCode(roomId) {
    const rid = this.normalizeRoomId(roomId)
    if (!rid) return
    if (this.screen === 'game') return
    try {
      const result = await this.callCloudFunction('joinRoom', { roomId: rid, clientId: this.clientId, debug: !!this.ui.dev })
      if (result && result.ok === false) {
        const code = result.code || ''
        if (code === 'ROOM_NOT_FOUND') {
          this.showBlockingError('房间不存在')
          return
        }
        this.showBlockingError(result.message || '加入房间失败')
        return
      }
      this.enterLobby(rid)
      if (this.ui && this.ui.lobby) {
        this.ui.lobby.roomId = rid
        this.ui.lobby.room = result.room || null
        this.ui.lobby.self = result.self || null
        if (this.ui.lobby.room && this.ui.lobby.room.status === 'playing') {
          const self = this.ui.lobby.self || {}
          if (typeof self.seatIndex === 'number' && self.seatIndex >= 0) {
            this.startOnlineGameFromRoom(rid, this.ui.lobby.room)
          }
        }
      }
    } catch (e) {
      this.showBlockingError(this.formatError(e))
    }
  }

  easeOut(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 3);
  }

  openQuickRef() {
    if (this.ui.quickRefVisible && this.ui.quickRefAnim && this.ui.quickRefAnim.type === 'opening') return;
    this.ui.quickRefVisible = true;
    this.ui.quickRefAnim = {
      type: 'opening',
      startTime: Date.now(),
      openDuration: 160,
      closeDuration: 120,
      maskAlpha: 0,
      cardAlpha: 0,
      cardScale: 0.98
    };
    this.pressedKey = null;
  }

  closeQuickRef() {
    if (!this.ui.quickRefVisible) return;
    const now = Date.now();
    const current = this.ui.quickRefAnim || {};
    this.ui.quickRefAnim = {
      ...current,
      type: 'closing',
      startTime: now,
      closeDuration: 120,
      maskAlpha: typeof current.maskAlpha === 'number' ? current.maskAlpha : 0.58,
      cardAlpha: typeof current.cardAlpha === 'number' ? current.cardAlpha : 1,
      cardScale: 1
    };
    this.pressedKey = null;
  }

  updateQuickRefAnimation() {
    if (!this.ui.quickRefVisible) return;
    if (!this.ui.quickRefAnim) return;

    const now = Date.now();
    const anim = this.ui.quickRefAnim;

    if (anim.type === 'opening') {
      const t = (now - anim.startTime) / (anim.openDuration || 160);
      const p = this.easeOut(t);
      this.ui.quickRefAnim.maskAlpha = 0.58 * p;
      this.ui.quickRefAnim.cardAlpha = p;
      this.ui.quickRefAnim.cardScale = 0.98 + 0.02 * p;
      if (t >= 1) {
        this.ui.quickRefAnim.maskAlpha = 0.58;
        this.ui.quickRefAnim.cardAlpha = 1;
        this.ui.quickRefAnim.cardScale = 1;
      }
      return;
    }

    if (anim.type === 'closing') {
      const t = (now - anim.startTime) / (anim.closeDuration || 120);
      const p = Math.max(0, Math.min(1, t));
      const a = (anim.maskAlpha !== undefined ? anim.maskAlpha : 0.58) * (1 - p);
      this.ui.quickRefAnim.maskAlpha = a;
      this.ui.quickRefAnim.cardAlpha = Math.min(this.ui.quickRefAnim.cardAlpha || 1, a / 0.58);
      this.ui.quickRefAnim.cardScale = 1;
      if (t >= 1) {
        this.ui.quickRefVisible = false;
        this.ui.quickRefAnim = null;
      }
    }
  }

  openScoreSummary() {
    if (this.ui.scoreSummaryVisible && this.ui.scoreSummaryAnim && this.ui.scoreSummaryAnim.type === 'opening') return
    this.ui.scoreSummaryVisible = true
    this.ui.scoreSummaryAnim = {
      type: 'opening',
      startTime: Date.now(),
      openDuration: 160,
      closeDuration: 120,
      maskAlpha: 0,
      cardAlpha: 0,
      cardScale: 0.98
    }
    this.pressedKey = null
  }

  closeScoreSummary() {
    if (!this.ui.scoreSummaryVisible) return
    const now = Date.now()
    const current = this.ui.scoreSummaryAnim || {}
    this.ui.scoreSummaryAnim = {
      ...current,
      type: 'closing',
      startTime: now,
      closeDuration: 120,
      maskAlpha: typeof current.maskAlpha === 'number' ? current.maskAlpha : 0.58,
      cardAlpha: typeof current.cardAlpha === 'number' ? current.cardAlpha : 1,
      cardScale: 1
    }
    this.pressedKey = null
  }

  updateScoreSummaryAnimation() {
    if (!this.ui.scoreSummaryVisible) return
    if (!this.ui.scoreSummaryAnim) return

    const now = Date.now()
    const anim = this.ui.scoreSummaryAnim

    if (anim.type === 'opening') {
      const t = (now - anim.startTime) / (anim.openDuration || 160)
      const p = this.easeOut(t)
      this.ui.scoreSummaryAnim.maskAlpha = 0.58 * p
      this.ui.scoreSummaryAnim.cardAlpha = p
      this.ui.scoreSummaryAnim.cardScale = 0.98 + 0.02 * p
      if (t >= 1) {
        this.ui.scoreSummaryAnim.type = 'open'
      }
      return
    }

    if (anim.type === 'closing') {
      const t = (now - anim.startTime) / (anim.closeDuration || 120)
      const p = this.easeOut(t)
      const startMask = typeof anim.maskAlpha === 'number' ? anim.maskAlpha : 0.58
      const startAlpha = typeof anim.cardAlpha === 'number' ? anim.cardAlpha : 1
      this.ui.scoreSummaryAnim.maskAlpha = startMask * (1 - p)
      this.ui.scoreSummaryAnim.cardAlpha = startAlpha * (1 - p)
      this.ui.scoreSummaryAnim.cardScale = 1 - 0.02 * p
      if (t >= 1) {
        this.ui.scoreSummaryVisible = false
        this.ui.scoreSummaryAnim = null
      }
    }
  }

  updateSingleLeaderboardAutoPopup() {
    if (!this.state || this.state.phase !== Phase.GAME_END) return;
    if (this.mode !== 'single') return;
    if (this.ui.leaderboardShownGameId === this.state.gameId) return;
    if (!this.state.players || this.state.players.length !== 1) return;

    const totalScore = calcPlayerTotal(this.state.players[0]);
    const { entry, rank, inTop10, records } = addSingleScore(totalScore);

    this.ui.leaderboardShownGameId = this.state.gameId;
    this.ui.leaderboardRecords = records;
    this.ui.leaderboardOpen = true;
    this.ui.leaderboardFromGameEnd = true;
    this.ui.leaderboardHighlightTime = inTop10 ? entry.time : null;
    this.ui.leaderboardHint = inTop10 ? `本局排名：第 ${rank} 名（已进榜）` : `本局排名：第 ${rank} 名（未进榜）`;
    this.ui.confirmClearLeaderboardOpen = false;
    this.pressedKey = null;
  }

  updateAnimation() {
    if (!this.animState || !this.animState.active) return;
    
    const now = Date.now();
    const elapsed = now - this.animState.startTime;
    
    // 基础参数
    const baseDuration = 400; // 基础旋转时长
    const stagger = 80;       // 梯次间隔
    const settleTime = 200;   // 落定回弹时长
    
    // 总动画时长 = 最后一个骰子的旋转结束时间 + 回弹时间
    // 最后一个骰子索引是 4，所以是 baseDuration + 4 * stagger + settleTime
    const totalDuration = baseDuration + 4 * stagger + settleTime;
    
    let allFinished = true;
    
    // 初始化 animState.dice (如果是刚开始)
    if (this.animState.dice.length === 0) {
       this.animState.dice = Array(5).fill(0).map(() => ({
          val: 1, offsetX: 0, offsetY: 0, rotation: 0, scale: 1
       }));
    }

    const awaitingRollCount =
      this.mode === 'online2p' &&
      this.animState &&
      typeof this.animState.awaitingRollCount === 'number' &&
      this.animState.awaitingRollCount > 0 &&
      this.state &&
      this.state.turn &&
      typeof this.state.turn.rollCount === 'number' &&
      this.state.turn.rollCount < this.animState.awaitingRollCount

    this.animState.dice.forEach((d, i) => {
        // 如果被保留，则不播放动画
        if (this.state.turn.held[i]) {
            d.val = this.state.turn.dice[i];
            d.offsetX = 0; d.offsetY = 0; d.rotation = 0; d.scale = 1;
            return;
        }

        // 计算当前骰子的各个关键时间点
        // 1. 旋转结束时间点 (Stop Rotating)
        const stopTime = baseDuration + i * stagger;
        // 2. 整个动画结束时间点 (All Done)
        const endTime = stopTime + settleTime;

        if (elapsed >= endTime && !awaitingRollCount) {
            // 动画彻底结束，显示真值，归位
            d.val = this.state.turn.dice[i];
            d.offsetX = 0; d.offsetY = 0; d.rotation = 0; d.scale = 1;
            return;
        }
        
        allFinished = false;
        
        if (elapsed < stopTime || awaitingRollCount) {
            // 阶段一：混乱旋转期 (Cover Up)
            // 即使是第5个骰子，也是从 0ms 就开始转，直到 stopTime
            
            d.offsetX = 0; d.offsetY = 0;
            // 持续旋转，速度恒定
            d.rotation += 0.5; 
            d.scale = 1.15; // 放大，表示悬空
            
            // 随机显示点数 (Cover Up)
            // 为了避免闪烁太快，每 3 帧 (约 48ms) 变一次
            if (now % 48 < 16) {
                 d.val = Math.floor(Math.random() * 6) + 1;
            }
        } else {
            // 阶段二：落定回弹期 (Reveal)
            // elapsed >= stopTime && elapsed < endTime
            
            d.val = this.state.turn.dice[i]; // 锁定真值
            d.rotation = 0; // 摆正
            
            // 计算回弹进度 0 -> 1
            const t = (elapsed - stopTime) / settleTime;
            
            // 简单的回弹效果：从 1.15 缩小回 1.0
            // 可以加一点过冲效果：1.15 -> 0.95 -> 1.0
            if (t < 0.6) {
                // 前 60% 时间：1.15 -> 0.95
                const subT = t / 0.6;
                d.scale = 1.15 - (subT * 0.2);
            } else {
                // 后 40% 时间：0.95 -> 1.0
                const subT = (t - 0.6) / 0.4;
                d.scale = 0.95 + (subT * 0.05);
            }
        }
    });
    
    if (allFinished) {
        this.animState.active = false;
        this.animState.awaitingRollCount = 0
        
        // 动画结束，检查是否需要自动进入选分阶段
        if (this.mode !== 'online2p') {
          if (this.state.turn.rollCount >= 3 && this.state.phase === Phase.ROLLING) {
            setTimeout(() => {
              this.state = actionEnterScoreSelection(this.state);
            }, 500);
          }
        } else {
          if (this.state && this.state.turn && this.state.turn.rollCount >= 3 && this.state.phase === Phase.ROLLING) {
            if (!this.ui || !this.ui.lobby) return
            if (this.ui.lobby.enterScoreInFlight) return
            if (!this.isOnlineMyTurn()) return
            this.ui.lobby.enterScoreInFlight = true
            this.bumpExpectedVersionMin()
            const rollback = this.applyOptimisticOnlineState((s) => actionEnterScoreSelection(s))
            setTimeout(async () => {
              try {
                this.sendPeerAction('ENTER_SCORE', null)
                await this.onlineAction('ENTER_SCORE')
              } catch (e) {
                if (rollback) rollback()
              } finally {
                if (this.ui && this.ui.lobby) this.ui.lobby.enterScoreInFlight = false
              }
            }, 0)
          }
        }
    }
  }

  render() {
    // 清空画布
    this.ctx.clearRect(0, 0, this.logicWidth, this.logicHeight);
    
    // 绘制背景色
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, this.logicWidth, this.logicHeight);

    // 绘制当前状态
    if (this.renderer) {
      this.renderer.setPressed(this.pressedKey);
      this.renderer.render(
        this.screen,
        this.state,
        this.ui,
        this.animState
      );
    }
  }
  
  // --- 暴露给 InputHandler 的动作接口 ---

  goMenu() {
    this.ui.modeSelectOpen = false;
    this.ui.leaderboardOpen = false;
    this.ui.confirmClearLeaderboardOpen = false;
    this.ui.onlineEntryOpen = false;
    this.screen = 'menu';
  }

  handleBackToMenu() {
    if (this.screen !== 'game') {
      this.goMenu();
      return;
    }
    this.ui.confirmBackToMenuOpen = true;
    this.pressedKey = null;
  }

  handleCancelBackToMenu() {
    this.ui.confirmBackToMenuOpen = false;
    this.pressedKey = null;
  }

  handleConfirmBackToMenu() {
    this.ui.confirmBackToMenuOpen = false;
    if (this.mode === 'online2p') {
      const roomId = this.ui && this.ui.lobby ? this.normalizeRoomId(this.ui.lobby.roomId) : ''
      this.stopRoomRealtime()
      if (roomId) this.leaveRoom(roomId, true)
      if (this.ui && this.ui.lobby) {
        this.ui.lobby.pollEnabled = false
        this.ui.lobby.roomId = ''
      }
      this.mode = null
      this.state = createNewGame(this.getPlayerInfosByMode('single'))
    } else {
      this.state = createNewGame(this.players);
    }
    this.goMenu();
    this.pressedKey = null;
  }

  goRules() {
    this.ui.modeSelectOpen = false;
    this.ui.leaderboardOpen = false;
    this.ui.confirmClearLeaderboardOpen = false;
    this.screen = 'rules';
  }

  startGame() {
    this.ui.modeSelectOpen = true;
    this.pressedKey = null;
  }

  getPlayerInfosByMode(mode) {
    if (mode === 'single') {
      return [{ id: 'p1', name: '玩家 1' }];
    }
    return [{ id: 'p1', name: '玩家 1' }, { id: 'p2', name: '玩家 2' }];
  }

  startGameWithMode(mode) {
    this.mode = mode;
    this.players = this.getPlayerInfosByMode(mode);
    this.ui.modeSelectOpen = false;
    this.ui.leaderboardOpen = false;
    this.ui.confirmClearLeaderboardOpen = false;
    this.ui.leaderboardShownGameId = null;
    this.state = createNewGame(this.players);
    if (this.state.phase === Phase.INIT) {
      this.state = startTurn(this.state);
    }
    this.screen = 'game';
    this.pressedKey = null;
  }

  startOnlineGameFromRoom(roomId, room) {
    this.mode = 'online2p'
    this.ui.modeSelectOpen = false
    this.ui.leaderboardOpen = false
    this.ui.confirmClearLeaderboardOpen = false
    this.ui.leaderboardShownGameId = null
    this.screen = 'game'
    this.pressedKey = null
    if (this.ui && this.ui.lobby) {
      this.ui.lobby.roomId = roomId
      this.ui.lobby.room = room
    }
    const gameState = room && room.gameState ? room.gameState : null
    if (gameState) {
      this.state = gameState
    }
    if (this.ui && this.ui.lobby) {
      const last = gameState && gameState.turn && typeof gameState.turn.lastRollAt === 'number' ? gameState.turn.lastRollAt : 0
      this.ui.lobby.lastAnimatedRollAt = last
      this.ui.lobby.pollEnabled = true
    }
    this.ensureRoomRealtime(roomId)
    this.animState.active = false
  }

  closeModeSelect() {
    this.ui.modeSelectOpen = false;
    this.pressedKey = null;
  }

  openSingleLeaderboard() {
    this.ui.modeSelectOpen = false;
    this.ui.confirmClearLeaderboardOpen = false;
    this.ui.leaderboardFromGameEnd = false;
    this.ui.leaderboardHighlightTime = null;
    this.ui.leaderboardHint = '';
    this.ui.leaderboardRecords = getSingleLeaderboard();
    this.ui.leaderboardOpen = true;
    this.pressedKey = null;
  }

  closeSingleLeaderboard() {
    this.ui.leaderboardOpen = false;
    this.ui.confirmClearLeaderboardOpen = false;
    this.pressedKey = null;
  }

  requestClearSingleLeaderboard() {
    this.ui.confirmClearLeaderboardOpen = true;
    this.pressedKey = null;
  }

  cancelClearSingleLeaderboard() {
    this.ui.confirmClearLeaderboardOpen = false;
    this.pressedKey = null;
  }

  confirmClearSingleLeaderboard() {
    clearSingleLeaderboard();
    this.ui.leaderboardRecords = getSingleLeaderboard();
    this.ui.confirmClearLeaderboardOpen = false;
    this.pressedKey = null;
  }

  restartSingleChallengeFromLeaderboard() {
    this.closeSingleLeaderboard();
    this.startGameWithMode('single');
  }

  backToMenuFromLeaderboard() {
    this.closeSingleLeaderboard();
    this.goMenu();
  }

  handleBackToMenuFromGameEnd() {
    this.state = createNewGame(this.players);
    this.goMenu();
    this.pressedKey = null;
  }

  setPressedKey(key) {
    this.pressedKey = key;
  }

  clearPressedKey() {
    this.pressedKey = null;
  }
  
  handleRoll() {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      const nextRollCount = this.state && this.state.turn && typeof this.state.turn.rollCount === 'number' ? this.state.turn.rollCount + 1 : 0
      this.sendPeerAction('ROLL', null)
      this.bumpExpectedVersionMin()
      this.startRollAnimationAwaiting(nextRollCount)
      this.onlineAction('ROLL')
        .then(() => {
          if (this.ui && this.ui.lobby && this.state && this.state.turn && typeof this.state.turn.lastRollAt === 'number') {
            this.ui.lobby.lastAnimatedRollAt = this.state.turn.lastRollAt
          }
        })
        .catch(() => {
          this.animState.active = false
          this.animState.awaitingRollCount = 0
        })
      return
    }
    this.state = actionRoll(this.state)
    this.startRollAnimation()
  }
  
  startRollAnimation() {
    this.animState = {
        active: true,
        startTime: Date.now(),
        awaitingRollCount: 0,
        // duration 已不再是固定值，由 updateAnimation 内部计算
        dice: Array(5).fill(0).map((_, i) => ({
            val: this.state.turn.dice[i], 
            offsetX: 0, offsetY: 0, rotation: 0, scale: 1
        }))
    };
  }

  startRollAnimationAwaiting(nextRollCount) {
    const target = typeof nextRollCount === 'number' ? nextRollCount : 0
    this.animState = {
      active: true,
      startTime: Date.now(),
      awaitingRollCount: target > 0 ? target : 0,
      dice: Array(5).fill(0).map((_, i) => ({
        val: this.state && this.state.turn && Array.isArray(this.state.turn.dice) ? this.state.turn.dice[i] : 1,
        offsetX: 0, offsetY: 0, rotation: 0, scale: 1
      }))
    }
  }
  
  handleToggleHold(diceIndex) {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      const lobby = this.ui && this.ui.lobby ? this.ui.lobby : null
      const rid = this.normalizeRoomId(lobby && lobby.roomId)
      if (!rid) return
      if (typeof diceIndex !== 'number' || diceIndex < 0 || diceIndex > 4) return
      const rt = this.realtime
      const now = Date.now()
      if (rt) {
        const last = typeof rt.lastHoldTapAt === 'number' ? rt.lastHoldTapAt : 0
        if (now - last < 30) return
        rt.lastHoldTapAt = now
      }
      this.bumpExpectedVersionMin()
      this.applyOptimisticOnlineState((s) => actionToggleHold(s, diceIndex))
      if (rt && this.state && this.state.turn && Array.isArray(this.state.turn.held)) {
        rt.pendingHoldState = this.state.turn.held.slice(0, 5).map((v) => !!v)
      }
      this.scheduleFlushHoldToggles(rid)
      return
    }
    this.state = actionToggleHold(this.state, diceIndex)
  }
  
  handleStopRolling() {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      this.bumpExpectedVersionMin()
      const rollback = this.applyOptimisticOnlineState((s) => actionStopRolling(s))
      this.sendPeerAction('STOP', null)
      this.onlineAction('STOP').catch(() => {
        if (rollback) rollback()
      })
      return
    }
    this.state = actionStopRolling(this.state)
  }

  handleCancelScoreSelection() {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      this.bumpExpectedVersionMin()
      const rollback = this.applyOptimisticOnlineState((s) => actionCancelScoreSelection(s))
      this.sendPeerAction('CANCEL_SCORE', null)
      this.onlineAction('CANCEL_SCORE').catch(() => {
        if (rollback) rollback()
      })
      return
    }
    this.state = actionCancelScoreSelection(this.state)
  }

  handleApplyScore(key) {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      this.bumpExpectedVersionMin()
      const rollback = this.applyOptimisticOnlineState((s) => {
        const out = actionApplyScore(s, key)
        if (out && out.error) throw new Error(out.error)
        return out && out.state ? out.state : s
      })
      this.sendPeerAction('APPLY_SCORE', { key })
      this.onlineAction('APPLY_SCORE', { key }).catch(() => {
        if (rollback) rollback()
      })
      return
    }
    const result = actionApplyScore(this.state, key)
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' })
    } else {
      this.state = result.state
      if (this.state.phase === Phase.TURN_END) {
        setTimeout(() => {
          this.state = endTurnAndAdvance(this.state)
        }, 1000)
      }
    }
  }

  handleRestart() {
    if (this.mode === 'online2p') return
    this.ui.leaderboardShownGameId = null
    this.state = createNewGame(this.players)
    if (this.state.phase === Phase.INIT) {
      this.state = startTurn(this.state)
    }
  }
}
