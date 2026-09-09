# ============================================================
# 1. BASE IMAGE
# ============================================================

# We need Node.js because our application is a Next.js application.
#
# node:20-alpine means:
#   Node.js version 20
#   Alpine Linux as the small base operating system
#
# Your project uses Next.js 14.2.5 and Node 20 is a good choice.
#
FROM node:20-alpine


# ============================================================
# 2. WORKING DIRECTORY
# ============================================================

# Create /app inside the Docker container
# and make it the current working directory.
#
# After this:
#
#     /app
#       ├── package.json
#       ├── app/
#       └── ...
#
WORKDIR /app


# ============================================================
# 3. COPY PACKAGE FILES
# ============================================================

# Copy package.json from our computer into /app
#
# package.json contains:
#   - dependencies
#   - devDependencies
#   - scripts
#
COPY package.json package-lock.json ./


# ============================================================
# 4. INSTALL DEPENDENCIES
# ============================================================

# npm ci installs dependencies using package-lock.json.
#
# Why npm ci instead of npm install?
#
# npm ci is designed for:
#   - Docker
#   - CI/CD
#   - production builds
#
# It installs the exact dependency versions
# stored in package-lock.json.
#
RUN npm ci


# ============================================================
# 5. COPY PROJECT SOURCE CODE
# ============================================================

# Copy everything from our project into /app.
#
# This includes:
#
#   app/
#   next.config.js
#   tsconfig.json
#   next-env.d.ts
#   etc.
#
COPY . .


# ============================================================
# 6. BUILD NEXT.JS APPLICATION
# ============================================================

# This executes:
#
#     npm run build
#
# which comes from your package.json:
#
#     "build": "next build"
#
# Next.js creates the production build,
# usually inside the .next directory.
#
RUN npm run build


# ============================================================
# 7. EXPOSE APPLICATION PORT
# ============================================================

# Next.js production server normally runs on port 3000.
#
# This tells Docker that our application uses port 3000.
#
# IMPORTANT:
# EXPOSE does NOT make the application accessible
# from your computer by itself.
#
# We will connect the port when using docker run.
#
EXPOSE 3000


# ============================================================
# 8. START APPLICATION
# ============================================================

# This command runs when the Docker container starts.
#
# It executes:
#
#     npm start
#
# Your package.json contains:
#
#     "start": "next start"
#
# Therefore Next.js will run in production mode.
#
CMD ["npm", "start"]