import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const materials = {
  painted: new THREE.MeshStandardMaterial({ color: 0x2f665f, roughness: 0.34, metalness: 0.58 }),
  paintedDark: new THREE.MeshStandardMaterial({ color: 0x234742, roughness: 0.4, metalness: 0.62 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x717b7e, roughness: 0.3, metalness: 0.78 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x283033, roughness: 0.38, metalness: 0.72 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x15191a, roughness: 0.78, metalness: 0.04 }),
  safety: new THREE.MeshStandardMaterial({ color: 0xd9a12c, roughness: 0.4, metalness: 0.46 }),
  motor: new THREE.MeshStandardMaterial({ color: 0x315d70, roughness: 0.32, metalness: 0.62 }),
  sand: new THREE.MeshStandardMaterial({ color: 0xd3b47d, roughness: 0.95, metalness: 0 }),
  wetSand: new THREE.MeshStandardMaterial({ color: 0x9b845d, roughness: 0.62, metalness: 0.02 }),
  water: new THREE.MeshPhysicalMaterial({ color: 0x3c91a8, roughness: 0.12, metalness: 0.03, transmission: 0.3, transparent: true, opacity: 0.72, thickness: 0.25 }),
  pipe: new THREE.MeshStandardMaterial({ color: 0x397e96, roughness: 0.28, metalness: 0.68 }),
  slurryPipe: new THREE.MeshStandardMaterial({ color: 0x7d603b, roughness: 0.38, metalness: 0.58 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xa5a49b, roughness: 0.92, metalness: 0 }),
  grate: new THREE.MeshStandardMaterial({ color: 0x4a5152, roughness: 0.5, metalness: 0.68, side: THREE.DoubleSide })
};

function mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const value = new THREE.Mesh(geometry, material); value.position.set(...position); value.rotation.set(...rotation); value.castShadow = true; value.receiveShadow = true; return value;
}

function box(group, size, position, material = materials.steel, rotation) { const value = mesh(new THREE.BoxGeometry(...size), material, position, rotation); group.add(value); return value; }
function cylinder(group, radius, length, position, material = materials.steel, rotation = [0, 0, Math.PI / 2], segments = 24) { const value = mesh(new THREE.CylinderGeometry(radius, radius, length, segments), material, position, rotation); group.add(value); return value; }

function frame(group, width, length, height = 1) {
  const beam = 0.11;
  [[-width/2,-length/2],[-width/2,length/2],[width/2,-length/2],[width/2,length/2]].forEach(([x,z]) => box(group,[beam,height,beam],[x,height/2,z],materials.darkSteel));
  [-width/2,width/2].forEach(x => box(group,[beam,beam,length],[x,height,0],materials.darkSteel));
  [-length/2,length/2].forEach(z => box(group,[width,beam,beam],[0,height,z],materials.darkSteel));
}

function motor(group, position, scale = 1, rotation = [0, 0, Math.PI / 2]) {
  const assembly = new THREE.Group(); assembly.position.set(...position); assembly.rotation.set(...rotation);
  const shell = cylinder(assembly, .3 * scale, .72 * scale, [0,0,0], materials.motor, [0,0,0]);
  for (let index = -3; index <= 3; index += 1) cylinder(assembly, (.315)*scale, .035*scale, [0,index*.075*scale,0], materials.darkSteel, [0,0,0]);
  cylinder(assembly,.34*scale,.12*scale,[0,-.42*scale,0],materials.darkSteel,[0,0,0]);
  cylinder(assembly,.11*scale,.28*scale,[0,.5*scale,0],materials.steel,[0,0,0]);
  box(assembly,[.34,.18,.27].map(v=>v*scale),[.2*scale,0,.31*scale],materials.darkSteel);
  group.add(assembly); return assembly;
}

function flange(group, position, rotation = [Math.PI/2,0,0], radius = .24, material = materials.pipe) {
  return cylinder(group,radius,.09,position,material,rotation,32);
}

function createHopper(group) {
  frame(group,2.1,2.1,1.25);
  const hopper=mesh(new THREE.CylinderGeometry(.55,1.45,2.1,4,1,true),materials.painted,[0,2.15,0],[0,Math.PI/4,Math.PI]); group.add(hopper);
  const sand=mesh(new THREE.CylinderGeometry(.05,1.16,.35,32),materials.sand,[0,3.12,0],[0,0,Math.PI]); group.add(sand);
  for(let i=-4;i<=4;i+=1) box(group,[.08,.08,2.7],[i*.28,3.18,0],materials.grate,[0,0,.05]);
  box(group,[1.3,.28,.65],[0,.88,0],materials.darkSteel); motor(group,[1.05,.88,0],.62,[0,0,Math.PI/2]);
}

function createConveyor(group, product = false) {
  const length=4.2; frame(group,1.35,length,.75);
  const belt=box(group,[1.18,.12,length],[0,1.12,0],materials.rubber,[product ? -.08 : .08,0,0]);
  [-1.85,-1.2,-.55,.1,.75,1.4,1.85].forEach(z=>cylinder(group,.13,1.3,[0,1.03,z],materials.steel,[0,0,Math.PI/2]));
  [-.66,.66].forEach(x=>box(group,[.06,.34,length],[x,1.22,0],materials.safety));
  motor(group,[.95,.8,1.72],.58,[0,0,Math.PI/2]);
  for(let i=0;i<18;i+=1){const grain=mesh(new THREE.SphereGeometry(.045,7,7),product?materials.wetSand:materials.sand,[(i%4-.5)*.22,1.23,(i/4-2.1)*.75]);group.add(grain);}
  return belt;
}

function createScreen(group, dewatering = false) {
  frame(group,2.3,3.3,1.15);
  const deck=new THREE.Group(); deck.rotation.x=dewatering ? -.06 : -.13; deck.position.y=1.55;
  box(deck,[2.25,.14,3.25],[0,0,0],materials.grate);
  [-1.08,1.08].forEach(x=>box(deck,[.12,.72,3.35],[x,.28,0],materials.painted));
  for(let z=-1.4;z<=1.4;z+=.35) box(deck,[2.05,.025,.035],[0,.1,z],materials.steel);
  group.add(deck);
  motor(group,[-.55,2.15,0],.55,[0,0,Math.PI/2]); motor(group,[.55,2.15,0],.55,[0,0,-Math.PI/2]);
  if(dewatering){box(group,[1.8,.18,1.8],[0,1.72,-.15],materials.wetSand,[-.06,0,0]);const pool=box(group,[1.8,.04,.85],[0,1.88,1],materials.water,[-.06,0,0]);pool.material=materials.water;}
}

function createDrum(group, animated) {
  frame(group,2.6,4.4,1.05);
  const drum=new THREE.Group(); drum.position.y=2;
  cylinder(drum,1.15,3.55,[0,0,0],materials.painted,[0,0,Math.PI/2],48);
  for(const x of [-1.45,-.75,0,.75,1.45]) cylinder(drum,1.21,.12,[x,0,0],materials.darkSteel,[0,0,Math.PI/2],48);
  for(let i=0;i<10;i+=1){const angle=i*Math.PI/5;box(drum,[3.5,.08,.1],[0,Math.cos(angle)*1.13,Math.sin(angle)*1.13],materials.steel,[angle,0,0]);}
  group.add(drum); animated.push({object:drum,axis:"x",speed:.17});
  [-1.35,1.35].forEach(x=>{cylinder(group,.24,2.5,[x,.75,0],materials.rubber,[0,0,Math.PI/2]);});
  motor(group,[0,.72,-1.55],.78,[Math.PI/2,0,0]); box(group,[.72,.72,.72],[0,.72,-1.02],materials.darkSteel);
  cylinder(group,.42,.7,[-2.05,2,0],materials.slurryPipe,[0,0,Math.PI/2]); cylinder(group,.42,.7,[2.05,2,0],materials.slurryPipe,[0,0,Math.PI/2]);
}

function createAttrition(group, animated) {
  frame(group,2.8,2.2,.65);
  [-.68,.68].forEach(x=>{box(group,[1.25,1.65,1.8],[x,1.45,0],materials.painted);const shaft=cylinder(group,.08,1.9,[x,2.75,0],materials.steel,[0,0,0]);motor(group,[x,3.55,0],.62,[0,0,0]);animated.push({object:shaft,axis:"y",speed:5});});
  box(group,[2.5,.05,1.5],[0,2.3,0],materials.water); flange(group,[1.42,1.25,0],[0,0,Math.PI/2],.22,materials.slurryPipe);
}

function createPump(group, animated) {
  box(group,[2.3,.22,1.25],[0,.18,0],materials.darkSteel); const casing=mesh(new THREE.TorusGeometry(.62,.28,16,40),materials.painted,[.35,.92,0],[0,Math.PI/2,0]);group.add(casing);
  cylinder(group,.38,.38,[.35,.92,0],materials.painted,[0,Math.PI/2,0],32); cylinder(group,.17,.75,[-.28,.92,0],materials.steel,[0,0,Math.PI/2]);
  const drive=motor(group,[-.85,.92,0],.78,[0,0,Math.PI/2]); animated.push({object:drive,axis:"x",speed:1.8});
  cylinder(group,.23,.75,[.35,1.55,0],materials.pipe,[0,0,0]); flange(group,[.35,1.88,0],[0,0,0],.31); cylinder(group,.23,.75,[1.05,.92,0],materials.pipe,[0,0,Math.PI/2]); flange(group,[1.4,.92,0],[0,0,Math.PI/2],.31);
}

function createCyclone(group) {
  frame(group,2.5,2.1,3.6); cylinder(group,.28,2.4,[0,3.5,0],materials.pipe,[0,0,Math.PI/2]);
  [-.68,0,.68].forEach(x=>{const barrel=cylinder(group,.42,.82,[x,2.85,0],materials.painted,[0,0,0],32);const cone=mesh(new THREE.ConeGeometry(.42,1.65,32),materials.painted,[x,1.62,0],[0,0,Math.PI]);group.add(cone);cylinder(group,.09,.55,[x,.58,0],materials.slurryPipe,[0,0,0]);flange(group,[x,3.65,0],[0,0,0],.16);});
  cylinder(group,.2,2.1,[0,1.08,.75],materials.slurryPipe,[0,0,Math.PI/2]);
}

function createMagnet(group, animated) {
  frame(group,2.8,2.3,.8); box(group,[2.45,1.9,1.9],[0,1.75,0],materials.paintedDark); cylinder(group,.7,2.6,[0,1.75,0],materials.darkSteel,[0,0,Math.PI/2],40);
  const rotor=cylinder(group,.45,2.75,[0,1.75,0],materials.steel,[0,0,Math.PI/2],32); animated.push({object:rotor,axis:"x",speed:.3});
  motor(group,[0,3.15,0],.62,[0,0,0]); box(group,[.65,.55,.65],[0,2.7,0],materials.darkSteel);
  flange(group,[-1.35,2.35,0],[0,0,Math.PI/2],.23,materials.slurryPipe); flange(group,[1.35,1.1,0],[0,0,Math.PI/2],.23,materials.slurryPipe);
}

function createThickener(group, animated) {
  const tank=mesh(new THREE.CylinderGeometry(2.7,2.2,1.2,48,1,true),materials.painted,[0,.9,0]);group.add(tank);cylinder(group,2.18,.08,[0,.33,0],materials.concrete,[0,0,0],48);
  const water=mesh(new THREE.CylinderGeometry(2.52,2.52,.08,48),materials.water,[0,1.48,0]);group.add(water);
  box(group,[5.8,.18,.38],[0,1.85,0],materials.darkSteel); for(let x=-2.5;x<=2.5;x+=.35)box(group,[.05,.05,.34],[x,2,0],materials.safety);
  const rake=new THREE.Group(); cylinder(rake,.08,1.25,[0,.85,0],materials.steel,[0,0,0]);box(rake,[4.3,.08,.08],[0,.38,0],materials.steel);group.add(rake);animated.push({object:rake,axis:"y",speed:.05});
  motor(group,[0,2.35,0],.55,[0,0,0]); flange(group,[2.65,.75,0],[0,0,Math.PI/2],.2);
}

function createPress(group) {
  frame(group,3.3,1.8,.65); box(group,[3.2,.2,.9],[0,1.2,0],materials.darkSteel); box(group,[.22,2.3,1.2],[-1.45,1.45,0],materials.painted);box(group,[.22,2.3,1.2],[1.45,1.45,0],materials.painted);
  for(let x=-1.05;x<=1.05;x+=.18)box(group,[.08,1.65,1.05],[x,1.6,0],x% .36 < .1 ? materials.steel:materials.grate);
  cylinder(group,.16,.85,[1.9,1.55,0],materials.steel,[0,0,Math.PI/2]);box(group,[.75,.55,.65],[2.2,.72,0],materials.motor);
}

function createRotarySieve(group, meshLabel, animated, silicaParticles) {
  const drum = new THREE.Group();
  const meshMaterial = new THREE.MeshStandardMaterial({ color:0x9da8a6, roughness:.42, metalness:.72, wireframe:true, transparent:true, opacity:.78 });
  cylinder(drum,1.02,4.1,[0,0,0],meshMaterial,[0,0,Math.PI/2],56);
  [-1.92,-1.35,-.68,0,.68,1.35,1.92].forEach(x=>cylinder(drum,1.065,.075,[x,0,0],materials.darkSteel,[0,0,Math.PI/2],48));
  const shaft=cylinder(drum,.09,4.55,[0,0,0],materials.steel,[0,0,Math.PI/2],24);
  for(let turn=0;turn<3.5;turn+=.08){const angle=turn*Math.PI*2,x=-1.8+(turn/3.5)*3.6;const flight=box(drum,[.07,.13,.72],[x,Math.cos(angle)*.58,Math.sin(angle)*.58],materials.steel,[angle,0,0]);flight.rotation.x=angle;}
  drum.position.set(0,2.55,0);drum.rotation.z=-.035;group.add(drum);animated.push({object:drum,axis:"x",speed:.42});

  frame(group,2.85,5.05,1.28);
  [-1.35,1.35].forEach(x=>[-.76,.76].forEach(z=>cylinder(group,.24,.5,[x,1.45,z],materials.rubber,[Math.PI/2,0,0],28)));
  box(group,[4.8,.12,2.55],[0,1.12,0],materials.darkSteel);
  const hopper=mesh(new THREE.CylinderGeometry(.48,1.25,1.5,4),materials.paintedDark,[0,.58,0],[0,Math.PI/4,Math.PI]);group.add(hopper);
  box(group,[1.05,.52,1.05],[0,-.16,0],materials.slurryPipe);

  const inlet=mesh(new THREE.CylinderGeometry(.62,1.02,.82,32),materials.paintedDark,[-2.46,2.62,0],[0,0,-Math.PI/2]);group.add(inlet);
  const outlet=mesh(new THREE.CylinderGeometry(.9,.62,.82,32),materials.paintedDark,[2.46,2.42,0],[0,0,-Math.PI/2]);group.add(outlet);
  flange(group,[-2.82,2.62,0],[0,0,Math.PI/2],.72,materials.darkSteel);flange(group,[2.82,2.42,0],[0,0,Math.PI/2],.72,materials.darkSteel);

  cylinder(group,.23,1.05,[.9,4.02,0],materials.pipe,[0,0,0]);flange(group,[.9,4.5,0],[0,0,0],.31,materials.darkSteel);
  motor(group,[-1.2,.78,-1.25],.78,[Math.PI/2,0,0]);box(group,[.82,.72,.72],[-.35,.78,-1.25],materials.darkSteel);cylinder(group,.18,1.15,[.35,.78,-1.25],materials.steel,[0,0,Math.PI/2]);
  const ringGear=cylinder(group,1.13,.2,[-.92,2.58,0],materials.safety,[0,0,Math.PI/2],48);ringGear.material=materials.safety;

  box(group,[4.65,.05,1.1],[0,3.68,-.92],new THREE.MeshStandardMaterial({color:0xaeb6b4,roughness:.38,metalness:.65,transparent:true,opacity:.72}));
  box(group,[4.65,.85,.05],[0,3.2,-1.46],materials.paintedDark);

  const labelTexture=document.createElement("canvas");labelTexture.width=512;labelTexture.height=128;const ctx=labelTexture.getContext("2d");ctx.fillStyle="#f4f6f2";ctx.fillRect(0,0,512,128);ctx.fillStyle="#163d32";ctx.font="700 52px sans-serif";ctx.textAlign="center";ctx.fillText(meshLabel,256,80);const texture=new THREE.CanvasTexture(labelTexture);const label=mesh(new THREE.PlaneGeometry(1.7,.43),new THREE.MeshBasicMaterial({map:texture}),[0,3.18,-1.5]);group.add(label);

  for(let i=0;i<42;i+=1){const particle=mesh(new THREE.SphereGeometry(.045+(i%3)*.012,7,7),materials.sand);particle.userData.phase=i/42;particle.userData.drum=drum;particle.position.set(-1.75+(i/42)*3.5,2.35+(i%4)*.08,(i%7-3)*.12);group.add(particle);silicaParticles.push({object:particle,origin:group,phase:i/42});}
}

function rectangularChute(group, start, end) {
  const from=new THREE.Vector3(...start),to=new THREE.Vector3(...end),direction=to.clone().sub(from),length=direction.length(),midpoint=from.clone().add(to).multiplyScalar(.5);
  const chute=mesh(new THREE.BoxGeometry(length,.72,.9),materials.slurryPipe);chute.position.copy(midpoint);chute.quaternion.setFromUnitVectors(new THREE.Vector3(1,0,0),direction.normalize());group.add(chute);
  const silica=mesh(new THREE.BoxGeometry(length*.82,.08,.68),materials.sand);silica.position.copy(midpoint);silica.position.y+=.18;silica.quaternion.copy(chute.quaternion);group.add(silica);
  [from,to].forEach(point=>{const collar=mesh(new THREE.BoxGeometry(.16,.88,1.06),materials.darkSteel);collar.position.copy(point);collar.quaternion.copy(chute.quaternion);group.add(collar);});
}

function createRotaryPilot(stages, animated, selectable, silicaParticles) {
  const pilot=new THREE.Group(),spacing=6.45,drop=1.32,count=stages.length,startX=-(count-1)*spacing/2,maxLevel=(count-1)*drop;
  const positions=stages.map((stage,index)=>({stage,x:startX+index*spacing,y:(count-1-index)*drop}));
  positions.forEach(({stage,x,y})=>{const group=new THREE.Group();createRotarySieve(group,`${stage.meshNumber} MESH`,animated,silicaParticles);group.position.set(x,y,0);group.userData.equipment={id:`RS-${stage.meshNumber}`,name:`Enclosed rotary sieve · ${stage.meshNumber} mesh`,duty:`Through: ${stage.through}; oversize: ${stage.oversize}`,motorKw:5.5};group.traverse(child=>{child.userData.equipment=group.userData.equipment;});pilot.add(group);selectable.push(group);});
  for(let index=0;index<positions.length-1;index+=1){const current=positions[index],next=positions[index+1];rectangularChute(pilot,[current.x+2.82,current.y+2.42,0],[next.x-2.82,next.y+2.62,0]);}
  positions.forEach(({x,y})=>pipeBetween(pilot,[[x+.9,y+4.5,0],[x+.9,maxLevel+5.35,-2]],materials.pipe,.12));
  pipeBetween(pilot,[[positions[0].x+.9,maxLevel+5.35,-2],[positions.at(-1).x+.9,maxLevel+5.35,-2]],materials.pipe,.17);
  const width=Math.max(15,(count-1)*spacing+7),roofY=maxLevel+6.15;
  for(let x=-width/2;x<=width/2+.1;x+=Math.min(5.2,width/3)){box(pilot,[.18,roofY,.18],[x,roofY/2,-3.8],materials.darkSteel);box(pilot,[.18,roofY,.18],[x,roofY/2,3.8],materials.darkSteel);}for(const z of [-3.8,3.8])box(pilot,[width,.18,.18],[0,roofY,z],materials.darkSteel);for(let x=-width/2+.4;x<=width/2;x+=2.5)box(pilot,[.12,.16,7.6],[x,roofY,0],materials.steel);
  box(pilot,[width,.12,7.6],[0,roofY+.15,0],new THREE.MeshStandardMaterial({color:0xa8b1b0,roughness:.65,metalness:.3,side:THREE.DoubleSide,transparent:true,opacity:.28}));
  positions.forEach(({x,y},index)=>{box(pilot,[5.1,.16,1.3],[x,y+1.08,-2.15],materials.darkSteel);for(let rail=-2.25;rail<=2.25;rail+=.75)box(pilot,[.05,.92,.05],[x+rail,y+1.6,-2.72],materials.safety);box(pilot,[5.1,.07,.07],[x,y+2.04,-2.72],materials.safety);if(index<positions.length-1){const stair=box(pilot,[spacing-4.8,.12,1.1],[x+spacing/2,y+.42,-2.15],materials.grate,[0,0,-Math.atan2(drop,spacing)]);}});
  return pilot;
}

function createUnit(item, animated) {
  const group=new THREE.Group();
  if(item.type==="hopper")createHopper(group); else if(item.type==="conveyor")createConveyor(group,item.id==="CV-02"); else if(item.type==="screen")createScreen(group,item.id==="DWS-01"); else if(item.type==="drum")createDrum(group,animated); else if(item.type==="cells")createAttrition(group,animated); else if(item.type==="pump")createPump(group,animated); else if(item.type==="cyclone")createCyclone(group); else if(item.type==="magnet")createMagnet(group,animated); else if(item.type==="thickener")createThickener(group,animated); else createPress(group);
  group.position.set(...item.position); group.userData.equipment=item; group.traverse(child=>{child.userData.equipment=item;}); return group;
}

function pipeBetween(scene, points, material, radius=.11) {
  const curve=new THREE.CatmullRomCurve3(points.map(point=>new THREE.Vector3(...point)),false,"catmullrom",.15); const tube=mesh(new THREE.TubeGeometry(curve,64,radius,12,false),material);scene.add(tube);
  [0,.25,.5,.75,1].forEach(t=>{const point=curve.getPoint(t),tangent=curve.getTangent(t);const ring=mesh(new THREE.TorusGeometry(radius*1.34,.035,8,16),materials.darkSteel);ring.position.copy(point);ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),tangent.normalize());scene.add(ring);}); return curve;
}

export function createPlantScene(canvas,equipment,onSelect) {
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xcfdadd);scene.fog=new THREE.FogExp2(0xcfdadd,.017);
  const camera=new THREE.PerspectiveCamera(38,1,.1,140),homeWet=new THREE.Vector3(22,18,27);let homeRotary=new THREE.Vector3(25,18,31),rotaryTargetY=4;camera.position.copy(homeRotary);
  const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(1.5,1.4,1.8);controls.maxPolarAngle=Math.PI*.48;controls.minDistance=10;controls.maxDistance=85;
  scene.add(new THREE.HemisphereLight(0xf4fbff,0x635b45,1.65));const sun=new THREE.DirectionalLight(0xfff7e8,3.3);sun.position.set(-16,25,12);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-25;sun.shadow.camera.right=25;sun.shadow.camera.top=18;sun.shadow.camera.bottom=-18;scene.add(sun);
  const ground=mesh(new THREE.PlaneGeometry(58,32),materials.concrete,[0,-.04,2],[-Math.PI/2,0,0]);scene.add(ground);const grid=new THREE.GridHelper(58,58,0x687374,0x929b97);grid.position.y=.01;grid.material.opacity=.18;grid.material.transparent=true;scene.add(grid);
  const animated=[],selectable=[],silicaParticles=[];
  const wetPlant=new THREE.Group();equipment.forEach(item=>{const unit=createUnit(item,animated);wetPlant.add(unit);selectable.push(unit);});
  const slurryCurve=pipeBetween(wetPlant,[[-1.2,2.4,0],[1.6,2.4,-1.4],[3.5,2.15,-1.4],[4.2,3.65,.4]],materials.slurryPipe,.13);
  const overflowCurve=pipeBetween(wetPlant,[[4.2,3.7,.4],[4.2,4.2,3],[4,2.1,6]],materials.pipe,.11);
  const returnCurve=pipeBetween(wetPlant,[[4,1.25,6],[0,1.5,6],[0,3.5,3],[.5,3.5,0]],materials.pipe,.11);
  pipeBetween(wetPlant,[[8,1.2,6],[6.2,1.2,6],[4,1,6]],materials.slurryPipe,.1);
  const waterParticles=Array.from({length:24},(_,index)=>{const p=mesh(new THREE.SphereGeometry(.045,7,7),materials.water);p.userData.offset=index/24;wetPlant.add(p);return p;});
  scene.add(wetPlant);
  const rotaryRoot=new THREE.Group();scene.add(rotaryRoot);wetPlant.visible=false;
  function setMeshTrain(stages){rotaryRoot.clear();const pilot=createRotaryPilot(stages,animated,selectable,silicaParticles);rotaryRoot.add(pilot);rotaryTargetY=(stages.length-1)*.66+2.2;homeRotary=new THREE.Vector3(Math.max(25,stages.length*6),Math.max(18,stages.length*3.5),Math.max(31,stages.length*7));if(area==="rotary")resetCamera();}
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();canvas.addEventListener("pointerdown",event=>{const b=canvas.getBoundingClientRect();pointer.set(((event.clientX-b.left)/b.width)*2-1,-((event.clientY-b.top)/b.height)*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(selectable,true).find(entry=>entry.object.userData.equipment);if(hit)onSelect(hit.object.userData.equipment);});
  let running=true,last=performance.now();
  function resize(){const w=canvas.clientWidth,h=canvas.clientHeight,dpr=renderer.getPixelRatio();if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){renderer.setSize(w,h,false);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();}}
  function animate(now){resize();const dt=Math.min((now-last)/1000,.04);last=now;if(running){animated.forEach(part=>{part.object.rotation[part.axis]+=part.speed*dt;});waterParticles.forEach(p=>p.position.copy((p.userData.offset<.5?overflowCurve:returnCurve).getPoint((p.userData.offset*2+now*.00005)%1)));silicaParticles.forEach(p=>{const progress=(p.phase+now*.000028)%1;p.object.position.x=-1.75+progress*3.5;p.object.position.y=2.28+Math.sin(progress*Math.PI*7)*.18;p.object.position.z=Math.sin((progress+p.phase)*19)*.3;});}controls.update();renderer.render(scene,camera);requestAnimationFrame(animate);}requestAnimationFrame(animate);
  let area="rotary";
  function resetCamera(){const home=area==="rotary"?homeRotary:homeWet;camera.position.copy(home);controls.target.set(area==="rotary"?0:1.5,area==="rotary"?rotaryTargetY:1.4,area==="rotary"?0:1.8);controls.update();}
  setMeshTrain([{meshNumber:65,through:"finer than 65 mesh",oversize:"to 60 mesh rotary"},{meshNumber:60,through:"60-65 mesh",oversize:"to 55 mesh rotary"},{meshNumber:55,through:"55-60 mesh",oversize:"to 50 mesh rotary"},{meshNumber:50,through:"50-55 mesh",oversize:"coarse product"}]);
  resetCamera();
  return{setRunning(value){running=value;},setMeshTrain,setArea(value){area=value;rotaryRoot.visible=value==="rotary";wetPlant.visible=value==="wet";resetCamera();},resetCamera};
}
