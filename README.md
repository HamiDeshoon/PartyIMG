# ShotBox — Party & Event Live Polaroid Photo Album

**ShotBox (PartyIMG)** is a full-stack, high-performance shared event photo album system. It enables guests to capture, filter, and instantly upload photos and videos during events, while offering real-time polaroid slideshows, face recognition filtering, and flexible host SSD/Cloud storage management.

---

## 🌟 Key Features

- **Guest Camera Experience**:
  - Instant web camera capture & video recording (up to 30s) without installing any app.
  - Analog film filters (Kodak Gold, Fujifilm Superia, B&W Noir, Cyberpunk).
  - Chunked streaming upload pipeline with progress tracking.
- **Dynamic Live Polaroid Album**:
  - Textured Polaroid card aesthetic with alternating washi tape & metallic pin accents.
  - Micro-rotations, hover elevation physics, handwritten captions (Caveat cursive font), and likes counter.
  - Fullscreen glassmorphic lightbox modal with swipe controls and instant single/batch zip downloads.
  - Interactive Auto-play Slideshow presentation mode.
  - Integrated **Face Recognition Filter**: Automatic face detection & clustering (InsightFace CPU worker) allowing guests to filter photos containing specific individuals.
- **Admin Control Dashboard**:
  - Event configuration (custom slugs, guest upload limits, max video length, reveal styles).
  - External storage path hot-swapping (e.g. `D:\Wedding` -> `E:\EventPhotos`).
  - Interactive activity analytics graphs (Recharts timeline & top contributor metrics).
  - Face Index trigger runner & batch media deletion control.
- **Robust Architecture & Storage**:
  - SQLite database abstraction (`db.ts`).
  - Storage provider abstraction supporting local physical disk writes and Cloudflare R2 bucket storage (`storage.ts`).
  - Integrated Knowledge Graph generator (`npm run graph`).

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Python 3.9+ (optional, for background InsightFace face detection worker)

### Installation & Run

1. **Clone & Install Dependencies**
   ```bash
   git clone https://github.com/yourusername/PartyIMG.git
   cd PartyIMG
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file in the project root:
   ```env
   PORT=3000
   SESSION_SECRET=your_super_secret_session_key_min_32_chars
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=adminpass
   # Optional Cloudflare R2 Storage:
   USE_R2=false
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```
   - App UI: `http://localhost:5173`
   - Express Server: `http://localhost:3000`

4. **Build & Production Deployment**
   ```bash
   npm run build
   npm start
   ```

5. **Generate Knowledge Graph**
   ```bash
   npm run graph
   ```

---

## 📁 System Architecture & Structure

```
PartyIMG/
├── src/
│   ├── components/
│   │   ├── AdminPanel.tsx   # Admin dashboard, event config, media sync, analytics
│   │   ├── GuestPanel.tsx   # Vintage camera capture UI, filter presets & uploader
│   │   └── LiveAlbum.tsx    # Live Polaroid grid, slideshow, face profiles & lightbox
│   ├── App.tsx              # Main layout shell & hash route router
│   ├── types.ts             # TypeScript interface definitions & film filter presets
│   ├── index.css            # Design tokens, polaroid paper texture & keyframe animations
│   └── knowledgeGraph.ts    # Codebase architectural knowledge graph builder
├── scripts/
│   └── face_recognizer_insightface.py # Python face detection & vector clustering engine
├── server.ts                # Express backend, WebSocket server & face indexing triggers
├── db.ts                    # SQLite database migration & query helper layer
├── storage.ts               # Storage abstraction (Local Disk / Cloudflare R2)
├── knowledge-graph.json     # Machine-readable codebase architecture map
└── README.md
```

---

## 📄 License

This project is licensed under the MIT License.
