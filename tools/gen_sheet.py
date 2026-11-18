import cv2, numpy as np, json, random, sys, os
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv)>1 else 0)
random.seed(int(sys.argv[1]) if len(sys.argv)>1 else 0)
N,Q=6,20
P=5
XB=9+(N-1)*P+12; AX=(XB+13) if os.environ.get('BKGEO') else 9+(N-1)*P+14; C=-(-Q//10); W=AX+(C-1)*36+7+20+10; H=74
page=cv2.imread(os.environ.get('PAGE','pageS-1.png'))
g=cv2.cvtColor(page,cv2.COLOR_BGR2GRAY)
_,bw=cv2.threshold(g,128,255,cv2.THRESH_BINARY_INV)
cnts,_=cv2.findContours(bw,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
sq=[]
for c in cnts:
    x,y,w,h=cv2.boundingRect(c); a=cv2.contourArea(c)
    if 30<w<70 and 0.8<w/h<1.25 and bw[y:y+h,x:x+w].mean()>0.85*255: sq.append((x+w/2,y+h/2))
assert len(sq)==4, sq
sq=sorted(sq,key=lambda p:p[1]); top=sorted(sq[:2]); bot=sorted(sq[2:])
dst=np.float32([top[0],top[1],bot[1],bot[0]]); src=np.float32([[0,0],[W,0],[W,H],[0,H]])
M=cv2.getPerspectiveTransform(src,dst)
def mm2px(x,y):
    v=M@np.array([x,y,1.0]); return v[:2]/v[2]
s=np.linalg.norm(mm2px(1,0)-mm2px(0,0))
def fill(x,y,dark=40,frac=1.0,jit=0.25):
    cx,cy=mm2px(x+rng.normal(0,jit),y+rng.normal(0,jit))
    r=1.9*s*frac
    mask=np.zeros(g.shape,np.uint8)
    cv2.ellipse(mask,(int(cx),int(cy)),(int(r*rng.uniform(0.9,1.1)),int(r*rng.uniform(0.9,1.1))),rng.uniform(0,180),0,360,255,-1)
    tex=rng.normal(0,18,g.shape)
    m=mask>0
    for ch in range(3):
        page[...,ch][m]=np.clip(np.minimum(page[...,ch][m], dark+tex[m]),0,255)
truth={}
nd=6
num=os.environ.get('NUM') or ''.join(str(random.randint(0,9)) for _ in range(nd))
for j,ch in enumerate(num): fill(9+j*P,20+int(ch)*P,dark=random.randint(30,90))
bk=''
ans=[]
for q in range(Q):
    c,r=q//10,q%10; bx=AX+c*36
    t=random.random()
    if os.environ.get('ANS'):
        ch=os.environ['ANS'][q]
        if ch=='.': ans.append('.'); continue
        k='ABCDE'.index(ch); ans.append(ch)
    else:
        if t<0.1: ans.append('.'); continue
        k=random.randint(0,4); ans.append('ABCDE'[k])
    dark=random.randint(25,135 if os.environ.get('HARD') else 100)
    fill(bx+7+k*P,20+r*P,dark=dark)
# özel durumlar
if os.environ.get('CLEAN'): pass
else:
  q=3; c,r=q//10,q%10; bx=AX+c*36
  k2=( 'ABCDE'.index(ans[q])+2)%5 if ans[q]!='.' else 1
  if ans[q]=='.': ans[q]='B'; fill(bx+7+1*P,20+r*P)
  else: fill(bx+7+k2*P,20+r*P); ans[q]='*'
  q=7; c,r=q//10,q%10; bx=AX+c*36
  fill(bx+7+0*P,20+r*P,dark=185,frac=0.9)
import os
HARD=os.environ.get('HARD')
truth={'num':num,'bk':bk,'ans':''.join(ans)}
# sahne: arka plan + perspektif + ışık
if HARD:
    Hh0,Ww0=page.shape[:2]
    yy0,xx0=np.mgrid[0:Hh0,0:Ww0].astype(np.float32)
    amp=rng.uniform(4,9)
    mapx=xx0+amp*np.sin(yy0/Hh0*np.pi*1.3)
    mapy=yy0+amp*np.sin(xx0/Ww0*np.pi)
    page=cv2.remap(page,mapx,mapy,cv2.INTER_LINEAR,borderValue=(255,255,255))
Hh,Ww=page.shape[:2]
bg=np.full((int(Hh*1.3),int(Ww*1.3),3),(60,90,120),np.uint8)+rng.normal(0,10,(int(Hh*1.3),int(Ww*1.3),3)).astype(np.int16).clip(-30,30).astype(np.uint8)
ang=np.deg2rad(rng.uniform(-12,12)); flip=len(sys.argv)>2 and sys.argv[2]=='flip'
if flip: ang+=np.pi
corn=np.float32([[0,0],[Ww,0],[Ww,Hh],[0,Hh]])-np.float32([Ww/2,Hh/2])
R=np.array([[np.cos(ang),-np.sin(ang)],[np.sin(ang),np.cos(ang)]])
d=(corn@R.T)*rng.uniform(0.85,1.0)+rng.normal(0,Ww*0.04,(4,2))
d=d+np.float32([bg.shape[1]/2,bg.shape[0]/2])
Mp=cv2.getPerspectiveTransform(corn+np.float32([Ww/2,Hh/2]),d.astype(np.float32))
warped=cv2.warpPerspective(page,Mp,(bg.shape[1],bg.shape[0]),borderValue=(0,0,0))
mask=cv2.warpPerspective(np.full((Hh,Ww),255,np.uint8),Mp,(bg.shape[1],bg.shape[0]))
out=np.where(mask[...,None]>0,warped,bg).astype(np.float32)
if HARD:
    for _ in range(3):
        x0=int(rng.uniform(0,out.shape[1]-120)); y0=int(rng.uniform(0,out.shape[0]*0.12))
        cv2.rectangle(out,(x0,y0),(x0+70,y0+70),(15,15,15),-1)
yy,xx=np.mgrid[0:out.shape[0],0:out.shape[1]]
light=0.55+0.45*(xx/out.shape[1])*rng.uniform(0.6,1)+0.15*(yy/out.shape[0])
out=out*light[...,None]
out=out*np.array([0.95,1.0,1.08])  # sarımsı ışık
out=cv2.GaussianBlur(out,(0,0),rng.uniform(0.6,1.6))+rng.normal(0,4,out.shape)
out=np.clip(out,0,255).astype(np.uint8)
# portre gibi kırp: formun etrafını
ok,enc=cv2.imencode('.jpg',out,[cv2.IMWRITE_JPEG_QUALITY,78]); out=cv2.imdecode(enc,1)
sc=1600/max(out.shape[:2]); out=cv2.resize(out,None,fx=sc,fy=sc,interpolation=cv2.INTER_AREA)
cv2.imwrite('test.jpg',out)
rgba=cv2.cvtColor(out,cv2.COLOR_BGR2RGBA)
open('test.rgba','wb').write(rgba.tobytes())
json.dump({'w':out.shape[1],'h':out.shape[0],**truth},open('test.json','w'))
print(truth, out.shape)
