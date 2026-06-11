# Bug Report

## UI Memory Leaks
- **Object URL Leaks (Critical):** Fixed an issue in `GuestPanel.tsx` where picking a video file and then backing out or successfully uploading it produced zombie Blob object URLs. Memory is now correctly freed via `URL.revokeObjectURL(localFilePreview)` inside the timeout clearance subroutine.

## Event Destruction Bugs
- **Orphan Media (Critical):** Addressed a backend flaw where deleting an event root (`/api/events/:id` via `DELETE`) only destroyed the SQLite event entry. The associated media files lingered as orphaned artifacts taking up disk space or R2 storage buckets permanently. This is now fully mitigated using `storageProvider.deleteEventData()` before DB deletion.

## Security Misconfigurations
- **Session Weakness:** Stopped `express-session` from falling back to a hardcoded insecure key. In production builds, the app now crashes forcefully if `SESSION_SECRET` is unset, protecting cookie hijacking natively. 

## Upload Limit Exceedance Bug
- **Crash Error Handling:** Large photo uploads that exceed limits (20MB) are proactively intercepted before writing using Multer Memory buffering rules or fast response termination in code natively.

All found issues were resolved immediately.
