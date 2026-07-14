#!/usr/bin/env node
/**
 * Assembles the final demo video from per-beat .webm clips + narration audio:
 *   1. Per beat: normalize video (30fps/1920x1080/yuv420p), pad to target
 *      duration by freezing the last frame (tpad), mux narration audio
 *      (padded with trailing silence via apad) -> clips/rendered/<id>.mp4
 *   2. Generate silent title + closing cards (drawtext over a cream field).
 *   3. Concat title + beats + closing (stream copy; identical codec params).
 *   4. Final encode pass: H.264 high CRF 20, AAC 192k/44.1kHz, loudnorm
 *      -16 LUFS -> out/socratic-code-tutor-demo.mp4
 *   5. Verify with ffprobe, extract 4 spot frames.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const ROOT = path.resolve(__dirname, "..");
const CLIPS_DIR = path.join(ROOT, "clips");
const RENDERED_DIR = path.join(CLIPS_DIR, "rendered");
const AUDIO_DIR = path.join(ROOT, "audio");
const OUT_DIR = path.join(ROOT, "out");
const FRAMES_DIR = path.join(ROOT, "frames");
const ASSETS_DIR = path.join(ROOT, "assets");

fs.mkdirSync(RENDERED_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Card visuals are pre-rendered PNGs (see assets/*-card.html -> *-card.png,
// generated once via Playwright screenshot) because this ffmpeg build has no
// libfreetype/drawtext support. See scripts/make-cards.js.

// Target on-screen duration per beat, in seconds. Raw recorded action/narration
// already fits inside these; the extra time is a freeze-frame hold so the
// audience has room to read on-screen text (traceback, hint prose, chart).
const TARGET_SEC = {
  "01-hook": 16.0,
  "02-run": 20.0,
  "03-hints": 32.5,
  "04-trace": 15.0,
  "05-teacher": 20.5,
  "06-build": 34.5,
  "07-close": 7.0,
};

const TITLE_SEC = 4.0;
const CLOSING_SEC = 5.0;

function ffprobeDuration(file) {
  const out = execFileSync(FFPROBE, [
    "-v", "error", "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1", file,
  ]).toString().trim();
  return parseFloat(out);
}

function renderBeat(id) {
  const webm = path.join(CLIPS_DIR, `${id}.webm`);
  const audio = path.join(AUDIO_DIR, `${id}.m4a`);
  const dest = path.join(RENDERED_DIR, `${id}.mp4`);
  const rawDuration = ffprobeDuration(webm);
  const target = TARGET_SEC[id];
  const padNeeded = Math.max(0, target - rawDuration);

  const vf = `fps=30,scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=${padNeeded.toFixed(3)}`;
  const af = "apad";

  execFileSync(FFMPEG, [
    "-y",
    "-i", webm,
    "-i", audio,
    "-filter_complex", `[0:v]${vf}[v];[1:a]${af}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-t", target.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    dest,
  ], { stdio: "inherit" });

  console.log(`[render] ${id}: raw ${rawDuration.toFixed(2)}s -> ${target}s (pad ${padNeeded.toFixed(2)}s) -> ${dest}`);
  return dest;
}

function makeCardFromPng({ pngName, destName, seconds }) {
  const pngPath = path.join(ASSETS_DIR, pngName);
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Missing ${pngPath} — run scripts/make-cards.js first`);
  }
  const dest = path.join(RENDERED_DIR, destName);
  execFileSync(FFMPEG, [
    "-y",
    "-loop", "1", "-i", pngPath,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t", seconds.toFixed(3),
    "-vf", "fps=30,scale=1920:1080,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    dest,
  ], { stdio: "inherit" });
  console.log(`[card] ${destName} (${seconds}s) -> ${dest}`);
  return dest;
}

function buildTitleCard() {
  return makeCardFromPng({ pngName: "title-card.png", destName: "00-title.mp4", seconds: TITLE_SEC });
}

function buildClosingCard() {
  return makeCardFromPng({ pngName: "closing-card.png", destName: "08-closing.mp4", seconds: CLOSING_SEC });
}

function concatAndEncode(segmentPaths) {
  const listFile = path.join(RENDERED_DIR, "concat-list.txt");
  fs.writeFileSync(listFile, segmentPaths.map((p) => `file '${p}'`).join("\n"));

  const concatPath = path.join(RENDERED_DIR, "concat-raw.mp4");
  execFileSync(FFMPEG, [
    "-y", "-f", "concat", "-safe", "0", "-i", listFile,
    "-c", "copy", concatPath,
  ], { stdio: "inherit" });

  const finalPath = path.join(OUT_DIR, "socratic-code-tutor-demo.mp4");
  execFileSync(FFMPEG, [
    "-y", "-i", concatPath,
    "-vf", "format=yuv420p",
    "-c:v", "libx264", "-profile:v", "high", "-crf", "20", "-r", "30",
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
    "-movflags", "+faststart",
    finalPath,
  ], { stdio: "inherit" });

  return finalPath;
}

function extractSpotFrames(finalPath) {
  const duration = ffprobeDuration(finalPath);
  const spots = [
    { name: "spot-01-start.png", t: 1.0 },
    { name: "spot-02-25pct.png", t: duration * 0.25 },
    { name: "spot-03-60pct.png", t: duration * 0.6 },
    { name: "spot-04-closing.png", t: Math.max(0, duration - 2.5) },
  ];
  const results = [];
  for (const spot of spots) {
    const dest = path.join(FRAMES_DIR, spot.name);
    execFileSync(FFMPEG, [
      "-y", "-ss", spot.t.toFixed(2), "-i", finalPath,
      "-frames:v", "1", "-update", "1", dest,
    ], { stdio: "inherit" });
    results.push(dest);
  }
  return results;
}

function main() {
  const beatIds = Object.keys(TARGET_SEC);
  const renderedBeats = beatIds.map(renderBeat);
  const titleCard = buildTitleCard();
  const closingCard = buildClosingCard();

  const segments = [titleCard, ...renderedBeats, closingCard];
  const finalPath = concatAndEncode(segments);

  const finalDuration = ffprobeDuration(finalPath);
  const stat = fs.statSync(finalPath);
  console.log(`\nFINAL: ${finalPath}`);
  console.log(`Duration: ${finalDuration.toFixed(2)}s (${Math.floor(finalDuration / 60)}:${String(Math.round(finalDuration % 60)).padStart(2, "0")})`);
  console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  const streams = execFileSync(FFPROBE, [
    "-v", "error", "-show_entries", "stream=codec_type,codec_name",
    "-of", "default=noprint_wrappers=1", finalPath,
  ]).toString();
  console.log("Streams:\n" + streams);

  const frames = extractSpotFrames(finalPath);
  console.log("Spot frames:\n" + frames.join("\n"));
}

main();
