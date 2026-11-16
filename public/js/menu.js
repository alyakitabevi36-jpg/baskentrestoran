(function () {
  const I18N = window.BASKENT_I18N;
  const urlParams = new URLSearchParams(window.location.search);
  let currentLang = urlParams.get('lang') || sessionStorage.getItem('baskent_lang') || 'az';
  if (!I18N[currentLang]) currentLang = 'az';

  let menuData = { categories: [], dishes: [] };
  let activeCategoryId = 'all';
  let searchQuery = '';
  let activeDishId = null;

  const el = (id) => document.getElementById(id);

  function t(key) {
    return (I18N[currentLang] && I18N[currentLang][key]) || I18N.az[key] || key;
  }

  function locField(obj, prefix) {
    return obj[`${prefix}_${currentLang}`] || obj[`${prefix}_az`] || '';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyStaticTranslations() {
    document.documentElement.lang = currentLang;
    el('headerSubtitle').textContent = t('subtitle');
    el('heroBadge').textContent = t('heroBadge');
    el('heroTitle').textContent = t('heroTitle');
    el('heroDesc').textContent = t('heroDesc');
    el('searchInput').placeholder = t('searchPlaceholder');
    el('backBtnLabel').textContent = t('backToMenu');
    el('ingredientsSectionTitle').textContent = t('ingredientsTitle');
    el('allergensSectionTitle').textContent = t('allergensTitle') + ':';
    el('footerNote').textContent = t('footerNote');

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.lang === currentLang);
    });
  }

  function renderCategories() {
    const bar = el('categoriesBar');
    let html = `<button class="cat-pill ${activeCategoryId === 'all' ? 'active' : ''}" data-cat="all">${escapeHtml(t('allCategories'))}</button>`;
    for (const cat of menuData.categories) {
      const isActive = String(activeCategoryId) === String(cat.id);
      html += `<button class="cat-pill ${isActive ? 'active' : ''}" data-cat="${cat.id}">${escapeHtml(locField(cat, 'name'))}</button>`;
    }
    bar.innerHTML = html;

    bar.querySelectorAll('.cat-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategoryId = btn.dataset.cat;
        renderCategories();
        renderMenu();
      });
    });
  }

  function renderMenu() {
    const container = el('menuContainer');
    const q = searchQuery.trim().toLowerCase();

    const visibleCategories =
      activeCategoryId === 'all'
        ? menuData.categories
        : menuData.categories.filter((c) => String(c.id) === String(activeCategoryId));

    let html = '';
    let totalShown = 0;

    for (const cat of visibleCategories) {
      const catDishes = menuData.dishes.filter((d) => {
        if (String(d.category_id) !== String(cat.id)) return false;
        if (!q) return true;
        const name = locField(d, 'name').toLowerCase();
        const desc = locField(d, 'desc').toLowerCase();
        const ingMatch = (d.ingredients || []).some((ing) => locField(ing, 'name').toLowerCase().includes(q));
        return name.includes(q) || desc.includes(q) || ingMatch;
      });

      if (catDishes.length === 0) continue;
      totalShown += catDishes.length;

      html += `<section class="category-section">
        <h3 class="category-title">${escapeHtml(locField(cat, 'name'))}</h3>
        <div class="dishes-grid">`;

      for (const dish of catDishes) {
        const primaryImg =
          (dish.images && dish.images[0] && dish.images[0].image_url) || '/uploads/seed/lule-kabab.svg';
        const isAvail = Boolean(dish.is_available);
        const priceStr = `${Number(dish.price_azn).toFixed(2)} ${t('currency')}`;
        const ingChips = (dish.ingredients || [])
          .slice(0, 4)
          .map(
            (ing) => `<span class="ing-mini-chip">
              ${ing.image_url ? `<img src="${escapeHtml(ing.image_url)}" alt="${escapeHtml(locField(ing, 'name'))}" loading="lazy" />` : ''}
              <span>${escapeHtml(locField(ing, 'name'))}</span>
            </span>`
          )
          .join('');

        html += `
          <article class="dish-card ${isAvail ? '' : 'unavailable'}" data-dish-id="${dish.id}">
            <div class="dish-img-wrap">
              <img src="${escapeHtml(primaryImg)}" alt="${escapeHtml(locField(dish, 'name'))}" loading="lazy" />
              <span class="dish-status-badge ${isAvail ? 'status-available' : 'status-unavailable'}">
                ${escapeHtml(isAvail ? t('available') : t('unavailable'))}
              </span>
              <span class="dish-price-badge">${escapeHtml(priceStr)}</span>
            </div>
            <div class="dish-body">
              <h4 class="dish-name">${escapeHtml(locField(dish, 'name'))}</h4>
              <p class="dish-desc">${escapeHtml(locField(dish, 'desc'))}</p>
              ${ingChips ? `<div class="dish-ing-preview">${ingChips}</div>` : ''}
            </div>
          </article>
        `;
      }

      html += `</div></section>`;
    }

    if (totalShown === 0) {
      html = `<div class="empty-state">${escapeHtml(t('noDishes'))}</div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.dish-card').forEach((card) => {
      card.addEventListener('click', () => {
        openDishDetail(Number(card.dataset.dishId), true);
      });
    });
  }

  function openDishDetail(dishId, pushHistory = false) {
    const dish = menuData.dishes.find((d) => Number(d.id) === Number(dishId));
    if (!dish) return;
    activeDishId = dish.id;

    if (pushHistory && window.location.pathname !== `/dish/${dish.id}`) {
      history.pushState({ dishId: dish.id }, '', `/dish/${dish.id}`);
    }

    const images = dish.images && dish.images.length > 0 ? dish.images : [{ image_url: '/uploads/seed/lule-kabab.svg' }];
    el('detailMainImg').src = images[0].image_url;
    el('detailMainImg').alt = locField(dish, 'name');

    const thumbsEl = el('detailThumbs');
    if (images.length > 1) {
      thumbsEl.style.display = 'flex';
      thumbsEl.innerHTML = images
        .map(
          (img, idx) => `<div class="gallery-thumb ${idx === 0 ? 'active' : ''}" data-src="${escapeHtml(img.image_url)}">
            <img src="${escapeHtml(img.image_url)}" alt="" />
          </div>`
        )
        .join('');
      thumbsEl.querySelectorAll('.gallery-thumb').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          el('detailMainImg').src = thumb.dataset.src;
          thumbsEl.querySelectorAll('.gallery-thumb').forEach((x) => x.classList.remove('active'));
          thumb.classList.add('active');
        });
      });
    } else {
      thumbsEl.style.display = 'none';
      thumbsEl.innerHTML = '';
    }

    const isAvail = Boolean(dish.is_available);
    const badge = el('detailStatusBadge');
    badge.className = `dish-status-badge ${isAvail ? 'status-available' : 'status-unavailable'}`;
    badge.textContent = isAvail ? t('available') : t('unavailable');

    el('detailTitle').textContent = locField(dish, 'name');
    el('detailPrice').textContent = `${Number(dish.price_azn).toFixed(2)} ${t('currency')}`;
    el('detailDesc').textContent = locField(dish, 'desc');

    const ings = dish.ingredients || [];
    if (ings.length > 0) {
      el('detailIngredientsWrap').style.display = 'block';
      el('detailIngredients').innerHTML = ings
        .map(
          (ing) => `<div class="ingredient-card">
            ${ing.image_url ? `<img src="${escapeHtml(ing.image_url)}" alt="${escapeHtml(locField(ing, 'name'))}" />` : ''}
            <span>${escapeHtml(locField(ing, 'name'))}</span>
          </div>`
        )
        .join('');
    } else {
      el('detailIngredientsWrap').style.display = 'none';
    }

    const allergens = locField(dish, 'allergens').trim();
    if (allergens) {
      el('detailAllergensBox').style.display = 'block';
      el('detailAllergensText').textContent = ' ' + allergens;
    } else {
      el('detailAllergensBox').style.display = 'none';
    }

    el('detailOverlay').classList.add('open');
    el('detailOverlay').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeDishDetail(pushHistory = true) {
    activeDishId = null;
    el('detailOverlay').classList.remove('open');
    el('detailOverlay').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (pushHistory && window.location.pathname.startsWith('/dish/')) {
      history.pushState({}, '', '/menu');
    }
  }

  async function loadMenu() {
    const res = await fetch('/api/menu');
    menuData = await res.json();
    renderCategories();
    renderMenu();

    // Check if URL is /dish/:id
    const match = window.location.pathname.match(/^\/dish\/(\d+)$/);
    if (match) {
      openDishDetail(Number(match[1]), false);
    }
  }

  // Event listeners
  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLang = btn.dataset.lang;
      sessionStorage.setItem('baskent_lang', currentLang);
      applyStaticTranslations();
      renderCategories();
      renderMenu();
      if (activeDishId) openDishDetail(activeDishId, false);
    });
  });

  el('searchInput').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderMenu();
  });

  el('closeDetailBtn').addEventListener('click', () => closeDishDetail(true));
  el('detailOverlay').addEventListener('click', (e) => {
    if (e.target === el('detailOverlay')) closeDishDetail(true);
  });

  window.addEventListener('popstate', () => {
    const match = window.location.pathname.match(/^\/dish\/(\d+)$/);
    if (match) {
      openDishDetail(Number(match[1]), false);
    } else {
      closeDishDetail(false);
    }
  });

  applyStaticTranslations();
  loadMenu();
})();
