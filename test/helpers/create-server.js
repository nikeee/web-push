import * as http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { once } from "node:events";

export default async function createServer() {
  const demoPath = "test/data/demo";

  const server = http.createServer((req, res) => {
    try {
      if (req.method === "GET") {
        // Ignore query parameters which are used to inject application keys
        const urlParts = req.url.split("?");
        if (urlParts[0] === "/") {
          req.url = "/index.html";
        }

        if (!fs.existsSync(demoPath + req.url)) {
          res.writeHead(404);
          res.end();
          return;
        }

        const data = fs.readFileSync(demoPath + req.url);

        res.writeHead(200, {
          "Content-Length": data.length,
          "Content-Type":
            path.extname(req.url) === ".html" ? "text/html" : "application/javascript",
        });
        res.end(data);
      } else {
        throw new Error("Unable to handle post requests.");
      }
    } catch (err) {
      console.error("An error occured handling request.", err);
      res.writeHead(404);
      res.end("bad request.");
    }
  });

  server.listen(0);

  await once(server, "listening");
  server.port = server.address().port;
  return server;
}
