"""Check shipped VRMA files themselves, including masks and quaternion validity."""
import hashlib
import json
from pathlib import Path
import struct
import math

ROOT = Path(__file__).resolve().parents[1] / 'app/static/animations/meet'


def test_vrma_library_has_valid_humanoid_rotation_tracks():
    manifest = json.loads((ROOT/'manifest.json').read_text())
    assert len(manifest['clips']) == 33
    for name, clip in manifest['clips'].items():
        data = (ROOT/clip['url'].removeprefix('/static/animations/meet/')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == clip['sha256']
        assert struct.unpack_from('<III', data) == (0x46546c67, 2, len(data))
        size = struct.unpack_from('<I', data, 12)[0]
        gltf = json.loads(data[20:20+size])
        extension = gltf['extensions']['VRMC_vrm_animation']
        assert extension['specVersion'] == '1.0'
        bones = extension['humanoid']['humanBones']
        assert all(b in bones for b in ['hips','head','leftHand','rightHand','leftFoot','rightFoot'])
        binary = data[28+size:]
        assert not any(b in clip['bones'] for b in ['hips','leftEye','rightEye','leftFoot','rightFoot'])
        for channel in gltf['animations'][0]['channels']:
            if name.startswith('overte-') and channel['target']['path'] != 'rotation':
                continue
            assert channel['target']['path'] == 'rotation'
            bone = gltf['nodes'][channel['target']['node']]['name']
            if not name.startswith('overte-'):
                assert bone in clip['bones']
                assert bone not in ['hips','leftEye','rightEye','leftFoot','rightFoot']
            sampler = gltf['animations'][0]['samplers'][channel['sampler']]
            accessor = gltf['accessors'][sampler['output']]
            view = gltf['bufferViews'][accessor['bufferView']]
            values = struct.unpack_from('<'+'f'*(accessor['count']*4), binary, view.get('byteOffset', 0) + accessor.get('byteOffset', 0))
            for i in range(0,len(values),4):
                q=values[i:i+4]
                assert all(math.isfinite(v) for v in q)
                assert abs(sum(v*v for v in q)-1)<1e-4
