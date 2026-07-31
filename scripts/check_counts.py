import json

d = json.load(open('face-index/face_index.json', encoding='utf-8'))
for p in d['persons']:
    unique = len(set(p.get('photos', [])))
    print(f"{p['personId']}: photoCount={p['photoCount']} (number of face detections), unique_files={unique} (unique photos)")