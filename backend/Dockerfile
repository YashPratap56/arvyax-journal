FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Ensure DB directory exists
RUN mkdir -p /app/data

EXPOSE 3001
CMD ["node", "server.js"]
