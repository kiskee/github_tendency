FROM node:18-alpine

WORKDIR /app

# Copia package.json
COPY package*.json ./

# Instala dependencias (incluyendo devDependencies para compilar)
RUN npm install

# Copia código fuente
COPY . .

# Compila TypeScript a JavaScript
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]