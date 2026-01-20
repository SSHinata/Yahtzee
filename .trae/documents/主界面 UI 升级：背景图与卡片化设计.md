## 实现方案

### 1. 加载背景资源

* 在 `Main` 类中预加载背景图片 `resources/img/indexBg1.png`。

* 确保图片加载完成后能被渲染器使用。

### 2. 改造 `Renderer` 的 `renderMenu` 方法

按照设计文档重构主界面绘制逻辑：

* **背景层**：绘制 `indexBg1.png`，铺满屏幕（保持比例或拉伸，视需求而定，通常背景图做全屏拉伸或 `cover` 适配）。

* **标题区（卡片化）**：

  * 绘制一个半透明白色圆角卡片（`rgba(255, 255, 255, 0.8)` + 轻微投影）。

  * 在卡片内绘制主标题“骰来骰去”和副标题“掷骰计分对战”。

  * 位置：屏幕上半部分居中。

* **按钮区**：

  * **开始游戏**：高饱和度蓝色实心按钮 + 投影。

  * **游戏规则**：描边或浅色填充按钮，位于开始游戏下方。

  * 位置：标题区正下方，留出呼吸感间距。

## 修改文件

* [minigame/js/main.js](file:///Users/pitaya/workspace/Yahtzee/minigame/js/main.js)：加载图片资源。

* [minigame/js/render.js](file:///Users/pitaya/workspace/Yahtzee/minigame/js/render.js)：实现新的 UI 绘制逻辑（背景图、卡片样式、新按钮样式）。

## 验证

* 启动游戏，主界面应显示背景图。

* 标题应有底板卡片，文字清晰。

* 按钮样式应符合“主次分明”的设计要求。

