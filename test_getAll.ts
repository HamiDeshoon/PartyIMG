import * as db from './db.js';

async function test() {
  try {
     const resData = await db.getAllEvents();
     console.log(resData);
  } catch(e) {
     console.error(e);
  }
}
test();
