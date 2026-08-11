# 五子棋 AI 对战 · 开发计划 / 现状记录

> 阶段目标：一个可在浏览器运行的五子棋人机对战页面。人类与 AI 轮流落子，
> 棋盘/棋局通过二维数组与 AI 交互，胜负判定完整，模型配置可管理。
> 当前状态：人机对局完整可用，并已支持三种模式（双人对战 / 人机对战 / AI 对弈）、
> 开始界面配置、AI 对弈双模型自动对局与判负、暂停/继续、对局导入/导出、AI 表现分析
> （棋盘 7/9/11/13/15、Canvas 渲染、胜负判定、AI 客户端、失败重试、模型配置、棋谱、复盘、
> 棋局暂存、说明弹窗与分享预设）。

---

## 1. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 构建工具 | Vite | 启动快、零配置热更新 |
| 框架 | Vue 3（组合式 API）+ TypeScript | 组件化利于扩展配置面板/棋谱/复盘；类型安全 |
| 状态管理 | 不引入 Pinia，用 reactive + composable | 依赖少，可平滑迁移 |
| 棋盘渲染 | Canvas（网格 + 棋子 + 星位 + 侧边行列号） | 性能无压力；替换棋子样式方便 |
| 样式 | 原生 CSS | 无 UI 库依赖 |
| AI 接口 | fetch 直连 OpenAI 兼容 /chat/completions | 支持 DeepSeek/OpenAI/本地 Ollama 等一切兼容服务 |
| 持久化 | localStorage | 模型配置、棋局暂存、说明弹窗标记 |

### 分层架构

- core/ — 纯逻辑层，不依赖 UI/网络：棋盘数据结构、落子、胜负判断、表示模式转换、复盘重建。
- engine/ — 对局控制器：回合流转、AI 驱动（人机 / 双 AI）、失败重试、判负与终局检测。
- ai/ — AI 客户端：多 provider 请求、提示词模板、响应解析与校验。
- store/ — 全局状态 + localStorage 持久化（config / game 快照）。
- components/ — 展示组件：棋盘、模型配置、棋谱、说明弹窗。

```
five_line/
├── index.html / package.json / vite.config.ts / tsconfig.json
├── PLANNING.md
└── src/
    ├── main.ts / App.vue
    ├── core/    board.ts / rules.ts / notation.ts / replay.ts
    ├── engine/  gameController.ts
    ├── ai/      client.ts / prompt.ts / parser.ts / types.ts
    ├── store/   config.ts / game.ts / export.ts
    └── components/ StartScreen.vue / GameBoard.vue / ModelConfig.vue / MoveLog.vue / AnalysisPanel.vue / HelpModal.vue
```

---

## 2. 交互格式约束

### 棋盘表示（两种模式）

- 模式 A · 位型（默认）：0 = 空位，1 = 黑棋，2 = 白棋。
- 模式 B · 顺序编号（预留）：0 = 可下位置，奇数 = 黑棋（1、3、5…），偶数 = 白棋（2、4、6…），
  每次落子编号 +1，天然记录落子顺序。注意：会增加 AI 推理复杂度，作为可选项提供。

前端发往 AI 的 user 消息固定为当前表示模式下的二维数组 JSON，加上执子说明：

```json
{"board": [[0,0,0],[0,1,0],[0,0,2]], "currentPlayer": 1, "boardSize": 3}
```

### AI 响应约束

AI 必须只返回一个 JSON 对象，不要任何多余文字：

```json
{"color": 1, "x": 2, "y": 1}
```

- color：1 = 黑，2 = 白，必须与当前回合一致。
- x / y：0 起始的行 / 列坐标，必须在 [0, boardSize) 内。
- 坐标对应的格子必须是空位，否则视为非法落子（可配置重试次数）。

解析策略（按优先级）：
1. 请求带 response_format: {"type": "json_object"}（服务端兼容时）。
2. 兜底：从响应文本提取第一个 {...} JSON 块。
3. 校验：color 与当前回合一致、坐标在界内、落点为空格。

### 失败与重试机制

- 自动重试次数 maxAutoRetries 可配置，默认 2；人机模式消耗完后进入「等待手动重试」状态，UI 提供手动重试按钮。
- AI 对弈模式无人值守：某方重试耗尽（或无可用模型）时直接判该方负、对方获胜并结束对局，不再发起模型调用。
- 按失败类型区分处理：
  - 超时 / 网络错误 / JSON 解析失败（没拿到可解析结果）→ **原内容重发**：重新发起一轮独立请求，不把失败内容写回对话。
  - 解析成功但校验不合法（坐标出界 / 位置被占 / 颜色不符）→ **修正式重试**：把 AI 的错误响应作为 assistant 消息追加，再追加一条 user 消息说明不合法原因并要求给出合法落子，引导模型修正。
- 两类重试共用 maxAutoRetries 计数；手动重试与自动重试走同一套流程，手动重试沿用上次对话上下文。
- 若对局在 AI 请求期间被重新开始（切换执色/尺寸），通过对局代次（gameVersion）丢弃过期结果。

### 请求格式（OpenAI 兼容）

```http
POST {baseUrl}/chat/completions
{
  "model": "模型名",
  "messages": [ {"role": "system", "content": "..."}, {"role": "user", "content": "..."} ],
  "temperature": 0.7,
  "max_tokens": 300000,
  "response_format": {"type": "json_object"},
  "thinking": {"type": "disabled"}   // enableThinking=false 时发送（DeepSeek 等推理模型）
}
```

---

## 3. 提示词模板

系统提示词按「当前对局配置」动态生成（颜色、棋盘大小、表示模式均可变，为 AI vs AI 预留）：

```
你是一名五子棋 AI 玩家，本局执{黑棋/白棋}，执子颜色固定为 {1/2}。
棋盘大小为 {N}x{N}，行和列的坐标都从 0 开始。
棋盘表示规则：
  0 表示空位；
  1 表示黑棋；2 表示白棋。
  （模式 B 时替换为：0 表示空位，奇数为黑棋，偶数为白棋，数字越大表示落子越晚。）
横、竖、斜任意方向先连成 5 子的一方获胜；如果棋盘下满则平局。
轮到己方落子时，请只输出一个 JSON 对象，格式为：
  {"color": 1, "x": 行号, "y": 列号}
要求：
  - 只输出 JSON，不要输出任何解释、思考过程或多余文字；
  - color 必须等于你的执子颜色；
  - x、y 必须落在棋盘范围内；
  - 落子位置必须是空位。
```

用户消息：

```
当前棋盘（已下 {n} 手，轮到{黑棋/白棋}落子）：
{二维数组 JSON}
```

> 已实现：AI 对弈模式分别向黑方 / 白方注入「执X棋」提示词，按执色选择对应模型循环调用两个 AI 客户端，
> 提示词模板无需重构。

---

## 4. 可配置项清单（当前默认值）

### 对局配置
| 配置 | 取值 | 当前默认 | 说明 |
|---|---|---|---|
| 棋盘大小 | 7 / 9 / 11 / 13 / 15 | 9 | 优先 9×9，否则模型思考时间可能超过十分钟 |
| 人类执子 | 黑 / 白 | 黑 | 对局开始（已有落子）后锁定；选白后 AI 先手但尚未落子时仍可换回黑棋 |
| 对局模式 | 双人 / 人机 / AI 对弈 | 人机 | 在「开始新对局」界面选择 |
| AI 对弈黑方模型 | provider + 模型 | 第一个可用模型 | 黑棋先手 |
| AI 对弈白方模型 | provider + 模型 | 第一个可用模型 | 与黑方可不同模型，可一键交换 |
| 棋盘表示模式 | 位型 / 顺序编号（预留） | 位型 | |
| 请求 AI | 开 / 关 | 开 | 仅人机模式显示；关闭时玩家可代替 AI 落子 |
| AI 超时 | 秒 | 3000 | |
| 自动重试次数 | 0–5 | 2 | 超时/网络/解析失败共用；人机模式消耗完转手动重试，AI 对弈判负 |

### AI 行为配置
| 配置 | 当前默认 | 说明 |
|---|---|---|
| temperature | 0.7 | |
| max_tokens | 300000 | 推理模型思考会占用 token，预算不足会返回空 content |
| 允许思考（enableThinking） | 开 | false 时发送 thinking.disabled（DeepSeek 等），避免思考耗尽 max_tokens |
| JSON 模式（useJsonMode） | 开 | response_format: json_object |
| 附加自定义提示 | 空 | 追加到系统提示词末尾，用于约束 AI 风格/策略 |

### 分享预设与说明弹窗
- 内置 DeepSeek 分享预设：baseUrl=https://api.deepseek.com（已验证浏览器 CORS 直连）、
  API Key（构建时从 .env.local 注入）、模型 deepseek-v4-flash。
- 说明弹窗首次进入自动展示（gomoku.helpSeen 标记），可一键配置模型；
  提示内容：三模式说明、关闭「请求 AI」后可手动落子、优先使用 9×9 棋盘、点击棋谱可回看历史。

---

## 5. 模型配置设计

### 数据结构（localStorage key: gomoku.config，version 5，含 v1→v5 迁移）

```ts
interface ProviderConfig {
  id: string;              // 固定 id 或随机 id
  name: string;            // 显示名，如 DeepSeek
  baseUrl: string;         // 如 https://api.deepseek.com（生产直连，CORS 已验证）
  apiKey: string;
  models: string[];        // 模型列表，可手动增删
  enabled: boolean;
  note?: string;
}

interface AiSide { providerId: string; model: string }  // AI 对弈：一方模型引用

interface AppConfig {
  version?: number;
  providers: ProviderConfig[];
  active: { providerId: string; model: string } | null;
  game: { boardSize: number; humanColor: 1|2; mode: "pvp" | "human-ai" | "ai-ai"; notation: "plain" | "numbered"; autoRequestAi: boolean; aiBlack: AiSide | null; aiWhite: AiSide | null };
  ai: { temperature: number; maxTokens: number; timeoutMs: number; maxAutoRetries: number; extraPrompt: string; useJsonMode: boolean; enableThinking: boolean };
}
```

### 功能
- 模型配置页：provider 增删改、baseUrl / apiKey 输入、模型列表动态增删、启用/停用、发送测试消息。
- 全新访问自动激活第一个可用模型（autoActivate）；AI 对弈双方模型默认回退到第一个可用模型；
  分享预设可一键写入并选中；provider 增删改时自动修复双方模型引用。
- apiKey 仅存浏览器 localStorage（Demo 阶段可接受；后续建议改走后端代理或环境变量，避免前端泄露）。

---

## 6. 对局规则与交互细节（当前实现）

- 手数显示从 1 开始：对局进行中显示即将落子的手数（moveCount + 1），结束后显示总手数；
  复盘位置 0 显示为「初始局面」，避免出现「第 0 手」。
- 执棋颜色：双人 / 人机模式在「开始新对局」中选择人类执子；AI 对弈模式黑方先手、白方后手，
  双方模型可在开始界面配置并一键交换。
- AI 对弈：点击「开始新对局」选择「AI 对弈」后开始，黑方 AI 自动先手，双方按执色取各自模型
  自动轮流落子；分出胜负（或平局）后停止一切模型调用。
- AI 对弈判负：某方连续重试耗尽（默认 2 次）或无可用模型时，判对方获胜并结束对局（该手不计入棋谱），
  状态区展示判负原因。
- 暂停/继续：任意时刻可暂停；暂停后放行在途 AI 请求（最后一手仍落子），但不再发起下一次落子；
  「继续对局」恢复后轮到 AI 立即续走。暂停状态不会阻止棋谱/分析/导出。
- 对局导入/导出：导出当前棋局（快照 + 模式/模型配置）为 JSON 文件；导入未终局对局进入暂停状态，
  可在开始界面（续局模式）配置双方模型后继续；导入已终局对局保持结束状态，仅可回看棋谱与复盘。
- 对局分析：棋谱右上角「对局分析」入口，以折线图展示 AI 每一步的思考时长与 token 用量，
  并给出平均/最长/最短思考时长、平均与总 token、重试次数、模型分布等统计。
- token 用量记录：AI 响应解析 usage 字段（prompt/completion/total_tokens），随棋谱与快照持久化。
- 请求 AI 开关：关闭时人类可代替 AI 落子；打开开关时仅当轮到 AI 才自动触发
  （watch autoRequestAi），轮到玩家则等待其落子后再请求；newGame / restoreGame 均尊重该开关。
- AI 思考计时：AI 落子过程显示耗时；棋谱记录每次 AI 响应耗时与重试次数，思考详情可展开查看。
- 棋局暂存：每次落子保存快照到 localStorage（gomoku.game），刷新自动恢复；
  未终局恢复后默认暂停，需手动点「继续对局」恢复；恢复提示可在落子/重新开始后自动关闭，也可点「知道了」手动关闭。
- 棋谱 / 复盘：点击棋谱行回放局面，支持上一步/下一步/自动播放/退出；自动播放按可调间隔（默认 2 秒）逐手前进，到底自动停止，播放中改间隔即时生效；复盘到实时最后一手时透传真实终局状态。
- 棋盘渲染细节：默认 9×9；四角星位 + 天元（不含边线中点）；侧边显示 0 起始的行列数字标记。

---

## 7. AI 对弈模块说明

### 开始界面（StartScreen.vue）
- 入口：首次访问无暂存对局时自动弹出；随时可点「开始新对局」打开。
- 模式选择：双人对战 / 人机对战 / AI 对弈。
  - 双人：仅棋盘尺寸，本机轮流落子，无 AI 参与。
  - 人机：人类执子（黑/白）+ AI 模型（复用 config.active）。
  - AI 对弈：黑方模型、白方模型独立配置，支持一键交换；另可选棋盘尺寸。
- 点击「开始对局」校验模型可用性后按当前配置开新对局（内部调用 newGame）。

### 双 AI 驱动（gameController.ts）
- targetForCurrentPlayer()：AI 对弈按当前执色取 aiBlack / aiWhite，人机模式取全局 active 模型。
- afterMove()：落子后若未终局且为 AI 对弈模式，自动 void runAiTurn() 轮到另一方，形成闭环。
- 终局即停：newGame / restoreGame / runAiTurn / attemptLoop 均在 winner 或 isDraw 成立时停止，
  不再发起任何模型调用；对局代次 gameVersion 保证新开对局丢弃在途结果。
- 判负规则：AI 对弈某方重试耗尽（maxAutoRetries，默认 2）或无可用模型时，
  调用 store/game.ts 新增的 forfeit(color) 判对方获胜，终局并展示原因（gameNotice）。

### 配置扩展（store/config.ts，version 5）
- game.mode 增加 "pvp"；game.aiBlack / game.aiWhite 记录双方模型引用（AiSide）。
- 自动重试默认 2；v4→v5 迁移仅把旧默认值 1 提升为 2，用户手动设置不被覆盖。
- isValidAiSide / firstAvailableAiSide：模型有效性校验与回退，provider 增删改时自动修复双方模型。

### 模型拉取与中转站适配（ai/client.ts + ModelConfig.vue）
- fetchModels(provider)：从 Base URL 拉取模型列表，超时 30s，错误统一抛 AiRequestError。
- 路径适配：GET {baseUrl}/models；404 且 baseUrl 未以 /v1 结尾时自动补 /v1/models 重试一次。
  部分中转站只在 /v1 下挂载 OpenAI 兼容接口；baseUrl 已带 /v1 时不再重复拼接。
- 返回格式兼容：{data:[{id}]}、{models:[...]}（字符串或 {id} 对象）、裸数组，按 id 去重。
- chatCompletion 同步适配：POST {baseUrl}/chat/completions 404 时补 /v1/chat/completions 重试一次。
- UI：Provider 卡片「从 Base URL 获取模型」按钮，拉取后去重合并进 provider.models 并反馈新增数量；
  配置页顶部提示中转站通常提供 GET /models 接口。

### 暂停 / 继续（gameController.ts）
- paused 独立于 phase；pauseGame 置 paused=true 并切到 'paused' 阶段。
- afterMove 检查 paused：允许当前在途请求落子（最后一手），但不再触发 runAiTurn。
- attemptLoop 重试循环检查 paused：暂停后中断重试，不再发起新请求，也不在 AI 对弈中触发判负；
  在途请求仅当返回合法落子时放行最后一手。
- resumeGame 校验目标模型可用性后继续；已终局保持 over；未配置模型时保持暂停并提示。
- 计时器归属号（aiTimerOwner）：修复 AI 对弈嵌套 runAiTurn 时外层 finally 误停后一手计时器的 bug。
- 刷新恢复（restoreGame）与导入未终局对局（importGame）默认进入暂停态，需手动点「继续对局」恢复；
  已终局对局恢复后保持 over，不允许继续对话，可回看棋谱与复盘。

### 导入 / 导出（store/export.ts + store/game.ts）
- 导出格式：ExportedGame = 棋局快照 + 模式/执色/棋盘/表示/双方模型引用。
- 导入校验：format/version/棋盘尺寸/模式/快照结构；快照经 importSnapshot 重建棋盘并逐手校验。
- 未终局导入 → paused + 开始界面续局模式（模式/棋盘/执色锁定，仅可配置模型）→ 继续对局。
- 已终局导入 → phase 'over'，不发起任何模型调用，可复盘。

### 对局分析（components/AnalysisPanel.vue）
- 入口：棋谱头部「对局分析」按钮，任意时刻可查看；以弹窗展示，支持关闭按钮 / 点击遮罩 / ESC 关闭。
- 分模型展示：AI 落子按「执色 + 模型」分组（双方即使使用同一模型也各列一区）。
- 折线图（内联 SVG，无第三方依赖）：思考时长（s）与 token 用量（手）各一张图，
  不同模型用不同颜色画在同一张图内，带图例，悬停显示「执色 · 模型 · 手数 · 数值」。
- 统计：每个模型单独一个卡片区域：落子数、平均/最长/最短思考时长、平均与单步最高/总 token、重试次数。

### 棋谱与状态
- 棋谱沿用 MoveEntry 元数据（source/model/raw/reasoning/durationMs/retries/promptTokens/completionTokens/totalTokens），AI 对弈双方按模型区分。
- 状态栏在 AI 对弈模式显示「黑方/白方 AI 思考中」，终局显示「黑方/白方 AI（模型）胜」。

---

## 8. 预留能力映射（后续计划）

| 后续功能 | 依赖的预留设计 |
|---|---|
| 棋子换成 AI 图标 | 渲染层 Canvas 绘制函数可替换 |
| 顺序编号表示模式 | notation.ts 双向转换，与引擎解耦 |
| 自定义 AI 行为 | 提示词模板片段化组合 + 可配置项注入 |
| 公开部署的密钥安全 | 前端内置 Key 仅限熟人分享；改为后端代理转发 |

---

## 9. 发布与部署

- npm run build 产出 dist/ 静态产物，可部署到任意静态服务器（nginx / 对象存储等），无需后端与代理。
- 默认 provider 直连 https://api.deepseek.com（浏览器 CORS 已验证），本地开发代理 /deepseek 仍保留。
- 本地预览：npm run preview；开发：npm run dev；测试：npm test。
- 注意：前端构建产物内含 API Key，仅适合当前「和朋友分享」阶段，不建议公开传播。
