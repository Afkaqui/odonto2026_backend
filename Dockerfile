FROM node:20-alpine

WORKDIR /app

# Instalar dependencias primero (cache de capas)
COPY package*.json ./
RUN npm install --omit=dev

# Copiar el resto del codigo
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
