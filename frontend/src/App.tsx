import { useEffect, useState } from 'react';

const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:18000';

type HealthState = 'loading' | 'ready' | 'error';

type HealthResponse = {
  service: string;
  status: string;
};

export function App() {
  const [state, setState] = useState<HealthState>('loading');
  const [message, setMessage] = useState('Checking local backend health...');

  useEffect(() => {
    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/healthz`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }

        const payload = (await response.json()) as HealthResponse;
        setState('ready');
        setMessage(`${payload.service} is ${payload.status}`);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        const details =
          error instanceof Error ? error.message : 'Unknown error';
        setState('error');
        setMessage(`Backend health check failed: ${details}`);
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  return (
    <main className="app-shell">
      <section className="status-card">
        <span className={`status-indicator status-${state}`} />
        <div>
          <h1>Whiteboard Planner</h1>
          <p className="status-message">{message}</p>
          <p className="status-meta">Browser UI + local FastAPI service</p>
          <p className="status-meta">API base URL: {apiBaseUrl}</p>
        </div>
      </section>
    </main>
  );
}
