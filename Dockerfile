FROM node:20-alpine AS builder

WORKDIR /app
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

FROM node:20-alpine

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev
COPY server ./server

# Copy built frontend into server/public
COPY --from=builder /app/server/public ./server/public

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server/index.js"]
