import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import conectarDB from './config/db.js';
import videoRoutes from './routes/videoRoutes.js'; // 1. Importamos tus rutas del CRUD

// Configuración obligatoria para usar rutas físicas (__dirname) con módulos modernos
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const raizProyecto = path.join(__dirname, '..');
const carpetaPublic = path.join(__dirname, '../public');

// Inicializar la lectura del archivo .env
dotenv.config();

// Crear la aplicación Express
const app = express();
const PORT = process.env.PORT || 3000;

// Disparar la conexión automática a MongoDB Atlas
conectarDB();

// Middlewares obligatorios para lectura de datos JSON y formularios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta inteligente para servir el logo sin importar su nombre o extensión (.png, .jpg, .jpeg, .webp, .svg)
app.get('/api/logo', (req, res) => {
  const extensionesImagen = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico'];
  const carpetasBusqueda = [carpetaPublic, raizProyecto, path.join(carpetaPublic, 'img'), path.join(carpetaPublic, 'images')];

  for (const carpeta of carpetasBusqueda) {
    if (!fs.existsSync(carpeta)) continue;
    const archivos = fs.readdirSync(carpeta);
    // Priorizar archivos que contengan "logo" o "vex" y luego cualquier imagen en la carpeta
    const candidatos = [
      ...archivos.filter((f) => /logo|vex|brand|icono/i.test(f)),
      ...archivos
    ];
    for (const archivo of candidatos) {
      const ext = path.extname(archivo).toLowerCase();
      if (extensionesImagen.includes(ext)) {
        return res.sendFile(path.join(carpeta, archivo));
      }
    }
  }
  return res.status(404).end();
});

// Configurar la carpeta para que las descargas de clips e imágenes sean públicas
app.use(express.static(carpetaPublic));

// 2. Enlazamos las rutas de tu CRUD para que respondan en /api
app.use('/api', videoRoutes); 

// Ruta de diagnóstico (Health check)
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'vivido y funcionando', app: 'VEX API' });
});

// Iniciar la escucha del servidor Express sin que se cierre y aumentar timeout para videos largos
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor Express encendido en: http://localhost:${PORT}`);
}).on('error', (err) => {
  console.error('❌ Error al encender el servidor Express:', err.message);
});

server.timeout = 600000;
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
