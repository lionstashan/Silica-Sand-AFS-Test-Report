import React from 'react';
import type { GetServerSideProps } from 'next';
import { requireRole } from '../lib/auth';
import { getAdminDb } from '../lib/firebaseAdmin';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRes = await requireRole(ctx, ['Manager', 'Director', 'QC', 'Dispatch']);
  if ('redirect' in authRes) return authRes;
  const db = getAdminDb();
  const snap = await db.collection('tickets').orderBy('createdAt', 'desc').limit(50).get();
  const tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { props: { tickets } };
};

export default function TicketsPage({ tickets }: { tickets: any[] }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Tickets</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>{t.id}</td>
              <td>{t.type}</td>
              <td>{t.status}</td>
              <td>{t.createdAt?._seconds ? new Date(t.createdAt._seconds * 1000).toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
