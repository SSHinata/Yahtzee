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
    } else if (this.main.ui && this.main.ui.onlineEntryOpen) {
      keys.push('btnOnlineCreate', 'btnOnlineJoin', 'btnOnlineEntryCancel', 'onlineEntryBackdrop');
    } else if (this.main.ui && this.main.ui.modeSelectOpen) {
      keys.push('btnModeLocal2p', 'btnModeSingle', 'btnModeCancel', 'modeSelectBackdrop');
    } else if (this.main.ui && this.main.ui.leaderboardOpen) {
      if (this.main.ui.confirmClearLeaderboardOpen) {
        keys.push('confirmClearCancel', 'confirmClearConfirm');
      } else {
        keys.push(
          'btnLeaderboardRestartSingle',
          'btnLeaderboardBackToMenu',
          'btnLeaderboardClear',
          'btnLeaderboardClose',
          'leaderboardBackdrop'
        );
      }
    } else if (this.main.ui && this.main.ui.quickRefVisible) {
      keys.push('quickRefCard', 'quickRefBackdrop');
    } else if (s === 'lobby') {
      keys.push('btnLobbyShare', 'btnLobbyStart', 'btnLobbyExit');
    } else if (s === 'menu') {
      keys.push('btnStartGame', 'btnOnlineBattle', 'btnRules', 'btnLeaderboardMenu');
    } else if (s === 'rules') {
      keys.push('btnBackToMenu', 'btnStartGameRule');
    } else {
      keys.push('btnBackToMenu', 'btnRoll', 'btnStop', 'btnCancelScore', 'btnRestart', 'btnBackToMenuEnd', 'btnLeaderboardGame');
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
        else if (key === 'btnOnlineBattle') this.main.openOnlineEntry();
        else if (key === 'btnRules') this.main.goRules();
        else if (key === 'btnLeaderboardMenu' || key === 'btnLeaderboardGame') this.main.openSingleLeaderboard();
        else if (key === 'btnBackToMenu') this.main.handleBackToMenu();
        else if (key === 'btnBackToMenuEnd') this.main.handleBackToMenuFromGameEnd();
        else if (key === 'btnRoll') this.main.handleRoll();
        else if (key === 'btnStop') this.main.handleStopRolling();
        else if (key === 'btnCancelScore') this.main.handleCancelScoreSelection();
        else if (key === 'btnRestart') this.main.handleRestart();
        else if (key === 'btnLobbyShare') this.main.lobbyShare();
        else if (key === 'btnLobbyStart') this.main.lobbyStart();
        else if (key === 'btnLobbyExit') this.main.lobbyExit();
        else if (key === 'modalCancel') this.main.handleCancelBackToMenu();
        else if (key === 'modalConfirm') this.main.handleConfirmBackToMenu();
        else if (key === 'btnModeLocal2p') this.main.startGameWithMode('local2p');
        else if (key === 'btnModeSingle') this.main.startGameWithMode('single');
        else if (key === 'btnModeCancel' || key === 'modeSelectBackdrop') this.main.closeModeSelect();
        else if (key === 'btnLeaderboardClose' || key === 'leaderboardBackdrop') this.main.closeSingleLeaderboard();
        else if (key === 'btnLeaderboardClear') this.main.requestClearSingleLeaderboard();
        else if (key === 'confirmClearCancel') this.main.cancelClearSingleLeaderboard();
        else if (key === 'confirmClearConfirm') this.main.confirmClearSingleLeaderboard();
        else if (key === 'btnLeaderboardRestartSingle') this.main.restartSingleChallengeFromLeaderboard();
        else if (key === 'btnLeaderboardBackToMenu') this.main.backToMenuFromLeaderboard();
        else if (key === 'quickRefCard') {}
        else if (key === 'quickRefBackdrop') this.main.closeQuickRef();
        else if (key === 'btnOnlineCreate') this.main.onlineEntryCreateRoom();
        else if (key === 'btnOnlineJoin') this.main.onlineEntryJoinRoom();
        else if (key === 'btnOnlineEntryCancel' || key === 'onlineEntryBackdrop') this.main.closeOnlineEntry();
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

    if (this.main.ui && this.main.ui.onlineEntryOpen) {
      if (regions.btnOnlineCreate && this.isHit(x, y, regions.btnOnlineCreate)) {
        this.main.onlineEntryCreateRoom();
        return;
      }
      if (regions.btnOnlineJoin && this.isHit(x, y, regions.btnOnlineJoin)) {
        this.main.onlineEntryJoinRoom();
        return;
      }
      if (regions.btnOnlineEntryCancel && this.isHit(x, y, regions.btnOnlineEntryCancel)) {
        this.main.closeOnlineEntry();
        return;
      }
      if (regions.onlineEntryBackdrop && this.isHit(x, y, regions.onlineEntryBackdrop)) {
        this.main.closeOnlineEntry();
        return;
      }
      return;
    }

    if (this.main.ui && this.main.ui.modeSelectOpen) {
      if (regions.btnModeLocal2p && this.isHit(x, y, regions.btnModeLocal2p)) {
        this.main.startGameWithMode('local2p');
        return;
      }
      if (regions.btnModeSingle && this.isHit(x, y, regions.btnModeSingle)) {
        this.main.startGameWithMode('single');
        return;
      }
      if (regions.btnModeCancel && this.isHit(x, y, regions.btnModeCancel)) {
        this.main.closeModeSelect();
        return;
      }
      if (regions.modeSelectBackdrop && this.isHit(x, y, regions.modeSelectBackdrop)) {
        this.main.closeModeSelect();
        return;
      }
      return;
    }

    if (this.main.ui && this.main.ui.leaderboardOpen) {
      if (this.main.ui.confirmClearLeaderboardOpen) {
        if (regions.confirmClearCancel && this.isHit(x, y, regions.confirmClearCancel)) {
          this.main.cancelClearSingleLeaderboard();
          return;
        }
        if (regions.confirmClearConfirm && this.isHit(x, y, regions.confirmClearConfirm)) {
          this.main.confirmClearSingleLeaderboard();
          return;
        }
        return;
      }

      if (regions.btnLeaderboardRestartSingle && this.isHit(x, y, regions.btnLeaderboardRestartSingle)) {
        this.main.restartSingleChallengeFromLeaderboard();
        return;
      }
      if (regions.btnLeaderboardBackToMenu && this.isHit(x, y, regions.btnLeaderboardBackToMenu)) {
        this.main.backToMenuFromLeaderboard();
        return;
      }
      if (regions.btnLeaderboardClear && this.isHit(x, y, regions.btnLeaderboardClear)) {
        this.main.requestClearSingleLeaderboard();
        return;
      }
      if (regions.btnLeaderboardClose && this.isHit(x, y, regions.btnLeaderboardClose)) {
        this.main.closeSingleLeaderboard();
        return;
      }
      if (regions.leaderboardBackdrop && this.isHit(x, y, regions.leaderboardBackdrop)) {
        this.main.closeSingleLeaderboard();
        return;
      }
      return;
    }

    if (this.main.ui && this.main.ui.quickRefVisible) {
      if (regions.quickRefCard && this.isHit(x, y, regions.quickRefCard)) return;
      if (regions.quickRefBackdrop && this.isHit(x, y, regions.quickRefBackdrop)) this.main.closeQuickRef();
      return;
    }

    if (screen === 'menu') {
      if (regions.btnStartGame && this.isHit(x, y, regions.btnStartGame)) {
        this.main.startGame();
        return;
      }
      if (regions.btnOnlineBattle && this.isHit(x, y, regions.btnOnlineBattle)) {
        this.main.openOnlineEntry();
        return;
      }
      if (regions.btnRules && this.isHit(x, y, regions.btnRules)) {
        this.main.goRules();
        return;
      }
      if (regions.btnLeaderboardMenu && this.isHit(x, y, regions.btnLeaderboardMenu)) {
        this.main.openSingleLeaderboard();
        return;
      }
      return;
    }

    if (screen === 'lobby') {
      if (regions.btnLobbyShare && this.isHit(x, y, regions.btnLobbyShare)) {
        this.main.lobbyShare();
        return;
      }
      if (regions.btnLobbyStart && this.isHit(x, y, regions.btnLobbyStart)) {
        this.main.lobbyStart();
        return;
      }
      if (regions.btnLobbyExit && this.isHit(x, y, regions.btnLobbyExit)) {
        this.main.lobbyExit();
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

    if (regions.btnScoreQuickRef && this.isHit(x, y, regions.btnScoreQuickRef)) {
      this.main.openQuickRef();
      return;
    }
    
    if (regions.btnLeaderboardGame && this.isHit(x, y, regions.btnLeaderboardGame)) {
      this.main.openSingleLeaderboard();
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

    if (regions.btnBackToMenuEnd && this.isHit(x, y, regions.btnBackToMenuEnd)) {
      this.main.handleBackToMenuFromGameEnd();
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
