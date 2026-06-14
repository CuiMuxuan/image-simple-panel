export type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  createdAt: string;
  updatedAt: string;
  apiKeySet: boolean;
  apiKeyPreview: string;
};

export type UploadImage = {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  absolutePath: string;
  createdAt: string;
  updatedAt?: string;
  url: string;
  file?: File;
};

export type Mode = "text" | "image";
export type Moderation = "auto" | "low";
export type HistoryStatus = "succeeded" | "failed";

export type HistoryItem = {
  id: string;
  status: HistoryStatus;
  mode: Mode;
  prompt: string;
  providerId: string;
  providerName: string;
  model: "gpt-image-2";
  size: string;
  quality: string;
  moderation: Moderation;
  sourceUrl: string | null;
  localFileName: string | null;
  localPath: string | null;
  absolutePath: string | null;
  downloaded: boolean;
  createdAt: string;
  error: string | null;
  imageUrl: string | null;
  retryPayload?: GeneratePayload;
};

export type GeneratePayload = {
  mode: Mode;
  prompt: string;
  providerId?: string;
  size: string;
  quality: string;
  moderation: Moderation;
  count: number;
};
