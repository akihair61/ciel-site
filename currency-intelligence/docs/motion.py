import sys, subprocess, numpy as np
# usage: motion.py file start dur crop(w:h:x:y or -) fps
f, start, dur, crop, fps = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4], int(sys.argv[5])
vf = f"fps={fps}" + (f",crop={crop}" if crop != "-" else "") + ",scale=120:-1,format=gray"
raw = subprocess.run(["ffmpeg","-v","error","-ss",str(start),"-t",str(dur),"-i",f,"-vf",vf,"-f","rawvideo","-"],capture_output=True).stdout
# find w,h
probe = subprocess.run(["ffmpeg","-v","error","-ss",str(start),"-t","0.1","-i",f,"-vf",vf,"-frames:v","1","-f","rawvideo","-"],capture_output=True).stdout
w=120; h=len(probe)//w
n=len(raw)//(w*h); fr=np.frombuffer(raw[:n*w*h],dtype=np.uint8).reshape(n,h,w).astype(np.int16)
d=np.abs(np.diff(fr,axis=0)).mean(axis=(1,2))
bars=" ▁▂▃▄▅▆▇█"
mx=max(d.max(),1)
line="".join(bars[min(8,int(x/mx*8))] for x in d)
print(f"{f} t={start}s +{dur}s @{fps}fps max={mx:.1f}")
# print in rows of fps frames (1 second per row)
for i in range(0,len(line),fps):
    seg=d[i:i+fps]; print(f"{start+i/fps:5.2f}s |{line[i:i+fps]}| " + " ".join(f"{x:4.1f}" for x in seg))
