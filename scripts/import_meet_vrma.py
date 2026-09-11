"""Import the Apache-2.0 subset of Hanami's Overte conversions at a pinned revision."""
import hashlib
import json
from pathlib import Path
import struct
import subprocess

REVISION = '6787685c8d40e4e79bffbb0d389b478f32ef88d6'
BASE = f'https://raw.githubusercontent.com/Undi95/Hanami/{REVISION}/vrma'
ROOT = Path(__file__).resolve().parents[1] / 'app/static/animations/meet'
# Use head/torso masks for quiet gestures so resting hands retain the fitted rig pose.
SOURCES = {
    'idle': 'idle.fbx', 'idle-talking': 'talk_armsdown.fbx',
    'idle-talking-4': 'talk03.fbx', 'neutral': 'idle_once_headtilt.fbx',
    'relaxed': 'idle_once_neckstretch.fbx', 'think': 'idle_once_lookaround.fbx',
    'nod': 'emote_agree_headnod.fbx', 'nod-2': 'emote_agree_acknowledge.fbx',
    'nod-3': 'emote_agree_headnodyes.fbx', 'nod-4': 'emote_agree_longheadnod.fbx',
    'nod-5': 'emote_agree_thoughtfulheadnod.fbx',
    'idle-2': 'idle04.fbx', 'idle-3': 'idle03.fbx', 'idle-4': 'idle02.fbx',
    'idle-talking-5': 'talk04.fbx', 'idle-talking-6': 'talk_lefthand.fbx',
    'idle-talking-7': 'talk_righthand.fbx', 'relaxed-3': 'idle_once_fidget.fbx',
    'think-2': 'idle_once_lookleftright.fbx', 'shake': 'emote_disagree_annoyedheadshake.fbx',
    'angry-2': 'emote_disagree_thoughtfulheadshake.fbx',
}

def fetch(url, path):
    subprocess.run(['curl', '-fsSL', '--retry', '3', url, '-o', str(path)], check=True)

if __name__ == '__main__':
    out = ROOT / 'overte'; out.mkdir(parents=True, exist_ok=True)
    fetch(f'{BASE}/NOTICE.md', out / 'UPSTREAM-NOTICE.md')
    fetch('https://www.apache.org/licenses/LICENSE-2.0.txt', out / 'LICENSE.txt')
    entries = {}
    for name, source in SOURCES.items():
        path = out / f'{name}.vrma'; fetch(f'{BASE}/{name}.vrma', path)
        data = path.read_bytes(); size = struct.unpack_from('<I', data, 12)[0]
        gltf = json.loads(data[20:20+size])
        bones = gltf['extensions']['VRMC_vrm_animation']['humanoid']['humanBones']
        mask = [b for b in bones if b in ('head', 'neck', 'spine', 'chest', 'upperChest')]
        if name.startswith('idle-talking'):
            mask = [b for b in bones if b in mask or any(x in b for x in ('Shoulder','UpperArm','LowerArm','Hand','Thumb','Index','Middle','Ring','Little'))]
        duration = max(gltf['accessors'][s['input']]['max'][0] for s in gltf['animations'][0]['samplers'])
        entries[f'overte-{name}'] = dict(url=f'/static/animations/meet/overte/{name}.vrma', bones=mask,
            duration=duration, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
            license='Apache-2.0', source=f'{BASE}/{name}.vrma', upstreamAnimation=source, revision=REVISION)
    (out / 'manifest.json').write_text(json.dumps(entries, indent=2)+'\n')
    (out / 'README.md').write_text(f'''# Overte conversational animations

{len(entries)} unmodified VRMA conversions from [Hanami](https://github.com/Undi95/Hanami/tree/{REVISION}/vrma), pinned to `{REVISION}`. Original FBX animation names, source URLs, durations and SHA-256 digests are recorded in manifest.json. These selected files are listed under Overte in UPSTREAM-NOTICE.md and licensed under Apache-2.0 (LICENSE.txt).

Copyright (c) 2013-2019, High Fidelity, Inc.
Copyright (c) 2019-2021, Vircadia contributors.
Copyright (c) 2022-2026, Overte e.V.

Original source: https://github.com/overte-org/overte/tree/master/interface/resources/avatar/animations

The upstream conversion notice describes retargeting, trimming and resampling. Emora does not modify these binaries. At playback it masks root, leg, expression and gaze tracks; quiet reactions use torso/head only. Speaking clips also use arms and fingers. This keeps the standing avatar grounded and preserves its facial animation. Other assets mentioned in the upstream notice are not included here.

Reproduce: `python3 scripts/import_meet_vrma.py && python3 scripts/build_meet_vrma.py`.
''')
    print(f'Imported {len(entries)} Apache-2.0 clips.')
