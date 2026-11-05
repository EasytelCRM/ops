import { useState } from 'react';
import { useAuth } from '../../state/AuthProvider';

export function LoginScreen() {
  const { signIn, bootError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A fresh attempt replaces whatever the boot sequence put there
  const shown = error ?? bootError;

  const submit = async () => {
    setError(null);
    setBusy(true);
    const msg = await signIn(email.trim(), password);
    setBusy(false);
    if (msg) setError(msg);
  };

  return (
    <div className="full-screen">
      <div className="auth-box">
        <div className="auth-logo">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Easytel" style={{ height: 40, width: 'auto' }} />
          <div>
            <h1>Easytel CRM</h1>
            <p>Operations</p>
          </div>
        </div>
        <div className="form-group">
          <label className="lbl">Email</label>
          <input
            className="fi"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="lbl">Password</label>
          <input
            className="fi"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
        {shown && (
          <div className="form-error" style={{ marginBottom: 10 }}>
            {shown}
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy}
          onClick={() => void submit()}
        >
          {busy ? (
            <>
              <i className="ti ti-loader" style={{ animation: 'spin 0.7s linear infinite' }} /> Signing in...
            </>
          ) : (
            <>
              <i className="ti ti-login" /> Sign in
            </>
          )}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 12, textAlign: 'center' }}>
          Contact your admin to create an account.
        </p>
      </div>
    </div>
  );
}
