import express from 'express';
import videoController from '../controllers/videoController.js';

const router = express.Router();

// 1. CREAR: Ruta para procesar un video y generar un clip o captura (POST)
router.post('/clips', videoController.crearRecurso);

// 2. LEER TODOS: Ruta para listar el historial completo de clips e imágenes (GET)
router.get('/clips', videoController.listarRecursos);

// 3. LEER UNO: Ruta para ver el detalle de un clip específico por su ID (GET por id)
router.get('/clips/:id', videoController.obtenerRecursoPorId);

// 4. ACTUALIZAR: Ruta para editar el título de un clip o imagen existente (PUT)
router.put('/clips/:id', videoController.actualizarTitulo);

// 5. ELIMINAR: Ruta para borrar un registro de la base de datos y su archivo físico (DELETE)
router.delete('/clips/:id', videoController.eliminarRecurso);

// 6. DESCARGAR: Ruta inteligente que entrega el archivo físico o lo regenera si fue creado en otra PC (GET)
router.get('/clips/:id/descargar', videoController.descargarRecurso);

// 7. INFO DE VIDEO: Ruta para extraer miniatura, título y duración real al pegar el link (POST)
router.post('/clips/info', videoController.obtenerInfoVideo);

export default router;
 
