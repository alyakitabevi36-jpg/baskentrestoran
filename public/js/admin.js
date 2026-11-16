(function () {
  let state = { categories: [], dishes: [], ingredients: [] };
  let activeEditLang = 'az';
  let pendingDishImages = []; // newly selected base64 images
  let existingDishImages = []; // images already on server for current dish
  let selectedIngredientIds = new Set();
  let pendingIngDataUrl = null;
  let dishFormDraft = {}; // holds 4-language fields while switching tabs

  const el = (id) => document.getElementById(id);

  function showToast(msg) {
    const t = el('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2800);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Client-side image optimization using Canvas
  function optimizeImage(file, maxDim = 1200, quality = 0.84) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const out = canvas.toDataURL('image/jpeg', quality);
          resolve(out);
        };
        img.onerror = () => reject(new Error('Şəkil oxunmadı'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Fayl oxunmadı'));
      reader.readAsDataURL(file);
    });
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.includes('/api/auth/')) {
      showLogin();
      throw new Error('Sessiya bitib. Yenidən daxil olun.');
    }
    if (!res.ok) throw new Error(data.error || 'Xəta baş verdi');
    return data;
  }

  function showLogin() {
    el('loginView').style.display = 'flex';
    el('dashboardView').style.display = 'none';
    el('adminHeaderActions').style.display = 'none';
  }

  function showDashboard() {
    el('loginView').style.display = 'none';
    el('dashboardView').style.display = 'block';
    el('adminHeaderActions').style.display = 'flex';
    loadAdminData();
  }

  async function checkAuth() {
    const me = await api('/api/auth/me');
    if (me.authenticated) showDashboard();
    else showLogin();
  }

  async function loadAdminData() {
    state = await api('/api/admin/data');
    renderCategoryFilter();
    renderDishesList();
    renderCategoriesList();
    renderIngredientsList();
  }

  function renderCategoryFilter() {
    const filter = el('adminCatFilter');
    const prev = filter.value || 'all';
    let html = '<option value="all">Bütün kateqoriyalar</option>';
    for (const c of state.categories) {
      html += `<option value="${c.id}">${escapeHtml(c.name_az)}</option>`;
    }
    filter.innerHTML = html;
    filter.value = prev;
  }

  function renderDishesList() {
    const catFilter = el('adminCatFilter').value || 'all';
    const catMap = new Map(state.categories.map((c) => [c.id, c.name_az]));
    const filtered =
      catFilter === 'all' ? state.dishes : state.dishes.filter((d) => String(d.category_id) === String(catFilter));

    if (filtered.length === 0) {
      el('adminDishesList').innerHTML = '<div class="empty-state">Yemək tapılmadı.</div>';
      return;
    }

    el('adminDishesList').innerHTML = filtered
      .map((d, idx) => {
        const thumb = (d.images && d.images[0] && d.images[0].image_url) || '/uploads/seed/lule-kabab.svg';
        const avail = Boolean(d.is_available);
        return `
        <div class="panel-card admin-dish-row">
          <img class="admin-dish-thumb" src="${escapeHtml(thumb)}" alt="" />
          <div class="admin-dish-info">
            <div style="font-weight:700; color:var(--text-primary);">${escapeHtml(d.name_az)}</div>
            <div style="font-size:12px; color:var(--text-secondary);">
              ${escapeHtml(catMap.get(d.category_id) || '')} • <strong style="color:var(--gold-light);">${Number(d.price_azn).toFixed(2)} AZN</strong>
              • ${d.images ? d.images.length : 0} şəkil
            </div>
          </div>
          <div class="admin-dish-actions">
            <button class="btn btn-sm ${avail ? 'btn-outline' : 'btn-danger'}" onclick="window.__toggleDish(${d.id})">
              ${avail ? '✓ Aktiv' : '✕ Deaktiv'}
            </button>
            <button class="btn btn-sm btn-outline" ${idx === 0 ? 'disabled' : ''} onclick="window.__moveDish(${d.id}, -1)">↑</button>
            <button class="btn btn-sm btn-outline" ${idx === filtered.length - 1 ? 'disabled' : ''} onclick="window.__moveDish(${d.id}, 1)">↓</button>
            <button class="btn btn-sm btn-gold" onclick="window.__editDish(${d.id})">Redaktə</button>
            <button class="btn btn-sm btn-danger" onclick="window.__deleteDish(${d.id})">Sil</button>
          </div>
        </div>`;
      })
      .join('');
  }

  function renderCategoriesList() {
    el('adminCatsList').innerHTML = state.categories
      .map(
        (c) => `
      <div class="panel-card admin-dish-row">
        <div class="admin-dish-info">
          <div style="font-weight:700;">${escapeHtml(c.name_az)}</div>
          <div style="font-size:12px; color:var(--text-secondary);">EN: ${escapeHtml(c.name_en)} | RU: ${escapeHtml(c.name_ru)} | TR: ${escapeHtml(c.name_tr)}</div>
        </div>
        <div class="admin-dish-actions">
          <button class="btn btn-sm btn-gold" onclick="window.__editCat(${c.id})">Redaktə</button>
          <button class="btn btn-sm btn-danger" onclick="window.__deleteCat(${c.id})">Sil</button>
        </div>
      </div>`
      )
      .join('');
  }

  function renderIngredientsList() {
    el('adminIngsList').innerHTML = state.ingredients
      .map(
        (ing) => `
      <div class="panel-card admin-dish-row" style="margin-bottom:0;">
        <img src="${escapeHtml(ing.image_url)}" alt="" style="width:44px; height:44px; border-radius:10px; object-fit:cover; background:#111;" />
        <div class="admin-dish-info" style="min-width:120px;">
          <div style="font-weight:700; font-size:14px;">${escapeHtml(ing.name_az)}</div>
          <div style="font-size:11px; color:var(--text-secondary);">${escapeHtml(ing.name_en)} / ${escapeHtml(ing.name_ru)} / ${escapeHtml(ing.name_tr)}</div>
        </div>
        <div class="admin-dish-actions">
          <button class="btn btn-sm btn-gold" onclick="window.__editIng(${ing.id})">Redaktə</button>
          <button class="btn btn-sm btn-danger" onclick="window.__deleteIng(${ing.id})">Sil</button>
        </div>
      </div>`
      )
      .join('');
  }

  // Dish Editor Helpers
  function renderDishLangInputs() {
    const l = activeEditLang;
    const labels = {
      az: 'Azərbaycan dili',
      en: 'İngilis dili',
      ru: 'Rus dili',
      tr: 'Türk dili',
    };
    el('dishLangFields').innerHTML = `
      <div class="form-group">
        <label class="form-label">Yeməyin adı (${labels[l]}) ${l === 'az' ? '*' : ''}</label>
        <input type="text" id="df_name_${l}" class="form-control" value="${escapeHtml(dishFormDraft[`name_${l}`] || '')}" ${l === 'az' ? 'required' : ''} />
      </div>
      <div class="form-group">
        <label class="form-label">Ətraflı təsvir (${labels[l]})</label>
        <textarea id="df_desc_${l}" class="form-control">${escapeHtml(dishFormDraft[`desc_${l}`] || '')}</textarea>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label class="form-label">Allergiya məlumatı (${labels[l]}, istəyə bağlı)</label>
        <input type="text" id="df_allergens_${l}" class="form-control" value="${escapeHtml(dishFormDraft[`allergens_${l}`] || '')}" placeholder="Məs: Qluten, süd məhsulları, qoz" />
      </div>
    `;

    ['name', 'desc', 'allergens'].forEach((field) => {
      el(`df_${field}_${l}`).addEventListener('input', (e) => {
        dishFormDraft[`${field}_${l}`] = e.target.value;
      });
    });
  }

  function renderDishImagesPreview() {
    let html = existingDishImages
      .map(
        (img) => `
      <div class="img-edit-box">
        <img src="${escapeHtml(img.image_url)}" alt="" />
        <div class="img-edit-actions">
          <button type="button" class="btn btn-sm ${img.is_primary ? 'btn-gold' : 'btn-outline'}" style="padding:2px 6px; font-size:10px;" onclick="window.__setPrimaryImg(${img.id})">
            ${img.is_primary ? '★ Əsas' : 'Əsas et'}
          </button>
          <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px; font-size:10px;" onclick="window.__deleteExistingImg(${img.id})">✕</button>
        </div>
      </div>`
      )
      .join('');

    html += pendingDishImages
      .map(
        (dataUrl, idx) => `
      <div class="img-edit-box">
        <img src="${dataUrl}" alt="" />
        <div class="img-edit-actions">
          <span style="font-size:10px; color:var(--gold-light); padding:2px 4px;">Yeni</span>
          <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px; font-size:10px;" onclick="window.__removePendingImg(${idx})">✕</button>
        </div>
      </div>`
      )
      .join('');

    el('dishImagesPreview').innerHTML = html;
  }

  function renderDishIngredientsPicker() {
    el('dishIngsPicker').innerHTML = state.ingredients
      .map((ing) => {
        const sel = selectedIngredientIds.has(ing.id);
        return `
        <div class="ing-check-item ${sel ? 'selected' : ''}" onclick="window.__toggleDishIng(${ing.id})">
          <img src="${escapeHtml(ing.image_url)}" alt="" />
          <span>${escapeHtml(ing.name_az)}</span>
        </div>`;
      })
      .join('');
  }

  function openDishModal(dish = null) {
    el('dishCategory').innerHTML = state.categories
      .map((c) => `<option value="${c.id}">${escapeHtml(c.name_az)}</option>`)
      .join('');

    pendingDishImages = [];
    activeEditLang = 'az';
    document.querySelectorAll('#dishLangTabs .lang-tab-mini').forEach((b) => {
      b.classList.toggle('active', b.dataset.l === 'az');
    });

    if (dish) {
      el('dishModalTitle').textContent = 'Yeməyi Redaktə Et';
      el('dishId').value = dish.id;
      el('dishCategory').value = dish.category_id;
      el('dishPrice').value = dish.price_azn;
      el('dishAvailable').checked = Boolean(dish.is_available);
      existingDishImages = [...(dish.images || [])];
      selectedIngredientIds = new Set((dish.ingredients || []).map((i) => i.id));
      dishFormDraft = {
        name_az: dish.name_az, name_en: dish.name_en, name_ru: dish.name_ru, name_tr: dish.name_tr,
        desc_az: dish.desc_az, desc_en: dish.desc_en, desc_ru: dish.desc_ru, desc_tr: dish.desc_tr,
        allergens_az: dish.allergens_az, allergens_en: dish.allergens_en, allergens_ru: dish.allergens_ru, allergens_tr: dish.allergens_tr,
      };
    } else {
      el('dishModalTitle').textContent = 'Yeni Yemək Əlavə Et';
      el('dishId').value = '';
      el('dishPrice').value = '';
      el('dishAvailable').checked = true;
      existingDishImages = [];
      selectedIngredientIds = new Set();
      dishFormDraft = {};
    }

    renderDishLangInputs();
    renderDishImagesPreview();
    renderDishIngredientsPicker();
    el('dishModal').classList.add('open');
  }

  // Global action handlers
  window.__toggleDish = async (id) => {
    try {
      await api(`/api/admin/dishes/${id}/toggle`, { method: 'PATCH' });
      await loadAdminData();
      showToast('Mövcudluq yeniləndi');
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__moveDish = async (id, dir) => {
    const catFilter = el('adminCatFilter').value || 'all';
    const list =
      catFilter === 'all' ? [...state.dishes] : state.dishes.filter((d) => String(d.category_id) === String(catFilter));
    const idx = list.findIndex((d) => d.id === id);
    const targetIdx = idx + dir;
    if (idx < 0 || targetIdx < 0 || targetIdx >= list.length) return;
    [list[idx], list[targetIdx]] = [list[targetIdx], list[idx]];
    try {
      await api('/api/admin/dishes/reorder', {
        method: 'POST',
        body: JSON.stringify({ orderedIds: list.map((d) => d.id) }),
      });
      await loadAdminData();
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__editDish = (id) => {
    const dish = state.dishes.find((d) => d.id === id);
    if (dish) openDishModal(dish);
  };

  window.__deleteDish = async (id) => {
    if (!confirm('Bu yeməyi silmək istədiyinizə əminsiniz?')) return;
    try {
      await api(`/api/admin/dishes/${id}`, { method: 'DELETE' });
      await loadAdminData();
      showToast('Yemək silindi');
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__toggleDishIng = (ingId) => {
    if (selectedIngredientIds.has(ingId)) selectedIngredientIds.delete(ingId);
    else selectedIngredientIds.add(ingId);
    renderDishIngredientsPicker();
  };

  window.__removePendingImg = (idx) => {
    pendingDishImages.splice(idx, 1);
    renderDishImagesPreview();
  };

  window.__deleteExistingImg = async (imgId) => {
    try {
      await api(`/api/admin/images/${imgId}`, { method: 'DELETE' });
      existingDishImages = existingDishImages.filter((i) => i.id !== imgId);
      renderDishImagesPreview();
      await loadAdminData();
      showToast('Şəkil silindi');
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__setPrimaryImg = async (imgId) => {
    try {
      await api(`/api/admin/images/${imgId}/primary`, { method: 'PATCH' });
      existingDishImages = existingDishImages.map((i) => ({ ...i, is_primary: i.id === imgId ? 1 : 0 }));
      renderDishImagesPreview();
      await loadAdminData();
      showToast('Əsas şəkil yeniləndi');
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__editCat = (id) => {
    const c = state.categories.find((x) => x.id === id);
    if (!c) return;
    el('catModalTitle').textContent = 'Kateqoriyanı Redaktə Et';
    el('catId').value = c.id;
    el('catAz').value = c.name_az;
    el('catEn').value = c.name_en;
    el('catRu').value = c.name_ru;
    el('catTr').value = c.name_tr;
    el('catOrder').value = c.sort_order;
    el('catModal').classList.add('open');
  };

  window.__deleteCat = async (id) => {
    if (!confirm('Kateqoriya silindikdə içindəki yeməklər də silinəcək. Davam edilsin?')) return;
    try {
      await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
      await loadAdminData();
      showToast('Kateqoriya silindi');
    } catch (e) {
      showToast(e.message);
    }
  };

  window.__editIng = (id) => {
    const ing = state.ingredients.find((x) => x.id === id);
    if (!ing) return;
    pendingIngDataUrl = null;
    el('ingModalTitle').textContent = 'İnqrediyenti Redaktə Et';
    el('ingId').value = ing.id;
    el('ingAz').value = ing.name_az;
    el('ingEn').value = ing.name_en;
    el('ingRu').value = ing.name_ru;
    el('ingTr').value = ing.name_tr;
    if (ing.image_url) {
      el('ingImagePreview').src = ing.image_url;
      el('ingImagePreview').style.display = 'block';
    } else {
      el('ingImagePreview').style.display = 'none';
    }
    el('ingModal').classList.add('open');
  };

  window.__deleteIng = async (id) => {
    if (!confirm('Bu inqrediyenti silmək istəyirsiniz?')) return;
    try {
      await api(`/api/admin/ingredients/${id}`, { method: 'DELETE' });
      await loadAdminData();
      showToast('İnqrediyent silindi');
    } catch (e) {
      showToast(e.message);
    }
  };

  // Event Listeners
  el('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('loginError').style.display = 'none';
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: el('loginEmail').value.trim(),
          password: el('loginPassword').value,
        }),
      });
      showDashboard();
    } catch (err) {
      el('loginError').textContent = err.message;
      el('loginError').style.display = 'block';
    }
  });

  el('logoutBtn').addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    showLogin();
  });

  document.querySelectorAll('.admin-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      ['dishes', 'categories', 'ingredients', 'settings'].forEach((name) => {
        el(`tab-${name}`).style.display = tab.dataset.tab === name ? 'block' : 'none';
      });
    });
  });

  el('adminCatFilter').addEventListener('change', renderDishesList);
  el('addDishBtn').addEventListener('click', () => openDishModal(null));
  el('closeDishModal').addEventListener('click', () => el('dishModal').classList.remove('open'));

  document.querySelectorAll('#dishLangTabs .lang-tab-mini').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeEditLang = btn.dataset.l;
      document.querySelectorAll('#dishLangTabs .lang-tab-mini').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderDishLangInputs();
    });
  });

  el('dishImagesInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const optimized = await optimizeImage(file, 1200, 0.84);
        pendingDishImages.push(optimized);
      } catch {
        showToast('Şəkil optimallaşdırıla bilmədi');
      }
    }
    e.target.value = '';
    renderDishImagesPreview();
  });

  el('dishForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!dishFormDraft.name_az || !dishFormDraft.name_az.trim()) {
      showToast('Azərbaycan dilində yeməyin adını daxil edin');
      return;
    }
    const id = el('dishId').value;
    const payload = {
      category_id: Number(el('dishCategory').value),
      price_azn: Number(el('dishPrice').value),
      is_available: el('dishAvailable').checked,
      ...dishFormDraft,
      ingredientIds: Array.from(selectedIngredientIds),
      newImages: pendingDishImages,
    };

    try {
      el('saveDishBtn').disabled = true;
      if (id) {
        await api(`/api/admin/dishes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Yemək yeniləndi');
      } else {
        await api('/api/admin/dishes', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Yeni yemək əlavə edildi');
      }
      el('dishModal').classList.remove('open');
      await loadAdminData();
    } catch (err) {
      showToast(err.message);
    } finally {
      el('saveDishBtn').disabled = false;
    }
  });

  // Category Modal
  el('addCatBtn').addEventListener('click', () => {
    el('catModalTitle').textContent = 'Yeni Kateqoriya';
    el('catId').value = '';
    el('catAz').value = '';
    el('catEn').value = '';
    el('catRu').value = '';
    el('catTr').value = '';
    el('catOrder').value = state.categories.length + 1;
    el('catModal').classList.add('open');
  });
  el('closeCatModal').addEventListener('click', () => el('catModal').classList.remove('open'));
  el('catForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('catId').value;
    const payload = {
      name_az: el('catAz').value.trim(),
      name_en: el('catEn').value.trim(),
      name_ru: el('catRu').value.trim(),
      name_tr: el('catTr').value.trim(),
      sort_order: Number(el('catOrder').value || 1),
    };
    try {
      if (id) await api(`/api/admin/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(payload) });
      el('catModal').classList.remove('open');
      await loadAdminData();
      showToast('Kateqoriya yadda saxlanıldı');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Ingredient Modal
  function openNewIngModal() {
    pendingIngDataUrl = null;
    el('ingModalTitle').textContent = 'Yeni İnqrediyent';
    el('ingId').value = '';
    el('ingAz').value = '';
    el('ingEn').value = '';
    el('ingRu').value = '';
    el('ingTr').value = '';
    el('ingImagePreview').style.display = 'none';
    el('ingModal').classList.add('open');
  }

  el('addIngBtn').addEventListener('click', openNewIngModal);
  el('quickAddIngBtn').addEventListener('click', openNewIngModal);
  el('closeIngModal').addEventListener('click', () => el('ingModal').classList.remove('open'));

  el('ingImageInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    pendingIngDataUrl = await optimizeImage(file, 240, 0.85);
    el('ingImagePreview').src = pendingIngDataUrl;
    el('ingImagePreview').style.display = 'block';
    e.target.value = '';
  });

  el('ingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = el('ingId').value;
    const payload = {
      name_az: el('ingAz').value.trim(),
      name_en: el('ingEn').value.trim(),
      name_ru: el('ingRu').value.trim(),
      name_tr: el('ingTr').value.trim(),
      ...(pendingIngDataUrl ? { imageDataUrl: pendingIngDataUrl } : {}),
    };
    try {
      if (id) {
        await api(`/api/admin/ingredients/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const created = await api('/api/admin/ingredients', { method: 'POST', body: JSON.stringify(payload) });
        selectedIngredientIds.add(created.id);
      }
      el('ingModal').classList.remove('open');
      await loadAdminData();
      if (el('dishModal').classList.contains('open')) renderDishIngredientsPicker();
      showToast('İnqrediyent yadda saxlanıldı');
    } catch (err) {
      showToast(err.message);
    }
  });

  // Change Password
  el('changePwdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: el('curPwd').value,
          newPassword: el('newPwd').value,
        }),
      });
      el('curPwd').value = '';
      el('newPwd').value = '';
      showToast('Şifrə uğurla yeniləndi');
    } catch (err) {
      showToast(err.message);
    }
  });

  checkAuth();
})();
