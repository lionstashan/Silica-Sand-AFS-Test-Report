const STANDARD_MOTORS_KW = [0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160];

function requireRange(name, value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
}

export function selectStandardMotor(requiredKw, serviceFactor = 1.15) {
  const designKw = requiredKw * serviceFactor;
  return STANDARD_MOTORS_KW.find((rating) => rating >= designKw) ?? Math.ceil(designKw / 10) * 10;
}

export function calculatePump({ flowM3h, headM, slurryDensityKgM3, efficiency, serviceFactor = 1.15 }) {
  requireRange("flowM3h", flowM3h, 0, 10000); requireRange("headM", headM, 0, 500); requireRange("slurryDensityKgM3", slurryDensityKgM3, 800, 3000); requireRange("efficiency", efficiency, 0.05, 1);
  const hydraulicKw = slurryDensityKgM3 * 9.81 * (flowM3h / 3600) * headM / 1000;
  const shaftKw = hydraulicKw / efficiency;
  return { hydraulicKw, shaftKw, motorKw: selectStandardMotor(shaftKw, serviceFactor) };
}

export function simulatePlant(input) {
  const { feedRateTph = 50, feedSilicaFraction = 0.94, feedMoistureFraction = 0.08, massRecovery = 0.85, silicaRecovery = 0.893, processWaterM3PerT = 2.5, waterRecycleFraction = 0.9, productMoistureFraction = 0.12 } = input;
  requireRange("feedRateTph", feedRateTph, 0, 1000);
  for (const [name, value] of Object.entries({ feedSilicaFraction, feedMoistureFraction, massRecovery, silicaRecovery, waterRecycleFraction, productMoistureFraction })) requireRange(name, value, 0, 1);
  requireRange("processWaterM3PerT", processWaterM3PerT, 0, 20);
  const productDryTph = feedRateTph * massRecovery;
  const tailingsDryTph = feedRateTph - productDryTph;
  const silicaFeedTph = feedRateTph * feedSilicaFraction;
  const silicaProductTph = Math.min(silicaFeedTph * silicaRecovery, productDryTph);
  const productSilicaFraction = productDryTph ? silicaProductTph / productDryTph : 0;
  const processWaterM3h = feedRateTph * processWaterM3PerT;
  const recycledWaterM3h = processWaterM3h * waterRecycleFraction;
  const freshWaterM3h = processWaterM3h - recycledWaterM3h;
  const incomingWaterTph = feedRateTph * feedMoistureFraction / Math.max(1 - feedMoistureFraction, 0.001);
  const productWaterTph = productDryTph * productMoistureFraction / Math.max(1 - productMoistureFraction, 0.001);
  const cycloneFlowM3h = processWaterM3h + feedRateTph / 2.65;
  const cyclonePump = calculatePump({ flowM3h: cycloneFlowM3h, headM: 28, slurryDensityKgM3: 1350, efficiency: 0.62 });
  const recyclePump = calculatePump({ flowM3h: recycledWaterM3h, headM: 22, slurryDensityKgM3: 1030, efficiency: 0.7 });
  const fixedOperatingKw = 3*.7 + 7.5*.75 + 11*.78 + 37*.85 + 60*.9 + 7.5*.8 + 8*.85 + 3*.65 + 22*.55 + 11*.7;
  const operatingPowerKw = fixedOperatingKw + cyclonePump.shaftKw + recyclePump.shaftKw;
  return { feedRateTph, productDryTph, tailingsDryTph, silicaFeedTph, silicaProductTph, productSilicaFraction, processWaterM3h, recycledWaterM3h, freshWaterM3h, incomingWaterTph, productWaterTph, cycloneFlowM3h, cyclonePump, recyclePump, operatingPowerKw, specificPowerKwhT: feedRateTph ? operatingPowerKw / feedRateTph : 0 };
}
