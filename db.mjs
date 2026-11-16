import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './auth.mjs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'baskent.db');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_az TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_tr TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS dishes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      price_azn REAL NOT NULL DEFAULT 0,
      name_az TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_tr TEXT NOT NULL,
      desc_az TEXT DEFAULT '',
      desc_en TEXT DEFAULT '',
      desc_ru TEXT DEFAULT '',
      desc_tr TEXT DEFAULT '',
      allergens_az TEXT DEFAULT '',
      allergens_en TEXT DEFAULT '',
      allergens_ru TEXT DEFAULT '',
      allergens_tr TEXT DEFAULT '',
      is_available INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS dish_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dish_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_az TEXT NOT NULL,
      name_en TEXT NOT NULL,
      name_ru TEXT NOT NULL,
      name_tr TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS dish_ingredients (
      dish_id INTEGER NOT NULL,
      ingredient_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (dish_id, ingredient_id),
      FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE
    );
  `);

  seedInitialData();
}

function seedInitialData() {
  // Seed default admin if none exists
  const adminCount = db.prepare('SELECT COUNT(*) as c FROM admins').get().c;
  if (adminCount === 0) {
    const defaultEmail = process.env.ADMIN_EMAIL || 'admin@baskent.az';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'Baskent2025!';
    db.prepare('INSERT INTO admins (email, password_hash) VALUES (?, ?)').run(
      defaultEmail.toLowerCase(),
      hashPassword(defaultPassword)
    );
  }

  // Seed categories if none exist
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get().c;
  if (catCount > 0) return;

  const insertCat = db.prepare(
    'INSERT INTO categories (name_az, name_en, name_ru, name_tr, sort_order, is_active) VALUES (?, ?, ?, ?, ?, 1)'
  );

  const cats = [
    ['Kabablar', 'Kebabs', 'Шашлыки и кебабы', 'Kebaplar', 1],
    ['Əsas yeməklər', 'Main Courses', 'Основные блюда', 'Ana Yemekler', 2],
    ['Şorbalar', 'Soups', 'Супы', 'Çorbalar', 3],
    ['Salatlar', 'Salads', 'Салаты', 'Salatalar', 4],
    ['Pizzalar', 'Pizzas', 'Пиццы', 'Pizzalar', 5],
    ['Desertlər', 'Desserts', 'Десерты', 'Tatlılar', 6],
    ['İçkilər', 'Beverages', 'Напитки', 'İçecekler', 7],
  ];
  const catIds = cats.map((c) => Number(insertCat.run(...c).lastInsertRowid));

  // Seed ingredients
  const insertIng = db.prepare(
    'INSERT INTO ingredients (name_az, name_en, name_ru, name_tr, image_url) VALUES (?, ?, ?, ?, ?)'
  );
  const ingList = {
    meat: Number(insertIng.run('Quzu və mal əti', 'Lamb & Beef', 'Баранина и говядина', 'Kuzu ve dana eti', '/uploads/seed/ing-meat.svg').lastInsertRowid),
    tomato: Number(insertIng.run('Pomidor', 'Tomato', 'Помидор', 'Domates', '/uploads/seed/ing-tomato.svg').lastInsertRowid),
    onion: Number(insertIng.run('Soğan', 'Onion', 'Лук', 'Soğan', '/uploads/seed/ing-onion.svg').lastInsertRowid),
    pepper: Number(insertIng.run('Yaşıl bibər', 'Green Pepper', 'Зелёный перец', 'Yeşil biber', '/uploads/seed/ing-pepper.svg').lastInsertRowid),
    cheese: Number(insertIng.run('Pendir', 'Cheese', 'Сыр', 'Peynir', '/uploads/seed/ing-cheese.svg').lastInsertRowid),
    herbs: Number(insertIng.run('Təzə göyərti', 'Fresh Herbs', 'Свежая зелень', 'Taze yeşillik', '/uploads/seed/ing-herbs.svg').lastInsertRowid),
    dough: Number(insertIng.run('Xəmir / Lavaş', 'Dough / Lavash', 'Тесто / Лаваш', 'Hamur / Lavaş', '/uploads/seed/ing-dough.svg').lastInsertRowid),
    rice: Number(insertIng.run('Basmati düyü', 'Basmati Rice', 'Рис басмати', 'Basmati pirinç', '/uploads/seed/ing-rice.svg').lastInsertRowid),
    lentil: Number(insertIng.run('Qırmızı mərci', 'Red Lentil', 'Красная чечевица', 'Kırmızı mercimek', '/uploads/seed/ing-lentil.svg').lastInsertRowid),
    walnut: Number(insertIng.run('Qoz ləpəsi', 'Walnut', 'Грецкий орех', 'Ceviz içi', '/uploads/seed/ing-walnut.svg').lastInsertRowid),
    honey: Number(insertIng.run('Təbii bal', 'Natural Honey', 'Натуральный мёд', 'Doğal bal', '/uploads/seed/ing-honey.svg').lastInsertRowid),
    pomegranate: Number(insertIng.run('Təzə nar', 'Fresh Pomegranate', 'Свежий гранат', 'Taze nar', '/uploads/seed/ing-pomegranate.svg').lastInsertRowid),
  };

  // Seed dishes
  const insertDish = db.prepare(`
    INSERT INTO dishes (
      category_id, price_azn,
      name_az, name_en, name_ru, name_tr,
      desc_az, desc_en, desc_ru, desc_tr,
      allergens_az, allergens_en, allergens_ru, allergens_tr,
      is_available, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);
  const insertImg = db.prepare(
    'INSERT INTO dish_images (dish_id, image_url, is_primary, sort_order) VALUES (?, ?, ?, ?)'
  );
  const insertDishIng = db.prepare(
    'INSERT INTO dish_ingredients (dish_id, ingredient_id, sort_order) VALUES (?, ?, ?)'
  );

  const sampleDishes = [
    {
      catIdx: 0,
      price: 16.5,
      names: ['Başkent Lülə Kabab', 'Baskent Lula Kebab', 'Люля-кебаб Башкент', 'Başkent Adana / Lülə Kebap'],
      descs: [
        'Seçilmiş quzu ətindən hazırlanmış, manqalda közlənmiş ənənəvi lülə kabab. Lavaş, sumaxlı soğan və közlənmiş pomidor ilə servis olunur.',
        'Traditional charcoal-grilled minced lamb kebab served with warm lavash, sumac onions, and roasted tomatoes.',
        'Традиционный люля-кебаб из отборной баранины на углях. Подаётся с лавашом, луком с сумахом и запечёнными томатами.',
        'Seçkin kuzu etinden odun ateşinde pişirilmiş geleneksel kebap. Lavaş, sumaklı soğan ve közlenmiş domates ile servis edilir.',
      ],
      allergens: ['Qluten (lavaş)', 'Gluten (lavash)', 'Глютен (лаваш)', 'Gluten (lavaş)'],
      images: ['/uploads/seed/lule-kabab.svg', '/uploads/seed/tike-kabab.svg'],
      ings: [ingList.meat, ingList.onion, ingList.tomato, ingList.herbs, ingList.dough],
      order: 1,
    },
    {
      catIdx: 0,
      price: 19.0,
      names: ['Quzu Tikə Kabab', 'Lamb Shish Kebab', 'Шашлык из баранины', 'Kuzu Şiş Kebap'],
      descs: [
        'Xüsusi ədviyyatlarda marinə edilmiş yumşaq quzu əti tikələri, manqalda mükəmməl bişirilmiş.',
        'Tender lamb cubes marinated in signature spices and grilled over natural charcoal.',
        'Нежные кусочки баранины в фирменном маринаде, приготовленные на древесных углях.',
        'Özel baharatlarla marine edilmiş, odun közünde pişirilmiş yumuşak kuzu şiş.',
      ],
      allergens: ['', '', '', ''],
      images: ['/uploads/seed/tike-kabab.svg'],
      ings: [ingList.meat, ingList.tomato, ingList.pepper, ingList.onion],
      order: 2,
    },
    {
      catIdx: 1,
      price: 24.0,
      names: ['Şah Plov', 'Shah Pilaf', 'Шах Плов', 'Şah Pilavı'],
      descs: [
        'Xırtıldayan lavaş qabığında zəfəranlı basmati düyü, quzu əti, şabalıd və quru meyvələrlə hazırlanan Azərbaycan mətbəxinin tacı.',
        'The crown jewel of Azerbaijani cuisine: saffron basmati rice, tender lamb, chestnuts, and dried fruits baked in crispy lavash.',
        'Корона азербайджанской кухни: шафранный рис басмати с бараниной, каштанами и сухофруктами в хрустящем лаваше.',
        'Çıtır lavaş içinde safranlı basmati pirinç, kuzu eti, kestane ve kuru meyvelerle hazırlanan Azerbaycan mutfağının tacı.',
      ],
      allergens: ['Qluten, süd məhsulları', 'Gluten, dairy', 'Глютен, молочные продукты', 'Gluten, süt ürünleri'],
      images: ['/uploads/seed/sah-plov.svg'],
      ings: [ingList.rice, ingList.meat, ingList.dough, ingList.onion],
      order: 1,
    },
    {
      catIdx: 2,
      price: 7.5,
      names: ['Mərci Şorbası', 'Red Lentil Soup', 'Чечевичный суп', 'Mercimek Çorbası'],
      descs: [
        'Qırmızı mərcidən hazırlanan kremli şorba, təzə limon və qızardılmış çörək dilimləri ilə.',
        'Velvety red lentil soup served with fresh lemon and crispy croutons.',
        'Нежный крем-суп из красной чечевицы с долькой лимона и хрустящими гренками.',
        'Taze limon ve kıtır ekmek eşliğinde süzme kırmızı mercimek çorbası.',
      ],
      allergens: ['', '', '', ''],
      images: ['/uploads/seed/merci-sorbasi.svg'],
      ings: [ingList.lentil, ingList.onion, ingList.herbs],
      order: 1,
    },
    {
      catIdx: 3,
      price: 9.0,
      names: ['Çoban Salatı (Pendirli)', 'Shepherd Salad with Cheese', 'Салат Чобан с сыром', 'Peynirli Çoban Salatası'],
      descs: [
        'Təzə bağ pomidoru, xırtıldayan xiyar, yaşıl bibər, qırmızı soğan, göyərti və ağ pendir ilə.',
        'Fresh garden tomatoes, crisp cucumbers, green pepper, red onion, herbs, and white cheese.',
        'Свежие томаты, хрустящие огурцы, зелёный перец, красный лук, зелень и белый сыр.',
        'Taze domates, salatalık, yeşil biber, kırmızı soğan, yeşillik ve beyaz peynir ile.',
      ],
      allergens: ['Süd məhsulları (pendir)', 'Dairy (cheese)', 'Молочные продукты (сыр)', 'Süt ürünleri (peynir)'],
      images: ['/uploads/seed/coban-salati.svg'],
      ings: [ingList.tomato, ingList.pepper, ingList.onion, ingList.herbs, ingList.cheese],
      order: 1,
    },
    {
      catIdx: 4,
      price: 17.0,
      names: ['Marqarita Pizza', 'Margherita Pizza', 'Пицца Маргарита', 'Margarita Pizza'],
      descs: [
        'İtalyan üsulu nazik xəmir üzərində San Marzano pomidor sousu, mozzarella pendiri və təzə reyhan.',
        'Artisanal thin crust topped with rich tomato sauce, melted mozzarella, and fresh basil.',
        'Тонкое тесто с томатным соусом, нежной моцареллой и свежим базиликом.',
        'İnce hamur üzerinde özel domates sosu, mozzarella peyniri ve taze fesleğen.',
      ],
      allergens: ['Qluten, süd məhsulları', 'Gluten, dairy', 'Глютен, молочные продукты', 'Gluten, süt ürünleri'],
      images: ['/uploads/seed/marqarita-pizza.svg'],
      ings: [ingList.dough, ingList.tomato, ingList.cheese, ingList.herbs],
      order: 1,
    },
    {
      catIdx: 5,
      price: 8.5,
      names: ['Bakı Paxlavası', 'Baku Baklava', 'Бакинская пахлава', 'Bakü Baklavası'],
      descs: [
        'Əl açması nazik qatlar, bol qoz ləpəsi, kərə yağı və zəfəranlı bal şərbəti ilə hazırlanan ənənəvi şirniyyat.',
        'Hand-rolled flaky pastry layered with walnuts, butter, and saffron-infused honey syrup.',
        'Традиционная слоёная пахлава с грецкими орехами, сливочным маслом и медово-шафранным сиропом.',
        'El açması ince katlar, bol ceviz içi, tereyağı ve safranlı bal şerbeti ile hazırlanan geleneksel tatlı.',
      ],
      allergens: ['Qluten, qoz, süd məhsulları', 'Gluten, tree nuts, dairy', 'Глютен, орехи, молочные продукты', 'Gluten, ceviz, süt ürünleri'],
      images: ['/uploads/seed/paxlava.svg'],
      ings: [ingList.dough, ingList.walnut, ingList.honey],
      order: 1,
    },
    {
      catIdx: 6,
      price: 6.5,
      names: ['Təzə Sıxılmış Nar Şirəsi', 'Fresh Pomegranate Juice', 'Свежевыжатый гранатовый сок', 'Taze Sıkılmış Nar Suyu'],
      descs: [
        '100% təbii, şəkər əlavəsiz, sifariş anında sıxılan Göyçay narının şirəsi.',
        '100% natural, freshly pressed Azerbaijani pomegranate juice with no added sugar.',
        '100% натуральный свежевыжатый гранатовый сок без добавления сахара.',
        'Şeker ilavesiz, sipariş anında sıkılan %100 doğal taze nar suyu.',
      ],
      allergens: ['', '', '', ''],
      images: ['/uploads/seed/nar-siresi.svg'],
      ings: [ingList.pomegranate],
      order: 1,
    },
  ];

  for (const d of sampleDishes) {
    const dishId = Number(
      insertDish.run(
        catIds[d.catIdx],
        d.price,
        ...d.names,
        ...d.descs,
        ...d.allergens,
        d.order
      ).lastInsertRowid
    );
    d.images.forEach((imgUrl, idx) => {
      insertImg.run(dishId, imgUrl, idx === 0 ? 1 : 0, idx + 1);
    });
    d.ings.forEach((ingId, idx) => {
      insertDishIng.run(dishId, ingId, idx + 1);
    });
  }
}
