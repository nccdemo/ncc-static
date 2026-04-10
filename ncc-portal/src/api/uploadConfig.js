// Centralized upload endpoints for FastAPI backend

export const FASTAPI_UPLOAD_ORIGIN = (
  import.meta.env.VITE_FASTAPI_ORIGIN || 'http://localhost:8000'
).replace(/\/$/, '')

export const uploadLogoUrl = () => `${FASTAPI_UPLOAD_ORIGIN}/api/bnb/upload-logo`

export const uploadCoverUrl = () => `${FASTAPI_UPLOAD_ORIGIN}/api/bnb/upload-cover`
