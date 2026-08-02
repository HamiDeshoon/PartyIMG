#!/usr/bin/env python3
"""
InsightFace Face Recognition - CPU Optimized
Uses InsightFace library with ONNX Runtime for fast CPU inference.
Much faster and more accurate than face_recognition (dlib).
"""

import os
import sys
import json
import argparse
import traceback
import numpy as np
from pathlib import Path
from PIL import Image
import insightface

# ============================================================
# Configuration & Constants
# ============================================================
DETECTION_THRESHOLD = 0.5
NMS_THRESHOLD = 0.4
RECOGNITION_THRESHOLD = 0.6   # Cosine similarity threshold (lower = stricter)
DUPLICATE_THRESHOLD = 0.95    # Very high similarity = duplicate face
MAX_IMAGE_SIZE = 800

# Face index JSON structure version
INDEX_VERSION = "2.1"

# Initialize InsightFace app (auto-downloads models on first run)
# buffalo_l uses RetinaFace detection + ArcFace recognition
# For CPU, we use ctx_id=-1
app = None

def get_app(model_name='buffalo_l'):
    """Initialize and return InsightFace app optimized for fast CPU inference."""
    global app
    if app is None:
        print(f"Initializing InsightFace ({model_name} model, CPU optimized)...")
        # Restrict allowed_modules to detection and recognition to skip heavy unused 3D landmark & gender/age models
        app = insightface.app.FaceAnalysis(
            name=model_name,
            allowed_modules=['detection', 'recognition'],
            providers=['CPUExecutionProvider']
        )
        app.prepare(ctx_id=-1, det_size=(640, 640))
        print("InsightFace initialized successfully (detection: SCRFD_10G_KPS / det_10g, recognition: ArcFace).")
    return app


# ============================================================
# Face Index Management
# ============================================================
def load_face_index(json_path: Path):
    """Load existing face index JSON."""
    if json_path.exists():
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if data.get('version') != INDEX_VERSION:
                print(f"Index version mismatch (found {data.get('version')}, expected {INDEX_VERSION}). Rebuilding...")
                return None
            return data
    return None


def save_face_index(json_path: Path, index_data: dict):
    """Save face index JSON atomically."""
    index_data['version'] = INDEX_VERSION
    tmp_path = json_path.with_suffix('.json.tmp')
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
    tmp_path.replace(json_path)


def cosine_similarity(a, b):
    """Cosine similarity between two vectors with safe normalization."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def is_duplicate_face(face_embedding, existing_embeddings, threshold=DUPLICATE_THRESHOLD):
    """Check if face embedding is duplicate of existing (very high similarity)."""
    for existing in existing_embeddings:
        sim = cosine_similarity(face_embedding, existing)
        if sim > threshold:
            return True
    return False


# ============================================================
# Main Processing Pipeline
# ============================================================
def process_images(input_dirs, output_dir, tolerance=0.6, max_size=800, model_name='buffalo_l', manifest=None, guest_selfies_dir=None):
    """
    Main face indexing pipeline using InsightFace.
    
    Args:
        input_dirs: List of directories to scan for images
        output_dir: Output directory for face index and crops
        tolerance: Recognition threshold (cosine similarity, lower = stricter)
        max_size: Max image dimension for processing
        model_name: InsightFace model pack ('buffalo_l' or 'buffalo_sc')
        manifest: Optional path to a text file containing paths of allowed image files to process
        guest_selfies_dir: Optional path to a directory containing guest selfies (filename = guestname)
    """
    app = get_app(model_name=model_name)
    
    output_dir = Path(output_dir)
    faces_dir = output_dir / "faces"
    faces_dir.mkdir(parents=True, exist_ok=True)
    
    json_path = output_dir / "face_index.json"
    
    # Load existing index
    existing_index = load_face_index(json_path)
    if existing_index:
        processed_photos = set(existing_index.get('processedPhotoNames', []))
        persons = existing_index.get('persons', [])
        all_faces = existing_index.get('allFaces', [])
        
        # Reconstruct person embeddings
        person_embeddings = {}
        for p in persons:
            if p.get('faceEncoding'):
                person_embeddings[p['personId']] = np.array(p['faceEncoding'], dtype=np.float32)
        
        print(f"Loaded existing index: {len(processed_photos)} photos, {len(persons)} persons, {len(all_faces)} faces")
    else:
        processed_photos = set()
        persons = []
        all_faces = []
        person_embeddings = {}
        print("No existing index found. Starting fresh.")
    
    # Find all image files (excluding dynamic webp thumbnails)
    image_extensions = {'.jpg', '.jpeg', '.png', '.heic', '.webp', '.JPG', '.JPEG', '.PNG', '.HEIC', '.WEBP'}
    photo_files = []
    seen_paths = set()
    
    allowed_files = None
    if manifest and Path(manifest).exists():
        with open(manifest, 'r', encoding='utf-8') as f:
            allowed_files = set(line.strip() for line in f if line.strip())
            print(f"Loaded manifest with {len(allowed_files)} allowed files.")
            
    for inp_dir in input_dirs:
        inp_path = Path(inp_dir)
        if inp_path.exists():
            for ext in image_extensions:
                for file_p in inp_path.rglob(f'*{ext}'):
                    if str(file_p) not in seen_paths:
                        if allowed_files is not None and str(file_p) not in allowed_files:
                            continue
                        seen_paths.add(str(file_p))
                        photo_files.append(file_p)
    
    # Filter new photos (not yet processed)
    new_photos = [p for p in photo_files if p.name not in processed_photos]
    print(f"Total photos: {len(photo_files)} | Already processed: {len(processed_photos)} | New: {len(new_photos)}")
    
    if not new_photos and existing_index:
        print("No new photos to process.")
        return
    
    # Collect all known embeddings for deduplication
    all_known_embeddings = list(person_embeddings.values())
    for face in all_faces:
        if face.get('faceEncoding'):
            all_known_embeddings.append(np.array(face['faceEncoding'], dtype=np.float32))
    
    face_id_counter = len(all_faces) + 1
    person_id_counter = len(persons) + 1
    
    # Process new photos
    for idx, photo_path in enumerate(new_photos, 1):
        print(f"[{idx}/{len(new_photos)}] Processing: {photo_path.name} ... ", end="", flush=True)
        
        try:
            # Load image
            img = Image.open(photo_path).convert('RGB')
            img_array = np.array(img)
            orig_h, orig_w = img_array.shape[:2]
            
            # Resize if needed (for detection)
            if max(orig_w, orig_h) > max_size:
                scale = max_size / max(orig_w, orig_h)
                new_w, new_h = int(orig_w * scale), int(orig_h * scale)
                img_resized = img.resize((new_w, new_h), Image.LANCZOS)
                img_array = np.array(img_resized)
            else:
                scale = 1.0
            
            # Detect faces using InsightFace
            faces = app.get(img_array)
            
            if not faces:
                print("No faces detected")
                processed_photos.add(photo_path.name)
                continue
            
            print(f"Detected {len(faces)} face(s)")
            
            # Process each face
            for face_idx, face in enumerate(faces):
                # Get bounding box (scale back to original if resized)
                bbox = face.bbox.astype(int)
                if scale != 1.0:
                    bbox = (bbox / scale).astype(int)
                
                x1, y1, x2, y2 = bbox
                x1 = max(0, min(x1, orig_w - 1))
                y1 = max(0, min(y1, orig_h - 1))
                x2 = max(0, min(x2, orig_w))
                y2 = max(0, min(y2, orig_h))
                
                if x2 <= x1 or y2 <= y1:
                    continue
                
                # Get embedding and normalize it (InsightFace returns raw embeddings)
                raw_emb = face.embedding.astype(np.float32)
                norm_val = np.linalg.norm(raw_emb)
                embedding = raw_emb / norm_val if norm_val > 0 else raw_emb
                
                # Check for duplicate face
                if is_duplicate_face(embedding, all_known_embeddings, threshold=DUPLICATE_THRESHOLD):
                    print(f"    Face {face_idx+1}: Duplicate detected, skipping")
                    continue
                
                # Match against known persons
                best_match_id = None
                best_similarity = -1
                
                for person_id, person_emb in person_embeddings.items():
                    sim = cosine_similarity(embedding, person_emb)
                    if sim > best_similarity and sim > tolerance:
                        best_similarity = sim
                        best_match_id = person_id
                
                if best_match_id:
                    # Add to existing person - update embedding with moving average
                    person_embeddings[best_match_id] = (
                        person_embeddings[best_match_id] * 0.7 + embedding * 0.3
                    )
                    # Renormalize
                    person_embeddings[best_match_id] /= np.linalg.norm(person_embeddings[best_match_id])
                    matched_person_id = best_match_id
                    print(f"    Face {face_idx+1}: Matched Person {matched_person_id} (sim={best_similarity:.3f})")
                else:
                    # New person
                    matched_person_id = f"Person_{person_id_counter}"
                    person_id_counter += 1
                    person_embeddings[matched_person_id] = embedding
                    print(f"    Face {face_idx+1}: NEW Person {matched_person_id}")
                
                # Save aligned face crop as thumbnail
                # InsightFace provides aligned face in face.aligned_face (112x112)
                thumb_name = f"face_{photo_path.stem}_{face_idx+1}.jpg"
                thumb_path = faces_dir / thumb_name
                if not thumb_path.exists() and face.aligned_face is not None:
                    # Convert BGR to RGB and save
                    aligned_rgb = face.aligned_face[:, :, ::-1]
                    thumb = Image.fromarray(aligned_rgb).resize((150, 150), Image.LANCZOS)
                    thumb.save(thumb_path, 'JPEG', quality=90)
                
                # Create face record
                face_record = {
                    'faceId': f"face_{face_id_counter}",
                    'personGroup': matched_person_id,
                    'photoName': photo_path.name,
                    'photoPath': str(photo_path),
                    'thumbnailName': thumb_name,
                    'thumbnailPath': str(thumb_path),
                    'boundingBox': {
                        'top': int(y1), 'right': int(x2), 'bottom': int(y2), 'left': int(x1)
                    },
                    'faceEncoding': embedding.tolist(),
                    'detectionScore': float(face.det_score)
                }
                face_id_counter += 1
                
                all_faces.append(face_record)
                all_known_embeddings.append(embedding)
            
            processed_photos.add(photo_path.name)
            
        except Exception as e:
            print(f"Error: {e}")
            processed_photos.add(photo_path.name)
            continue
    
    # Rebuild persons list from face records
    person_faces = {}
    for face in all_faces:
        pid = face['personGroup']
        if pid not in person_faces:
            person_faces[pid] = []
        person_faces[pid].append(face)
    
    # Guest Selfie auto-linking
    guest_selfies = {}
    if guest_selfies_dir:
        gs_dir = Path(guest_selfies_dir)
        if gs_dir.exists():
            print(f"Scanning guest selfies in {gs_dir}...")
            for ext in image_extensions:
                for selfie_path in gs_dir.rglob(f'*{ext}'):
                    try:
                        guest_name = selfie_path.stem
                        img = Image.open(selfie_path).convert('RGB')
                        img_array = np.array(img)
                        faces = app.get(img_array)
                        if faces:
                            # Use the largest face if multiple
                            faces = sorted(faces, key=lambda f: (f.bbox[2]-f.bbox[0])*(f.bbox[3]-f.bbox[1]), reverse=True)
                            raw_emb = faces[0].embedding.astype(np.float32)
                            norm_val = np.linalg.norm(raw_emb)
                            guest_selfies[guest_name] = raw_emb / norm_val if norm_val > 0 else raw_emb
                    except Exception as e:
                        print(f"Failed to process selfie {selfie_path.name}: {e}")
            print(f"Loaded {len(guest_selfies)} guest selfie embeddings.")

    persons = []
    for person_id, faces in person_faces.items():
        # Get unique photo names
        unique_photos = list(set(f['photoName'] for f in faces))
        
        # Get average embedding
        embeddings = [np.array(f['faceEncoding'], dtype=np.float32) for f in faces if f.get('faceEncoding')]
        avg_embedding = np.mean(embeddings, axis=0) if embeddings else None
        if avg_embedding is not None:
            avg_embedding /= np.linalg.norm(avg_embedding)
            
        display_name = f"شخص {len(persons) + 1}"
        
        # Match against guest selfies
        if avg_embedding is not None and guest_selfies:
            best_guest = None
            best_sim = -1
            for gname, gemb in guest_selfies.items():
                sim = cosine_similarity(avg_embedding, gemb)
                if sim > best_sim and sim > tolerance:
                    best_sim = sim
                    best_guest = gname
            
            if best_guest:
                display_name = best_guest
                print(f"Auto-linked {person_id} to guest: {best_guest} (sim: {best_sim:.3f})")
        
        persons.append({
            'personId': person_id,
            'displayName': display_name,
            'photoCount': len(unique_photos),
            'sampleThumbnailName': faces[0]['thumbnailName'] if faces else '',
            'sampleThumbnailPath': faces[0]['thumbnailPath'] if faces else '',
            'photos': unique_photos,
            'faceEncoding': avg_embedding.tolist() if avg_embedding is not None else None
        })
    
    # Save updated index
    index_data = {
        'version': INDEX_VERSION,
        'lastUpdated': str(Path(json_path).stat().st_mtime if json_path.exists() else 0),
        'totalPhotos': len(photo_files),
        'processedPhotoNames': list(processed_photos),
        'totalFacesDetected': len(all_faces),
        'totalUniquePersons': len(persons),
        'outputDirectory': str(output_dir),
        'persons': persons,
        'allFaces': all_faces
    }
    
    save_face_index(json_path, index_data)
    
    print("\n" + "=" * 60)
    print("FACE INDEXING COMPLETE")
    print("=" * 60)
    print(f"Total Photos Scanned  : {len(photo_files)}")
    print(f"New Photos Processed  : {len(new_photos)}")
    print(f"Total Faces Extracted : {len(all_faces)}")
    print(f"Unique Person Groups  : {len(persons)}")
    print(f"JSON Index Saved To   : {json_path}")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="InsightFace Face Indexer (CPU Optimized)")
    parser.add_argument('--input-dir', nargs='+', required=True, help='Input directories to scan')
    parser.add_argument('--output-dir', required=True, help='Output directory for face index')
    parser.add_argument('--tolerance', type=float, default=0.6, help='Recognition threshold (cosine sim)')
    parser.add_argument('--max-size', type=int, default=800, help='Max image dimension for processing')
    parser.add_argument('--model-name', default='buffalo_l', choices=['buffalo_l', 'buffalo_sc'], help='InsightFace model pack (buffalo_l or ultra-fast buffalo_sc)')
    parser.add_argument('--manifest', help='Path to a text file with allowed image paths')
    parser.add_argument('--guest-selfies-dir', help='Path to directory containing guest selfies')
    args = parser.parse_args()
    
    process_images(args.input_dir, args.output_dir, args.tolerance, args.max_size, args.model_name, args.manifest, args.guest_selfies_dir)


if __name__ == '__main__':
    main()