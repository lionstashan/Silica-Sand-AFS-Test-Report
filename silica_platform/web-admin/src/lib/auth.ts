import type { GetServerSidePropsContext } from 'next';
import { getAdminAuth } from './firebaseAdmin';

export async function requireRole(context: GetServerSidePropsContext, allowed: string[]) {
  const cookies = context.req.headers.cookie || '';
  const sessionCookie = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith('session='))?.split('=')[1];
  if (!sessionCookie) return { redirect: { destination: '/login', permanent: false } };
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(sessionCookie);
    const roles: string[] = (decoded as any).roles || [];
    const ok = roles.some((r) => allowed.includes(r));
    if (!ok) return { redirect: { destination: '/login', permanent: false } };
    return { props: { uid: decoded.uid, roles } };
  } catch {
    return { redirect: { destination: '/login', permanent: false } };
  }
}
