<div align="center">
  <h1 align="center">C I B Y // EXTRACTOR</h1>
  <p align="center">
    <strong>A CYBERNETIC MEDIA EXTRACTION PROTOCOL</strong>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/STATUS-ACTIVE-ff003c?style=for-the-badge" alt="Status" />
    <img src="https://img.shields.io/badge/PLATFORM-WINDOWS-050505?style=for-the-badge&logo=windows&logoColor=white&color=050505" alt="Platform" />
    <img src="https://img.shields.io/badge/TECH-ELECTRON-47848F?style=for-the-badge&logo=electron&logoColor=white&color=050505" alt="Tech" />
  </p>
</div>

<br />

> **CIBY** is a high-performance, unapologetically dark, and aggressive media downloader built with Electron, yt-dlp, and ffmpeg. It bypasses conventional UI norms to deliver a pure, industrial-grade extraction experience for YouTube, Spotify, and SoundCloud.

---

## ⚡ FEATURES // ÖZELLİKLER

* **[TR]** **Karanlık & Endüstriyel Tasarım:** "Slop" tasarımlara meydan okuyan, siberpunk ve glitch efektleriyle bezenmiş şık bir arayüz.
* **[TR]** **Çoklu Hedef Desteği:** YouTube ve SoundCloud'dan doğrudan indirme; Spotify linklerinden otomatik şarkı tespiti ve en yüksek kalitede arka planda eşleştirme.
* **[TR]** **Format & Kalite Özgürlüğü:** Videoları (Highest MP4) veya ses dosyalarını (Kayıpsız FLAC, WAV, 320kbps MP3) olarak saniyeler içinde çekin.
* **[TR]** **Özel Kapak Gömme (Metadata Injection):** MP3 dosyalarınıza dilediğiniz özel kapak fotoğrafını anında gömün.
* **[TR]** **Gelişmiş Terminal Logları:** Ne indirildiğini, yüzde kaçta olduğunu ve sistemin ne durumda olduğunu gerçek zamanlı takip edin.

* **[EN]** **Dark & Industrial Design:** A sleek interface adorned with cyberpunk and glitch effects, defying conventional "slop" designs.
* **[EN]** **Multi-Target Support:** Direct downloads from YouTube and SoundCloud; automated track detection from Spotify links with highest-quality background matching.
* **[EN]** **Format & Quality Freedom:** Extract videos (Highest MP4) or audio files (Lossless FLAC, WAV, 320kbps MP3) in seconds.
* **[EN]** **Custom Cover Injection:** Inject any custom cover art directly into your MP3 files on the fly.
* **[EN]** **Advanced Terminal Logs:** Track what's being downloaded, current progress, and system status in real-time.

---

## 🛠️ INSTALLATION // KURULUM (DEVELOPMENT)

```bash
# 1. CLONE THE REPOSITORY // REPOYU KLONLAYIN
git clone https://github.com/odephus/ciby-extractor.git

# 2. NAVIGATE TO THE DIRECTORY // DİZİNE GİDİN
cd ciby-extractor

# 3. INITIALIZE DEPENDENCIES // BAĞIMLILIKLARI YÜKLEYİN
npm install

# 4. EXECUTE THE PROTOCOL // UYGULAMAYI BAŞLATIN
npm start
```

---

## 📦 BUILDING THE INSTALLER // .EXE KURULUM DOSYASI OLUŞTURMA

Uygulamayı bir **.exe** kurulum (setup) dosyası haline getirmek için projenin klasöründe (terminalde) şu komutu çalıştırın:

```bash
npm run dist
```

Bu işlem birkaç dakika sürebilir. İşlem bittikten sonra proje klasörünün içinde `dist` adında yeni bir klasör oluşacak. O klasörün içindeki `CIBY Setup 1.0.0.exe` dosyası uygulamanızın kurulum dosyasıdır. Bu dosyayı arkadaşlarınıza gönderebilir veya Github Releases kısmına yükleyebilirsiniz!

---

## ⚠️ DEPENDENCIES

* `electron` - The core framework.
* `yt-dlp-exec` - The extraction engine.
* `ffmpeg-static` - Audio processing module.
* The bundled FFmpeg also embeds custom PNG or JPEG artwork in MP3 files.
* `spotify-url-info` - Target acquisition for Spotify links.
* `electron-builder` - Installer creation system.

---

<div align="center">
  <p><strong>// END OF FILE</strong></p>
</div>
