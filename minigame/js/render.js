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

  render(screen, state) {
    if (screen === 'menu') {
      this.renderMenu();
      return;
    }
    if (screen === 'rules') {
      this.renderRules();
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

  renderMenu(bgImage) {
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

    // 2. 标题区（卡片化）
    const titleCardW = Math.min(300, this.width - 40);
    const titleCardH = 100;
    const titleCardX = (this.width - titleCardW) / 2;
    const titleCardY = this.safeTop + 80;

    this.drawCard(titleCardX, titleCardY, titleCardW, titleCardH);

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
    const startY = titleCardY + titleCardH + 60;
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

  renderRules() {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const backW = this.LAYOUT.TOP_BTN_W;
    const backH = this.LAYOUT.TOP_BTN_H;
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
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('游戏规则', this.width / 2, backY + backH + 16);

    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const contentX = 20;
    const maxWidth = this.width - 40;
    const lineHeight = 20;
    let y = backY + backH + 60;

    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.text;
    y = this.drawWrappedText('玩法流程', contentX, y, maxWidth, lineHeight);
    y += 6;

    ctx.font = '14px sans-serif';
    ctx.fillStyle = C.textSub;
    const flow = [
      '• 每回合最多掷骰 3 次。',
      '• 点击骰子可保留/取消保留。',
      '• 掷过至少一次后，点击“选择计分”进入计分阶段。',
      '• 计分阶段选择一个未使用的类别完成本回合。'
    ];
    for (const p of flow) {
      y = this.drawWrappedText(p, contentX, y, maxWidth, lineHeight);
      y += 4;
    }

    y += 10;
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.text;
    y = this.drawWrappedText('计分方式', contentX, y, maxWidth, lineHeight);
    y += 6;

    ctx.font = '13px sans-serif';
    ctx.fillStyle = C.textSub;
    const scoring = [
      '• 一点/两点/三点/四点/五点/六点：对应点数之和。',
      '• 三条：任意 3 个相同，得分为 5 个骰子总和，否则 0。',
      '• 四条：任意 4 个相同，得分为 5 个骰子总和，否则 0。',
      '• 葫芦：3+2 组合，固定 25 分，否则 0。',
      '• 小顺：任意 4 连（如 1-2-3-4），固定 30 分，否则 0。',
      '• 大顺：5 连（1-2-3-4-5 或 2-3-4-5-6），固定 40 分，否则 0。',
      '• 快艇：5 个相同，固定 50 分，否则 0。',
      '• 全选：5 个骰子总和。',
      '• 上层奖励：一点~六点合计 ≥ 63，额外 +35 分。',
      '• 额外快艇：若已成功计过一次快艇（50 分），之后再掷出快艇可额外 +100 分（本项目不启用 Joker 万能牌规则）。'
    ];
    for (const p of scoring) {
      y = this.drawWrappedText(p, contentX, y, maxWidth, lineHeight);
      y += 4;
    }
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
