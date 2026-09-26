const fs = require('fs'), vm = require('vm'), assert = require('assert');
const context = vm.createContext({ THREE: {}, console });
vm.runInContext(fs.readFileSync('src/15_interiors.js', 'utf8').replace(/^import .*;$/gm, '') + '\nglobalThis.API={state:INTERIORS, query:interiorWalkInfo};', context);
const {state,query}=context.API;
let assertions=0;
for (const rot of [0, Math.PI/2, Math.PI, -Math.PI/2, 0.37]) {
  const r={cx:10,cz:20,c:Math.cos(rot),s:Math.sin(rot),rot,w:10,d:12,baseY:1.4,dw:1.48,angle:0,solids:[{x:-4.86,z:0,w:.28,d:12,rot:0},{x:4.86,z:0,w:.28,d:12,rot:0},{x:0,z:-5.86,w:10,d:.28,rot:0},{x:-2.87,z:5.86,w:4.26,d:.28,rot:0},{x:2.87,z:5.86,w:4.26,d:.28,rot:0},{x:2,z:0,w:1,d:1,rot:0}]};
  state.cells.clear(); for(let x=-1;x<3;x++) for(let z=-1;z<3;z++)state.cells.set(x+':'+z,[r]);
  const q=(x,z)=>query(r.cx+x*r.c+z*r.s,r.cz-x*r.s+z*r.c);
  assert(q(0,5.86).blocked,'closed door blocks');assertions++;
  assert(q(4.78,0).blocked,'thick side wall blocks');assertions++;
  assert(q(2,0).blocked,'furniture blocks');assertions++;
  assert(!q(0,2).blocked,'room corridor clear');assertions++;
  assert(q(0,-5.78).blocked,'back wall blocks');assertions++;
  r.angle=1.48;
  for(let z=6.2;z>=3.5;z-=.08){assert(!q(0,z).blocked,'open doorway passable '+rot+' '+z);assertions++;}
  assert(q(-.67,5.2).blocked,'open door leaf retains collision');assertions++;
}
console.log('PASS',assertions,'precise collision checks across five building orientations; closed/open doors, shell and furnishings');

