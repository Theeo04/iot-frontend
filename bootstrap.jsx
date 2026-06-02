/* ============================================================
   Bootstrap — fetch data from the API, then mount the React app.
   Runs after data.jsx, charts.jsx, panels.jsx, app.jsx have all
   been transpiled by @babel/standalone.
   ============================================================ */

(async () => {
  const root = document.getElementById('root');

  function renderMessage(html) {
    root.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;' +
      'min-height:100vh;color:var(--fg-1);font-family:var(--sans);">' +
      html + '</div>';
  }

  renderMessage('Loading telemetry from Postgres…');

  try {
    await loadData();
  } catch (err) {
    console.error('loadData failed:', err);
    renderMessage(
      '<div style="text-align:center;max-width:520px;">' +
      '<div style="color:var(--crit);font-weight:600;margin-bottom:8px;">' +
      'Could not reach the API</div>' +
      '<div style="font-family:var(--mono);font-size:12px;color:var(--fg-2);">' +
      String(err) + '</div>' +
      '<div style="margin-top:12px;color:var(--fg-2);">' +
      'Check that the backend is running and that PostgreSQL is reachable.' +
      '</div></div>'
    );
    return;
  }

  ReactDOM.createRoot(root).render(<App />);
})();
