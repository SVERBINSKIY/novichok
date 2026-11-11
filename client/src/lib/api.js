import { texts as t } from '../texts.js';

export async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(t.common.error);
  }
  if (!response.ok) throw new Error(data.error || t.common.error);
  return data;
}
