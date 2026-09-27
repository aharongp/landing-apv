'use strict';
const fs = require('node:fs');

// Stream videos instead of buffering them in the asset cache; support seeking.
module.exports = function serveVideo(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const headers = {'Content-Type':'video/mp4', 'Accept-Ranges':'bytes',
    'Cache-Control':'public, max-age=0, must-revalidate', ETag:etag,
    'Last-Modified':stat.mtime.toUTCString()};
  if (req.headers['if-none-match'] === etag) { res.writeHead(304,headers);return res.end(); }
  let start=0,end=stat.size-1,status=200;
  const ifRange=req.headers['if-range'];
  const range=req.headers.range;
  if (range && (!ifRange || ifRange===etag || ifRange===headers['Last-Modified'])) {
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    let valid=Boolean(match && (match[1] || match[2]));
    if(valid) {
      if(!match[1]) { const suffix=Number(match[2]);valid=Number.isSafeInteger(suffix)&&suffix>0;start=Math.max(0,stat.size-suffix); }
      else { start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end; }
      valid=valid&&Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=0&&start<stat.size&&end>=start;
    }
    if(!valid) {res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`,'Content-Length':0});return res.end();}
    status=206;headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
  }
  res.writeHead(status,{...headers,'Content-Length':Math.max(0,end-start+1)});
  if(req.method==='HEAD' || !stat.size) return res.end();
  const stream=fs.createReadStream(filePath,{start,end});
  stream.on('error',()=>res.destroy());
  res.on('close',()=>stream.destroy());
  stream.pipe(res);
};
