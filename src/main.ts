import "./style.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

type Status = "pending" | "converting" | "transcribing" | "done" | "error";

interface QueueItem {
  id: string;
  file: File;
  status: Status;
  progress: number; // 0-100
  outputUrl?: string;
  outputName?: string;
  transcriptUrl?: string;
  transcriptName?: string;
  transcriptPreview?: string;
  error?: string;
}

const CORE_VERSION = "0.12.6";
const CORE_BASE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const ASR_MODEL = "Xenova/whisper-tiny.en";

const dropzone = document.getElementById("dropzone") as HTMLLabelElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileListEl = document.getElementById("file-list") as HTMLDivElement;
const actionsEl = document.getElementById("actions") as HTMLDivElement;
const convertAllBtn = document.getElementById("convert-all") as HTMLButtonElement;
const clearAllBtn = document.getElementById("clear-all") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const transcribeToggle = document.getElementById("transcribe-toggle") as HTMLInputElement;

let queue: QueueItem[] = [];
let ffmpeg: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;
let asrPipeline: AutomaticSpeechRecognitionPipeline | null = null;
let asrLoading: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

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

function getAsrPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asrPipeline) return Promise.resolve(asrPipeline);
  if (asrLoading) return asrLoading;

  statusEl.textContent = "Loading transcription model (first time only, ~40MB)…";
  asrLoading = (async () => {
    const transcriber = await pipeline("automatic-speech-recognition", ASR_MODEL);
    asrPipeline = transcriber;
    statusEl.textContent = "";
    return transcriber;
  })();
  return asrLoading;
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
  item.status = "converting";
  item.progress = 0;
  render();

  const engine = await getFFmpeg();

  const inputName = `input-${item.id}${getExt(item.file.name)}`;
  const outputName = `${baseName(item.file.name)}.mp3`;
  const outputVirtualName = `output-${item.id}.mp3`;
  const wavVirtualName = `asr-${item.id}.wav`;

  const onProgress = ({ progress }: { progress: number }) => {
    item.progress = Math.min(100, Math.max(0, Math.round(progress * 100)));
    render();
  };
  engine.on("progress", onProgress);

  try {
    await engine.writeFile(inputName, await fetchFile(item.file));

    // Tag the MP3 with the original recording's date so it's not just "New Recording 47".
    const recordedAt = new Date(item.file.lastModified || Date.now());
    const isoDate = recordedAt.toISOString().slice(0, 10);
    await engine.exec([
      "-i",
      inputName,
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

    if (transcribeToggle.checked) {
      await transcribeItem(item, engine, inputName, wavVirtualName);
    }
  } catch (err) {
    item.status = "error";
    item.error = err instanceof Error ? err.message : "Conversion failed";
  } finally {
    engine.off("progress", onProgress);
    await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputVirtualName).catch(() => {});
    await engine.deleteFile(wavVirtualName).catch(() => {});
    render();
  }
}

async function transcribeItem(
  item: QueueItem,
  engine: FFmpeg,
  inputName: string,
  wavVirtualName: string,
) {
  item.status = "transcribing";
  render();

  try {
    // Re-decode the original audio to 16kHz mono PCM, the format Whisper expects.
    await engine.exec(["-i", inputName, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavVirtualName]);
    const wavData = await engine.readFile(wavVirtualName);
    const wavBytes = (wavData as Uint8Array).slice();
    const samples = await decodeTo16kMono(wavBytes.buffer);

    const transcriber = await getAsrPipeline();
    const result = await transcriber(samples, { chunk_length_s: 30, stride_length_s: 5 });
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
    if (item.transcriptUrl) URL.revokeObjectURL(item.transcriptUrl);
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
