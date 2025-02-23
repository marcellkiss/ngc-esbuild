const { WebSocketServer } = require('ws');
const http = require('http');
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const yargs = require('yargs/yargs')
const { hideBin } = require('yargs/helpers')
const argv = yargs(hideBin(process.argv)).argv;

const { log, convertMessage } = require('./log');

/**
   * Minimal live-server for developing purposes.
   * @param {String} root root of the file-server
   * @param {Number} port http port
   * @param {Number} socketPort websocket port
   * @param {Object} fileBuffer a buffer to loading files from the memory
   * @returns an object with the server and websocket-server instances
   */
module.exports = (
  root = process.cwd(),
  fileBuffer = {},
  port = 4200,
  socketPort = 8080,
) => {

  const wss = new WebSocketServer({ port: socketPort });
  wss.on('connection', function connection(ws) {
    ws.on('message', function message(data) {
      log('received: %s', data);
    });

    ws.send('Esbuild live server started');
  });

  const broadcast = message => {
    wss.clients.forEach(function each(client) {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  };

  const clientScript = `<script>
    const ws = new WebSocket('ws://127.0.0.1:8080');
    ws.onmessage = m => {
      if (m.data === 'location:refresh') {
        location.reload();
      }
    }
  </script>`;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "OPTIONS, POST, GET, PUT, PATCH, DELETE",
    "Access-Control-Max-Age": 0, // No Cache
  };

  const resolveIndexPage = async (response) => {
    let content = await fs.promises.readFile(
      path.join(root, 'index.html'),
      'utf8'
    );
    content = content.replace(/\<\/body\>/g, `${clientScript}\n</body>`);
    response.writeHead(200, ({ ...headers, 'Content-Type': 'text/html' }));
    response.end(content);
  };

  const server = http.createServer(async (request, response) => {

    let filePath = '.' + request.url;
    if (filePath == './') {
      return resolveIndexPage(response);
    } else {
      filePath = path.join(root, request.url);
      isIndexPage = false;
    }
    filePath = filePath.split('?')[0];

    const absPath = path.resolve(filePath);
    let inMemoryFile = null;
    if (fileBuffer && fileBuffer[absPath]) {
      inMemoryFile = fileBuffer[absPath];
    }

    var extname = String(path.extname(filePath)).toLowerCase();
    var mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.woff': 'application/font-woff',
      '.ttf': 'application/font-ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'application/font-otf',
      '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';
    const encoding = ['.html', '.js', '.css'].includes(extname)
      ? 'utf8'
      : null;

    try {
      let content = inMemoryFile || await fs.promises.readFile(filePath, encoding);
      response.writeHead(200, ({ ...headers, 'Content-Type': contentType }));
      response.end(content);
    } catch (e) {
      if (e.code == 'ENOENT') {
        resolveIndexPage(response);
        // log('ENOENT: ', fileBuffer ? Object.keys(fileBuffer) : e);
        // response.writeHead(404, ({ ...headers, 'Content-Type': 'text/html' }));
        // response.end('Page Not Found!', 'utf8');
      } else {
        response.writeHead(500);
        response.end('Sorry, check with the site admin for error: ' + e.code + ', ' + e);
      }
    }

  }).listen(port);
  log(`Angular dev-server is running at http://localhost:${port}/`);

  const start = (process.platform == 'darwin' ? 'open' : process.platform == 'win32' ? 'start' : 'xdg-open');

  if (argv.open) {
    exec(start + ` http://localhost:${port}/`);
  }

  return {
    server,
    wss,
    broadcast,
  };
}
