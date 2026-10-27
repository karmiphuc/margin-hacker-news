import {build} from 'esbuild';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Hash the actual bundled frontend and every shell asset. A frontend dependency
// change therefore invalidates the offline shell without a hand-edited version.
const app=(await build({entryPoints:['public/app.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022'})).outputFiles[0].text;
const shellPaths=['public/index.html','public/style.css','public/manifest.webmanifest','public/icon-192.png','public/icon-512.png','public/sw.js'];
const files=new Map(await Promise.all(shellPaths.map(async path=>[path,await readFile(path)])));
const digest=createHash('sha256').update(app);
for(const [path,bytes] of files)digest.update(path).update('\0').update(bytes).update('\0');
const version=digest.digest('hex').slice(0,24);
const sw=files.get('public/sw.js').toString().replaceAll('__MARGIN_BUILD__',version);
const html=files.get('public/index.html').toString().replace('</head>',`<meta name="margin-build" content="${version}"></head>`);
await mkdir('dist/server',{recursive:true});
await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['src/worker.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',loader:{'.html':'text','.css':'text','.webmanifest':'text','.png':'binary'},plugins:[{name:'shell-assets',setup(b){
 b.onLoad({filter:/public\/index\.html$/},()=>({contents:html,loader:'text'}));
 b.onLoad({filter:/public\/(app|sw|login)\.js$/},async a=>({contents:a.path.endsWith('/app.js')?app:a.path.endsWith('/sw.js')?sw:await readFile(a.path,'utf8'),loader:'text'}));
}}]});
await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Built Margin shell '+version);
