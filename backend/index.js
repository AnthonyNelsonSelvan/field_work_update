import app from "./app.js";
import { config } from "./config.js";
import connectMongo from "./connections/mongo.js";
import { migrateLegacyWorkers } from "./services/fieldUsers.js";
import { scheduleDailyReminders } from "./services/reminderScheduler.js";

await connectMongo(config.mongoUri);
await migrateLegacyWorkers();
scheduleDailyReminders();

app.listen(config.port, () => {
  console.log("Field Desk API listening on port " + config.port);
});
