import assert from "node:assert/strict";
import test from "node:test";
import { calculateAfsGfn, planMeshTrain, recommendScreenAdjustments, simulateProductBand } from "../src/simulation/particle-model.js";

test("calculates AFS GFN from retained percentages",()=>{assert.equal(calculateAfsGfn([{aperture:600,percent:50},{aperture:425,percent:50}]),25);});
test("commercial sizing band produces a normalized distribution",()=>{const result=simulateProductBand("40-45 mesh",50);const total=result.retained.reduce((sum,row)=>sum+row.percent,0);assert.ok(Math.abs(total-100)<1e-9);assert.ok(result.afsGfn>25&&result.afsGfn<50);assert.equal(result.productTph+result.rejectTph,50);});
test("recommends a finer cut when actual AFS is below target",()=>{const result=recommendScreenAdjustments({actualAfs:35,targetAfs:45,actualRateTph:48});assert.equal(result.direction,"finer");assert.ok(result.recommendations.length>=3);});
test("plans fine-to-coarse boundary screens for required products",()=>{const result=planMeshTrain(["60-65 mesh","50-55 mesh"]);assert.deepEqual(result.boundaries,[65,60,55,50]);assert.equal(result.machineCount,4);assert.equal(result.products.find(item=>item.label==="55-60 mesh").selected,false);assert.equal(result.warnings.length,1);});
