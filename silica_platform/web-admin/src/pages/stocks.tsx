import React from 'react';
import type { GetServerSideProps } from 'next';
import { requireRole } from '../lib/auth';
import { getAdminDb } from '../lib/firebaseAdmin';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRes = await requireRole(ctx, ['Manager', 'Director', 'Accounts', 'QC']);
  if ('redirect' in authRes) return authRes;
  const db = getAdminDb();
  const snap = await db.collection('stocks').orderBy('updatedAt', 'desc').limit(100).get();
  const stocks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return { props: { stocks } };
};

export default function StocksPage({ stocks }: { stocks: any[] }) {
  return (
    <main style={{ padding: 24 }}>
      <h1>Stocks</h1>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Category</th>
            <th>Grade</th>
            <th>Qty</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.category}</td>
              <td>{s.grade}</td>
              <td>{s.qty}</td>
              <td>{s.updatedAt?._seconds ? new Date(s.updatedAt._seconds * 1000).toLocaleString() : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
