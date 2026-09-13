# 文档

本目录收录 Music Universe 的工程文档。**项目介绍、功能与快速开始请看根目录的 [README](../README.md)**；这里讲的是设计与实现。

## 设计文档

| 文档 | 内容 | 适合谁读 |
|---|---|---|
| [架构](design/architecture.md) | 四层结构、单向数据流、三条并行于 React 的每帧通道、模块边界规则 | 想了解项目全貌的人 |
| [音频引擎](design/audio-engine.md) | 信号图与全部参数、三套并发防护、积分时钟、保调变速、拍点分析、状态机 | 要改音频相关代码的人 |
| [数据模型](design/data-model.md) | Dexie 八张表、v1→v3 迁移策略、写入边界条件、**v4 扩展的起点** | 要扩展存储或加导入导出的人 |
| [状态管理](design/state.md) | 三套状态机制的分工、三条持久化路径、依赖注入与它的代价 | 要加状态或做持久化的人 |
| [渲染与可视化](design/rendering.md) | 渲染管线、质量档位与自动降级、调色着色器、预设生命周期、交互输入 | 要写可视化预设的人 |
| [测试策略](design/testing.md) | 单元与端到端的分工、三引擎覆盖与 WebKit 裁剪、已知盲区 | 要加测试或接入 CI 的人 |

## 建议的阅读顺序

**第一次读**：架构 → 你关心的那一篇。

**要动手改代码**：先读架构的「边界规则」一节，它列出了不该越过的几条线。

**要加可视化预设**：渲染与可视化 → 根目录的 [CONTRIBUTING.md](../CONTRIBUTING.md)。

**要做数据层扩展**：数据模型末尾的「当前 schema 的已知问题」直接列出了下一阶段该处理的事项。

## 其他文档的位置

以下文档按开源惯例放在仓库根目录，GitHub 会自动识别：

| 文档 | 位置 |
|---|---|
| 项目介绍、功能、使用边界 | [README.md](../README.md) / [README.en.md](../README.en.md) |
| 贡献指南 | [CONTRIBUTING.md](../CONTRIBUTING.md) |
| 行为准则 | [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) |
| 安全策略 | [SECURITY.md](../SECURITY.md) |
| 改动记录 | [CHANGELOG.md](../CHANGELOG.md) |
| 给 AI 代理的说明 | [AGENTS.md](../AGENTS.md) |

## 图片

`images/` 存放 README 使用的预览截图，由 `scripts/capture-preview.mjs` 生成。

## 写文档的约定

1. **参数值必须与源码一致。** 文档里写错一个数字比不写更糟——读者会信任它。改代码时若动了参数，同一提交里改文档。
2. **理由只写一处。** 根 README 回答「这是什么、在哪」，本目录回答「为什么这样做」。两边重复的内容迟早会走神。
3. **已知边界要写下来。** [README 的使用边界](../README.md#使用边界)与[测试策略的已知盲区](design/testing.md#已知盲区)是刻意保留的——一份只讲优点的文档没有可信度。
