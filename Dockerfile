FROM node:22-slim

WORKDIR /app

# Copiar dependencias e instalar
COPY package*.json ./
RUN npm ci

# Copiar el resto del código
COPY . .

# Compilar el frontend con Vite (requiere glibc para lightningcss / Tailwind v4)
RUN npm run build

# Variables de entorno para producción
ENV NODE_ENV=production
ENV PORT=7860

# Crear carpeta uploads con permisos
RUN mkdir -p /app/uploads && chmod 777 /app/uploads

EXPOSE 7860

# Arrancar el servidor con tsx (ejecuta TypeScript directamente)
CMD ["npx", "tsx", "server.ts"]
