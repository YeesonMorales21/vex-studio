import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Clip from '../models/Clip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const raizProyecto = path.join(__dirname, '../..');

// Busca el ejecutable en la raíz del proyecto (modo portable Windows USB) o usa el binario nativo en la nube (Linux/Docker)
const resolverEjecutable = (nombreBase) => {
  if (process.platform === 'win32') {
    const posiblesRutas = [
      path.join(raizProyecto, `${nombreBase}.exe`),
      path.join(raizProyecto, `${nombreBase}.exe.exe`), // Por si Windows ocultó la extensión .exe al renombrar
      path.join(raizProyecto, 'bin', `${nombreBase}.exe`),
      path.join(raizProyecto, '..', `${nombreBase}.exe`)
    ];

    for (const ruta of posiblesRutas) {
      if (fs.existsSync(ruta)) {
        return ruta;
      }
    }
  }
  return nombreBase; // En Linux (Render/Railway) o si está en el PATH global
};

// Devuelve argumentos adicionales si existe cookies.txt en la raíz del proyecto (para evitar bloqueo de bots de YouTube en Render)
const obtenerArgsCookies = () => {
  const rutaCookies = path.join(raizProyecto, 'cookies.txt');
  if (fs.existsSync(rutaCookies)) {
    return ['--cookies', rutaCookies];
  }
  return [];
};

// Convierte formatos "mm:ss", "hh:mm:ss" o segundos numéricos ("90") al total de segundos
const parsearTiempoASegundos = (valor) => {
  if (valor === undefined || valor === null || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? Math.floor(valor) : NaN;

  const texto = String(valor).trim();
  if (texto.includes(':')) {
    const partes = texto.split(':').map((p) => Number(p.trim()));
    if (partes.some((n) => !Number.isFinite(n) || n < 0)) return NaN;

    if (partes.length === 2) {
      const [minutos, segundos] = partes;
      return Math.floor(minutos * 60 + segundos);
    }
    if (partes.length === 3) {
      const [horas, minutos, segundos] = partes;
      return Math.floor(horas * 3600 + minutos * 60 + segundos);
    }
    return NaN;
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? Math.floor(numero) : NaN;
};

// Devuelve la extensión de archivo correspondiente según el tipo de recurso
const obtenerExtensionPorTipo = (tipoRecurso) => {
  if (tipoRecurso === 'imagen') return 'jpg';
  if (tipoRecurso === 'audio_completo') return 'mp3';
  return 'mp4';
};

// Descarga el video completo (.mp4 compatible con Windows) o audio completo (.mp3) directamente usando yt-dlp + ffmpeg
const descargarRecursoCompleto = (urlVideo, tipoRecurso, rutaDestino) => {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlVideo);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return reject(new Error('La URL debe comenzar con http:// o https://'));
      }
    } catch {
      return reject(new Error('El formato de la URL ingresada no es válido.'));
    }

    const binYtDlp = resolverEjecutable('yt-dlp');
    const binFfmpeg = resolverEjecutable('ffmpeg');

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--force-ipv4',
      '--extractor-args',
      'youtube:player_client=tv,ios,mweb,web',
      ...obtenerArgsCookies(),
      '--print',
      'after_move:duration'
    ];

    // Si ffmpeg.exe está en la carpeta del proyecto (USB portable), le pasamos su ruta exacta a yt-dlp
    if (binFfmpeg !== 'ffmpeg') {
      args.push('--ffmpeg-location', binFfmpeg);
    }

    if (tipoRecurso === 'audio_completo') {
      args.push(
        '-f',
        'ba/b',
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '-o',
        rutaDestino,
        urlVideo
      );
    } else {
      // Video / Película completa en MP4 garantizando descarga SIN marca de agua (TikTok/IG/FB) y códec H.264 (libx264) + AAC
      args.push(
        '-S',
        'has_watermark,vcodec:h264,res:720,acodec:aac',
        '-f',
        'bv*+ba/b[ext=mp4]/b',
        '--merge-output-format',
        'mp4',
        '-o',
        rutaDestino,
        urlVideo
      );
    }

    execFile(
      binYtDlp,
      args,
      { windowsHide: true, maxBuffer: 25 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          console.error('❌ Error en descarga completa yt-dlp:', stderr || error.message);
          return reject(
            new Error('No se pudo descargar el recurso completo. Verifica el enlace y tu conexión.')
          );
        }
        const lineas = String(stdout || '')
          .trim()
          .split(/\r?\n/)
          .filter(Boolean);
        const ultimaLinea = Number(lineas[lineas.length - 1]);
        const duracionSegundos = Number.isFinite(ultimaLinea) ? Math.round(ultimaLinea) : 0;
        resolve({ duracionSegundos });
      }
    );
  });
};

// Respaldo directo con yt-dlp + FFmpeg ligero (especial para TikTok, Instagram, Facebook, Kick y contenedores con 512MB RAM)
const recortarConYtDlpDirecto = (urlVideo, tipoRecurso, inicioSeg, finSeg, capturaSeg, rutaDestino) => {
  return new Promise((resolve, reject) => {
    const binYtDlp = resolverEjecutable('yt-dlp');
    const binFfmpeg = resolverEjecutable('ffmpeg');
    const tempBase = `${rutaDestino}.temp.mp4`;

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--force-ipv4',
      '--extractor-args',
      'youtube:player_client=tv,ios,mweb,web',
      ...obtenerArgsCookies(),
      '-S',
      'has_watermark,vcodec:h264,res:720,acodec:aac',
      '-f',
      'bv*+ba/b[ext=mp4]/b',
      '--merge-output-format',
      'mp4',
      '-o',
      tempBase,
      urlVideo
    ];

    if (binFfmpeg !== 'ffmpeg') {
      args.unshift('--ffmpeg-location', binFfmpeg);
    }

    execFile(binYtDlp, args, { windowsHide: true, timeout: 60000, maxBuffer: 15 * 1024 * 1024 }, (err) => {
      if (err || !fs.existsSync(tempBase)) {
        if (fs.existsSync(tempBase)) fs.unlinkSync(tempBase);
        return reject(new Error('No se pudo extraer desde esta plataforma (verifica que el enlace sea público).'));
      }

      const duracion = Math.max(1, finSeg - inicioSeg);

      // Recorte directo sobre el archivo local descargado con -threads 1 para no exceder los 512MB RAM de Render Free
      const ffmpegArgs =
        tipoRecurso === 'video'
          ? [
              '-ss', String(inicioSeg),
              '-i', tempBase,
              '-t', String(duracion),
              '-threads', '1',
              '-c:v', 'libx264',
              '-preset', 'ultrafast',
              '-crf', '24',
              '-pix_fmt', 'yuv420p',
              '-c:a', 'aac',
              '-b:a', '128k',
              '-movflags', '+faststart',
              '-y', rutaDestino
            ]
          : [
              '-ss', String(capturaSeg),
              '-i', tempBase,
              '-frames:v', '1',
              '-q:v', '2',
              '-y', rutaDestino
            ];

      execFile(binFfmpeg, ffmpegArgs, { windowsHide: true, timeout: 60000, maxBuffer: 10 * 1024 * 1024 }, (ffErr) => {
        if (fs.existsSync(tempBase)) fs.unlinkSync(tempBase);
        if (ffErr || !fs.existsSync(rutaDestino)) {
          return reject(new Error('Error al convertir el archivo multimedia a formato compatible.'));
        }
        resolve();
      });
    });
  });
};

// Función auxiliar para ejecutar yt-dlp de forma segura y obtener las URLs de video/audio compatibles
const obtenerUrlsStream = (urlVideo, tipoRecurso) => {
  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(urlVideo);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return reject(new Error('La URL debe comenzar con http:// o https://'));
      }
    } catch {
      return reject(new Error('El formato de la URL ingresada no es válido.'));
    }

    const binYtDlp = resolverEjecutable('yt-dlp');

    // Preferimos streams H.264 (avc1) + AAC (mp4a) o MP4 pre-combinado para máxima velocidad y compatibilidad
    const selectorFormato =
      tipoRecurso === 'video'
        ? 'bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[ext=mp4]/bv*+ba/b'
        : 'bv*[vcodec^=avc1]/b[ext=mp4]/bv*/b';

    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--force-ipv4',
      '--extractor-args',
      'youtube:player_client=tv,ios,mweb,web',
      ...obtenerArgsCookies(),
      '-S',
      'has_watermark,vcodec:h264,res:720,acodec:aac',
      '-f',
      selectorFormato,
      '-g',
      urlVideo
    ];

    execFile(binYtDlp, args, { windowsHide: true, timeout: 45000 }, (error, stdout, stderr) => {
      if (error) {
        const detalleErr = String(stderr || error.message || '');
        console.error('❌ Error en yt-dlp:', detalleErr);
        if (error.code === 'ENOENT') {
          return reject(
            new Error('No se encontró yt-dlp.exe en la raíz del proyecto ni instalado en el sistema.')
          );
        }
        if (/Sign in to confirm you.?re not a bot|bot/i.test(detalleErr)) {
          return reject(
            new Error(
              'YouTube bloqueó temporalmente la IP del servidor gratuito en la nube (Render). Prueba con enlaces de TikTok/Facebook en Render, o usa http://localhost:3000 en tu PC para YouTube.'
            )
          );
        }
        return reject(
          new Error('No se pudo extraer el flujo del video. Verifica tu conexión a internet y que la URL sea pública.')
        );
      }

      const urls = stdout
        .trim()
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter(Boolean);

      if (urls.length === 0) {
        return reject(new Error('No se encontraron flujos de datos multimedia disponibles para este enlace.'));
      }
      resolve(urls);
    });
  });
};

// 1. CREAR: Procesar el video en tiempo real con FFmpeg y guardar en MongoDB Atlas (POST)
export const crearRecurso = async (req, res) => {
  try {
    const { videoUrlOriginal, tipoRecurso, titulo, tiempoInicio, tiempoFin, segundoCaptura } = req.body;

    // Validaciones básicas requeridas por la rúbrica
    if (!videoUrlOriginal || !tipoRecurso || !titulo || !String(titulo).trim()) {
      return res.status(400).json({ success: false, message: 'Faltan campos obligatorios.' });
    }

    const inicioSeg = parsearTiempoASegundos(tiempoInicio);
    const finSeg = parsearTiempoASegundos(tiempoFin);
    const capturaSeg = parsearTiempoASegundos(segundoCaptura);

    if (tipoRecurso === 'video') {
      if (!Number.isFinite(inicioSeg) || !Number.isFinite(finSeg) || inicioSeg < 0 || finSeg <= inicioSeg) {
        return res.status(400).json({
          success: false,
          message: 'El tiempo de fin debe ser mayor al tiempo de inicio (puedes usar segundos como 90 o minutos como 01:30).'
        });
      }
      // Validación extraordinaria: Evitar abusos limitando el clip a un máximo de 5 minutos (300 segundos)
      if (finSeg - inicioSeg > 300) {
        return res.status(400).json({
          success: false,
          message: 'El límite máximo permitido para recortar fragmentos es de 5 minutos (300 segundos).'
        });
      }
    } else if (tipoRecurso === 'imagen') {
      if (!Number.isFinite(capturaSeg) || capturaSeg < 0) {
        return res.status(400).json({
          success: false,
          message: 'El tiempo de captura no es válido (usa segundos como 15 o formato 01:15).'
        });
      }
    } else if (!['video_completo', 'audio_completo'].includes(tipoRecurso)) {
      return res.status(400).json({ success: false, message: 'Tipo de recurso no válido.' });
    }

    // Configurar rutas físicas y nombres de los archivos reales en tu servidor local
    const marcasTiempo = Date.now();
    const extension = obtenerExtensionPorTipo(tipoRecurso);
    const nombreArchivoReal = `vex-${marcasTiempo}.${extension}`;
    const carpetaDownloads = path.join(raizProyecto, 'public', 'downloads');
    const rutaDestino = path.join(carpetaDownloads, nombreArchivoReal);

    // Asegurar que la carpeta pública downloads exista en el disco
    if (!fs.existsSync(carpetaDownloads)) {
      fs.mkdirSync(carpetaDownloads, { recursive: true });
    }

    // CASO ESPECIAL: Descarga de Video/Película Completa (MP4) o Canción/Audio Completo (MP3)
    if (tipoRecurso === 'video_completo' || tipoRecurso === 'audio_completo') {
      try {
        const { duracionSegundos } = await descargarRecursoCompleto(
          videoUrlOriginal.trim(),
          tipoRecurso,
          rutaDestino
        );

        const nuevoClip = new Clip({
          videoUrlOriginal: videoUrlOriginal.trim(),
          tipoRecurso,
          titulo: String(titulo).trim(),
          tiempoInicio: 0,
          tiempoFin: duracionSegundos,
          duracionSegundos,
          segundoCaptura: 0,
          nombreArchivo: nombreArchivoReal
        });

        await nuevoClip.save();

        const etiquetaExito =
          tipoRecurso === 'audio_completo' ? 'Canción / Audio MP3 completo' : 'Video MP4 completo';

        return res.status(201).json({
          success: true,
          message: `¡${etiquetaExito} descargado de principio a fin y guardado en la nube!`,
          data: nuevoClip
        });
      } catch (err) {
        if (fs.existsSync(rutaDestino)) {
          fs.unlinkSync(rutaDestino);
        }
        return res.status(500).json({ success: false, message: err.message });
      }
    }

    const esPlataformaDirecta = /tiktok\.com|instagram\.com|facebook\.com|fb\.watch|kick\.com/i.test(
      videoUrlOriginal
    );

    if (esPlataformaDirecta) {
      try {
        await recortarConYtDlpDirecto(
          videoUrlOriginal.trim(),
          tipoRecurso,
          inicioSeg,
          finSeg,
          capturaSeg,
          rutaDestino
        );

        const nuevoClip = new Clip({
          videoUrlOriginal: videoUrlOriginal.trim(),
          tipoRecurso,
          titulo: String(titulo).trim(),
          tiempoInicio: tipoRecurso === 'video' ? inicioSeg : 0,
          tiempoFin: tipoRecurso === 'video' ? finSeg : 0,
          segundoCaptura: tipoRecurso === 'imagen' ? capturaSeg : 0,
          nombreArchivo: nombreArchivoReal
        });

        await nuevoClip.save();

        return res.status(201).json({
          success: true,
          message: `¡${tipoRecurso === 'video' ? 'Clip MP4 sin marca de agua' : 'Fotograma JPG'} generado y guardado en la nube!`,
          data: nuevoClip
        });
      } catch (directErr) {
        return res.status(500).json({ success: false, message: directErr.message });
      }
    }

    // Extraer las URLs directas de los servidores de YouTube
    let urlsStream;
    try {
      urlsStream = await obtenerUrlsStream(videoUrlOriginal.trim(), tipoRecurso);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    const binFfmpeg = resolverEjecutable('ffmpeg');
    let ffmpegArgs = [];

    if (tipoRecurso === 'video') {
      const duracion = finSeg - inicioSeg;

      if (urlsStream.length >= 2) {
        // Si yt-dlp entregó pistas separadas de video (urlsStream[0]) y audio (urlsStream[1])
        ffmpegArgs = [
          '-ss', String(inicioSeg),
          '-i', urlsStream[0],
          '-ss', String(inicioSeg),
          '-i', urlsStream[1],
          '-t', String(duracion),
          '-map', '0:v:0',
          '-map', '1:a:0'
        ];
      } else {
        // Si yt-dlp entregó una pista combinada con video y audio
        ffmpegArgs = [
          '-ss', String(inicioSeg),
          '-i', urlsStream[0],
          '-t', String(duracion)
        ];
      }

      // Recodificamos a H.264 (yuv420p) + AAC con -threads 1 para no superar los 512MB RAM en Render Free
      ffmpegArgs.push(
        '-threads', '1',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '24',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        rutaDestino
      );
    } else {
      // Captura de fotograma fijo en alta definición
      ffmpegArgs = [
        '-ss', String(capturaSeg),
        '-i', urlsStream[0],
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        rutaDestino
      ];
    }

    // Ejecutar el procesamiento multimedia en el backend sin invocar shell (seguro contra inyección)
    execFile(binFfmpeg, ffmpegArgs, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
      if (error) {
        console.warn('⚠️ FFmpeg directo rechazado por el servidor de origen, activando modo compatible yt-dlp (TikTok/FB/IG/Kick)...');
        try {
          await recortarConYtDlpDirecto(
            videoUrlOriginal.trim(),
            tipoRecurso,
            inicioSeg,
            finSeg,
            capturaSeg,
            rutaDestino
          );
        } catch (fallbackErr) {
          console.error('❌ ERROR DETECTADO EN FFMPEG/YTDLP:', stderr || fallbackErr.message);
          return res.status(500).json({
            success: false,
            message: fallbackErr.message
          });
        }
      }

      try {
        // Si FFmpeg tuvo éxito, registramos el documento estructurado en MongoDB Atlas
        const nuevoClip = new Clip({
          videoUrlOriginal: videoUrlOriginal.trim(),
          tipoRecurso,
          titulo: String(titulo).trim(),
          tiempoInicio: tipoRecurso === 'video' ? inicioSeg : 0,
          tiempoFin: tipoRecurso === 'video' ? finSeg : 0,
          segundoCaptura: tipoRecurso === 'imagen' ? capturaSeg : 0,
          nombreArchivo: nombreArchivoReal
        });

        await nuevoClip.save();

        return res.status(201).json({
          success: true,
          message: `¡${tipoRecurso === 'video' ? 'Clip MP4 (H.264 universal)' : 'Fotograma JPG'} generado de forma real y guardado en la nube!`,
          data: nuevoClip
        });
      } catch (dbError) {
        // Limpiar archivo físico si falló el guardado en MongoDB para no dejar archivos huérfanos
        if (fs.existsSync(rutaDestino)) {
          fs.unlinkSync(rutaDestino);
        }
        return res.status(500).json({
          success: false,
          message: `Error al guardar en base de datos: ${dbError.message}`
        });
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: `Error crítico: ${error.message}` });
  }
};

// 2. LEER TODOS: Listar el historial real (GET)
export const listarRecursos = async (req, res) => {
  try {
    const historial = await Clip.find().sort({ creadoEn: -1 }).lean();
    const carpetaDownloads = path.join(raizProyecto, 'public', 'downloads');

    // Indicamos si el archivo físico existe en esta PC/USB para evitar descargas corruptas de otra máquina
    const historialConEstado = historial.map((item) => ({
      ...item,
      archivoDisponible: fs.existsSync(path.join(carpetaDownloads, item.nombreArchivo))
    }));

    return res.status(200).json({ success: true, data: historialConEstado });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 3. LEER UNO: Obtener detalle por ID (GET por ID)
export const obtenerRecursoPorId = async (req, res) => {
  try {
    const recurso = await Clip.findById(req.params.id);
    if (!recurso) return res.status(404).json({ success: false, message: 'No existe.' });
    return res.status(200).json({ success: true, data: recurso });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 4. ACTUALIZAR: Cambiar título (PUT)
export const actualizarTitulo = async (req, res) => {
  try {
    const nuevoTitulo = typeof req.body.titulo === 'string' ? req.body.titulo.trim() : '';
    if (!nuevoTitulo) {
      return res.status(400).json({ success: false, message: 'El nuevo título es obligatorio.' });
    }

    const recurso = await Clip.findByIdAndUpdate(
      req.params.id,
      { titulo: nuevoTitulo },
      { new: true, runValidators: true }
    );
    if (!recurso) return res.status(404).json({ success: false, message: 'No encontrado.' });
    return res.status(200).json({ success: true, message: 'Título modificado en Atlas.', data: recurso });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 5. ELIMINAR: Borrar registro de Atlas y archivo físico del servidor (DELETE)
export const eliminarRecurso = async (req, res) => {
  try {
    const recurso = await Clip.findById(req.params.id);
    if (!recurso) return res.status(404).json({ success: false, message: 'No existe.' });

    // Borrar el archivo real .mp4 o .jpg del almacenamiento local para no llenar el disco
    const rutaArchivoFisico = path.join(raizProyecto, 'public', 'downloads', recurso.nombreArchivo);
    if (fs.existsSync(rutaArchivoFisico)) {
      fs.unlinkSync(rutaArchivoFisico);
    }

    // Borrar el registro de MongoDB Atlas
    await Clip.findByIdAndDelete(req.params.id);

    return res.status(200).json({ success: true, message: 'Recurso y archivo eliminados del sistema.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// 6. DESCARGAR: Entregar archivo real o regenerarlo bajo demanda si fue creado en otra PC (GET /clips/:id/descargar)
export const descargarRecurso = async (req, res) => {
  try {
    const recurso = await Clip.findById(req.params.id);
    if (!recurso) {
      return res.status(404).send('El recurso solicitado no existe en la base de datos.');
    }

    const carpetaDownloads = path.join(raizProyecto, 'public', 'downloads');
    if (!fs.existsSync(carpetaDownloads)) {
      fs.mkdirSync(carpetaDownloads, { recursive: true });
    }

    const rutaArchivo = path.join(carpetaDownloads, recurso.nombreArchivo);
    const extension = obtenerExtensionPorTipo(recurso.tipoRecurso);
    const nombreDescarga = `${recurso.titulo.replace(/[<>:"/\\|?*]+/g, '_')}.${extension}`;

    // Si el archivo ya existe físicamente en esta PC/USB, lo descargamos directo
    if (fs.existsSync(rutaArchivo)) {
      return res.download(rutaArchivo, nombreDescarga);
    }

    // Si el registro fue creado en el instituto y el archivo no está en esta PC, lo regeneramos automáticamente
    console.log(`🔄 Regenerando archivo faltante desde origen para: "${recurso.titulo}"...`);

    if (recurso.tipoRecurso === 'video_completo' || recurso.tipoRecurso === 'audio_completo') {
      try {
        await descargarRecursoCompleto(recurso.videoUrlOriginal, recurso.tipoRecurso, rutaArchivo);
        return res.download(rutaArchivo, nombreDescarga);
      } catch (err) {
        return res.status(500).send(`No se pudo reconstruir el recurso completo: ${err.message}`);
      }
    }

    let urlsStream;
    try {
      urlsStream = await obtenerUrlsStream(recurso.videoUrlOriginal, recurso.tipoRecurso);
    } catch (err) {
      return res.status(400).send(`No se pudo regenerar el archivo desde el enlace original: ${err.message}`);
    }

    const binFfmpeg = resolverEjecutable('ffmpeg');
    let ffmpegArgs = [];

    if (recurso.tipoRecurso === 'video') {
      const inicioSeg = Number(recurso.tiempoInicio) || 0;
      const finSeg = Number(recurso.tiempoFin) || 30;
      const duracion = Math.max(1, finSeg - inicioSeg);

      if (urlsStream.length >= 2) {
        ffmpegArgs = [
          '-ss', String(inicioSeg),
          '-i', urlsStream[0],
          '-ss', String(inicioSeg),
          '-i', urlsStream[1],
          '-t', String(duracion),
          '-map', '0:v:0',
          '-map', '1:a:0'
        ];
      } else {
        ffmpegArgs = [
          '-ss', String(inicioSeg),
          '-i', urlsStream[0],
          '-t', String(duracion)
        ];
      }

      ffmpegArgs.push(
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        '-y',
        rutaArchivo
      );
    } else {
      const capturaSeg = Number(recurso.segundoCaptura) || 0;
      ffmpegArgs = [
        '-ss', String(capturaSeg),
        '-i', urlsStream[0],
        '-frames:v', '1',
        '-q:v', '2',
        '-y',
        rutaArchivo
      ];
    }

    execFile(binFfmpeg, ffmpegArgs, { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error || !fs.existsSync(rutaArchivo)) {
        console.error('❌ Error al regenerar archivo con FFmpeg:', stderr || error?.message);
        return res.status(500).send('No se pudo reconstruir el archivo multimedia en esta PC.');
      }
      return res.download(rutaArchivo, nombreDescarga);
    });
  } catch (error) {
    return res.status(500).send(`Error al descargar: ${error.message}`);
  }
};

// 7. PREVISUALIZAR METADATOS: Obtiene título, miniatura, autor, plataforma y duración real sin descargar el video (POST /clips/info)
export const obtenerInfoVideo = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !String(url).trim()) {
      return res.status(400).json({ success: false, message: 'Por favor ingresa una URL válida.' });
    }

    const urlLimpia = String(url).trim();
    try {
      const parsed = new URL(urlLimpia);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ success: false, message: 'La URL debe comenzar con http:// o https://' });
      }
    } catch {
      return res.status(400).json({ success: false, message: 'El formato de la URL no es válido.' });
    }

    const binYtDlp = resolverEjecutable('yt-dlp');
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      '--force-ipv4',
      '--extractor-args',
      'youtube:player_client=tv,ios,mweb,web',
      ...obtenerArgsCookies(),
      '--dump-single-json',
      '--skip-download',
      urlLimpia
    ];

    execFile(binYtDlp, args, { windowsHide: true, timeout: 30000, maxBuffer: 15 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Error al obtener info en yt-dlp:', stderr || error.message);
        return res.status(400).json({
          success: false,
          message: 'No se pudo obtener la información del enlace. Verifica que el video sea público.'
        });
      }

      try {
        const info = JSON.parse(stdout);
        return res.status(200).json({
          success: true,
          data: {
            titulo: info.title || 'Video detectado',
            duracionSegundos: Math.round(Number(info.duration) || 0),
            miniatura: info.thumbnail || '',
            autor: info.uploader || info.channel || 'Creador',
            plataforma: info.extractor_key || info.extractor || 'Web'
          }
        });
      } catch {
        return res.status(500).json({
          success: false,
          message: 'No se pudieron leer los metadatos del video.'
        });
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default {
  crearRecurso,
  listarRecursos,
  obtenerRecursoPorId,
  actualizarTitulo,
  eliminarRecurso,
  descargarRecurso,
  obtenerInfoVideo
};
