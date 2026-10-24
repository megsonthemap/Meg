#!/usr/bin/env python3
"""Rank candidate tracks against reference fingerprints, then build numbered auditions under a cut.
  python3 tools/audition.py rank                      -> prints ranked candidates
  python3 tools/audition.py build <slug> <video.mp4> --drop T --len S --top N [--under 11]
Writes ~/Downloads/Reels/audition/<slug>-music-<n>.mp4 and audition.json (which file is which track).
"""
import sys, os, json, subprocess, wave, numpy as np
from ffpath import FFMPEG, ENV, STUDIO, TMP  # this computer's ffmpeg (macOS or Windows)
ST = STUDIO; C = os.path.join(ST, 'music', 'candidates')
KEYS = ['bpm', 'centroid', 'bass', 'hats', 'punch', 'dyn', 'sparse']
def vec(f):
    b = f['bpm']
    while b < 80: b *= 2
    while b > 160: b /= 2
    return np.array([b, np.log(f['centroid'] + 1), f['bass'], f['hats'], f['punch'], f['dyn'], f['sparse']])
def rank():
    refs = json.load(open(f'{ST}/research/sound/ref-fingerprints.json'))
    cand = json.load(open(f'{C}/cand-fingerprints.json'))
    taste = json.load(open(f'{ST}/music/taste.json')) if os.path.exists(f'{ST}/music/taste.json') else {}
    R = {k: vec(v) for k, v in refs.items() if 'DdRa1fXNdGx' not in k}   # the clicky one she found too much
    allv = np.array(list(R.values()) + [vec(v) for v in cand.values()])
    sd = allv.std(0) + 1e-9; W = np.array([0.6, 1.0, 1.2, 1.4, 1.0, 0.8, 0.8])
    out = []
    for k, v in cand.items():
        cv = vec(v); d = min(np.sqrt((((cv - r) / sd * W) ** 2).sum()) for r in R.values())
        if v['hats'] > 1.6: d += 2                      # constant clicking: she does not like it
        for liked, sign in [(x, -1) for x in taste.get('yes', [])] + [(x, 1) for x in taste.get('no', [])]:
            if liked in cand: d += sign * 1.5 * np.exp(-np.sqrt((((cv - vec(cand[liked])) / sd * W) ** 2).sum()))
        out.append((round(float(d), 2), k, v))
    out.sort(key=lambda x: x[0]); return out
def decode(p, start=0, dur=None, sr=48000):
    o = os.path.join(TMP, f'au-{os.getpid()}.wav'); a = ['-ss', str(start)] + (['-t', str(dur)] if dur else [])
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', *a, '-i', p, '-ac', '2', '-ar', str(sr), '-acodec', 'pcm_s16le', o], check=True, env=ENV)
    w = wave.open(o); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32).reshape(-1, 2) / 32768; w.close(); os.remove(o); return x
def drops(x, sr=48000):
    m = x.mean(1); F = np.fft.rfft(m); f = np.fft.rfftfreq(len(m), 1 / sr); F[f > 150] = 0; lo = np.fft.irfft(F, len(m))
    h = sr // 2; n = len(lo) // h; L = 20 * np.log10(np.sqrt((lo[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-7)
    A = 20 * np.log10(np.sqrt((m[:n * h].reshape(n, h) ** 2).mean(1)) + 1e-7)
    c = [(float(L[i:i + 4].mean() - L[max(0, i - 8):i].mean() + 0.5 * (A[i:i + 4].mean() - A[max(0, i - 8):i].mean())), i * 0.5) for i in range(4, n - 4)]
    return sorted(c, reverse=True)
def build(slug, video, drop, length, top, under):
    P = f'{ST}/projects/{slug}'; plan = json.load(open(f'{P}/plan.json')); words = plan['captions']['words']
    voice = decode(video, 0, length); sr = 48000; t = np.arange(len(voice)) / sr
    sp = np.zeros(len(voice), np.float32)
    for w in words:
        if w['s'] < length: sp[int(w['s'] * sr):int(min(w['e'], length) * sr)] = 1
    k = int(sr * 0.3); sp = np.convolve(sp, np.ones(k) / k, 'same')
    rms = lambda a: 20 * np.log10(np.sqrt((a ** 2).mean()) + 1e-9)
    vdb = rms(voice[sp > 0.5]) if (sp > 0.5).any() else -18
    ranked = rank()[:top]; outdir = os.path.expanduser('~/Downloads/Reels/audition'); os.makedirs(outdir, exist_ok=True)
    key = {}
    for n, (d, f, fp) in enumerate(ranked, 1):
        full = decode(f'{C}/{f}', 0, 150)
        cands = [c for c in drops(full) if c[1] >= drop and c[1] + (length - drop) < len(full) / sr]
        at = cands[0][1] if cands else drop
        start = at - drop
        mus = full[int(start * sr):int(start * sr) + len(voice)]
        if len(mus) < len(voice): mus = np.vstack([mus, np.zeros((len(voice) - len(mus), 2), np.float32)])
        body = mus[t >= drop]; g = vdb - under - rms(body if len(body) else mus)
        gain = 10 ** ((g - 2.5 * sp) / 20) * np.clip(t / 0.3, 0, 1)
        mix = np.clip(voice + mus * gain[:, None], -1, 1)
        wav = os.path.join(TMP, f'au-mix-{n}.wav'); w = wave.open(wav, 'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((mix * 32767).astype(np.int16).tobytes()); w.close()
        out = f'{outdir}/{slug}-music-{n}.mp4'
        subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-t', str(length), '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], check=True, env=ENV)
        key[n] = {'track': f, 'start': round(start, 2), 'drop': at, 'distance': d, 'fingerprint': fp}
        print(n, f, f'from {start:.1f}s (its drop {at}s lands on {drop}s)', 'dist', d, fp)
    json.dump(key, open(f'{outdir}/{slug}-audition.json', 'w'), indent=1)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a[0] == 'rank':
        for d, f, v in rank()[:15]: print(d, f, v)
    else:
        opt = lambda k, dflt: a[a.index(k) + 1] if k in a else dflt
        build(a[1], a[2], float(opt('--drop', 7)), float(opt('--len', 15)), int(opt('--top', 5)), float(opt('--under', 11)))
