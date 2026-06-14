# Simple Image Panel

Simple Image Panel 是一个专注于 `gpt-image-2` 的图像生成页面，支持文生图和图生图。项目提供两种运行模式：

- 本地完整模式：React 前端 + 本地 Express 后端，支持 API Key 加密保存、上传图片副本管理、生成图缓存和历史清理。
- GitHub Pages 静态模式：纯前端运行，API Key 只保存在当前页面内存中，不写入浏览器存储或服务器。

GitHub Pages 静态版地址：

```text
https://cuimuxuan.github.io/image-simple-panel/
```

## 功能概览

- 文生图 / 图生图双模式。
- 固定模型：`gpt-image-2`。
- OpenAI-compatible Images API：
  - 文生图：`POST {Base URL}/v1/images/generations`
  - 图生图：`POST {Base URL}/v1/images/edits`
- 模型提供商管理：添加、选择、编辑、删除。
- 本地完整模式下 API Key 加密保存，前端不回显明文。
- 静态模式下 API Key 仅保存在当前页面内存中，刷新后清空。
- 图生图支持多张输入图，最多 16 张。
- 上传输入图自动命名为 `image_1.png`、`image_2.png`。
- 删除输入图后自动顺位重编号。
- 多张生成图使用串行请求。
- 失败记录显示错误信息，并支持重试。
- 重试时显示当前正在重试的请求数量。
- 生成图右键支持复制源链接、下载图片、复制本地路径。
- GitHub Actions 自动部署 GitHub Pages 静态版。

## 技术栈

- 前端：Vite + React + TypeScript
- 图标：lucide-react
- 后端：Node.js + Express
- 上传处理：multer
- HTTP 请求：axios / browser fetch
- 本地存储：JSON 文件 + 本地图片目录

## 运行模式说明

### 本地完整模式

适合日常个人本地使用，功能最完整。后端运行在本机，负责：

- 加密保存提供商 API Key。
- 保存图生图输入图副本。
- 缓存生成结果。
- 记录下载状态。
- 后端启动时清理未下载生成图。

启动：

```bash
npm install
npm run dev
```

默认前端地址：

```text
http://127.0.0.1:5173
```

默认后端地址：

```text
http://127.0.0.1:8787
```

如果 `5173` 端口已被占用，Vite 会自动切换到下一个端口，例如 `5174`。终端输出中的 `Local` 地址就是当前可访问地址。

### GitHub Pages 静态模式

适合直接作为网页访问，不需要本地后端：

```text
https://cuimuxuan.github.io/image-simple-panel/
```

静态模式的 API Key 规则：

- API Key 只保存在当前页面的 JavaScript 内存中。
- 不写入 `localStorage`、`sessionStorage`、IndexedDB、Cookie 或 URL。
- 刷新页面、关闭标签页或重新打开页面后，提供商配置和 API Key 都会消失。
- 不使用 GitHub Actions secrets，也不会传到本项目服务器。

静态模式限制：

- 浏览器会直接请求模型提供商接口。
- 如果提供商未开启 CORS，浏览器会阻止请求。
- 上传输入图只存在当前页面会话中。
- 生成历史只存在当前页面会话中。
- 不支持后端文件缓存、后端启动清理和持久历史。

构建静态版：

```bash
npm run build:pages
```

静态版由 `.env.pages` 控制：

```text
VITE_APP_MODE=static
```

## 基本使用流程

### 1. 添加模型提供商

1. 点击左侧“添加模型提供商”。
2. 填写提供商名称。
3. 填写 API 地址 Base URL，例如：

```text
https://your-provider.example.com
```

4. 填写 API Key。
5. 点击保存。

本地完整模式下，API Key 会加密写入 `data/providers.json`。静态模式下，API Key 只保存在当前页面内存中。

### 2. 文生图

1. 选择模式“文生图”。
2. 选择图片尺寸、质量、审核强度。
3. 设置生成数量。
4. 在底部提示词输入框输入描述。
5. 点击发送按钮。

生成数量大于 1 时，程序会按顺序串行请求。每次请求固定发送 `n: 1`。

### 3. 图生图

1. 选择模式“图生图”。
2. 在左侧“输入图片”区域上传图片。
3. 上传后的图片会命名为 `image_1.png`、`image_2.png`。
4. 默认所有已上传输入图都会参与本次图生图。
5. 输入提示词并点击发送。

输入图限制：

- 最多 16 张。
- 支持 `png`、`jpg`、`webp`。
- 每张图片最大 50MB。

删除输入图后，剩余图片会自动顺位重编号。

### 4. 查看与下载生成结果

生成成功后：

- 主区域显示当前选中的结果图。
- 右侧显示当前生成历史缩略图。
- 点击右侧缩略图可以切换主图。
- 在主图上右键可以：
  - 复制源链接
  - 下载图片
  - 复制本地图片路径，本地完整模式可用

通过页面下载图片后，该生成图会标记为“已下载”。

### 5. 失败重试

如果生成失败，右侧会显示失败缩略卡片。

- 点击“重试”会重新发送该条失败记录对应的请求。
- 页面下方会提示当前有多少个请求正在重试。
- 重试按钮在请求期间会显示“重试中”并临时禁用。

## 参数说明

| 参数 | 说明 | 默认值 |
|---|---|---|
| model | 固定模型 | `gpt-image-2` |
| size | 图片尺寸 | `auto` |
| quality | 质量 | `auto` |
| moderation | 内容审核强度 | `auto` |
| count | 生成数量 | `1` |
| background | 固定传给接口，不提供 UI | `auto` |
| output_format | 固定传给接口 | `png` |

尺寸选项：

- `auto`
- `1024x1024`
- `1536x1024`
- `1024x1536`
- `2048x2048`
- `2048x1152`
- `3840x2160`
- `2160x3840`

质量选项：

- `auto`
- `low`
- `medium`
- `high`

审核强度：

- `auto`
- `low`

## 本地完整模式数据目录

本地完整模式运行后会创建 `data/` 目录：

```text
data/
  providers.json
  history.json
  uploads/
    uploads.json
    image_1.png
    image_2.png
  generated/
    generated_*.png
```

说明：

- `data/providers.json`：保存提供商配置和加密 API Key。
- `data/uploads/uploads.json`：保存输入图记录和编号状态。
- `data/uploads/`：保存图生图输入图副本。
- `data/history.json`：保存生成历史、错误信息、下载状态。
- `data/generated/`：保存生成图缓存。

`data/` 已加入 `.gitignore`，避免误提交 API Key 和图片文件。

## 缓存与清理规则

本地完整模式输入图：

- 上传后长期保存在 `data/uploads/`。
- 后端重启不会清理输入图。
- 删除按钮只删除项目内副本。
- 删除后图片编号会重新顺位排列。

本地完整模式生成图：

- 生成后先缓存到 `data/generated/`。
- 通过页面下载后标记为已下载。
- 后端下次启动时，会清理未下载的生成图。
- 已下载生成图会继续保留，可在历史中预览。

浏览器缓存：

- 上传图 URL 会带版本参数，例如 `?v=...`。
- 上传图响应头包含 `Cache-Control: no-store`。
- 因此复用 `image_1.png` 等编号时，缩略图和实际图片不会被旧缓存污染。

## 常用命令

```bash
npm run dev
```

启动本地完整模式。

```bash
npm run check
```

运行 TypeScript 类型检查。

```bash
npm run build
```

构建本地完整模式前端。

```bash
npm run build:pages
```

构建 GitHub Pages 静态版。

```bash
npm run preview
```

预览生产构建产物。

## GitHub Pages 部署

项目包含 GitHub Actions workflow：

```text
.github/workflows/pages.yml
```

推送到 `main` 分支后，Actions 会：

1. 安装依赖。
2. 执行 `npm run build:pages`。
3. 上传 `dist/`。
4. 部署到 GitHub Pages。

如果仓库首次启用 Pages，请在 GitHub 仓库设置中将 Pages Source 设置为 GitHub Actions。

## 目录结构

```text
.
  .github/
    workflows/
      pages.yml
  server/
    index.ts
  src/
    App.tsx
    api.ts
    main.tsx
    styles.css
    types.ts
    vite-env.d.ts
  .env.pages
  IMPLEMENTATION_PLAN.md
  README.md
  package.json
```

## 安全说明

本地完整模式使用固定默认开发密钥加密保存 API Key，适合本地个人用途，但不等同于生产级密钥管理。

静态模式不会保存 API Key，但请求会从浏览器直接发出，浏览器扩展、开发者工具、网络环境和目标提供商仍可能看到请求内容。

建议：

- 不要把 `data/` 提交到公开仓库。
- 不要在多人共享机器上保存敏感 API Key。
- 如果提供商不允许浏览器跨域请求，请使用本地完整模式或自行部署后端代理。
- 如果将来要部署给多人使用，应改为服务端环境变量或独立密钥管理方案。

## 常见问题

### 为什么生成多张图比较慢？

当前接口按 `n = 1` 处理，多张图由程序串行请求实现。生成数量越大，等待时间越长。

### GitHub Pages 为什么无法生成图片？

最常见原因是提供商没有开启 CORS。静态版没有后端代理，浏览器会直接请求 `{Base URL}/v1/images/generations` 或 `{Base URL}/v1/images/edits`。如果被 CORS 拦截，请改用本地完整模式。

### 为什么我删除输入图后编号会变化？

这是预期行为。为了保持输入图列表始终是连续编号，删除中间图片后，后续图片会自动前移，例如 `image_3.png` 会变成 `image_2.png`。

### 为什么新上传的 `image_1.png` 不会显示旧缩略图？

本地完整模式下，应用同时做了两件事：

- 上传图 URL 带版本参数。
- 后端图片响应禁用缓存。

因此即使文件名复用，浏览器也会请求当前文件。

### 生成失败后怎么办？

失败信息会显示在页面中。右侧失败卡片提供“重试”按钮，点击后会按原请求参数重新尝试。

### 能否支持其他模型？

当前初版只考虑 `gpt-image-2`。后续可以扩展模型下拉列表和模型参数差异。

## 已知限制

- 只支持 `gpt-image-2`。
- 提供商必须兼容 OpenAI Images API。
- `background` 固定为 `auto`。
- `output_format` 固定为 `png`。
- 生成多张图为串行请求。
- 固定开发密钥加密只适合本地个人用途。
- GitHub Pages 静态模式不支持后端文件缓存、后端启动清理和持久历史。
