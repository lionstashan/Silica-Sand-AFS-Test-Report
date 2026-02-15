const fs = require('fs');
const path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');

(async () => {
  const projectId = 'silica-mines-dev';
  const rulesPath = path.join(__dirname, '../..', 'infra', 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });

  const managerCtx = env.authenticatedContext('managerUser', { roles: ['Manager'] });
  const dbManager = managerCtx.firestore();
  const coll = dbManager.collection('tickets');

  // Mining valid create
  await assertSucceeds(coll.add({ type: 'Mining', status: 'Open', mine: 1, pit: 2 }));

  // Mining invalid status
  await assertFails(coll.add({ type: 'Mining', status: 'Bad', mine: 1, pit: 2 }));

  // Drying invalid moisture
  await assertFails(coll.add({ type: 'Drying', status: 'Open', bed: 'b', grade: 'g', moistureStart: 200 }));

  console.log('Rules tests completed');
  await env.cleanup();
})();
