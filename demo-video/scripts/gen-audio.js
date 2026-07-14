#!/usr/bin/env node
/**
 * Generates one narration audio file per beat.
 * Fallback engine: macOS `say` (Samantha, 175 wpm) -> AIFF -> ffmpeg -> AAC/44.1kHz.
 * (Primary OpenAI TTS path is skipped: no real OPENAI_API_KEY found in .env.local.)
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const beatsConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "beats.json"), "utf8"));
const audioDir = path.join(ROOT, "audio");
fs.mkdirSync(audioDir, { recursive: true });

function ffprobeDuration(file) {
  const out = execFileSync("/opt/homebrew/bin/ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file,
  ]).toString().trim();
  return parseFloat(out);
}

const results = [];
for (const beat of beatsConfig.beats) {
  const aiffPath = path.join(audioDir, `${beat.id}.aiff`);
  const m4aPath = path.join(audioDir, `${beat.id}.m4a`);

  execFileSync("say", ["-v", "Samantha", "-r", "175", "-o", aiffPath, beat.narration]);
  execFileSync("/opt/homebrew/bin/ffmpeg", [
    "-y", "-i", aiffPath,
    "-ar", "44100", "-ac", "2",
    "-c:a", "aac", "-b:a", "192k",
    m4aPath,
  ], { stdio: "ignore" });

  const duration = ffprobeDuration(m4aPath);
  results.push({ id: beat.id, narrationSec: duration, minActionSec: beat.minActionSec });
  console.log(`${beat.id}: narration ${duration.toFixed(2)}s (min action ${beat.minActionSec}s)`);
}

fs.writeFileSync(path.join(ROOT, "scripts", "audio-durations.json"), JSON.stringify(results, null, 2));

const totalNarration = results.reduce((sum, r) => sum + r.narrationSec, 0);
const totalMinAction = results.reduce((sum, r) => sum + Math.max(r.narrationSec, r.minActionSec), 0);
console.log(`\nTotal narration-only: ${totalNarration.toFixed(2)}s`);
console.log(`Projected beats total (max of narration/action, no cards): ${totalMinAction.toFixed(2)}s`);
console.log(`+ title card (~3.5s) + closing hold (~2s) => ~${(totalMinAction + 5.5).toFixed(2)}s`);
