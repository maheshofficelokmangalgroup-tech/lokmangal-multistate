# Shortcuts. Everything here is also a plain command (see README.md) for people without `just`.
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]

default:
    @just --list

# Install JavaScript dependencies for every workspace
setup:
    npm install
    cd backend; cargo fetch

# Start PostgreSQL and Mailpit
services:
    docker compose up -d

# Apply database migrations
migrate:
    cd backend; cargo run --bin lokmangal-cli -- migrate

# Import the current website content as the starting data
seed:
    cd backend; cargo run --bin lokmangal-cli -- import-seed ../frontend/seed/snapshot.json

# Print an invitation link for a first Super Admin
admin email name:
    cd backend; cargo run --bin lokmangal-cli -- create-admin --email {{email}} --name "{{name}}"

# Run the API, worker and the local site/preview servers
api:
    cd backend; cargo run --bin lokmangal-server

# Run the release builder (Astro)
builder:
    npm run builder -w @lokmangal/frontend

# Run the admin panel (http://localhost:5173)
admin-dev:
    npm run dev -w @lokmangal/admin

# Run the public site from the seed content (http://localhost:4321)
site-dev:
    npm run dev -w @lokmangal/frontend

# All fast checks
test:
    cd backend; cargo test
    npm run test:finance
    npm test -w @lokmangal/admin

# API integration tests (needs TEST_DATABASE_URL, see README.md)
test-api:
    cd backend; cargo test -- --include-ignored

# Full check as CI runs it
check:
    cd backend; cargo fmt --check; cargo clippy --all-targets -- -D warnings
    npm run typecheck -w @lokmangal/admin
    npm run build -w @lokmangal/admin
    npm run build:site:seed

# Publish → live → enquiry → preview, against a running stack
e2e invite:
    node tests/e2e/publish-smoke.mjs "{{invite}}"
