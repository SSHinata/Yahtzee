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
      primary: '#007bff', // 蓝色
      primaryPressed: '#0062cc',
      success: '#28a745', // 绿色
      successPressed: '#218838',
      grayBtn: '#6c757d',
      grayBtnPressed: '#5a6268',
      diceStroke: '#111827',
      heldFill: '#FFE8E8', // 浅红背景
      heldStroke: '#FF6B6B', // 粗边框颜色
      heldMark: '#FF6B6B',
      phaseRolling: '#007bff', // 掷骰阶段色
      phaseScoring: '#28a745', // 计分阶段色
      scoreUsedBg: '#F3F4F6',
      scoreUsedText: '#9CA3AF',
      scoreSelectableBg: '#F0FDF4', // 浅绿背景
      scoreSelectableBorder: '#28a745'
    };
    
    // 简单的布局常量
    const safeTop = safeAreaTop || 20;
    this.safeTop = safeTop;
    
    // 三段式布局 Y 轴规划
    // 1. 顶部状态区
    const statusY = safeTop + 10;
    const statusH = 90; // 紧凑的卡片
    
    // 2. 中部掷骰区
    // 状态区下方留白 20
    const diceAreaY = statusY + statusH + 20;
    const diceAreaH = 160; // 包含骰子和按钮
    
    // 3. 底部计分卡区
    // 剩余空间全给计分卡
    const scoreY = diceAreaY + diceAreaH + 20;
    
    this.LAYOUT = {
      STATUS_Y: statusY,
      STATUS_H: statusH,
      
      DICE_AREA_Y: diceAreaY,
      DICE_AREA_H: diceAreaH,
      DICE_SIZE: 50,
      DICE_GAP: 12,
      
      SCORE_Y: scoreY,
      // 底部留一点 margin
      SCORE_H_OFFSET: 20, 
      
      BTN_W: 130,
      BTN_H: 44,
      
      TOP_BTN_H: 28,
      TOP_BTN_W: 80
    };
    
    // 用于点击检测的区域缓存
    this.hitRegions = {
      dice: [], // {x, y, w, h, index}
      btnRoll: null, // {x, y, w, h}
      btnStop: null, // {x, y, w, h}
      btnCancelScore: null, // {x, y, w, h}
      scoreCells: [], // {x, y, w, h, key}
      btnRestart: null, // {x, y, w, h}
      btnBackToMenu: null, // {x, y, w, h}
      modalCancel: null, // {x, y, w, h}
      modalConfirm: null, // {x, y, w, h}
      btnStartGame: null, // {x, y, w, h}
      btnRules: null, // {x, y, w, h}
      debugPanel: null, // {x, y, w, h}
      debugCopy: null // {x, y, w, h}
    };
    this.pressed = null;
  }

  render(screen, state, bgImage, paperBgImage, ui, animState, debug) {
    if (screen === 'menu') {
      this.renderMenu(bgImage, paperBgImage, debug);
      return;
    }
    if (screen === 'rules') {
      this.renderRules(bgImage, debug); // 传入背景图
      return;
    }
    this.renderGame(state, bgImage, paperBgImage, ui, animState, debug);
  }

  resetHitRegions() {
    this.hitRegions.dice = [];
    this.hitRegions.btnRoll = null;
    this.hitRegions.btnStop = null;
    this.hitRegions.btnCancelScore = null;
    this.hitRegions.scoreCells = [];
    this.hitRegions.btnRestart = null;
    this.hitRegions.btnBackToMenu = null;
    this.hitRegions.modalCancel = null;
    this.hitRegions.modalConfirm = null;
    this.hitRegions.btnStartGame = null;
    this.hitRegions.btnRules = null;
    this.hitRegions.btnStartGameRule = null;
    this.hitRegions.debugPanel = null;
    this.hitRegions.debugCopy = null;
  }

  drawConfirmBackToMenuModal() {
    const ctx = this.ctx;
    const C = this.COLORS;

    ctx.fillStyle = 'rgba(32, 24, 20, 0.62)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cardW = Math.min(320, this.width - 48);
    const cardH = 200;
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFF8E7';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#3F2F23';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('这局还没结束哦', cardX + cardW / 2, cardY + 18);

    ctx.fillStyle = '#6B5B4B';
    ctx.font = '14px sans-serif';
    const paddingX = 24;
    const contentX = cardX + paddingX;
    const contentY = cardY + 58;
    const contentMaxW = cardW - paddingX * 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    this.drawWrappedText('返回后将放弃当前对局进度。', contentX, contentY, contentMaxW, 20);

    const btnH = 40;
    const gap = 12;
    const btnW = (cardW - 40 - gap) / 2;
    const btnY = cardY + cardH - btnH - 16;
    const cancelX = cardX + 20;
    const confirmX = cancelX + btnW + gap;

    const drawModalBtn = (key, x, y, w, h, label, variant) => {
      const inset = this.pressed === key ? 2 : 0;
      const rx = x + inset;
      const ry = y + inset;
      const rw = w - inset * 2;
      const rh = h - inset * 2;

      ctx.save();
      if (variant === 'primary') {
        if (inset === 0) {
          ctx.shadowColor = 'rgba(0, 123, 255, 0.25)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
        }
        ctx.fillStyle = inset ? C.primaryPressed : C.primary;
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
      } else {
        ctx.fillStyle = inset ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.55)';
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 47, 35, 0.18)';
        ctx.lineWidth = 1;
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = '#6B5B4B';
        ctx.font = '14px sans-serif';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
    };

    drawModalBtn('modalCancel', cancelX, btnY, btnW, btnH, '继续游戏', 'primary');
    drawModalBtn('modalConfirm', confirmX, btnY, btnW, btnH, '返回主页面', 'secondary');

    this.hitRegions.modalCancel = { x: cancelX, y: btnY, w: btnW, h: btnH };
    this.hitRegions.modalConfirm = { x: confirmX, y: btnY, w: btnW, h: btnH };
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

  renderMenu(bgImage, paperBgImage, debug) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    // 1. 绘制背景图或纯色兜底
    if (bgImage) {
      // 使用 image-layer 绘制背景，避免真机 background-image WebP 渲染差异
      this.drawImageCover(bgImage, 0, 0, this.width, this.height, debug, 'bg');
    } else {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 1.5 绘制中景 (paperBg1)
    if (paperBgImage) {
      // 中景必须用 image 绘制，透明 WebP 在真机更稳定
      const scale = debug && debug.paper && debug.paper.renderScale ? debug.paper.renderScale : 1;
      const pW = this.width * 0.85 * scale;
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
      this.updateRenderDebug(debug, 'paper', { x: pX, y: pY, w: pW, h: pH });
      ctx.restore();
    } else if (debug && debug.paper && debug.paper.fallback && debug.paper.fallback.placeholder) {
      const scale = debug.paper.renderScale || 1;
      const pW = this.width * 0.85 * scale;
      const pH = pW * 0.6;
      const pX = (this.width - pW) / 2;
      const pY = (this.height - pH) / 2;
      ctx.save();
      ctx.globalAlpha = 0;
      ctx.fillRect(pX, pY, pW, pH);
      ctx.restore();
      this.updateRenderDebug(debug, 'paper', { x: pX, y: pY, w: pW, h: pH, placeholder: true });
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

    this.renderDebugPanel(debug);
  }

  renderRules(bgImage, debug) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    // 1. 背景统一（使用主页背景或兜底色）
    if (bgImage) {
      this.drawImageCover(bgImage, 0, 0, this.width, this.height, debug, 'bg');
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

    this.renderDebugPanel(debug);
  }

  drawStatusCard(state) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    
    // 卡片位置
    const cardX = 16;
    const cardW = this.width - 32;
    const cardY = L.STATUS_Y;
    const cardH = L.STATUS_H;
    
    // 1. 绘制卡片背景 (白色圆角)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.restore();
    
    const backW = 30;
    const backH = 30;
    const backX = cardX + 10;
    const backY = cardY + 10;
    
    if (this.pressed === 'btnBackToMenu') {
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.beginPath();
      ctx.arc(backX + backW/2, backY + backH/2, 16, 0, Math.PI*2);
      ctx.fill();
    }
    
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('←', backX + backW/2, backY + backH/2);
    
    const hitPadding = 10;
    this.hitRegions.btnBackToMenu = { 
      x: backX - hitPadding, 
      y: backY - hitPadding, 
      w: backW + hitPadding * 2, 
      h: backH + hitPadding * 2 
    };
    
    // 3. 信息展示
    const player = state.players[state.currentPlayerIndex];
    const playerName = player.name.replace('Player', '玩家');
    const isRolling = state.phase === Phase.ROLLING || state.phase === Phase.TURN_START;
    const phaseText = isRolling ? '掷骰阶段' : '计分阶段';
    const phaseColor = isRolling ? C.phaseRolling : C.phaseScoring;
    const remainingRolls = 3 - state.turn.rollCount;
    
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(playerName, backX + backW + 10, cardY + 30);
    
    // 右侧：回合数
    ctx.textAlign = 'right';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.textSub;
    ctx.fillText(`第 ${state.round} / 13 轮`, cardX + cardW - 20, cardY + 30);
    
    // 分隔线
    ctx.beginPath();
    ctx.strokeStyle = '#F3F4F6';
    ctx.lineWidth = 1;
    ctx.moveTo(cardX + 20, cardY + 50);
    ctx.lineTo(cardX + cardW - 20, cardY + 50);
    ctx.stroke();
    
    // 第二行：阶段 + 剩余次数
    const row2Y = cardY + 70;
    
    // 左侧：阶段指示 (带颜色的小圆点 + 文字)
    ctx.textAlign = 'left';
    ctx.fillStyle = phaseColor;
    ctx.beginPath();
    ctx.arc(cardX + 24, row2Y, 4, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(phaseText, cardX + 36, row2Y);
    
    // 右侧：剩余次数 (仅在掷骰阶段显示)
    if (isRolling) {
      ctx.textAlign = 'right';
      ctx.fillStyle = C.textSub;
      ctx.font = '14px sans-serif';
      ctx.fillText('剩余次数: ', cardX + cardW - 40, row2Y);
      
      ctx.fillStyle = C.primary;
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${remainingRolls}`, cardX + cardW - 20, row2Y);
    } else {
       // 计分阶段提示
      ctx.textAlign = 'right';
      ctx.fillStyle = C.success;
      ctx.font = '14px sans-serif';
      ctx.fillText('请选择一项计分', cardX + cardW - 20, row2Y);
    }
  }

  drawDiceArea(state, animState) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    
    // 区域背景 (透明，只作为容器)
    // 1. 绘制骰子
    // 计算总宽度以居中
    const totalDiceW = 5 * L.DICE_SIZE + 4 * L.DICE_GAP;
    const startX = (this.width - totalDiceW) / 2;
    // 骰子基础 Y 坐标 (垂直居中于 DICE_AREA 的上半部分)
    const baseY = L.DICE_AREA_Y + 20; 
    
    state.turn.dice.forEach((val, i) => {
      const isHeld = state.turn.held[i];
      // Held 状态：上移 10px
      const y = isHeld ? baseY - 10 : baseY;
      const x = startX + i * (L.DICE_SIZE + L.DICE_GAP);
      
      let displayValue = val;
      let animProps = null;

      // 如果有动画且当前骰子未被保留，则应用动画属性
      if (animState && animState.active && !isHeld && animState.dice && animState.dice[i]) {
        const d = animState.dice[i];
        displayValue = d.val;
        animProps = {
          offsetX: d.offsetX,
          offsetY: d.offsetY,
          rotation: d.rotation,
          scale: d.scale
        };
      }

      this.drawDie(x, y, L.DICE_SIZE, displayValue, isHeld, animProps);
      
      // 注册点击区域 (仅当不在动画中且在 Rolling 阶段有效)
      if (!(animState && animState.active)) {
         this.hitRegions.dice.push({ x, y, w: L.DICE_SIZE, h: L.DICE_SIZE, index: i });
      }
    });
    
    // 2. 绘制按钮 (位于骰子下方)
    const btnY = baseY + L.DICE_SIZE + 30;
    const isAnimating = animState && animState.active;

    if (state.phase === Phase.ROLLING && state.turn.rollCount < 3) {
      // 居中显示按钮
      // 如果已掷过 (rollCount > 0)，显示 "摇骰子" 和 "选分"
      // 否则只显示 "摇骰子"
      const showStop = state.turn.rollCount > 0;
      const gap = 16;
      const rollBtnW = showStop ? L.BTN_W : 160; // 单按钮时宽一点
      const totalBtnW = showStop ? (rollBtnW + gap + L.BTN_W) : rollBtnW;
      const btnStartX = (this.width - totalBtnW) / 2;
      
      // --- 摇骰子按钮 ---
      const rollX = btnStartX;
      const rollInset = this.pressed === 'btnRoll' ? 2 : 0;
      
      ctx.save();
      if (isAnimating) {
         ctx.globalAlpha = 0.6;
      }
      // 投影
      if (rollInset === 0 && !isAnimating) {
        ctx.shadowColor = 'rgba(0, 123, 255, 0.3)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;
      }
      ctx.fillStyle = this.pressed === 'btnRoll' ? C.primaryPressed : C.primary;
      this.drawRoundedRect(rollX + rollInset, btnY + rollInset, rollBtnW - rollInset * 2, L.BTN_H - rollInset * 2, 22);
      ctx.fill();
      ctx.restore();
      
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const rollText = state.turn.rollCount === 0 ? '摇骰子' : `再摇一次`;
      ctx.fillText(rollText, rollX + rollBtnW / 2, btnY + L.BTN_H / 2);
      
      if (!isAnimating) {
        this.hitRegions.btnRoll = { x: rollX, y: btnY, w: rollBtnW, h: L.BTN_H };
      }
      
      // --- 选分按钮 (绿色，仅当 showStop) ---
      if (showStop) {
        const stopX = rollX + rollBtnW + gap;
        const stopInset = this.pressed === 'btnStop' ? 2 : 0;
        
        ctx.save();
        if (isAnimating) ctx.globalAlpha = 0.6;
        
        ctx.fillStyle = this.pressed === 'btnStop' ? C.successPressed : C.success;
        this.drawRoundedRect(stopX + stopInset, btnY + stopInset, L.BTN_W - stopInset * 2, L.BTN_H - stopInset * 2, 22);
        ctx.fill();
        ctx.restore();
        
        ctx.fillStyle = '#fff';
        ctx.fillText('选择计分', stopX + L.BTN_W / 2, btnY + L.BTN_H / 2);
      
        if (!isAnimating) {
          this.hitRegions.btnStop = { x: stopX, y: btnY, w: L.BTN_W, h: L.BTN_H };
        }
    }
  } else if (state.phase === Phase.SELECT_SCORE) {
     // 计分阶段
     // 1. 提示文本
     ctx.fillStyle = C.success;
     ctx.font = 'bold 16px sans-serif';
     ctx.textAlign = 'center';
     ctx.textBaseline = 'middle';
     
     // 2. 如果还有剩余掷骰次数 (rollCount < 3)，显示“继续投掷”按钮
     if (state.turn.rollCount < 3) {
       const cancelBtnW = 140;
       const cancelBtnX = (this.width - cancelBtnW) / 2;
       const cancelInset = this.pressed === 'btnCancelScore' ? 2 : 0;
       
       ctx.save();
       if (isAnimating) ctx.globalAlpha = 0.6;

       // 按钮样式：浅灰色或描边，表示“返回”
       ctx.fillStyle = this.pressed === 'btnCancelScore' ? '#E5E7EB' : '#F3F4F6';
       this.drawRoundedRect(cancelBtnX + cancelInset, btnY + cancelInset, cancelBtnW - cancelInset*2, L.BTN_H - cancelInset*2, 22);
       ctx.fill();
       
       ctx.strokeStyle = '#D1D5DB';
       ctx.lineWidth = 1;
       this.drawRoundedRect(cancelBtnX + cancelInset, btnY + cancelInset, cancelBtnW - cancelInset*2, L.BTN_H - cancelInset*2, 22);
       ctx.stroke();
       ctx.restore();
       
       ctx.fillStyle = C.text;
       ctx.font = '14px sans-serif';
       ctx.fillText('继续投掷', cancelBtnX + cancelBtnW / 2, btnY + L.BTN_H / 2);
       
       if (!isAnimating) {
         this.hitRegions.btnCancelScore = { x: cancelBtnX, y: btnY, w: cancelBtnW, h: L.BTN_H };
       }
       
       // 提示文本移到按钮下方
       ctx.fillStyle = C.success;
       ctx.fillText('👇 或点击下方列表计分', this.width / 2, btnY + L.BTN_H + 20);
     } else {
       // 没有次数了，只能计分
       ctx.fillText('👇 请点击下方列表计分', this.width / 2, btnY + 20);
     }
  }
}

  drawDie(x, y, size, value, isHeld, animProps) {
    const ctx = this.ctx;
    
    const { offsetX = 0, offsetY = 0, rotation = 0, scale = 1 } = animProps || {};

    const centerX = x + size / 2 + offsetX;
    const centerY = y + size / 2 + offsetY;
    const halfSize = (size * scale) / 2;
    // 增加圆角，更像真实骰子
    const cornerRadius = size * 0.22; 

    ctx.save();
    
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    
    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = isHeld ? 15 : 6;
    ctx.shadowOffsetY = isHeld ? 8 : 3;

    // Background
    ctx.fillStyle = isHeld ? '#FFF0F0' : '#FFFFFF';
    
    // Draw rect centered at (0,0)
    this.drawRoundedRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2, cornerRadius);
    ctx.fill();
    
    // Border
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = isHeld ? 3 : 1; 
    ctx.strokeStyle = isHeld ? '#FF6B6B' : '#E5E7EB';
    this.drawRoundedRect(-halfSize, -halfSize, halfSize * 2, halfSize * 2, cornerRadius);
    ctx.stroke();

    // Pips
    if (value >= 1 && value <= 6) {
        this.drawPips(value, halfSize * 2);
    } else {
        // Fallback for '?' or other values
        ctx.fillStyle = '#333';
        ctx.font = `bold ${size/2}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 0);
    }

    ctx.restore();
  }

  drawPips(value, size) {
    const ctx = this.ctx;
    const pipSize = size * 0.18;
    const pipRadius = pipSize / 2;
    
    ctx.fillStyle = '#333';
    
    // Positions: -1, 0, 1
    // Scale factor: size * 0.25
    const d = size * 0.26;

    const drawDot = (dx, dy) => {
        ctx.beginPath();
        ctx.arc(dx * d, dy * d, pipRadius, 0, Math.PI * 2);
        ctx.fill();
    };

    if (value === 1) {
        drawDot(0, 0);
    } else if (value === 2) {
        drawDot(-1, -1); drawDot(1, 1);
    } else if (value === 3) {
        drawDot(-1, -1); drawDot(0, 0); drawDot(1, 1);
    } else if (value === 4) {
        drawDot(-1, -1); drawDot(1, -1);
        drawDot(-1, 1);  drawDot(1, 1);
    } else if (value === 5) {
        drawDot(-1, -1); drawDot(1, -1);
        drawDot(0, 0);
        drawDot(-1, 1);  drawDot(1, 1);
    } else if (value === 6) {
        drawDot(-1, -1); drawDot(1, -1);
        drawDot(-1, 0);  drawDot(1, 0);
        drawDot(-1, 1);  drawDot(1, 1);
    }
  }

  drawScoreCard(state) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    
    const cardX = 16;
    const cardW = this.width - 32;
    const cardY = L.SCORE_Y;
    // 计算剩余高度
    const cardH = this.height - cardY - L.SCORE_H_OFFSET;
    
    // 1. 绘制大卡片背景
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = -2; // 向上一点阴影
    ctx.fillStyle = '#FFFFFF';
    // 顶部圆角，底部可以直角或圆角
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.restore();
    
    // 2. 标题
    const titleH = 40;
    ctx.fillStyle = C.text;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('计分表', this.width / 2, cardY + 20);
    
    // 3. 列表内容
    const listY = cardY + titleH;
    const listH = cardH - titleH - 10;
    
    const scoreOptions = getScoreOptionsForUI(state);
    // 简单计算行高，确保能放下
    // 共有 13 项 + 2 个标题 = 15 行
    // 如果高度不够，就得缩小
    const totalItems = scoreOptions.length + 2; // +2 for group headers
    let itemH = Math.floor(listH / totalItems);
    itemH = Math.min(36, Math.max(24, itemH)); // 限制在 24~36 之间
    
    let currentY = listY;
    
    const drawRow = (opt) => {
      const isUsed = !opt.enabled;
      const isSelectable = state.phase === Phase.SELECT_SCORE && opt.enabled;
      
      const rowX = cardX + 10;
      const rowW = cardW - 20;
      const rowH = itemH - 4; // 留间隙
      
      // 背景
      if (isUsed) {
        ctx.fillStyle = C.scoreUsedBg;
        this.drawRoundedRect(rowX, currentY, rowW, rowH, 6);
        ctx.fill();
      } else if (isSelectable) {
        ctx.fillStyle = C.scoreSelectableBg;
        this.drawRoundedRect(rowX, currentY, rowW, rowH, 6);
        ctx.fill();
        ctx.strokeStyle = C.scoreSelectableBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      
      // 文字
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = SCORE_KEY_MAP[opt.key] || opt.key;
      
      // 规则名称
      ctx.fillStyle = isUsed ? C.scoreUsedText : C.text;
      ctx.font = isSelectable ? 'bold 14px sans-serif' : '14px sans-serif';
      ctx.fillText(label, rowX + 10, currentY + rowH / 2);
      
      // 分数/预览
      ctx.textAlign = 'right';
      const scoreText = isUsed ? `${opt.preview}` : (opt.preview !== undefined ? `${opt.preview}` : '-');
      // 如果是可选状态，分数用主色强调
      ctx.fillStyle = isUsed ? C.scoreUsedText : (isSelectable ? C.primary : C.textSub);
      ctx.fillText(scoreText, rowX + rowW - 10, currentY + rowH / 2);
      
      // 注册点击
      if (isSelectable) {
        this.hitRegions.scoreCells.push({ x: rowX, y: currentY, w: rowW, h: rowH, key: opt.key });
      }
      
      currentY += itemH;
    };
    
    const drawHeader = (text) => {
      ctx.fillStyle = C.textSub;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(text, cardX + 20, currentY + itemH - 4);
      
      // 细线
      ctx.beginPath();
      ctx.strokeStyle = '#E5E7EB';
      ctx.moveTo(cardX + 20 + ctx.measureText(text).width + 10, currentY + itemH - 10);
      ctx.lineTo(cardX + cardW - 20, currentY + itemH - 10);
      ctx.stroke();
      
      currentY += itemH;
    };
    
    // 分组绘制
    // 数字区: keys 1-6
    drawHeader('数字区');
    scoreOptions.slice(0, 6).forEach(drawRow);
    
    // 组合区
    drawHeader('组合区');
    scoreOptions.slice(6).forEach(drawRow);
    
    // 底部总分显示在标题栏右侧？或者列表底部？
    // 放在标题栏右侧比较省空间
    const totalScore = calcPlayerTotal(state.players[state.currentPlayerIndex]);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = C.primary;
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`总分: ${totalScore}`, cardX + cardW - 20, cardY + 20);
  }

  renderGame(state, bgImage, paperBgImage, ui, animState, debug) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    this.resetHitRegions();

    // 1. 背景绘制 (与 Menu/Rules 统一逻辑)
    // 层级结构：背景层(image) -> 中景装饰(image) -> UI 内容层
    if (bgImage) {
      this.drawImageCover(bgImage, 0, 0, this.width, this.height, debug, 'bg');
    } else {
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    // 1.5 中景装饰 (如果存在)
    if (paperBgImage) {
      // 宽度设定为屏幕宽度的 90%，必要时缩小渲染降低解码压力
      const scale = debug && debug.paper && debug.paper.renderScale ? debug.paper.renderScale : 1;
      const pW = this.width * 0.9 * scale;
      const pH = pW * (paperBgImage.height / paperBgImage.width);
      const pX = (this.width - pW) / 2;
      // 垂直居中偏上一点
      const pY = (this.height - pH) / 2 - 20;

      ctx.save();
      ctx.globalAlpha = 0.4; // 较淡，作为氛围背景
      ctx.drawImage(paperBgImage, pX, pY, pW, pH);
      ctx.restore();
      this.updateRenderDebug(debug, 'paper', { x: pX, y: pY, w: pW, h: pH });
    } else if (debug && debug.paper && debug.paper.fallback && debug.paper.fallback.placeholder) {
      const scale = debug.paper.renderScale || 1;
      const pW = this.width * 0.9 * scale;
      const pH = pW * 0.6;
      const pX = (this.width - pW) / 2;
      const pY = (this.height - pH) / 2 - 20;
      ctx.save();
      ctx.globalAlpha = 0;
      ctx.fillRect(pX, pY, pW, pH);
      ctx.restore();
      this.updateRenderDebug(debug, 'paper', { x: pX, y: pY, w: pW, h: pH, placeholder: true });
    }
    
    // 2. 绘制三段式布局
    this.drawStatusCard(state);
    this.drawDiceArea(state, animState);
    this.drawScoreCard(state);
    
    // 4. 回合结束/游戏结束 遮罩层 (保持原有逻辑)
    if (state.phase === Phase.TURN_END) {
      this.drawOverlay('回合结束', '正在切换下一位玩家...');
    }

    if (state.phase === Phase.GAME_END) {
      this.renderGameEnd(state);
    } else {
      this.hitRegions.btnRestart = null;
    }

    if (ui && ui.confirmBackToMenuOpen) {
      this.drawConfirmBackToMenuModal();
    }

    this.renderDebugPanel(debug);
  }

  drawImageCover(image, x, y, w, h, debug, key) {
    const imgRatio = image.width / image.height;
    const screenRatio = w / h;

    let sx = 0, sy = 0, sw = image.width, sh = image.height;
    if (screenRatio > imgRatio) {
      sw = image.width;
      sh = image.width / screenRatio;
      sx = 0;
      sy = (image.height - sh) / 2;
    } else {
      sh = image.height;
      sw = image.height * screenRatio;
      sx = (image.width - sw) / 2;
      sy = 0;
    }

    this.ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    this.updateRenderDebug(debug, key, { x, y, w, h, sx, sy, sw, sh });
  }

  updateRenderDebug(debug, key, payload) {
    if (!debug || !debug.enabled || !debug[key]) return;
    debug[key].render = {
      time: Date.now(),
      ...payload
    };
  }

  renderDebugPanel(debug) {
    if (!debug || !debug.enabled) return;
    const ctx = this.ctx;
    const padding = 10;
    const panelW = debug.panelExpanded ? 220 : 110;
    const panelH = debug.panelExpanded ? 214 : 32;
    const x = this.width - panelW - padding;
    const y = padding;

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = '#111827';
    this.drawRoundedRect(x, y, panelW, panelH, 8);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#F9FAFB';
    ctx.font = '12px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(debug.panelExpanded ? '诊断面板 (点击收起)' : '诊断 (点击展开)', x + 10, y + 8);

    if (debug.panelExpanded) {
      const lineY = y + 30;
      const lineGap = 18;
      const bgStatus = debug.bg.loaded ? '成功' : '失败';
      const paperStatus = debug.paper.loaded ? '成功' : '失败';
      ctx.fillText(`背景 WebP: ${bgStatus}`, x + 10, lineY);
      ctx.fillText(`中景 WebP: ${paperStatus}`, x + 10, lineY + lineGap);
      const systemText = `${debug.systemInfo.system || ''} ${debug.systemInfo.model || ''}`.trim();
      ctx.fillText(`设备: ${systemText || '未知'}`, x + 10, lineY + lineGap * 2);
      const versionText = `微信: ${debug.systemInfo.version || '未知'}`;
      ctx.fillText(versionText, x + 10, lineY + lineGap * 3);
      ctx.fillText(`渲染策略: ${debug.renderStrategy}`, x + 10, lineY + lineGap * 4);
      const bgError = debug.bg.error ? this.formatDebugError(debug.bg.error) : null;
      const paperError = debug.paper.error ? this.formatDebugError(debug.paper.error) : null;
      if (bgError) {
        ctx.fillStyle = '#FCA5A5';
        ctx.fillText(`背景错误: ${bgError}`, x + 10, lineY + lineGap * 5);
      }
      if (paperError) {
        ctx.fillStyle = '#FCA5A5';
        ctx.fillText(`中景错误: ${paperError}`, x + 10, lineY + lineGap * 6);
      }

      // 复制按钮：将完整诊断信息复制到剪贴板（真机可粘贴）
      const copyW = 72;
      const copyH = 22;
      const copyX = x + panelW - copyW - 10;
      const copyY = y + panelH - copyH - 10;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      this.drawRoundedRect(copyX, copyY, copyW, copyH, 6);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#F9FAFB';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('复制诊断', copyX + copyW / 2, copyY + copyH / 2);
      this.hitRegions.debugCopy = { x: copyX, y: copyY, w: copyW, h: copyH };
    }

    this.hitRegions.debugPanel = { x, y, w: panelW, h: panelH };
  }

  formatDebugError(error) {
    if (!error) return '';
    if (typeof error === 'string') return error.slice(0, 24);
    if (error.errMsg) return String(error.errMsg).slice(0, 24);
    try {
      return JSON.stringify(error).slice(0, 24);
    } catch (e) {
      return '未知错误';
    }
  }
  
  drawOverlay(title, subTitle) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, this.width / 2, this.height / 2 - 10);
    if (subTitle) {
      ctx.font = '16px sans-serif';
      ctx.fillText(subTitle, this.width / 2, this.height / 2 + 25);
    }
  }
  
  renderGameEnd(state) {
    const ctx = this.ctx;
    const C = this.COLORS;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.width, this.height);
    
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    
    // 结算卡片
    const cardW = 280;
    const cardH = 320;
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;
    
    ctx.fillStyle = '#FFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    
    ctx.fillStyle = C.text;
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('游戏结束', centerX, cardY + 30);
    
    // 排名
    const rankings = state.players
      .map(p => ({ name: p.name, total: calcPlayerTotal(p) }))
      .sort((a, b) => b.total - a.total);

    let rankY = cardY + 80;
    ctx.font = '18px sans-serif';
    rankings.forEach((r, idx) => {
      const isWinner = idx === 0;
      ctx.fillStyle = isWinner ? C.primary : C.text;
      const prefix = isWinner ? '🏆 ' : `${idx + 1}. `;
      const line = `${prefix}${r.name}`;
      
      ctx.textAlign = 'left';
      ctx.fillText(line, cardX + 40, rankY);
      
      ctx.textAlign = 'right';
      ctx.fillText(`${r.total} 分`, cardX + cardW - 40, rankY);
      
      rankY += 40;
    });
    
    // 再来一局按钮
    const btnW = 180;
    const btnH = 48;
    const btnX = centerX - btnW / 2;
    const btnY = cardY + cardH - btnH - 30;
    
    const restartInset = this.pressed === 'btnRestart' ? 2 : 0;
    ctx.fillStyle = this.pressed === 'btnRestart' ? C.primaryPressed : C.primary;
    this.drawRoundedRect(btnX + restartInset, btnY + restartInset, btnW - restartInset*2, btnH - restartInset*2, 24);
    ctx.fill();
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('再来一局', centerX, btnY + btnH / 2);
    
    this.hitRegions.btnRestart = { x: btnX, y: btnY, w: btnW, h: btnH };
  }
}
