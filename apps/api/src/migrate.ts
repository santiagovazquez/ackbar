import { migrate, db } from "./db.js";

await migrate();
console.log("Database migrated.");
db.close();
