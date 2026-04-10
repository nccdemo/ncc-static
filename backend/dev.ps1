$ErrorActionPreference = "Stop"

if (Test-Path "venv\\Scripts\\Activate.ps1") {
  . "venv\\Scripts\\Activate.ps1"
}

uvicorn app.main:app --reload
