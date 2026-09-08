#!/usr/bin/env python3
"""Review suspicious catalogue previews. Requires Pillow: python3 -m pip install Pillow.

Small files and low entropy are review signals, not proof that an artwork is bad.
Explicitly unavailable previews are reported separately and stay out of image grids.
"""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'website'
catalogue = json.loads((root / 'data/catalogue.json').read_text())
issues = []
count = 0
for collection in catalogue['collections']:
    for work in collection['items']:
        count += 1
        path = root / work['local'].lstrip('/')
        try:
            with Image.open(path) as image:
                image.load()
                entropy = image.convert('L').entropy()
                width, height = image.size
            size = path.stat().st_size
            if size < 5000 or entropy < 1.2 or min(width, height) < 150:
                issues.append({'collection': collection['id'], 'number': work['number'],
                               'path': work['local'], 'bytes': size, 'entropy': round(entropy, 3),
                               'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                               'status': work.get('previewStatus', 'needs-review')})
        except Exception as error:
            issues.append({'path': work['local'], 'status': 'needs-review', 'error': str(error)})
print(json.dumps({'checked': count, 'flagged': issues}, indent=2))
raise SystemExit(1 if any(w['status'] == 'needs-review' for w in issues) else 0)
