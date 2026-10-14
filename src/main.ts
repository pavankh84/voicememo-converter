import "./style.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

type Status = "pending" | "converting" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: Status;
  progress: number; // 0-100
  outputUrl?: string;
  outputName?: string;
  error?: string;
}

const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const dropzone = document.getElementById("dropzone") as HTMLLabelElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileListEl = document.getElementById("file-list") as HTMLDivElement;
const actionsEl = document.getElementById("actions") as HTMLDivElement;
const convertAllBtn = document.getElementById("convert-all") as HTMLButtonElement;
const clearAllBtn = document.getElementById("clear-all") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;

let queue: QueueItem[] = [];
let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (ffmpegLoading) return ffmpegLoading;

  statusEl.textContent = "Loading converter engine (first time only, ~30MB)…";
  ffmpegLoading = (async () => {
    const instance = new FFmpeg();
    instance.on("log", ({ message }) => {
      // Surfaced for debugging; uncomment if you need verbose ffmpeg output.
      // console.debug(message);
      void message;
    });
    const coreURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript");
    const wasmURL = await toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
    await instance.load({ coreURL, wasmURL });
    ffmpeg = instance;
    statusEl.textContent = "";
    return instance;
  })();
  return ffmpegLoading;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex++;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function addFiles(files: FileList | File[]) {
  const accepted = Array.from(files).filter((f) => f.size > 0);
  for (const file of accepted) {
    queue.push({ id: makeId(), file, status: "pending", progress: 0 });
  }
  render();
}

function render() {
  fileListEl.innerHTML = "";
  for (const item of queue) {
    fileListEl.appendChild(renderItem(item));
  }
  actionsEl.hidden = queue.length === 0;
  convertAllBtn.disabled = queue.every((q) => q.status !== "pending");
}

function renderItem(item: QueueItem): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "file-row";

  const info = document.createElement("div");
  info.className = "file-info";
  const name = document.createElement("span");
  name.className = "file-name";
  name.textContent = item.file.name;
  const size = document.createElement("span");
  size.className = "file-size";
  size.textContent = formatBytes(item.file.size);
  info.append(name, size);

  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-wrap";
  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressBar.style.width = `${item.progress}%`;
  progressWrap.appendChild(progressBar);

  const action = document.createElement("div");
  action.className = "file-action";

  if (item.status === "pending") {
    action.textContent = "Waiting";
  } else if (item.status === "converting") {
    action.textContent = `Converting… ${item.progress}%`;
  } else if (item.status === "error") {
    action.textContent = item.error ?? "Failed";
    action.classList.add("file-error");
  } else if (item.status === "done" && item.outputUrl) {
    const link = document.createElement("a");
    link.href = item.outputUrl;
    link.download = item.outputName ?? "converted.mp3";
    link.className = "btn btn-small";
    link.textContent = "Download MP3";
    action.appendChild(link);
  }

  row.append(info, progressWrap, action);
  return row;
}

async function convertItem(item: QueueItem) {
  item.status = "converting";
  item.progress = 0;
  render();

  const engine = await getFFmpeg();

  const inputName = `input-${item.id}${getExt(item.file.name)}`;
  const outputName = `${baseName(item.file.name)}.mp3`;
  const outputVirtualName = `output-${item.id}.mp3`;

  const onProgress = ({ progress }: { progress: number }) => {
    item.progress = Math.min(100, Math.max(0, Math.round(progress * 100)));
    render();
  };
  engine.on("progress", onProgress);

  try {
    await engine.writeFile(inputName, await fetchFile(item.file));
    await engine.exec(["-i", inputName, "-codec:a", "libmp3lame", "-qscale:a", "2", outputVirtualName]);
    const data = await engine.readFile(outputVirtualName);
    const bytes = data as Uint8Array;
    const blob = new Blob([bytes.slice().buffer], { type: "audio/mpeg" });
    item.outputUrl = URL.createObjectURL(blob);
    item.outputName = outputName;
    item.status = "done";
    item.progress = 100;
  } catch (err) {
    item.status = "error";
    item.error = err instanceof Error ? err.message : "Conversion failed";
  } finally {
    engine.off("progress", onProgress);
    await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputVirtualName).catch(() => {});
    render();
  }
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

async function convertAll() {
  convertAllBtn.disabled = true;
  const pending = queue.filter((q) => q.status === "pending" || q.status === "error");
  for (const item of pending) {
    await convertItem(item);
  }
  statusEl.textContent = "Done! Click each file to download.";
}

function clearAll() {
  for (const item of queue) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  }
  queue = [];
  fileInput.value = "";
  statusEl.textContent = "";
  render();
}

// Drag and drop
["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragging");
  });
});
["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragging");
  });
});
dropzone.addEventListener("drop", (e) => {
  const files = e.dataTransfer?.files;
  if (files && files.length) addFiles(files);
});

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
});

convertAllBtn.addEventListener("click", () => {
  void convertAll();
});
clearAllBtn.addEventListener("click", clearAll);

render();
