// Elementos de la interfaz (DOM)
const formExtractor = document.getElementById('form-extractor');
const urlVideo = document.getElementById('url-video');
const btnProcesar = document.getElementById('btn-procesar');
const controlesMultimedia = document.getElementById('controles-multimedia');
const tipoRecurso = document.getElementById('tipo-recurso');
const camposVideo = document.getElementById('campos-video');
const camposCompleto = document.getElementById('campos-completo');
const camposImagen = document.getElementById('campos-imagen');
const historialGrid = document.getElementById('historial-grid');
const tituloInput = document.getElementById('titulo-recurso');

// Elementos de Vista Previa Inteligente
const previewCard = document.getElementById('video-preview-card');
const previewThumb = document.getElementById('preview-thumb');
const previewPlatform = document.getElementById('preview-platform');
const previewDuration = document.getElementById('preview-duration');
const previewTitle = document.getElementById('preview-title');
const previewAuthor = document.getElementById('preview-author');

// Elementos del Navbar y Filtros
const navTotalCount = document.getElementById('nav-total-count');
const apiStatusBadge = document.getElementById('api-status-badge');
const apiStatusText = document.getElementById('api-status-text');
const buscadorHistorial = document.getElementById('buscador-historial');
const botonesFiltro = document.querySelectorAll('.filter-btn');

// Elementos de estados dinámicos (Rúbrica: Carga/Éxito/Error)
const estadoApp = document.getElementById('estado-app');
const estadoLoading = document.getElementById('estado-loading');
const estadoSuccess = document.getElementById('estado-success');
const estadoError = document.getElementById('estado-error');
const msgSuccess = document.getElementById('msg-success');
const msgError = document.getElementById('msg-error');

// URL Base de tu API REST
const API_URL = '/api/clips';

// Generar o recuperar el identificador único privado de este dispositivo / navegador
function obtenerClienteId() {
    const CLAVE_STORAGE = 'vex_device_client_id';
    let id = localStorage.getItem(CLAVE_STORAGE);
    if (!id) {
        id = 'vex_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 10);
        localStorage.setItem(CLAVE_STORAGE, id);
    }
    return id;
}

const CLIENTE_ID = obtenerClienteId();

// Estado local para filtrado y búsqueda instantánea en la biblioteca
let cacheHistorial = [];
let filtroActivo = 'todos';
let textoBusqueda = '';

// Convierte "mm:ss", "hh:mm:ss" o segundos ("90") a número total de segundos
function convertirTiempoASegundos(valor) {
    if (valor === undefined || valor === null) return NaN;
    const texto = String(valor).trim();
    if (!texto) return NaN;

    if (texto.includes(':')) {
        const partes = texto.split(':').map(p => Number(p.trim()));
        if (partes.some(n => !Number.isFinite(n) || n < 0)) return NaN;
        if (partes.length === 2) {
            return Math.floor(partes[0] * 60 + partes[1]);
        }
        if (partes.length === 3) {
            return Math.floor(partes[0] * 3600 + partes[1] * 60 + partes[2]);
        }
        return NaN;
    }

    const numero = Number(texto);
    return Number.isFinite(numero) && numero >= 0 ? Math.floor(numero) : NaN;
}

// Formatea segundos (ej. 95) a formato legible "01:35" o "01:05:20"
function formatearSegundos(seg = 0) {
    const total = Math.max(0, Math.floor(Number(seg) || 0));
    const horas = Math.floor(total / 3600);
    const min = Math.floor((total % 3600) / 60);
    const restoSeg = total % 60;
    const mm = String(min).padStart(2, '0');
    const ss = String(restoSeg).padStart(2, '0');
    if (horas > 0) {
        return `${String(horas).padStart(2, '0')}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}

// Escapa caracteres HTML especiales para prevenir XSS
function escaparHtml(texto = '') {
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Verificar estado de salud de la API para el indicador del Navbar
async function verificarSaludServidor() {
    try {
        const res = await fetch('/api/health');
        if (res.ok) {
            apiStatusBadge.className = 'status-pill online';
            apiStatusText.textContent = 'API & Atlas Online';
        } else {
            throw new Error();
        }
    } catch {
        apiStatusBadge.className = 'status-pill offline';
        apiStatusText.textContent = 'Servidor Desconectado';
    }
}

// 1. PASO 1: Analizar enlace, mostrar miniatura/duración real y habilitar controles
btnProcesar.addEventListener('click', async () => {
    const enlace = urlVideo.value.trim();
    if (!enlace) {
        alert('Por favor, pega una URL válida primero.');
        return;
    }

    // Mostrar controles inmediatamente para fluidez y lanzar detección de metadatos
    controlesMultimedia.classList.remove('hide');
    btnProcesar.disabled = true;
    btnProcesar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analizando...';

    try {
        const respuesta = await fetch(`${API_URL}/info`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: enlace })
        });
        const resultado = await respuesta.json();

        if (resultado.success && resultado.data) {
            const info = resultado.data;
            previewCard.classList.remove('hide');
            previewThumb.src = info.miniatura || 'https://via.placeholder.com/300x170/111827/3b82f6?text=VEX+Video';
            previewPlatform.innerHTML = `<i class="fa-solid fa-globe"></i> ${escaparHtml(info.plataforma)}`;
            previewDuration.innerHTML = `<i class="fa-regular fa-clock"></i> ${
                info.duracionSegundos > 0 ? formatearSegundos(info.duracionSegundos) : 'En vivo / Variable'
            }`;
            previewTitle.textContent = info.titulo;
            previewAuthor.innerHTML = `<i class="fa-solid fa-user-check"></i> ${escaparHtml(info.autor)}`;

            // Autocompletar el título si el usuario aún no ha escrito uno personalizado
            if (!tituloInput.value.trim()) {
                tituloInput.value = info.titulo.slice(0, 75);
            }

            btnProcesar.innerHTML = '<i class="fa-solid fa-check"></i> Enlace Verificado';
            btnProcesar.style.backgroundColor = '#10b981';
        } else {
            btnProcesar.innerHTML = '<i class="fa-solid fa-check"></i> Enlace Listo';
            btnProcesar.style.backgroundColor = '#10b981';
        }
    } catch {
        btnProcesar.innerHTML = '<i class="fa-solid fa-check"></i> Enlace Listo';
        btnProcesar.style.backgroundColor = '#10b981';
    } finally {
        btnProcesar.disabled = false;
    }
});

// 2. INTERACCIÓN DINÁMICA: Mostrar campos según la elección (Video, Completo, Audio o Imagen)
tipoRecurso.addEventListener('change', (e) => {
    const seleccion = e.target.value;
    if (seleccion === 'video') {
        camposVideo.classList.remove('hide');
        camposCompleto.classList.add('hide');
        camposImagen.classList.add('hide');
    } else if (seleccion === 'imagen') {
        camposVideo.classList.add('hide');
        camposCompleto.classList.add('hide');
        camposImagen.classList.remove('hide');
    } else {
        camposVideo.classList.add('hide');
        camposImagen.classList.add('hide');
        camposCompleto.classList.remove('hide');
    }
});

// 3. OPERACIÓN CRUD (CREAR): Enviar los datos del formulario a la API mediante Fetch
formExtractor.addEventListener('submit', async (e) => {
    e.preventDefault();

    const seleccion = tipoRecurso.value;
    const tiempoInicioSeg = convertirTiempoASegundos(document.getElementById('tiempo-inicio').value);
    const tiempoFinSeg = convertirTiempoASegundos(document.getElementById('tiempo-fin').value);
    const segundoCapturaSeg = convertirTiempoASegundos(document.getElementById('segundo-captura').value);

    if (seleccion === 'video') {
        if (Number.isNaN(tiempoInicioSeg) || Number.isNaN(tiempoFinSeg)) {
            estadoApp.classList.remove('hide');
            estadoLoading.classList.add('hide');
            estadoSuccess.classList.add('hide');
            estadoError.classList.remove('hide');
            msgError.textContent = 'Formato de tiempo inválido. Usa minutos (ej. 01:30) o segundos (ej. 90).';
            return;
        }
        if (tiempoFinSeg <= tiempoInicioSeg) {
            estadoApp.classList.remove('hide');
            estadoLoading.classList.add('hide');
            estadoSuccess.classList.add('hide');
            estadoError.classList.remove('hide');
            msgError.textContent = 'El tiempo de fin debe ser mayor al tiempo de inicio.';
            return;
        }
    } else if (seleccion === 'imagen' && Number.isNaN(segundoCapturaSeg)) {
        estadoApp.classList.remove('hide');
        estadoLoading.classList.add('hide');
        estadoSuccess.classList.add('hide');
        estadoError.classList.remove('hide');
        msgError.textContent = 'Tiempo de captura inválido. Usa formato 01:15 o segundos como 75.';
        return;
    }

    estadoApp.classList.remove('hide');
    estadoLoading.classList.remove('hide');
    estadoSuccess.classList.add('hide');
    estadoError.classList.add('hide');

    const datosFormulario = {
        videoUrlOriginal: urlVideo.value.trim(),
        tipoRecurso: seleccion,
        titulo: tituloInput.value.trim() || 'Recurso Sin Título',
        tiempoInicio: seleccion === 'video' ? tiempoInicioSeg : 0,
        tiempoFin: seleccion === 'video' ? tiempoFinSeg : 0,
        segundoCaptura: seleccion === 'imagen' ? segundoCapturaSeg : 0,
        clienteId: CLIENTE_ID
    };

    try {
        const respuesta = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Client-Id': CLIENTE_ID
            },
            body: JSON.stringify(datosFormulario)
        });

        const resultado = await respuesta.json();
        estadoLoading.classList.add('hide');

        if (resultado.success) {
            estadoSuccess.classList.remove('hide');
            msgSuccess.textContent = resultado.message;
            formExtractor.reset();
            previewCard.classList.add('hide');
            camposVideo.classList.remove('hide');
            camposCompleto.classList.add('hide');
            camposImagen.classList.add('hide');
            controlesMultimedia.classList.add('hide');
            btnProcesar.innerHTML = '<i class="fa-solid fa-magnifying-glass-chart"></i> Analizar Enlace';
            btnProcesar.style.backgroundColor = '#3b82f6';

            cargarHistorial();
        } else {
            estadoError.classList.remove('hide');
            msgError.textContent = resultado.message || 'Error al procesar.';
        }
    } catch {
        estadoLoading.classList.add('hide');
        estadoError.classList.remove('hide');
        msgError.textContent = 'No se pudo conectar con el servidor backend.';
    }
});

// Renderizar tarjetas filtradas con reproductor multimedia en vivo
function renderizarHistorial() {
    const listaFiltrada = cacheHistorial.filter(item => {
        const coincideTipo = filtroActivo === 'todos' || item.tipoRecurso === filtroActivo;
        const coincideTexto = !textoBusqueda || (item.titulo || '').toLowerCase().includes(textoBusqueda);
        return coincideTipo && coincideTexto;
    });

    if (listaFiltrada.length === 0) {
        historialGrid.innerHTML = `
            <div class="no-data">
                <i class="fa-solid fa-folder-open"></i>
                <p>${
                    cacheHistorial.length === 0
                        ? 'Aún no has generado recursos. ¡Pega un enlace arriba para comenzar!'
                        : 'No se encontraron recursos que coincidan con tu búsqueda o filtro.'
                }</p>
            </div>
        `;
        return;
    }

    historialGrid.innerHTML = '';

    listaFiltrada.forEach(recurso => {
        const tipo = recurso.tipoRecurso;
        const tituloSeguro = escaparHtml(recurso.titulo);
        const urlDescargaSegura = `/api/clips/${recurso._id}/descargar`;
        const urlArchivoLocal = `/downloads/${encodeURIComponent(recurso.nombreArchivo)}`;
        const disponibleEnDisco = recurso.archivoDisponible !== false;

        let iconoClase = 'fa-solid fa-scissors';
        let etiquetaTipo = 'CLIP MP4';
        let detalleTiempo = '';

        if (tipo === 'video') {
            iconoClase = 'fa-solid fa-scissors';
            etiquetaTipo = 'CLIP RECORTADO';
            detalleTiempo = `Duración: ${recurso.duracionSegundos}s (${formatearSegundos(recurso.tiempoInicio)} a ${formatearSegundos(recurso.tiempoFin)})`;
        } else if (tipo === 'video_completo') {
            iconoClase = 'fa-solid fa-film';
            etiquetaTipo = 'VIDEO COMPLETO';
            detalleTiempo = recurso.duracionSegundos > 0
                ? `Duración total: ${formatearSegundos(recurso.duracionSegundos)}`
                : 'Video / Película Completa (MP4)';
        } else if (tipo === 'audio_completo') {
            iconoClase = 'fa-solid fa-music';
            etiquetaTipo = 'AUDIO MP3';
            detalleTiempo = recurso.duracionSegundos > 0
                ? `Duración total: ${formatearSegundos(recurso.duracionSegundos)}`
                : 'Canción / Audio Completo (MP3)';
        } else {
            iconoClase = 'fa-solid fa-image';
            etiquetaTipo = 'CAPTURA HD';
            detalleTiempo = `Fotograma en el minuto ${formatearSegundos(recurso.segundoCaptura)} (${recurso.segundoCaptura}s)`;
        }

        // Construir el reproductor integrado (Video, Audio MP3 o Vista Previa de Imagen)
        let reproductorHtml = '';
        if (!disponibleEnDisco) {
            reproductorHtml = `
                <div class="remote-only-placeholder">
                    <i class="fa-solid fa-cloud-arrow-down"></i>
                    <span>Creado en otra PC · Haz clic en <strong>Descargar</strong> para reconstruirlo aquí</span>
                </div>
            `;
        } else if (tipo === 'video' || tipo === 'video_completo') {
            reproductorHtml = `<video controls preload="metadata" src="${urlArchivoLocal}"></video>`;
        } else if (tipo === 'audio_completo') {
            reproductorHtml = `
                <div class="audio-player-wrapper">
                    <div class="audio-icon-pulse"><i class="fa-solid fa-headphones"></i></div>
                    <audio controls preload="metadata" src="${urlArchivoLocal}"></audio>
                </div>
            `;
        } else {
            reproductorHtml = `<img src="${urlArchivoLocal}" alt="${tituloSeguro}" loading="lazy">`;
        }

        const tarjetaHtml = `
            <article class="media-card">
                <div class="media-player-box">
                    ${reproductorHtml}
                </div>
                <div class="media-card-body">
                    <div>
                        <div class="media-badge-row">
                            <span class="type-badge ${tipo}"><i class="${iconoClase}"></i> ${etiquetaTipo}</span>
                            <a href="${escaparHtml(recurso.videoUrlOriginal)}" target="_blank" rel="noopener noreferrer" class="source-link" title="Abrir enlace original">
                                Origen <i class="fa-solid fa-arrow-up-right-from-square"></i>
                            </a>
                        </div>
                        <h4 class="media-card-title">${tituloSeguro}</h4>
                        <p class="media-card-meta"><i class="fa-regular fa-clock"></i> ${detalleTiempo}</p>
                    </div>
                    <div class="media-card-actions">
                        <a href="${urlDescargaSegura}" class="btn-card-download">
                            <i class="fa-solid fa-download"></i> Descargar
                        </a>
                        <button type="button" class="btn-card-action" onclick="editarTitulo('${recurso._id}')" title="Editar título">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn-card-action delete" onclick="eliminarRecurso('${recurso._id}')" title="Eliminar recurso">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
        historialGrid.insertAdjacentHTML('beforeend', tarjetaHtml);
    });
}

// 4. OPERACIÓN CRUD (LEER): Listar únicamente el historial privado de este dispositivo / navegador
async function cargarHistorial() {
    try {
        const respuesta = await fetch(`${API_URL}?clienteId=${encodeURIComponent(CLIENTE_ID)}`, {
            headers: { 'X-Client-Id': CLIENTE_ID }
        });
        const resultado = await respuesta.json();

        if (resultado.success) {
            cacheHistorial = resultado.data || [];
            if (navTotalCount) {
                navTotalCount.textContent = String(cacheHistorial.length);
            }
            renderizarHistorial();
        }
    } catch (error) {
        console.error('Error al cargar historial:', error);
    }
}

// Eventos de búsqueda y filtrado en tiempo real
if (buscadorHistorial) {
    buscadorHistorial.addEventListener('input', (e) => {
        textoBusqueda = e.target.value.trim().toLowerCase();
        renderizarHistorial();
    });
}

botonesFiltro.forEach(btn => {
    btn.addEventListener('click', () => {
        botonesFiltro.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filtroActivo = btn.dataset.filter || 'todos';
        renderizarHistorial();
    });
});

// Funciones globales CRUD (Actualizar y Eliminar)
window.editarTitulo = async (id) => {
    const nuevoTitulo = prompt('Ingresa el nuevo título para tu recurso:');
    if (!nuevoTitulo || !nuevoTitulo.trim()) return;

    try {
        const respuesta = await fetch(`${API_URL}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ titulo: nuevoTitulo.trim() })
        });
        const resultado = await respuesta.json();
        if (resultado.success) cargarHistorial();
    } catch {
        alert('Error al actualizar el título.');
    }
};

window.eliminarRecurso = async (id) => {
    if (!confirm('¿Estás completamente seguro de que deseas eliminar este recurso del historial?')) return;

    try {
        const respuesta = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
        const resultado = await respuesta.json();
        if (resultado.success) cargarHistorial();
    } catch {
        alert('Error al eliminar el recurso.');
    }
};

// Inicializar la aplicación
verificarSaludServidor();
cargarHistorial();
