FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VITE_GOOGLE_MAPS_API_KEY=""
ARG VITE_OPENROUTER_PROXY_URL=""
ARG VITE_OPENROUTER_DISCOVERY_URL=""
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_OPENROUTER_PROXY_URL=$VITE_OPENROUTER_PROXY_URL
ENV VITE_OPENROUTER_DISCOVERY_URL=$VITE_OPENROUTER_DISCOVERY_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
