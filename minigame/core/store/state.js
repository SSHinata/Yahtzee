/**
 * 简单的全局状态管理
 * V0 版本直接使用单例模式存储
 */

let globalState = null;
let listeners = [];

/**
 * 初始化状态
 */
function setGlobalState(newState) {
  globalState = newState;
  notifyListeners();
}

/**
 * 获取当前状态
 */
function getGlobalState() {
  return globalState;
}

/**
 * 订阅状态变更（可选，用于跨页面同步）
 */
function subscribe(listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

function notifyListeners() {
  listeners.forEach(l => l(globalState));
}

module.exports = {
  setGlobalState,
  getGlobalState,
  subscribe
};
