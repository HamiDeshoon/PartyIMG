import * as db from './db.js';
import { getStorageProvider } from './storage.js';

async function testDelete() {
  const sqlite = await db.getDb();
  await db.createOrUpdateEvent({ id: "test_del", name: "test delete event" });
  await db.createMedia({
    id: "media_1",
    eventId: "test_del",
    type: "photo",
    url: "/uploads/media_1.jpg",
    thumbnailUrl: "/uploads/media_1.jpg",
    guestName: "hamid",
    systemSavePath: "uploads/media_1.jpg",
    mimeType: "image/jpeg"
  });

  const media = await sqlite.get('SELECT * FROM media WHERE id = ?', "media_1");
  console.log("Media before deletion:", media);

  await sqlite.run('DELETE FROM media WHERE id = ?', "media_1");
  
  const mediaAfter = await sqlite.get('SELECT * FROM media WHERE id = ?', "media_1");
  console.log("Media after deletion:", mediaAfter);
}

testDelete().catch(console.error);
