FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
COPY ai_training/labeler.html ./ai_training/labeler.html
ARG VITE_API_URL=
ARG VITE_ENABLE_TRAINING_STUDIO=false
ENV VITE_ENABLE_TRAINING_STUDIO=$VITE_ENABLE_TRAINING_STUDIO
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
FROM nginx:alpine@sha256:a3554c0d0b48177b1413c26e01f695334428020d9df01243fbae3e11cfd17417
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
