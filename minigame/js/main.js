import { createNewGame, startTurn, actionRoll, actionToggleHold, actionStopRolling, actionApplyScore, endTurnAndAdvance } from '../core/engine/gameEngine';
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

      // 初始化渲染器
      this.renderer = new Renderer(this.ctx, this.logicWidth, this.logicHeight, safeAreaTop);
      
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
      this.renderer.render(this.screen, this.state);
    }
  }
  
  // --- 暴露给 InputHandler 的动作接口 ---

  goMenu() {
    this.screen = 'menu';
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
    this.state = actionRoll(this.state);
  }
  
  handleToggleHold(diceIndex) {
    this.state = actionToggleHold(this.state, diceIndex);
  }
  
  handleStopRolling() {
    this.state = actionStopRolling(this.state);
  }

  handleApplyScore(key) {
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
