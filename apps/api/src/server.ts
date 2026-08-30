import { config } from "./config.js";
import { app } from "./app.js";
app.listen(config.port, config.host, () =>
  console.log(`API listening on http://${config.host}:${config.port}`),
);
