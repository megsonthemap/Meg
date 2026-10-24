"""Voice clean-up for a talking clip, all on this Mac.

    python3 enhance.py in.wav out.wav [--atten 30]

1. DeepFilterNet (tools/bin/deep-filter): background noise and room echo out.
2. deplosive.py: low "p"/"b" thumps ducked where they spike, sub-rumble under ~70 Hz cut.
3. De-ess: the 5-10 kHz band turned down only where it jumps above the voice.
Loudness (-14 LUFS) is left to ffmpeg's loudnorm in reel.mjs, which the bundled build has.
Input: 16-bit mono or stereo wav at 48 kHz (what DeepFilterNet expects).
"""
import os, subprocess, sys, tempfile, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def read(path):
    w = wave.open(path); ch = w.getnchannels(); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float64) / 32768
    w.close()
    return x.reshape(-1, ch), sr


def write(path, x, sr):
    w = wave.open(path, 'wb'); w.setnchannels(x.shape[1]); w.setsampwidth(2); w.setframerate(sr)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes()); w.close()


def deess(x, sr, lo=5000, hi=10000, ratio=0.35):
    # STFT with 50% overlap Hann windows; where the sibilant band's energy is more than `ratio`
    # of the whole frame's, scale that band down to bring it back to `ratio`
    n = 1024; hop = n // 2; win = np.hanning(n)
    out = np.zeros_like(x)
    norm = np.zeros(len(x))
    f = np.fft.rfftfreq(n, 1 / sr); band = (f >= lo) & (f <= hi)
    for c in range(x.shape[1]):
        sig = np.r_[x[:, c], np.zeros(n)]
        for i in range(0, len(x), hop):
            seg = sig[i:i + n] * win
            S = np.fft.rfft(seg)
            e_all = np.sum(np.abs(S) ** 2) + 1e-12; e_b = np.sum(np.abs(S[band]) ** 2)
            share = e_b / e_all
            if share > ratio: S[band] *= np.sqrt(ratio / share)
            y = np.fft.irfft(S, n) * win
            end = min(i + n, len(x))
            out[i:end, c] += y[:end - i]
            if c == 0: norm[i:end] += (win ** 2)[:end - i]
    return out / np.maximum(norm, 1e-6)[:, None]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    atten = sys.argv[sys.argv.index('--atten') + 1] if '--atten' in sys.argv else '30'
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run([os.path.join(HERE, 'bin', 'deep-filter'), '-D', '-a', atten, '-o', tmp, src], check=True, capture_output=True)
        denoised = os.path.join(tmp, os.path.basename(src))
        plos = os.path.join(tmp, 'plos.wav')
        r = subprocess.run([sys.executable, os.path.join(HERE, 'deplosive.py'), denoised, plos], check=True, capture_output=True, text=True)
        x, sr = read(plos)
        n_in = read(src)[0].shape[0]
        y = deess(x, sr)
        if len(y) < n_in: y = np.r_[y, np.zeros((n_in - len(y), y.shape[1]))]  # same length as the input keeps lips in sync
        write(dst, y[:n_in], sr)
    print('enhanced:', os.path.basename(src), '|', r.stdout.strip())


if __name__ == '__main__':
    main()
