import type { NextApiRequest, NextApiResponse } from 'next';
import { getAdminAuth } from '../../lib/firebaseAdmin';
import cookie from 'cookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) return res.status(400).json({ error: 'idToken required' });
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken);
    const roles = (decoded as any).roles || [];
    const serialized = cookie.serialize('session', idToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/'
    });
    res.setHeader('Set-Cookie', serialized);
    res.status(200).json({ uid: decoded.uid, roles });
  } catch (e: any) {
    res.status(401).json({ error: e?.message || 'Unauthorized' });
  }
}
