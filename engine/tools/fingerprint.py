#!/usr/bin/env python3
"""Music fingerprints: how a track SOUNDS in numbers, so candidates can be matched to references.
  python3 tools/fingerprint.py file.wav|mp3 ...   -> prints JSON per file
Features (on a mono 22.05 kHz mix, skipping silence):
  bpm, centroid (brightness, Hz), bass (share of energy under 150 Hz), hats (high-band onsets per second,
  the 'clicking'), punch (mean onset strength), dyn (spread of 1 s loudness, dB), sparse (share of quiet seconds)
"""
import sys, os, json, subprocess, wave, numpy as np
from ffpath import FFMPEG, ENV, TMP  # this computer's ffmpeg (macOS or Windows)
SR = 22050
def load(p, start=0, dur=75):
    out = os.path.join(TMP, f'fp-{os.getpid()}.wav')
    subprocess.run([FFMPEG, '-y', '-loglevel', 'error', '-ss', str(start), '-t', str(dur), '-i', p, '-ac', '1', '-ar', str(SR), '-acodec', 'pcm_s16le', out], check=True, env=ENV)
    w = wave.open(out); x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768; w.close(); os.remove(out); return x
def stft_frames(x, n=2048, hop=512):
    m = (len(x) - n) // hop
    idx = np.arange(n)[None, :] + hop * np.arange(m)[:, None]
    return np.abs(np.fft.rfft(x[idx] * np.hanning(n), axis=1)), hop
def features(x):
    S, hop = stft_frames(x); f = np.fft.rfftfreq(2048, 1 / SR); dt = hop / SR
    e = S ** 2; tot = e.sum(1) + 1e-12
    loud = 10 * np.log10(tot); live = loud > np.percentile(loud, 95) - 35
    centroid = float(np.median((S[live] * f).sum(1) / (S[live].sum(1) + 1e-9)))
    bass = float(np.median(e[live][:, f < 150].sum(1) / tot[live]))
    hi = e[:, (f > 6000) & (f < 11000)].sum(1); hflux = np.maximum(np.diff(np.log(hi + 1e-9)), 0)
    share = hi / tot
    pk = (hflux > 1.2) & (share[1:] > 0.004) & (np.r_[hflux[1:], 0] < hflux) & (np.r_[0, hflux[:-1]] < hflux)
    hats = float(pk.sum() / (len(hflux) * dt))
    flux = np.maximum(np.diff(S, axis=0), 0).sum(1); flux /= flux.max() + 1e-9
    fc = flux - flux.mean(); ac = np.correlate(fc, fc, 'full')[len(fc) - 1:]
    lags = np.arange(len(ac)) * dt; ok = (lags > 0.33) & (lags < 1.0)
    bpm = float(60 / lags[ok][np.argmax(ac[ok])])
    sec = int(1 / dt); n = len(loud) // sec; L1 = 10 * np.log10(tot[:n * sec].reshape(n, sec).mean(1))
    return {'bpm': round(bpm), 'centroid': round(centroid), 'bass': round(bass, 3), 'hats': round(hats, 2),
            'punch': round(float(flux.mean()), 3), 'dyn': round(float(L1.std()), 1), 'sparse': round(float((L1 < L1.max() - 12).mean()), 2)}
if __name__ == '__main__':
    out = {}
    for p in sys.argv[1:]:
        try: out[os.path.basename(os.path.dirname(p)) + '/' + os.path.basename(p) if 'htdemucs' in p else os.path.basename(p)] = features(load(p))
        except Exception as ex: print('skip', p, ex, file=sys.stderr)
    print(json.dumps(out, indent=1))
