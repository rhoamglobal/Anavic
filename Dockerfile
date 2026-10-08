FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV PORT=2567
EXPOSE 2567
CMD ["npx", "tsx", "server/index.ts"]
