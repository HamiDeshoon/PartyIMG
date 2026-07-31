# Task List

## Face Recognition Upgrade
- [x] Create new InsightFace-based face recognizer (CPU optimized, buffalo_l model)
- [x] Test face recognition on sample images
- [x] Verify duplicate detection works on re-run (no duplicates added)

## Server Integration
- [x] Update server.ts to use new face_recognizer_insightface.py
- [x] Delete redundant legacy scripts (face_recognizer.py, backup.sh, restore.sh)
- [x] Update knowledge graph generator and knowledge-graph.json
- [x] Add API endpoint for triggering face recognition
- [x] Test server integration

## Admin Panel Redesign
- [x] Remove cover image upload section
- [x] Remove redundant/unused sections
- [x] Add face recognition management section
- [x] Add stability improvements (error handling, loading states)
- [x] Add better control over face recognition (trigger, threshold settings)
- [x] Clean up UI/UX for better stability

## Testing
- [x] Test complete flow end-to-end
- [x] Verify no duplicate faces on re-run