import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileImage,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCcw,
  Send,
  Settings,
  Trash2,
  X
} from "lucide-react";
import {
  createProvider,
  deleteProvider,
  generateImages,
  getHistory,
  getProviders,
  getUploads,
  markDownloaded,
  removeUpload,
  retryHistoryItem,
  selectProvider,
  updateProvider,
  uploadImages
} from "./api";
import type { HistoryItem, Mode, Moderation, Provider, UploadImage } from "./types";

const sizeOptions = [
  { value: "auto", label: "自动" },
  { value: "1024x1024", label: "1024 x 1024 正方形" },
  { value: "1536x1024", label: "1536 x 1024 横向" },
  { value: "1024x1536", label: "1024 x 1536 纵向" },
  { value: "2048x2048", label: "2048 x 2048 2K 正方形" },
  { value: "2048x1152", label: "2048 x 1152 2K 横向" },
  { value: "3840x2160", label: "3840 x 2160 4K 横向" },
  { value: "2160x3840", label: "2160 x 3840 4K 纵向" }
];

const qualityOptions = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" }
];

type ProviderDialogState = {
  open: boolean;
  mode: "create" | "edit";
  provider?: Provider;
};

type ProviderForm = {
  name: string;
  baseUrl: string;
  apiKey: string;
};

type ContextMenuState = {
  x: number;
  y: number;
};

export function App() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadImage[]>([]);
  const [uploadLimit, setUploadLimit] = useState(16);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("auto");
  const [quality, setQuality] = useState("auto");
  const [moderation, setModeration] = useState<Moderation>("auto");
  const [count, setCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerDialog, setProviderDialog] = useState<ProviderDialogState>({ open: false, mode: "create" });
  const [providerForm, setProviderForm] = useState<ProviderForm>({ name: "", baseUrl: "", apiKey: "" });
  const [showApiKey, setShowApiKey] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === selectedProviderId) ?? null,
    [providers, selectedProviderId]
  );

  const selectedImage = useMemo(() => {
    if (selectedImageId) {
      return history.find((item) => item.id === selectedImageId) ?? history.find((item) => item.status === "succeeded") ?? null;
    }
    return history.find((item) => item.status === "succeeded") ?? null;
  }, [history, selectedImageId]);

  const selectedIndex = selectedImage
    ? history.filter((item) => item.status === "succeeded").findIndex((item) => item.id === selectedImage.id) + 1
    : 0;
  const successCount = history.filter((item) => item.status === "succeeded").length;

  const loadInitialData = useCallback(async () => {
    try {
      const [providerData, uploadData, historyData] = await Promise.all([
        getProviders(),
        getUploads(),
        getHistory()
      ]);
      setProviders(providerData.providers);
      setSelectedProviderId(providerData.selectedProviderId);
      setUploads(uploadData.uploads);
      setUploadLimit(uploadData.limit);
      setHistory(historyData.items);
      const firstSucceeded = historyData.items.find((item) => item.status === "succeeded");
      setSelectedImageId(firstSucceeded?.id ?? null);
    } catch (err) {
      setError(toMessage(err));
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
    };
  }, []);

  function openCreateProvider() {
    setProviderForm({ name: "", baseUrl: "", apiKey: "" });
    setShowApiKey(false);
    setProviderDialog({ open: true, mode: "create" });
  }

  function openEditProvider() {
    if (!selectedProvider) {
      setNotice("请先选择一个提供商。");
      return;
    }
    setProviderForm({ name: selectedProvider.name, baseUrl: selectedProvider.baseUrl, apiKey: "" });
    setShowApiKey(false);
    setProviderDialog({ open: true, mode: "edit", provider: selectedProvider });
  }

  async function submitProvider() {
    setError(null);
    try {
      if (providerDialog.mode === "create") {
        const result = await createProvider(providerForm);
        setProviders((current) => [...current, result.provider]);
        setSelectedProviderId(result.selectedProviderId);
        setNotice("提供商已添加。");
      } else if (providerDialog.provider) {
        const result = await updateProvider(providerDialog.provider.id, {
          name: providerForm.name,
          baseUrl: providerForm.baseUrl,
          apiKey: providerForm.apiKey || undefined
        });
        setProviders((current) => current.map((item) => (item.id === result.provider.id ? result.provider : item)));
        setNotice("提供商已更新。");
      }
      setProviderDialog({ open: false, mode: "create" });
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function handleDeleteProvider() {
    if (!selectedProvider) {
      setNotice("请先选择一个提供商。");
      return;
    }
    const confirmed = window.confirm(`删除提供商「${selectedProvider.name}」？`);
    if (!confirmed) {
      return;
    }
    try {
      const result = await deleteProvider(selectedProvider.id);
      setProviders(result.providers);
      setSelectedProviderId(result.selectedProviderId);
      setNotice("提供商已删除。");
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function handleSelectProvider(providerId: string) {
    setSelectedProviderId(providerId);
    try {
      await selectProvider(providerId);
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const list = Array.from(files);
    if (uploads.length >= uploadLimit) {
      setNotice(`图生图输入图最多支持 ${uploadLimit} 张。`);
      return;
    }
    if (uploads.length + list.length > uploadLimit) {
      setNotice(`还可以上传 ${uploadLimit - uploads.length} 张，已达到 ${uploadLimit} 张限制。`);
      return;
    }
    setIsUploading(true);
    setError(null);
    try {
      const result = await uploadImages(list);
      setUploads(result.uploads);
      setUploadLimit(result.limit);
      setNotice(`已上传 ${result.created.length} 张输入图。`);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveUpload(id: string) {
    try {
      const result = await removeUpload(id);
      setUploads(result.uploads);
      setUploadLimit(result.limit);
    } catch (err) {
      setError(toMessage(err));
    }
  }

  async function handleGenerate() {
    if (!selectedProviderId) {
      setError("请先添加并选择模型提供商。");
      return;
    }
    if (!prompt.trim()) {
      setError("请输入提示词。");
      return;
    }
    if (mode === "image" && uploads.length === 0) {
      setError("图生图模式需要至少上传一张输入图。");
      return;
    }
    setIsGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateImages({
        mode,
        prompt,
        providerId: selectedProviderId,
        size,
        quality,
        moderation,
        count
      });
      setHistory((current) => mergeHistory(result.items, current));
      const firstSucceeded = result.items.find((item) => item.status === "succeeded");
      if (firstSucceeded) {
        setSelectedImageId(firstSucceeded.id);
      }
      const failedCount = result.items.filter((item) => item.status === "failed").length;
      setNotice(failedCount ? `${failedCount} 张生成失败，错误已显示在右侧。` : `已生成 ${result.items.length} 张图片。`);
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleRetry(item: HistoryItem) {
    setError(null);
    setRetryingIds((current) => {
      const next = new Set(current);
      next.add(item.id);
      setNotice(`当前有 ${next.size} 个请求正在重试。`);
      return next;
    });
    try {
      const result = await retryHistoryItem(item.id);
      setHistory((current) => mergeHistory([result.item], current));
      if (result.item.status === "succeeded") {
        setSelectedImageId(result.item.id);
      }
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setRetryingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        setNotice(next.size > 0 ? `当前有 ${next.size} 个请求正在重试。` : "重试已完成。");
        return next;
      });
    }
  }

  async function handleDownload(item: HistoryItem | null) {
    if (!item) {
      return;
    }
    const link = document.createElement("a");
    link.href = `/api/generated/${item.id}/download`;
    link.download = item.localFileName ?? "generated.png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    try {
      const result = await markDownloaded(item.id);
      setHistory((current) => current.map((entry) => (entry.id === item.id ? result.item : entry)));
    } catch {
      setHistory((current) => current.map((entry) => (entry.id === item.id ? { ...entry, downloaded: true } : entry)));
    }
  }

  async function copyText(text: string, success: string) {
    await navigator.clipboard.writeText(text);
    setNotice(success);
  }

  const canGenerate = Boolean(selectedProviderId && prompt.trim() && !isGenerating && (mode === "text" || uploads.length > 0));

  return (
    <div className="app-shell">
      <aside className="sidebar left-sidebar">
        <section className="panel-section">
          <div className="section-heading">
            <h2>提供商</h2>
            <button className="text-button" type="button" onClick={openCreateProvider}>
              添加模型提供商
            </button>
          </div>
          <div className="provider-row">
            <select
              value={selectedProviderId ?? ""}
              onChange={(event) => void handleSelectProvider(event.target.value)}
              disabled={providers.length === 0}
              aria-label="选择模型提供商"
            >
              {providers.length === 0 ? (
                <option value="">未添加</option>
              ) : (
                providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="provider-actions">
            <button className="icon-button" type="button" onClick={openEditProvider} aria-label="编辑提供商">
              <Edit3 size={16} />
            </button>
            <button className="icon-button danger" type="button" onClick={() => void handleDeleteProvider()} aria-label="删除提供商">
              <Trash2 size={16} />
            </button>
          </div>
        </section>

        <section className="panel-section">
          <h2>模式</h2>
          <div className="segmented">
            <button className={mode === "text" ? "active" : ""} type="button" onClick={() => setMode("text")}>
              文生图
            </button>
            <button className={mode === "image" ? "active" : ""} type="button" onClick={() => setMode("image")}>
              图生图
            </button>
          </div>
        </section>

        <section className="panel-section upload-section">
          <div className="section-heading">
            <h2>输入图片</h2>
            <span>{uploads.length}/{uploadLimit}</span>
          </div>
          <button
            className="upload-zone"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || uploads.length >= uploadLimit}
          >
            {isUploading ? <Loader2 className="spin" size={22} /> : <ImagePlus size={22} />}
            <span>{uploads.length >= uploadLimit ? "已达到数量限制" : "上传图片"}</span>
          </button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => void handleUpload(event.target.files)}
          />
          <div className="upload-list">
            {uploads.map((item) => (
              <article className="upload-card" key={item.id}>
                <img src={item.url} alt={item.fileName} />
                <span title={item.fileName}>{item.fileName}</span>
                <button className="icon-button" type="button" onClick={() => void handleRemoveUpload(item.id)} aria-label={`删除 ${item.fileName}`}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="panel-section parameter-section">
          <h2>模型</h2>
          <div className="readonly-control">gpt-image-2</div>

          <label>
            <span>图片尺寸</span>
            <select value={size} onChange={(event) => setSize(event.target.value)}>
              {sizeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>质量</span>
            <select value={quality} onChange={(event) => setQuality(event.target.value)}>
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="field-label">
            <span>审核强度</span>
            <button className="switch" type="button" onClick={() => setModeration((current) => (current === "auto" ? "low" : "auto"))}>
              <span className={moderation === "low" ? "switch-knob low" : "switch-knob"} />
              {moderation}
            </button>
          </div>

          <label>
            <span>生成数量</span>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(10, Number(event.target.value) || 1)))}
            />
          </label>
        </section>
      </aside>

      <main className="workspace">
        <div className="workspace-top">
          <div className="top-segmented">
            <button className={mode === "text" ? "active" : ""} type="button" onClick={() => setMode("text")}>
              文生图
            </button>
            <button className={mode === "image" ? "active" : ""} type="button" onClick={() => setMode("image")}>
              图生图
            </button>
          </div>
        </div>

        <section
          className="preview-stage"
          onContextMenu={(event) => {
            if (!selectedImage) {
              return;
            }
            event.preventDefault();
            setContextMenu({ x: event.clientX, y: event.clientY });
          }}
        >
          {isGenerating && (
            <div className="loading-overlay">
              <Loader2 className="spin" size={34} />
              <span>正在串行生成...</span>
            </div>
          )}
          {selectedImage?.imageUrl ? (
            <>
              <img className="main-image" src={selectedImage.imageUrl} alt={selectedImage.prompt} />
              <div className="image-counter">{selectedIndex}/{successCount}</div>
            </>
          ) : (
            <div className="empty-preview">
              <FileImage size={54} />
              <p>生成结果会显示在这里</p>
            </div>
          )}
        </section>

        <section className="composer">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={mode === "image" ? "描述希望如何编辑当前输入图片" : "描述想生成的图片"}
          />
          <div className="composer-actions">
            <button className="icon-button ghost" type="button" aria-label="参数设置">
              <Settings size={17} />
            </button>
            <button className="send-button" type="button" disabled={!canGenerate} onClick={() => void handleGenerate()} aria-label="开始生成">
              {isGenerating ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            </button>
          </div>
        </section>

        {(error || notice) && (
          <div className={error ? "message error-message" : "message notice-message"}>
            <span>{error || notice}</span>
            <button className="icon-button" type="button" onClick={() => { setError(null); setNotice(null); }} aria-label="关闭消息">
              <X size={15} />
            </button>
          </div>
        )}
      </main>

      <aside className="sidebar right-sidebar">
        <div className="thumbnail add-thumb" aria-hidden="true">
          <Plus size={24} />
        </div>
        <div className="thumb-list">
          {history.map((item) => (
            <article
              className={`thumbnail ${item.id === selectedImage?.id ? "selected" : ""} ${item.status === "failed" ? "failed" : ""}`}
              key={item.id}
            >
              {item.status === "succeeded" && item.imageUrl ? (
                <button type="button" onClick={() => setSelectedImageId(item.id)} aria-label="查看生成图片">
                  <img src={item.imageUrl} alt={item.prompt} />
                </button>
              ) : (
                <div className="failed-thumb">
                  <span>失败</span>
                  <button type="button" onClick={() => void handleRetry(item)} disabled={retryingIds.has(item.id)}>
                    {retryingIds.has(item.id) ? <Loader2 className="spin" size={14} /> : <RefreshCcw size={14} />}
                    {retryingIds.has(item.id) ? "重试中" : "重试"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </aside>

      {contextMenu && selectedImage && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" onClick={() => void copyText(selectedImage.sourceUrl ?? "", "源链接已复制。")} disabled={!selectedImage.sourceUrl}>
            复制源链接
          </button>
          <button type="button" onClick={() => void handleDownload(selectedImage)}>
            <Download size={14} />
            下载图片
          </button>
          <button type="button" onClick={() => void copyText(selectedImage.absolutePath ?? selectedImage.localPath ?? "", "本地路径已复制。")} disabled={!selectedImage.localPath}>
            复制本地图片路径
          </button>
        </div>
      )}

      {providerDialog.open && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title">
            <div className="modal-header">
              <h2 id="provider-dialog-title">{providerDialog.mode === "create" ? "添加模型提供商" : "编辑模型提供商"}</h2>
              <button className="icon-button" type="button" onClick={() => setProviderDialog({ open: false, mode: "create" })} aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <label>
              <span>提供商名称</span>
              <input value={providerForm.name} onChange={(event) => setProviderForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              <span>API 地址 Base URL</span>
              <input value={providerForm.baseUrl} onChange={(event) => setProviderForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://..." />
            </label>
            <label>
              <span>API 密钥</span>
              <div className="password-row">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={providerForm.apiKey}
                  onChange={(event) => setProviderForm((current) => ({ ...current, apiKey: event.target.value }))}
                  placeholder={providerDialog.mode === "edit" ? "留空则不修改" : "请输入 API Key"}
                />
                <button className="icon-button" type="button" onClick={() => setShowApiKey((current) => !current)} aria-label={showApiKey ? "隐藏密钥" : "显示密钥"}>
                  {showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setProviderDialog({ open: false, mode: "create" })}>
                取消
              </button>
              <button className="primary-button" type="button" onClick={() => void submitProvider()}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function mergeHistory(incoming: HistoryItem[], current: HistoryItem[]) {
  const incomingIds = new Set(incoming.map((item) => item.id));
  return [...incoming, ...current.filter((item) => !incomingIds.has(item.id))];
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : "发生未知错误。";
}
