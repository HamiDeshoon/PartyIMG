# POV Shared Photo Album

**A full-stack shared wedding and party photo album application.**

Hosts can create custom events, generate QR codes, specify save directories to sync to localhost, and configure upload limits. Guests can capture/upload photos with aesthetic retro filters and record 30‑second videos.

---

## Table of Contents

1. [Features](#features)
2. [Getting Started](#getting-started)
3. [Documentation](#documentation)
4. [Contributing](#contributing)
5. [License](#license)

---

## Features

- **Event Management**: Create, update, and delete events with customizable settings.
- **QR Code Integration**: Generate QR codes for easy event sharing.
- **Retro Filters**: Apply vintage filters to photos before upload.
- **Video Support**: Record up to 30‑second videos.
- **Admin Panel**: Secure admin interface for event configuration.
- **Guest Panel**: Simple UI for guests to capture and upload media.
- **Local & Edge Deployments**: Works locally with SQLite or can be migrated to Cloudflare Workers.

## Getting Started

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/PartyIMG.git
   cd PartyIMG
   ```
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Create an environment file**
   ```bash
   cp .env.example .env
   ```
   Fill in `SESSION_SECRET` (minimum 32 characters) along with `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
4. **Run the development server**
   ```bash
   npm run dev
   ```
   The frontend will be served at `http://localhost:5173` and the API at `http://localhost:3000`.

For detailed build and deployment instructions, see the **Documentation** section below.

## Documentation

The `docs` folder contains in‑depth documentation:

| Document | Description |
|----------|-------------|
| `architecture-report.md` | Overview of system architecture (frontend, backend, database, upload pipeline, authentication flow, and build pipeline). |
| `bug-report.md` | List of identified bugs and their resolutions, covering UI memory leaks, orphan media, security misconfigurations, and upload limit handling. |
| `cloudflare-audit.md` | Compatibility audit for Cloudflare Workers, highlighting filesystem, SQLite, and process‑spawning limitations with migration recommendations. |
| `deployment-guide.md` | Prerequisites, build steps, local setup, and deployment instructions for Cloud Run and Cloudflare. |
| `performance-audit.md` | Performance optimizations for both frontend (code‑splitting, lazy loading) and backend (storage abstraction, upload speed), plus measured metrics. |
| `production-readiness.md` | Production checklist, backup strategy, rollback plan, monitoring setup, and next steps for edge transition. |
| `security-audit.md` | Security hardening details: session management, CSRF protection, upload validation, rate limiting, and other mitigations. |
| `ux-review.md` | UI/UX review covering new preview sandbox, empty/error states, feedback overlays, and usability polish. |

You can explore each document for more granular information about the project.

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/YourFeature`).
3. Commit your changes with clear messages.
4. Open a pull request describing the changes and referencing any relevant issues.

Make sure to run the test suite (`npm test`) and linting (`npm run lint`) before submitting.

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

