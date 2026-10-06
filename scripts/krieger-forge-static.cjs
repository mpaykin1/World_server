'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png'};
http.createServer((req,res)=>{
  let p;
  try{p=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{return res.end()}
  let file=path.resolve(root,p.replace(/^\/+/,''));if(!file.startsWith(root))return res.writeHead(403).end();
  try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html')}catch{return res.writeHead(404).end('Not found')}
  fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end('Not found');res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream'});res.end(b)});
}).listen(Number(process.env.PORT)||8790,'127.0.0.1',()=>console.log('KRIEGER forge static: http://127.0.0.1:'+(Number(process.env.PORT)||8790)));
