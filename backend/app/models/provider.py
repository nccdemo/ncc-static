from sqlalchemy import Column, Float, ForeignKey, Integer, String

from app.database import Base


class Provider(Base):
    __tablename__ = "providers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    type = Column(String, nullable=False, index=True)
    # B&B public profile (optional; used for referral branding)
    name = Column(String, nullable=True)
    logo = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)
    cover_url = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    city = Column(String, nullable=True)
    referral_code = Column(String, nullable=True, index=True)
    stripe_account_id = Column(String, nullable=True, index=True)
    total_earnings = Column(Float, nullable=False, default=0.0)
