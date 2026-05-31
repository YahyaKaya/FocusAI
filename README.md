# Focus AI — Kişiselleştirilmiş Öğrenim Optimizasyonu

> **Necmettin Erbakan Üniversitesi — Seydişehir Ahmet Cengiz Mühendislik Fakültesi**  
> Bilgisayar Mühendisliği Bölümü — Lisans Bitirme Projesi  
> **Öğrenci:** Yahya Kaya (22370031036)  
> **Danışman:** Dr. Öğr. Üyesi Hasan Serdar  
> **Yıl:** 2026

---

Focus AI; odak seanslarını takip eden, yapay zeka destekli kişiselleştirilmiş verimlilik önerileri sunan bir mobil uygulamadır. Kullanıcılar her seans öncesinde ve sonrasında kısa anketler doldurur; uygulama bu verileri ve pasif sinyalleri (bildirim sayısı, dikkat dağılma tıklamaları, telefon kilit açmaları) analiz ederek kullanıcıya en verimli çalışma koşullarını önerir.

---

## Proje Yapısı

```
focus-ai-mobile-v2/
├── mobile/          # Expo React Native mobil uygulama
├── backend/         # Fastify REST API
├── ml-service/      # FastAPI makine öğrenimi servisi
└── train/           # Veri üretimi, model eğitimi ve analiz betikleri
```

---

## `mobile/` — Mobil Uygulama

**Teknolojiler:** React Native, Expo SDK 54, Expo Router, TypeScript, NativeWind (Tailwind CSS), i18next

Kullanıcının doğrudan etkileşime girdiği mobil arayüz. Türkçe ve İngilizce dil desteği mevcuttur; tema (açık/koyu) ve dil tercihi cihazda saklanır.

### Ekranlar

| Ekran                | Açıklama                                                                 |
| -------------------- | ------------------------------------------------------------------------ |
| `login.tsx`          | Kullanıcı girişi                                                         |
| `register.tsx`       | Yeni kullanıcı kaydı                                                     |
| `index.tsx`          | Ana sayfa — aktif seans durumu ve genel özet                             |
| `quick-start.tsx`    | Hızlı seans başlatma — emoji slider'larla ön anket doldurma              |
| `pre-survey.tsx`     | Tam seans öncesi anket (ruh hali, enerji, motivasyon, ortam, müzik türü) |
| `session.tsx`        | Aktif seans zamanlayıcısı, duraklatma ve bitirme kontrolü                |
| `post-survey.tsx`    | Seans sonrası anket (odak, verimlilik, memnuniyet, dikkat dağınıklığı)   |
| `history.tsx`        | Geçmiş seansların listesi                                                |
| `session-detail.tsx` | Tek seans detay görünümü                                                 |
| `insights.tsx`       | Kişisel istatistikler ve yapay zeka önerileri                            |
| `settings.tsx`       | Dil, tema ve bildirim izni ayarları                                      |

### Kütüphane Katmanı (`lib/`)

| Dosya                       | Açıklama                                                |
| --------------------------- | ------------------------------------------------------- |
| `api.ts`                    | Backend ile tüm HTTP iletişimi                          |
| `supabase.ts`               | Supabase istemcisi (kimlik doğrulama için)              |
| `SessionContext.tsx`        | Aktif seans durumunu uygulama genelinde yöneten context |
| `ThemeContext.tsx`          | Açık/koyu tema yönetimi                                 |
| `i18n.ts`                   | Çok dil desteği kurulumu (Türkçe / İngilizce)           |
| `useSessionNotification.ts` | Seans bildirimleri için hook                            |

### Kurulum

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

`.env` dosyasında şunlar gereklidir:

```
EXPO_PUBLIC_API_URL=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

---

## `backend/` — REST API

**Teknolojiler:** Node.js, Fastify v4, Prisma ORM 5, PostgreSQL (Supabase), JWT

Mobil uygulamanın tüm veri işlemlerini yöneten ana API sunucusu. Kimlik doğrulama, seans kayıtları, anket verileri ve ML servisinden gelen önerilerin iletimini sağlar.

### API Rotaları

| Rota                           | Açıklama                                        |
| ------------------------------ | ----------------------------------------------- |
| `GET /health`                  | Servis sağlık kontrolü                          |
| `GET /debug`                   | Ortam değişkeni durumu (geliştirme)             |
| `POST /auth/register`          | Yeni kullanıcı kaydı                            |
| `POST /auth/login`             | Giriş ve JWT token üretimi                      |
| `GET /sessions`                | Kullanıcının seanslarını listele                |
| `POST /sessions`               | Yeni seans oluştur                              |
| `PATCH /sessions/:id`          | Seans güncelle (duraklatma, bitirme, terk etme) |
| `POST /surveys/pre`            | Seans öncesi anket kaydet                       |
| `POST /surveys/post`           | Seans sonrası anket kaydet                      |
| `POST /signals`                | Pasif sinyal verisi kaydet                      |
| `GET /recommendations/:userId` | ML servisinden öneri çek ve döndür              |

### Kurulum

```bash
cd backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

`.env` dosyasında şunlar gereklidir:

```
DATABASE_URL=
DIRECT_URL=
JWT_SECRET=
SUPABASE_URL=
```

---

## `ml-service/` — Makine Öğrenimi Servisi

**Teknolojiler:** Python, FastAPI, XGBoost, LightGBM, scikit-learn, Supabase Python SDK

Seans verilerini Supabase'den çekip XGBoost modeli eğiten ve her kullanıcı için kişiselleştirilmiş seans önerileri üreten bağımsız bir Python servisi.

### Çalışma Mantığı

1. **Başlangıçta model eğitimi:** Servis ayağa kalktığında veritabanındaki tüm seansları çeker ve global bir XGBoost modeli eğitir.
2. **Özellik mühendisliği:** Seans süresi, mola oranı, duraklatma sıklığı, pasif sinyaller ve ön anket verileri özellik olarak kullanılır.
3. **Öneri üretimi:** Farklı süre, ortam ve seans türü kombinasyonları denenir; en yüksek tahmini verimlilik skoruna sahip kombinasyon önerilir.
4. **Geri eğitim:** `POST /retrain` ile model yeni verilerle güncellenebilir.

### Endpoint'ler

| Endpoint                        | Açıklama                           |
| ------------------------------- | ---------------------------------- |
| `GET /health`                   | Servis sağlık kontrolü             |
| `POST /generate-recommendation` | Kullanıcıya özel öneri üret        |
| `POST /retrain`                 | Modeli yeni verilerle yeniden eğit |

### Kurulum

```bash
cd ml-service
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

`.env` dosyasında şunlar gereklidir:

```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

---

## `train/` — Veri Üretimi ve Model Araştırması

**Teknolojiler:** Python, pandas, NumPy, XGBoost, LightGBM, scikit-learn

Geliştirme ve akademik analiz için kullanılan veri üretimi, model eğitimi ve SQL analiz betiklerini içerir. Prodüksiyon ortamında çalışmaz; araştırma ve tez çalışması amaçlıdır.

### Kullanım

```bash
cd train
pip install -r requirements.txt
cp .env.example .env
python ml_setup_check.py   # Ortamı kontrol et
python data_generator.py   # CSV dosyalarını üret
python load_to_supabase.py # Supabase'e yükle
python ml_pipeline.py      # Modeli eğit ve önerileri üret
```

`.env` dosyasında şunlar gereklidir:

```
SUPABASE_URL=
SUPABASE_KEY=
```

---

## Genel Mimari

```
[Mobil Uygulama — Expo]
         │
         │  REST API (JWT)
         ▼
[Backend — Fastify / Node.js]
         │                      │
         │  Veri kayıt/okuma    │  Öneri isteği
         ▼                      ▼
[Supabase / PostgreSQL]   [ML Servisi — FastAPI / Python]
         │                      │
         └──────────────────────┘
            Model eğitimi için
            veri çekme (başlangıçta)
```

---

## Ortam Değişkenleri

Her klasörde bir `.env.example` dosyası bulunur. Kurulum öncesinde bu dosyayı `.env` olarak kopyalayın ve gerekli değerleri Supabase dashboard'undan alarak doldurun. `.env` dosyaları `.gitignore` tarafından korunur ve versiyona dahil edilmez.

---

## Android APK — Kurulum

> **Yalnızca Android içindir.** iOS desteklenmemektedir.

Uygulamayı iki yoldan yükleyebilirsiniz:

### Yöntem 1 — Repo'daki APK (Önerilen)

1. Bu repodan **`FocusAI.apk`** dosyasını Android cihazınıza indirin.

2. **Bilinmeyen kaynaklara izin verin.**  
   Android, Play Store dışından uygulama yüklemeyi varsayılan olarak engeller:
   - **Android 8 ve üzeri:** Ayarlar → Uygulamalar → Özel uygulama erişimi → Bilinmeyen uygulamaları yükle → kullandığınız tarayıcı veya Dosyalar uygulaması → İzin ver
   - **Android 7 ve altı:** Ayarlar → Güvenlik → Bilinmeyen kaynaklar → Aç

3. Dosyalar uygulamasından `Downloads` klasörüne gidin, **`FocusAI.apk`** dosyasına dokunun.

4. **"Yükle"** butonuna basın ve kurulumun tamamlanmasını bekleyin.

5. Uygulamayı açın ve hesap oluşturarak kullanmaya başlayın.

### Yöntem 2 — Expo Build Linki

Alternatif olarak aşağıdaki Expo linkinden de APK indirilebilir:  
[https://expo.dev/accounts/redlight77/projects/focus-ai-yahya/builds/8232dd00-3626-496f-a8cc-170da47f9852](https://expo.dev/accounts/redlight77/projects/focus-ai-yahya/builds/8232dd00-3626-496f-a8cc-170da47f9852)

Sayfayı Android cihazınızda açıp **Download** butonuna basın, ardından yukarıdaki 2–5. adımları uygulayın.

> **Not:** Kurulum sırasında "Bu uygulama zararlı olabilir" uyarısı çıkabilir. Bu, Play Store onayı olmayan tüm harici APK'lar için Android'in standart uyarısıdır. "Yine de yükle" seçeneğiyle devam edebilirsiniz.

---

## Kaynak Kodu

[https://github.com/YahyaKaya/FocusAI](https://github.com/YahyaKaya/FocusAI)
