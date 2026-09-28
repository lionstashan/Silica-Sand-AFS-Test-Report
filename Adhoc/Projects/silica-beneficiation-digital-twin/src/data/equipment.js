export const equipment = [
  { id:"HOP-01", name:"Feed hopper & grizzly", duty:"12 m³ hopper; 50 t/h normal, 65 t/h peak", motorKw:3, speed:"12–20 rpm feeder", load:"50 t/h", type:"hopper", position:[-13,0,0], color:0xc89b55 },
  { id:"CV-01", name:"Feed conveyor", duty:"650 mm belt × about 18 m", motorKw:7.5, speed:"1.2 m/s belt", load:"65 t/h design", type:"conveyor", position:[-10,0,0], color:0x344b4f },
  { id:"SCR-01", name:"Wet scalping screen", duty:"2-deck, about 1.5 × 3.6 m; removes +10 mm", motorKw:11, speed:"900 rpm exciter", load:"65 t/h design", type:"screen", position:[-7,0,0], color:0x4f7a72 },
  { id:"WSH-01", name:"Rotary scrubber", duty:"About 2.0 m dia × 4.0 m; 3–5 min retention", motorKw:37, speed:"28 rpm drum", load:"50 t/h solids", type:"drum", position:[-3.5,0,0], color:0x3a6f75 },
  { id:"ATM-01", name:"Attrition scrubber", duty:"2 cells × about 4 m³; high-intensity sand cleaning", motorKw:60, speed:"900–1000 rpm", load:"45–50 t/h", type:"cells", position:[0.5,0,0], color:0xb56a3d },
  { id:"P-01", name:"Cyclone feed pump", duty:"Rubber-lined slurry pump; 144 m³/h at 28 m TDH", motorKw:30, speed:"≈1450 rpm", load:"1.35 t/m³ slurry", type:"pump", position:[3.5,0,-1.4], color:0x355d72 },
  { id:"CY-01", name:"Desliming hydrocyclone cluster", duty:"2 duty + 1 standby, preliminary 250 mm cyclones", motorKw:0, speed:"Pressure: 1.2–1.8 bar", load:"~144 m³/h", type:"cyclone", position:[4.2,0,.4], color:0x557b8c },
  { id:"MAG-01", name:"Wet high-intensity magnetic separator", duty:"Removes iron-bearing magnetic contaminants", motorKw:7.5, speed:"3–10 rpm matrix", load:"~43 t/h solids", type:"magnet", position:[7.5,0,0], color:0x8a4d4d },
  { id:"DWS-01", name:"Dewatering screen", duty:"About 1.8 × 4.0 m; target 10–14% product moisture", motorKw:8, speed:"2 × 4 kW exciters", load:"42.5 t/h product", type:"screen", position:[11,0,0], color:0x497362 },
  { id:"CV-02", name:"Product conveyor", duty:"800 mm belt × about 20 m to stockpile", motorKw:11, speed:"1.4 m/s belt", load:"50 t/h wet product", type:"conveyor", position:[14,0,0], color:0x344b4f },
  { id:"THK-01", name:"High-rate thickener", duty:"Concept 8 m diameter; confirm by settling test", motorKw:3, speed:"0.05–0.2 rpm rake", load:"Slimes + process water", type:"thickener", position:[4,0,6], color:0x708b7d },
  { id:"P-02", name:"Clarified-water pump", duty:"About 113 m³/h at 22 m TDH", motorKw:15, speed:"≈1450 rpm", load:"90% recycle basis", type:"pump", position:[0,0,6], color:0x355d72 },
  { id:"FP-01", name:"Filter press package", duty:"Sludge dewatering; final plate area by test work", motorKw:22, speed:"Batch cycle", load:"~7.5 t/h dry reject", type:"press", position:[8,0,6], color:0x68737b }
];
export const auxiliaryConnectedKw = 11;
