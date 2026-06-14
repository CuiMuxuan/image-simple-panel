import type { GeneratePayload, HistoryItem, Provider, UploadImage } from "./types";

const appMode = import.meta.env.VITE_APP_MODE === "static" ? "static" : "local";

type ProviderInput = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

type ProviderState = {
  providers: Provider[];
  selectedProviderId: string | null;
};

type StaticProvider = Provider & {
  apiKey: string;
};

const uploadLimit = 16;
const staticProviders: StaticProvider[] = [];
let staticSelectedProviderId: string | null = null;
let staticUploads: UploadImage[] = [];
let staticHistory: HistoryItem[] = [];
let uploadObjectUrls: string[] = [];
let generatedObjectUrls: string[] = [];

export function getRuntimeMode() {
  return appMode;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : "请求失败。";
    throw new Error(message);
  }
  return payload as T;
}

function createId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function maskProvider(provider: StaticProvider): Provider {
  const { apiKey: _apiKey, ...safeProvider } = provider;
  return safeProvider;
}

function currentProvider() {
  const provider = staticProviders.find((item) => item.id === staticSelectedProviderId);
  if (!provider) {
    throw new Error("请先添加并选择模型提供商。");
  }
  return provider;
}

function extensionForFile(file: File) {
  if (file.type === "image/png") {
    return ".png";
  }
  if (file.type === "image/jpeg") {
    return ".jpg";
  }
  if (file.type === "image/webp") {
    return ".webp";
  }
  const ext = file.name.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
  return ext || ".png";
}

function reorderStaticUploads() {
  staticUploads = staticUploads.map((item, index) => {
    const ext = item.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ".png";
    const fileName = `image_${index + 1}${ext}`;
    return {
      ...item,
      fileName,
      path: fileName,
      absolutePath: fileName,
      updatedAt: nowIso()
    };
  });
}

function staticErrorRecord(payload: GeneratePayload, provider: StaticProvider, message: string): HistoryItem {
  return {
    id: createId(),
    status: "failed",
    mode: payload.mode,
    prompt: payload.prompt,
    providerId: provider.id,
    providerName: provider.name,
    model: "gpt-image-2",
    size: payload.size,
    quality: payload.quality,
    moderation: payload.moderation,
    sourceUrl: null,
    localFileName: null,
    localPath: null,
    absolutePath: null,
    downloaded: false,
    createdAt: nowIso(),
    error: message,
    imageUrl: null,
    retryPayload: { ...payload, count: 1, providerId: provider.id }
  };
}

function serializeStaticProviderState(): ProviderState {
  return {
    providers: staticProviders.map(maskProvider),
    selectedProviderId: staticSelectedProviderId
  };
}

export async function getProviders() {
  if (appMode === "static") {
    return serializeStaticProviderState();
  }
  return parseResponse<ProviderState>(await fetch("/api/providers"));
}

export async function createProvider(input: ProviderInput) {
  if (appMode === "static") {
    const name = input.name.trim();
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const apiKey = input.apiKey.trim();
    if (!name || !baseUrl || !apiKey) {
      throw new Error("提供商名称、API 地址和 API 密钥都不能为空。");
    }
    const timestamp = nowIso();
    const provider: StaticProvider = {
      id: createId(),
      name,
      baseUrl,
      apiKey,
      createdAt: timestamp,
      updatedAt: timestamp,
      apiKeySet: true,
      apiKeyPreview: "仅当前页面会话"
    };
    staticProviders.push(provider);
    staticSelectedProviderId = provider.id;
    return {
      provider: maskProvider(provider),
      selectedProviderId: provider.id
    };
  }
  return parseResponse<{ provider: Provider; selectedProviderId: string }>(
    await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateProvider(id: string, input: { name: string; baseUrl: string; apiKey?: string }) {
  if (appMode === "static") {
    const provider = staticProviders.find((item) => item.id === id);
    if (!provider) {
      throw new Error("找不到该提供商。");
    }
    const name = input.name.trim();
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    if (!name || !baseUrl) {
      throw new Error("提供商名称和 API 地址不能为空。");
    }
    provider.name = name;
    provider.baseUrl = baseUrl;
    if (input.apiKey?.trim()) {
      provider.apiKey = input.apiKey.trim();
    }
    provider.updatedAt = nowIso();
    return {
      provider: maskProvider(provider),
      selectedProviderId: staticSelectedProviderId
    };
  }
  return parseResponse<{ provider: Provider; selectedProviderId: string | null }>(
    await fetch(`/api/providers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function deleteProvider(id: string) {
  if (appMode === "static") {
    const index = staticProviders.findIndex((item) => item.id === id);
    if (index >= 0) {
      staticProviders.splice(index, 1);
    }
    if (staticSelectedProviderId === id) {
      staticSelectedProviderId = staticProviders[0]?.id ?? null;
    }
    return serializeStaticProviderState();
  }
  return parseResponse<ProviderState>(
    await fetch(`/api/providers/${id}`, { method: "DELETE" })
  );
}

export async function selectProvider(providerId: string) {
  if (appMode === "static") {
    if (!staticProviders.some((item) => item.id === providerId)) {
      throw new Error("找不到该提供商。");
    }
    staticSelectedProviderId = providerId;
    return { selectedProviderId: providerId };
  }
  return parseResponse<{ selectedProviderId: string }>(
    await fetch("/api/providers/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId })
    })
  );
}

export async function getUploads() {
  if (appMode === "static") {
    return {
      uploads: staticUploads,
      limit: uploadLimit
    };
  }
  return parseResponse<{ uploads: UploadImage[]; limit: number }>(await fetch("/api/uploads"));
}

export async function uploadImages(files: File[]) {
  if (appMode === "static") {
    if (staticUploads.length + files.length > uploadLimit) {
      throw new Error(`图生图输入图最多支持 ${uploadLimit} 张。`);
    }
    const created: UploadImage[] = [];
    for (const file of files) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
        throw new Error("仅支持 png、jpg、webp 图片。");
      }
      const objectUrl = URL.createObjectURL(file);
      uploadObjectUrls.push(objectUrl);
      const index = staticUploads.length + created.length + 1;
      const fileName = `image_${index}${extensionForFile(file)}`;
      const timestamp = nowIso();
      created.push({
        id: createId(),
        fileName,
        originalName: file.name,
        mimeType: file.type,
        size: file.size,
        path: fileName,
        absolutePath: fileName,
        createdAt: timestamp,
        updatedAt: timestamp,
        url: objectUrl,
        file
      });
    }
    staticUploads = [...staticUploads, ...created];
    return {
      uploads: staticUploads,
      created,
      limit: uploadLimit
    };
  }
  const form = new FormData();
  for (const file of files) {
    form.append("images", file);
  }
  return parseResponse<{ uploads: UploadImage[]; created: UploadImage[]; limit: number }>(
    await fetch("/api/uploads", {
      method: "POST",
      body: form
    })
  );
}

export async function removeUpload(id: string) {
  if (appMode === "static") {
    const removed = staticUploads.find((item) => item.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      uploadObjectUrls = uploadObjectUrls.filter((item) => item !== removed.url);
    }
    staticUploads = staticUploads.filter((item) => item.id !== id);
    reorderStaticUploads();
    return {
      uploads: staticUploads,
      limit: uploadLimit
    };
  }
  return parseResponse<{ uploads: UploadImage[]; limit: number }>(
    await fetch(`/api/uploads/${id}`, { method: "DELETE" })
  );
}

export async function getHistory() {
  if (appMode === "static") {
    return {
      items: staticHistory
    };
  }
  return parseResponse<{ items: HistoryItem[] }>(await fetch("/api/history"));
}

export async function generateImages(payload: GeneratePayload) {
  if (appMode === "static") {
    const results: HistoryItem[] = [];
    for (let index = 0; index < payload.count; index += 1) {
      const item = await runStaticGeneration({ ...payload, count: 1 });
      results.push(item);
      staticHistory = [item, ...staticHistory];
    }
    return { items: results };
  }
  return parseResponse<{ items: HistoryItem[] }>(
    await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
}

export async function retryHistoryItem(id: string) {
  if (appMode === "static") {
    const target = staticHistory.find((item) => item.id === id);
    if (!target?.retryPayload) {
      throw new Error("找不到该历史记录。");
    }
    const item = await runStaticGeneration(target.retryPayload);
    staticHistory = [item, ...staticHistory];
    return { item };
  }
  return parseResponse<{ item: HistoryItem }>(
    await fetch(`/api/history/${id}/retry`, { method: "POST" })
  );
}

export async function markDownloaded(id: string) {
  if (appMode === "static") {
    const target = staticHistory.find((item) => item.id === id);
    if (!target) {
      throw new Error("找不到该历史记录。");
    }
    target.downloaded = true;
    return { item: target };
  }
  return parseResponse<{ item: HistoryItem }>(
    await fetch(`/api/history/${id}/downloaded`, { method: "POST" })
  );
}

async function runStaticGeneration(payload: GeneratePayload): Promise<HistoryItem> {
  const provider = currentProvider();
  try {
    const result = payload.mode === "image"
      ? await callStaticImageEdit(payload, provider)
      : await callStaticTextGeneration(payload, provider);
    const imageUrl = result.imageUrl;
    const item: HistoryItem = {
      id: createId(),
      status: "succeeded",
      mode: payload.mode,
      prompt: payload.prompt,
      providerId: provider.id,
      providerName: provider.name,
      model: "gpt-image-2",
      size: payload.size,
      quality: payload.quality,
      moderation: payload.moderation,
      sourceUrl: result.sourceUrl,
      localFileName: null,
      localPath: null,
      absolutePath: null,
      downloaded: false,
      createdAt: nowIso(),
      error: null,
      imageUrl,
      retryPayload: { ...payload, count: 1, providerId: provider.id }
    };
    return item;
  } catch (error) {
    return staticErrorRecord(payload, provider, error instanceof Error ? error.message : "生成失败。");
  }
}

async function callStaticTextGeneration(payload: GeneratePayload, provider: StaticProvider) {
  const response = await fetch(`${provider.baseUrl}/v1/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(commonStaticFields(payload))
  });
  return parseStaticImageResponse(response);
}

async function callStaticImageEdit(payload: GeneratePayload, provider: StaticProvider) {
  if (staticUploads.length === 0) {
    throw new Error("图生图模式需要至少上传一张输入图。");
  }
  const form = new FormData();
  const fields = commonStaticFields(payload);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  for (const upload of staticUploads) {
    if (!upload.file) {
      throw new Error("静态模式下输入图仅保存在当前页面会话中，请重新上传。");
    }
    form.append("image", upload.file, upload.fileName);
  }
  const response = await fetch(`${provider.baseUrl}/v1/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`
    },
    body: form
  });
  return parseStaticImageResponse(response);
}

function commonStaticFields(payload: GeneratePayload) {
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

async function parseStaticImageResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { message: await response.text() };
  if (!response.ok) {
    const message = typeof data?.message === "string"
      ? data.message
      : typeof data?.error?.message === "string"
        ? data.error.message
        : "请求失败。";
    throw new Error(message);
  }
  const first = data?.data?.[0] ?? data;
  const sourceUrl = first?.url ?? first?.image_url?.url ?? null;
  const b64 = first?.b64_json ?? null;
  if (b64) {
    const blob = base64ToBlob(b64, "image/png");
    const imageUrl = URL.createObjectURL(blob);
    generatedObjectUrls.push(imageUrl);
    return { sourceUrl, imageUrl };
  }
  if (!sourceUrl) {
    throw new Error("接口没有返回可用的图片 URL 或 b64_json。");
  }
  return {
    sourceUrl,
    imageUrl: sourceUrl
  };
}

function base64ToBlob(base64: string, mimeType: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
