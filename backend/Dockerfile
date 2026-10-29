# Rust API, worker and release controller (one image, separate process commands).
# Build from the repository root:  docker build -f backend/Dockerfile -t lokmangal-api .

FROM rust:1.94-bookworm AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY backend/ backend/
COPY frontend/seed/ frontend/seed/
COPY packages/finance/src/ packages/finance/src/
WORKDIR /app/backend
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
WORKDIR /app/backend
COPY --from=planner /app/backend/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json
COPY backend/ /app/backend/
# Tests read the seed and the finance package; release builds only need the backend sources.
COPY frontend/seed/ /app/frontend/seed/
COPY packages/finance/src/ /app/packages/finance/src/
RUN cargo build --release --locked --bins

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin lokmangal
COPY --from=builder /app/backend/target/release/lokmangal-server /usr/local/bin/lokmangal-server
COPY --from=builder /app/backend/target/release/lokmangal-cli /usr/local/bin/lokmangal-cli
USER lokmangal
ENV APP_ENV=production \
    API_BIND=0.0.0.0:8000 \
    INTERNAL_BIND=0.0.0.0:8001 \
    RUST_LOG=info
EXPOSE 8000 8001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fsS http://127.0.0.1:8000/api/v1/health || exit 1
ENTRYPOINT ["lokmangal-server"]
CMD ["api"]
