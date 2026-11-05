import { useState } from 'react';
import { useAuth } from '../../state/AuthProvider';

export function SetPasswordScreen() {
  const { setPassword } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!pw || pw.length < 6) return setError('Password must be at least 6 characters.');
    if (pw !== pw2) return setError('Passwords do not match.');
    const msg = await setPassword(pw);
    if (msg) setError(msg);
    return undefined;
  };

  return (
    <div className="full-screen">
      <div className="auth-box">
        <div className="auth-logo">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Easytel"
            style={{ height: 40, width: 'auto', marginBottom: 4 }}
          />
          <div>
            <h1>Easytel CRM</h1>
            <p>Set your password</p>
          </div>
        </div>
        <div className="form-group">
          <label className="lbl">New password</label>
          <input
            className="fi"
            type="password"
            placeholder="Choose a password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="lbl">Confirm password</label>
          <input
            className="fi"
            type="password"
            placeholder="Repeat password"
            autoComplete="new-password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </div>
        {error && (
          <div className="form-error" style={{ marginBottom: 10 }}>
            {error}
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={() => void submit()}
        >
          <i className="ti ti-check" /> Set password &amp; sign in
        </button>
      </div>
    </div>
  );
}
