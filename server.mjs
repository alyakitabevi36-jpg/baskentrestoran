import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, initDatabase } from './db.mjs';
import {
  COOKIE_NAME,
  createSessionToken,
  getAuthenticatedAdmin,
  hashPassword,
  verifyPassword,
} from './auth.mjs';

initDatabase();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DISH_UPLOADS_DIR = path.join(UPLOADS_DIR, 'dishes');
const ING_UPLOADS_DIR = path.join(UPLOADS_DIR, 'ingredients');

for (const dir of [UPLOADS_DIR, DISH_UPLOADS_DIR, ING_UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, cacheControl = 'public, max-age=3600') {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': cacheControl,
  });
  fs.createReadStream(filePath).pipe(res);
}

function readJsonBody(req, maxBytes = 15 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });
    req.on('error', reject);
  });
}

function saveBase64Image(dataUrl, targetDir, prefix) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|svg\+xml));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('INVALID_IMAGE_FORMAT');
  }
  const mime = match[1];
  const extMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
  };
  const ext = extMap[mime] || '.jpg';
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 8 * 1024 * 1024) {
    throw new Error('IMAGE_TOO_LARGE');
  }
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const fullPath = path.join(targetDir, filename);
  fs.writeFileSync(fullPath, buf);
  const rel = path.relative(UPLOADS_DIR, fullPath).split(path.sep).join('/');
  return `/uploads/${rel}`;
}

function deleteUploadIfLocal(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/uploads/')) return;
  if (imageUrl.startsWith('/uploads/seed/')) return; // preserve seed assets
  const rel = imageUrl.replace(/^\/uploads\//, '');
  const fullPath = path.resolve(UPLOADS_DIR, rel);
  if (fullPath.startsWith(UPLOADS_DIR) && fs.existsSync(fullPath)) {
    try {
      fs.unlinkSync(fullPath);
    } catch {
      // ignore cleanup error
    }
  }
}

function getFullMenuData(includeInactive = false) {
  const categories = db
    .prepare(
      includeInactive
        ? 'SELECT * FROM categories ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    )
    .all();

  const dishes = db
    .prepare('SELECT * FROM dishes ORDER BY sort_order ASC, id ASC')
    .all();

  const images = db
    .prepare('SELECT * FROM dish_images ORDER BY is_primary DESC, sort_order ASC, id ASC')
    .all();

  const dishIngredients = db
    .prepare(`
      SELECT di.dish_id, di.sort_order, i.*
      FROM dish_ingredients di
      JOIN ingredients i ON i.id = di.ingredient_id
      ORDER BY di.sort_order ASC, i.id ASC
    `)
    .all();

  const allIngredients = db.prepare('SELECT * FROM ingredients ORDER BY id ASC').all();

  const imgByDish = new Map();
  for (const img of images) {
    if (!imgByDish.has(img.dish_id)) imgByDish.set(img.dish_id, []);
    imgByDish.get(img.dish_id).push(img);
  }

  const ingByDish = new Map();
  for (const row of dishIngredients) {
    if (!ingByDish.has(row.dish_id)) ingByDish.set(row.dish_id, []);
    ingByDish.get(row.dish_id).push({
      id: row.id,
      name_az: row.name_az,
      name_en: row.name_en,
      name_ru: row.name_ru,
      name_tr: row.name_tr,
      image_url: row.image_url,
    });
  }

  const enrichedDishes = dishes.map((d) => ({
    ...d,
    images: imgByDish.get(d.id) || [],
    ingredients: ingByDish.get(d.id) || [],
  }));

  return {
    categories,
    dishes: enrichedDishes,
    ingredients: allIngredients,
  };
}

function requireAdmin(req, res) {
  const admin = getAuthenticatedAdmin(req);
  if (!admin) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return admin;
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(urlObj.pathname);
    const method = req.method;

    // 1. Page Routes
    if (method === 'GET' && pathname === '/') {
      res.writeHead(302, { Location: '/menu' });
      res.end();
      return;
    }

    if (method === 'GET' && (pathname === '/menu' || pathname.startsWith('/dish/'))) {
      sendFile(res, path.join(PUBLIC_DIR, 'menu.html'), 'no-cache');
      return;
    }

    if (method === 'GET' && pathname === '/admin') {
      sendFile(res, path.join(PUBLIC_DIR, 'admin.html'), 'no-cache');
      return;
    }

    // 2. Static & Upload Assets
    if (method === 'GET' && pathname.startsWith('/uploads/')) {
      const rel = pathname.replace(/^\/uploads\//, '');
      const safePath = path.resolve(UPLOADS_DIR, rel);
      if (!safePath.startsWith(UPLOADS_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      sendFile(res, safePath, 'public, max-age=86400');
      return;
    }

    if (method === 'GET' && (pathname.startsWith('/css/') || pathname.startsWith('/js/'))) {
      const safePath = path.resolve(PUBLIC_DIR, pathname.slice(1));
      if (!safePath.startsWith(PUBLIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      sendFile(res, safePath, 'no-cache');
      return;
    }

    // 3. Public Menu API
    if (method === 'GET' && pathname === '/api/menu') {
      const data = getFullMenuData(false);
      sendJson(res, 200, data);
      return;
    }

    // 4. Auth API
    if (method === 'GET' && pathname === '/api/auth/me') {
      const admin = getAuthenticatedAdmin(req);
      sendJson(res, 200, admin ? { authenticated: true, email: admin.email } : { authenticated: false });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readJsonBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        sendJson(res, 401, { error: 'E-poçt və ya şifrə yanlışdır.' });
        return;
      }
      const token = createSessionToken(user);
      const isHttps = req.headers['x-forwarded-proto'] === 'https';
      const cookieFlags = [
        `${COOKIE_NAME}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=604800',
        ...(isHttps ? ['Secure'] : []),
      ].join('; ');
      sendJson(res, 200, { ok: true, email: user.email }, { 'Set-Cookie': cookieFlags });
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` }
      );
      return;
    }

    if (method === 'POST' && pathname === '/api/auth/change-password') {
      const admin = requireAdmin(req, res);
      if (!admin) return;
      const body = await readJsonBody(req);
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (newPassword.length < 6) {
        sendJson(res, 400, { error: 'Yeni şifrə ən azı 6 simvoldan ibarət olmalıdır.' });
        return;
      }
      const user = db.prepare('SELECT * FROM admins WHERE id = ?').get(admin.id);
      if (!user || !verifyPassword(currentPassword, user.password_hash)) {
        sendJson(res, 400, { error: 'Cari şifrə yanlışdır.' });
        return;
      }
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), admin.id);
      sendJson(res, 200, { ok: true });
      return;
    }

    // 5. Admin API
    if (pathname.startsWith('/api/admin')) {
      const admin = requireAdmin(req, res);
      if (!admin) return;

      // Full admin data
      if (method === 'GET' && pathname === '/api/admin/data') {
        sendJson(res, 200, getFullMenuData(true));
        return;
      }

      // Categories CRUD
      if (method === 'POST' && pathname === '/api/admin/categories') {
        const b = await readJsonBody(req);
        const maxOrder = db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM categories').get().m;
        const info = db
          .prepare(
            'INSERT INTO categories (name_az, name_en, name_ru, name_tr, sort_order, is_active) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .run(
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            Number(b.sort_order ?? maxOrder + 1),
            b.is_active === false ? 0 : 1
          );
        sendJson(res, 201, { id: Number(info.lastInsertRowid) });
        return;
      }

      const catMatch = pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
      if (catMatch) {
        const catId = Number(catMatch[1]);
        if (method === 'PUT') {
          const b = await readJsonBody(req);
          db.prepare(
            'UPDATE categories SET name_az=?, name_en=?, name_ru=?, name_tr=?, sort_order=?, is_active=? WHERE id=?'
          ).run(
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            Number(b.sort_order ?? 0),
            b.is_active === false || b.is_active === 0 ? 0 : 1,
            catId
          );
          sendJson(res, 200, { ok: true });
          return;
        }
        if (method === 'DELETE') {
          db.prepare('DELETE FROM categories WHERE id = ?').run(catId);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      // Dishes Reorder
      if (method === 'POST' && pathname === '/api/admin/dishes/reorder') {
        const b = await readJsonBody(req);
        const orderedIds = Array.isArray(b.orderedIds) ? b.orderedIds : [];
        const stmt = db.prepare('UPDATE dishes SET sort_order = ? WHERE id = ?');
        orderedIds.forEach((id, index) => {
          stmt.run(index + 1, Number(id));
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      // Dishes Create
      if (method === 'POST' && pathname === '/api/admin/dishes') {
        const b = await readJsonBody(req);
        const maxOrder = db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM dishes WHERE category_id = ?')
          .get(Number(b.category_id)).m;

        const info = db
          .prepare(`
            INSERT INTO dishes (
              category_id, price_azn,
              name_az, name_en, name_ru, name_tr,
              desc_az, desc_en, desc_ru, desc_tr,
              allergens_az, allergens_en, allergens_ru, allergens_tr,
              is_available, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            Number(b.category_id),
            Number(b.price_azn || 0),
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            String(b.desc_az || '').trim(),
            String(b.desc_en || '').trim(),
            String(b.desc_ru || '').trim(),
            String(b.desc_tr || '').trim(),
            String(b.allergens_az || '').trim(),
            String(b.allergens_en || '').trim(),
            String(b.allergens_ru || '').trim(),
            String(b.allergens_tr || '').trim(),
            b.is_available === false || b.is_available === 0 ? 0 : 1,
            Number(b.sort_order ?? maxOrder + 1)
          );
        const dishId = Number(info.lastInsertRowid);

        // Link ingredients
        if (Array.isArray(b.ingredientIds)) {
          const insIng = db.prepare(
            'INSERT OR IGNORE INTO dish_ingredients (dish_id, ingredient_id, sort_order) VALUES (?, ?, ?)'
          );
          b.ingredientIds.forEach((ingId, idx) => insIng.run(dishId, Number(ingId), idx + 1));
        }

        // Upload new images if provided
        if (Array.isArray(b.newImages)) {
          const insImg = db.prepare(
            'INSERT INTO dish_images (dish_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
          );
          b.newImages.forEach((dataUrl, idx) => {
            const savedUrl = saveBase64Image(dataUrl, DISH_UPLOADS_DIR, `dish-${dishId}`);
            if (savedUrl) insImg.run(dishId, savedUrl, idx === 0 ? 1 : 0, idx + 1);
          });
        }

        sendJson(res, 201, { id: dishId });
        return;
      }

      // Dish Toggle Availability
      const toggleMatch = pathname.match(/^\/api\/admin\/dishes\/(\d+)\/toggle$/);
      if (toggleMatch && method === 'PATCH') {
        const dishId = Number(toggleMatch[1]);
        const current = db.prepare('SELECT is_available FROM dishes WHERE id = ?').get(dishId);
        if (!current) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        const nextVal = current.is_available ? 0 : 1;
        db.prepare('UPDATE dishes SET is_available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          nextVal,
          dishId
        );
        sendJson(res, 200, { is_available: nextVal });
        return;
      }

      // Dish Images Upload
      const dishImgMatch = pathname.match(/^\/api\/admin\/dishes\/(\d+)\/images$/);
      if (dishImgMatch && method === 'POST') {
        const dishId = Number(dishImgMatch[1]);
        const b = await readJsonBody(req);
        const images = Array.isArray(b.images) ? b.images : [];
        const existingCount = db
          .prepare('SELECT COUNT(*) as c FROM dish_images WHERE dish_id = ?')
          .get(dishId).c;
        const insImg = db.prepare(
          'INSERT INTO dish_images (dish_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
        );
        const created = [];
        images.forEach((dataUrl, idx) => {
          const savedUrl = saveBase64Image(dataUrl, DISH_UPLOADS_DIR, `dish-${dishId}`);
          if (savedUrl) {
            const isPrim = existingCount === 0 && idx === 0 ? 1 : 0;
            const info = insImg.run(dishId, savedUrl, isPrim, existingCount + idx + 1);
            created.push({ id: Number(info.lastInsertRowid), image_url: savedUrl, is_primary: isPrim });
          }
        });
        sendJson(res, 201, { images: created });
        return;
      }

      // Dish Update / Delete
      const dishMatch = pathname.match(/^\/api\/admin\/dishes\/(\d+)$/);
      if (dishMatch) {
        const dishId = Number(dishMatch[1]);
        if (method === 'PUT') {
          const b = await readJsonBody(req);
          db.prepare(`
            UPDATE dishes SET
              category_id=?, price_azn=?,
              name_az=?, name_en=?, name_ru=?, name_tr=?,
              desc_az=?, desc_en=?, desc_ru=?, desc_tr=?,
              allergens_az=?, allergens_en=?, allergens_ru=?, allergens_tr=?,
              is_available=?, sort_order=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?
          `).run(
            Number(b.category_id),
            Number(b.price_azn || 0),
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            String(b.desc_az || '').trim(),
            String(b.desc_en || '').trim(),
            String(b.desc_ru || '').trim(),
            String(b.desc_tr || '').trim(),
            String(b.allergens_az || '').trim(),
            String(b.allergens_en || '').trim(),
            String(b.allergens_ru || '').trim(),
            String(b.allergens_tr || '').trim(),
            b.is_available === false || b.is_available === 0 ? 0 : 1,
            Number(b.sort_order ?? 0),
            dishId
          );

          if (Array.isArray(b.ingredientIds)) {
            db.prepare('DELETE FROM dish_ingredients WHERE dish_id = ?').run(dishId);
            const insIng = db.prepare(
              'INSERT OR IGNORE INTO dish_ingredients (dish_id, ingredient_id, sort_order) VALUES (?, ?, ?)'
            );
            b.ingredientIds.forEach((ingId, idx) => insIng.run(dishId, Number(ingId), idx + 1));
          }

          if (Array.isArray(b.newImages) && b.newImages.length > 0) {
            const existingCount = db
              .prepare('SELECT COUNT(*) as c FROM dish_images WHERE dish_id = ?')
              .get(dishId).c;
            const insImg = db.prepare(
              'INSERT INTO dish_images (dish_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
            );
            b.newImages.forEach((dataUrl, idx) => {
              const savedUrl = saveBase64Image(dataUrl, DISH_UPLOADS_DIR, `dish-${dishId}`);
              if (savedUrl) {
                insImg.run(dishId, savedUrl, existingCount === 0 && idx === 0 ? 1 : 0, existingCount + idx + 1);
              }
            });
          }

          sendJson(res, 200, { ok: true });
          return;
        }
        if (method === 'DELETE') {
          const imgs = db.prepare('SELECT image_url FROM dish_images WHERE dish_id = ?').all(dishId);
          for (const img of imgs) deleteUploadIfLocal(img.image_url);
          db.prepare('DELETE FROM dishes WHERE id = ?').run(dishId);
          sendJson(res, 200, { ok: true });
          return;
        }
      }

      // Image Primary / Delete
      const imgPrimMatch = pathname.match(/^\/api\/admin\/images\/(\d+)\/primary$/);
      if (imgPrimMatch && method === 'PATCH') {
        const imgId = Number(imgPrimMatch[1]);
        const img = db.prepare('SELECT dish_id FROM dish_images WHERE id = ?').get(imgId);
        if (!img) {
          sendJson(res, 404, { error: 'Not found' });
          return;
        }
        db.prepare('UPDATE dish_images SET is_primary = 0 WHERE dish_id = ?').run(img.dish_id);
        db.prepare('UPDATE dish_images SET is_primary = 1 WHERE id = ?').run(imgId);
        sendJson(res, 200, { ok: true });
        return;
      }

      const imgDelMatch = pathname.match(/^\/api\/admin\/images\/(\d+)$/);
      if (imgDelMatch && method === 'DELETE') {
        const imgId = Number(imgDelMatch[1]);
        const img = db.prepare('SELECT * FROM dish_images WHERE id = ?').get(imgId);
        if (img) {
          deleteUploadIfLocal(img.image_url);
          db.prepare('DELETE FROM dish_images WHERE id = ?').run(imgId);
          if (img.is_primary) {
            const nextImg = db
              .prepare('SELECT id FROM dish_images WHERE dish_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1')
              .get(img.dish_id);
            if (nextImg) db.prepare('UPDATE dish_images SET is_primary = 1 WHERE id = ?').run(nextImg.id);
          }
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      // Ingredients CRUD
      if (method === 'POST' && pathname === '/api/admin/ingredients') {
        const b = await readJsonBody(req);
        let imageUrl = '/uploads/seed/ing-herbs.svg';
        if (b.imageDataUrl) {
          imageUrl = saveBase64Image(b.imageDataUrl, ING_UPLOADS_DIR, 'ing');
        }
        const info = db
          .prepare('INSERT INTO ingredients (name_az, name_en, name_ru, name_tr, image_url) VALUES (?, ?, ?, ?, ?)')
          .run(
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            imageUrl
          );
        const created = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(Number(info.lastInsertRowid));
        sendJson(res, 201, created);
        return;
      }

      const ingMatch = pathname.match(/^\/api\/admin\/ingredients\/(\d+)$/);
      if (ingMatch) {
        const ingId = Number(ingMatch[1]);
        if (method === 'PUT') {
          const b = await readJsonBody(req);
          const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingId);
          if (!existing) {
            sendJson(res, 404, { error: 'Not found' });
            return;
          }
          let imageUrl = existing.image_url;
          if (b.imageDataUrl) {
            deleteUploadIfLocal(existing.image_url);
            imageUrl = saveBase64Image(b.imageDataUrl, ING_UPLOADS_DIR, 'ing');
          }
          db.prepare('UPDATE ingredients SET name_az=?, name_en=?, name_ru=?, name_tr=?, image_url=? WHERE id=?').run(
            String(b.name_az || '').trim(),
            String(b.name_en || b.name_az || '').trim(),
            String(b.name_ru || b.name_az || '').trim(),
            String(b.name_tr || b.name_az || '').trim(),
            imageUrl,
            ingId
          );
          const updated = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingId);
          sendJson(res, 200, updated);
          return;
        }
        if (method === 'DELETE') {
          const existing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingId);
          if (existing) deleteUploadIfLocal(existing.image_url);
          db.prepare('DELETE FROM ingredients WHERE id = ?').run(ingId);
          sendJson(res, 200, { ok: true });
          return;
        }
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (err) {
    console.error('Server error:', err);
    if (err.message === 'PAYLOAD_TOO_LARGE' || err.message === 'IMAGE_TOO_LARGE') {
      sendJson(res, 413, { error: 'Şəkil faylı çox böyükdür.' });
      return;
    }
    if (err.message === 'INVALID_IMAGE_FORMAT') {
      sendJson(res, 400, { error: 'Yalnız PNG, JPG, WEBP və ya SVG şəkillər qəbul olunur.' });
      return;
    }
    sendJson(res, 500, { error: 'Server xətası baş verdi.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`BAŞKENT RESTORAN server listening on http://${HOST}:${PORT}`);
});
