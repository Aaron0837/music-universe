# 渲染与可视化

覆盖 `src/rendering/`、`src/presets/`、`src/interaction/` 与三维舞台的驱动方式。

## 渲染循环

`UniverseRenderer` 持有 `WebGLRenderer`、场景、相机和一个 `requestAnimationFrame` 循环。每帧做四件事：

```text
1. 取音频帧      onFrame(delta) → AudioFrame        （由 MixerEngine 提供）
2. 取交互帧      interaction.tick(delta)            （指针 / 滚轮 / 捏合）
3. 更新预设      instance.update(frame, input, delta)
4. 渲染          composer.render() 或 renderer.render()
```

`delta` 被钳在 0.05 秒：

```ts
const delta = Math.min(.05, (now - this.last) / 1000);
```

标签页被挂起再回来时，真实间隔可能是几十秒，不钳住会让所有基于 `delta` 的动画瞬移。

### 页面隐藏时停止

```ts
private visibility = () => {
  cancelAnimationFrame(this.frameId);
  if (!document.hidden && this.running) { this.last = performance.now(); this.frameId = requestAnimationFrame(this.loop); }
};
```

无条件先取消，再判断是否该重启。这样"隐藏时停帧"只有一处逻辑，不会出现两个分支各管一半。重启时重置 `last`，避免把挂起的时间算成 delta。

## 质量档位

初始档位在构造时按设备推断：

| 条件 | 档位 |
|---|---|
| 视口宽度 ≤ 720px | `low` |
| `devicePixelRatio > 1.5` | `medium` |
| 其余 | `high` |

### 自动降级

每 **180 帧**统计一次实际 FPS：

```ts
if (this.frameCount >= 180) {
  const fps = this.frameCount / this.frameTotal;
  this.onStats?.(frame, fps);
  if (fps < 35 && this.quality !== 'low') {
    this.quality = this.quality === 'high' ? 'medium' : 'low';
    this.buildPipeline();
    this.setPreset(this.state.activePreset);
  }
  this.frameCount = 0; this.frameTotal = 0;
}
```

180 帧是刻意的采样窗口：太短会被偶发卡顿误判，太长则用户已经难受了几秒。

降级后会**重建管线并重新创建当前预设**——因为预设可能在 `create()` 时按当时的档位决定了资源开销（比如分段数、粒子数）。只改质量字段而不重建，会让预设继续跑在高档位的资源上，降级就没有效果。

### 像素比上限

```ts
const ratio = Math.min(devicePixelRatio, this.quality === 'low' ? 1.25 : 1.8);
```

高分屏上 `devicePixelRatio` 可以到 3，渲染像素数是逻辑像素的 9 倍。对 3D 场景来说这是纯粹的浪费——1.8 已经看不出差别，1.25 在低端设备上是必要让步。

## 后处理管线

```text
场景 ─→ RenderPass ─→ UnrealBloomPass ─→ GradePass ─→ OutputPass ─→ 屏幕
```

**`low` 档整条跳过**，直接走 `renderer.render(scene, camera)`：

```ts
if (this.composer) this.composer.render(delta); else this.renderer.render(this.scene, this.camera);
```

这比"把每个 pass 调成空操作"可靠得多——真正的兜底路径一直在跑，而不是一条只在理论上存在的分支。

### HDR 配置

```ts
this.renderer.outputColorSpace = THREE.SRGBColorSpace;
this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
this.renderer.toneMappingExposure = 1.25;
```

这套组合的目的是给加色光源**留出超过 1.0 的亮度空间**。预设里的发光元素可以叠加到 1.0 以上，超出部分不是被削平成一片死白，而是交给 ACES 曲线压缩并触发泛光。如果提前钳到 1.0，泛光就只剩阈值边缘那一圈，看起来像描边而不像发光。

曝光 1.25 是在"够亮"和"不过曝"之间调出来的。

### 泛光参数分档

```ts
const BLOOM = {
  high:   { strength: 0.95, radius: 0.72, threshold: 0.42 },
  medium: { strength: 0.78, radius: 0.62, threshold: 0.5 },
  low:    { strength: 0,    radius: 0,    threshold: 1 },
};
```

阈值随档位**降低**而升高：`threshold` 越高，越多像素达不到泛光门槛。中档（0.5）比高档（0.42）少一处发光，低档 `threshold: 1` 意味着永远不触发（虽然低档根本不建 bloom pass，这个值只是保持结构完整）。

### 能量调制

每帧平滑一个"能量"值：

```ts
this.energy += ((frame.rms * .7 + frame.beatPulse * .3) - this.energy) * Math.min(1, delta * 6);
```

响度占七成、拍点占三成。`Math.min(1, delta * 6)` 是**帧率无关的指数逼近**——`delta` 大时一步到位，`delta` 小时小步靠近。直接用固定系数会让 120Hz 屏幕上的响应速度是 60Hz 的两倍。

能量值做两件事：

```ts
this.bloomPass.strength = BLOOM[this.quality].strength * (1 + this.energy * .55);
this.gradePass.uniforms.uEnergy.value = this.energy;
```

泛光强度最多被推高 55%。这是"视觉跟着音乐呼吸"的实现——安静段落泛光收敛，高潮段落铺开。

### 调色 pass

`GradePass.ts` 是一段片元着色器，做三件事：

| 效果 | 参数 | 说明 |
|---|---|---|
| 色差 | `uAberration = 0.0016` | R 通道向外、B 通道向内采样 |
| 暗角 | `uVignette = 1.15` | `1 - smoothstep(0.34, 0.92, dist × v)` |
| 颗粒 | `uGrain = 0.03` | sin 哈希噪声 |

色差随能量增强：

```glsl
float offset = uAberration * (1.0 + uEnergy * 2.2) * dist;
```

偏移量还乘了 `dist`（到画面中心的距离），所以画面边缘的分离比中心明显——这正是真实镜头的行为。响度大时整体加剧，像"镜头在负载下"。

颗粒同理：`grain * uGrain * (0.4 + uEnergy)`。

**这个 pass 在线性空间运行，在 `OutputPass` 之前**。`OutputPass` 才做色调映射与 sRGB 转换。顺序反了的话，色差和暗角会在已经过 gamma 编码的值上运算，结果偏亮且不自然。

## 拍点脉冲

可视化需要一个"每拍跳一下"的信号。它由 `MixerEngine.frame()` 生成：

```ts
const beatPhase = (((this.decks.A.position - (grid?.firstBeat ?? 0)) / beatLength) % 1 + 1) % 1;
const pulse = beatPhase < this.lastBeat ? 1 : Math.max(0, 1 - beatPhase * 8);
this.lastBeat = beatPhase;
```

`beatPhase` 是 0→1 循环的锯齿波。**相位回绕的那一刻**（`beatPhase` 突然小于上一帧的值）说明新的一拍到了，输出 1；之后按 `1 - phase×8` 衰减，八分之一拍内归零。

用回绕检测而不是"每隔 N 毫秒触发一次"，是因为前者天然跟随音乐位置——变速、跳转、循环都会自动正确，不需要重新校准计时器。

网格来自 Deck A，且只在 A 正在播放时输出脉冲（`this.decks.A.isPlaying ? pulse : 0`）。

## 预设系统

### 接口

```ts
export interface UniversePreset {
  id: string;
  name: string;
  description: string;
  author: string;
  create(context: PresetContext): PresetInstance;
}

export interface PresetInstance {
  update(frame: AudioFrame, input: InteractionFrame, delta: number): void;
  resize(width: number, height: number, pixelRatio: number): void;
  reset(): void;
  dispose(): void;
}
```

`create` 里分配资源，`update` 里只更新——**每帧不得分配**（不 new 对象、不建数组、不拼字符串）。这条约束是维持 60fps 的前提，[CONTRIBUTING.md](../../CONTRIBUTING.md) 把它写成了硬要求。

### 注册表

`PresetRegistry` 是一个 `Map`，两个方法都会抛错：

```ts
register(preset) { if (this.presets.has(preset.id)) throw new Error(`Duplicate preset: ${preset.id}`); ... }
get(id) { const preset = this.presets.get(id); if (!preset) throw new Error(`Unknown preset: ${id}`); ... }
```

重复 id 直接抛而不是覆盖：静默覆盖会让两个预设里较晚注册的那个默默赢，是那种到线上才发现的问题。所有预设统一在 `src/presets/index.ts` 注册一次。

### 资源释放

`disposeObject(root)` 遍历对象树，释放 geometry 与材质，然后从父节点摘除：

```ts
root.traverse((item) => {
  const mesh = item as THREE.Mesh;
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
  materials.forEach((material) => material.dispose());
});
root.removeFromParent();
```

Three.js 不会自动回收 GPU 资源。切换预设时不释放，显存会一直涨——`src/presets/disposal.test.ts` 专门守着这条。

材质可能是数组也可能单个，所以要先归一化再遍历。

### 确定性伪随机

```ts
export function seeded(index: number, salt = 1): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
```

用正弦哈希产生 `[0,1)` 的伪随机数。同一个 `index` 永远得到同一个值。

为什么不用 `Math.random()`：预设要在 `create()` 时布置静态结构（星流的位置、粒子的分布），用真随机的话每次切换预设布局都不一样。而确定性函数让"这个预设长什么样"是稳定的，同时不需要引入随机数库或维护种子状态。

## 交互输入

`InteractionController` 输出 `InteractionFrame`，同样是**复用对象**：

```ts
readonly frame: InteractionFrame = { x: 0, y: 0, worldX: 0, worldY: 0, pressed: false, energy: 0, burst: 0, zoom: 1, reducedMotion: false };
```

| 字段 | 来源 |
|---|---|
| `x` / `y` | 归一化设备坐标 `[-1, 1]`，y 轴已翻转 |
| `worldX` / `worldY` | 射线与 `z = 0` 平面的交点 |
| `pressed` | 是否有指针按下 |
| `energy` | 按住时累积，松开后衰减 |
| `burst` | 按下的瞬间置 1，快速衰减 |
| `zoom` | 滚轮或双指捏合，钳在 `[0.55, 1.65]` |

`worldX/worldY` 通过 `Raycaster` 与一块平面求交得到（`intersectPlane`）。这样预设可以直接拿世界坐标布置效果，不用自己处理相机投影。

衰减在 `tick(delta)` 里、且**乘以 delta**：

```ts
this.frame.energy = Math.max(0, this.frame.energy - delta * 0.22);
this.frame.burst = Math.max(0, this.frame.burst - delta * 1.8);
```

同样是为了帧率无关——固定每帧减 0.02 会让高刷屏上的效果消失得更快。

指针事件用 `setPointerCapture`，所以拖出 canvas 之外仍然继续接收移动。

## 坐标为什么不进 Zustand

`worldX` / `worldY` 每帧都变。放进 Zustand 意味着鼠标一动就触发订阅了这些字段的组件重渲染，而真正的消费者是渲染循环——它下一帧自己就会读 `state` 字段（通过闭包拿 `AppState`），根本不需要通知。

所以整条路径是：指针事件 → `InteractionController.frame`（原地更新）→ `PresetInstance.update()`。React 全程不参与。

## 主题如何影响画布

`UniverseRenderer` 构造时接收 `AppState` 实例，预设通过闭包读它：

```ts
this.instance = preset.create({
  scene, camera, renderer,
  quality: this.quality,
  hue: () => this.state.hue,
  sensitivity: () => this.state.sensitivity,
});
```

传的是**取值函数**而不是当前值，所以预设每次需要时都读到最新数据，不需要在设置变化时重建预设。

`prefers-reduced-motion` 也是每帧注入的：

```ts
const input = this.interaction.tick(delta);
input.reducedMotion = this.state.reducedMotion;
```

预设据此决定是否让画面保持静止。
