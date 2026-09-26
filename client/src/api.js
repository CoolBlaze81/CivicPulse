// Thin fetch wrapper. Stores the session token and turns API errors into
// exceptions with the server's message.
const TOKEN_KEY = 'civicpulse.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: session lasts for this tab only */
  }
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.code = body?.code;
    this.problems = body?.problems;
    this.reference = body?.reference;
  }
}

let onAuthLost = () => {};
export function setAuthLostHandler(fn) {
  onAuthLost = fn;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, { error: "You're offline or the server didn't respond. Nothing you entered was lost; try again.", code: 'OFFLINE' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new ApiError(res.status, data);
    if (res.status === 401 && token && path !== '/auth/staff') onAuthLost(err.code);
    throw err;
  }
  return data;
}

// Multipart helper for endpoints that accept a photo.
export function formOf(fields, photo) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, v);
  if (photo) f.append('photo', photo);
  return f;
}
