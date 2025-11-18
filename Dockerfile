# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json .npmrc ./

# Install ALL dependencies (including devDependencies for build)
RUN npm install

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json .npmrc ./

# Install only production dependencies
RUN npm install --omit=dev

# Copy built frontend from builder
COPY --from=builder /app/dist ./dist

# Copy server code
COPY server ./server

# Expose port
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start server
CMD ["npm", "start"]
