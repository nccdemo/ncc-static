from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.company import Company


def get_current_company(
    db: Session = Depends(get_db),
    x_company_id: int | None = Header(default=None, alias="X-Company-Id"),
) -> Company | None:
    """
    Backward-compatible company context.

    - If X-Company-Id is provided: load and return Company or 404.
    - If not provided: return None (acts like single-tenant mode).
    """
    if x_company_id is None:
        return None

    company = db.query(Company).filter(Company.id == x_company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company

