from fastapi import FastAPI, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import models
from database import engine, get_db

# DB 테이블 생성
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="PDA Return System")

# 정적 파일 서빙 (CSS, JS 등)
app.mount("/static", StaticFiles(directory="static"), name="static")

# HTML 템플릿 서빙
templates = Jinja2Templates(directory="templates")

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# === API 엔드포인트 ===

@app.get("/api/products/{barcode}")
def get_product(barcode: str, store: str = None, batch: str = None, db: Session = Depends(get_db)):
    """
    특정 바코드/상품코드 상품 조회.
    1차: 상품 마스터에서 상품 정보 획득 (여러 개일 수 있음)
    2차: 해당 점포/차수의 반품 예정 리스트에 있는지 확인하여 예정 수량 반환
    """
    # 1. 마스터 조회 (바코드 또는 코드로)
    products = db.query(models.ProductMaster).filter(
        (models.ProductMaster.barcode == barcode) | (models.ProductMaster.code == barcode)
    ).all()
    
    if not products:
        # DB에 없을 경우 기본 템플릿 반환
        return [{
            "name": f"미등록상품({barcode})",
            "code": barcode,
            "expected_qty": 0,
            "is_planned": False,
            "fixed_cell": None,
            "scanned_normal_now": 0,
            "scanned_defective_now": 0
        }]

    results = []
    for product in products:
        expected_qty = 0
        is_planned = False
        scanned_normal = 0
        scanned_defective = 0

        # 반품 예정 수량 확인
        if store and batch:
            plan = db.query(models.ReturnPlan).filter(
                models.ReturnPlan.store_name == store,
                models.ReturnPlan.product_code == product.code,
                models.ReturnPlan.batch_name == batch
            ).first()
            if plan:
                expected_qty = plan.expected_qty
                is_planned = True
                
            # 현재까지 해당 차수에 스캔된 누적 수량 가져오기
            from sqlalchemy.sql import func
            scan_sum = db.query(
                func.sum(models.ScanRecord.normal_qty).label("n"),
                func.sum(models.ScanRecord.defective_qty).label("d")
            ).filter(
                models.ScanRecord.store_name == store,
                models.ScanRecord.product_code == product.code,
                models.ScanRecord.batch_name == batch
            ).first()
            
            scanned_normal = scan_sum.n or 0
            scanned_defective = scan_sum.d or 0

        results.append({
            "name": product.name,
            "code": product.code,
            "expected_qty": expected_qty,
            "is_planned": is_planned,
            "fixed_cell": product.fixed_cell,
            "scanned_normal_now": scanned_normal,
            "scanned_defective_now": scanned_defective
        })

    return results

from sqlalchemy.sql import func

@app.post("/api/scan")
def register_scan(data: dict, db: Session = Depends(get_db)):
    """작업자의 정상/불량 스캔 내역 저장"""
    new_scan = models.ScanRecord(
        batch_name=data.get('batch_name', '기본차수'),
        store_name=data.get('store_name'),
        product_code=data.get('barcode'),
        normal_qty=int(data.get('normal_qty', 0)),
        defective_qty=int(data.get('defective_qty', 0)),
        notes=data.get('notes', ''),
        worker=data.get('worker', 'worker')
    )
    db.add(new_scan)
    db.commit()
    return {"status": "success"}

from pydantic import BaseModel

class ScanUpdate(BaseModel):
    normal_qty: int
    defective_qty: int
    notes: str = None

@app.get("/api/scans")
def list_scans(store: str = None, batch: str = None, db: Session = Depends(get_db)):
    """마스터 대시보드용 스캔 내역 반환"""
    query = db.query(models.ScanRecord)
    if store and store != "전체":
        query = query.filter(models.ScanRecord.store_name == store)
    if batch and batch != "전체":
        query = query.filter(models.ScanRecord.batch_name == batch)
        
    scans = query.order_by(models.ScanRecord.scanned_at.desc()).all()
    
    results = []
    for s in scans:
        product = db.query(models.ProductMaster).filter(models.ProductMaster.code == s.product_code).first()
        prod_name = product.name if product else f"미등록상품({s.product_code})"
        results.append({
            "id": s.id,
            "batch_name": s.batch_name,
            "store_name": s.store_name,
            "product_code": s.product_code,
            "product_name": prod_name,
            "normal_qty": s.normal_qty,
            "defective_qty": s.defective_qty,
            "notes": s.notes,
            "scanned_at": s.scanned_at.strftime("%Y-%m-%d %H:%M:%S") if s.scanned_at else "-",
            "worker": s.worker
        })
    return results

from fastapi.responses import StreamingResponse

@app.get("/api/export/scans")
def export_scans_excel(store: str = None, batch: str = None, db: Session = Depends(get_db)):
    """전체 스캔 내역 엑셀 다운로드"""
    import pandas as pd
    from io import BytesIO

    query = db.query(models.ScanRecord)
    if store and store != "전체":
        query = query.filter(models.ScanRecord.store_name == store)
    if batch and batch != "전체":
        query = query.filter(models.ScanRecord.batch_name == batch)
        
    scans = query.order_by(models.ScanRecord.scanned_at.desc()).all()
    
    data = []
    for s in scans:
        product = db.query(models.ProductMaster).filter(models.ProductMaster.code == s.product_code).first()
        prod_name = product.name if product else f"미등록상품({s.product_code})"
        data.append({
            "ID": s.id,
            "차수": s.batch_name,
            "점포명": s.store_name,
            "상품코드": s.product_code,
            "상품명": prod_name,
            "정상수량": s.normal_qty,
            "불량수량": s.defective_qty,
            "특이사항": s.notes,
            "처리일시": s.scanned_at.strftime("%Y-%m-%d %H:%M:%S") if s.scanned_at else "-",
            "작업자": s.worker
        })
        
    df = pd.DataFrame(data)
    output = BytesIO()
    
    # openpyxl 엔진을 사용하여 Excel 생성
    try:
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='스캔내역')
    except ImportError:
        # openpyxl이 없을 경우 CSV로 폴백 반환
        output = BytesIO(df.to_csv(index=False).encode('utf-8-sig'))
        headers = {'Content-Disposition': 'attachment; filename="scan_history.csv"'}
        return StreamingResponse(output, headers=headers, media_type='text/csv')

    output.seek(0)
    headers = {
        'Content-Disposition': 'attachment; filename="scan_history.xlsx"'
    }
    return StreamingResponse(output, headers=headers, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

@app.put("/api/scans/{scan_id}")
def update_scan(scan_id: int, data: ScanUpdate, db: Session = Depends(get_db)):
    """특정 스캔 내역 수정"""
    scan = db.query(models.ScanRecord).filter(models.ScanRecord.id == scan_id).first()
    if not scan:
        return {"status": "error", "message": "해당 내역을 찾을 수 없습니다."}
    
    scan.normal_qty = data.normal_qty
    scan.defective_qty = data.defective_qty
    if data.notes is not None:
        scan.notes = data.notes
        
    db.commit()
    return {"status": "success"}

@app.delete("/api/scans/{scan_id}")
def delete_scan(scan_id: int, db: Session = Depends(get_db)):
    """특정 스캔 내역 삭제"""
    deleted_count = db.query(models.ScanRecord).filter(models.ScanRecord.id == scan_id).delete()
    db.commit()
    return {"status": "success", "deleted": deleted_count}

@app.get("/api/plan/{store}")
def get_return_plan(store: str, batch: str = "기본차수", db: Session = Depends(get_db)):
    """점포/차수별 반품(입고) 예정 정보 및 현재 스캔 누적 수량 반환"""
    # 1. DB에서 예정 리스트 가져오기
    plans = db.query(models.ReturnPlan).filter(
        models.ReturnPlan.store_name == store,
        models.ReturnPlan.batch_name == batch
    ).all()
    mock_plans = []
    for plan in plans:
        product = db.query(models.ProductMaster).filter(models.ProductMaster.code == plan.product_code).first()
        prod_name = product.name if product else f"미등록({plan.product_code})"
        mock_plans.append({
            "product_code": plan.product_code,
            "name": prod_name,
            "expected_qty": plan.expected_qty
        })

    # DB에서 해당 점포, 차수의 스캔 내역 합산
    scans = db.query(
        models.ScanRecord.product_code,
        func.sum(models.ScanRecord.normal_qty).label("total_normal"),
        func.sum(models.ScanRecord.defective_qty).label("total_defective")
    ).filter(
        models.ScanRecord.store_name == store,
        models.ScanRecord.batch_name == batch
    ).group_by(models.ScanRecord.product_code).all()

    scan_dict = {s.product_code: (s.total_normal or 0, s.total_defective or 0) for s in scans}
    
    results = []
    # 1. 예정 리스트 데이터
    for p in mock_plans:
        code = p["product_code"]
        n_qty, d_qty = scan_dict.pop(code, (0, 0))
        results.append({
            "product_code": code,
            "name": p["name"],
            "expected_qty": p["expected_qty"],
            "scanned_normal": n_qty,
            "scanned_defective": d_qty
        })
        
    # 2. 예정 리스트에 없는데 스캔된 상품들 추가 (초과/예외 반품)
    for code, (n_qty, d_qty) in scan_dict.items():
        results.append({
            "product_code": code,
            "name": f"상품_{code}", # 임시 마스터 조회명 대체
            "expected_qty": 0,
            "scanned_normal": n_qty,
            "scanned_defective": d_qty
        })
        
        
    return results

@app.get("/api/stores")
def list_stores(batch: str = None, db: Session = Depends(get_db)):
    """반품 예정 리스트에 등록된 차수별 고유 점포명 목록 반환"""
    query = db.query(models.ReturnPlan.store_name).distinct()
    if batch and batch != "전체":
        query = query.filter(models.ReturnPlan.batch_name == batch)
        
    stores = query.all()
    # 튜플 리스트에서 문자열 리스트로 변환
    store_list = [s[0] for s in stores if s[0]]
    return {"stores": store_list}

@app.get("/api/batches")
def list_batches(db: Session = Depends(get_db)):
    """등록된 모든 차수명(batch_name) 목록 반환. 스캔만 된 이력도 가져올 수 있게 통합조회 필요 시 UNION 활용가능, 여기선 ReturnPlan 우선"""
    batches = db.query(models.ReturnPlan.batch_name).distinct().all()
    # ReturnPlan에 없는 예외 스캔 차수도 찾기
    scan_batches = db.query(models.ScanRecord.batch_name).distinct().all()
    
    batch_set = set([b[0] for b in batches if b[0]]) | set([b[0] for b in scan_batches if b[0]])
    return {"batches": sorted(list(batch_set))}

@app.delete("/api/batches/{batch_name}")
def delete_batch(batch_name: str, db: Session = Depends(get_db)):
    """특정 차수 전체 삭제 (예정 리스트 및 스캔 내역 모두 삭제)"""
    if not batch_name or batch_name == '전체':
        return {"status": "error", "message": "'전체' 또는 빈 차수는 일괄 삭제할 수 없습니다."}
        
    plan_deleted = db.query(models.ReturnPlan).filter(models.ReturnPlan.batch_name == batch_name).delete()
    scan_deleted = db.query(models.ScanRecord).filter(models.ScanRecord.batch_name == batch_name).delete()
    db.commit()
    
    return {
        "status": "success", 
        "message": f"[{batch_name}] 삭제 완료! (예정리스트 {plan_deleted}건, 스캔기록 {scan_deleted}건 삭제)"
    }

@app.get("/api/masters")
def list_masters(db: Session = Depends(get_db)):
    """등록된 전체 상품 마스터 조회"""
    masters = db.query(models.ProductMaster).all()
    return [{"id": m.id, "barcode": m.barcode, "code": m.code, "name": m.name} for m in masters]

@app.get("/api/plans")
def list_plans(store: str = None, db: Session = Depends(get_db)):
    """반품 예정 리스트 전체 혹은 점포별 조회"""
    query = db.query(models.ReturnPlan)
    if store and store != "전체":
        query = query.filter(models.ReturnPlan.store_name == store)
    plans = query.all()
    
    results = []
    for p in plans:
        product = db.query(models.ProductMaster).filter(models.ProductMaster.code == p.product_code).first()
        prod_name = product.name if product else f"미등록상품({p.product_code})"
        results.append({
            "id": p.id,
            "store_name": p.store_name,
            "product_code": p.product_code,
            "product_name": prod_name,
            "expected_qty": p.expected_qty
        })
    return results

from fastapi import File, UploadFile, Form
import pandas as pd
import io
import math

# [이하 기존 upload_master 함수 유지...]
@app.post("/api/upload/master")
async def upload_master(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """상품 마스터 엑셀 업로드 및 처리"""
    contents = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(contents))
        
        # 컬럼 이름의 앞뒤 공백 제거 (엑셀 양식 특성 반영)
        df.columns = [str(c).strip().upper() for c in df.columns]
        
        # 기존 데이터를 불러와서 빠른 조회를 위해 딕셔너리로 구성 (상품코드 기준)
        existing_items = {item.code: item for item in db.query(models.ProductMaster).all()}
        
        added_count = 0
        updated_count = 0
        
        for _, row in df.iterrows():
            # 1. 바코드: SCAN_CODE 
            # 2. 상품코드: ITEM_CODE
            # 3. 상품명: SHORT_ITEM_NAME 또는 ITEM_NAME (없으면 FULL_ITEM_NAME)
            
            barcode = str(row.get('SCAN_CODE', '')).strip()
            code = str(row.get('ITEM_CODE', '')).strip()
            
            name = str(row.get('SHORT_ITEM_NAME', '')).strip()
            if not name or name == 'nan':
                name = str(row.get('ITEM_NAME', '')).strip()
            if not name or name == 'nan':
                name = str(row.get('FULL_ITEM_NAME', '')).strip()
            
            # fallback for code
            if not code or code == 'nan':
                code = barcode
                
            if code and code != 'nan':
                if code in existing_items:
                    pm = existing_items[code]
                    # 내용이 다를 경우에만 업데이트
                    if pm.barcode != (barcode if barcode != 'nan' else pm.barcode) or pm.name != name:
                        pm.barcode = barcode if barcode != 'nan' else pm.barcode
                        pm.name = name
                        updated_count += 1
                else:
                    pm = models.ProductMaster(barcode=barcode if barcode != 'nan' else code, code=code, name=name)
                    db.add(pm)
                    existing_items[code] = pm  # 엑셀 내 중복 방어용
                    added_count += 1

        db.commit()
        return {"status": "success", "message": f"마스터 업데이트 완료! (신규 등록: {added_count}건, 정보 갱신: {updated_count}건)"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/upload/plan")
async def upload_plan(batch_name: str = Form("기본차수"), file: UploadFile = File(...), db: Session = Depends(get_db)):
    """반품 예정 리스트 엑셀 업로드 및 처리 (차수별 적용)"""
    contents = await file.read()
    try:
        df = pd.read_excel(io.BytesIO(contents))
        
        # 해당 차수(batch_name)의 기존 예정 데이터만 삭제 후 덮어쓰기
        deleted = db.query(models.ReturnPlan).filter(models.ReturnPlan.batch_name == batch_name).delete()
        print(f"Deleted {deleted} existing plans for batch {batch_name}")
        
        # 컬럼 공백 제거 및 대문자화
        df.columns = [str(c).strip().upper() for c in df.columns]
        
        count = 0
        for _, row in df.iterrows():
            # 반품수주.xlsx 양식 기준 매핑
            # 점포명: STORE_NAME 또는 점포명, 점포 등
            store_name = ''
            for col in ['STORE_NAME', '점포명', '매장명', '점포']:
                if col in map(str.upper, df.columns):
                    idx = list(map(str.upper, df.columns)).index(col)
                    original_col = df.columns[idx]
                    store_name = str(row.get(original_col, '')).strip()
                    break
            
            # 상품코드: ITEM_CODE 또는 상품코드
            product_code = ''
            for col in ['ITEM_CODE', '상품코드', '상품 코드', '품번']:
                if col in map(str.upper, df.columns):
                    idx = list(map(str.upper, df.columns)).index(col)
                    original_col = df.columns[idx]
                    product_code = str(row.get(original_col, '')).strip()
                    break
                    
            # 수량: ORDER_QUANTITY 또는 수량
            qty_val = 0
            for col in ['ORDER_QUANTITY', '수량', '반품예정수량', '예정수량']:
                if col in map(str.upper, df.columns):
                    idx = list(map(str.upper, df.columns)).index(col)
                    original_col = df.columns[idx]
                    qty_val = row.get(original_col, 0)
                    break
            
            # pandas.isna 방어 및 int 변환
            if pd.isna(qty_val) or str(qty_val).strip() == '':
                qty = 0
            else:
                try:
                    qty = abs(int(float(qty_val))) # 반품이라 수량이 음수(-1)로 들어오는 처리 및 소수점 방어
                except:
                    qty = 0

            if store_name and store_name != 'nan' and product_code and product_code != 'nan':
                rp = models.ReturnPlan(batch_name=batch_name, store_name=store_name, product_code=product_code, expected_qty=qty)
                db.add(rp)
                count += 1
                
        db.commit()
        return {"status": "success", "message": f"[{batch_name}] 차수에 총 {count}건의 반품 예정 정보가 업로드되었습니다."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/aggregate-plans")
def get_aggregated_plans(db: Session = Depends(get_db)):
    """반품예정리스트 수량을 상품코드별로 합산하여 표시, 고정셀 포함"""
    from sqlalchemy.sql import func
    
    # ReturnPlan의 expected_qty를 product_code별로 sum
    subquery = db.query(
        models.ReturnPlan.product_code,
        func.sum(models.ReturnPlan.expected_qty).label('total_qty')
    ).group_by(models.ReturnPlan.product_code).subquery()

    # ProductMaster와 조인하여 상품명, 고정셀 등을 가져오고 수량 내림차순 정렬
    results = db.query(
        models.ProductMaster.code,
        models.ProductMaster.barcode,
        models.ProductMaster.name,
        models.ProductMaster.fixed_cell,
        func.coalesce(subquery.c.total_qty, 0).label('total_qty')
    ).outerjoin(
        subquery, models.ProductMaster.code == subquery.c.product_code
    ).filter(subquery.c.total_qty > 0).order_by(subquery.c.total_qty.desc()).all()

    plan_list = []
    for row in results:
        plan_list.append({
            "code": row.code,
            "barcode": row.barcode,
            "name": row.name,
            "fixed_cell": row.fixed_cell,
            "total_qty": row.total_qty
        })
    
    return plan_list

@app.post("/api/upload/locations")
async def upload_locations(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """고정 로케이션 엑셀 파일을 업로드하여 반품수량 순서대로 자동 맵핑"""
    from io import BytesIO
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents), header=None)
        
        # 엑셀 첫 번째 열의 데이터를 셀 이름 목록으로 간주
        if df.empty:
            return {"message": "엑셀 파일이 비어있습니다.", "status": "error"}
            
        cells = df.iloc[:, 0].dropna().astype(str).tolist()
        cells = [c.strip() for c in cells if c.strip() != '']
        
        if not cells:
            return {"message": "업로드된 파일에서 셀 정보를 찾을 수 없습니다.", "status": "error"}

        # 예정수량 합계 내림차순으로 상품 목록 가져오기
        aggregated = get_aggregated_plans(db)
        
        if not aggregated:
            return {"message": "현재 등록된 반품 예정 데이터가 없어 로케이션을 배정할 수 없습니다.", "status": "error"}

        # 자동 맵핑 (상위 N개 상품에 N개의 셀 배정)
        assign_count = 0
        for i, item in enumerate(aggregated):
            if i < len(cells):
                # DB 업데이트
                prod = db.query(models.ProductMaster).filter(models.ProductMaster.code == item['code']).first()
                if prod:
                    prod.fixed_cell = cells[i]
                    assign_count += 1
            else:
                break
                
        db.commit()
        return {"status": "success", "message": f"총 {assign_count}건의 로케이션이 상위 반품예정 상품에 자동 배정되었습니다."}

    except Exception as e:
        return {"status": "error", "message": f"파일 처리 중 오류: {str(e)}"}
