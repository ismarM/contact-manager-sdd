# Vmesnik (research R-08): gradnja z Node 22, streženje z nginx, ki posreduje /api/ zaledju.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Firebase (001, research R-04): privzeto demo projekt in emulator na istem izvoru (brez pravih ključev).
ARG VITE_FIREBASE_API_KEY=demo-api-key
ARG VITE_FIREBASE_AUTH_DOMAIN=demo-contact-manager.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=demo-contact-manager
ARG VITE_FIREBASE_EMULATOR=true
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_EMULATOR=$VITE_FIREBASE_EMULATOR
RUN npm run build

FROM nginx:1.30-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80
