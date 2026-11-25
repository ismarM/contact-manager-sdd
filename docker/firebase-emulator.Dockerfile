# Firebase Auth Emulator (research R-05). Demo projekt ne potrebuje pravih ključev.
FROM node:22-alpine
RUN npm install -g firebase-tools@15.34.2 && npm cache clean --force
WORKDIR /firebase
COPY firebase.json .
EXPOSE 9099
CMD ["firebase", "emulators:start", "--only", "auth", "--project", "demo-contact-manager"]
