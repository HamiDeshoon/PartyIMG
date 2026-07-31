# Task List

## Face Recognition Upgrade
- [x] Create new InsightFace-based face recognizer (CPU optimized, buffalo_l model)
- [x] Test face recognition on sample images
- [x] Verify duplicate detection works on re-run (no duplicates added)

## Server Integration
- [ ] Update server.ts to use new face_recognizer_insightface.py
- [ ] Update face_index.json path handling
- [ ] Add API endpoint for triggering face recognition
- [ ] Test server integration

## Admin Panel Redesign
- [ ] Remove cover image upload section
- [ ] Remove redundant/unused sections
- [ ] Add face recognition management section
- [ ] Add stability improvements (error handling, loading states)
- [ ] Add better control over face recognition (trigger, threshold settings)
- [ ] Clean up UI/UX for better stability

## Testing
- [ ] Test complete flow end-to-end
- [ ] Verify no duplicate faces on re-run