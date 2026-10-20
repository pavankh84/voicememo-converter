import "./style.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

type Status =
  | "pending"
  | "loading-engine"
  | "converting"
  | "loading-transcriber"
  | "transcribing"
  | "done"
  | "error";

interface QueueItem {
  id: string;
  file: File;
  status: Status;
  progress: number; // 0-100
  trimSilence: boolean;
  transcribe: boolean;
  language: string;
  outputUrl?: string;
  outputName?: string;
  transcriptUrl?: string;
  transcriptName?: string;
  transcriptPreview?: string;
  error?: string;
}

const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
// Multilingual tiny model (same size class as the English-only one) so a single
// default download covers every supported language via the picker below.
const ASR_MODEL = "Xenova/whisper-tiny";

// Trims leading AND trailing silence (below -45dB) without touching pauses in the
// middle of the recording. The reverse/un-reverse trick is the standard ffmpeg way
// to apply silenceremove to both ends since the filter only strips from the start.
const SILENCE_TRIM_FILTER =
  "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak," +
  "aformat=dblp,areverse," +
  "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak," +
  "aformat=dblp,areverse";

const dropzone = document.getElementById("dropzone") as HTMLLabelElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileListEl = document.getElementById("file-list") as HTMLDivElement;
const actionsEl = document.getElementById("actions") as HTMLDivElement;
const retryFailedBtn = document.getElementById("retry-failed") as HTMLButtonElement;
const clearAllBtn = document.getElementById("clear-all") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const transcribeToggle = document.getElementById("transcribe-toggle") as HTMLInputElement;
const trimToggle = document.getElementById("trim-toggle") as HTMLInputElement;
const languageRow = document.getElementById("language-row") as HTMLLabelElement;
const languageSelect = document.getElementById("language-select") as HTMLSelectElement;

transcribeToggle.addEventListener("change", () => {
  languageRow.hidden = !transcribeToggle.checked;
});

let queue: QueueItem[] = [];
let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
let asrPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let asrLoading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let processingPromise: Promise<void> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg);
  if (ffmpegLoading) return ffmpegLoading;

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
    return instance;
  })();
  try {
    return await ffmpegLoading;
  } finally {
    if (!ffmpeg) ffmpegLoading = null;
  }
}

async function getAsrPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPipeline) return Promise.resolve(asrPipeline);
  if (asrLoading) return asrLoading;

  asrLoading = (async () => {
    const transcriber = await pipeline("automatic-speech-recognition", ASR_MODEL);
    asrPipeline = transcriber;
    return transcriber;
  })();
  try {
    return await asrLoading;
  } finally {
    if (!asrPipeline) asrLoading = null;
  }
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
    queue.push({
      id: makeId(),
      file,
      status: "pending",
      progress: 0,
      trimSilence: trimToggle.checked,
      transcribe: transcribeToggle.checked,
      language: languageSelect.value,
    });
  }
  fileInput.value = "";
  render();
  if (accepted.length > 0) startProcessing();
}

function render() {
  fileListEl.innerHTML = "";
  for (const item of queue) {
    fileListEl.appendChild(renderItem(item));
  }
  actionsEl.hidden = queue.length === 0;
  const failedCount = queue.filter((q) => q.status === "error").length;
  retryFailedBtn.hidden = failedCount === 0;
  retryFailedBtn.textContent = failedCount === 1 ? "Retry failed file" : `Retry ${failedCount} failed files`;
  clearAllBtn.disabled = processingPromise !== null;
  renderStatus();
}

function renderStatus() {
  const active = queue.find((item) =>
    ["loading-engine", "converting", "loading-transcriber", "transcribing"].includes(item.status),
  );
  if (active?.status === "loading-engine") {
    statusEl.textContent =
      "Loading the local converter engine for the first conversion (~30 MB). Your audio stays on this device.";
    return;
  }
  if (active?.status === "converting") {
    statusEl.textContent = `Converting ${active.file.name} locally…`;
    return;
  }
  if (active?.status === "loading-transcriber") {
    statusEl.textContent =
      "Loading the local transcription model for the first transcript (~45 MB)…";
    return;
  }
  if (active?.status === "transcribing") {
    statusEl.textContent = `Transcribing ${active.file.name} locally…`;
    return;
  }

  const pendingCount = queue.filter((item) => item.status === "pending").length;
  if (pendingCount > 0) {
    statusEl.textContent = `${pendingCount} ${pendingCount === 1 ? "file" : "files"} queued for automatic local conversion.`;
    return;
  }

  const doneCount = queue.filter((item) => item.status === "done").length;
  const failedCount = queue.filter((item) => item.status === "error").length;
  if (failedCount > 0) {
    statusEl.textContent =
      `${doneCount} completed. ${failedCount} ${failedCount === 1 ? "file" : "files"} failed and can be retried.`;
  } else if (doneCount > 0) {
    statusEl.textContent = "Done! Download each converted file below.";
  } else {
    statusEl.textContent = "";
  }
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
    action.textContent = "Queued — starts automatically";
  } else if (item.status === "loading-engine") {
    action.textContent = "Loading local converter engine…";
  } else if (item.status === "converting") {
    action.textContent = `Converting… ${item.progress}%`;
  } else if (item.status === "loading-transcriber") {
    action.textContent = "Loading local transcription model…";
  } else if (item.status === "transcribing") {
    action.textContent = "Transcribing… (can take a while for long memos)";
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

    if (item.transcriptUrl) {
      const transcriptLink = document.createElement("a");
      transcriptLink.href = item.transcriptUrl;
      transcriptLink.download = item.transcriptName ?? "transcript.txt";
      transcriptLink.className = "btn btn-small btn-secondary-small";
      transcriptLink.textContent = "Download transcript";
      action.appendChild(transcriptLink);
    }
  }

  row.append(info, progressWrap, action);

  if (item.transcriptPreview) {
    const details = document.createElement("details");
    details.className = "transcript-preview";
    const summary = document.createElement("summary");
    summary.textContent = "Preview transcript";
    const text = document.createElement("p");
    text.textContent = item.transcriptPreview;
    details.append(summary, text);
    row.appendChild(details);
  }

  return row;
}

async function convertItem(item: QueueItem) {
  item.status = "loading-engine";
  item.progress = 0;
  render();

  const inputName = `input-${item.id}${getExt(item.file.name)}`;
  const outputName = `${baseName(item.file.name)}.mp3`;
  const outputVirtualName = `output-${item.id}.mp3`;
  const wavVirtualName = `asr-${item.id}.wav`;
  let engine: FFmpeg | null = null;

  const onProgress = ({ progress }: { progress: number }) => {
    item.progress = Math.min(100, Math.max(0, Math.round(progress * 100)));
    render();
  };
  try {
    engine = await getFFmpeg();
    item.status = "converting";
    render();
    engine.on("progress", onProgress);
    await engine.writeFile(inputName, await fetchFile(item.file));

    // Tag the MP3 with the original recording's date so it's not just "New Recording 47".
    const recordedAt = new Date(item.file.lastModified || Date.now());
    const isoDate = recordedAt.toISOString().slice(0, 10);
    const audioFilterArgs = item.trimSilence ? ["-af", SILENCE_TRIM_FILTER] : [];
    await engine.exec([
      "-i",
      inputName,
      ...audioFilterArgs,
      "-codec:a",
      "libmp3lame",
      "-qscale:a",
      "2",
      "-metadata",
      `title=${baseName(item.file.name)}`,
      "-metadata",
      `date=${isoDate}`,
      "-metadata",
      `comment=Converted from an iPhone Voice Memo via voicememo-converter`,
      "-id3v2_version",
      "3",
      outputVirtualName,
    ]);
    const data = await engine.readFile(outputVirtualName);
    const bytes = data as Uint8Array;
    const blob = new Blob([bytes.slice().buffer], { type: "audio/mpeg" });
    item.outputUrl = URL.createObjectURL(blob);
    item.outputName = outputName;
    item.status = "done";
    item.progress = 100;
    render();

    if (item.transcribe) {
      await transcribeItem(item, engine, inputName, wavVirtualName, item.trimSilence, item.language);
    }
  } catch (err) {
    item.status = "error";
    item.error = err instanceof Error ? err.message : "Conversion failed";
  } finally {
    engine?.off("progress", onProgress);
    await engine?.deleteFile(inputName).catch(() => {});
    await engine?.deleteFile(outputVirtualName).catch(() => {});
    await engine?.deleteFile(wavVirtualName).catch(() => {});
    render();
  }
}

async function transcribeItem(
  item: QueueItem,
  engine: FFmpeg,
  inputName: string,
  wavVirtualName: string,
  trim: boolean,
  language: string,
) {
  item.status = "transcribing";
  render();

  try {
    // Re-decode the original audio to 16kHz mono PCM, the format Whisper expects.
    // Apply the same silence trim as the MP3 output so the transcript lines up.
    const audioFilterArgs = trim ? ["-af", SILENCE_TRIM_FILTER] : [];
    await engine.exec([
      "-i",
      inputName,
      ...audioFilterArgs,
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wavVirtualName,
    ]);
    const wavData = await engine.readFile(wavVirtualName);
    const wavBytes = (wavData as Uint8Array).slice();
    const samples = await decodeTo16kMono(wavBytes.buffer);

    item.status = "loading-transcriber";
    render();
    const transcriber = await getAsrPipeline();
    item.status = "transcribing";
    render();
    const result = await transcriber(samples, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language,
    });
    const text = (Array.isArray(result) ? result[0]?.text : result.text)?.trim() ?? "";

    const transcriptBlob = new Blob([text], { type: "text/plain" });
    item.transcriptUrl = URL.createObjectURL(transcriptBlob);
    item.transcriptName = `${baseName(item.file.name)}.txt`;
    item.transcriptPreview = text.length > 280 ? `${text.slice(0, 280)}…` : text || "(no speech detected)";
  } catch (err) {
    console.warn("Transcription failed:", err);
    item.transcriptPreview = "Transcript failed — MP3 conversion still succeeded.";
  } finally {
    item.status = "done";
    render();
  }
}

async function decodeTo16kMono(wavArrayBuffer: ArrayBuffer): Promise<Float32Array> {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(wavArrayBuffer);
    if (audioBuffer.sampleRate === 16000 && audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }
    const offline = new OfflineAudioContext(1, Math.ceil(audioBuffer.duration * 16000), 16000);
    const src = offline.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } finally {
    await audioCtx.close().catch(() => {});
  }
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot) : "";
}

async function processQueue() {
  while (true) {
    const item = queue.find((candidate) => candidate.status === "pending");
    if (!item) return;
    await convertItem(item);
  }
}

function startProcessing() {
  if (processingPromise) return;

  processingPromise = processQueue().finally(() => {
    processingPromise = null;
    render();
    if (queue.some((item) => item.status === "pending")) startProcessing();
  });
  render();
}

function retryFailed() {
  for (const item of queue) {
    if (item.status !== "error") continue;
    item.status = "pending";
    item.progress = 0;
    item.error = undefined;
  }
  render();
  startProcessing();
}

function clearAll() {
  if (processingPromise) return;
  for (const item of queue) {
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    if (item.transcriptUrl) URL.revokeObjectURL(item.transcriptUrl);
  }
  queue = [];
  fileInput.value = "";
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

retryFailedBtn.addEventListener("click", retryFailed);
clearAllBtn.addEventListener("click", clearAll);

render();
