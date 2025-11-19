# Radiology Dose Management Backend

Backend API untuk sistem manajemen dosis radiologi yang terintegrasi dengan Orthanc PACS.

## Fitur

- 🔗 Koneksi ke Orthanc PACS server
- 📊 Ekstraksi data dosis CTDIvol dan Total DLP
- 💾 Penyimpanan data ke database
- 📈 Pelaporan dan ekspor ke Excel
- 🔍 Multiple extraction methods (SR, Localizer, CT Series)

## Instalasi

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Setup environment variables:
```bash
cp .env.example .env
# Edit .env file dengan konfigurasi Anda
```

3. Jalankan server:
```bash
python main.py
```

## API Endpoints

### Patient Management
- `GET /api/v1/patient-list` - Ambil daftar studi CT dari Orthanc
- `GET /api/v1/orthanc-status` - Cek status koneksi Orthanc

### Dose Extraction
- `POST /api/v1/extract-dose` - Ekstrak informasi dosis dari studi
- `POST /api/v1/save-dose` - Simpan data dosis ke database
- `POST /api/v1/extract-and-save-dose` - Ekstrak dan simpan dalam satu operasi

### Reporting
- `GET /api/v1/reporting-data` - Ambil data pelaporan dengan filter
- `GET /api/v1/export/excel` - Ekspor data ke file Excel
- `GET /api/v1/statistics` - Statistik detail data dosis

## Konfigurasi

Edit file `.env` untuk mengatur:

- `ORTHANC_URL`: URL server Orthanc
- `ORTHANC_USER`: Username Orthanc
- `ORTHANC_PASSWORD`: Password Orthanc
- `DATABASE_URL`: URL database (SQLite/PostgreSQL)

## Dokumentasi API

Setelah server berjalan, akses dokumentasi interaktif di:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc