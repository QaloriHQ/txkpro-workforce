"use client";

import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentArrowDownIcon,
  PhotoIcon,
  PlayCircleIcon,
  SpeakerWaveIcon,
  StopIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import * as tus from "tus-js-client";
import {
  ChangeEvent,
  DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button, Card, StatusBadge } from "@/components/design-system";
import type {
  EmployerLearningLessonBlock,
  EmployerLearningMediaAsset,
  EmployerLearningMediaKind,
  LessonBlockType,
} from "@/lib/employer/learning-types";

type UploadReservation = {
  asset: EmployerLearningMediaAsset;
  upload: {
    bucketId: string;
    storagePath: string;
    token: string;
  };
};

type UploadState = {
  file: File;
  reservation: UploadReservation;
  progress: number;
  status: "uploading" | "failed";
  error?: string;
};

const ACCEPTED =
  ".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,.mp3,.m4a,.wav,.ogg,.pdf,.txt,.csv,.zip,.doc,.docx,.ppt,.pptx,.xls,.xlsx";

const EXTENSION_FALLBACK: Record<
  string,
  { kind: EmployerLearningMediaKind; mime: string }
> = {
  jpg: { kind: "image", mime: "image/jpeg" },
  jpeg: { kind: "image", mime: "image/jpeg" },
  png: { kind: "image", mime: "image/png" },
  webp: { kind: "image", mime: "image/webp" },
  gif: { kind: "image", mime: "image/gif" },
  mp4: { kind: "video", mime: "video/mp4" },
  webm: { kind: "video", mime: "video/webm" },
  mov: { kind: "video", mime: "video/quicktime" },
  mp3: { kind: "audio", mime: "audio/mpeg" },
  m4a: { kind: "audio", mime: "audio/mp4" },
  wav: { kind: "audio", mime: "audio/wav" },
  ogg: { kind: "audio", mime: "audio/ogg" },
  pdf: { kind: "document", mime: "application/pdf" },
  txt: { kind: "document", mime: "text/plain" },
  csv: { kind: "document", mime: "text/csv" },
  zip: { kind: "document", mime: "application/zip" },
  doc: { kind: "document", mime: "application/msword" },
  docx: {
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  ppt: { kind: "document", mime: "application/vnd.ms-powerpoint" },
  pptx: {
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  xls: { kind: "document", mime: "application/vnd.ms-excel" },
  xlsx: {
    kind: "document",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

function inferFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fallback = EXTENSION_FALLBACK[extension];
  if (!fallback) {
    throw new Error("Unsupported file extension.");
  }

  const mime = file.type?.trim().toLowerCase() || fallback.mime;
  const kind: EmployerLearningMediaKind = mime.startsWith("image/")
    ? "image"
    : mime.startsWith("video/")
      ? "video"
      : mime.startsWith("audio/")
        ? "audio"
        : "document";

  return { kind, mime };
}

function iconFor(kind: EmployerLearningMediaKind) {
  if (kind === "image") return PhotoIcon;
  if (kind === "video") return PlayCircleIcon;
  if (kind === "audio") return SpeakerWaveIcon;
  return DocumentArrowDownIcon;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function preferredBlockType(
  asset: EmployerLearningMediaAsset,
): Extract<LessonBlockType, "image" | "video" | "audio" | "document"> {
  if (asset.mediaKind === "image") return "image";
  if (asset.mediaKind === "video") return "video";
  if (asset.mediaKind === "audio") return "audio";
  return "document";
}

function compatible(
  block: EmployerLearningLessonBlock | null,
  asset: EmployerLearningMediaAsset,
) {
  if (!block) return false;
  if (block.blockType === "image") return asset.mediaKind === "image";
  if (block.blockType === "video") return asset.mediaKind === "video";
  if (block.blockType === "audio") return asset.mediaKind === "audio";
  if (block.blockType === "document" || block.blockType === "download") {
    return asset.mediaKind === "document";
  }
  return false;
}

async function fetchMediaAssets() {
  const response = await fetch("/api/employer/learning/media", {
    cache: "no-store",
  });
  const body = (await response.json()) as {
    assets?: EmployerLearningMediaAsset[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Unable to load Employer media.");
  }
  return body.assets ?? [];
}

export function MediaLibraryPanel({
  canEdit,
  selectedBlock,
  onInsertAsset,
  onReplaceSelected,
  onUsePoster,
}: {
  canEdit: boolean;
  selectedBlock: EmployerLearningLessonBlock | null;
  onInsertAsset: (
    asset: EmployerLearningMediaAsset,
    blockType: LessonBlockType,
  ) => Promise<void>;
  onReplaceSelected: (
    asset: EmployerLearningMediaAsset,
  ) => Promise<void>;
  onUsePoster: (
    asset: EmployerLearningMediaAsset,
  ) => Promise<void>;
}) {
  const [assets, setAssets] = useState<EmployerLearningMediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const load = useCallback(async () => {
    try {
      setAssets(await fetchMediaAssets());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load Employer media.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchMediaAssets()
      .then((nextAssets) => {
        if (!active) return;
        setAssets(nextAssets);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load Employer media.",
        );
        setLoading(false);
      });

    return () => {
      active = false;
      void uploadRef.current?.abort();
    };
  }, []);

  async function reserve(file: File): Promise<UploadReservation> {
    const { kind, mime } = inferFile(file);
    const displayName = file.name.replace(/\.[^.]+$/, "");
    const response = await fetch("/api/employer/learning/media", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        displayName,
        mediaKind: kind,
        mimeType: mime,
        sizeBytes: file.size,
        metadata: {},
      }),
    });
    const body = (await response.json()) as
      | UploadReservation
      | { error?: string };
    if (!response.ok || !("asset" in body) || !("upload" in body)) {
      throw new Error(
        "error" in body && body.error
          ? body.error
          : "Unable to prepare media upload.",
      );
    }
    return body;
  }

  function storageEndpoint() {
    const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!projectUrl) throw new Error("Supabase browser configuration is missing.");
    const host = new URL(projectUrl).hostname;
    const projectRef = host.split(".")[0];
    if (!projectRef) throw new Error("Unable to resolve Supabase project.");
    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }

  async function startTus(file: File, reservation: UploadReservation) {
    const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!apiKey) throw new Error("Supabase browser configuration is missing.");

    setUploadState({
      file,
      reservation,
      progress: 0,
      status: "uploading",
    });

    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: storageEndpoint(),
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          "x-signature": reservation.upload.token,
          apikey: apiKey,
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: {
          bucketName: reservation.upload.bucketId,
          objectName: reservation.upload.storagePath,
          contentType: reservation.asset.mimeType,
          cacheControl: "3600",
          metadata: JSON.stringify({
            mediaAssetId: reservation.asset.mediaAssetId,
          }),
        },
        onProgress(bytesUploaded, bytesTotal) {
          const progress =
            bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
          setUploadState((current) =>
            current
              ? { ...current, progress, status: "uploading", error: undefined }
              : current,
          );
        },
        onError(cause) {
          setUploadState((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  error: cause.message,
                }
              : current,
          );
          reject(cause);
        },
        async onSuccess() {
          try {
            const response = await fetch(
              `/api/employer/learning/media/${encodeURIComponent(
                reservation.asset.mediaAssetId,
              )}/finalize`,
              { method: "POST" },
            );
            const body = (await response.json()) as {
              asset?: EmployerLearningMediaAsset;
              error?: string;
            };
            if (!response.ok) {
              throw new Error(body.error ?? "Unable to finalize media upload.");
            }
            setUploadState(null);
            await load();
            resolve();
          } catch (cause) {
            const message =
              cause instanceof Error
                ? cause.message
                : "Unable to finalize media upload.";
            setUploadState((current) =>
              current
                ? { ...current, status: "failed", error: message }
                : current,
            );
            reject(cause);
          }
        },
      });

      uploadRef.current = upload;
      void upload.findPreviousUploads().then((previous) => {
        if (previous.length) {
          upload.resumeFromPreviousUpload(previous[0]);
        }
        upload.start();
      });
    });
  }

  async function beginUpload(file: File) {
    if (!canEdit || uploadState) return;
    setError(null);
    try {
      const reservation = await reserve(file);
      await startTus(file, reservation);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to upload media.",
      );
    }
  }

  async function handleInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await beginUpload(file);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await beginUpload(file);
  }

  async function cancelUpload() {
    const current = uploadState;
    if (!current) return;
    try {
      await uploadRef.current?.abort(true);
      await fetch(
        `/api/employer/learning/media/${encodeURIComponent(
          current.reservation.asset.mediaAssetId,
        )}`,
        { method: "DELETE" },
      );
    } finally {
      uploadRef.current = null;
      setUploadState(null);
    }
  }

  async function retryUpload() {
    if (!uploadState || uploadState.status !== "failed") return;
    setError(null);
    try {
      await startTus(uploadState.file, uploadState.reservation);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to retry upload.",
      );
    }
  }

  async function deleteAsset(asset: EmployerLearningMediaAsset) {
    if (!window.confirm(`Delete "${asset.displayName}" from the Employer Media Library?`)) {
      return;
    }
    setError(null);
    const response = await fetch(
      `/api/employer/learning/media/${encodeURIComponent(asset.mediaAssetId)}`,
      { method: "DELETE" },
    );
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(
        body.error === "MEDIA_ASSET_IN_USE"
          ? "This media asset is still used by one or more lesson blocks. Replace those references before deleting it."
          : body.error ?? "Unable to delete media asset.",
      );
      return;
    }
    await load();
  }

  return (
    <Card className="txk-media-library-panel">
      <div className="txk-inline-heading">
        <div>
          <p className="txk-eyebrow">Employer Media Library</p>
          <h3>Reusable media</h3>
        </div>
        <StatusBadge tone="neutral">{assets.length}</StatusBadge>
      </div>

      {error ? <div className="alert">{error}</div> : null}

      {canEdit ? (
        <>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={ACCEPTED}
            onChange={handleInput}
          />
          <div
            className={`txk-media-dropzone ${dragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <ArrowUpTrayIcon aria-hidden="true" />
            <strong>Upload media</strong>
            <span>
              Images · video · audio · PDF/Office/documents
            </span>
            <Button
              size="sm"
              type="button"
              disabled={Boolean(uploadState)}
              onClick={() => inputRef.current?.click()}
            >
              Choose file
            </Button>
          </div>
        </>
      ) : null}

      {uploadState ? (
        <div className="txk-media-upload-status">
          <div>
            <strong>{uploadState.file.name}</strong>
            <span>
              {uploadState.status === "failed"
                ? uploadState.error ?? "Upload failed"
                : `${uploadState.progress}% uploaded`}
            </span>
          </div>
          <div
            className="txk-media-progress"
            aria-label={`Upload progress ${uploadState.progress}%`}
          >
            <span style={{ width: `${uploadState.progress}%` }} />
          </div>
          <div className="txk-form-actions">
            {uploadState.status === "failed" ? (
              <Button size="sm" type="button" onClick={retryUpload}>
                <ArrowPathIcon aria-hidden="true" />
                Retry
              </Button>
            ) : null}
            <Button size="sm" type="button" onClick={cancelUpload}>
              <StopIcon aria-hidden="true" />
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="txk-media-assets">
        {loading ? <p className="muted">Loading media…</p> : null}
        {!loading && assets.length === 0 ? (
          <p className="muted">
            No uploaded media yet. External YouTube, Vimeo, Loom, Wistia and
            Dailymotion URLs can still be used directly in Video blocks.
          </p>
        ) : null}
        {assets.map((asset) => {
          const Icon = iconFor(asset.mediaKind);
          const canReplace = compatible(selectedBlock, asset);
          const posterCandidate =
            selectedBlock?.blockType === "video" && asset.mediaKind === "image";
          return (
            <div className="txk-media-asset" key={asset.mediaAssetId}>
              <div className="txk-media-asset-icon">
                <Icon aria-hidden="true" />
              </div>
              <div className="txk-media-asset-copy">
                <strong>{asset.displayName}</strong>
                <span>
                  {asset.mediaKind} · {formatBytes(asset.sizeBytes)}
                </span>
              </div>
              {canEdit ? (
                <div className="txk-media-asset-actions">
                  {canReplace ? (
                    <Button
                      size="sm"
                      type="button"
                      tone="primary"
                      onClick={() => onReplaceSelected(asset)}
                    >
                      Use in selected
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() =>
                        onInsertAsset(asset, preferredBlockType(asset))
                      }
                    >
                      Insert
                    </Button>
                  )}
                  {asset.mediaKind === "document" ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => onInsertAsset(asset, "download")}
                    >
                      Download block
                    </Button>
                  ) : null}
                  {posterCandidate ? (
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => onUsePoster(asset)}
                    >
                      Use as poster
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    tone="danger"
                    type="button"
                    onClick={() => deleteAsset(asset)}
                  >
                    <TrashIcon aria-hidden="true" />
                    <span className="sr-only">Delete {asset.displayName}</span>
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
