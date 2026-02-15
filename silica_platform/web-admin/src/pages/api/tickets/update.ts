import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth, getAdminDb } from '../../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const idToken = req.cookies['session'];
  if (!idToken) return res.status(401).json({ error: 'No session' });
  const auth = getAdminAuth();
  const decoded = await auth.verifyIdToken(idToken);
  const roles: string[] = (decoded as any).roles || [];
  const allowed = roles.some((r) => ['Manager', 'QC'].includes(r));
  if (!allowed) return res.status(403).json({ error: 'Forbidden' });

  const { id, ...updates } = req.body as any;
  if (!id) return res.status(400).json({ error: 'id required' });
  const db = getAdminDb();
  await db.collection('tickets').doc(id).set({ ...updates, updatedBy: decoded.uid, updatedAt: new Date() }, { merge: true });
  res.status(200).json({ ok: true });
}
