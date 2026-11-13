import mongoose from 'mongoose';

const ClipSchema = new mongoose.Schema({
  videoUrlOriginal: { 
    type: String, 
    required: [true, 'La URL del video de origen es obligatoria'],
    trim: true
  },
  tipoRecurso: { 
    type: String, 
    required: [true, 'El tipo de recurso es obligatorio'],
    enum: {
      values: ['video', 'imagen', 'video_completo', 'audio_completo'],
      message: '{VALUE} no es un tipo de recurso válido'
    }
  },
  titulo: { 
    type: String, 
    required: [true, 'El título del clip es obligatorio'],
    trim: true
  },
  tiempoInicio: { 
    type: Number,
    default: 0
  },
  tiempoFin: { 
    type: Number,
    default: 0
  },
  duracionSegundos: { 
    type: Number,
    default: 0
  },
  segundoCaptura: { 
    type: Number,
    default: 0
  },
  nombreArchivo: { 
    type: String, 
    required: [true, 'El nombre del archivo físico es obligatorio'] 
  },
  clienteId: {
    type: String,
    default: 'publico',
    index: true
  },
  creadoEn: { 
    type: Date, 
    default: Date.now 
  }
});

// Middleware corregido sin usar 'next' de forma innecesaria (Evita el error crítico)
ClipSchema.pre('save', function() {
  if (this.tipoRecurso === 'video') {
    this.duracionSegundos = this.tiempoFin - this.tiempoInicio;
  } else if (this.tipoRecurso === 'imagen') {
    this.duracionSegundos = 0;
  }
});

export default mongoose.model('Clip', ClipSchema);

