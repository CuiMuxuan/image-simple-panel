# Simple Image Panel

Simple Image Panel 是一个本地个人使用的图像生成页面，专注于 `gpt-image-2` 的文生图和图生图工作流。应用由 React 前端和本地 Express 后端组成，后端负责保存提供商配置、加密 API Key、管理上传图片、串行发送生成请求、缓存生成结果和处理下载状态。

## 功能概览

- 文生图 / 图生图双模式。
- 固定模型：`gpt-image-2`。
- OpenAI-compatible Images API 代理：
  - 文生图：`POST {Base URL}/v1/images/generations`
  - 图生图：`POST {Base URL}/v1/images/edits`
- 模型提供商管理：添加、选择、编辑、删除。
- API Key 本地加密保存，前端不回显明文。
- 图生图支持多张输入图，最多 16 张。
- 上传输入图复制到项目目录并自动命名为 `image_1.png`、`image_2.png`。
- 删除输入图后自动顺位重编号。
- 输入图缩略图使用版本参数和 no-cache 响应头，避免复用编号后显示旧图。
- 多张生成图使用串行请求。
- 失败记录显示错误信息，并支持重试。
- 重试时显示当前正在重试的请求数量。
- 生成历史刷新页面后仍可见。
- 生成图右键支持复制源链接、下载图片、复制本地路径。
- 未下载生成图在后端下次启动时清理；已下载生成图保留。

## 技术栈

- 前端：Vite + React + TypeScript
- 图标：lucide-react
- 后端：Node.js + Express
- 上传处理：multer
- HTTP 请求：axios
- 本地存储：JSON 文件 + 本地图片目录

## 环境要求

- Node.js 20 或更高版本。
- 一个兼容 OpenAI Images API 的模型提供商。
- 提供商需要支持 `gpt-image-2`。

## 安装与启动

首次运行：

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

保存后，API Key 会加密写入 `data/providers.json`。前端提供商列表只显示掩码，不返回明文密钥。

### 2. 文生图

1. 选择模式“文生图”。
2. 选择图片尺寸、质量、审核强度。
3. 设置生成数量。
4. 在底部提示词输入框输入描述。
5. 点击发送按钮。

生成数量大于 1 时，后端会按顺序串行请求。每次请求固定发送 `n: 1`。

### 3. 图生图

1. 选择模式“图生图”。
2. 在左侧“输入图片”区域上传图片。
3. 上传后的图片会复制到 `data/uploads/`，并命名为 `image_1.png`、`image_2.png`。
4. 默认所有已上传输入图都会参与本次图生图。
5. 输入提示词并点击发送。

输入图限制：

- 最多 16 张。
- 支持 `png`、`jpg`、`webp`。
- 每张图片最大 50MB。

删除输入图时，只删除项目内副本，不会删除用户原始文件。删除后剩余图片会自动顺位重编号。

### 4. 查看与下载生成结果

生成成功后：

- 主区域显示当前选中的结果图。
- 右侧显示本次程序生成历史缩略图。
- 点击右侧缩略图可以切换主图。
- 在主图上右键可以：
  - 复制源链接
  - 下载图片
  - 复制本地图片路径

通过页面下载图片后，该生成图会标记为“已下载”。

### 5. 失败重试

如果生成失败，右侧会显示失败缩略卡片。

- 点击“重试”会重新发送该条失败记录对应的请求。
- 页面下方会提示当前有多少个请求正在重试。
- 重试按钮在请求期间会显示“重试中”并临时禁用。

## 参数说明

当前初版支持以下参数。

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

## 本地数据目录

应用运行后会创建 `data/` 目录：

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

输入图：

- 上传后长期保存在 `data/uploads/`。
- 后端重启不会清理输入图。
- 删除按钮只删除项目内副本。
- 删除后图片编号会重新顺位排列。

生成图：

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

启动前端和后端开发服务。

```bash
npm run check
```

运行 TypeScript 类型检查。

```bash
npm run build
```

构建生产版本。

```bash
npm run preview
```

预览生产构建产物。

## 目录结构

```text
.
  server/
    index.ts
  src/
    App.tsx
    api.ts
    main.tsx
    styles.css
    types.ts
  docs/
    images/
      app-overview.png
  IMPLEMENTATION_PLAN.md
  README.md
  package.json
```

## 安全说明

本项目面向本地个人使用。API Key 会使用固定默认开发密钥加密后保存在本机文件中，这可以避免明文直接落盘，但不等同于生产级密钥管理。

建议：

- 不要把 `data/` 提交到公开仓库。
- 不要在多人共享机器上保存敏感 API Key。
- 如果将来要部署给多人使用，应改为服务端环境变量或独立密钥管理方案。

## 常见问题

### 为什么生成多张图比较慢？

当前接口按 `n = 1` 处理，多张图由后端串行请求实现。生成数量越大，等待时间越长。

### 为什么我删除输入图后编号会变化？

这是预期行为。为了保持输入图列表始终是连续编号，删除中间图片后，后续图片会自动前移，例如 `image_3.png` 会变成 `image_2.png`。

### 为什么新上传的 `image_1.png` 不会显示旧缩略图？

应用同时做了两件事：

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
