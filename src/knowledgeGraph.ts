import fs from "fs";
import path from "path";

const knowledgeGraph = {
  entities: [
    {
      name: "User",
      entityType: "Person",
      file: "N/A",
      description: "Host, administrator, or wedding event guest interacting with the system.",
      observations: [
        "Guests capture photos/videos via disposable camera UI or pick local files.",
        "Hosts/Admins manage event configurations, physical SSD save directories, and batch media deletions."
      ]
    },
    {
      name: "App",
      entityType: "Component",
      file: "src/App.tsx",
      description: "Main React 18 single-page application router and layout shell.",
      observations: [
        "Uses URL hash routing (#/, #/admin, #/guest/:id, #/live/:id).",
        "Lazy-loads AdminPanel, GuestPanel, and LiveAlbum views with Framer Motion transitions.",
        "Displays toast notifications via Sonner."
      ]
    },
    {
      name: "GuestPanel",
      entityType: "Component",
      file: "src/components/GuestPanel.tsx",
      description: "Vintage disposable camera capture & upload interface for event guests.",
      observations: [
        "Features welcome guest registration card (/guest-welcome.jpg).",
        "Provides real-time CSS analog film filter swatches (Kodak, Fujifilm, BW Noir).",
        "Supports live video recording, camera flipping, and chunked streaming photo/video uploads."
      ]
    },
    {
      name: "AdminPanel",
      entityType: "Component",
      file: "src/components/AdminPanel.tsx",
      description: "Administrator control dashboard for event configuration and media management.",
      observations: [
        "Live saveDirectory path updater allowing host to hot-swap external SSDs (e.g. D:\\Wedding -> E:\\Wedding).",
        "Multi-select selection bar for batch deletion of photos/videos.",
        "Recharts activity analytics timeline & top contributor guest metrics.",
        "Printable vintage postal card QR generator studio."
      ]
    },
    {
      name: "LiveAlbum",
      entityType: "Component",
      file: "src/components/LiveAlbum.tsx",
      description: "Interactive real-time photo & video gallery for guests.",
      observations: [
        "Polaroid styled cards with guest handwritten signatures (Caveat font) and translucent tape accents.",
        "Person & Face Recognition Carousel allowing guests to filter photos containing specific individuals.",
        "Manual face index sync button (triggerSyncFaces).",
        "Lightbox modal viewer, swipe gestures, and batch zip download."
      ]
    },
    {
      name: "ExpressServer",
      entityType: "Module",
      file: "server.ts",
      description: "Node.js Express backend server handling routes, static media, websockets, and background tasks.",
      observations: [
        "Seeds initial wedding event (fatemeh-hamid) with default saveDirectory: 'D:\\Wedding'.",
        "Serves /uploads from active saveDirectory and /face-crops from face-index/faces.",
        "WebSocket server broadcasting live upload and media deletion events to connected clients.",
        "Executes background face indexing runner (triggerFaceIndexer) every 2 minutes or on-demand."
      ]
    },
    {
      name: "DatabaseLayer",
      entityType: "Module",
      file: "db.ts",
      description: "SQLite database initialization and data access layer (database.sqlite).",
      observations: [
        "Manages SQLite tables: events, media, admins.",
        "Provides CRUD abstractions for event settings, media items, likes count, and authentication."
      ]
    },
    {
      name: "EventsTable",
      entityType: "DatabaseTable",
      file: "db.ts",
      description: "SQLite table storing event details and active physical storage paths.",
      observations: [
        "Columns: id, name, hostName, description, date, revealStyle, isRevealed, imageLimit, videoLimit, maxVideoDuration, saveDirectory, localSyncHost, localSyncEnabled, adminId, coverImage, couplePhoto."
      ]
    },
    {
      name: "MediaTable",
      entityType: "DatabaseTable",
      file: "db.ts",
      description: "SQLite table storing uploaded photo and video metadata.",
      observations: [
        "Columns: id, eventId, type (photo|video), url, thumbnailUrl, guestName, filter, timestamp, likes, duration, fileSize, systemSavePath, mimeType, fileHash."
      ]
    },
    {
      name: "AdminsTable",
      entityType: "DatabaseTable",
      file: "db.ts",
      description: "SQLite table storing admin credentials and superuser permissions.",
      observations: [
        "Columns: id, username, passwordHash, isSuperuser."
      ]
    },
    {
      name: "StorageProvider",
      entityType: "Service",
      file: "storage.ts",
      description: "Storage abstraction supporting local physical disk writes and Cloudflare R2 object storage.",
      observations: [
        "LocalStorageProvider evaluates event.saveDirectory (default: D:\\Wedding) to write files.",
        "R2StorageProvider handles Cloudflare S3-compatible cloud uploads if USE_R2 is true."
      ]
    },
    {
      name: "FaceRecognizer",
      entityType: "Script",
      file: "scripts/face_recognizer.py",
      description: "Python 3 CPU-only face detector, cropper, and 128-D vector clusterer.",
      observations: [
        "Uses dlib face_recognition library with HOG/CNN face location detector.",
        "Resizes photos in-memory to max 800px dimension for high CPU speed.",
        "Incremental processing: reads face_index.json, skips already processed photos. Never overwrites existing thumbnail crops.",
        "Outputs cropped face avatar thumbnails into <saveDirectory>\\Face_Index\\faces (e.g. D:\\Wedding\\Face_Index\\faces) and updates face_index.json."
      ]
    },
    {
      name: "TypesAndPresets",
      entityType: "Interface",
      file: "src/types.ts",
      description: "Global TypeScript interfaces and analog film filter presets.",
      observations: [
        "Exports EventConfig, MediaItem, EventStats, FilterPreset.",
        "Defines FILM_FILTERS array with CSS filter presets (Kodak Gold, Superia 400, Warm Vintage, BW Noir, Cyberpunk)."
      ]
    },
    {
      name: "DesignSystem",
      entityType: "Configuration",
      file: "src/index.css",
      description: "Central CSS stylesheet containing design system tokens and vintage Polaroid styling.",
      observations: [
        "Imports Google Caveat handwriting font mapped to --font-cursive.",
        "Defines .polaroid, .polaroid-tape, .glass-card, .glass-button, and ambient orb CSS keyframes."
      ]
    }
  ],
  relations: [
    { from: "User", to: "App", relationType: "interacts_with", details: "Navigates views via URL hashes." },
    { from: "App", to: "GuestPanel", relationType: "contains", details: "Renders guest camera view on #/guest/:id." },
    { from: "App", to: "AdminPanel", relationType: "contains", details: "Renders host dashboard on #/admin." },
    { from: "App", to: "LiveAlbum", relationType: "contains", details: "Renders public live album on #/live/:id." },
    { from: "GuestPanel", to: "ExpressServer", relationType: "calls", details: "Posts streamed upload chunks to /api/events/:id/upload/streaming." },
    { from: "AdminPanel", to: "ExpressServer", relationType: "calls", details: "Updates saveDirectory, batch deletes media, and queries analytics." },
    { from: "LiveAlbum", to: "ExpressServer", relationType: "calls", details: "Fetches media grid, face profiles (/api/events/:id/face-profiles), and triggers sync." },
    { from: "ExpressServer", to: "DatabaseLayer", relationType: "calls", details: "Queries and updates events, media records, and admin credentials." },
    { from: "ExpressServer", to: "StorageProvider", relationType: "calls", details: "Saves uploaded photos/videos to disk or R2 bucket." },
    { from: "ExpressServer", to: "FaceRecognizer", relationType: "triggers", details: "Launches background python runner on upload and every 2 minutes." },
    { from: "DatabaseLayer", to: "EventsTable", relationType: "persists_to", details: "Manages event metadata and physical save directories." },
    { from: "DatabaseLayer", to: "MediaTable", relationType: "persists_to", details: "Manages photo and video media metadata." },
    { from: "DatabaseLayer", to: "AdminsTable", relationType: "persists_to", details: "Manages admin user accounts." },
    { from: "FaceRecognizer", to: "ExpressServer", relationType: "serves", details: "Outputs face_index.json and cropped avatars served at /face-crops." },
    { from: "GuestPanel", to: "TypesAndPresets", relationType: "defines_types_for", details: "Uses FILM_FILTERS and MediaItem types." },
    { from: "LiveAlbum", to: "DesignSystem", relationType: "uses", details: "Applies .polaroid-tape and --font-cursive styles." }
  ]
};

const outputPath = path.resolve(process.cwd(), "knowledge-graph.json");
fs.writeFileSync(outputPath, JSON.stringify(knowledgeGraph, null, 2), "utf-8");
console.log("✅ Knowledge graph built and updated successfully at " + outputPath);
