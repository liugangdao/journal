# Trading Journal / 交易日志

个人交易记录与复盘工具，支持外汇、贵金属及能源品种的交易记录、统计分析和周度复盘。

## 功能特性

- **交易记录** — 记录每笔交易的完整信息（品种、方向、策略、价格、盈亏、执行评分、情绪状态等）
- **实时计算** — 录入时自动预览止损点数、盈亏点数、R 倍数、点差成本和净盈亏
- **数据面板** — 胜率、盈亏比、Profit Factor、累计净值曲线、品种/策略/时段/情绪多维度分析
- **周度复盘** — 按周记录交易心得与改进计划
- **数据导出** — 一键导出全部交易记录和复盘笔记为 JSON 文件

### 支持品种

外汇：EUR/USD, GBP/USD, USD/JPY, AUD/USD, NZD/USD, USD/CAD, USD/CHF, EUR/GBP, EUR/JPY, GBP/JPY, AUD/JPY

商品：XAU/USD, XAG/USD, USOil, UKOil, NGAS

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + Vite 7 + Tailwind CSS v4 + Recharts |
| 后端 | Express 5 + better-sqlite3 |
| 数据库 | SQLite |
| 部署 | Docker (Node 20 Alpine, 多阶段构建) |

## 快速开始

### 本地开发

```bash
# 安装所有依赖
npm run install:all

# 启动开发服务器 (前端 :3000 + 后端 :3001)
npm run dev
```

开发模式下 Vite 会自动将 `/api` 请求代理到后端。

### Docker 部署

```bash
docker compose up -d
```

服务运行在 `http://localhost:3001`，数据库文件持久化在 `./data/` 目录。

### 填充示例数据

```bash
node server/seed.js
```

## 项目结构

```
trading-journal/
├── client/                 # 前端
│   └── src/
│       ├── components/     # React 组件
│       │   ├── ui/         # 基础 UI 组件 (Input, Select, Tab, KpiCard)
│       │   ├── Layout.jsx  # 页面布局与导航
│       │   ├── TradeForm.jsx    # 交易表单 (新建/编辑)
│       │   ├── TradeTable.jsx   # 交易记录表格
│       │   ├── Dashboard.jsx    # 数据统计面板
│       │   └── WeeklyNotes.jsx  # 周度复盘
│       ├── hooks/useApi.js      # API 客户端
│       └── lib/
│           ├── calc.js          # 交易计算 (R倍数、统计聚合)
│           └── constants.js     # 品种、策略、评分等常量
├── server/                 # 后端
│   ├── index.js            # Express 入口
│   ├── db.js               # SQLite 初始化
│   ├── routes/             # API 路由
│   └── seed.js             # 示例数据
├── Dockerfile
└── docker-compose.yml
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trades` | 获取交易列表 (支持 `?sort=` 和 `?order=`) |
| POST | `/api/trades` | 新建交易 |
| PUT | `/api/trades/:id` | 更新交易 |
| DELETE | `/api/trades/:id` | 删除交易 |
| GET | `/api/notes` | 获取周度笔记 |
| POST | `/api/notes` | 新建周度笔记 |
| DELETE | `/api/notes/:id` | 删除周度笔记 |
| GET | `/api/export` | 导出全部数据 (JSON 下载) |
