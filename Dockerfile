FROM node:22-alpine
WORKDIR /app
# Updated dependencies
COPY package.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
