// TEST-ONLY stand-in for Cloudflare R2 (S3 API, path-style): just the calls
// the backend and browser make — signed PUT from the browser (with CORS),
// HEAD, GET, ListObjectsV2 and DeleteObjects. Signatures aren't checked.
// Every call is logged to calls.jsonl as kind "s3".
const http = require('http');
const fs = require('fs');
const path = require('path');
const LOG = path.join(__dirname, 'calls.jsonl');
const PORT = Number(process.env.FAKE_S3_PORT || 4566);
const store = new Map(); // "bucket/key" -> { body, type }
const log = (e) => fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), kind: 's3', ...e }) + '\n');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,HEAD,DELETE,POST',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'ETag',
};
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const [, bucket, ...rest] = url.pathname.split('/');
  const key = decodeURIComponent(rest.join('/'));
  const id = `${bucket}/${key}`;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method === 'PUT' && key) {
      store.set(id, { body, type: req.headers['content-type'] || 'application/octet-stream' });
      log({ op: 'put', key, bytes: body.length, type: req.headers['content-type'], signed: url.searchParams.has('X-Amz-Signature') });
      res.writeHead(200, { ...cors, ETag: '"fake"' }); return res.end();
    }
    if ((req.method === 'HEAD' || req.method === 'GET') && key) {
      const o = store.get(id);
      if (!o) { res.writeHead(404, cors); return res.end(); }
      res.writeHead(200, { ...cors, 'Content-Type': o.type, 'Content-Length': o.body.length, ETag: '"fake"' });
      return res.end(req.method === 'GET' ? o.body : undefined);
    }
    if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') || '';
      const keys = [...store.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => k.slice(bucket.length + 1));
      const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${xmlEsc(prefix)}</Prefix><KeyCount>${keys.length}</KeyCount><IsTruncated>false</IsTruncated>${keys.map((k) => `<Contents><Key>${xmlEsc(k)}</Key><Size>${store.get(`${bucket}/${k}`).body.length}</Size></Contents>`).join('')}</ListBucketResult>`;
      res.writeHead(200, { ...cors, 'Content-Type': 'application/xml' }); return res.end(xml);
    }
    if (req.method === 'POST' && url.searchParams.has('delete')) {
      const keys = [...body.toString().matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
      for (const k of keys) store.delete(`${bucket}/${k}`);
      log({ op: 'delete', keys });
      res.writeHead(200, { ...cors, 'Content-Type': 'application/xml' });
      return res.end('<?xml version="1.0" encoding="UTF-8"?><DeleteResult></DeleteResult>');
    }
    res.writeHead(400, cors); res.end();
  });
}).listen(PORT, () => console.log(`[fake-s3] listening on ${PORT}`));
