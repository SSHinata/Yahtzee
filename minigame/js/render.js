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
    
    // 简单的布局常量
    const safeTop = safeAreaTop || 20;
    this.LAYOUT = {
      HEADER_Y: safeTop + 20,
      DICE_Y: safeTop + 80,
      DICE_SIZE: 50,
      DICE_GAP: 10,
      BTN_Y: safeTop + 160,
      BTN_W: 120,
      BTN_H: 40,
      SCORE_START_Y: safeTop + 230,
      SCORE_LINE_H: 30
    };
    
    // 用于点击检测的区域缓存
    this.hitRegions = {
      dice: [], // {x, y, w, h, index}
      btnRoll: null, // {x, y, w, h}
      btnStop: null, // {x, y, w, h}
      scoreCells: [], // {x, y, w, h, key}
      btnRestart: null // {x, y, w, h}
    };
  }

  render(state) {
    const ctx = this.ctx;
    const L = this.LAYOUT;

    // 1. 绘制背景
    // 注意：这里使用 this.width 而不是 ctx.canvas.width，确保逻辑尺寸正确
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. 绘制顶部信息 (当前玩家、轮次)
    ctx.fillStyle = '#333';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    const player = state.players[state.currentPlayerIndex];
    // 使用中文 Player 1 -> 玩家 1
    const playerName = player.name.replace('Player', '玩家');
    const infoText = `第 ${state.round} 轮 | 当前玩家: ${playerName}`;
    ctx.fillText(infoText, this.width / 2, L.HEADER_Y);
    
    const phaseName = PHASE_MAP[state.phase] || state.phase;
    const phaseText = `阶段: ${phaseName} | 剩余掷骰次数: ${3 - state.turn.rollCount}`;
    ctx.font = '16px sans-serif';
    ctx.fillText(phaseText, this.width / 2, L.HEADER_Y + 25);

    // 3. 绘制骰子
    this.hitRegions.dice = [];
    const diceStartX = (this.width - (5 * L.DICE_SIZE + 4 * L.DICE_GAP)) / 2;
    
    state.turn.dice.forEach((val, i) => {
      const x = diceStartX + i * (L.DICE_SIZE + L.DICE_GAP);
      const y = L.DICE_Y;
      const isHeld = state.turn.held[i];

      // 骰子背景
      ctx.fillStyle = isHeld ? '#ffcccc' : '#ffffff';
      ctx.fillRect(x, y, L.DICE_SIZE, L.DICE_SIZE);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(x, y, L.DICE_SIZE, L.DICE_SIZE);

      // 骰子点数
      ctx.fillStyle = '#000';
      ctx.font = '30px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(val === 0 ? '?' : val, x + L.DICE_SIZE / 2, y + L.DICE_SIZE / 2);
      
      // 记录点击区域
      this.hitRegions.dice.push({ x, y, w: L.DICE_SIZE, h: L.DICE_SIZE, index: i });
    });

    // 4. 绘制操作按钮
    this.hitRegions.btnRoll = null;
    this.hitRegions.btnStop = null;
    
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
      ctx.fillStyle = '#007bff';
      ctx.fillRect(rollX, L.BTN_Y, btnW, L.BTN_H);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('摇骰子', rollX + btnW / 2, L.BTN_Y + L.BTN_H / 2);
      this.hitRegions.btnRoll = { x: rollX, y: L.BTN_Y, w: btnW, h: L.BTN_H };
      
      // 2) 选分按钮 (仅当已掷过)
      if (showStop) {
        const stopX = rollX + btnW + gap;
        ctx.fillStyle = '#28a745'; // 绿色
        ctx.fillRect(stopX, L.BTN_Y, btnW, L.BTN_H);
        ctx.fillStyle = '#fff';
        ctx.fillText('就它了!', stopX + btnW / 2, L.BTN_Y + L.BTN_H / 2);
        this.hitRegions.btnStop = { x: stopX, y: L.BTN_Y, w: btnW, h: L.BTN_H };
      }
    }

    // 5. 绘制计分卡
    // 简单列表展示：Key | Score/Preview
    this.hitRegions.scoreCells = [];
    const scoreOptions = getScoreOptionsForUI(state);
    let scoreY = L.SCORE_START_Y;
    
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    scoreOptions.forEach((opt) => {
      const x = 20;
      const w = this.width - 40;
      const h = L.SCORE_LINE_H - 5;
      
      // 背景（区分已选、可选、禁用）
      if (!opt.enabled) {
        ctx.fillStyle = '#ddd'; // 已使用
      } else if (state.phase === Phase.SELECT_SCORE) {
        ctx.fillStyle = '#e6f7ff'; // 待选
      } else {
        ctx.fillStyle = '#fff'; // 普通
      }
      ctx.fillRect(x, scoreY, w, h);
      ctx.strokeRect(x, scoreY, w, h);

      // 文字
      ctx.fillStyle = '#000';
      const label = SCORE_KEY_MAP[opt.key] || opt.key;
      const val = opt.enabled ? `(预览: ${opt.preview})` : `得分: ${opt.preview}`;
      ctx.fillText(`${label} - ${val}`, x + 10, scoreY + 5);

      // 记录点击区域（仅当处于选择阶段且该格可用时）
      if (state.phase === Phase.SELECT_SCORE && opt.enabled) {
        this.hitRegions.scoreCells.push({ x, y: scoreY, w, h, key: opt.key });
      }

      scoreY += L.SCORE_LINE_H;
    });
    
    // 6. 底部总分 (紧贴计分表)
    const totalScore = calcPlayerTotal(player);
    
    // scoreY 此时是最后一行计分格结束的 Y 坐标
    // 在其下方留一点间距 (比如 10px) 绘制总分
    const totalY = scoreY + 10;
    
    ctx.fillStyle = '#000';
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
      ctx.fillStyle = '#007bff';
      ctx.fillRect(btnX, btnY, btnW, btnH);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('重新开始', btnX + btnW / 2, btnY + btnH / 2);
      this.hitRegions.btnRestart = { x: btnX, y: btnY, w: btnW, h: btnH };
    } else {
      this.hitRegions.btnRestart = null;
    }
  }
}
