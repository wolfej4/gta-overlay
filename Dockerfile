FROM node:22-alpine AS stinger-builder
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
RUN npm run build:stinger && test -s public/assets/stingers/vice-red-stinger.webm

FROM node:22-alpine
WORKDIR /app
COPY package.json server.js studio.js integrations.js ./
COPY public ./public
COPY --from=stinger-builder /app/public/assets/stingers ./public/assets/stingers
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV PORT=8787 HOST=0.0.0.0 DATA_DIR=/app/data
EXPOSE 8787
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
