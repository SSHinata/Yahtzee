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
        confirmBackToMenuOpen: false,
        modeSelectOpen: false,
        leaderboardOpen: false,
        leaderboardFromGameEnd: false,
        leaderboardRecords: [],
        leaderboardHighlightTime: null,
        leaderboardHint: '',
        confirmClearLeaderboardOpen: false,
        leaderboardShownGameId: null,
        quickRefVisible: false,
        quickRefAnim: null
      };
      
      // 动画状态
      this.animState = { active: false, startTime: 0, dice: [] };

      // 初始化渲染器
      this.renderer = new Renderer(this.ctx, this.logicWidth, this.logicHeight, safeAreaTop, safeAreaBottomInset);
      
      // 初始化输入处理
      this.inputHandler = new InputHandler(this);

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
        if (this.state.turn.rollCount >= 3 && this.state.phase === Phase.ROLLING) {
             setTimeout(() => {
                 this.state = actionEnterScoreSelection(this.state);
             }, 500); // 留 500ms 给玩家看清楚结果
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
    this.state = createNewGame(this.players);
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
    this.state = actionRoll(this.state);
    this.startRollAnimation();
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
    this.state = actionToggleHold(this.state, diceIndex);
  }
  
  handleStopRolling() {
    if (this.animState.active) return;
    this.state = actionStopRolling(this.state);
  }

  handleCancelScoreSelection() {
    if (this.animState.active) return;
    this.state = actionCancelScoreSelection(this.state);
  }

  handleApplyScore(key) {
    if (this.animState.active) return;
    const result = actionApplyScore(this.state, key);
    if (result.error) {
      wx.showToast({ title: result.error, icon: 'none' });
    } else {
      this.state = result.state;
      if (this.state.phase === Phase.TURN_END) {
         setTimeout(() => {
           this.state = endTurnAndAdvance(this.state);
         }, 1000);
      }
    }
  }

  handleRestart() {
    this.ui.leaderboardShownGameId = null;
    this.state = createNewGame(this.players);
    if (this.state.phase === Phase.INIT) {
      this.state = startTurn(this.state);
    }
  }
}
