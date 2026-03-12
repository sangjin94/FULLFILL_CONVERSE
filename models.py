from sqlalchemy import Column, Integer, String, DateTime
from database import Base
import datetime

class ProductMaster(Base):
    __tablename__ = "product_master"

    id = Column(Integer, primary_key=True, index=True)
    barcode = Column(String, index=True)              # 상품바코드 (중복 허용)
    code = Column(String, unique=True, index=True)    # 상품코드 (실제 고유값)
    name = Column(String)                             # 상품명
    fixed_cell = Column(String, nullable=True)        # 고정 로케이션 (셀 단위)

class ReturnPlan(Base):
    __tablename__ = "return_plan"

    id = Column(Integer, primary_key=True, index=True)
    batch_name = Column(String, index=True, default="기본차수") # 차수명
    store_name = Column(String, index=True)           # 점포명
    product_code = Column(String, index=True)         # 상품코드
    expected_qty = Column(Integer, default=0)         # 예상수량 (정상/불량 합산 예정)

class ScanRecord(Base):
    __tablename__ = "scan_record"

    id = Column(Integer, primary_key=True, index=True)
    batch_name = Column(String, index=True, default="기본차수") # 차수명
    store_name = Column(String, index=True)           # 점포명
    product_code = Column(String, index=True)         # 스캔된 상품코드
    normal_qty = Column(Integer, default=0)           # 정상 검수 수량
    defective_qty = Column(Integer, default=0)        # 불량 검수 수량
    notes = Column(String, nullable=True)             # 특이사항 (메모)
    scanned_at = Column(DateTime, default=datetime.datetime.utcnow) # 처리일자
    worker = Column(String, default="worker")         # 작업자/관리자 명의
