import assert from "node:assert/strict";
import test from "node:test";
import { calculatePump, selectStandardMotor, simulatePlant } from "../src/simulation/plant-model.js";

test("base-case plant balances dry solids and water demand",()=>{const r=simulatePlant({feedRateTph:50,feedSilicaFraction:.94,massRecovery:.85,processWaterM3PerT:2.5,waterRecycleFraction:.9});assert.equal(r.productDryTph,42.5);assert.equal(r.tailingsDryTph,7.5);assert.equal(r.productDryTph+r.tailingsDryTph,50);assert.equal(r.processWaterM3h,125);assert.ok(Math.abs(r.freshWaterM3h-12.5)<1e-9);assert.ok(r.productSilicaFraction>.98&&r.productSilicaFraction<1);});
test("pump power follows duty and selects a larger standard motor",()=>{const p=calculatePump({flowM3h:144,headM:28,slurryDensityKgM3:1350,efficiency:.62});assert.ok(p.shaftKw>p.hydraulicKw);assert.equal(p.motorKw,30);assert.equal(selectStandardMotor(p.shaftKw),30);});
test("rejects physically invalid efficiency",()=>{assert.throws(()=>calculatePump({flowM3h:100,headM:20,slurryDensityKgM3:1200,efficiency:0}),RangeError);});
