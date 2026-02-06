import { createNewGame, startTurn, actionRoll, actionEnterScoreSelection, actionToggleHold, actionStopRolling, actionCancelScoreSelection, actionApplyScore, endTurnAndAdvance } from '../core/engine/gameEngine';
import { Phase } from '../core/engine/rules';
import { calcPlayerTotal } from '../core/engine/scoring';
import Renderer from './render';
import InputHandler from './input';
import { addSingleScore, clearSingleLeaderboard, getSingleLeaderboard } from './scoreStorage';

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
        leaderboardOpen: false,
        leaderboardFromGameEnd: false,
        leaderboardRecords: [],
        leaderboardHighlightTime: null,
        leaderboardHint: '',
        confirmClearLeaderboardOpen: false,
        leaderboardShownGameId: null,
        quickRefVisible: false,
        quickRefAnim: null,
        lobby: {
          roomId: '',
          room: null,
          self: null,
          error: '',
          dismissed: false,
          lastAnimatedRollAt: 0,
          pollEnabled: false,
          peerOnline: null,
          creating: false,
          joining: false,
          starting: false,
          pollInFlight: false,
          lastPollAt: 0
        }
      };

      this.clientId = this.getClientId()
      
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

  async onlineAction(action, extra) {
    if (!this.ui || !this.ui.lobby) throw new Error('房间未就绪')
    const roomId = this.normalizeRoomId(this.ui.lobby.roomId)
    if (!roomId) throw new Error('房间未就绪')
    const payload = { roomId, clientId: this.clientId, debug: !!this.ui.dev, action, ...(extra || {}) }
    const result = await this.callCloudFunction('onlineGameAction', payload)
    if (result && result.ok === false) {
      const msg = result.message || '操作失败'
      wx.showToast({ title: msg, icon: 'none' })
      throw new Error(msg)
    }
    if (result && result.room) {
      this.ui.lobby.room = result.room
      if (result.room.gameState) this.state = result.room.gameState
    }
    return result
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
    this.pressedKey = null
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
    if (!lobby.pollEnabled) return
    const roomId = this.normalizeRoomId(lobby.roomId)
    if (!roomId) return
    const now = Date.now()
    if (lobby.pollInFlight) return
    if (now - (lobby.lastPollAt || 0) < 1000) return

    lobby.lastPollAt = now
    lobby.pollInFlight = true
    try {
      const result = await this.callCloudFunction('getRoomState', { roomId, clientId: this.clientId })
      if (result && result.ok === false) {
        const code = result.code || ''
        if (code === 'ROOM_NOT_FOUND') {
          this.ui.lobby.room = null
          this.ui.lobby.self = null
          this.ui.lobby.error = '房间已解散'
          this.ui.lobby.dismissed = true
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
          } else {
            this.showBlockingError('房间已解散')
            this.lobbyExit()
          }
          return
        }
        this.ui.lobby.error = result.message || '获取房间状态失败'
        return
      }
      if (this.screen !== 'lobby') return
      if (!this.ui || !this.ui.lobby) return
      if (this.normalizeRoomId(this.ui.lobby.roomId) !== roomId) return
      this.ui.lobby.room = result.room || null
      if (result.self) this.ui.lobby.self = result.self
      if (this.ui.lobby.error) this.ui.lobby.error = ''
      const seatIndex = result.self && typeof result.self.seatIndex === 'number' ? result.self.seatIndex : -1
      if (seatIndex >= 0 && result.room && Array.isArray(result.room.seats) && result.room.seats.length >= 2) {
        const peer = result.room.seats[seatIndex === 0 ? 1 : 0]
        const nextPeerOnline = peer && peer.uid ? !!peer.online : null
        const prevPeerOnline = this.ui.lobby.peerOnline
        if (typeof prevPeerOnline === 'boolean' && typeof nextPeerOnline === 'boolean' && prevPeerOnline !== nextPeerOnline) {
          wx.showToast({ title: nextPeerOnline ? '对方已重连' : '对方已离线', icon: 'none' })
        }
        this.ui.lobby.peerOnline = nextPeerOnline
      }
      if (this.screen === 'lobby' && this.ui && this.ui.lobby && this.ui.lobby.room && this.ui.lobby.room.status === 'playing') {
        const self = this.ui.lobby.self || {}
        if (typeof self.seatIndex === 'number' && self.seatIndex >= 0) {
          this.startOnlineGameFromRoom(roomId, this.ui.lobby.room)
        }
      }
    } catch (e) {
      this.ui.lobby.error = this.formatError(e)
    } finally {
      if (this.ui && this.ui.lobby) this.ui.lobby.pollInFlight = false
    }
  }

  async updateOnlineGamePolling() {
    if (this.screen !== 'game') return
    if (this.mode !== 'online2p') return
    if (!this.ui || !this.ui.lobby) return
    const lobby = this.ui.lobby
    if (!lobby.pollEnabled) return
    const roomId = this.normalizeRoomId(lobby.roomId)
    if (!roomId) return
    const now = Date.now()
    if (lobby.pollInFlight) return
    if (now - (lobby.lastPollAt || 0) < 800) return

    lobby.lastPollAt = now
    lobby.pollInFlight = true
    try {
      const result = await this.callCloudFunction('getRoomState', { roomId, clientId: this.clientId })
      if (result && result.ok === false) {
        const code = result.code || ''
        if (code === 'ROOM_NOT_FOUND') {
          if (!lobby.dismissed) {
            lobby.dismissed = true
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
            } else {
              this.showBlockingError('房间已解散')
              this.lobbyExit()
            }
          }
          return
        }
        return
      }

      if (this.screen !== 'game' || this.mode !== 'online2p') return
      if (!this.ui || !this.ui.lobby) return
      if (this.normalizeRoomId(this.ui.lobby.roomId) !== roomId) return

      this.ui.lobby.room = result.room || null
      if (result.self) this.ui.lobby.self = result.self
      const prevAnimated = typeof lobby.lastAnimatedRollAt === 'number' ? lobby.lastAnimatedRollAt : 0
      if (result.room && result.room.gameState) {
        this.state = result.room.gameState
        if (this.state && this.state.phase === 'GAME_END') {
          lobby.pollEnabled = false
        }
        const nextLastRollAt = this.state && this.state.turn && typeof this.state.turn.lastRollAt === 'number' ? this.state.turn.lastRollAt : 0
        if (nextLastRollAt && nextLastRollAt !== prevAnimated) {
          lobby.lastAnimatedRollAt = nextLastRollAt
          this.startRollAnimation()
        }
      }
      const seatIndex = result.self && typeof result.self.seatIndex === 'number' ? result.self.seatIndex : -1
      if (seatIndex < 0) {
        lobby.dismissed = true
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
      if (result.room && Array.isArray(result.room.seats) && result.room.seats.length >= 2) {
        const peer = result.room.seats[seatIndex === 0 ? 1 : 0]
        const nextPeerOnline = peer && peer.uid ? !!peer.online : null
        const prevPeerOnline = lobby.peerOnline
        if (typeof prevPeerOnline === 'boolean' && typeof nextPeerOnline === 'boolean' && prevPeerOnline !== nextPeerOnline) {
          wx.showToast({ title: nextPeerOnline ? '对方已重连' : '对方已离线', icon: 'none' })
        }
        lobby.peerOnline = nextPeerOnline
      }
    } catch (e) {
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

        if (elapsed >= endTime) {
            // 动画彻底结束，显示真值，归位
            d.val = this.state.turn.dice[i];
            d.offsetX = 0; d.offsetY = 0; d.rotation = 0; d.scale = 1;
            return;
        }
        
        allFinished = false;
        
        if (elapsed < stopTime) {
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
            setTimeout(async () => {
              try {
                await this.onlineAction('ENTER_SCORE')
              } catch (e) {
              } finally {
                if (this.ui && this.ui.lobby) this.ui.lobby.enterScoreInFlight = false
              }
            }, 350)
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
      this.onlineAction('ROLL')
        .then(() => {
          if (this.ui && this.ui.lobby && this.state && this.state.turn && typeof this.state.turn.lastRollAt === 'number') {
            this.ui.lobby.lastAnimatedRollAt = this.state.turn.lastRollAt
          }
          this.startRollAnimation()
        })
        .catch(() => {})
      return
    }
    this.state = actionRoll(this.state)
    this.startRollAnimation()
  }
  
  startRollAnimation() {
    this.animState = {
        active: true,
        startTime: Date.now(),
        // duration 已不再是固定值，由 updateAnimation 内部计算
        dice: Array(5).fill(0).map((_, i) => ({
            val: this.state.turn.dice[i], 
            offsetX: 0, offsetY: 0, rotation: 0, scale: 1
        }))
    };
  }
  
  handleToggleHold(diceIndex) {
    if (this.animState.active) return;
    if (this.mode === 'online2p') {
      if (!this.isOnlineMyTurn()) {
        wx.showToast({ title: '等待对方操作', icon: 'none' })
        return
      }
      this.onlineAction('TOGGLE_HOLD', { index: diceIndex }).catch(() => {})
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
      this.onlineAction('STOP').catch(() => {})
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
      this.onlineAction('CANCEL_SCORE').catch(() => {})
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
      this.onlineAction('APPLY_SCORE', { key }).catch(() => {})
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
