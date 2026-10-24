import numpy as np, wave, sys
src,dst=sys.argv[1],sys.argv[2]
w=wave.open(src); ch=w.getnchannels(); sr=w.getframerate(); x=np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float64)/32768; w.close()
x=x.reshape(-1,ch)
def onepole_lp(sig,fc):
    a=np.exp(-2*np.pi*fc/sr); y=np.empty_like(sig); p=np.zeros(sig.shape[1])
    for i in range(len(sig)): p=(1-a)*sig[i]+a*p; y[i]=p
    return y
# 2-pole lowpass at 160 Hz (two cascaded one-poles) = the "thump" band
low=onepole_lp(onepole_lp(x,160),160)
high=x-low
# remove sub-rumble below ~70 Hz entirely
sub=onepole_lp(onepole_lp(x,70),70)
low=low-sub
# 10 ms RMS of each band; plosive = low band jumping above ~0.45 of the voice band
win=int(sr*0.01); n=len(x)//win
L=np.sqrt((low[:n*win].mean(1).reshape(n,win)**2).mean(1)); H=np.sqrt((high[:n*win].mean(1).reshape(n,win)**2).mean(1))
r=L/(H+1e-5)
gw=np.clip(1-(r-0.5)/0.25,0.2,1.0)
gw=np.minimum(gw,np.r_[gw[1:],1]); gw=np.minimum(gw,np.r_[1,gw[:-1]])   # widen by one window each side
g=np.repeat(gw,win); g=np.r_[g,np.ones(len(x)-len(g))]
k=int(sr*0.015); g=np.convolve(g,np.ones(k)/k,'same')
y=high+low*g[:,None]
print('ducked %.1f%% of samples'%(100*np.mean(g<0.9)))
y=np.clip(y,-1,1)
w=wave.open(dst,'wb'); w.setnchannels(ch); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y*32767).astype(np.int16).tobytes()); w.close()
