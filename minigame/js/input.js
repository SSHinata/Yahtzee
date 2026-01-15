export default class InputHandler {
  constructor(main) {
    this.main = main;
    
    wx.onTouchStart((e) => {
      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;
      this.handleTap(x, y);
    });
  }

  handleTap(x, y) {
    const regions = this.main.renderer.hitRegions;
    
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
