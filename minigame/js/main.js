import { createNewGame, startTurn, actionRoll, actionEnterScoreSelection, actionToggleHold, actionStopRolling, actionCancelScoreSelection, actionApplyScore, endTurnAndAdvance } from '../core/engine/gameEngine';
import { Phase } from '../core/engine/rules';
import Renderer from './render';
import InputHandler from './input';

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

      // 初始化游戏核心状态
      this.players = [{ id: 'p1', name: '玩家 1' }, { id: 'p2', name: '玩家 2' }];
      this.state = createNewGame(this.players);

      this.screen = 'menu';
      this.pressedKey = null;
      this.ui = { confirmBackToMenuOpen: false };
      
      // 动画状态
      this.animState = { active: false, startTime: 0, dice: [] };

      // 初始化渲染器
      this.renderer = new Renderer(this.ctx, this.logicWidth, this.logicHeight, safeAreaTop);

      // 预加载背景图片
      this.bgImage = wx.createImage();
      this.bgImageLoaded = false;
      this.bgImageSources = [
        'resources/img/indexBg1.webp'
      ];
      this.bgImageSourceIndex = 0;

      const loadNextBgImage = () => {
        if (this.bgImageSourceIndex >= this.bgImageSources.length) {
          console.error('Background image load failed for all known paths.');
          return;
        }
        const nextSrc = this.bgImageSources[this.bgImageSourceIndex];
        this.bgImageSourceIndex += 1;
        // console.log('Loading background image:', nextSrc);
        this.bgImage.src = nextSrc;
      };

      this.bgImage.onload = () => {
        // console.log('Background image loaded successfully');
        this.bgImageLoaded = true;
      };
      this.bgImage.onerror = (e) => {
        console.error('Background image load failed:', e);
        loadNextBgImage();
      };

      loadNextBgImage();
      
      // 预加载中景图片 (paperBg1)
      this.paperBgImage = wx.createImage();
      this.paperBgImageLoaded = false;
      this.paperBgImageSources = [
        'resources/img/paperBg1.webp'
      ];
      this.paperBgImageSourceIndex = 0;

      const loadNextPaperBgImage = () => {
        if (this.paperBgImageSourceIndex >= this.paperBgImageSources.length) {
          console.error('Paper background image load failed for all known paths.');
          return;
        }
        const nextSrc = this.paperBgImageSources[this.paperBgImageSourceIndex];
        this.paperBgImageSourceIndex += 1;
        // console.log('Loading paper background image:', nextSrc);
        this.paperBgImage.src = nextSrc;
      };

      this.paperBgImage.onload = () => {
        // console.log('Paper background image loaded successfully');
        this.paperBgImageLoaded = true;
      };
      this.paperBgImage.onerror = (e) => {
        console.error('Paper background image load failed:', e);
        loadNextPaperBgImage();
      };

      loadNextPaperBgImage();
      
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
        this.bgImageLoaded ? this.bgImage : null,
        this.paperBgImageLoaded ? this.paperBgImage : null,
        this.ui,
        this.animState
      );
    }
  }
  
  // --- 暴露给 InputHandler 的动作接口 ---

  goMenu() {
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
    this.screen = 'rules';
  }

  startGame() {
    this.state = createNewGame(this.players);
    if (this.state.phase === Phase.INIT) {
      this.state = startTurn(this.state);
    }
    this.screen = 'game';
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
    this.state = createNewGame(this.players);
    if (this.state.phase === Phase.INIT) {
      this.state = startTurn(this.state);
    }
  }
}
