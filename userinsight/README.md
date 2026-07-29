# UserInsight · 用户研究平台

面向工业设计师与用户研究人员的一体化平台：输入目标产品关键词 → 自动从公开渠道搜集用户评价 → 结构化管理 → 可视化分析 → 提取设计洞察并输出研究报告。

## 技术栈

- **前端**：React 18 + Vite + TypeScript + Tailwind CSS，图表 recharts，拖拽排序 dnd-kit，图标 Lucide React
- **后端**：Node.js + Express（转发大模型 API、规避浏览器跨域、结果校验清洗）
- **存储**：浏览器 localStorage 持久化（含 JSON 备份 / 导入恢复）

## 目录结构

```
userinsight/
├── client/            # 前端（Vite + React + TS）
│   └── src/
│       ├── lib/       # 工具函数、localStorage 数据层、API 封装、示例种子数据
│       ├── pages/     # 仪表盘 / 智能采集 / 评价库 / 分析看板 / 洞察工坊 / 设计输出 / 设置
│       ├── components/# 共享 UI 组件
│       ├── store.tsx  # 全局项目数据 Context（自动持久化）
│       └── types.ts   # 数据模型
└── server/            # 后端（Express）
    └── index.js       # /api/collect /api/insight-draft /api/persona-draft /api/test-connection
```

## 快速开始

要求 Node.js ≥ 18。

```bash
# 1. 启动后端（端口 3001）
cd server
npm install
npm start

# 2. 另开终端，启动前端（端口 5173，/api 自动代理到 3001）
cd client
npm install
npm run dev
```

浏览器打开 http://localhost:5173 即可。首次打开会自动载入「智能咖啡机用户体验研究」示例项目（标记为手动录入的演示数据），未配置 API 也能完整体验除「智能采集 / AI 辅助」之外的所有功能。

## 配置大模型 API

进入「设置」页填写三项并点击「测试连接」：

| 字段 | 示例 |
| --- | --- |
| Base URL | `https://api.moonshot.cn/v1` |
| API Key | `sk-…` |
| 模型名称 | `kimi-k2-0905-preview`（或其他兼容 OpenAI 格式的模型） |

- 兼容任何 OpenAI 格式的 `chat/completions` 接口（Kimi / DeepSeek / 通义千问等）。
- 「智能采集」依赖模型的**联网搜索能力**，请选择支持联网检索的模型/服务。
- 配置仅存储在浏览器 localStorage，由本地后端转发调用。

## 功能说明

- **仪表盘**：项目卡片管理、概览统计（评价数 / 情感比例 / 洞察数 / 平台分布）
- **智能采集**：关键词 + 平台多选 + 关注点 → 大模型联网搜集 → 分批返回（每批 ≤20 条）→ 格式校验、去重、昵称脱敏 → 待入库列表逐条勾选确认；支持手动粘贴录入（自动识别 ★ / “4星” 并匹配关键词词典）
- **评价库**：组合筛选、排序、行内快编、标签、详情弹窗、相似内容查重、导出 CSV
- **分析看板**：词云（CSS 模拟，正面绿/负面红/中性灰）、情感饼图、痛点柱状图、平台对比、情感时间趋势
- **洞察工坊**：勾选评价提取洞察卡片（AI 辅助生成草稿）、dnd-kit 拖拽排序；用户画像生成器；用户旅程表格编辑 + 情绪曲线自动绘制
- **设计输出**：按优先级排序的设计机会清单、竞品对比矩阵（雷达图）、报告预览、一键导出 Markdown 报告
- **备份恢复**：顶部栏导出 / 导入全部项目 JSON

## 合规与真实性

- 不实现任何需要登录、绕过验证码或违反 robots 协议的爬虫；采集界面固定展示合规提示。
- 后端只转发与校验，无搜索结果时返回空数组，**绝不虚构评价**；无来源链接的内容标记 `verified: false`，前端显示「待核实」。
- 昵称等个人信息一律脱敏存储（如「用***户」）。
