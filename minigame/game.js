import Main from './js/main';

if (wx && wx.cloud && typeof wx.cloud.init === 'function') {
  wx.cloud.init({
    env: 'cloud1-2g2pn7fvfec40ab5',
    traceUser: true
  });

  if (typeof wx.cloud.callFunction === 'function') {
    wx.cloud.callFunction({
      name: 'ping',
      data: { t: Date.now() }
    }).then((res) => {
      console.log('[cloud] ping ok:', res && res.result);
    }).catch((err) => {
      console.error('[cloud] ping failed:', err);
    });
  }
}

new Main();
