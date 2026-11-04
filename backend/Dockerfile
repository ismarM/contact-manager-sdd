# Zaledje (research R-08): gradnja z JDK 21, izvajanje z JRE 21 kot nekorenski uporabnik.
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /src
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package && cp target/*.jar /app.jar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S app && adduser -S app -G app
USER app
WORKDIR /app
COPY --from=build /app.jar app.jar
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=60s --retries=12 \
  CMD wget -qO- http://localhost:8080/api/health || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
