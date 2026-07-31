#!/usr/bin/env python3
"""
Tiny CPU Face Recognition & Incremental Photo Indexer
---------------------------------------------------
Features:
- 100% CPU-based execution (No GPU or CUDA required).
- Uses dlib's face_recognition library (CNN-based) for accurate face detection + encoding.
- Incremental indexing: skips already processed photos and only indexes newly added files.
- Resizes high-resolution photos in-memory for ultra-fast processing.
- Saves face thumbnails and JSON index outside git repo (default: D:\Wedding\Face_Index).
- Clusters similar faces together into person groups using face encodings (128-D vectors).

Usage:
  python scripts/face_recognizer.py [--input-dir ./uploads] [--output-dir D:\Wedding\Face_Index] [--max-size 800] [--tolerance 0.45]
"""

import os
import sys
import json
import argparse
import traceback
from pathlib import Path

# Fix Windows console UTF-8 output encoding issues
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

try:
    import face_recognition
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    print("Error: Missing required packages. Please install using:")
    print("       pip install face-recognition numpy Pillow")
    sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Tiny CPU Face Recognition & Incremental Photo Indexer")
    parser.add_argument(
        "--input-dir",
        type=str,
        nargs="+",
        default=["./uploads"],
        help="Path(s) to uploaded photos directory (default: ./uploads)"
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=r"D:\Wedding\Face_Index",
        help=r"Output directory outside git repo for face thumbnails & JSON index (default: D:\Wedding\Face_Index)"
    )
    parser.add_argument(
        "--max-size",
        type=int,
        default=800,
        help="Maximum width/height dimension to resize images for fast CPU detection (default: 800px)"
    )
    parser.add_argument(
        "--min-face-size",
        type=int,
        default=40,
        help="Minimum face width/height size in pixels (default: 40px)"
    )
    parser.add_argument(
        "--tolerance",
        type=float,
        default=0.45,
        help="Face matching tolerance (lower = stricter, 0.4-0.5 recommended, default: 0.45). Lower values prevent different people from merging into one cluster."
    )
    return parser.parse_args()


def resize_image_if_needed(img_path, max_size=800):
    """Load and optionally downscale image for faster processing. Returns (PIL Image, scale_factor)."""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    if max(w, h) <= max_size:
        return img, 1.0

    scale = max_size / float(max(w, h))
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    return resized, scale


def get_face_encoding_vector(face_encoding):
    """Convert numpy array face encoding to a list for JSON serialization."""
    if face_encoding is None:
        return None
    return face_encoding.tolist()


def load_encoding_vector(vec_list):
    """Convert a list back to numpy array."""
    if vec_list is None:
        return None
    return np.array(vec_list, dtype=np.float64)


def compare_encodings(known_encodings, target_encoding, tolerance=0.55):
    """
    Compare a face encoding against a list of known encodings.
    Uses face_recognition's built-in compare_faces which computes Euclidean distance
    on the 128-D face embedding space.
    Returns (matched_index, distance) or (None, None).
    """
    if not known_encodings or target_encoding is None:
        return None, None

    # face_recognition.compare_faces returns boolean list
    # face_recognition.face_distance returns distances
    distances = face_recognition.face_distance(known_encodings, target_encoding)
    
    if len(distances) == 0:
        return None, None

    best_match_idx = int(np.argmin(distances))
    best_distance = float(distances[best_match_idx])

    if best_distance <= tolerance:
        return best_match_idx, best_distance
    
    return None, None


def main():
    args = parse_args()
    raw_inputs = args.input_dir if isinstance(args.input_dir, list) else [args.input_dir]
    input_paths = [Path(p).resolve() for p in raw_inputs]
    output_path = Path(args.output_dir).resolve()
    faces_output_path = output_path / "faces"

    print("=" * 60)
    print("   [CPU FACE RECOGNITION & PHOTO INDEXER (face_recognition)]   ")
    print("=" * 60)
    print(f"Input Photos Directory : {[str(p) for p in input_paths]}")
    print(f"Output Save Directory  : {output_path}")
    print(f"Max Processing Size    : {args.max_size}px")
    print(f"Matching Tolerance     : {args.tolerance}")
    print("=" * 60 + "\n")

    for inp_p in input_paths:
        if not inp_p.exists():
            try:
                inp_p.mkdir(parents=True, exist_ok=True)
            except Exception:
                pass

    faces_output_path.mkdir(parents=True, exist_ok=True)
    json_index_path = output_path / "face_index.json"

    # ============================================================
    # Load existing index for incremental processing
    # ============================================================
    existing_index = {}
    processed_photos = set()
    person_clusters = []        # list of dicts: {id, encoding, faces[], sample_encoding}
    detected_faces = []         # all face records

    if json_index_path.exists():
        try:
            with open(json_index_path, "r", encoding="utf-8") as f:
                existing_index = json.load(f)
                processed_photos = set(existing_index.get("processedPhotoNames", []))
                detected_faces = existing_index.get("allFaces", [])
                
                # Reconstruct person clusters with their encodings
                raw_persons = existing_index.get("persons", [])
                for p in raw_persons:
                    enc_list = p.get("faceEncoding")
                    encoding = load_encoding_vector(enc_list)
                    p_faces = [f for f in detected_faces if f.get("personGroup") == p["personId"]]
                    person_clusters.append({
                        "id": p["personId"],
                        "encoding": encoding,
                        "faces": p_faces
                    })
                print(f"Loaded existing index: {len(processed_photos)} photos, {len(person_clusters)} persons.")
        except Exception as e:
            print(f"Notice: Could not parse existing index ({e}). Building fresh index.")

    # If no existing data, initialize
    if not person_clusters:
        print("No existing index found. Starting fresh.\n")

    # ============================================================
    # Find all photo files across all input directories
    # ============================================================
    image_extensions = ["*.jpg", "*.jpeg", "*.png", "*.webp", "*.JPG", "*.JPEG", "*.PNG", "*.WEBP"]
    photo_files = []
    seen_file_paths = set()
    for inp_p in input_paths:
        if inp_p.exists():
            for ext in image_extensions:
                for file_p in inp_p.rglob(ext):
                    if str(file_p) not in seen_file_paths:
                        seen_file_paths.add(str(file_p))
                        photo_files.append(file_p)

    # Filter out already processed
    new_photo_files = [p for p in photo_files if p.name not in processed_photos]
    print(f"Total Photos: {len(photo_files)} | Already Processed: {len(processed_photos)} | New to Process: {len(new_photo_files)}\n")

    if not new_photo_files and existing_index:
        print("No new photos to process. Index is up to date!")
        return

    face_count = len(detected_faces)
    total_new_faces = 0

    # Build a list of ALL known encodings for efficient batch comparison
    # Each cluster stores its "best" encoding (the first one that was assigned)
    def get_all_known_encodings():
        encodings = []
        for p in person_clusters:
            if p["encoding"] is not None:
                encodings.append(p["encoding"])
        return encodings

    for idx, photo_p in enumerate(new_photo_files, start=1):
        print(f"[{idx}/{len(new_photo_files)}] Processing: {photo_p.name} ... ", end="", flush=True)

        try:
            # Load and resize image
            pil_img, scale = resize_image_if_needed(str(photo_p), max_size=args.max_size)
            
            # Convert PIL to numpy array (face_recognition uses numpy)
            img_array = np.array(pil_img)

            # Detect face locations (using HOG-based CNN model for CPU)
            # face_recognition uses dlib's HOG + CNN detector, very accurate on CPU
            face_locations = face_recognition.face_locations(img_array, model="hog")
            
            if len(face_locations) == 0:
                print("No faces detected")
                processed_photos.add(photo_p.name)
                continue

            # Get face encodings (128-D vectors)
            face_encodings = face_recognition.face_encodings(img_array, face_locations)

            print(f"Detected {len(face_locations)} face(s)", flush=True)

            for f_idx, (face_location, face_encoding) in enumerate(zip(face_locations, face_encodings)):
                face_count += 1
                total_new_faces += 1

                top, right, bottom, left = face_location
                
                # Scale coordinates back to original image
                if scale != 1.0:
                    orig_top = int(top / scale)
                    orig_right = int(right / scale)
                    orig_bottom = int(bottom / scale)
                    orig_left = int(left / scale)
                else:
                    orig_top, orig_right, orig_bottom, orig_left = top, right, bottom, left

                # ---- Crop face from ORIGINAL image for thumbnail ----
                # Load original for cropping
                orig_img = Image.open(photo_p).convert("RGB")
                orig_w, orig_h = orig_img.size

                # Add padding (30% for better context)
                face_w = orig_right - orig_left
                face_h = orig_bottom - orig_top
                pad_x = int(face_w * 0.30)
                pad_y = int(face_h * 0.30)

                x1 = max(0, orig_left - pad_x)
                y1 = max(0, orig_top - pad_y)
                x2 = min(orig_w, orig_right + pad_x)
                y2 = min(orig_h, orig_bottom + pad_y)

                face_crop = orig_img.crop((x1, y1, x2, y2))
                face_crop_resized = face_crop.resize((150, 150), Image.LANCZOS)

                face_filename = f"face_{photo_p.stem}_{f_idx + 1}.jpg"
                face_save_path = faces_output_path / face_filename
                # Only write the thumbnail if it doesn't already exist
                # This prevents duplicate crops on repeated runs
                if not face_save_path.exists():
                    face_crop_resized.save(str(face_save_path), "JPEG", quality=92)

                # ---- Match against existing persons ----
                known_encodings = get_all_known_encodings()
                matched_idx, best_dist = compare_encodings(
                    known_encodings, face_encoding, tolerance=args.tolerance
                )

                if matched_idx is not None:
                    matched_person = person_clusters[matched_idx]
                    # Update the person's encoding to be the average of all known faces
                    # This makes the recognition more robust over time
                    all_encodings_in_cluster = [face_encoding]
                    for f in matched_person["faces"]:
                        stored_enc = f.get("faceEncoding")
                        if stored_enc is not None:
                            all_encodings_in_cluster.append(load_encoding_vector(stored_enc))
                    if all_encodings_in_cluster:
                        matched_person["encoding"] = np.mean(all_encodings_in_cluster, axis=0)
                    print(f"    -> Matched Person {matched_person['id']} (dist={best_dist:.4f})", flush=True)
                else:
                    # Create new person
                    person_id = f"Person_{len(person_clusters) + 1}"
                    matched_person = {
                        "id": person_id,
                        "encoding": face_encoding.copy(),
                        "faces": []
                    }
                    person_clusters.append(matched_person)
                    print(f"    -> NEW Person {person_id}", flush=True)

                # Store face encoding in the face record for future averaging
                face_record = {
                    "faceId": f"face_{face_count}",
                    "personGroup": matched_person["id"],
                    "photoName": photo_p.name,
                    "photoPath": str(photo_p),
                    "thumbnailName": face_filename,
                    "thumbnailPath": str(face_save_path),
                    "boundingBox": {
                        "top": orig_top, "right": orig_right,
                        "bottom": orig_bottom, "left": orig_left
                    },
                    "faceEncoding": get_face_encoding_vector(face_encoding)
                }

                matched_person["faces"].append(face_record)
                detected_faces.append(face_record)

            processed_photos.add(photo_p.name)

        except Exception as e:
            print(f"Error processing {photo_p.name}: {e}", flush=True)
            traceback.print_exc()
            # Still mark as processed so we don't retry endlessly
            processed_photos.add(photo_p.name)
            continue

    # ============================================================
    # Save Updated JSON Index
    # ============================================================
    # For each person, compute an average encoding from all faces
    for p in person_clusters:
        all_encs = []
        for f in p["faces"]:
            stored_enc = f.get("faceEncoding")
            if stored_enc is not None:
                all_encs.append(load_encoding_vector(stored_enc))
        if all_encs:
            # Average encoding for best matching
            avg_enc = np.mean(all_encs, axis=0)
            p["encoding"] = avg_enc

    index_data = {
        "lastUpdated": str(Path(json_index_path).stat().st_mtime if json_index_path.exists() else 0),
        "totalPhotos": len(photo_files),
        "processedPhotoNames": list(processed_photos),
        "totalFacesDetected": len(detected_faces),
        "totalUniquePersons": len(person_clusters),
        "outputDirectory": str(output_path),
        "persons": [
            {
                "personId": p["id"],
                "displayName": f"فرد {idx + 1}",
                "photoCount": len(set([f["photoName"] for f in p["faces"]])),
                "sampleThumbnailName": p["faces"][0]["thumbnailName"] if p["faces"] else "",
                "sampleThumbnailPath": p["faces"][0]["thumbnailPath"] if p["faces"] else "",
                "photos": list(set([f["photoName"] for f in p["faces"]])),
                "faceEncoding": get_face_encoding_vector(p.get("encoding"))
            }
            for idx, p in enumerate(person_clusters)
        ],
        "allFaces": detected_faces
    }

    # Remove faceEncoding from individual face records to keep JSON size manageable
    # (we only keep the per-person average encoding)
    for face in index_data["allFaces"]:
        face.pop("faceEncoding", None)
    for p in index_data["persons"]:
        # Keep per-person encoding
        pass

    with open(json_index_path, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print("                     PROCESSING COMPLETE                    ")
    print("=" * 60)
    print(f"Total Photos Scanned   : {len(photo_files)}")
    print(f"New Photos Processed   : {len(new_photo_files)}")
    print(f"Total Faces Extracted  : {len(detected_faces)}")
    print(f"Unique Person Groups   : {len(person_clusters)}")
    print(f"JSON Index Saved To    : {json_index_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()