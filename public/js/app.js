const appEl = document.getElementById('app');
const state = { user: null };

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const inr = (n) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

const FALLBACK_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e0e7ff"/><text x="50%" y="52%" font-size="20" fill="#6366f1" text-anchor="middle" font-family="sans-serif">No image</text></svg>`);

function imgTag(src, alt = '', cls = '') {
  return `<img src="${esc(src || FALLBACK_IMG)}" alt="${esc(alt)}" class="${cls}" loading="lazy"
    onerror="this.onerror=null;this.src='${FALLBACK_IMG}'" />`;
}

const spinnerHTML = '<div class="page-loader"><div class="spinner"></div></div>';
const emptyState = (emoji, title, sub, actionHTML = '') =>
  `<div class="empty-state"><div class="emoji">${emoji}</div><h3>${esc(title)}</h3><p>${esc(sub)}</p>${actionHTML}</div>`;

function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function confirmDialog(title, message) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
          <h3>${esc(title)}</h3>
          <p>${esc(message)}</p>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-act="cancel">Cancel</button>
            <button class="btn btn-danger" data-act="ok">Confirm</button>
          </div>
        </div>
      </div>`;
    const close = (val) => { root.innerHTML = ''; resolve(val); };
    root.querySelector('[data-act="cancel"]').onclick = () => close(false);
    root.querySelector('[data-act="ok"]').onclick = () => close(true);
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(false);
    });
  });
}

function fieldHTML({ id, label, type = 'text', required = false, hint = '', value = '', placeholder = '', textarea = false }) {
  const req = required ? ' <span class="req">*</span>' : '';
  const control = textarea
    ? `<textarea id="${id}" name="${id}" rows="4" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input id="${id}" name="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${type === 'number' ? 'min="0" step="0.01"' : ''} />`;
  return `<div class="field" data-field="${id}">
    <label for="${id}">${esc(label)}${req}</label>
    ${control}
    ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
    <div class="error-text"></div>
  </div>`;
}

function setFieldError(id, msg) {
  const f = appEl.querySelector(`[data-field="${id}"]`);
  if (!f) return;
  f.classList.toggle('invalid', !!msg);
  f.querySelector('.error-text').textContent = msg || '';
}

/* ---------------- navigation ---------------- */
function renderNav() {
  const nav = document.getElementById('nav-links');
  const u = state.user;
  const links = [];
  links.push(`<a href="#/home" data-route="home">Home</a>`);
  if (u && (u.role === 'seller' || u.role === 'developer')) {
    links.push(`<a href="#/dashboard" data-route="dashboard">${u.role === 'developer' ? 'All Products' : 'My Products'}</a>`);
    links.push(`<a href="#/add-product" data-route="add-product">Add Product</a>`);
  }
  if (u) links.push(`<a href="#/profile" data-route="profile">Profile</a>`);
  if (u && u.role === 'developer') links.push(`<a href="#/admin" data-route="admin">Admin</a>`);
  if (u) {
    links.push(`<span class="role-badge ${u.role}">${esc(u.role)}</span>`);
    links.push(`<button class="linklike" id="logout-btn">Logout</button>`);
  } else {
    links.push(`<a href="#/login" data-route="login">Login</a>`);
    links.push(`<a href="#/register" data-route="register">Register</a>`);
  }
  nav.innerHTML = links.join('');
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.onclick = doLogout;
}

document.getElementById('nav-toggle').addEventListener('click', () => {
  const nav = document.getElementById('nav-links');
  const open = nav.classList.toggle('open');
  document.getElementById('nav-toggle').setAttribute('aria-expanded', open);
});

async function doLogout() {
  try { await api.post('/api/auth/logout'); } catch { }
  state.user = null;
  renderNav();
  toast('You have been logged out.', 'success');
  location.hash = '#/home';
}

/* ---------------- router ---------------- */
const routes = {
  'home': viewHome, 'login': viewLogin, 'register': viewRegister, 'profile': viewProfile,
  'dashboard': viewDashboard, 'add-product': viewAddProduct, 'edit-product': viewEditProduct,
  'product': viewProductDetail, 'admin': viewAdmin,
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const query = Object.fromEntries(new URLSearchParams(queryPart || ''));
  return { page: segs[0] || 'home', param: segs[1] ? decodeURIComponent(segs[1]) : null, query };
}

async function route() {
  const { page, param, query } = parseHash();
  const handler = routes[page] || routes.home;
  document.getElementById('nav-links').classList.remove('open');
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === page);
  });
  appEl.innerHTML = spinnerHTML;
  try { await handler(param, query); }
  catch (err) {
    if (err.status === 401) { state.user = null; renderNav(); location.hash = '#/login'; return; }
    appEl.innerHTML = emptyState('⚠️', 'Something went wrong', err.message || 'Unexpected error.',
      '<a class="btn btn-outline" href="#/home">Back to Home</a>');
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------------- Auth views ---------------- */
function viewLogin() {
  if (state.user) { location.hash = '#/home'; return; }
  appEl.innerHTML = `
    <div class="form-card">
      <h1>Welcome back</h1>
      <p class="form-sub">Log in with your mobile number or email (sellers).</p>
      <div id="form-error"></div>
      <form id="login-form" novalidate>
        ${fieldHTML({ id: 'identifier', label: 'Mobile number or Email', required: true, placeholder: 'e.g. 9876543210' })}
        ${fieldHTML({ id: 'passkey', label: 'Password', type: 'password', required: true, placeholder: 'Your password' })}
        ${fieldHTML({ id: 'inviteCode', label: 'Seller invite code', hint: 'Required for sellers only' })}
        <button class="btn btn-primary btn-block" type="submit">Log in</button>
      </form>
      <p class="form-note">New here? <a href="#/register">Create an account</a></p>
    </div>`;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const identifier = document.getElementById('identifier').value.trim();
    const passkey = document.getElementById('passkey').value;
    const inviteCode = document.getElementById('inviteCode').value.trim();
    const errBox = document.getElementById('form-error');
    errBox.innerHTML = '';
    if (!identifier || !passkey) {
      errBox.innerHTML = '<div class="form-error">Mobile number/email and password are required.</div>';
      return;
    }
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const { user } = await api.post('/api/auth/login', { identifier, passkey, inviteCode });
      state.user = user; renderNav();
      toast(`Welcome, ${user.name}!`, 'success');
      location.hash = user.role === 'developer' ? '#/admin' : (user.role === 'seller' ? '#/dashboard' : '#/home');
    } catch (err) {
      errBox.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = 'Log in';
    }
  });
}

function viewRegister() {
  if (state.user) { location.hash = '#/home'; return; }
  appEl.innerHTML = `
    <div class="form-card wide">
      <h1>Create your account</h1>
      <p class="form-sub">Choose exactly one role. Roles cannot be combined or changed later.</p>
      <div class="role-grid" id="role-grid">
        <button type="button" class="role-card" data-role="customer">
          <div class="emoji">🛍️</div><h3>Customer</h3><p>Browse products & contact sellers</p>
        </button>
        <button type="button" class="role-card" data-role="seller">
          <div class="emoji">🏪</div><h3>Seller</h3><p>List and manage your own products</p>
        </button>
        <button type="button" class="role-card" data-role="developer">
          <div class="emoji">🛡️</div><h3>Developer</h3><p>Admin · one account only</p>
        </button>
      </div>
      <div id="register-form-slot"></div>
    </div>`;

  const grid = document.getElementById('role-grid');
  grid.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      renderRegisterForm(card.dataset.role);
    });
  });

  function renderRegisterForm(role) {
    const slot = document.getElementById('register-form-slot');
    const common = `
      ${fieldHTML({ id: 'name', label: 'Full name', placeholder: 'Your name' })}
      ${fieldHTML({ id: 'mobile', label: 'Mobile number', required: true, placeholder: '10-digit mobile', hint: '10-digit Indian mobile number' })}
      ${fieldHTML({ id: 'passkey', label: 'Password', type: 'password', required: true, hint: 'Minimum 8 characters' })}`;
    const emailField = fieldHTML({ id: 'email', label: 'Email', type: 'email', required: true, placeholder: 'you@example.com' });
    const inviteField = fieldHTML({ id: 'inviteCode', label: role === 'seller' ? 'Developer invite code' : 'Developer invite code', required: true, hint: role === 'seller' ? 'Get this code from a Developer.' : 'Required to create the single Developer account' });

    slot.innerHTML = `
      <div id="form-error"></div>
      <form id="register-form" data-role="${role}" novalidate>
        ${role === 'seller' ? emailField + common + inviteField : common}
        ${role === 'developer' ? inviteField : ''}
        <button class="btn btn-primary btn-block" type="submit">Create ${role} account</button>
      </form>
      <p class="form-note">Already registered? <a href="#/login">Log in</a></p>`;

    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const body = {
        name: form.elements.namedItem('name').value.trim(),
        mobile: form.mobile.value.trim(),
        passkey: form.passkey.value,
      };
      if (role === 'seller') body.email = form.email.value.trim();
      if (role === 'seller' || role === 'developer') body.inviteCode = form.inviteCode.value.trim();

      ['mobile', 'email', 'passkey', 'inviteCode', 'name'].forEach(id => setFieldError(id, ''));

      const mobileRe = /^[6-9]\d{9}$/;
      if (!mobileRe.test(body.mobile)) { setFieldError('mobile', 'Enter a valid 10-digit Indian mobile number.'); return; }
      if (body.passkey.length < 8) { setFieldError('passkey', 'Password must be at least 8 characters.'); return; }
      if (role === 'seller' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(body.email)) {
        setFieldError('email', 'Enter a valid email address.'); return;
      }
      if ((role === 'seller' || role === 'developer') && !body.inviteCode) { setFieldError('inviteCode', 'Invite code is required.'); return; }

      const errBox = document.getElementById('form-error');
      errBox.innerHTML = '';
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Creating account…';
      try {
        const { user } = await api.post(`/api/auth/register/${role}`, body);
        state.user = user; renderNav();
        toast('Account created successfully!', 'success');
        location.hash = user.role === 'developer' ? '#/admin' : (user.role === 'seller' ? '#/dashboard' : '#/home');
      } catch (err) {
        errBox.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
        btn.disabled = false; btn.textContent = `Create ${role} account`;
      }
    });
  }
}

/* ---------------- Home & browsing ---------------- */
async function viewHome(param, query) {
  const search = query.search || '';
  appEl.innerHTML = `
    <div class="page-head">
      <h1>Browse Products</h1>
      <form class="search-bar" id="search-form">
        <input type="search" id="search-input" placeholder="Search products…" value="${esc(search)}" aria-label="Search products" />
        <button class="btn btn-primary" type="submit">Search</button>
      </form>
    </div>
    <div id="products-slot">${spinnerHTML}</div>`;

  document.getElementById('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    location.hash = q ? `#/home?search=${encodeURIComponent(q)}` : '#/home';
  });

  const { products } = await api.get('/api/products' + (search ? `?search=${encodeURIComponent(search)}` : ''));
  const slot = document.getElementById('products-slot');
  if (!products.length) {
    slot.innerHTML = emptyState('🔍', search ? 'No products match your search' : 'No products yet',
      search ? `Nothing found for "${search}". Try a different keyword.` : 'Be the first seller to add a product!');
    return;
  }
  slot.innerHTML = `<div class="product-grid">${products.map(productCard).join('')}</div>`;
}

function productCard(p) {
  return `
    <article class="product-card">
      <a class="card-img" href="#/product/${p.id}">${imgTag(p.image, p.title)}</a>
      <div class="card-body">
        <h3><a href="#/product/${p.id}">${esc(p.title)}</a></h3>
        <div class="price">${inr(p.price)}</div>
        <p class="card-category">${esc(p.category_name || 'Uncategorized')}</p>
        <p class="card-desc">${esc(p.description)}</p>
        <p class="card-seller">Sold by <strong>${esc(p.seller_name)}</strong></p>
        <div class="card-actions">
          <a class="btn btn-outline btn-sm" href="#/product/${p.id}">View Details</a>
        </div>
      </div>
    </article>`;
}

async function viewProductDetail(id) {
  let data;
  try { data = await api.get(`/api/products/${encodeURIComponent(id)}`); }
  catch (err) {
    if (err.status === 404) { appEl.innerHTML = emptyState('📦', 'Product not found', 'This product may have been removed.'); return; }
    throw err;
  }
  const p = data.product;
  const isOwner = state.user && (state.user.role === 'developer' || (state.user.role === 'seller' && p.seller_id === state.user.id));

  appEl.innerHTML = `
    <p style="margin-bottom:14px"><a href="#/home">← Back to products</a></p>
    <div class="detail-layout">
      <div class="detail-img">${imgTag(p.image, p.title)}</div>
      <div class="detail-info">
        <h1>${esc(p.title)}</h1>
        <div class="price">${inr(p.price)}</div>
        <p class="card-category">Category: ${esc(p.category_name || 'Uncategorized')}</p>
        <p class="full-desc">${esc(p.description)}</p>

        ${isOwner ? `
          <div class="card-actions" style="margin-bottom:16px">
            <a class="btn btn-primary" href="#/edit-product/${p.id}">Edit Product</a>
            <button class="btn btn-danger" id="delete-btn">Delete Product</button>
          </div>` : ''}

        <div class="contact-card">
          <h3>Seller Contact</h3>
          <div class="contact-row"><span class="label">Seller</span><span><strong>${esc(p.seller_name)}</strong></span></div>
          <div class="contact-row"><span class="label">Mobile</span><span>${esc(p.seller_mobile)}</span></div>
          ${p.seller_email ? `<div class="contact-row"><span class="label">Email</span><span>${esc(p.seller_email)}</span></div>` : ''}
          <div class="contact-actions">
            <a class="btn btn-primary btn-sm" href="tel:${esc(p.seller_mobile)}">📞 Call Seller</a>
            ${p.seller_email ? `<a class="btn btn-outline btn-sm" href="mailto:${esc(p.seller_email)}?subject=${encodeURIComponent('Enquiry about: ' + p.title)}">✉️ Email Seller</a>` : ''}
          </div>
        </div>
      </div>
    </div>`;

  const delBtn = document.getElementById('delete-btn');
  if (delBtn) delBtn.onclick = () => deleteProduct(p.id, p.title, '#/dashboard');
}

/* ---------------- Product CRUD ---------------- */
function requireSellerOrDev() {
  if (!state.user || (state.user.role !== 'seller' && state.user.role !== 'developer')) {
    location.hash = '#/home';
    return false;
  }
  return true;
}

function productFormHTML({ heading, sub, p = {}, actionLabel, categories }) {
  return `
    <div class="form-card wide">
      <h1>${esc(heading)}</h1>
      <p class="form-sub">${esc(sub)}</p>
      <div id="form-error"></div>
      <form id="product-form" novalidate enctype="multipart/form-data">
        ${fieldHTML({ id: 'title', label: 'Product title', required: true, value: p.title || '', placeholder: 'e.g. Wireless Bluetooth Headphones', hint: 'Maximum 120 characters' })}
        <div class="field" data-field="category_id">
          <label for="category_id">Category <span class="req">*</span></label>
          <select id="category_id" name="category_id" required>
            <option value="">Select a category</option>
            ${categories.map(category => `<option value="${category.id}" ${Number(p.category_id) === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}
          </select>
          ${categories.length ? '' : `<div class="hint">No categories are available. ${state.user.role === 'developer' ? '<a href="#/admin">Add a category</a> in the Developer Dashboard.' : 'Ask a developer to add a category.'}</div>`}
          <div class="error-text"></div>
        </div>
        <div class="field" data-field="image">
          <label for="image">Product image <span class="req">*</span></label>
          <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" />
          <div class="hint">JPG, JPEG, PNG or WebP · maximum 4 MB${p.image ? ' · leave empty to keep the current image' : ''}</div>
          <div class="error-text"></div>
          <div class="image-preview" id="image-preview">${p.image ? imgTag(p.image, 'Current image') : ''}</div>
        </div>
        ${fieldHTML({ id: 'price', label: 'Price (₹)', type: 'number', required: true, value: p.price ?? '', placeholder: 'e.g. 1299' })}
        ${fieldHTML({ id: 'description', label: 'Description', required: true, value: p.description || '', placeholder: 'Describe your product…', textarea: true, hint: 'Maximum 2000 characters' })}
        <button class="btn btn-primary btn-block" type="submit">${esc(actionLabel)}</button>
      </form>
    </div>`;
}

function wireProductForm(form, onSubmit) {
  const fileInput = form.image;
  const preview = document.getElementById('image-preview');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      preview.innerHTML = imgTag(url, 'Preview');
      preview.style.display = 'block';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    ['title', 'image', 'price', 'description', 'category_id'].forEach(id => setFieldError(id, ''));
    const errBox = document.getElementById('form-error');
    errBox.innerHTML = '';

    const title = form.title.value.trim();
    const price = form.price.value.trim();
    const description = form.description.value.trim();
    const categoryId = form.category_id.value;
    const file = fileInput.files[0];

    let bad = false;
    if (!title) { setFieldError('title', 'Title is required.'); bad = true; }
    else if (title.length > 120) { setFieldError('title', 'Title must be 120 characters or fewer.'); bad = true; }
    if (form.dataset.imageRequired === 'true' && !file) { setFieldError('image', 'Product image is required.'); bad = true; }
    if (file) {
      const okTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!okTypes.includes(file.type)) { setFieldError('image', 'Only JPG, JPEG, PNG or WebP images are allowed.'); bad = true; }
      else if (file.size > 4 * 1024 * 1024) { setFieldError('image', 'Image must be 4 MB or smaller.'); bad = true; }
    }
    if (!price) { setFieldError('price', 'Price is required.'); bad = true; }
    else if (!(Number(price) > 0)) { setFieldError('price', 'Price must be a valid positive number.'); bad = true; }
    if (!description) { setFieldError('description', 'Description is required.'); bad = true; }
    else if (description.length > 2000) { setFieldError('description', 'Description must be 2000 characters or fewer.'); bad = true; }
    if (!categoryId) { setFieldError('category_id', 'Select a product category.'); bad = true; }
    if (bad) return;

    const fd = new FormData();
    fd.append('title', title);
    fd.append('price', price);
    fd.append('description', description);
    fd.append('category_id', categoryId);
    if (file) fd.append('image', file);

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await onSubmit(fd); }
    catch (err) {
      errBox.innerHTML = `<div class="form-error">${esc(err.message)}</div>`;
      btn.disabled = false;
    }
  });
}

async function viewAddProduct() {
  if (!requireSellerOrDev()) return;
  const { categories } = await api.get('/api/products/categories');
  appEl.innerHTML = productFormHTML({
    heading: 'Add Product',
    sub: 'List a new product for buyers to discover.',
    actionLabel: 'Add Product', categories
  });
  const form = document.getElementById('product-form');
  form.dataset.imageRequired = 'true';
  wireProductForm(form, async (fd) => {
    await api.postForm('/api/products', fd);
    toast('Product added successfully!', 'success');
    location.hash = '#/dashboard';
  });
}

async function viewEditProduct(id) {
  if (!requireSellerOrDev()) return;
  let p;
  let categories;
  try {
    [p, { categories }] = await Promise.all([
      api.get(`/api/products/${encodeURIComponent(id)}`).then(data => data.product),
      api.get('/api/products/categories')
    ]);
  }
  catch (err) {
    if (err.status === 404) { appEl.innerHTML = emptyState('📦', 'Product not found', ''); return; }
    if (err.status === 403) { appEl.innerHTML = emptyState('🔒', 'Not authorized', 'You can only edit your own products.'); return; }
    throw err;
  }
  appEl.innerHTML = productFormHTML({
    heading: 'Edit Product', sub: 'Update the details of your product.', p, actionLabel: 'Save Changes', categories
  });
  const form = document.getElementById('product-form');
  form.dataset.imageRequired = 'false';
  document.getElementById('image-preview').style.display = p.image ? 'block' : 'none';
  wireProductForm(form, async (fd) => {
    await api.putForm(`/api/products/${p.id}`, fd);
    toast('Product updated successfully!', 'success');
    location.hash = '#/dashboard';
  });
}

async function deleteProduct(id, title, redirectHash) {
  const ok = await confirmDialog('Delete product?', `"${title}" will be permanently deleted. This action cannot be undone.`);
  if (!ok) return;
  try {
    await api.del(`/api/products/${id}`);
    toast('Product deleted.', 'success');
    location.hash = redirectHash || '#/dashboard';
    route();
  } catch (err) { toast(err.message, 'error'); }
}

/* ---------------- Seller/Developer dashboard ---------------- */
async function viewDashboard() {
  if (!requireSellerOrDev()) return;
  const isDev = state.user.role === 'developer';
  appEl.innerHTML = `
    <div class="page-head">
      <h1>${isDev ? 'All Products (Admin)' : 'My Products'}</h1>
      <a class="btn btn-primary" href="#/add-product">+ Add Product</a>
    </div>
    <div id="dash-slot">${spinnerHTML}</div>`;

  const { products } = await api.get('/api/products/mine');
  const slot = document.getElementById('dash-slot');
  if (!products.length) {
    slot.innerHTML = emptyState('📦', isDev ? 'No products in the system' : 'You have no products yet',
      isDev ? 'Products added by sellers will appear here.' : 'Add your first product to start selling!',
      '<div style="margin-top:14px"><a class="btn btn-primary" href="#/add-product">Add Product</a></div>');
    return;
  }
  slot.innerHTML = `
    <p style="margin-bottom:12px;color:var(--text-muted)">${products.length} product${products.length === 1 ? '' : 's'}</p>
    <div class="table-wrap"><table class="data-table">
      <thead><tr>
        <th>Image</th><th>Title</th><th>Category</th><th>Price</th>${isDev ? '<th>Seller</th>' : ''}<th>Actions</th>
      </tr></thead>
      <tbody>
        ${products.map(p => `
          <tr>
            <td>${imgTag(p.image, p.title, 'thumb')}</td>
            <td><a href="#/product/${p.id}"><strong>${esc(p.title)}</strong></a></td>
            <td>${esc(p.category_name || 'Uncategorized')}</td>
            <td class="price" style="font-size:1rem">${inr(p.price)}</td>
            ${isDev ? `<td>${esc(p.seller_name)}</td>` : ''}
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <a class="btn btn-outline btn-sm" href="#/edit-product/${p.id}">Edit</a>
                <button class="btn btn-danger btn-sm" data-delete="${p.id}" data-title="${esc(p.title)}">Delete</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;

  slot.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = () => deleteProduct(btn.dataset.delete, btn.dataset.title, '#/dashboard');
  });
}

/* ---------------- Profile ---------------- */
async function viewProfile() {
  if (!state.user) { location.hash = '#/login'; return; }
  const u = state.user;
  let extraRows = '', actions = '', sidePanel = '';

  if (u.role === 'developer') {
    const s = await api.get('/api/admin/stats');
    extraRows = `
      <div class="row"><span class="k">Total users</span><span>${s.totalUsers}</span></div>
      <div class="row"><span class="k">Sellers</span><span>${s.totalSellers}</span></div>
      <div class="row"><span class="k">Customers</span><span>${s.totalCustomers}</span></div>
      <div class="row"><span class="k">Products</span><span>${s.totalProducts}</span></div>`;
    actions = `
      <div class="card-actions">
        <a class="btn btn-primary" href="#/admin">Admin Dashboard</a>
        <a class="btn btn-outline" href="#/dashboard">Manage Products</a>
      </div>`;
  } else if (u.role === 'seller') {
    const { products } = await api.get('/api/products/mine');
    extraRows = `<div class="row"><span class="k">Products listed</span><span>${products.length}</span></div>`;
    actions = `
      <div class="card-actions">
        <a class="btn btn-primary" href="#/dashboard">Manage Products</a>
        <a class="btn btn-outline" href="#/add-product">Add Product</a>
      </div>`;
    sidePanel = `<div class="profile-card"><h2 style="margin-bottom:12px">Your products</h2>
      ${products.length
        ? `<div style="display:flex;flex-direction:column;gap:10px">${products.slice(0, 5).map(p => `
            <div style="display:flex;gap:10px;align-items:center">
              ${imgTag(p.image, p.title, 'thumb')}
              <div><a href="#/product/${p.id}"><strong>${esc(p.title)}</strong></a><br><span class="price" style="font-size:.95rem">${inr(p.price)}</span></div>
            </div>`).join('')}</div>
          ${products.length > 5 ? `<p style="margin-top:10px"><a href="#/dashboard">View all ${products.length} →</a></p>` : ''}`
        : '<p style="color:var(--text-muted)">No products yet.</p>'}
    </div>`;
  } else {
    actions = `<div class="card-actions"><a class="btn btn-primary" href="#/home">Browse Products</a></div>`;
  }

  appEl.innerHTML = `
    <h1 style="margin-bottom:18px">My Profile</h1>
    <div class="profile-grid">
      <div class="profile-card">
        <div class="avatar">${esc((u.name || 'U').charAt(0).toUpperCase())}</div>
        <h2>${esc(u.name)}</h2>
        <p><span class="role-badge ${u.role}">${esc(u.role)}</span></p>
        <div class="profile-meta">
          <div class="row"><span class="k">Mobile</span><span>${esc(u.mobile)}</span></div>
          ${u.email ? `<div class="row"><span class="k">Email</span><span>${esc(u.email)}</span></div>` : ''}
          <div class="row"><span class="k">Member since</span><span>${esc(u.created_at)}</span></div>
          ${extraRows}
        </div>
        ${actions}
      </div>
      ${sidePanel}
    </div>`;
}

/* ---------------- Developer Admin ---------------- */
async function viewAdmin() {
  if (!state.user) { location.hash = '#/login'; return; }
  if (state.user.role !== 'developer') {
    appEl.innerHTML = emptyState('🔒', 'Access denied', 'This area is restricted to the Developer account.');
    return;
  }
  appEl.innerHTML = `
    <div class="page-head">
      <h1>Developer Dashboard</h1>
      <a class="btn btn-outline" href="#/dashboard">Manage Products</a>
    </div>
    <div class="page-head">
      <h1 style="font-size:1.2rem">Product Categories</h1>
    </div>
    <form id="category-form" class="search-bar" style="margin-bottom:14px">
      <input id="category-name" name="name" maxlength="60" placeholder="New category name" aria-label="New category name" required />
      <button class="btn btn-primary" type="submit">Add Category</button>
    </form>
    <div id="categories-slot">${spinnerHTML}</div>
    <div class="stats-grid" id="stats-slot">${spinnerHTML}</div>
    <div class="page-head">
      <h1 style="font-size:1.2rem">Seller Invite Codes</h1>
      <button class="btn btn-primary" id="new-invite-code">Generate code</button>
    </div>
    <div id="invite-codes-slot">${spinnerHTML}</div>
    <div class="page-head">
      <h1 style="font-size:1.2rem">User Management</h1>
      <select id="role-filter" aria-label="Filter by role" style="padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;background:#fff">
        <option value="">All roles</option>
        <option value="developer">Developer</option>
        <option value="seller">Sellers</option>
        <option value="customer">Customers</option>
      </select>
    </div>
    <div id="users-slot">${spinnerHTML}</div>`;

  const [stats] = await Promise.all([api.get('/api/admin/stats'), loadUsers(''), loadInviteCodes(), loadCategories()]);
  document.getElementById('stats-slot').innerHTML = `
    <div class="stat-card"><div class="num">${stats.totalUsers}</div><div class="lbl">Total Users</div></div>
    <div class="stat-card"><div class="num">${stats.totalSellers}</div><div class="lbl">Sellers</div></div>
    <div class="stat-card"><div class="num">${stats.totalCustomers}</div><div class="lbl">Customers</div></div>
    <div class="stat-card"><div class="num">${stats.totalProducts}</div><div class="lbl">Products</div></div>`;

  document.getElementById('role-filter').addEventListener('change', (e) => loadUsers(e.target.value));

  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('category-name');
    try {
      await api.post('/api/admin/categories', { name: input.value.trim() });
      input.value = '';
      toast('Category added.', 'success');
      await loadCategories();
    } catch (err) { toast(err.message, 'error'); }
  });

  async function loadCategories() {
    const slot = document.getElementById('categories-slot');
    slot.innerHTML = spinnerHTML;
    const { categories } = await api.get('/api/admin/categories');
    slot.innerHTML = categories.length ? `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Category</th><th>Products</th><th>Actions</th></tr></thead>
        <tbody>${categories.map(category => `
          <tr>
            <td><input data-category-name="${category.id}" value="${esc(category.name)}" maxlength="60" aria-label="Category name" /></td>
            <td>${category.product_count}</td>
            <td><div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" data-save-category="${category.id}">Save</button>
              <button class="btn btn-danger btn-sm" data-delete-category="${category.id}" data-name="${esc(category.name)}">Delete</button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : emptyState('📂', 'No categories yet', 'Add a category before listing products.');

    slot.querySelectorAll('[data-save-category]').forEach(button => {
      button.onclick = async () => {
        const id = button.dataset.saveCategory;
        const name = slot.querySelector(`[data-category-name="${id}"]`).value.trim();
        try {
          await api.put(`/api/admin/categories/${id}`, { name });
          toast('Category updated.', 'success');
          await loadCategories();
        } catch (err) { toast(err.message, 'error'); }
      };
    });
    slot.querySelectorAll('[data-delete-category]').forEach(button => {
      button.onclick = async () => {
        const ok = await confirmDialog('Delete category?', `Delete "${button.dataset.name}"? Categories used by products cannot be deleted.`);
        if (!ok) return;
        try {
          await api.del(`/api/admin/categories/${button.dataset.deleteCategory}`);
          toast('Category deleted.', 'success');
          await loadCategories();
        } catch (err) { toast(err.message, 'error'); }
      };
    });
  }

  document.getElementById('new-invite-code').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const { code } = await api.post('/api/admin/invite-codes', {});
      await loadInviteCodes();
      toast(`New seller invite code: ${code}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.target.disabled = false;
  });

  async function loadInviteCodes() {
    const slot = document.getElementById('invite-codes-slot');
    slot.innerHTML = spinnerHTML;
    const { inviteCodes } = await api.get('/api/admin/invite-codes');
    slot.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Code</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${inviteCodes.map(invite => `
            <tr>
              <td><strong>${esc(invite.code)}</strong></td>
              <td>${invite.active ? 'Active' : 'Revoked'}</td>
              <td>${esc(invite.created_at)}</td>
              <td>${invite.active
                ? `<button class="btn btn-danger btn-sm" data-revoke-invite="${invite.id}">Revoke</button>`
                : '<span style="color:var(--text-muted);font-size:.82rem">inactive</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    slot.querySelectorAll('[data-revoke-invite]').forEach(btn => {
      btn.onclick = async () => {
        try {
          await api.del(`/api/admin/invite-codes/${btn.dataset.revokeInvite}`);
          toast('Invite code revoked.', 'success');
          loadInviteCodes();
        } catch (err) { toast(err.message, 'error'); }
      };
    });
  }

  async function loadUsers(role) {
    const slot = document.getElementById('users-slot');
    slot.innerHTML = spinnerHTML;
    const { users } = await api.get('/api/admin/users' + (role ? `?role=${role}` : ''));
    slot.innerHTML = `
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Name</th><th>Mobile</th><th>Email</th><th>Role</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${esc(u.name)}</strong></td>
              <td>${esc(u.mobile)}</td>
              <td>${esc(u.email || '—')}</td>
              <td><span class="role-badge ${u.role}">${esc(u.role)}</span></td>
              <td>${esc(u.created_at)}</td>
              <td>${u.id !== state.user.id && u.role !== 'developer'
                ? `<button class="btn btn-danger btn-sm" data-del-user="${u.id}" data-name="${esc(u.name)}">Delete</button>`
                : '<span style="color:var(--text-muted);font-size:.82rem">protected</span>'}</td>
            </tr>`).join('')}
        </tbody>
      </table></div>`;

    slot.querySelectorAll('[data-del-user]').forEach(btn => {
      btn.onclick = async () => {
        const ok = await confirmDialog('Delete user?', `Account "${btn.dataset.name}" and all of its products will be permanently deleted.`);
        if (!ok) return;
        try {
          await api.del(`/api/admin/users/${btn.dataset.delUser}`);
          toast('User deleted.', 'success');
          viewAdmin();
        } catch (err) { toast(err.message, 'error'); }
      };
    });
  }
}

/* ---------------- boot ---------------- */
(async function init() {
  try { const { user } = await api.get('/api/auth/me'); state.user = user; }
  catch { state.user = null; }
  renderNav();
  if (!location.hash) location.hash = '#/home';
  await route();
})();