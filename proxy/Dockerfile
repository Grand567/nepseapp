FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package manifests and install production dependencies
COPY package*.json ./
RUN npm install --production

# Copy proxy application files
COPY . ./

# Environment defaults (Hugging Face Spaces uses port 7860)
ENV NODE_ENV=production
ENV PORT=7860

EXPOSE 7860

CMD ["node", "--max-old-space-size=2048", "server.mjs"]
