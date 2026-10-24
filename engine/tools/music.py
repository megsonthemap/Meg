#!/usr/bin/env python3
"""Reel Studio music: tag a library, then pick + score a track to an edit.

  python3 tools/music.py analyse                       # tag every track in ~/reel-studio/music -> library.json
  python3 tools/music.py score <slug> --drop T --stop T [--mood build,tension] [--pick N] [--under 6]
      --drop  output second where the music should open up (the main sting / name reveal)
      --stop  output second where it cuts dead (the open loop). Default: end of the last spoken word.
      --under dB the bed sits under the voice while she talks (Open Residency ~2, house 6)
  Writes projects/<slug>/assets/music-bed.wav and prints the pick + runners-up.

House shape (from Open Residency, 20 Oct 2026): sparse intro, the drop lands on the reveal, steady bed
under the talk, hard stop on the cliffhanger, no extra sfx on top of a driving track.
"""
import json, os, sys, subprocess, wave
import numpy as np
from ffpath import FFMPEG, ENV, STUDIO, TMP  # this computer's ffmpeg (macOS or Windows)
MUS = os.path.join(STUDIO, 'music')
SR = 24000

def decode(path, sr=SR, ch=1):
    out = os.path.join(TMP, f'rs-mus-{os.getpid()}.wav')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-i', path, '-ac', str(ch), '-ar', str(sr), '-acodec', 'pcm_s16le', out], check=True, env=ENV)
    w = wave.open(out); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768; w.close(); os.remove(out)
    return a.reshape(-1, ch) if ch > 1 else a

def lowpass(x, fc, sr):
    F = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / sr); F[f > fc] = 0; return np.fft.irfft(F, len(x))

def curve(x, sr, step=0.5):
    h = int(sr * step); n = len(x) // h
    return 20 * np.log10(np.sqrt((x[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-6)

def analyse():
    lib = {}
    meta = {t['file']: t for t in json.load(open(os.path.join(MUS, 'tracks.json')))}
    for f in sorted(os.listdir(MUS)):
        if not f.endswith('.mp3'): continue
        x = decode(os.path.join(MUS, f))
        dur = len(x) / SR
        x = x[:int(SR * 150)]
        A, L = curve(x, SR), curve(lowpass(x, 150, SR), SR)
        # the drop: biggest 2-second rise in the bass after something quieter
        best, at = 0, None
        for i in range(4, len(L) - 4):
            rise = np.mean(L[i:i + 4]) - np.mean(L[max(0, i - 8):i])
            if rise > best: best, at = rise, i * 0.5
        # tempo from onset autocorrelation
        env = np.abs(np.diff(curve(x, SR, 0.01)))
        env = env - env.mean(); ac = np.correlate(env, env, 'full')[len(env) - 1:]
        lags = np.arange(len(ac)) * 0.01; ok = (lags > 0.33) & (lags < 1.0)
        bpm = round(60 / lags[ok][np.argmax(ac[ok])]) if ok.any() else None
        lib[f] = {**{k: meta.get(f, {}).get(k) for k in ('mood', 'title', 'page')}, 'duration': round(dur, 1), 'bpm': bpm,
                  'drop': at, 'dropRise': round(float(best), 1), 'loud': [round(float(v), 1) for v in A[::2]]}
        print(f'{f:28s} {dur:6.1f}s bpm {bpm}  drop {at}s (+{best:.0f} dB bass)')
    json.dump(lib, open(os.path.join(MUS, 'library.json'), 'w'), indent=1)

def score(slug, drop, stop, moods, pick, under):
    P = os.path.join(STUDIO, 'projects', slug)
    plan = json.load(open(os.path.join(P, 'plan.json')))
    D = plan['duration']; words = plan['captions']['words']
    stop = stop if stop is not None else max(w['e'] for w in words)
    lib = json.load(open(os.path.join(MUS, 'library.json')))
    used = json.load(open(os.path.join(MUS, 'used.json'))) if os.path.exists(os.path.join(MUS, 'used.json')) else {}
    cands = []
    for f, m in lib.items():
        if moods and m['mood'] not in moods: continue
        if m['drop'] is None or m['dropRise'] < 5: continue
        start = m['drop'] - drop                     # track second at output 0
        if start < 0 or start + stop > m['duration']: continue
        s = m['dropRise'] - (3 if used.get(f) else 0)
        cands.append((s, f, start))
    if not cands: sys.exit('no track fits: widen --mood or add tracks')
    cands.sort(reverse=True)
    s, f, start = cands[min(pick, len(cands) - 1)]
    x = decode(os.path.join(MUS, f), 48000, 2)
    seg = x[int(start * 48000): int((start + D) * 48000)]
    if len(seg) < int(D * 48000): seg = np.vstack([seg, np.zeros((int(D * 48000) - len(seg), 2), np.float32)])
    t = np.arange(len(seg)) / 48000
    speech = np.zeros(len(seg), bool)
    for w in words: speech[int(w['s'] * 48000):int(w['e'] * 48000)] = True
    # smooth the speech mask so the bed breathes rather than pumps
    k = int(48000 * 0.25); sm = np.convolve(speech.astype(np.float32), np.ones(k) / k, 'same')
    voice_db = -18.0                                   # proxies are loudnormed to -14 LUFS: speech RMS sits near -18 dBFS
    rms = lambda a: 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9)
    body = seg[(t > drop) & (t < stop)]
    base = voice_db - under - rms(body if len(body) else seg)
    gain_db = base - 3 * sm                            # a further 3 dB under while she talks
    g = 10 ** (gain_db / 20)
    g *= np.clip(t / 0.4, 0, 1)                        # fade in
    g *= np.where(t < stop, 1, 0) * np.clip((stop - t) / 0.06 + 1, 0, 1) ** 0  # hard stop on the open loop
    g[t >= stop] = 0
    seg = seg * g[:, None]
    out = os.path.join(P, 'assets', 'music-bed.wav')
    w = wave.open(out, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(48000)
    w.writeframes((np.clip(seg, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()
    used[f] = used.get(f, 0) + 1; json.dump(used, open(os.path.join(MUS, 'used.json'), 'w'), indent=1)
    m = lib[f]
    print(f'pick: {m["title"]} ({f}) from {start:.1f}s, drop at {drop}s, stops at {stop:.2f}s, {under} dB under voice')
    print('licence page:', m['page'])
    for s2, f2, st2 in cands[:4]:
        if f2 != f: print('  runner-up:', lib[f2]['title'], f2)

if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'analyse': analyse()
    else:
        opt = lambda k, d=None: a[a.index(k) + 1] if k in a else d
        score(a[1], float(opt('--drop')), float(opt('--stop')) if opt('--stop') else None,
              [m for m in (opt('--mood', '') or '').split(',') if m], int(opt('--pick', 0)), float(opt('--under', 6)))
