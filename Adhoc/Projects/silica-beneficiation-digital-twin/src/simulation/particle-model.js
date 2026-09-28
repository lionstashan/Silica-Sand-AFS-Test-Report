export const commercialBands = {
  "30-35 mesh": { coarseMicron: 600, fineMicron: 500 },
  "35-40 mesh": { coarseMicron: 500, fineMicron: 425 },
  "40-45 mesh": { coarseMicron: 425, fineMicron: 355 },
  "45-50 mesh": { coarseMicron: 355, fineMicron: 300 },
  "50-60 mesh": { coarseMicron: 300, fineMicron: 250 },
  "60-80 mesh": { coarseMicron: 250, fineMicron: 180 }
};

export const nominalMeshMicrons = { 40:425, 45:355, 50:300, 55:280, 60:250, 65:212, 70:212, 80:180 };

export function planMeshTrain(requiredBands) {
  if (!Array.isArray(requiredBands) || requiredBands.length === 0) throw new RangeError("Select at least one required product band");
  const parsed = requiredBands.map(label => {
    const match = /^(\d+)-(\d+) mesh$/.exec(label);
    if (!match) throw new RangeError(`Invalid product band: ${label}`);
    const coarseMesh = Number(match[1]), fineMesh = Number(match[2]);
    if (coarseMesh >= fineMesh) throw new RangeError(`Product band must run coarse-to-fine: ${label}`);
    return { label, coarseMesh, fineMesh };
  });
  const boundaries = [...new Set(parsed.flatMap(item => [item.coarseMesh,item.fineMesh]))].sort((a,b)=>b-a);
  const products = boundaries.slice(0,-1).map((fineMesh,index)=>{
    const coarseMesh=boundaries[index+1],label=`${coarseMesh}-${fineMesh} mesh`;
    return { label, fineMesh, coarseMesh, selected:requiredBands.includes(label), route:requiredBands.includes(label)?"saleable product":"intermediate / blend / recycle" };
  });
  const warnings=[];
  products.filter(item=>!item.selected).forEach(item=>warnings.push(`${item.label} will also be produced between the selected boundaries; assign it to another product, blend or recycle.`));
  const stages=boundaries.map((meshNumber,index)=>({stage:index+1,meshNumber,apertureMicron:nominalMeshMicrons[meshNumber]??null,through:index===0?`finer than ${meshNumber} mesh`:products[index-1]?.label,oversize:index===boundaries.length-1?`coarser than ${meshNumber} mesh`: `to ${boundaries[index+1]} mesh rotary`}));
  return { requiredBands:[...requiredBands], boundaries, stages, products, machineCount:stages.length, warnings };
}

const afsSieves = [
  { aperture:850, multiplier:10 }, { aperture:600, multiplier:20 }, { aperture:425, multiplier:30 },
  { aperture:300, multiplier:40 }, { aperture:212, multiplier:50 }, { aperture:150, multiplier:70 },
  { aperture:106, multiplier:100 }, { aperture:75, multiplier:140 }, { aperture:53, multiplier:200 },
  { aperture:0, multiplier:300 }
];

export function calculateAfsGfn(retainedPercent) {
  const total = retainedPercent.reduce((sum, row) => sum + row.percent, 0);
  if (total <= 0) return 0;
  return retainedPercent.reduce((sum, row) => {
    const sieve = afsSieves.find(item => item.aperture === row.aperture);
    if (!sieve) throw new RangeError(`Unsupported AFS sieve aperture: ${row.aperture}`);
    return sum + row.percent * sieve.multiplier;
  }, 0) / total;
}

export function simulateProductBand(bandName, feedRateTph = 50) {
  const band = commercialBands[bandName];
  if (!band) throw new RangeError(`Unknown commercial band: ${bandName}`);
  const center = Math.sqrt(band.coarseMicron * band.fineMicron);
  const retained = afsSieves.map((sieve, index) => {
    const upper = index === 0 ? Infinity : afsSieves[index - 1].aperture;
    const isCenter = center <= upper && center > sieve.aperture;
    const distance = Math.abs(Math.log(Math.max(sieve.aperture, 38) / center));
    return { aperture:sieve.aperture, percent:isCenter ? 68 : Math.exp(-distance * 5) * 8 };
  });
  const rawTotal = retained.reduce((sum, row) => sum + row.percent, 0);
  retained.forEach(row => { row.percent = row.percent / rawTotal * 100; });
  const targetYield = Math.max(0.12, 0.34 - Math.abs(center - 425) / 2500);
  return { bandName, ...band, centerMicron:center, productTph:feedRateTph * targetYield, rejectTph:feedRateTph * (1 - targetYield), retained, afsGfn:calculateAfsGfn(retained) };
}

export function recommendScreenAdjustments({ actualAfs, targetAfs, actualRateTph, designRateTph = 50 }) {
  if (![actualAfs,targetAfs,actualRateTph,designRateTph].every(Number.isFinite)) throw new TypeError("Calibration inputs must be numbers");
  const difference = targetAfs - actualAfs;
  const recommendations = [];
  if (Math.abs(difference) <= 2) recommendations.push("AFS is close to target. Confirm the full sieve distribution before changing mesh or speed.");
  if (difference > 2) recommendations.push("Product is too coarse. Increase recovery of finer fractions: use a finer downstream cut, reduce fine-screen bypass, inspect mesh damage and consider recycling the next-finer stream.");
  if (difference < -2) recommendations.push("Product is too fine. Remove more fines: open the product band upward, improve aspiration or fines extraction, and route undersize to a separate grade instead of product.");
  if (actualRateTph > designRateTph) recommendations.push("The screen train is above design feed. Reduce instantaneous feed or add parallel screen area to prevent bed depth and carry-over from shifting the cut.");
  else if (actualRateTph > designRateTph * .85) recommendations.push("Operate below the screen-area limit while calibrating; near-capacity bed depth can reduce separation efficiency.");
  recommendations.push("Check drum rpm, inclination, mesh blinding, feed moisture and each outlet's retained sieve analysis before finalizing a modification.");
  return { difference, direction:difference>2?"finer":difference<-2?"coarser":"hold", recommendations };
}
