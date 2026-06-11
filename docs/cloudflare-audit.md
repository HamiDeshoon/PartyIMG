# Cloudflare Compatibility Audit

## Compatibility Score: 20/100
**Migration Effort: HIGH**

## Incompatible Code & Limitations

1. **Filesystem Dependencies (`fs` module):**
   - **Issue:** Cloudflare Workers (workerd runtime) do not have a persistent local filesystem.
   - **Usage in App:** `server.ts` uses `fs.mkdirSync`, `fs.rmSync`, `fs.unlinkSync` and `fs.existsSync` to manage `/uploads` and zip event files.
   - **Fix:** Abstract storage to use Cloudflare R2 bucket.

2. **SQLite Dependencies (`sqlite3` module):**
   - **Issue:** Relies on native Node.js binaries (C++ bindings). Does not run on Edge.
   - **Usage in App:** `db.ts` uses `sqlite3` to interface with `database.sqlite` file.
   - **Fix:** Abstract database to use Cloudflare D1.

3. **Node-Only APIs & Process Executions:**
   - **Issue:** `fluent-ffmpeg` requires spawning a binary process (`child_process`), which is restricted on Cloudflare.
   - **Usage:** Currently mapped in dependencies, primarily for video processing if employed.
   - **Fix:** Delegate heavy video processing to Cloudflare Stream or external worker/service. 

4. **Upload Issues (Multer):**
   - **Issue:** `multer.diskStorage` streams to disk.
   - **Fix:** Rewrite upload endpoint using `req.body` (if tiny) or standard `ReadableStream` directly piping into an R2 bucket.

5. **Session Issues:**
   - **Issue:** `express-session` uses an in-memory store by default. In a distributed edge environment, every request might hit a different isolate, breaking stateless sessions.
   - **Fix:** Move to a Cloudflare KV-backed session store, or transition to JWT stateless cookies.

6. **Zipping Files:**
   - **Issue:** `archiver` relies on filesystem streams. Zipping large files on the fly might hit memory/CPU limits on Cloudflare Workers.
   - **Fix:** Use a specific worker for zipping from R2 streams, or limit zip functionality. 

## Migration Plan Roadmap
- Phase 1: Implement Storage Abstraction (`LocalStorageProvider` vs `R2StorageProvider`).
- Phase 2: Implement Database Abstraction (`SQLiteProvider` vs `D1Provider`).
- Phase 3: Replace `express-session` with stateless JWT implementation.
- Phase 4: Replace `multer` with standard stream parser.
