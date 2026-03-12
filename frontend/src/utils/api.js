const BASE = "https://arvyax-journal-production.up.railway.app/api";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  createEntry: (userId, ambience, text) =>
    apiFetch('/journal', {
      method: 'POST',
      body: JSON.stringify({ userId, ambience, text }),
    }),

  getEntries: (userId) => apiFetch(`/journal/${userId}`),

  analyzeText: (text) =>
    apiFetch('/journal/analyze', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  analyzeEntry: (entryId) =>
    apiFetch(`/journal/${entryId}/analyze`, { method: 'POST' }),

  getInsights: (userId) => apiFetch(`/journal/insights/${userId}`),
};
