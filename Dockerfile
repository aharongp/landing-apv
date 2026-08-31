# Dockerfile para despliegue en EasyPanel, Railway, Render o VPS con Docker
FROM node:22-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json si existen
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production || npm install --production

# Copiar el resto del código
COPY . .

# Crear el directorio de datos para la base de datos SQLite
RUN mkdir -p /app/data

# Definir volumen persistente para evitar pérdida de datos de catalog.db
VOLUME ["/app/data"]

# Puerto expuesto
EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# Comando de arranque
CMD ["node", "server.js"]
