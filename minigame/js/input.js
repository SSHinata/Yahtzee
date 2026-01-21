export default class InputHandler {
  constructor(main) {
    this.main = main;
    this.activeKey = null;
    this.touchStart = null;

    wx.onTouchStart((e) => {
      const t = e.touches[0];
      const x = t.clientX;
      const y = t.clientY;
      this.handleTouchStart(x, y);
    });

    wx.onTouchEnd((e) => {
      const t = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : { clientX: 0, clientY: 0 };
      const x = t.clientX;
      const y = t.clientY;
      this.handleTouchEnd(x, y);
    });

    wx.onTouchCancel(() => {
      this.activeKey = null;
      this.touchStart = null;
      this.main.clearPressedKey();
    });
  }

  getRegionByKey(regions, key) {
    if (!key) return null;
    return regions[key] || null;
  }

  findButtonKeyAt(x, y) {
    const r = this.main.renderer.hitRegions;
    const s = this.main.screen;
    const keys = [];
    if (this.main.ui && this.main.ui.confirmBackToMenuOpen) {
      keys.push('modalCancel', 'modalConfirm');
    } else
    if (s === 'menu') {
      keys.push('btnStartGame', 'btnRules');
    } else if (s === 'rules') {
      keys.push('btnBackToMenu', 'btnStartGameRule');
    } else {
      keys.push('btnBackToMenu', 'btnRoll', 'btnStop', 'btnCancelScore', 'btnRestart');
    }
    for (const k of keys) {
      const rect = r[k];
      if (rect && this.isHit(x, y, rect)) return k;
    }
    return null;
  }

  handleTouchStart(x, y) {
    this.touchStart = { x, y };
    const key = this.findButtonKeyAt(x, y);
    if (key) {
      this.activeKey = key;
      this.main.setPressedKey(key);
      return;
    }
  }

  handleTouchEnd(x, y) {
    if (this.activeKey) {
      const rect = this.getRegionByKey(this.main.renderer.hitRegions, this.activeKey);
      const inside = rect && this.isHit(x, y, rect);
      const key = this.activeKey;
      this.activeKey = null;
      this.main.clearPressedKey();
      if (inside) {
        if (key === 'btnStartGame' || key === 'btnStartGameRule') this.main.startGame();
        else if (key === 'btnRules') this.main.goRules();
        else if (key === 'btnBackToMenu') this.main.handleBackToMenu();
        else if (key === 'btnRoll') this.main.handleRoll();
        else if (key === 'btnStop') this.main.handleStopRolling();
        else if (key === 'btnCancelScore') this.main.handleCancelScoreSelection();
        else if (key === 'btnRestart') this.main.handleRestart();
        else if (key === 'modalCancel') this.main.handleCancelBackToMenu();
        else if (key === 'modalConfirm') this.main.handleConfirmBackToMenu();
        this.touchStart = null;
        return;
      }
    }
    const start = this.touchStart;
    this.touchStart = null;
    if (!start) return;

    const dx = x - start.x;
    const dy = y - start.y;
    const moved = Math.sqrt(dx * dx + dy * dy);
    if (moved > 10) return;

    this.handleTap(x, y);
  }

  handleTap(x, y) {
    const regions = this.main.renderer.hitRegions;
    const screen = this.main.screen;

    if (regions.debugCopy && this.isHit(x, y, regions.debugCopy)) {
      this.main.copyDebugInfo();
      return;
    }
    if (regions.debugPanel && this.isHit(x, y, regions.debugPanel)) {
      this.main.toggleDebugPanel();
      return;
    }

    if (this.main.ui && this.main.ui.confirmBackToMenuOpen) {
      if (regions.modalCancel && this.isHit(x, y, regions.modalCancel)) {
        this.main.handleCancelBackToMenu();
        return;
      }
      if (regions.modalConfirm && this.isHit(x, y, regions.modalConfirm)) {
        this.main.handleConfirmBackToMenu();
        return;
      }
      return;
    }

    if (screen === 'menu') {
      if (regions.btnStartGame && this.isHit(x, y, regions.btnStartGame)) {
        this.main.startGame();
        return;
      }
      if (regions.btnRules && this.isHit(x, y, regions.btnRules)) {
        this.main.goRules();
        return;
      }
      return;
    }

    if (screen === 'rules') {
      if (regions.btnBackToMenu && this.isHit(x, y, regions.btnBackToMenu)) {
        this.main.goMenu();
        return;
      }
      if (regions.btnStartGameRule && this.isHit(x, y, regions.btnStartGameRule)) {
        this.main.startGame();
        return;
      }
      return;
    }

    if (regions.btnBackToMenu && this.isHit(x, y, regions.btnBackToMenu)) {
      this.main.handleBackToMenu();
      return;
    }
    
    // 1. 检查 Dice 点击
    for (const r of regions.dice) {
      if (this.isHit(x, y, r)) {
        this.main.handleToggleHold(r.index);
        return;
      }
    }
    
    // 2. 检查按钮点击
    if (regions.btnRoll && this.isHit(x, y, regions.btnRoll)) {
      this.main.handleRoll();
      return;
    }
    
    if (regions.btnStop && this.isHit(x, y, regions.btnStop)) {
      this.main.handleStopRolling();
      return;
    }

    if (regions.btnCancelScore && this.isHit(x, y, regions.btnCancelScore)) {
      this.main.handleCancelScoreSelection();
      return;
    }

    if (regions.btnRestart && this.isHit(x, y, regions.btnRestart)) {
      this.main.handleRestart();
      return;
    }
    
    // 3. 检查计分格点击
    for (const r of regions.scoreCells) {
      if (this.isHit(x, y, r)) {
        this.main.handleApplyScore(r.key);
        return;
      }
    }
  }

  isHit(x, y, rect) {
    return x >= rect.x && x <= rect.x + rect.w &&
           y >= rect.y && y <= rect.y + rect.h;
  }
}
