FROM node:20-alpine

# Install tools needed for Bash, Glob, and Grep tool execution
RUN apk add --no-cache bash grep findutils git curl

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY server/ ./server/
COPY public/ ./public/

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV WORK_DIR=/app

CMD ["node", "server/index.js"]
