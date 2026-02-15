#!/usr/bin/env ts-node
import * as admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function upsertCollection(col: string, data: Record<string, any>[]) {
  const db = admin.firestore();
  const batch = db.batch();
  data.forEach((item) => {
    const id = item.id || item.name || item.code || undefined;
    const ref = id ? db.collection(col).doc(String(id)) : db.collection(col).doc();
    batch.set(ref, item, { merge: true });
  });
  await batch.commit();
  console.log(`Upserted ${data.length} docs into ${col}`);
}

async function main() {
  try { admin.initializeApp(); } catch {}
  const seedsDir = resolve(__dirname, '../../infra/seeds');
  const files = [
    { col: 'plants', file: 'plants.json' },
    { col: 'beds', file: 'beds.json' },
    { col: 'grades', file: 'grades.json' },
    { col: 'operators', file: 'operators.json' },
  ];
  for (const f of files) {
    const buf = readFileSync(resolve(seedsDir, f.file), 'utf8');
    const arr = JSON.parse(buf);
    if (!Array.isArray(arr)) throw new Error(`${f.file} must be an array`);
    await upsertCollection(f.col, arr);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
