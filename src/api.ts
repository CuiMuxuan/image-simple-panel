import type { GeneratePayload, HistoryItem, Provider, UploadImage } from "./types";

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

export async function getProviders() {
  return parseResponse<{ providers: Provider[]; selectedProviderId: string | null }>(
    await fetch("/api/providers")
  );
}

export async function createProvider(input: { name: string; baseUrl: string; apiKey: string }) {
  return parseResponse<{ provider: Provider; selectedProviderId: string }>(
    await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function updateProvider(id: string, input: { name: string; baseUrl: string; apiKey?: string }) {
  return parseResponse<{ provider: Provider; selectedProviderId: string | null }>(
    await fetch(`/api/providers/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    })
  );
}

export async function deleteProvider(id: string) {
  return parseResponse<{ providers: Provider[]; selectedProviderId: string | null }>(
    await fetch(`/api/providers/${id}`, { method: "DELETE" })
  );
}

export async function selectProvider(providerId: string) {
  return parseResponse<{ selectedProviderId: string }>(
    await fetch("/api/providers/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId })
    })
  );
}

export async function getUploads() {
  return parseResponse<{ uploads: UploadImage[]; limit: number }>(await fetch("/api/uploads"));
}

export async function uploadImages(files: File[]) {
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
  return parseResponse<{ uploads: UploadImage[]; limit: number }>(
    await fetch(`/api/uploads/${id}`, { method: "DELETE" })
  );
}

export async function getHistory() {
  return parseResponse<{ items: HistoryItem[] }>(await fetch("/api/history"));
}

export async function generateImages(payload: GeneratePayload) {
  return parseResponse<{ items: HistoryItem[] }>(
    await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
  );
}

export async function retryHistoryItem(id: string) {
  return parseResponse<{ item: HistoryItem }>(
    await fetch(`/api/history/${id}/retry`, { method: "POST" })
  );
}

export async function markDownloaded(id: string) {
  return parseResponse<{ item: HistoryItem }>(
    await fetch(`/api/history/${id}/downloaded`, { method: "POST" })
  );
}
