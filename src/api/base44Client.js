// ============================================================================
// src/api/base44Client.js
//
// Drop-in replacement for the Base44 SDK client. Every page in BrewPOS calls
// base44.entities.X.list()/filter()/create()/update()/delete() and
// base44.auth.me()/loginViaEmailPassword()/logout() exactly as before —
// nothing else in the app needed to change. The only difference is where
// these calls go: the local server on this machine (http://localhost:3001),
// not Base44's cloud. There is no internet dependency anywhere in this file.
//
// PROTECTED file — never touched by a Base44 export sync (see .gitattributes).
// ============================================================================

// Derived from the current page's hostname rather than hardcoded — this
// file also loads on devices reaching the PC over LAN (the KDS staff
// tablet, the ready-order customer screen), where 'localhost' would
// resolve to the tablet itself, not this PC. When loaded as
// http://<pc-lan-ip>:3000, API calls correctly go to
// http://<pc-lan-ip>:3001 instead.
const API_BASE = `http://${window.location.hostname}:3001/api`;
const TOKEN_KEY = 'brewpos_local_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, isFormData = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData && body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch (err) {
    const friendly = new Error('Could not reach the local BrewPOS server. Is it running?');
    friendly.cause = err;
    throw friendly;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.offline = !!(data && data.offline);
    throw err;
  }
  return data;
}

function entityClient(entityName) {
  return {
    list: (sort, limit) => request(`/entities/${entityName}?${new URLSearchParams({
      ...(sort ? { sort } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    })}`),

    filter: (query = {}, sort, limit) => request(`/entities/${entityName}?${new URLSearchParams({
      query: JSON.stringify(query),
      ...(sort ? { sort } : {}),
      ...(limit ? { limit: String(limit) } : {}),
    })}`),

    create: (data) => request(`/entities/${entityName}`, { method: 'POST', body: data }),

    bulkCreate: (dataArray) => request(`/entities/${entityName}`, { method: 'POST', body: dataArray }),

    update: (id, data) => request(`/entities/${entityName}/${id}`, { method: 'PUT', body: data }),

    bulkUpdate: (updates) => request(`/entities/${entityName}/bulk`, { method: 'PUT', body: updates }),

    delete: (id) => request(`/entities/${entityName}/${id}`, { method: 'DELETE' }),
  };
}

// Every entity used anywhere in BrewPOS (see base44/entities/*.jsonc).
const ENTITY_NAMES = [
  'StaffUser', 'MenuPageLayout', 'IngredientTransaction', 'ModifierPreset',
  'MenuItem', 'OrderItem', 'User', 'Discount', 'StoreSettings', 'TimeEntry',
  'Event', 'Order', 'Ingredient', 'KdsTicket',
];

const entities = {};
for (const name of ENTITY_NAMES) entities[name] = entityClient(name);

const auth = {
  isAuthenticated: () => !!getToken(),

  async me() {
    return request('/auth/me');
  },
  async loginViaEmailPassword(email, password) {
    const result = await request('/auth/login', { method: 'POST', body: { email, password } });
    setToken(result.token);
    return result.user;
  },

  // No Google OAuth locally — there is no internet dependency in this build.
  // Calling this shows a clear message instead of silently failing.
  loginWithProvider() {
    throw new Error('Sign-in with Google is not available in the local offline build. Use the admin username and password instead.');
  },

  logout(redirectUrl = '/login') {
    request('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    // Defaults to redirecting to /login even when called with no argument
    // (e.g. POSSidebar's Logout button calls base44.auth.logout() directly)
    // — previously this cleared the token but never navigated anywhere,
    // so the screen just sat there looking logged in until manually
    // refreshed. Pass null explicitly to skip the redirect if ever needed.
    if (redirectUrl) window.location.href = redirectUrl;
  },

  redirectToLogin() {
    window.location.href = '/login';
  },

  setToken,

  // Registration is not applicable — there is exactly one local admin
  // account, created automatically on first server start.
  async register() {
    throw new Error('Account creation is not available in the local offline build. Use the admin login.');
  },
  async resetPassword() {
    throw new Error('Use Settings to change the local admin password.');
  },
  async resetPasswordRequest() {
    throw new Error('Use Settings to change the local admin password.');
  },
  async resendOtp() {
    throw new Error('Not applicable in the local offline build.');
  },
  async verifyOtp() {
    throw new Error('Not applicable in the local offline build.');
  },
};

const functions = {
  async invoke(functionName, payload) {
    // customerDisplay is pure local data (reads StoreSettings) — it never
    // actually needed the internet, only Base44's old hosting. Everything
    // else (currently just smartconnect/EFTPOS) genuinely needs a network
    // call, so it goes through the cache-first/online-fallback path.
    // Base44's SDK wraps responses as { data: ... } — matched here so
    // callers written for that convention (res.data) keep working.
    if (functionName === 'customerDisplay') {
      return { data: await request('/functions/customerDisplay') };
    }
    return { data: await request(`/ai/invoke-llm`, { method: 'POST', body: { functionName, payload } }) };
  },
};

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const filename = file?.name || 'upload';
      const buffer = await file.arrayBuffer();
      return request(`/uploads?${new URLSearchParams({ filename })}`, {
        method: 'POST',
        body: buffer,
        isFormData: true,
      });
    },
    async GenerateImage(payload) {
      return request('/ai/generate-image', { method: 'POST', body: payload });
    },
    async InvokeLLM(payload) {
      return request('/ai/invoke-llm', { method: 'POST', body: payload });
    },
    async ExtractDataFromUploadedFile(payload) {
      return request('/ai/extract-file', { method: 'POST', body: payload });
    },
  },
};

export const base44 = {
  entities,
  auth,
  functions,
  integrations,
};

// License gate — see server/local-license.js. Fully offline verification;
// this just talks to the local server, never Base44 or the internet.
export const license = {
  status: () => request('/license/status'),
  activate: (key) => request('/license/activate', { method: 'POST', body: { key } }),
};
