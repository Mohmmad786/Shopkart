const api = {
  async request(path, { method = 'GET', body, formData } = {}) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (formData) { opts.body = formData; }
    else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch { }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get:      (p)       => api.request(p),
  post:     (p, body) => api.request(p, { method: 'POST', body }),
  put:      (p, body) => api.request(p, { method: 'PUT', body }),
  postForm: (p, fd)   => api.request(p, { method: 'POST', formData: fd }),
  putForm:  (p, fd)   => api.request(p, { method: 'PUT', formData: fd }),
  del:      (p)       => api.request(p, { method: 'DELETE' }),
};