import { Phase, ScoreKey } from '../core/engine/rules';
import { getScoreOptionsForUI } from '../core/engine/uiSelectors';
import { calcPlayerTotal } from '../core/engine/scoring';
import { formatMMDD } from './scoreStorage';

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
  constructor(ctx, logicWidth, logicHeight, safeAreaTop, safeAreaBottomInset) {
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
    this.safeBottom = safeAreaBottomInset || 0;
    
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
      btnBackToMenuEnd: null, // {x, y, w, h}
      modalCancel: null, // {x, y, w, h}
      modalConfirm: null, // {x, y, w, h}
      btnStartGame: null, // {x, y, w, h}
      btnOnlineBattle: null,
      btnRules: null, // {x, y, w, h}
      btnLeaderboardMenu: null, // {x, y, w, h}
      btnLeaderboardGame: null, // {x, y, w, h}
      modeSelectBackdrop: null, // {x, y, w, h}
      btnModeLocal2p: null, // {x, y, w, h}
      btnModeSingle: null, // {x, y, w, h}
      btnModeCancel: null, // {x, y, w, h}
      leaderboardBackdrop: null, // {x, y, w, h}
      btnLeaderboardClose: null, // {x, y, w, h}
      btnLeaderboardClear: null, // {x, y, w, h}
      btnLeaderboardRestartSingle: null, // {x, y, w, h}
      btnLeaderboardBackToMenu: null, // {x, y, w, h}
      confirmClearCancel: null, // {x, y, w, h}
      confirmClearConfirm: null, // {x, y, w, h}
      btnScoreQuickRef: null, // {x, y, w, h}
      btnLobbyShare: null,
      btnLobbyStart: null,
      btnLobbyExit: null,
      onlineEntryBackdrop: null,
      btnOnlineCreate: null,
      btnOnlineJoin: null,
      btnOnlineEntryCancel: null,
      quickRefBackdrop: null, // {x, y, w, h}
      quickRefCard: null // {x, y, w, h}
    };
    this.pressed = null;
  }

  render(screen, state, ui, animState) {
    if (screen === 'menu') {
      this.renderMenu(ui);
      if (ui && ui.modeSelectOpen) this.drawModeSelectModal();
      if (ui && ui.leaderboardOpen) this.drawSingleLeaderboardModal(ui);
      if (ui && ui.onlineEntryOpen) this.drawOnlineEntryModal();
      return;
    }
    if (screen === 'lobby') {
      this.renderLobby(ui);
      return;
    }
    if (screen === 'rules') {
      this.renderRules();
      if (ui && ui.modeSelectOpen) this.drawModeSelectModal();
      if (ui && ui.leaderboardOpen) this.drawSingleLeaderboardModal(ui);
      return;
    }
    this.renderGame(state, ui, animState);
  }

  resetHitRegions() {
    this.hitRegions.dice = [];
    this.hitRegions.btnRoll = null;
    this.hitRegions.btnStop = null;
    this.hitRegions.btnCancelScore = null;
    this.hitRegions.scoreCells = [];
    this.hitRegions.btnRestart = null;
    this.hitRegions.btnBackToMenu = null;
    this.hitRegions.btnBackToMenuEnd = null;
    this.hitRegions.modalCancel = null;
    this.hitRegions.modalConfirm = null;
    this.hitRegions.btnStartGame = null;
    this.hitRegions.btnOnlineBattle = null;
    this.hitRegions.btnRules = null;
    this.hitRegions.btnLeaderboardMenu = null;
    this.hitRegions.btnLeaderboardGame = null;
    this.hitRegions.modeSelectBackdrop = null;
    this.hitRegions.btnModeLocal2p = null;
    this.hitRegions.btnModeSingle = null;
    this.hitRegions.btnModeCancel = null;
    this.hitRegions.leaderboardBackdrop = null;
    this.hitRegions.btnLeaderboardClose = null;
    this.hitRegions.btnLeaderboardClear = null;
    this.hitRegions.btnLeaderboardRestartSingle = null;
    this.hitRegions.btnLeaderboardBackToMenu = null;
    this.hitRegions.confirmClearCancel = null;
    this.hitRegions.confirmClearConfirm = null;
    this.hitRegions.btnScoreQuickRef = null;
    this.hitRegions.btnLobbyShare = null;
    this.hitRegions.btnLobbyStart = null;
    this.hitRegions.btnLobbyExit = null;
    this.hitRegions.onlineEntryBackdrop = null;
    this.hitRegions.btnOnlineCreate = null;
    this.hitRegions.btnOnlineJoin = null;
    this.hitRegions.btnOnlineEntryCancel = null;
    this.hitRegions.quickRefBackdrop = null;
    this.hitRegions.quickRefCard = null;
    this.hitRegions.btnStartGameRule = null;
  }

  drawOnlineEntryModal() {
    const ctx = this.ctx
    const C = this.COLORS

    ctx.fillStyle = 'rgba(17, 24, 39, 0.58)'
    ctx.fillRect(0, 0, this.width, this.height)
    this.hitRegions.onlineEntryBackdrop = { x: 0, y: 0, w: this.width, h: this.height }

    const cardW = Math.min(320, this.width - 48)
    const cardH = 260
    const cardX = (this.width - cardW) / 2
    const cardY = (this.height - cardH) / 2

    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetY = 10
    ctx.fillStyle = '#FFFFFF'
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = C.text
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('联机对战', cardX + cardW / 2, cardY + 18)

    ctx.fillStyle = '#6B7280'
    ctx.font = '14px sans-serif'
    ctx.fillText('创建房间或输入房间号加入', cardX + cardW / 2, cardY + 50)

    const btnH = 44
    const btnW = cardW - 48
    const btnX = cardX + 24
    const btnY1 = cardY + 86
    const gap = 14

    const drawBtn = (key, y, text, style) => {
      const inset = this.pressed === key ? 2 : 0
      let fill = '#F3F4F6'
      let textColor = C.text
      if (style === 'primary') {
        fill = this.pressed === key ? C.primaryPressed : C.primary
        textColor = '#fff'
      }
      if (style === 'success') {
        fill = this.pressed === key ? C.successPressed : C.success
        textColor = '#fff'
      }
      ctx.save()
      ctx.fillStyle = fill
      this.drawRoundedRect(btnX + inset, y + inset, btnW - inset * 2, btnH - inset * 2, 18)
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = textColor
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text, btnX + btnW / 2, y + btnH / 2)
    }

    drawBtn('btnOnlineCreate', btnY1, '创建房间', 'success')
    drawBtn('btnOnlineJoin', btnY1 + btnH + gap, '加入房间（输入房间号）', 'primary')
    drawBtn('btnOnlineEntryCancel', btnY1 + (btnH + gap) * 2, '取消', 'secondary')

    this.hitRegions.btnOnlineCreate = { x: btnX, y: btnY1, w: btnW, h: btnH }
    this.hitRegions.btnOnlineJoin = { x: btnX, y: btnY1 + btnH + gap, w: btnW, h: btnH }
    this.hitRegions.btnOnlineEntryCancel = { x: btnX, y: btnY1 + (btnH + gap) * 2, w: btnW, h: btnH }
  }

  drawModeSelectModal() {
    const ctx = this.ctx;
    const C = this.COLORS;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
    ctx.fillRect(0, 0, this.width, this.height);
    this.hitRegions.modeSelectBackdrop = { x: 0, y: 0, w: this.width, h: this.height };

    const cardW = Math.min(320, this.width - 48);
    const cardH = 260;
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('选择模式', cardX + cardW / 2, cardY + 18);

    const btnH = 44;
    const btnW = cardW - 48;
    const btnX = cardX + 24;
    const btnY1 = cardY + 72;
    const gap = 14;

    const drawBtn = (key, y, label, variant) => {
      const inset = this.pressed === key ? 2 : 0;
      const rx = btnX + inset;
      const ry = y + inset;
      const rw = btnW - inset * 2;
      const rh = btnH - inset * 2;

      ctx.save();
      if (variant === 'primary') {
        if (inset === 0) {
          ctx.shadowColor = 'rgba(0, 123, 255, 0.25)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
        }
        ctx.fillStyle = inset ? C.primaryPressed : C.primary;
        this.drawRoundedRect(rx, ry, rw, rh, 18);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
      } else if (variant === 'success') {
        if (inset === 0) {
          ctx.shadowColor = 'rgba(40, 167, 69, 0.25)';
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 4;
        }
        ctx.fillStyle = inset ? C.successPressed : C.success;
        this.drawRoundedRect(rx, ry, rw, rh, 18);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px sans-serif';
      } else {
        ctx.fillStyle = inset ? '#E5E7EB' : '#F3F4F6';
        this.drawRoundedRect(rx, ry, rw, rh, 18);
        ctx.fill();
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 1;
        this.drawRoundedRect(rx, ry, rw, rh, 18);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.textSub;
        ctx.font = '16px sans-serif';
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, btnX + btnW / 2, y + btnH / 2);
    };

    drawBtn('btnModeLocal2p', btnY1, '本地双人', 'primary');
    drawBtn('btnModeSingle', btnY1 + btnH + gap, '单人挑战', 'success');
    drawBtn('btnModeCancel', btnY1 + (btnH + gap) * 2, '取消', 'secondary');

    this.hitRegions.btnModeLocal2p = { x: btnX, y: btnY1, w: btnW, h: btnH };
    this.hitRegions.btnModeSingle = { x: btnX, y: btnY1 + btnH + gap, w: btnW, h: btnH };
    this.hitRegions.btnModeCancel = { x: btnX, y: btnY1 + (btnH + gap) * 2, w: btnW, h: btnH };
  }

  drawConfirmClearLeaderboardModal() {
    const ctx = this.ctx;
    const C = this.COLORS;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cardW = Math.min(320, this.width - 48);
    const cardH = 200;
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('清空记录？', cardX + cardW / 2, cardY + 18);

    ctx.fillStyle = C.textSub;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    this.drawWrappedText('此操作不可撤销，将删除本地单人历史榜单。', cardX + 24, cardY + 58, cardW - 48, 20);

    const btnH = 40;
    const gap = 12;
    const btnW = (cardW - 40 - gap) / 2;
    const btnY = cardY + cardH - btnH - 16;
    const cancelX = cardX + 20;
    const confirmX = cancelX + btnW + gap;

    const drawBtn = (key, x, y, w, h, label, variant) => {
      const inset = this.pressed === key ? 2 : 0;
      const rx = x + inset;
      const ry = y + inset;
      const rw = w - inset * 2;
      const rh = h - inset * 2;

      ctx.save();
      if (variant === 'danger') {
        ctx.fillStyle = inset ? '#DC2626' : '#EF4444';
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px sans-serif';
      } else {
        ctx.fillStyle = inset ? '#E5E7EB' : '#F3F4F6';
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 1;
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = C.textSub;
        ctx.font = '14px sans-serif';
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + w / 2, y + h / 2);
    };

    drawBtn('confirmClearCancel', cancelX, btnY, btnW, btnH, '取消', 'secondary');
    drawBtn('confirmClearConfirm', confirmX, btnY, btnW, btnH, '清空', 'danger');

    this.hitRegions.confirmClearCancel = { x: cancelX, y: btnY, w: btnW, h: btnH };
    this.hitRegions.confirmClearConfirm = { x: confirmX, y: btnY, w: btnW, h: btnH };
  }

  drawSingleLeaderboardModal(ui) {
    const ctx = this.ctx;
    const C = this.COLORS;
    const records = Array.isArray(ui.leaderboardRecords) ? ui.leaderboardRecords : [];
    const fromGameEnd = !!ui.leaderboardFromGameEnd;
    const highlightTime = typeof ui.leaderboardHighlightTime === 'number' ? ui.leaderboardHighlightTime : null;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
    ctx.fillRect(0, 0, this.width, this.height);
    this.hitRegions.leaderboardBackdrop = fromGameEnd ? null : { x: 0, y: 0, w: this.width, h: this.height };

    const cardW = Math.min(340, this.width - 40);
    const maxCardH = Math.max(360, this.height - this.safeTop - 40);
    const cardH = Math.min(520, maxCardH);
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.clip();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('历史最高（单人）', cardX + cardW / 2, cardY + 18);

    if (ui.leaderboardHint) {
      ctx.fillStyle = C.textSub;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(ui.leaderboardHint, cardX + cardW / 2, cardY + 48);
    }

    const listX = cardX + 20;
    const listY = cardY + 78;
    const listW = cardW - 40;
    const rowH = 34;
    const maxRows = 10;
    const listInnerPad = 16;

    const btnH = 44;
    const btnY = cardY + cardH - btnH - 20;
    const listBottomGap = 14;
    const maxListH = rowH * maxRows + listInnerPad;
    const listH = Math.max(120, Math.min(maxListH, btnY - listY - listBottomGap));

    ctx.save();
    ctx.beginPath();
    this.drawRoundedRect(listX, listY, listW, listH, 14);
    ctx.fillStyle = '#F9FAFB';
    ctx.fill();
    ctx.restore();

    if (records.length === 0) {
      ctx.fillStyle = C.textSub;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无记录，完成一局单人挑战后会自动上榜', cardX + cardW / 2, listY + listH / 2);
    } else {
      let y = listY + 10;
      const visibleRows = Math.max(1, Math.min(maxRows, Math.floor((listH - listInnerPad) / rowH)));
      const shown = records.slice(0, visibleRows);
      shown.forEach((r, i) => {
        const isHighlight = highlightTime !== null && r.time === highlightTime;
        if (isHighlight) {
          ctx.save();
          ctx.fillStyle = 'rgba(0, 123, 255, 0.10)';
          this.drawRoundedRect(listX + 6, y - 2, listW - 12, rowH, 10);
          ctx.fill();
          ctx.restore();
        }

        ctx.font = '14px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = isHighlight ? C.primary : C.text;
        ctx.fillText(`#${i + 1}`, listX + 14, y + rowH / 2 - 2);

        ctx.textAlign = 'right';
        ctx.fillStyle = isHighlight ? C.primary : C.text;
        ctx.font = isHighlight ? 'bold 15px sans-serif' : '15px sans-serif';
        ctx.fillText(`${r.score} 分`, listX + listW - 14, y + rowH / 2 - 2);

        ctx.textAlign = 'center';
        ctx.fillStyle = C.textSub;
        ctx.font = '12px sans-serif';
        ctx.fillText(formatMMDD(r.time), listX + listW / 2, y + rowH / 2 - 2);

        y += rowH;
      });
    }

    if (fromGameEnd) {
      const gap = 12;
      const btnW = (cardW - 40 - gap) / 2;
      const leftX = cardX + 20;
      const rightX = leftX + btnW + gap;

      const backInset = this.pressed === 'btnLeaderboardBackToMenu' ? 2 : 0;
      ctx.save();
      ctx.fillStyle = backInset ? '#E5E7EB' : '#F3F4F6';
      this.drawRoundedRect(leftX + backInset, btnY + backInset, btnW - backInset * 2, btnH - backInset * 2, 20);
      ctx.fill();
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = 1;
      this.drawRoundedRect(leftX + backInset, btnY + backInset, btnW - backInset * 2, btnH - backInset * 2, 20);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = C.textSub;
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('返回主页', leftX + btnW / 2, btnY + btnH / 2);

      const restartInset = this.pressed === 'btnLeaderboardRestartSingle' ? 2 : 0;
      ctx.fillStyle = restartInset ? C.primaryPressed : C.primary;
      this.drawRoundedRect(rightX + restartInset, btnY + restartInset, btnW - restartInset * 2, btnH - restartInset * 2, 20);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('再来一局', rightX + btnW / 2, btnY + btnH / 2);

      this.hitRegions.btnLeaderboardBackToMenu = { x: leftX, y: btnY, w: btnW, h: btnH };
      this.hitRegions.btnLeaderboardRestartSingle = { x: rightX, y: btnY, w: btnW, h: btnH };
    } else {
      const gap = 10;
      const btnW = (cardW - 40 - gap) / 2;
      const leftX = cardX + 20;
      const rightX = leftX + btnW + gap;

      const clearInset = this.pressed === 'btnLeaderboardClear' ? 2 : 0;
      ctx.save();
      ctx.fillStyle = clearInset ? '#E5E7EB' : '#F3F4F6';
      this.drawRoundedRect(leftX + clearInset, btnY + clearInset, btnW - clearInset * 2, btnH - clearInset * 2, 20);
      ctx.fill();
      ctx.strokeStyle = '#D1D5DB';
      ctx.lineWidth = 1;
      this.drawRoundedRect(leftX + clearInset, btnY + clearInset, btnW - clearInset * 2, btnH - clearInset * 2, 20);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = C.textSub;
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('清空记录', leftX + btnW / 2, btnY + btnH / 2);

      const closeInset = this.pressed === 'btnLeaderboardClose' ? 2 : 0;
      ctx.fillStyle = closeInset ? C.primaryPressed : C.primary;
      this.drawRoundedRect(rightX + closeInset, btnY + closeInset, btnW - closeInset * 2, btnH - closeInset * 2, 20);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText('关闭', rightX + btnW / 2, btnY + btnH / 2);

      this.hitRegions.btnLeaderboardClear = { x: leftX, y: btnY, w: btnW, h: btnH };
      this.hitRegions.btnLeaderboardClose = { x: rightX, y: btnY, w: btnW, h: btnH };
    }

    if (ui.confirmClearLeaderboardOpen) {
      this.drawConfirmClearLeaderboardModal();
    }

    ctx.restore();
  }

  drawScoreQuickRefModal(ui) {
    const ctx = this.ctx;
    const C = this.COLORS;
    const anim = ui && ui.quickRefAnim ? ui.quickRefAnim : null;
    const maskAlpha = anim && typeof anim.maskAlpha === 'number' ? anim.maskAlpha : 0;
    const cardAlpha = anim && typeof anim.cardAlpha === 'number' ? anim.cardAlpha : 0;
    const cardScale = anim && typeof anim.cardScale === 'number' ? anim.cardScale : 1;

    ctx.save();
    ctx.fillStyle = `rgba(17, 24, 39, ${maskAlpha})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    this.hitRegions.quickRefBackdrop = { x: 0, y: 0, w: this.width, h: this.height };

    const maxCardW = Math.min(420, this.width * 0.86);
    const cardW = Math.max(260, this.width * 0.82, Math.min(maxCardW, this.width - 40));
    const maxCardH = Math.floor(this.height * 0.7);
    const lines = [
      { type: 'title', text: '计分速查' },
      { type: 'section', text: '数字区' },
      { type: 'row', left: '一点', right: '所有 1 的点数之和' },
      { type: 'row', left: '二点', right: '所有 2 的点数之和' },
      { type: 'row', left: '三点', right: '所有 3 的点数之和' },
      { type: 'row', left: '四点', right: '所有 4 的点数之和' },
      { type: 'row', left: '五点', right: '所有 5 的点数之和' },
      { type: 'row', left: '六点', right: '所有 6 的点数之和' },
      { type: 'section', text: '组合区' },
      { type: 'row', left: '三条', right: '≥ 3 相同 → 总和' },
      { type: 'row', left: '四条', right: '≥ 4 相同 → 总和' },
      { type: 'row', left: '葫芦', right: '3 + 2 → 固定 25 分' },
      { type: 'row', left: '小顺', right: '4 连号 → 固定 30 分' },
      { type: 'row', left: '大顺', right: '5 连号 → 固定 40 分' },
      { type: 'row', left: '快艇', right: '5 相同 → 固定 50 分' },
      { type: 'row', left: '全选', right: '任意 → 总和' }
    ];

    const paddingX = 24;
    const paddingTop = 20;
    const paddingBottom = 24;
    const titleH = 40; // 增加标题高度，留出分隔线空间
    const sectionH = 32; // 增加分区标题高度（含上方间距）
    const rowH = 22; // 行高略微增加以容纳更好的字间距
    // 重新计算总高度
    // 标题(1) + 分区(2) + 行(13)
    const contentH = titleH + sectionH * 2 + rowH * 13 + 4; 
    const cardH = Math.min(maxCardH, Math.max(260, contentH + paddingTop + paddingBottom));

    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    const cx = cardX + cardW / 2;
    const cy = cardY + cardH / 2;

    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.translate(cx, cy);
    ctx.scale(cardScale, cardScale);
    ctx.translate(-cx, -cy);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 16); // 圆角稍微减小一点，更硬朗
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 16);
    ctx.clip();

    let y = cardY + paddingTop;
    
    // 标题
    ctx.fillStyle = '#111827'; // 更深的黑色
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('计分速查', cardX + cardW / 2, y);
    
    // 标题下分隔线
    ctx.beginPath();
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = 1;
    ctx.moveTo(cardX + 20, y + 30);
    ctx.lineTo(cardX + cardW - 20, y + 30);
    ctx.stroke();
    
    y += titleH;

    const leftX = cardX + paddingX;
    // 计算右侧内容的起始 x 坐标（左侧标签宽度 + 间距）
    const leftColW = 50; 
    const rightX = leftX + leftColW;

    const drawSection = (text) => {
      // 分区标题上方多留点空
      y += 8;
      
      ctx.fillStyle = '#9CA3AF'; // 浅灰
      ctx.font = '12px sans-serif'; // 字号略小
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(text, leftX, y);
      
      y += (sectionH - 8);
    };

    const drawRow = (left, right) => {
      // 左侧：计分项名称（深色、加粗）
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#374151'; // 深灰
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(left, leftX, y);
      
      // 右侧：规则说明（中灰、常规）
      ctx.font = '13px sans-serif'; // 略小
      ctx.fillStyle = '#6B7280'; // 中灰
      ctx.fillText(right, rightX, y);
      
      y += rowH;
    };

    for (const line of lines) {
      if (line.type === 'section') drawSection(line.text);
      else if (line.type === 'row') drawRow(line.left, line.right);
    }

    ctx.restore();
    ctx.restore();

    this.hitRegions.quickRefCard = { x: cardX, y: cardY, w: cardW, h: cardH };
  }

  drawConfirmBackToMenuModal() {
    const ctx = this.ctx;
    const C = this.COLORS;

    ctx.fillStyle = 'rgba(17, 24, 39, 0.58)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cardW = Math.min(320, this.width - 48);
    const cardH = 200;
    const cardX = (this.width - cardW) / 2;
    const cardY = (this.height - cardH) / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.10)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = '#FFFFFF';
    this.drawRoundedRect(cardX, cardY, cardW, cardH, 22);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = C.text;
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('这局还没结束哦', cardX + cardW / 2, cardY + 18);

    ctx.fillStyle = C.textSub;
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
        ctx.fillStyle = inset ? '#E5E7EB' : '#F3F4F6';
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.fill();
        ctx.strokeStyle = '#D1D5DB';
        ctx.lineWidth = 1;
        this.drawRoundedRect(rx, ry, rw, rh, 14);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = C.textSub;
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

  renderMenu(ui) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);

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

    const onlineY = startY + btnH + gap;
    const onlineInset = this.pressed === 'btnOnlineBattle' ? 2 : 0;

    ctx.save();
    if (onlineInset === 0) {
      ctx.shadowColor = 'rgba(40, 167, 69, 0.25)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
    }
    ctx.fillStyle = this.pressed === 'btnOnlineBattle' ? C.successPressed : C.success;
    this.drawRoundedRect(x + onlineInset, onlineY + onlineInset, btnW - onlineInset * 2, btnH - onlineInset * 2, 28);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('联机对战', x + btnW / 2, onlineY + btnH / 2);
    this.hitRegions.btnOnlineBattle = { x, y: onlineY, w: btnW, h: btnH };

    // 游戏规则（描边/浅色）
    const rulesY = onlineY + btnH + gap;
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

    const label = '单人榜';
    const pillH = 32;
    const pillPadX = 14;
    const pillRightInset = 22;
    const pillBaseBottomInset = 36;
    const pillBottomInset = pillBaseBottomInset + (this.safeBottom || 0);

    ctx.font = '13px sans-serif';
    const textW = ctx.measureText(label).width;
    const pillW = Math.max(72, Math.ceil(textW + pillPadX * 2));
    const pillX = this.width - pillRightInset - pillW;
    const pillY = this.height - pillBottomInset - pillH;
    const r = pillH / 2;

    ctx.save();
    if (this.pressed !== 'btnLeaderboardMenu') {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
    }
    ctx.fillStyle = this.pressed === 'btnLeaderboardMenu' ? '#F3F4F6' : '#FFFFFF';
    this.drawRoundedRect(pillX, pillY, pillW, pillH, r);
    ctx.fill();
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 1;
    this.drawRoundedRect(pillX, pillY, pillW, pillH, r);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#374151';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2);
    this.hitRegions.btnLeaderboardMenu = { x: pillX, y: pillY, w: pillW, h: pillH };

  }

  renderLobby(ui) {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);

    const lobby = (ui && ui.lobby) || {}
    const roomId = lobby.roomId || ''
    const room = lobby.room || null
    const self = lobby.self || {}
    const creating = !!lobby.creating
    const joining = !!lobby.joining

    const headerY = this.safeTop + 18
    ctx.fillStyle = C.text
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('房间等待', this.width / 2, headerY)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '14px sans-serif'
    ctx.fillText('邀请好友加入后由房主开始', this.width / 2, headerY + 34)

    const cardW = Math.min(340, this.width - 48)
    const cardX = (this.width - cardW) / 2
    let y = headerY + 74

    const roomCardH = 92
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, 0.06)'
    ctx.shadowBlur = 14
    ctx.shadowOffsetY = 6
    ctx.fillStyle = '#FFFFFF'
    this.drawRoundedRect(cardX, y, cardW, roomCardH, 16)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#6B7280'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('房间号', cardX + 16, y + 14)

    ctx.fillStyle = C.text
    ctx.font = 'bold 30px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const roomIdText = roomId ? roomId : (creating ? '创建中…' : '——')
    ctx.fillText(roomIdText, cardX + 16, y + 62)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText((room && room.status) ? `状态：${room.status}` : '状态：—', cardX + cardW - 16, y + 62)

    y += roomCardH + 16

    const seatH = 64
    const seatGap = 12
    const seats = room && Array.isArray(room.seats) ? room.seats : []
    for (let i = 0; i < 2; i++) {
      const s = seats[i] || {}
      const joined = !!s.uid
      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.05)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
      ctx.fillStyle = '#FFFFFF'
      this.drawRoundedRect(cardX, y, cardW, seatH, 14)
      ctx.fill()
      ctx.restore()

      ctx.fillStyle = '#6B7280'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(i === 0 ? '座位 1' : '座位 2', cardX + 16, y + 14)

      ctx.fillStyle = C.text
      ctx.font = 'bold 16px sans-serif'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(joined ? (s.name || (i === 0 ? '玩家1' : '玩家2')) : '等待加入', cardX + 16, y + 46)

      ctx.textAlign = 'right'
      const online = joined ? !!s.online : false
      ctx.fillStyle = joined ? (online ? '#16A34A' : '#F97316') : '#9CA3AF'
      ctx.font = '13px sans-serif'
      ctx.fillText(joined ? (online ? '在线' : '离线') : '等待加入', cardX + cardW - 16, y + 42)

      if (self && self.seatIndex === i) {
        ctx.fillStyle = '#3B82F6'
        ctx.font = '12px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText('你', cardX + cardW - 16, y + 20)
      }

      y += seatH + seatGap
    }

    y += 8

    const btnW = cardW
    const btnH = 48
    const btnX = cardX
    const btnGap = 12

    const shareInset = this.pressed === 'btnLobbyShare' ? 2 : 0
    ctx.save()
    if (shareInset === 0) {
      ctx.shadowColor = 'rgba(0, 123, 255, 0.25)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
    }
    ctx.fillStyle = this.pressed === 'btnLobbyShare' ? C.primaryPressed : C.primary
    this.drawRoundedRect(btnX + shareInset, y + shareInset, btnW - shareInset * 2, btnH - shareInset * 2, 18)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('分享邀请', btnX + btnW / 2, y + btnH / 2)
    this.hitRegions.btnLobbyShare = { x: btnX, y, w: btnW, h: btnH }

    y += btnH + btnGap

    const canStart = !!(room && room.status === 'waiting' && room.seats && room.seats[0] && room.seats[0].uid && room.seats[0].online && room.seats[1] && room.seats[1].uid && room.seats[1].online && lobby.self && lobby.self.isOwner)
    const startInset = this.pressed === 'btnLobbyStart' ? 2 : 0
    ctx.save()
    if (!canStart) ctx.globalAlpha = 0.5
    if (startInset === 0) {
      ctx.shadowColor = 'rgba(40, 167, 69, 0.25)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
    }
    ctx.fillStyle = this.pressed === 'btnLobbyStart' ? C.successPressed : C.success
    this.drawRoundedRect(btnX + startInset, y + startInset, btnW - startInset * 2, btnH - startInset * 2, 18)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('开始', btnX + btnW / 2, y + btnH / 2)
    this.hitRegions.btnLobbyStart = { x: btnX, y, w: btnW, h: btnH }

    y += btnH + btnGap

    const exitInset = this.pressed === 'btnLobbyExit' ? 2 : 0
    ctx.save()
    ctx.fillStyle = exitInset ? '#E5E7EB' : '#F3F4F6'
    this.drawRoundedRect(btnX + exitInset, y + exitInset, btnW - exitInset * 2, btnH - exitInset * 2, 18)
    ctx.fill()
    ctx.strokeStyle = '#D1D5DB'
    ctx.lineWidth = 1
    this.drawRoundedRect(btnX + exitInset, y + exitInset, btnW - exitInset * 2, btnH - exitInset * 2, 18)
    ctx.stroke()
    ctx.restore()

    ctx.fillStyle = C.textSub
    ctx.font = '16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('退出', btnX + btnW / 2, y + btnH / 2)
    this.hitRegions.btnLobbyExit = { x: btnX, y, w: btnW, h: btnH }

    const drawWrappedText = (text, cx, baseY, maxW, lineH, maxLines) => {
      const s = String(text || '').trim()
      if (!s) return
      const lines = []
      let cur = ''
      for (let i = 0; i < s.length; i++) {
        const ch = s[i]
        const next = cur + ch
        if (ctx.measureText(next).width > maxW && cur) {
          lines.push(cur)
          cur = ch
          if (lines.length >= maxLines) break
        } else {
          cur = next
        }
      }
      if (cur && lines.length < maxLines) lines.push(cur)
      const startY = baseY - lineH * (lines.length - 1)
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, startY + lineH * i)
      }
    }

    const errorText = lobby.error || ''
    if (errorText) {
      ctx.fillStyle = '#DC2626'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      const baseY = Math.min(this.height - (this.safeBottom || 0) - 16, y + btnH + 26)
      drawWrappedText(errorText, this.width / 2, baseY, Math.max(160, this.width - 32), 16, 3)
    } else if (joining) {
      ctx.fillStyle = '#9CA3AF'
      ctx.font = '13px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText('正在加入房间…', this.width / 2, Math.min(this.height - (this.safeBottom || 0) - 16, y + btnH + 26))
    }
  }

  renderRules() {
    const ctx = this.ctx;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);

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

  drawStatusCard(state, ui) {
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
    const showLeaderboardBtn = state.players.length === 1;
    let rightPadding = 20;
    if (showLeaderboardBtn) {
      const btnW = 44;
      const btnH = 24;
      const btnX = cardX + cardW - 20 - btnW;
      const btnY = cardY + 18;
      const inset = this.pressed === 'btnLeaderboardGame' ? 1 : 0;

      ctx.save();
      ctx.fillStyle = this.pressed === 'btnLeaderboardGame' ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.75)';
      this.drawRoundedRect(btnX + inset, btnY + inset, btnW - inset * 2, btnH - inset * 2, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(107, 114, 128, 0.35)';
      ctx.lineWidth = 1;
      this.drawRoundedRect(btnX + inset, btnY + inset, btnW - inset * 2, btnH - inset * 2, 12);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = C.text;
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('榜', btnX + btnW / 2, btnY + btnH / 2);

      this.hitRegions.btnLeaderboardGame = { x: btnX, y: btnY, w: btnW, h: btnH };
      rightPadding = 20 + btnW + 10;
    }

    const roomId = ui && ui.lobby && ui.lobby.roomId ? String(ui.lobby.roomId) : ''
    if (roomId) {
      ctx.textAlign = 'right';
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText(`房间 ${roomId}`, cardX + cardW - rightPadding, cardY + 16);
    }

    ctx.textAlign = 'right';
    ctx.font = '16px sans-serif';
    ctx.fillStyle = C.textSub;
    ctx.fillText(`第 ${state.round} / 13 轮`, cardX + cardW - rightPadding, cardY + 30);
    
    // 分隔线
    ctx.beginPath();
    ctx.strokeStyle = '#F3F4F6';
    ctx.lineWidth = 1;
    ctx.moveTo(cardX + 20, cardY + 50);
    ctx.lineTo(cardX + cardW - 20, cardY + 50);
    ctx.stroke();
    
    const seatIndex = ui && ui.lobby && ui.lobby.self && typeof ui.lobby.self.seatIndex === 'number' ? ui.lobby.self.seatIndex : -1
    const onlineWaiting = seatIndex >= 0 && typeof state.currentPlayerIndex === 'number' && state.currentPlayerIndex !== seatIndex
    const roomSeats = ui && ui.lobby && ui.lobby.room && Array.isArray(ui.lobby.room.seats) ? ui.lobby.room.seats : null
    const peer = (seatIndex >= 0 && roomSeats && roomSeats.length >= 2) ? roomSeats[seatIndex === 0 ? 1 : 0] : null
    const peerOffline = !!(peer && peer.uid && peer.online === false)

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
    if (peerOffline) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#F97316';
      ctx.font = '14px sans-serif';
      ctx.fillText('对方离线', cardX + cardW - 20, row2Y);
    } else if (onlineWaiting) {
      ctx.textAlign = 'right';
      ctx.fillStyle = C.textSub;
      ctx.font = '14px sans-serif';
      ctx.fillText('等待对方操作', cardX + cardW - 20, row2Y);
    } else if (isRolling) {
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

  drawDiceArea(state, ui, animState) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    const seatIndex = ui && ui.lobby && ui.lobby.self && typeof ui.lobby.self.seatIndex === 'number' ? ui.lobby.self.seatIndex : -1
    const onlineWaiting = seatIndex >= 0 && typeof state.currentPlayerIndex === 'number' && state.currentPlayerIndex !== seatIndex
    
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
      if (!onlineWaiting && !(animState && animState.active) && state.phase === Phase.ROLLING) {
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
      if (isAnimating || onlineWaiting) {
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
      
      if (!isAnimating && !onlineWaiting) {
        this.hitRegions.btnRoll = { x: rollX, y: btnY, w: rollBtnW, h: L.BTN_H };
      }
      
      // --- 选分按钮 (绿色，仅当 showStop) ---
      if (showStop) {
        const stopX = rollX + rollBtnW + gap;
        const stopInset = this.pressed === 'btnStop' ? 2 : 0;
        
        ctx.save();
        if (isAnimating || onlineWaiting) ctx.globalAlpha = 0.6;
        
        ctx.fillStyle = this.pressed === 'btnStop' ? C.successPressed : C.success;
        this.drawRoundedRect(stopX + stopInset, btnY + stopInset, L.BTN_W - stopInset * 2, L.BTN_H - stopInset * 2, 22);
        ctx.fill();
        ctx.restore();
        
        ctx.fillStyle = '#fff';
        ctx.fillText('选择计分', stopX + L.BTN_W / 2, btnY + L.BTN_H / 2);
      
        if (!isAnimating && !onlineWaiting) {
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
       if (isAnimating || onlineWaiting) ctx.globalAlpha = 0.6;

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
       
       if (!isAnimating && !onlineWaiting) {
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

  drawScoreCard(state, ui) {
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

    ctx.save();
    const iconSize = 15;
    const iconR = 10;
    const iconX = cardX + 26;
    const iconY = cardY + 20;
    const iconKey = 'btnScoreQuickRef';
    const pressed = this.pressed === iconKey;

    if (pressed) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.beginPath();
      ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = pressed ? 0.75 : 1;
    ctx.fillStyle = '#6B7280';
    ctx.font = `${iconSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', iconX, iconY);
    ctx.restore();

    this.hitRegions.btnScoreQuickRef = { x: iconX - 16, y: iconY - 16, w: 32, h: 32 };
    
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
      const seatIndex = ui && ui.lobby && ui.lobby.self && typeof ui.lobby.self.seatIndex === 'number' ? ui.lobby.self.seatIndex : -1
      const onlineWaiting = seatIndex >= 0 && typeof state.currentPlayerIndex === 'number' && state.currentPlayerIndex !== seatIndex
      const isSelectable = state.phase === Phase.SELECT_SCORE && opt.enabled && !onlineWaiting;
      
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

  renderGame(state, ui, animState) {
    const ctx = this.ctx;
    const L = this.LAYOUT;
    const C = this.COLORS;
    this.resetHitRegions();

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    
    // 2. 绘制三段式布局
    this.drawStatusCard(state, ui);
    this.drawDiceArea(state, ui, animState);
    this.drawScoreCard(state, ui);
    
    // 4. 回合结束/游戏结束 遮罩层 (保持原有逻辑)
    if (state.phase === Phase.TURN_END) {
      const subTitle = state.players.length === 1 ? '正在进入下一回合...' : '正在切换下一位玩家...';
      this.drawOverlay('回合结束', subTitle);
    }

    if (state.phase === Phase.GAME_END) {
      this.renderGameEnd(state);
    } else {
      this.hitRegions.btnRestart = null;
    }

    if (ui && ui.confirmBackToMenuOpen) {
      this.drawConfirmBackToMenuModal();
    }

    if (ui && ui.leaderboardOpen) {
      this.drawSingleLeaderboardModal(ui);
    }

    if (ui && ui.quickRefVisible) {
      this.drawScoreQuickRefModal(ui);
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
    
    const btnH = 48;
    const gap = 12;
    const btnW = (cardW - 80 - gap) / 2;
    const btnY = cardY + cardH - btnH - 30;
    const leftX = cardX + 40;
    const rightX = leftX + btnW + gap;

    const backInset = this.pressed === 'btnBackToMenuEnd' ? 2 : 0;
    ctx.save();
    ctx.fillStyle = backInset ? '#E5E7EB' : '#F3F4F6';
    this.drawRoundedRect(leftX + backInset, btnY + backInset, btnW - backInset * 2, btnH - backInset * 2, 24);
    ctx.fill();
    ctx.strokeStyle = '#D1D5DB';
    ctx.lineWidth = 1;
    this.drawRoundedRect(leftX + backInset, btnY + backInset, btnW - backInset * 2, btnH - backInset * 2, 24);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = C.textSub;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('返回主菜单', leftX + btnW / 2, btnY + btnH / 2);

    const restartInset = this.pressed === 'btnRestart' ? 2 : 0;
    ctx.fillStyle = restartInset ? C.primaryPressed : C.primary;
    this.drawRoundedRect(rightX + restartInset, btnY + restartInset, btnW - restartInset * 2, btnH - restartInset * 2, 24);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('再来一局', rightX + btnW / 2, btnY + btnH / 2);

    this.hitRegions.btnBackToMenuEnd = { x: leftX, y: btnY, w: btnW, h: btnH };
    this.hitRegions.btnRestart = { x: rightX, y: btnY, w: btnW, h: btnH };
  }
}
