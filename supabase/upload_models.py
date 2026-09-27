#!/usr/bin/env python3
"""Upload the face-match models to the private Storage bucket "ml-models" (run once, or after changing models).
Downloads them from OpenCV Zoo / jsDelivr if not present in --dir. Needs an admin login and a temporary upload policy:
  create policy tmp_models_upload on storage.objects for insert to authenticated
    with check (bucket_id = 'ml-models' and (select private.is_admin()));
  ... run this script ...
  drop policy tmp_models_upload on storage.objects;
Usage: LAQEETO_TEST_CREDENTIALS=~/.laqeeto_admin_credentials python3 supabase/upload_models.py [--dir DIR]"""
import hashlib, json, os, re, sys, urllib.request, urllib.error
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
cfg = (ROOT / 'js/config.js').read_text()
URL = re.search(r"SUPABASE_URL = '([^']+)'", cfg).group(1); ANON = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", cfg).group(1)
MODELS = {
    'face_detection_yunet_2023mar.onnx': 'https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx',
    'face_recognition_sface_2021dec_int8.onnx': 'https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec_int8.onnx',
    'ort-wasm-simd-threaded-1.20.1.wasm': 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/ort-wasm-simd-threaded.wasm',
}
d = Path(sys.argv[sys.argv.index('--dir') + 1]) if '--dir' in sys.argv else Path('.models'); d.mkdir(exist_ok=True)
admin = json.load(open(os.environ['LAQEETO_TEST_CREDENTIALS']))['admin']
def call(method, path, token, data=None, headers=None):
    h = {'apikey': ANON, 'Authorization': 'Bearer ' + token, **(headers or {})}
    try:
        with urllib.request.urlopen(urllib.request.Request(URL + path, data=data, method=method, headers=h), timeout=300) as r: return r.status, r.read()
    except urllib.error.HTTPError as e: return e.code, e.read()
code, body = call('POST', '/auth/v1/token?grant_type=password', ANON, json.dumps({'email': admin['email'], 'password': admin['password']}).encode(), {'Content-Type': 'application/json'})
tok = json.loads(body)['access_token']
for name, src in MODELS.items():
    p = d / name
    if not p.exists(): urllib.request.urlretrieve(src, p)
    b = p.read_bytes()
    code, body = call('POST', f'/storage/v1/object/ml-models/{name}', tok, b, {'Content-Type': 'application/octet-stream', 'x-upsert': 'false'})
    print(name, len(b), hashlib.sha256(b).hexdigest()[:16], code, body[:120] if code >= 300 else '')
