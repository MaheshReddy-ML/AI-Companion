"""Build original Emora conversational keyframes as portable VRMA 1.0 GLBs.
No motion capture, downloaded animation or third-party model data is embedded.
Run from the repository root; outputs are deterministic and small.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

OUT = Path(__file__).resolve().parents[1] / 'app/static/animations/meet'
# Standard T-pose in meters, +Z forward, left on +X. All rest rotations identity.
RIG = [
    ('hips', None, (0, 0.95, 0)), ('spine', 'hips', (0, .12, 0)),
    ('chest', 'spine', (0, .16, 0)), ('upperChest', 'chest', (0, .12, 0)),
    ('neck', 'upperChest', (0, .10, 0)), ('head', 'neck', (0, .09, 0)),
]
for side, sign in [('left', 1), ('right', -1)]:
    RIG += [(side+'Shoulder', 'upperChest', (.08*sign, .06, 0)),
            (side+'UpperArm', side+'Shoulder', (.10*sign, 0, 0)),
            (side+'LowerArm', side+'UpperArm', (.26*sign, 0, 0)),
            (side+'Hand', side+'LowerArm', (.23*sign, 0, 0)),
            (side+'UpperLeg', 'hips', (.09*sign, -.04, 0)),
            (side+'LowerLeg', side+'UpperLeg', (0, -.42, 0)),
            (side+'Foot', side+'LowerLeg', (0, -.40, .01)),
            (side+'Toes', side+'Foot', (0, -.04, .10))]
    for i, finger in enumerate(['Thumb', 'Index', 'Middle', 'Ring', 'Little']):
        names = ['Metacarpal', 'Proximal', 'Distal'] if finger == 'Thumb' else ['Proximal', 'Intermediate', 'Distal']
        parent = side+'Hand'
        for j, joint in enumerate(names):
            name = side+finger+joint
            RIG.append((name, parent, ((.045 if j == 0 else .025)*sign, 0, (.035-i*.016) if j == 0 else 0)))
            parent = name

NEUTRAL = {'head': (-.012, .01, -.006), 'chest': (.02, -.004, -.006),
           'leftShoulder': (.018, .006, .028), 'rightShoulder': (.012, -.006, -.02),
           'leftUpperArm': (.08, .018, 1.34), 'rightUpperArm': (.08, -.018, -1.35),
           'leftLowerArm': (.03, -.02, -.10), 'rightLowerArm': (.03, .02, .10),
           'leftHand': (.025, -.018, .018), 'rightHand': (.018, .016, -.014)}
# Authored Euler poses use the existing stage's VRM0-facing convention; exporter
# converts quaternion X/Z signs into portable VRM1 animation coordinates.
POSES = {
 'wave': (2.4, {'rightUpperArm':(.02,-.06,-.38), 'rightLowerArm':(.05,.06,1.65), 'rightHand':(.85,.08,.06)}),
 'explain': (2.4, {'rightUpperArm':(.08,-.10,-1.0), 'rightLowerArm':(.12,-.18,1.1), 'rightHand':(.85,0,0)}),
 'open_palm': (2.1, {'leftUpperArm':(.08,.10,1.0), 'rightUpperArm':(.08,-.10,-1.0), 'leftLowerArm':(.12,.15,-1.1), 'rightLowerArm':(.12,-.15,1.1), 'leftHand':(-.85,0,0), 'rightHand':(.85,0,0)}),
 'point': (1.9, {'rightUpperArm':(.05,-.10,-.25), 'rightLowerArm':(.10,-.15,.35), 'rightHand':(.5,0,0)}),
 'shrug': (2.0, {'leftShoulder':(.03,.02,.08), 'rightShoulder':(.03,-.02,-.08), 'leftUpperArm':(.08,.05,.9), 'rightUpperArm':(.08,-.05,-.9), 'leftLowerArm':(.12,.15,-1.3), 'rightLowerArm':(.12,-.15,1.3), 'leftHand':(-.85,0,0), 'rightHand':(.85,0,0)}),
 'think': (2.6, {'head':(.055,-.07,.045), 'chest':(-.012, .012, 0)}),
 'nod': (1.2, {'head':(.13,.01,-.006)}),
 'disagree': (1.5, {'head':(-.012,.14,-.006)}),
 'surprise': (1.5, {'head':(-.055,0,0), 'chest':(-.025,0,0), 'leftUpperArm':(.18,.03,1.02), 'rightUpperArm':(.18,-.03,-1.02)}),
 'excited': (2.0, {'leftUpperArm':(-.06,.08,.78), 'rightUpperArm':(-.06,-.08,-.78), 'leftLowerArm':(.15,.15,-1.15), 'rightLowerArm':(.15,-.15,1.15)}),
 'listen': (2.4, {'head':(.025,.015,.018), 'chest':(-.018,0,0)}),
 'acknowledge': (1.1, {'head':(.075,.008,0)}),
}
for finger in ['Middle','Ring','Little']:
    for joint in ['Proximal','Intermediate','Distal']:
        POSES['point'][1]['right'+finger+joint] = (0, 0, -.7)


def quaternion(euler):
    x,y,z = [v/2 for v in euler]
    a,b,c,d,e,f = math.cos(x),math.sin(x),math.cos(y),math.sin(y),math.cos(z),math.sin(z)
    return [-(b*c*e+a*d*f), a*d*e-b*c*f, -(a*c*f+b*d*e), a*c*e-b*d*f]


def build(name, duration, poses):
    nodes = [{'name': n, 'translation': list(pos)} for n, _, pos in RIG]
    indices = {n:i for i,(n,_,_) in enumerate(RIG)}
    for i, (_, parent, _) in enumerate(RIG):
        if parent: nodes[indices[parent]].setdefault('children', []).append(i)
    data = bytearray(); views=[]; accessors=[]
    def accessor(values, kind, bounds=False):
        offset = len(data); flat = [x for row in values for x in row]
        data.extend(struct.pack('<'+'f'*len(flat), *flat))
        views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data)-offset})
        a={'bufferView':len(views)-1,'componentType':5126,'count':len(values),'type':kind}
        if bounds: a.update(min=[min(flat)],max=[max(flat)])
        accessors.append(a); return len(accessors)-1
    frames=math.ceil(duration*30); times=[i*duration/frames for i in range(frames+1)]
    input_id=accessor([[t] for t in times], 'SCALAR', True)
    channels=[]; samplers=[]
    for bone, target in poses.items():
        neutral=NEUTRAL.get(bone,(0,0,0)); values=[]
        for t in times:
            p=t/duration
            # Smooth rise, hold, settle: zero velocity at clip boundaries.
            rise=min(1,p/.24); fall=min(1,(1-p)/.24)
            w=(rise*rise*(3-2*rise))*(fall*fall*(3-2*fall))
            pose=[a+(b-a)*w for a,b in zip(neutral,target)]
            if name=='wave' and bone=='rightHand': pose[2]+=.22*math.sin(p*math.pi*7)*w
            if name=='disagree' and bone=='head': pose[1]=.14*math.sin(p*math.pi*4)*w
            if name=='nod' and bone=='head': pose[0]=neutral[0]+.14*math.sin(p*math.pi*2)**2*w
            if name=='explain' and bone=='rightHand': pose[0]+=.045*math.sin(p*math.pi*3)*w
            values.append(quaternion(pose))
        output_id=accessor(values,'VEC4')
        samplers.append({'input':input_id,'output':output_id,'interpolation':'LINEAR'})
        channels.append({'sampler':len(samplers)-1,'target':{'node':indices[bone],'path':'rotation'}})
    gltf={'asset':{'version':'2.0','generator':'Emora original conversational keyframes'},
          'extensionsUsed':['VRMC_vrm_animation'], 'extensions':{'VRMC_vrm_animation':{'specVersion':'1.0','humanoid':{'humanBones':{n:{'node':i} for n,i in indices.items()}}}},
          'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,
          'animations':[{'name':name,'samplers':samplers,'channels':channels}],
          'buffers':[{'byteLength':len(data)}],'bufferViews':views,'accessors':accessors}
    raw=json.dumps(gltf,separators=(',',':')).encode(); raw+=b' '*((-len(raw))%4)
    data+=b'\0'*((-len(data))%4)
    blob=struct.pack('<III',0x46546c67,2,12+8+len(raw)+8+len(data))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(data),0x004e4942)+data
    (OUT/f'{name}.vrma').write_bytes(blob)
    return {'url':f'/static/animations/meet/{name}.vrma','duration':duration,'bones':list(poses),'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob)}

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    manifest={'version':1,'provenance':'Original project-authored keyframes; see PROVENANCE.md','clips':{name:build(name,*pose) for name,pose in POSES.items()}}
    imported = OUT/'overte/manifest.json'
    if imported.exists():
        manifest['clips'].update(json.loads(imported.read_text()))
        manifest['provenance'] = 'See PROVENANCE.md and overte/README.md for original and Apache-2.0 assets.'
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f"Manifest contains {len(manifest['clips'])} VRMA clips, {sum(c['bytes'] for c in manifest['clips'].values()):,} bytes")
