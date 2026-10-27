FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY ai_training/labeler.html ./ai_training/labeler.html
ARG VITE_API_URL=http://localhost:5080
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
