# Music Universe

> 留一点空间，给音乐。清新的本地播放器、深色双 Deck 工作台和音乐时钟驱动的音游。

React + TypeScript + Web Audio API + Canvas / Three.js + Zustand + Dexie。
音乐与分析结果仅存本机，不上传、不接入遥测。根目录 Northstar Lab 不受此子项目影响。

[线上版本](https://aaron0837.github.io/music-universe/) 随 main 分支由 CI 自动构建部署，也可用 `workflow_dispatch` 手动触发。
**因此把关在推送之前：所有改动先本地验证，收到用户明确“可以推送”后才提交并推送。**

## 本地运行

```bash
npm install
npm run dev
```

Windows 若阻止 PowerShell 脚本，使用 `npm.cmd`。点击“播放原创示例”启用声音；可将本地音乐拖入页面或通过文件选择器导入。

```bash
npm test
npm run test:e2e
npm run build
npm run preview
node scripts/verify-production.mjs
```

安装了 Chrome / Edge 时，可设置环境变量 `MU_BROWSER=chrome` 或 `MU_BROWSER=msedge` 运行相同 Playwright 测试。默认使用 Playwright Chromium。需要对应浏览器已安装。

## 本轮完成

- 暖白 / 鼠尾草绿 / 浅蓝主题，统一发现、曲库、列表、设置和底部播放器；保留深色及实时跟随系统。
- 首页原创 CSS 唱片花园、封面集合、导入和播放入口。背景柔光与最多 64 个 Canvas 粒子共用一个动画循环；低性能降至 32 个，离开后静止、页面隐藏时停止。
- 触屏静态柔光；系统减少动态效果优先，设置中的效果开关、低动态和延迟补偿持久保存。DJ 区不启用背景跟随。
- 大型 BPM / 音量旋钮：上下拖动，Shift 精调，也支持键盘方向键和数字输入。
- 独立 Deck 波形和拍线、四个 Hot Cue、1/2/4/8 拍量化循环、倒放、EQ、滤波与效果器发送量。首次点击 Cue 设点，再次跳转，Shift+点击清除。归零效果器发送量即关闭该效果。
- Worker 分析 BPM、首拍与置信度，结果缓存；可手动修正原曲 BPM、Tap Tempo、当前位置设为首拍。Sync 在置信度足够时匹配速度与拍点。
- Beat Garden：BPM Match（A 轨整拍）、Drum Grid（八步鼓机）、Harmony（同时双轨）。以 Deck A 的音乐位置驱动，暂停冻结、变速跟随、跳转重建。
- Perfect ±80 ms / Great ±150 ms；重复击键不重复得分、漏击断连。Perfect 使用独立受限底鼓输出，Harmony 附加合成和弦；不修改原曲。
- 音游放大、Esc 退出、焦点约束；F 只击打第四轨，全屏有独立按钮。390px 下使用 Deck A / 音游 / Mixer / Deck B 分页。
- IndexedDB v2 迁移保留旧曲库；音频按浏览器支持解码，每个文件最多 100 MB。底部控制跟随当前 Deck。
- 三维视觉走真实 HDR 后处理管线：`EffectComposer` + `UnrealBloomPass` 泛光 + ACES 色调映射，再加一道色差 / 暗角 / 颗粒的调色 pass，而不是靠加色混合硬凑辉光。泛光强度跟随响度与拍点呼吸。
- 新增两个预设：Hyper Tunnel（顶点着色器生成星流，逐帧只更新 uniform）与 Aurora Veil（片元着色器程序化极光）。预设统一在 `src/presets/index.ts` 注册一次。
- 低质量档位直接跳过整条后处理管线，保留原先的裸渲染路径兜底。

## 使用边界

- **尚无保调变速。** 实际速率 = BPM / 原曲 BPM × `2^(Harmony/12)`；Harmony 与 BPM 都会影响速度和音高。不是分轨、不是专业 Key Lock。
- BPM 是基于起音包络的近似分析，可能存在倍速 / 半速歧义。弱节奏、变拍、节奏漂移的音乐需要手动校准。当前分析取前 120 秒和第一声道；固定网格不跟踪变速曲。
- 倒放时不进行 Sync 或音游。跳转和循环回绕会重建附近音符；短循环不适合完整音游练习。游戏是程序化节奏练习，不是自动转录原曲鼓谱。
- 转盘提供拖动定位式搓动，不宣称 AudioWorklet 级专业 scratch。当前效果器为独立湿声发送，不是独立干湿交叉混合。
- MP3 / WAV / FLAC / M4A / OGG 的具体可解码范围取决于浏览器；暂无额外 WASM 解码器。
- 曲库离线恢复指已经打开或缓存的应用可读取本地文件；尚未实现 Service Worker 冷启动离线应用。
- 播放列表目前只支持创建和展示，完整添加、排序和编辑仍待实现。本轮不增加 Tauri、云同步或 WASM。
- 自动化输出电平检查不能替代真实扬声器试听。Safari、Firefox、iOS / Android 实机与长期低端设备性能仍需要人工验收。

## 模块与扩展

```text
React pages / components → serializable Zustand snapshots
           ↓ commands
MixerEngine → Deck A / B → Gain / EQ / Filter / FX
           → equal-power crossfader → Master / limiter → output
           ↓ audio frames
Canvas / Three.js       RhythmSession ← TransportClock / BeatGrid
           ↑
LibraryRepository → Dexie v2 ← beat analysis Worker
```

- `src/styles/`：tokens、layout、components、pages、dj 分层；不在旧样式末尾堆叠覆盖。
- `src/rendering/`：渲染循环与后处理管线；`GradePass.ts` 是调色着色器。
- `src/presets/`：原创预设，在 `src/presets/index.ts` 注册一次；创建时分配，更新时复用，销毁时释放 geometry / material。
- `src/audio/engine/`：音频节点、积分播放时钟、同步数学。
- `src/audio/analysis/`：后台拍点与波形分析。
- `src/components/rhythm-game/`：可测试判定内核与 Canvas 舞台。
- `src/components/ui/AmbientField.tsx`：不拦截输入的背景效果，坐标不进 Zustand。
- `src/data/`：迁移与缓存；音频资源不进入 UI store。
- `src/presets/`：原创预设。新增预设实现 `UniversePreset`，注册一次；创建时分配，更新时复用，销毁时释放 geometry / material。

## 本地视觉审阅

先启动开发服务（4173 端口），再运行：

```bash
npm run dev -- --host 127.0.0.1 --port 4173
# 另一个终端
node scripts/capture-preview.mjs
```

截图与鼠标跟随短录屏生成于 `test-results/review/`（Git 忽略）：首页、曲库、设置、DJ、放大舞台，以及 390 / 768 / 1440 / 1920 宽度。截图曲目为脚本生成的测试音频，不是用户曲库。视频是视觉演示，不含扬声器录音。

验证三维预设真的在出画（而不是挂上一个空白 canvas）：

```bash
node scripts/canvas-proof.mjs
```

它对每个预设单独截图 `.visual-stage canvas`，再在 Chromium 里解码并统计亮度分布；任一预设标准差过低或全黑则脚本以非零码退出。注意不要改用 `drawImage` 直接读在线 canvas——在 `preserveDrawingBuffer: false`（默认）下会假阴性报全黑。

Vitest 覆盖播放时钟、速率斜坡、Sync 数学、循环、拍点检测、游戏窗口及预设资源释放。
Playwright 覆盖真实示例 / 文件音频输出、离线读取、迁移、Perfect 输出、拖放、触控组合、主题、布局与可视化切换。仍需人工检查听感和真实设备性能，不能以自动测试通过宣称全平台验收。

## 许可

MIT；见 [LICENSE](LICENSE) 与 [CONTRIBUTING.md](CONTRIBUTING.md)。
“Orbital Signal”及 Perfect 音效由本项目代码原创合成，无外部采样；代码内 CSS 插画为原创。不得加入未经授权的音频、封面、字体或纹理。
