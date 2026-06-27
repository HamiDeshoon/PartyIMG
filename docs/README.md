# Documentation Overview

This folder contains the project's documentation files. Below is a brief description of each file to help you quickly locate the information you need.

| File | Description |
|------|------------|
| `architecture-report.md` | Provides a comprehensive overview of the system architecture, covering the frontend framework, backend server, database schema, upload pipeline, authentication flow, and the build process. |
| `bug-report.md` | Summarizes discovered bugs and their fixes, including UI memory leaks, orphan media cleanup, session security hardening, and upload limit handling. |
| `cloudflare-audit.md` | Audits the compatibility of the codebase with Cloudflare Workers, detailing filesystem, SQLite, and process‑spawning limitations, and outlines a migration plan. |
| `deployment-guide.md` | Step‑by‑step guide for building, running locally, and deploying the application to platforms such as Google Cloud Run and Cloudflare. |
| `performance-audit.md` | Documents performance optimizations made to the frontend (code‑splitting, lazy loading) and backend (storage abstraction, in‑memory uploads), along with measured metrics. |
| `production-readiness.md` | Lists a production readiness checklist, backup strategies, rollback procedures, monitoring recommendations, and next steps for edge deployment. |
| `security-audit.md` | Reviews security hardening measures implemented, including session secret enforcement, CSRF protection, MIME type validation, rate limiting, and missing feature mitigations. |
| `ux-review.md` | Reviews UI/UX improvements such as the dynamic preview sandbox, empty/error states, feedback overlays, and usability polish. |

Use these files as a reference when working with the codebase, troubleshooting issues, or preparing for deployment.
