import axios from "axios";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response, type NextFunction } from "express";
import FormData from "form-data";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "data");
const uploadsDir = path.join(dataDir, "uploads");
const generatedDir = path.join(dataDir, "generated");
const providersPath = path.join(dataDir, "providers.json");
const uploadsPath = path.join(uploadsDir, "uploads.json");
const historyPath = path.join(dataDir, "history.json");
const port = Number(process.env.PORT ?? 8787);
const fixedSecret = "image-simple-panel-default-development-secret-v1";
const uploadLimit = 16;
const maxInputImageSize = 50 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

type ProviderRecord = {
  id: string;
  name: string;
  baseUrl: string;
  encryptedApiKey: string;
  createdAt: string;
  updatedAt: string;
};

type ProvidersState = {
  providers: ProviderRecord[];
  selectedProviderId: string | null;
};

type UploadRecord = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  absolutePath: string;
  createdAt: string;
  updatedAt?: string;
};

type UploadsState = {
  uploads: UploadRecord[];
  nextIndex: number;
};

type Mode = "text" | "image";
type ImageStatus = "succeeded" | "failed";

type GeneratePayload = {
  mode: Mode;
  prompt: string;
  providerId?: string;
  size: string;
  quality: string;
  moderation: "auto" | "low";
  count: number;
};

type HistoryRecord = {
  id: string;
  status: ImageStatus;
  mode: Mode;
  prompt: string;
  providerId: string;
  providerName: string;
  model: "gpt-image-2";
  size: string;
  quality: string;
  moderation: "auto" | "low";
  sourceUrl: string | null;
  localFileName: string | null;
  localPath: string | null;
  absolutePath: string | null;
  downloaded: boolean;
  createdAt: string;
  error: string | null;
  retryPayload: GeneratePayload;
};

type HistoryState = {
  items: HistoryRecord[];
};

type ProviderResponse = Omit<ProviderRecord, "encryptedApiKey"> & {
  apiKeySet: boolean;
  apiKeyPreview: string;
};

type ApiImageResult = {
  sourceUrl: string | null;
  buffer: Buffer;
};

type ApiImageDataItem = {
  url?: string;
  b64_json?: string;
  image_url?: {
    url?: string;
  };
};

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxInputImageSize,
    files: uploadLimit
  }
});

app.use(express.json({ limit: "2mb" }));

async function ensureStorage() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(uploadsDir, { recursive: true });
  await fsp.mkdir(generatedDir, { recursive: true });
  await ensureJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  await ensureJson<UploadsState>(uploadsPath, { uploads: [], nextIndex: 1 });
  await ensureJson<HistoryState>(historyPath, { items: [] });
}

async function ensureJson<T>(filePath: string, initial: T) {
  try {
    await fsp.access(filePath);
  } catch {
    await writeJson(filePath, initial);
  }
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(filePath: string, value: T) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fsp.rename(tempPath, filePath);
}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function keyFromSecret() {
  return crypto.createHash("sha256").update(fixedSecret).digest();
}

function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyFromSecret(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptApiKey(value: string) {
  const [version, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Unsupported API key encryption format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyFromSecret(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final()
  ]).toString("utf8");
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskProvider(provider: ProviderRecord): ProviderResponse {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    apiKeySet: Boolean(provider.encryptedApiKey),
    apiKeyPreview: "••••••••"
  };
}

function uploadUrl(fileName: string) {
  return `/api/uploads/file/${encodeURIComponent(fileName)}`;
}

function generatedUrl(fileName: string) {
  return `/api/generated/${encodeURIComponent(fileName)}`;
}

function serializeUpload(uploadRecord: UploadRecord) {
  const version = encodeURIComponent(uploadRecord.updatedAt ?? uploadRecord.createdAt ?? uploadRecord.id);
  return {
    ...uploadRecord,
    url: `${uploadUrl(uploadRecord.fileName)}?v=${version}`
  };
}

function serializeHistoryItem(item: HistoryRecord) {
  return {
    ...item,
    imageUrl: item.localFileName ? generatedUrl(item.localFileName) : null
  };
}

function relativeToRoot(absolutePath: string) {
  return path.relative(rootDir, absolutePath).replaceAll("\\", "/");
}

function extForMime(mimeType: string, originalName: string) {
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  const ext = path.extname(originalName).toLowerCase();
  return ext || ".png";
}

function extensionForUpload(uploadRecord: UploadRecord) {
  return extForMime(uploadRecord.mimeType, uploadRecord.fileName);
}

function fileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return path.basename(parsed.pathname);
  } catch {
    return "";
  }
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data;
    if (Buffer.isBuffer(data)) {
      return data.toString("utf8");
    }
    if (typeof data === "string") {
      return data;
    }
    if (data && typeof data === "object") {
      const detail = data as { error?: unknown; message?: unknown };
      if (typeof detail.message === "string") {
        return detail.message;
      }
      if (detail.error && typeof detail.error === "object" && "message" in detail.error) {
        const nested = detail.error as { message?: unknown };
        if (typeof nested.message === "string") {
          return nested.message;
        }
      }
      return JSON.stringify(data);
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

async function cleanupUndownloadedGeneratedImages() {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  const kept: HistoryRecord[] = [];
  for (const item of history.items) {
    if (item.status === "succeeded" && !item.downloaded) {
      if (item.absolutePath) {
        await fsp.rm(item.absolutePath, { force: true }).catch(() => undefined);
      }
      continue;
    }
    kept.push(item);
  }
  if (kept.length !== history.items.length) {
    await writeJson(historyPath, { items: kept });
  }
}

async function getProviderForRequest(providerId?: string) {
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  const selectedId = providerId || state.selectedProviderId;
  const provider = state.providers.find((item) => item.id === selectedId);
  if (!provider) {
    throw new HttpError(400, "请先添加并选择模型提供商。");
  }
  return {
    provider,
    apiKey: decryptApiKey(provider.encryptedApiKey)
  };
}

class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function validatePayload(body: Partial<GeneratePayload>): GeneratePayload {
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    throw new HttpError(400, "请输入提示词。");
  }
  const mode = body.mode === "image" ? "image" : "text";
  const count = Math.max(1, Math.min(10, Number(body.count ?? 1) || 1));
  const moderation = body.moderation === "low" ? "low" : "auto";
  const size = String(body.size ?? "auto");
  const quality = String(body.quality ?? "auto");
  return {
    mode,
    prompt,
    providerId: body.providerId,
    size,
    quality,
    moderation,
    count
  };
}

function commonGenerationFields(payload: GeneratePayload) {
  return {
    model: "gpt-image-2",
    prompt: payload.prompt,
    n: 1,
    size: payload.size,
    quality: payload.quality,
    moderation: payload.moderation,
    background: "auto",
    output_format: "png"
  };
}

async function callTextGeneration(payload: GeneratePayload, provider: ProviderRecord, apiKey: string): Promise<ApiImageResult> {
  const response = await axios.post(
    `${provider.baseUrl}/v1/images/generations`,
    commonGenerationFields(payload),
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 180000
    }
  );
  return resolveApiImageResult(response.data);
}

async function callImageEdit(payload: GeneratePayload, provider: ProviderRecord, apiKey: string): Promise<ApiImageResult> {
  const uploadsState = await readJson<UploadsState>(uploadsPath, { uploads: [], nextIndex: 1 });
  if (uploadsState.uploads.length === 0) {
    throw new HttpError(400, "图生图模式需要至少上传一张输入图片。");
  }
  if (uploadsState.uploads.length > uploadLimit) {
    throw new HttpError(400, `图生图输入图最多支持 ${uploadLimit} 张。`);
  }

  const form = new FormData();
  const fields = commonGenerationFields(payload);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  for (const item of uploadsState.uploads) {
    form.append("image", fs.createReadStream(item.absolutePath), {
      filename: item.fileName,
      contentType: item.mimeType
    });
  }

  const response = await axios.post(`${provider.baseUrl}/v1/images/edits`, form, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...form.getHeaders()
    },
    maxBodyLength: Infinity,
    timeout: 180000
  });
  return resolveApiImageResult(response.data);
}

async function resolveApiImageResult(data: unknown): Promise<ApiImageResult> {
  const imageData = data as {
    data?: ApiImageDataItem[];
    url?: string;
    b64_json?: string;
    image_url?: {
      url?: string;
    };
  };
  const first: ApiImageDataItem = imageData.data?.[0] ?? imageData;
  const sourceUrl = first.url ?? first.image_url?.url ?? null;
  const b64 = first.b64_json ?? null;

  if (b64) {
    return {
      sourceUrl,
      buffer: Buffer.from(b64, "base64")
    };
  }
  if (!sourceUrl) {
    throw new Error("接口没有返回可用的图片 URL 或 b64_json。");
  }

  const imageResponse = await axios.get<ArrayBuffer>(sourceUrl, {
    responseType: "arraybuffer",
    timeout: 180000
  });
  return {
    sourceUrl,
    buffer: Buffer.from(imageResponse.data)
  };
}

async function appendHistory(item: HistoryRecord) {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  history.items.unshift(item);
  await writeJson(historyPath, history);
}

async function renumberUploads(state: UploadsState) {
  const renumbered: UploadRecord[] = [];
  const timestamp = nowIso();
  for (const [index, item] of state.uploads.entries()) {
    const nextFileName = `image_${index + 1}${extensionForUpload(item)}`;
    const nextAbsolutePath = path.join(uploadsDir, nextFileName);
    const changed = item.absolutePath !== nextAbsolutePath;
    if (item.absolutePath !== nextAbsolutePath) {
      await fsp.rename(item.absolutePath, nextAbsolutePath);
    }
    renumbered.push({
      ...item,
      fileName: nextFileName,
      path: relativeToRoot(nextAbsolutePath),
      absolutePath: nextAbsolutePath,
      updatedAt: changed ? timestamp : item.updatedAt ?? item.createdAt
    });
  }
  state.uploads = renumbered;
  state.nextIndex = state.uploads.length + 1;
}

async function persistGeneratedImage(result: ApiImageResult) {
  const sourceName = result.sourceUrl ? fileNameFromUrl(result.sourceUrl) : "";
  const extension = [".png", ".jpg", ".jpeg", ".webp"].includes(path.extname(sourceName).toLowerCase())
    ? path.extname(sourceName).toLowerCase()
    : ".png";
  const localFileName = `generated_${Date.now()}_${createId()}${extension}`;
  const absolutePath = path.join(generatedDir, localFileName);
  await fsp.writeFile(absolutePath, result.buffer);
  return {
    localFileName,
    localPath: relativeToRoot(absolutePath),
    absolutePath
  };
}

async function runSingleGeneration(payload: GeneratePayload) {
  const { provider, apiKey } = await getProviderForRequest(payload.providerId);
  const recordBase = {
    id: createId(),
    mode: payload.mode,
    prompt: payload.prompt,
    providerId: provider.id,
    providerName: provider.name,
    model: "gpt-image-2" as const,
    size: payload.size,
    quality: payload.quality,
    moderation: payload.moderation,
    downloaded: false,
    createdAt: nowIso(),
    retryPayload: { ...payload, count: 1, providerId: provider.id }
  };

  try {
    const result = payload.mode === "image"
      ? await callImageEdit(payload, provider, apiKey)
      : await callTextGeneration(payload, provider, apiKey);
    const cached = await persistGeneratedImage(result);
    const item: HistoryRecord = {
      ...recordBase,
      status: "succeeded",
      sourceUrl: result.sourceUrl,
      localFileName: cached.localFileName,
      localPath: cached.localPath,
      absolutePath: cached.absolutePath,
      error: null
    };
    await appendHistory(item);
    return item;
  } catch (error) {
    const item: HistoryRecord = {
      ...recordBase,
      status: "failed",
      sourceUrl: null,
      localFileName: null,
      localPath: null,
      absolutePath: null,
      error: errorMessage(error)
    };
    await appendHistory(item);
    return item;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/providers", async (_req, res) => {
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  res.json({
    providers: state.providers.map(maskProvider),
    selectedProviderId: state.selectedProviderId
  });
});

app.post("/api/providers", async (req, res) => {
  const name = String(req.body.name ?? "").trim();
  const baseUrl = normalizeBaseUrl(String(req.body.baseUrl ?? ""));
  const apiKey = String(req.body.apiKey ?? "").trim();
  if (!name || !baseUrl || !apiKey) {
    throw new HttpError(400, "提供商名称、API 地址和 API 密钥都不能为空。");
  }
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  const timestamp = nowIso();
  const provider: ProviderRecord = {
    id: createId(),
    name,
    baseUrl,
    encryptedApiKey: encryptApiKey(apiKey),
    createdAt: timestamp,
    updatedAt: timestamp
  };
  state.providers.push(provider);
  state.selectedProviderId = provider.id;
  await writeJson(providersPath, state);
  res.status(201).json({
    provider: maskProvider(provider),
    selectedProviderId: state.selectedProviderId
  });
});

app.put("/api/providers/:id", async (req, res) => {
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  const provider = state.providers.find((item) => item.id === req.params.id);
  if (!provider) {
    throw new HttpError(404, "找不到该提供商。");
  }
  const name = String(req.body.name ?? "").trim();
  const baseUrl = normalizeBaseUrl(String(req.body.baseUrl ?? ""));
  const apiKey = typeof req.body.apiKey === "string" ? req.body.apiKey.trim() : "";
  if (!name || !baseUrl) {
    throw new HttpError(400, "提供商名称和 API 地址不能为空。");
  }
  provider.name = name;
  provider.baseUrl = baseUrl;
  if (apiKey) {
    provider.encryptedApiKey = encryptApiKey(apiKey);
  }
  provider.updatedAt = nowIso();
  await writeJson(providersPath, state);
  res.json({ provider: maskProvider(provider), selectedProviderId: state.selectedProviderId });
});

app.delete("/api/providers/:id", async (req, res) => {
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  state.providers = state.providers.filter((item) => item.id !== req.params.id);
  if (state.selectedProviderId === req.params.id) {
    state.selectedProviderId = state.providers[0]?.id ?? null;
  }
  await writeJson(providersPath, state);
  res.json({
    providers: state.providers.map(maskProvider),
    selectedProviderId: state.selectedProviderId
  });
});

app.post("/api/providers/select", async (req, res) => {
  const providerId = String(req.body.providerId ?? "");
  const state = await readJson<ProvidersState>(providersPath, { providers: [], selectedProviderId: null });
  if (!state.providers.some((item) => item.id === providerId)) {
    throw new HttpError(404, "找不到该提供商。");
  }
  state.selectedProviderId = providerId;
  await writeJson(providersPath, state);
  res.json({ selectedProviderId: state.selectedProviderId });
});

app.get("/api/uploads", async (_req, res) => {
  const state = await readJson<UploadsState>(uploadsPath, { uploads: [], nextIndex: 1 });
  res.json({
    uploads: state.uploads.map(serializeUpload),
    limit: uploadLimit
  });
});

app.post("/api/uploads", upload.array("images", uploadLimit), async (req, res) => {
  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.length === 0) {
    throw new HttpError(400, "请选择要上传的图片。");
  }
  if (files.some((file) => !allowedMimeTypes.has(file.mimetype))) {
    throw new HttpError(400, "仅支持 png、jpg、webp 图片。");
  }
  const state = await readJson<UploadsState>(uploadsPath, { uploads: [], nextIndex: 1 });
  await renumberUploads(state);
  if (state.uploads.length + files.length > uploadLimit) {
    throw new HttpError(400, `图生图输入图最多支持 ${uploadLimit} 张。`);
  }

  const created: UploadRecord[] = [];
  for (const file of files) {
    const ext = extForMime(file.mimetype, file.originalname);
    const fileName = `image_${state.nextIndex}${ext}`;
    const absolutePath = path.join(uploadsDir, fileName);
    const timestamp = nowIso();
    state.nextIndex += 1;
    await fsp.writeFile(absolutePath, file.buffer);
    const record: UploadRecord = {
      id: createId(),
      fileName,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: relativeToRoot(absolutePath),
      absolutePath,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    state.uploads.push(record);
    created.push(record);
  }
  await writeJson(uploadsPath, state);
  res.status(201).json({
    uploads: state.uploads.map(serializeUpload),
    created: created.map(serializeUpload),
    limit: uploadLimit
  });
});

app.delete("/api/uploads/:id", async (req, res) => {
  const state = await readJson<UploadsState>(uploadsPath, { uploads: [], nextIndex: 1 });
  const target = state.uploads.find((item) => item.id === req.params.id);
  if (!target) {
    throw new HttpError(404, "找不到该输入图片。");
  }
  await fsp.rm(target.absolutePath, { force: true });
  state.uploads = state.uploads.filter((item) => item.id !== req.params.id);
  await renumberUploads(state);
  await writeJson(uploadsPath, state);
  res.json({
    uploads: state.uploads.map(serializeUpload),
    limit: uploadLimit
  });
});

app.get("/api/uploads/file/:fileName", (req, res) => {
  const filePath = path.join(uploadsDir, path.basename(req.params.fileName));
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.sendFile(filePath);
});

app.get("/api/history", async (_req, res) => {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  res.json({
    items: history.items.map(serializeHistoryItem)
  });
});

app.post("/api/generate", async (req, res) => {
  const payload = validatePayload(req.body);
  const results: HistoryRecord[] = [];
  for (let index = 0; index < payload.count; index += 1) {
    const item = await runSingleGeneration({ ...payload, count: 1 });
    results.push(item);
  }
  res.json({ items: results.map(serializeHistoryItem) });
});

app.post("/api/history/:id/retry", async (req, res) => {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  const target = history.items.find((item) => item.id === req.params.id);
  if (!target) {
    throw new HttpError(404, "找不到该历史记录。");
  }
  const item = await runSingleGeneration({ ...target.retryPayload, count: 1 });
  res.json({ item: serializeHistoryItem(item) });
});

app.post("/api/history/:id/downloaded", async (req, res) => {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  const target = history.items.find((item) => item.id === req.params.id);
  if (!target) {
    throw new HttpError(404, "找不到该历史记录。");
  }
  target.downloaded = true;
  await writeJson(historyPath, history);
  res.json({ item: serializeHistoryItem(target) });
});

app.get("/api/generated/:fileName", (req, res) => {
  const filePath = path.join(generatedDir, path.basename(req.params.fileName));
  res.sendFile(filePath);
});

app.get("/api/generated/:id/download", async (req, res) => {
  const history = await readJson<HistoryState>(historyPath, { items: [] });
  const target = history.items.find((item) => item.id === req.params.id);
  if (!target?.absolutePath || !target.localFileName) {
    throw new HttpError(404, "找不到可下载的图片。");
  }
  target.downloaded = true;
  await writeJson(historyPath, history);
  res.download(target.absolutePath, target.localFileName);
});

const distDir = path.join(rootDir, "dist");
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(path.join(distDir, "index.html"));
      return;
    }
    next();
  });
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ message: error.message });
    return;
  }
  if (error instanceof multer.MulterError) {
    res.status(400).json({ message: error.message });
    return;
  }
  res.status(500).json({ message: errorMessage(error) });
});

await ensureStorage();
await cleanupUndownloadedGeneratedImages();

app.listen(port, "127.0.0.1", () => {
  console.log(`Image Simple Panel API listening at http://127.0.0.1:${port}`);
});
