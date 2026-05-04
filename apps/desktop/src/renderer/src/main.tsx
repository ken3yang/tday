import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

function renderFatal(message: string, detail?: string): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `
    <div style="height:100%;display:flex;align-items:center;justify-content:center;background:#0a0a0f;color:#f4f4f5;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;">
      <div style="width:min(880px,100%);border:1px solid rgba(244,244,245,0.12);border-radius:16px;background:rgba(24,24,27,0.9);padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,0.35);">
        <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#f87171;">Renderer failed</div>
        <div style="margin-top:10px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(message)}</div>
        ${detail ? `<pre style="margin-top:14px;overflow:auto;white-space:pre-wrap;color:#a1a1aa;font-size:12px;line-height:1.5;">${escapeHtml(detail)}</pre>` : ''}
      </div>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function isIgnorableXtermDimensionsError(error: Error | null, message?: string): boolean {
  const text = `${message ?? ''}\n${error?.message ?? ''}\n${error?.stack ?? ''}`;
  return text.includes("reading 'dimensions'") && /xterm/i.test(text);
}

window.addEventListener('error', (event) => {
  const error = event.error instanceof Error ? event.error : null;
  if (isIgnorableXtermDimensionsError(error, event.message)) {
    event.preventDefault();
    console.warn('[tday] suppressed transient xterm dimensions error', error ?? event.message);
    return;
  }
  console.error('[tday] uncaught renderer error', error ?? event.message);
  renderFatal(
    error?.message ?? event.message ?? 'Unknown renderer error',
    error?.stack,
  );
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  if (isIgnorableXtermDimensionsError(reason)) {
    event.preventDefault();
    console.warn('[tday] suppressed transient xterm dimensions rejection', reason);
    return;
  }
  console.error('[tday] unhandled renderer rejection', reason);
  renderFatal(reason.message, reason.stack);
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing #root mount element');
}

if (!('tday' in window)) {
  renderFatal(
    'The preload API is missing.',
    'window.tday was not exposed. Check the preload bundle and Electron webPreferences.preload wiring.',
  );
} else {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
