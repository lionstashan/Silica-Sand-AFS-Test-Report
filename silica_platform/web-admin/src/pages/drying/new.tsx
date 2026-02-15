import React, { useState } from 'react';
import type { GetServerSideProps } from 'next';
import { requireRole } from '../../lib/auth';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const authRes = await requireRole(ctx, ['Manager', 'QC']);
  if ('redirect' in authRes) return authRes;
  return { props: {} };
};

export default function NewDryingTicket() {
  const [bed, setBed] = useState('');
  const [grade, setGrade] = useState('');
  const [moistureStart, setMoistureStart] = useState<number | ''>('');
  const [moistureEnd, setMoistureEnd] = useState<number | ''>('');
  const [dryQty, setDryQty] = useState<number | ''>('');
  const [qcStatus, setQcStatus] = useState<'Pending' | 'Pass' | 'Fail'>('Pending');
  const [qcGrade, setQcGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null); setOkMsg(null);
    try {
      const payload = {
        type: 'Drying',
        status: 'Open',
        bed,
        grade,
        moistureStart: moistureStart === '' ? undefined : Number(moistureStart),
        moistureEnd: moistureEnd === '' ? undefined : Number(moistureEnd),
        dryQty: dryQty === '' ? undefined : Number(dryQty),
        qc: { status: qcStatus, feedback: feedback || undefined, grade: qcGrade || undefined },
      };
      const res = await fetch('/api/tickets/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create ticket');
      setOkMsg('Drying ticket created');
    } catch (e: any) { setError(e.message || 'Error'); }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>New Drying Ticket</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {okMsg && <p style={{ color: 'green' }}>{okMsg}</p>}
      <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
        <label>Bed<input value={bed} onChange={(e) => setBed(e.target.value)} /></label>
        <label>Grade<input value={grade} onChange={(e) => setGrade(e.target.value)} /></label>
        <label>Moisture Start<input type="number" value={moistureStart} onChange={(e) => setMoistureStart(e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label>Moisture End<input type="number" value={moistureEnd} onChange={(e) => setMoistureEnd(e.target.value === '' ? '' : Number(e.target.value))} /></label>
        <label>Dry Qty<input type="number" value={dryQty} onChange={(e) => setDryQty(e.target.value === '' ? '' : Number(e.target.value))} /></label>
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
