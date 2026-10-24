// Usage: node lib/transcribe.mjs <video> <out.json>
import {transcribe, toCaptions} from '@remotion/install-whisper-cpp';
import {execFileSync} from 'child_process';
import fs from 'fs'; import path from 'path'; import os from 'os';
import {ffmpegPath, ffEnv, whisperDir, WHISPER_VERSION, WHISPER_MODEL} from './platform.mjs';
export const ff = (args) => execFileSync(ffmpegPath, ['-hide_banner','-loglevel','error','-y',...args], {env: ffEnv});
const [,, input, out] = process.argv;
const wav = path.join(os.tmpdir(), 'rs-'+Date.now()+'.wav');
ff(['-i', input, '-vn', '-ac','1','-ar','16000','-c:a','pcm_s16le', wav]);
const res = await transcribe({inputPath: wav, whisperPath: whisperDir, whisperCppVersion: WHISPER_VERSION, model: WHISPER_MODEL, tokenLevelTimestamps: true, splitOnWord: true, language: 'en', printOutput: false});
const {captions} = toCaptions({whisperCppOutput: res});
// captions: [{text, startMs, endMs, timestampMs, confidence}] one per word
fs.writeFileSync(out, JSON.stringify(captions.map(c=>({w:c.text.trim(), s:c.startMs, e:c.endMs})).filter(c=>c.w), null, 0));
fs.unlinkSync(wav);
console.log('words:', captions.length);
