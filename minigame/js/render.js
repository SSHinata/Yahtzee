import { Phase, ScoreKey } from '../core/engine/rules';
import { getScoreOptionsForUI } from '../core/engine/uiSelectors';
import { calcPlayerTotal } from '../core/engine/scoring';

// 中文映射表
const SCORE_KEY_MAP = {
  [ScoreKey.ONE]: '一点',
  [ScoreKey.TWO]: '两点',
  [ScoreKey.THREE]: '三点',
  [ScoreKey.FOUR]: '四点',
  [ScoreKey.FIVE]: '五点',
  [ScoreKey.SIX]: '六点',
  [ScoreKey.THREE_KIND]: '三条',
  [ScoreKey.FOUR_KIND]: '四条',
  [ScoreKey.FULL_HOUSE]: '葫芦',
  [ScoreKey.SMALL_STRAIGHT]: '小顺',
  [ScoreKey.LARGE_STRAIGHT]: '大顺',
  [ScoreKey.YAHTZEE]: '快艇',
  [ScoreKey.CHANCE]: '全选'
};

const PHASE_MAP = {
  [Phase.INIT]: '初始化',
  [Phase.TURN_START]: '回合开始',
  [Phase.ROLLING]: '掷骰阶段',
  [Phase.SELECT_SCORE]: '选择计分',
  [Phase.TURN_END]: '回合结束',
  [Phase.GAME_END]: '游戏结束'
};

export default class Renderer {
  // 构造函数接收 logicWidth 和 logicHeight，不再依赖 ctx.canvas 的物理像素尺寸
  constructor(ctx, logicWidth, logicHeight, safeAreaTop) {
    this.ctx = ctx;
    this.width = logicWidth;
    this.height = logicHeight;

    this.COLORS = {
      bg: '#F6F7F9',
      card: '#FFFFFF',
      border: '#E6E8EC',
      text: '#1F2937',
      textSub: '#6B7280',
      primary: '#007bff',
      primaryPressed: '#0062cc',
      success: '#28a745',
      successPressed: '#218838',
      grayBtn: '#6c757d',
      grayBtnPressed: '#5a6268',
      diceStroke: '#111827',
      heldFill: '#FFE8E8',
      heldStroke: '#FF6B6B',
      heldMark: '#FF6B6B'
    };
    
    // 简单的布局常量
    const safeTop = safeAreaTop || 20;
    const topBarH = 48;
    this.safeTop = safeTop;
    this.topBarH = topBarH;
    this.LAYOUT = {
      HEADER_Y: safeTop + topBarH + 16,
      DICE_Y: safeTop + topBarH + 72,
      DICE_SIZE: 50,
      DICE_GAP: 10,
      BTN_Y: safeTop + topBarH + 152,
      BTN_W: 120,
      BTN_H: 40,
      SCORE_START_Y: safeTop + topBarH + 224,
      SCORE_LINE_H: 36,
      TOP_BTN_H: 28,
      TOP_BTN_W: 120
    };
    
    // 用于点击检测的区域缓存
    this.hitRegions = {
      dice: [], // {x, y, w, h, index}
      btnRoll: null, // {x, y, w, h}
      btnStop: null, // {x, y, w, h}
      scoreCells: [], // {x, y, w, h, key}
      btnRestart: null, // {x, y, w, h}
      btnBackToMenu: null, // {x, y, w, h}
      btnStartGame: null, // {x, y, w, h}
      btnRules: null // {x, y, w, h}
    };
    this.pressed = null;
  }

  render(screen, state, bgImage, paperBgImage) {
    if (screen === 'menu') {
      this.renderMenu(bgImage, paperBgImage);
      return;
    }
    if (screen === 'rules') {
      this.renderRules(bgImage); // 传入背景图
      return;
    }
    this.renderGame(state);
  }

  resetHitRegions() {
    this.hitRegions.dice = [];
    this.hitRegions.btnRoll = null;
    this.hitRegions.btnStop = null;
    this.hitRegions.scoreCells = [];
    this.hitRegions.btnRestart = null;
    this.hitRegions.btnBackToMenu = null;
    this.hitRegions.btnStartGame = null;
    this.hitRegions.btnRules = null;
    this.hitRegions.btnStartGameRule = null;
  }

  setPressed(key) {
    this.pressed = key;
  }

  clearPressed() {
    this.pressed = null;
  }

  drawWrappedText(text, x, y, maxWidth, lineHeight) {
    const ctx = this.ctx;
    let line = '';
    let currentY = y;
    for (const ch of text) {
      const testLine = line + ch;
      if (line && ctx.measureText(testLine).width > maxWidth) {
        ctx.fillText(line, x, currentY);
        currentY += lineHeight;
        line = ch;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
    return currentY;
  }

  drawCenteredSegments(segments, y) {
    const ctx = this.ctx;
    const prevAlign = ctx.textAlign;
    const prevBaseline = ctx.textBaseline;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const width = segments.reduce((sum, s) => sum + ctx.measureText(s.text).width, 0);
    let x = (this.width - width) / 2;
    for (const s of segments) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, y);
      x += ctx.measureText(s.text).width;
    }
    ctx.textAlign = prevAlign;
    ctx.textBaseline = prevBaseline;
  }

  drawRoundedRect(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  drawCard(x, y, w, h) {
    const ctx = this.ctx;
    // 阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    
    // 半透明白底
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    this.drawRoundedRect(x, y, w, h, 12);
    ctx.fill();
    
    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }

  renderMenu(bgImage, paperBgImage) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    // 1. 绘制背景图或纯色兜底
    if (bgImage) {
      // 保持比例拉伸填满
      // 简单做法：cover 模式
      const imgRatio = bgImage.width / bgImage.height;
      const screenRatio = this.width / this.height;
      let sw, sh, sx, sy;
      
      if (screenRatio > imgRatio) {
        sw = bgImage.width;
        sh = bgImage.width / screenRatio;
        sx = 0;
        sy = (bgImage.height - sh) / 2;
      } else {
        sh = bgImage.height;
        sw = bgImage.height * screenRatio;
        sx = (bgImage.width - sw) / 2;
        sy = 0;
      }
      ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 1.5 绘制中景 (paperBg1)
    if (paperBgImage) {
      // 宽度设定为屏幕宽度的 85%
      const pW = this.width * 0.85;
      const pH = pW * (paperBgImage.height / paperBgImage.width);
      const pX = (this.width - pW) / 2;
      // 垂直居中
      const pY = (this.height - pH) / 2;

      ctx.save();
      ctx.globalAlpha = 0.8; // 中景图片半透明
      // 可选：添加一点投影，使其看起来像浮在背景上
      ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
      ctx.shadowBlur = 15;
      ctx.shadowOffsetY = 5;
      
      ctx.drawImage(paperBgImage, pX, pY, pW, pH);
      ctx.restore();
    }

    // 2. 标题区（卡片化）
    const titleCardW = Math.min(300, this.width - 40);
    const titleCardH = 100;
    const titleCardX = (this.width - titleCardW) / 2;
    // 将标题放在上半区的中央
    // 上半区高度约为 this.height / 2
    // 标题卡片高度 titleCardH = 100
    // 居中位置 = (this.height / 2 - titleCardH) / 2
    const titleCardY = (this.height / 2 - titleCardH) / 2;

    this.drawCard(titleCardX, titleCardY, titleCardW, titleCardH); // 注意：drawCard 内部使用了 fillStyle，需要调整 drawCard 或在此处覆盖

    // 重新绘制半透明白底以覆盖 drawCard 默认的 0.9 透明度
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'; // 更半透明一些
    this.drawRoundedRect(titleCardX, titleCardY, titleCardW, titleCardH, 12);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('骰来骰去', this.width / 2, titleCardY + 40);
    
    ctx.fillStyle = C.textSub;
    ctx.font = '16px sans-serif';
    ctx.fillText('掷骰计分对战', this.width / 2, titleCardY + 75);

    // 3. 按钮区
    const btnW = 240;
    const btnH = 56;
    const gap = 24;
    // 按钮放在中间偏下一点
    // 中线位置 = this.height / 2
    // 偏下一点 = + 40px
    const startY = this.height / 2 + 40;
    const x = (this.width - btnW) / 2;
    
    // 开始游戏（实心蓝 + 投影）
    const startInset = this.pressed === 'btnStartGame' ? 2 : 0;
    
    ctx.save();
    if (startInset === 0) {
      ctx.shadowColor = 'rgba(0, 123, 255, 0.3)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
    }
    ctx.fillStyle = this.pressed === 'btnStartGame' ? C.primaryPressed : C.primary;
    this.drawRoundedRect(x + startInset, startY + startInset, btnW - startInset * 2, btnH - startInset * 2, 28);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('开始游戏', x + btnW / 2, startY + btnH / 2);
    this.hitRegions.btnStartGame = { x, y: startY, w: btnW, h: btnH };

    // 游戏规则（描边/浅色）
    const rulesY = startY + btnH + gap;
    const rulesInset = this.pressed === 'btnRules' ? 2 : 0;
    
    ctx.save();
    if (this.pressed === 'btnRules') {
      ctx.fillStyle = '#f0f0f0';
      this.drawRoundedRect(x + rulesInset, rulesY + rulesInset, btnW - rulesInset * 2, btnH - rulesInset * 2, 28);
      ctx.fill();
    } else {
      // 半透明白底增强文字可读性
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.drawRoundedRect(x, rulesY, btnW, btnH, 28);
      ctx.fill();
    }
    // 描边
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.textSub;
    this.drawRoundedRect(x + rulesInset, rulesY + rulesInset, btnW - rulesInset * 2, btnH - rulesInset * 2, 28);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = C.text;
    ctx.font = '18px sans-serif';
    ctx.fillText('游戏规则', x + btnW / 2, rulesY + btnH / 2);
    this.hitRegions.btnRules = { x, y: rulesY, w: btnW, h: btnH };
  }

  renderRules(bgImage) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    // 1. 背景统一（使用主页背景或兜底色）
    if (bgImage) {
      const imgRatio = bgImage.width / bgImage.height;
      const screenRatio = this.width / this.height;
      let sw, sh, sx, sy;
      
      if (screenRatio > imgRatio) {
        sw = bgImage.width;
        sh = bgImage.width / screenRatio;
        sx = 0;
        sy = (bgImage.height - sh) / 2;
      } else {
        sh = bgImage.height;
        sw = bgImage.height * screenRatio;
        sx = (bgImage.width - sw) / 2;
        sy = 0;
      }
      ctx.drawImage(bgImage, sx, sy, sw, sh, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. 顶部 Header
    // 布局：[< 返回]  游戏规则  (摘要在下)
    const headerH = 80;
    const headerY = this.safeTop + 10;
    
    // 返回按钮（左上角小图标+文字）
    const backW = 80;
    const backH = 32;
    const backX = 16;
    const backY = headerY;
    
    // 绘制返回按钮背景（淡雅风格）
    const backInset = this.pressed === 'btnBackToMenu' ? 1 : 0;
    ctx.save();
    if (this.pressed === 'btnBackToMenu') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    }
    this.drawRoundedRect(backX + backInset, backY + backInset, backW - backInset * 2, backH - backInset * 2, 16);
    ctx.fill();
    
    // 返回图标和文字
    ctx.fillStyle = C.text;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('← 返回', backX + 16, backY + backH / 2);
    ctx.restore();
    
    this.hitRegions.btnBackToMenu = { x: backX, y: backY, w: backW, h: backH };

    // 标题和摘要
    ctx.fillStyle = C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('游戏规则', this.width / 2, headerY);
    
    // 摘要颜色减淡（弱于正文），增加垂直间距
    ctx.fillStyle = '#9CA3AF'; // textSub 偏淡色
    ctx.font = '14px sans-serif';
    ctx.fillText('每回合最多掷 3 次，选 1 格计分，13 回合比总分', this.width / 2, headerY + 42); // 原 +36

    // 分隔线
    const lineY = headerY + 72; // 原 +64
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    ctx.moveTo(20, lineY);
    ctx.lineTo(this.width - 20, lineY);
    ctx.stroke();

    // 3. 滚动区域内容（卡片化）
    // 由于 Canvas 没有原生滚动，这里做静态排版，内容较多时假设屏幕够长或简化显示
    // 实际项目中可能需要实现简单的触摸滚动，这里先按静态紧凑布局实现
    
    const cardGap = 16;
    let currentY = lineY + 20;
    const cardX = 16;
    const cardW = this.width - 32;
    
    // 辅助函数：绘制卡片背景和标题
    const drawCardBg = (title, height) => {
      ctx.save();
      // 卡片阴影
      ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      
      // 卡片背景
      ctx.fillStyle = '#FFFFFF';
      this.drawRoundedRect(cardX, currentY, cardW, height, 12);
      ctx.fill();
      ctx.restore();
      
      // 标题
      if (title) {
        ctx.fillStyle = C.primary;
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(title, cardX + 16, currentY + 16);
      }
    };

    // --- 卡片 A：玩法流程 ---
    const flowH = 150;
    drawCardBg('玩法流程', flowH);
    
    const flowItems = [
      '掷骰子（每回合最多 3 次）',
      '点击骰子保留/取消保留',
      '点击“选择计分”进入计分阶段',
      '选择一个未使用的类别完成回合'
    ];
    
    let textY = currentY + 48;
    ctx.font = '14px sans-serif';
    
    flowItems.forEach((item, index) => {
      // 序号：灰蓝色
      ctx.fillStyle = '#6B7280';
      ctx.fillText(`${index + 1}.`, cardX + 16, textY);
      
      // 内容：深色
      ctx.fillStyle = C.text;
      ctx.fillText(item, cardX + 36, textY);
      textY += 24;
    });
    
    currentY += flowH + cardGap;

    // --- 卡片 B：计分方式 ---
    // 分为数字区和组合区
    const scoreH = 260; // 预估高度
    drawCardBg('计分方式', scoreH);
    
    textY = currentY + 48;
    
    // 分组标题样式
    const drawSubTitle = (text, y) => {
      ctx.fillStyle = '#4B5563'; // 深灰
      ctx.font = 'bold 15px sans-serif'; // 原 13px
      ctx.fillText(text, cardX + 16, y);
    };
    
    const drawScoreItem = (name, rule, score, y, boldScore = false) => {
      ctx.fillStyle = C.text;
      ctx.font = '14px sans-serif';
      ctx.fillText(name, cardX + 16, y);
      
      // 规则文本
      ctx.fillStyle = '#666';
      ctx.font = '13px sans-serif';
      ctx.fillText(rule, cardX + 100, y); // 原 +80，增加间距

      // 分数文本
      if (score) {
        // 计算规则文本宽度，以便在后面接分数
        const ruleW = ctx.measureText(rule).width;
        const scoreX = cardX + 100 + ruleW + 8; // 原 +80
        
        ctx.fillStyle = boldScore ? C.primary : '#666';
        ctx.font = boldScore ? 'bold 13px sans-serif' : '13px sans-serif';
        ctx.fillText(score, scoreX, y);
      }
    };

    // 数字区
    drawSubTitle('数字区 (1~6点)', textY);
    textY += 24;
    drawScoreItem('1~6点', '对应点数', '总和', textY, true);
    textY += 20;
    drawScoreItem('奖励', '总和≥63', '+35分', textY, true);
    
    textY += 30;
    
    // 组合区
    drawSubTitle('组合区', textY);
    textY += 24;
    // [name, rule, score, bold?]
    const combos = [
      ['三条/四条', '3/4个相同', '总和', true],
      ['葫芦', '3+2组合', '25分', true],
      ['小/大顺', '4/5连号', '30/40分', true],
      ['快艇', '5个相同', '50分', true],
      ['全选', '任意组合', '总和', true]
    ];
    
    combos.forEach(([name, rule, score, bold]) => {
      drawScoreItem(name, rule, score, textY, bold);
      textY += 20;
    });
    
    currentY += scoreH + cardGap;

    // --- 卡片 D：快速示例 ---
    const exH = 130; // 原 110，增加高度以适应 padding
    drawCardBg('快速示例', exH);
    
    textY = currentY + 48;
    ctx.fillStyle = C.text;
    ctx.font = '14px sans-serif';
    // 优化：骰子展示图形化
    ctx.fillText('🎲 [ 2 · 2 · 2 · 5 · 1 ]', cardX + 16, textY);
    textY += 24;
    ctx.fillStyle = '#666';
    ctx.fillText('👉 选「二点」: 2+2+2 = 6分', cardX + 16, textY);
    textY += 24;
    ctx.fillText('👉 选「三条」: 2+2+2+5+1 = 12分', cardX + 16, textY);
    
    currentY += exH + cardGap;

    // --- 底部按钮：开始游戏 ---
    const btnH = 48;
    // 增加与上方内容的间距：原 -20 改为 -40，给用户心理缓冲
    const btnY = this.height - this.safeTop - btnH - 40;
    
    // 按钮背景
    const btnInset = this.pressed === 'btnStartGameRule' ? 2 : 0;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 123, 255, 0.3)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;
    
    ctx.fillStyle = this.pressed === 'btnStartGameRule' ? C.primaryPressed : C.primary;
    this.drawRoundedRect(cardX + btnInset, btnY + btnInset, cardW - btnInset * 2, btnH - btnInset * 2, 24);
    ctx.fill();
    ctx.restore();
    
    // 按钮文字
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('我知道了，开始游戏', this.width / 2, btnY + btnH / 2);
    
    this.hitRegions.btnStartGameRule = { x: cardX, y: btnY, w: cardW, h: btnH };
  }

  renderGame(state) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const backW = L.TOP_BTN_W;
    const backH = L.TOP_BTN_H;
    const backX = 20;
    const backY = this.safeTop + 10;
    const backInset = this.pressed === 'btnBackToMenu' ? 1 : 0;
    ctx.fillStyle = this.pressed === 'btnBackToMenu' ? C.grayBtnPressed : C.grayBtn;
    ctx.fillRect(backX + backInset, backY + backInset, backW - backInset * 2, backH - backInset * 2);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('返回主界面', backX + backW / 2, backY + backH / 2);
    this.hitRegions.btnBackToMenu = { x: backX, y: backY, w: backW, h: backH };

    ctx.fillStyle = C.text;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    const player = state.players[state.currentPlayerIndex];
    const playerName = player.name.replace('Player', '玩家');
    const phaseName = PHASE_MAP[state.phase] || state.phase;
    const remainingRolls = 3 - state.turn.rollCount;
    ctx.textBaseline = 'top';
    ctx.fillText(`${playerName} · 第 ${state.round} 轮`, this.width / 2, L.HEADER_Y);

    ctx.font = '14px sans-serif';
    this.drawCenteredSegments(
      [
        { text: '剩余 ', color: C.textSub },
        { text: `${remainingRolls}`, color: C.primary },
        { text: ' 次 · ', color: C.textSub },
        { text: `${phaseName}`, color: C.textSub }
      ],
      L.HEADER_Y + 26
    );

    // 3. 绘制骰子
    const diceStartX = (this.width - (5 * L.DICE_SIZE + 4 * L.DICE_GAP)) / 2;
    
    state.turn.dice.forEach((val, i) => {
      const x = diceStartX + i * (L.DICE_SIZE + L.DICE_GAP);
      const y = L.DICE_Y;
      const isHeld = state.turn.held[i];

      // 骰子背景
      ctx.fillStyle = isHeld ? C.heldFill : C.card;
      ctx.fillRect(x, y, L.DICE_SIZE, L.DICE_SIZE);
      ctx.strokeStyle = isHeld ? C.heldStroke : C.diceStroke;
      ctx.strokeRect(x, y, L.DICE_SIZE, L.DICE_SIZE);

      // 骰子点数
      ctx.fillStyle = C.text;
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val === 0 ? '?' : val, x + L.DICE_SIZE / 2, y + L.DICE_SIZE / 2);

      if (isHeld) {
        ctx.fillStyle = C.heldMark;
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      
      // 记录点击区域
      this.hitRegions.dice.push({ x, y, w: L.DICE_SIZE, h: L.DICE_SIZE, index: i });
    });
    ctx.strokeStyle = C.diceStroke;

    // 4. 绘制操作按钮
    if (state.phase === Phase.ROLLING && state.turn.rollCount < 3) {
      // 计算按钮位置
      // 如果掷过至少一次 (rollCount >= 1)，显示两个按钮
      const showStop = state.turn.rollCount >= 1;
      
      const btnW = showStop ? 100 : L.BTN_W;
      const gap = 20;
      // 居中排列
      const totalW = showStop ? (btnW * 2 + gap) : btnW;
      const startX = (this.width - totalW) / 2;
      
      // 1) 摇骰子按钮
      const rollX = startX;
      const rollInset = this.pressed === 'btnRoll' ? 1 : 0;
      ctx.fillStyle = this.pressed === 'btnRoll' ? C.primaryPressed : C.primary;
      ctx.fillRect(rollX + rollInset, L.BTN_Y + rollInset, btnW - rollInset * 2, L.BTN_H - rollInset * 2);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('摇骰子', rollX + btnW / 2, L.BTN_Y + L.BTN_H / 2);
      this.hitRegions.btnRoll = { x: rollX, y: L.BTN_Y, w: btnW, h: L.BTN_H };
      
      // 2) 选分按钮 (仅当已掷过)
      if (showStop) {
        const stopX = rollX + btnW + gap;
        const stopInset = this.pressed === 'btnStop' ? 1 : 0;
        ctx.fillStyle = this.pressed === 'btnStop' ? C.successPressed : C.success;
        ctx.fillRect(stopX + stopInset, L.BTN_Y + stopInset, btnW - stopInset * 2, L.BTN_H - stopInset * 2);
        ctx.fillStyle = '#fff';
        ctx.fillText('选择计分', stopX + btnW / 2, L.BTN_Y + L.BTN_H / 2);
        this.hitRegions.btnStop = { x: stopX, y: L.BTN_Y, w: btnW, h: L.BTN_H };
      }
    }

    // 5. 绘制计分卡
    // 简单列表展示：Key | Score/Preview
    const scoreOptions = getScoreOptionsForUI(state);
    const minLineH = 34;
    const maxLineH = 44;
    const availableH = this.height - (L.SCORE_START_Y + 120);
    const lineH = Math.max(minLineH, Math.min(maxLineH, Math.floor(availableH / Math.max(1, scoreOptions.length))));
    const cellH = Math.max(28, lineH - 6);
    let scoreY = L.SCORE_START_Y;
    
    ctx.font = '14px sans-serif';
    ctx.textBaseline = 'middle';

    scoreOptions.forEach((opt) => {
      const x = 20;
      const w = this.width - 40;
      const h = cellH;
      
      // 背景（区分已选、可选、禁用）
      if (!opt.enabled) {
        ctx.fillStyle = '#F3F4F6';
      } else if (state.phase === Phase.SELECT_SCORE) {
        ctx.fillStyle = '#e6f7ff';
      } else {
        ctx.fillStyle = C.card;
      }
      ctx.fillRect(x, scoreY, w, h);
      ctx.strokeStyle = C.border;
      ctx.strokeRect(x, scoreY, w, h);

      if (state.phase === Phase.SELECT_SCORE && opt.enabled) {
        ctx.fillStyle = C.primary;
        ctx.fillRect(x, scoreY, 4, h);
      }

      // 文字
      ctx.fillStyle = !opt.enabled ? '#9CA3AF' : C.text;
      const label = SCORE_KEY_MAP[opt.key] || opt.key;
      ctx.textAlign = 'left';
      ctx.fillText(`${label}`, x + 12, scoreY + h / 2);
      ctx.textAlign = 'right';
      const rightText = opt.enabled ? `预览 ${opt.preview}` : `已用 ${opt.preview}`;
      ctx.fillText(rightText, x + w - 12, scoreY + h / 2);

      // 记录点击区域（仅当处于选择阶段且该格可用时）
      if (state.phase === Phase.SELECT_SCORE && opt.enabled) {
        this.hitRegions.scoreCells.push({ x, y: scoreY, w, h: lineH, key: opt.key });
      }

      scoreY += lineH;
    });
    
    // 6. 底部总分 (紧贴计分表)
    const totalScore = calcPlayerTotal(player);
    
    // scoreY 此时是最后一行计分格结束的 Y 坐标
    // 在其下方留一点间距 (比如 10px) 绘制总分
    const totalY = scoreY + 10;
    
    ctx.fillStyle = C.text;
    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top'; // 改为 top 以便对齐
    ctx.fillText(`总分: ${totalScore}`, this.width / 2, totalY);

    // 7. 回合结束/游戏结束提示
    if (state.phase === Phase.TURN_END) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('回合结束', this.width / 2, this.height / 2 - 10);
      ctx.font = '16px sans-serif';
      ctx.fillText('正在切换到下一位玩家...', this.width / 2, this.height / 2 + 20);
    }

    if (state.phase === Phase.GAME_END) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#fff';
      ctx.font = '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('游戏结束', this.width / 2, this.height / 2 - 120);

      const rankings = state.players
        .map(p => ({ name: p.name, total: calcPlayerTotal(p) }))
        .sort((a, b) => b.total - a.total);

      ctx.font = '18px sans-serif';
      rankings.forEach((r, idx) => {
        const line = `${idx + 1}. ${r.name} - ${r.total} 分`;
        ctx.fillText(line, this.width / 2, this.height / 2 - 70 + idx * 26);
      });

      const btnW = 160;
      const btnH = 44;
      const btnX = (this.width - btnW) / 2;
      const btnY = this.height / 2 + 50;
      const restartInset = this.pressed === 'btnRestart' ? 1 : 0;
      ctx.fillStyle = this.pressed === 'btnRestart' ? C.primaryPressed : C.primary;
      ctx.fillRect(btnX + restartInset, btnY + restartInset, btnW - restartInset * 2, btnH - restartInset * 2);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('再来一局', btnX + btnW / 2, btnY + btnH / 2);
      this.hitRegions.btnRestart = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
      this.hitRegions.btnRestart = null;
    }
  }
}
