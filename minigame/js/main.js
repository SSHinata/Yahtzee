import { createNewGame, startTurn, actionRoll, actionEnterScoreSelection, actionToggleHold, actionStopRolling, actionCancelScoreSelection, actionApplyScore, endTurnAndAdvance } from '../core/engine/gameEngine';
import { Phase } from '../core/engine/rules';
import Renderer from './render';
import InputHandler from './input';

const DEBUG = true;

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

      // 诊断信息（用于真机排查 WebP 加载/渲染问题）
      this.debug = {
        enabled: DEBUG,
        panelExpanded: false,
        systemInfo: {
          system: info.system,
          version: info.version,
          platform: info.platform,
          model: info.model
        },
        renderStrategy: 'image-layer (canvas)',
        bg: {
          src: null,
          loaded: false,
          loadMs: null,
          width: null,
          height: null,
          error: null,
          info: null,
          render: null,
          base64Tried: false,
          fileCopyTried: false
        },
        paper: {
          src: null,
          loaded: false,
          loadMs: null,
          width: null,
          height: null,
          error: null,
          info: null,
          render: null,
          renderScale: 1,
          base64Tried: false,
          fileCopyTried: false,
          fallback: {
            delayedRetry: false,
            scaledRender: false,
            placeholder: true
          }
        },
        copy: {
          chunks: null,
          index: 0
        }
      };

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
        if (this.debug.enabled) {
          this.debug.bg.src = nextSrc;
          this.debug.bg.error = null;
          this.debug.bg.loaded = false;
          this.debug.bg.loadMs = null;
        }
        this.probeImageInfo('bg', nextSrc);
        this.bgImageLoadStart = Date.now();
        this.bgImage.src = nextSrc;
      };

      this.bgImage.onload = () => {
        // console.log('Background image loaded successfully');
        this.bgImageLoaded = true;
        console.info('Background image loaded', {
          src: this.debug.bg.src,
          width: this.bgImage.width,
          height: this.bgImage.height,
          cost: Date.now() - this.bgImageLoadStart
        });
        if (this.debug.enabled) {
          this.debug.bg.loaded = true;
          this.debug.bg.loadMs = Date.now() - this.bgImageLoadStart;
          this.debug.bg.width = this.bgImage.width;
          this.debug.bg.height = this.bgImage.height;
        }
      };
      this.bgImage.onerror = (e) => {
        console.error('Background image load failed:', e);
        if (this.debug.enabled) {
          this.debug.bg.error = e;
        }
        this.tryLoadImageWithFallback('bg', this.bgImage, this.debug.bg.src);
        loadNextBgImage();
      };

      loadNextBgImage();
      
      // 预加载中景图片 (paperBg1)
      this.paperBgImage = wx.createImage();
      this.paperBgImageLoaded = false;
      this.paperBgRenderScale = 1;
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
        if (this.debug.enabled) {
          this.debug.paper.src = nextSrc;
          this.debug.paper.error = null;
          this.debug.paper.loaded = false;
          this.debug.paper.loadMs = null;
          this.debug.paper.fallback.placeholder = true;
        }
        this.probeImageInfo('paper', nextSrc);
        this.paperBgImageLoadStart = Date.now();
        this.paperBgImage.src = nextSrc;
      };

      this.paperBgImage.onload = () => {
        // console.log('Paper background image loaded successfully');
        this.paperBgImageLoaded = true;
        console.info('Paper image loaded', {
          src: this.debug.paper.src,
          width: this.paperBgImage.width,
          height: this.paperBgImage.height,
          cost: Date.now() - this.paperBgImageLoadStart
        });
        if (this.debug.enabled) {
          this.debug.paper.loaded = true;
          this.debug.paper.loadMs = Date.now() - this.paperBgImageLoadStart;
          this.debug.paper.width = this.paperBgImage.width;
          this.debug.paper.height = this.paperBgImage.height;
          this.debug.paper.fallback.placeholder = false;
          this.debug.paper.renderScale = this.paperBgRenderScale;
        }
      };
      this.paperBgImage.onerror = (e) => {
        console.error('Paper background image load failed:', e);
        if (this.debug.enabled) {
          this.debug.paper.error = e;
          this.debug.paper.loaded = false;
        }
        this.tryLoadImageWithFallback('paper', this.paperBgImage, this.debug.paper.src);
        this.retryPaperBgImageWithFallback();
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
        this.animState,
        this.debug
      );
    }
  }

  toggleDebugPanel() {
    if (!this.debug.enabled) return;
    this.debug.panelExpanded = !this.debug.panelExpanded;
  }

  copyDebugInfo() {
    if (!this.debug.enabled) return;
    if (!wx.setClipboardData) {
      console.warn('[Debug] wx.setClipboardData not available');
      return;
    }
    if (this.debug.copy.chunks && this.debug.copy.index < this.debug.copy.chunks.length) {
      this.copyDebugChunk(this.debug.copy.index);
      return;
    }

    const text = this.buildDebugText();
    wx.setClipboardData({
      data: text,
      success: () => {
        console.info('[Debug] Diagnosis copied to clipboard');
        this.debug.copy.chunks = null;
        this.debug.copy.index = 0;
        wx.showToast({ title: '诊断已复制', icon: 'none' });
      },
      fail: (err) => {
        console.warn('[Debug] Failed to copy diagnosis, try chunking', err);
        this.debug.copy.chunks = this.splitDebugText(text, 1500);
        this.debug.copy.index = 0;
        if (this.debug.copy.chunks.length > 0) {
          this.copyDebugChunk(0);
        } else {
          wx.showToast({ title: '复制失败', icon: 'none' });
        }
      }
    });
  }

  copyDebugChunk(index) {
    const chunks = this.debug.copy.chunks || [];
    if (!wx.setClipboardData || chunks.length === 0) return;
    const total = chunks.length;
    const prefix = `Yahtzee WebP 诊断分段 ${index + 1}/${total}\n`;
    const data = prefix + chunks[index];
    wx.setClipboardData({
      data,
      success: () => {
        this.debug.copy.index = index + 1;
        const done = this.debug.copy.index >= total;
        wx.showToast({ title: done ? '诊断已复制' : `已复制第${index + 1}段`, icon: 'none' });
        if (done) {
          this.debug.copy.chunks = null;
          this.debug.copy.index = 0;
        }
      },
      fail: (err) => {
        console.warn('[Debug] Failed to copy diagnosis chunk', err);
        wx.showToast({ title: '复制失败', icon: 'none' });
      }
    });
  }

  buildDebugText() {
    const payload = {
      system: this.debug.systemInfo,
      renderStrategy: this.debug.renderStrategy,
      bg: {
        src: this.debug.bg.src,
        loaded: this.debug.bg.loaded,
        loadMs: this.debug.bg.loadMs,
        width: this.debug.bg.width,
        height: this.debug.bg.height,
        error: this.debug.bg.error,
        info: this.debug.bg.info,
        render: this.debug.bg.render
      },
      paper: {
        src: this.debug.paper.src,
        loaded: this.debug.paper.loaded,
        loadMs: this.debug.paper.loadMs,
        width: this.debug.paper.width,
        height: this.debug.paper.height,
        error: this.debug.paper.error,
        info: this.debug.paper.info,
        render: this.debug.paper.render,
        renderScale: this.debug.paper.renderScale,
        fallback: this.debug.paper.fallback
      }
    };
    return `Yahtzee WebP 诊断\n${JSON.stringify(payload, null, 2)}`;
  }

  splitDebugText(text, size) {
    const chunks = [];
    if (!text) return chunks;
    for (let i = 0; i < text.length; i += size) {
      chunks.push(text.slice(i, i + size));
    }
    return chunks;
  }

  tryLoadImageWithFallback(type, image, src) {
    const target = type === 'paper' ? this.debug.paper : this.debug.bg;
    if (!this.debug.enabled || !src) return;
    if (!wx.getFileSystemManager) {
      console.warn('[Fallback] File system manager not available');
      return;
    }
    const fs = wx.getFileSystemManager();
    const destPath = `${wx.env.USER_DATA_PATH}/${type}-webp-fallback.webp`;

    if (!target.fileCopyTried) {
      target.fileCopyTried = true;
      fs.copyFile({
        srcPath: src,
        destPath,
        success: () => {
          console.info(`[Fallback] Copied ${type} WebP to user data path`);
          image.src = destPath;
        },
        fail: (err) => {
          console.warn('[Fallback] Copy file failed', err);
          this.tryLoadImageWithBase64(type, image, src);
        }
      });
      return;
    }

    this.tryLoadImageWithBase64(type, image, src);
  }

  tryLoadImageWithBase64(type, image, src) {
    const target = type === 'paper' ? this.debug.paper : this.debug.bg;
    if (!this.debug.enabled || !src || target.base64Tried) return;
    if (!wx.getFileSystemManager || !wx.arrayBufferToBase64) {
      console.warn('[Fallback] Base64 load not available');
      return;
    }
    target.base64Tried = true;
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: src,
      encoding: 'base64',
      success: (res) => {
        const base64 = typeof res.data === 'string'
          ? res.data
          : wx.arrayBufferToBase64(res.data);
        const dataUrl = `data:image/webp;base64,${base64}`;
        console.info(`[Fallback] Base64 reload for ${type} WebP`);
        image.src = dataUrl;
      },
      fail: (err) => {
        console.warn('[Fallback] Base64 load failed', err);
        target.error = err;
      }
    });
  }

  probeImageInfo(type, src) {
    const label = type === 'paper' ? 'Paper' : 'Background';
    const start = Date.now();
    if (!wx.getImageInfo) {
      console.warn(`[Probe] ${label} wx.getImageInfo not available`);
      if (this.debug.enabled) {
        this.debug[type].info = { success: false, error: 'wx.getImageInfo not available' };
      }
      return;
    }
    wx.getImageInfo({
      src,
      success: (res) => {
        const cost = Date.now() - start;
        console.info(`[Probe] ${label} getImageInfo success`, res, `cost=${cost}ms`);
        if (this.debug.enabled) {
          this.debug[type].info = {
            success: true,
            width: res.width,
            height: res.height,
            path: res.path,
            cost
          };
        }
        // 某些真机上使用 info.path 重新加载可提升 WebP 兼容性
        if (type === 'paper' && res.path && !this.paperBgImageLoaded) {
          this.paperBgImage.src = res.path;
        }
        if (type === 'bg' && res.path && !this.bgImageLoaded) {
          this.bgImage.src = res.path;
        }
      },
      fail: (err) => {
        const cost = Date.now() - start;
        console.warn(`[Probe] ${label} getImageInfo fail`, err, `cost=${cost}ms`);
        if (this.debug.enabled) {
          this.debug[type].info = {
            success: false,
            error: err,
            cost
          };
        }
      }
    });
  }

  retryPaperBgImageWithFallback() {
    // 真机 WebP 解码失败时，尝试延迟加载 + 缩小显示策略
    if (this.debug.enabled) {
      this.debug.paper.fallback.delayedRetry = true;
      this.debug.paper.fallback.scaledRender = true;
    }
    this.paperBgRenderScale = 0.9;
    this.debug.paper.renderScale = this.paperBgRenderScale;
    setTimeout(() => {
      if (!this.paperBgImageLoaded && this.debug.paper.src) {
        console.info('[Fallback] Retrying paper WebP load with delayed strategy');
        this.paperBgImage.src = this.debug.paper.src;
      }
    }, 300);
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
