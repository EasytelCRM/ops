export function LoadingScreen() {
  return (
    <div className="full-screen">
      <div className="spinner-wrap">
        <div className="spinner" />
        <div style={{ fontSize: 13, color: 'var(--text3)' }}>Loading Easytel CRM...</div>
      </div>
    </div>
  );
}
