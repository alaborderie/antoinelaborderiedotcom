FROM rust AS builder
WORKDIR /usr/src/myapp
COPY . .
RUN cargo install --path .

FROM debian
WORKDIR /app
COPY --from=builder /usr/local/cargo/bin/antoinelaborderiedotcom /usr/local/bin/antoinelaborderiedotcom

EXPOSE 3000

CMD ["antoinelaborderiedotcom"]

