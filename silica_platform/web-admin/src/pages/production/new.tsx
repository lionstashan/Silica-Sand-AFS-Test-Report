import React, { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { requireRole } from '../../lib/auth';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRes = await requireRole(ctx, ['Manager', 'QC']);
  if ('redirect' in authRes) return authRes;
  return { props: {} };
};

export default function NewProductionTicket() {
  const [plant, setPlant] = useState('');
  const [productionQty, setProductionQty] = useState<number | ''>('');
  const [breakup, setBreakup] = useState<{ grade: string; qty: number | '' }[]>([{ grade: '', qty: '' }]);
  const [qcStatus, setQcStatus] = useState<'Pending' | 'Pass' | 'Fail'>('Pending');
  const [qcGrade, setQcGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function updateBreakup(i: number, key: 'grade' | 'qty', val: any) {
    const next = [...breakup];
    next[i] = { ...next[i], [key]: key === 'qty' ? (val === '' ? '' : Number(val)) : val };
    setBreakup(next);
  }

  function addRow() { setBreakup([...breakup, { grade: '', qty: '' }]); }
  function removeRow(i: number) { setBreakup(breakup.filter((_, idx) => idx !== i)); }

  async function handleSubmit() {
    setError(null); setOkMsg(null);
    try {
      const gradeBreakup: Record<string, number> = {};
      breakup.forEach(({ grade, qty }) => { if (grade && qty && Number(qty) >= 0) gradeBreakup[grade] = Number(qty); });
      const payload = {
        type: 'Production',
        status: 'Open',
        plant,
        productionQty: productionQty === '' ? undefined : Number(productionQty),
        gradeBreakup,
        qc: { status: qcStatus, feedback: feedback || undefined, grade: qcGrade || undefined },
      };
      const res = await fetch('/api/tickets/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create ticket');
      setOkMsg('Production ticket created');
    } catch (e: any) { setError(e.message || 'Error'); }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>New Production Ticket</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {okMsg && <p style={{ color: 'green' }}>{okMsg}</p>}
      <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
        <label>Plant<input value={plant} onChange={(e) => setPlant(e.target.value)} /></label>
        <label>Production Qty<input type="number" value={productionQty} onChange={(e) => setProductionQty(e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <div>
          <b>Grade Breakup</b>
          {breakup.map((row, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input placeholder="Grade" value={row.grade} onChange={(e) => updateBreakup(i, 'grade', e.target.value)} />
              <input placeholder="Qty" type="number" value={row.qty} onChange={(e) => updateBreakup(i, 'qty', e.target.value)} />
              <button onClick={() => removeRow(i)}>Remove</button>
            </div>
          ))}
          <button onClick={addRow}>Add Grade</button>
        </div>
        <label>QC Status<select value={qcStatus} onChange={(e) => setQcStatus(e.target.value as any)}>
          <option value="Pending">Pending</option>
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select></label>
        <label>QC Grade<input value={qcGrade} onChange={(e) => setQcGrade(e.target.value)} /></label>
        <label>QC Feedback<textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
        <button onClick={handleSubmit}>Create Ticket</button>
      </div>
    </main>
  );
}
