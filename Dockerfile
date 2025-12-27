FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
ENV TEMP_RECORDING_DIR=/tmp/mitsi-recordings

RUN mkdir -p ${TEMP_RECORDING_DIR}

# Install ffmpeg & chromium dependencies
RUN apk add --no-cache \
    ffmpeg \
    chromium \
    libxss1 \
    libgtk-3-0 \
    dbus

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if(r.statusCode !== 200) throw new Error(r.statusCode)})"

CMD ["node", "dist/main.js"]
