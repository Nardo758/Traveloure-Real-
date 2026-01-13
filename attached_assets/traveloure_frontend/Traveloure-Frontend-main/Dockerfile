FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

WORKDIR /app

EXPOSE 3000

CMD ["npm", "start"]
