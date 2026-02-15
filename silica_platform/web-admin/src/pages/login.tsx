import React, { useState } from 'react';
import { initFirebaseClient } from '../lib/firebaseClient';
import { signInWithEmailAndPassword } from 'firebase/auth';

export default function LoginPage() {
  const { auth } = initFirebaseClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      if (!res.ok) throw new Error('Failed to set session');
      window.location.href = '/tickets';
    } catch (e: any) {
      setError(e.message || 'Login failed');
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Admin Login</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320 }}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Password" value={password} type="password" onChange={(e) => setPassword(e.target.value)} />
        <button onClick={handleLogin}>Sign In</button>
      </div>
    </main>
  );
}
