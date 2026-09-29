# Backend de Cayman Bank (NestJS).
# Se construye en dos etapas para que la imagen final no lleve TypeScript ni
# las dependencias de desarrollo.

FROM node:22-alpine AS build
WORKDIR /app
# El droplet tiene 512 MB de RAM: Node fija su limite de memoria segun la RAM
# fisica y el compilador se queda corto. Con esto puede usar el swap.
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# Para correr migraciones futuras desde el contenedor:
#   docker compose exec backend node scripts/aplicar-migraciones.js
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node migrations ./migrations
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
