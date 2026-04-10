Write-Host "🚀 Starting FastAPI in dev mode..."

.\venv\Scripts\Activate
uvicorn app.main:app --reload