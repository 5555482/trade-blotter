const BASE = '/api/auth';

export async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Login failed' }));
    throw new Error((body as { error?: string }).error ?? 'Login failed');
  }
  const data = await res.json() as { token: string };
  return data.token;
}
