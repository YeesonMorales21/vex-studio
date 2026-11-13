# Imagen oficial ligera de Node.js 22 para despliegue en la nube (Render / Railway / Fly.io)
FROM node:22-bookworm-slim

# Instalar FFmpeg, Python3, certificados SSL y el binario oficial de yt-dlp para Linux
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalar dependencias de Node.js
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el código fuente del proyecto
COPY . .

# Crear carpeta para descargas multimedia
RUN mkdir -p public/downloads

# Exponer el puerto de la aplicación
EXPOSE 3000

# Comando de inicio en producción
CMD ["npm", "start"]
