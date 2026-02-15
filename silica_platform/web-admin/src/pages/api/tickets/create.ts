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

  const payload = req.body;
  const db = getAdminDb();
  const doc = { ...payload, createdBy: decoded.uid, createdAt: new Date() };
  const ref = await db.collection('tickets').add(doc);
  res.status(200).json({ id: ref.id });
}
