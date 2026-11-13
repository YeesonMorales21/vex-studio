import crypto from 'crypto'; // 1. Importar el módulo nativo de Node.js
import dns from 'dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Usar servidores DNS públicos (Google/Cloudflare) para evitar el error querySrv ECONNREFUSED en redes domésticas
dns.setServers(['8.8.8.8', '1.1.1.1']);

// 2. Inyectar de forma global ANTES de inicializar cualquier módulo
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: crypto,
    writable: false,
    configurable: true
  });
}

// Asegurar la lectura del archivo .env
dotenv.config();

const conectarDB = async () => {
  try {
    // 1. Intenta conectarse usando la configuración actual
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Atlas conectado con éxito: ${conn.connection.host}`);
  } catch (error) {
    // 2. Respaldo automático: si la red del instituto bloquea DNS externos o la de casa falla con SRV, alterna automáticamente
    try {
      dns.setServers(['1.1.1.1', '8.8.8.8', '8.8.4.4']);
      const conn = await mongoose.connect(process.env.MONGODB_URI);
      console.log(`✅ MongoDB Atlas conectado con éxito (DNS respaldo): ${conn.connection.host}`);
    } catch (retryError) {
      console.error(`❌ Error crítico al conectar a la base de datos: ${retryError.message}`);
      process.exit(1);
    }
  }
};

export default conectarDB;
