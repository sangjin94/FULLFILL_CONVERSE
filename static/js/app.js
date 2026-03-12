// 전역 상태 관리
let currentState = {
    role: null,        // 'worker' or 'master'
    batchName: null,   // 선택된 작업 차수
    storeName: null,   // 선택된 점포명
    workerName: '작업자1' // 임시 하드코딩 (추후 로그인 시 할당)
};

// DOM Elements
const views = {
    roleSelect: document.getElementById('view-role-select'),
    scan: document.getElementById('view-scan'),
    dashboard: document.getElementById('view-dashboard')
};

// 모바일 브라우저 주소창 숨기기 헬퍼
function hideAddressBar() {
    setTimeout(function () {
        window.scrollTo(0, 1);
    }, 0);
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    hideAddressBar(); // 화면 전환 시 주소창을 숨기기 위해 스크롤 이동
}

// 1. 초기 렌더링 및 점포목록 가져오기
document.addEventListener('DOMContentLoaded', async () => {
    // 마스터 역할은 추후 인증을 넣거나, 점포 리스트를 동적으로 불러옴
    await loadAvailableStores();

    // 세션 복원 시도 (점포 목록 로드 이후 실행)
    restoreSession();

    // 역할 선택 시 UI 토글
    document.getElementById('select-role').addEventListener('change', (e) => {
        const workerNameGroup = document.getElementById('worker-name-group');
        const batchGroup = document.getElementById('batch-group');
        const storeGroup = document.getElementById('store-group');
        if (e.target.value === 'master') {
            workerNameGroup.classList.add('hidden');
            batchGroup.classList.add('hidden');
            storeGroup.classList.add('hidden');
        } else {
            workerNameGroup.classList.remove('hidden');
            batchGroup.classList.remove('hidden');
            storeGroup.classList.remove('hidden');
        }
    });

    // Enter 키로 시스템 입장 시도
    document.getElementById('input-password').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') enterSystem();
    });
});

// 초기 사용할 때 로그인 화면의 차수 목록 로드
async function loadAvailableStores() {
    const batchSelect = document.getElementById('select-batch');
    try {
        const res = await fetch('/api/batches');
        if (res.ok) {
            const data = await res.json();
            const batches = data.batches || [];

            let html = `<option value="">차수를 선택하세요...</option>`;
            if (batches.length === 0) {
                html = `<option value="">등록된 차수가 없습니다...</option>`;
            } else {
                html += batches.map(b => `<option value="${b}">${b}</option>`).join('');
            }
            html += `<option value="직접입력">직접 입력</option>`;

            batchSelect.innerHTML = html;
        }
    } catch (e) { console.error(e); }

    // 마스터 드롭다운 갱신
    await loadBatchesForMaster();
}

// 마스터 화면의 차수 드롭다운들 로드
async function loadBatchesForMaster() {
    try {
        const res = await fetch('/api/batches');
        if (res.ok) {
            const data = await res.json();
            const batches = data.batches || [];

            let html = `<option value="전체">전체 차수</option>`;
            html += batches.map(b => `<option value="${b}">${b}</option>`).join('');

            document.getElementById('master-batch-filter-all').innerHTML = html;
            document.getElementById('master-batch-filter-store').innerHTML = html;

            // 모달 관리쪽
            const tbody = document.getElementById('batch-manage-tbody');
            if (batches.length === 0) {
                tbody.innerHTML = '<tr><td colspan="2" class="text-center">등록된 차수가 없습니다.</td></tr>';
            } else {
                tbody.innerHTML = batches.map(b => `
                    <tr>
                        <td style="font-weight: bold; color: var(--accent-blue);">${b}</td>
                        <td><button class="btn btn-danger" style="padding: 0.2rem 0.5rem;" onclick="deleteBatch('${b}')">전체 삭제</button></td>
                    </tr>
                `).join('');
            }
        }
    } catch (e) { console.error(e); }
}

// 작업자: 차수 선택 변경 시 점포 로드
async function onBatchSelectChange() {
    const batchSelect = document.getElementById('select-batch');
    const customInput = document.getElementById('input-custom-batch');
    const storeSelect = document.getElementById('select-store');

    if (batchSelect.value === '직접입력') {
        customInput.classList.remove('hidden');
        storeSelect.innerHTML = `<option value="">새 차수입니다. 바로 점포를 확인하려면 차수가 지정되어야 합니다.</option>`;
    } else {
        customInput.classList.add('hidden');
        if (!batchSelect.value) {
            storeSelect.innerHTML = `<option value="">차수를 먼저 선택해주세요...</option>`;
            return;
        }

        storeSelect.innerHTML = `<option value="">불러오는 중...</option>`;
        try {
            const res = await fetch(`/api/stores?batch=${encodeURIComponent(batchSelect.value)}`);
            if (res.ok) {
                const data = await res.json();
                const stores = data.stores || [];
                let html = '';
                if (stores.length === 0) {
                    html = `<option value="">등록된 점포가 없습니다</option>`;
                } else {
                    html += stores.map(store => `<option value="${store}">${store}</option>`).join('');
                }
                storeSelect.innerHTML = html;
            }
        } catch (e) { console.error(e); }
    }
}

// 마스터 점포뷰: 차수 변경 시 점포 로드
async function loadStoreListForMasterStoreView() {
    const batch = document.getElementById('master-batch-filter-store').value;
    const storeSelect = document.getElementById('master-store-filter');
    const scanTbody = document.getElementById('store-scan-tbody');
    const planTbody = document.getElementById('store-plan-tbody');

    scanTbody.innerHTML = '<tr><td colspan="7" class="text-center">위에서 점포를 선택해주세요.</td></tr>';
    planTbody.innerHTML = '<tr><td colspan="4" class="text-center">위에서 점포를 선택해주세요.</td></tr>';

    try {
        const res = await fetch(`/api/stores?batch=${encodeURIComponent(batch)}`);
        if (res.ok) {
            const data = await res.json();
            const stores = data.stores || [];
            let html = '<option value="">점포를 선택하세요</option>';
            html += stores.map(s => `<option value="${s}">${s}</option>`).join('');
            storeSelect.innerHTML = html;
        }
    } catch (e) { console.error(e); }
}

// 2. 시스템 입장 (역할/점포 선택 후)
function enterSystem() {
    const roleEl = document.getElementById('select-role');
    const workerNameEl = document.getElementById('input-worker-name');
    const passwordEl = document.getElementById('input-password');

    currentState.role = roleEl.value;
    const pwd = passwordEl.value.trim();

    if (currentState.role === 'worker') {
        const batchSelect = document.getElementById('select-batch');
        const customBatch = document.getElementById('input-custom-batch');
        const storeEl = document.getElementById('select-store');

        let batchName = batchSelect.value;
        if (batchName === '직접입력') {
            batchName = customBatch.value.trim();
        }

        if (!batchName) {
            alert("작업 차수를 선택하거나 입력해주세요.");
            return;
        }

        currentState.batchName = batchName;
        currentState.storeName = storeEl.value;

        if (pwd !== '1111') {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }
        if (!workerNameEl.value.trim()) {
            alert("작업자 이름을 입력해주세요.");
            return;
        }

        currentState.workerName = workerNameEl.value.trim();
        document.getElementById('user-info').classList.remove('hidden');

        // 워커 헤더 뷰 On
        document.getElementById('worker-header-info').classList.remove('hidden');
        document.getElementById('current-store-master').classList.add('hidden');
        document.getElementById('current-worker-name').innerText = currentState.workerName;
        document.getElementById('header-batch-name').innerText = `[${currentState.batchName}]`;

        const headerStoreSelect = document.getElementById('header-store-select');
        headerStoreSelect.innerHTML = '';
        Array.from(storeEl.options).forEach(opt => {
            if (opt.value && opt.value !== '전체' && !opt.value.includes('오류') && !opt.value.includes('없습니다') && !opt.value.includes('먼저')) {
                const newOpt = document.createElement('option');
                newOpt.value = opt.value;
                newOpt.text = opt.text;
                headerStoreSelect.appendChild(newOpt);
            }
        });

        // 직접입력이거나 옵션에 없는 새 점포면 어쩔수없이 추가
        if (currentState.storeName && !Array.from(headerStoreSelect.options).find(o => o.value === currentState.storeName)) {
            const newOpt = document.createElement('option');
            newOpt.value = currentState.storeName;
            newOpt.text = currentState.storeName;
            headerStoreSelect.appendChild(newOpt);
        }

        headerStoreSelect.value = currentState.storeName;

        if (!currentState.storeName || currentState.storeName.includes('없습니다') || currentState.storeName.includes('먼저')) {
            alert("작업 가능한 특정 점포를 선택해주세요.");
            logout();
            return;
        }
        switchView('scan');
        document.getElementById('plan-store-name').innerText = currentState.storeName;
        loadReturnPlan(currentState.storeName, currentState.batchName);
        document.getElementById('barcode-input').focus();
    } else {
        if (pwd !== '2306') {
            alert("비밀번호가 일치하지 않습니다.");
            return;
        }

        document.getElementById('user-info').classList.remove('hidden');

        // 마스터 헤더 뷰 On
        document.getElementById('worker-header-info').classList.add('hidden');
        document.getElementById('current-store-master').classList.remove('hidden');
        document.getElementById('current-store-master').innerText = `전체 (마스터 관리자)`;

        switchView('dashboard');
        loadBatchesForMaster(); // 차수 로드
        switchDashboardTab('all'); // 초기 탭 설정
    }

    // 세션 저장 (30분 만료)
    const expireTime = new Date().getTime() + 30 * 60 * 1000;
    localStorage.setItem('pdaSession', JSON.stringify({
        role: currentState.role,
        batchName: currentState.batchName,
        storeName: currentState.storeName,
        workerName: currentState.workerName,
        expires: expireTime
    }));
}

// 세션 복원
function restoreSession() {
    const sessionDataStr = localStorage.getItem('pdaSession');
    if (sessionDataStr) {
        try {
            const sessionData = JSON.parse(sessionDataStr);
            if (new Date().getTime() < sessionData.expires) {
                // 세션 유효함, 상태 복원
                currentState.role = sessionData.role;
                currentState.batchName = sessionData.batchName || '기본차수';
                currentState.storeName = sessionData.storeName;
                currentState.workerName = sessionData.workerName;

                // 만료 시간 갱신 (다시 30분)
                sessionData.expires = new Date().getTime() + 30 * 60 * 1000;
                localStorage.setItem('pdaSession', JSON.stringify(sessionData));

                // UI 적용
                document.getElementById('user-info').classList.remove('hidden');
                document.getElementById('view-role-select').classList.add('hidden');

                if (currentState.role === 'worker') {
                    document.getElementById('worker-header-info').classList.remove('hidden');
                    document.getElementById('current-store-master').classList.add('hidden');
                    document.getElementById('current-worker-name').innerText = currentState.workerName;
                    document.getElementById('header-batch-name').innerText = `[${currentState.batchName}]`;

                    const headerStoreSelect = document.getElementById('header-store-select');
                    headerStoreSelect.innerHTML = `<option value="${currentState.storeName}">${currentState.storeName}</option>`;
                    headerStoreSelect.value = currentState.storeName;

                    switchView('scan');
                    document.getElementById('plan-store-name').innerText = currentState.storeName;
                    loadReturnPlan(currentState.storeName, currentState.batchName);
                    setTimeout(() => {
                        const barcodeInput = document.getElementById('barcode-input');
                        if (barcodeInput) barcodeInput.focus();
                    }, 100);
                } else if (currentState.role === 'master') {
                    document.getElementById('select-role').value = 'master';
                    document.getElementById('worker-header-info').classList.add('hidden');
                    document.getElementById('current-store-master').classList.remove('hidden');
                    document.getElementById('current-store-master').innerText = `전체 (마스터 관리자)`;

                    switchView('dashboard');
                    loadBatchesForMaster();
                    switchDashboardTab('all');
                }
            } else {
                // 만료됨
                localStorage.removeItem('pdaSession');
            }
        } catch (e) {
            console.error("세션 파싱 에러", e);
            localStorage.removeItem('pdaSession');
        }
    }
}

// 작업자: 반품(입고) 예정 리스트 로드
async function loadReturnPlan(storeName, batchName) {
    const tbody = document.getElementById('plan-tbody');
    tbody.innerHTML = '<tr><td colspan="3" class="text-center">데이터를 불러오는 중...</td></tr>';

    try {
        const res = await fetch(`/api/plan/${encodeURIComponent(storeName)}?batch=${encodeURIComponent(batchName)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center">해당 차수에 예정된 반품 내역이 없습니다. (무제한 스캔)</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(item => {
                let statusHtml = '';
                const totalScanned = item.scanned_normal + item.scanned_defective;
                if (item.expected_qty === 0) {
                    statusHtml = `<span style="background: rgba(239,68,68,0.1); padding: 2px 4px; border-radius: 4px; color:var(--accent-red); font-weight:bold;">예외</span>`;
                } else if (totalScanned > item.expected_qty) {
                    statusHtml = `<span style="background: rgba(239,68,68,0.1); padding: 2px 4px; border-radius: 4px; color:var(--accent-red); font-weight:bold;">초과</span>`;
                } else if (totalScanned === item.expected_qty) {
                    statusHtml = `<span style="background: rgba(16,185,129,0.1); padding: 2px 4px; border-radius: 4px; color:var(--accent-green); font-weight:bold;">완료</span>`;
                } else {
                    statusHtml = `<span style="background: rgba(59,130,246,0.1); padding: 2px 4px; border-radius: 4px; color:var(--accent-blue); font-weight:bold;">진행중</span>`;
                }

                return `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="font-size: 0.85rem;">${item.product_code}</td>
                    <td style="font-weight: 500; font-size: 0.9rem;">
                        ${item.name}
                        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 2px;">
                            목표: <span style="font-weight: bold; color: var(--accent-blue);">${item.expected_qty}</span>개
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <div style="font-size: 0.85rem; margin-bottom: 2px;">
                            <span style="color:var(--accent-green)">정:${item.scanned_normal}</span> / <span style="color:var(--accent-red)">불:${item.scanned_defective}</span>
                        </div>
                        <div style="font-size: 0.75rem;">${statusHtml}</div>
                    </td>
                    <td style="text-align: center; color: var(--accent-red); font-weight: bold;">
                        ${item.fixed_cell || '미배정'}
                    </td>
                </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center" style="color:var(--accent-red)">예정 리스트를 불러오지 못했습니다.</td></tr>';
        }
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center">서버 연결 오류</td></tr>';
    }
}

// 로그아웃
function logout() {
    currentState.role = null;
    currentState.storeName = null;
    localStorage.removeItem('pdaSession');
    document.getElementById('user-info').classList.add('hidden');
    switchView('roleSelect');
}

// 점포 변경 (헤더 드롭다운)
function changeStoreFromHeader() {
    const newStore = document.getElementById('header-store-select').value;
    if (newStore === currentState.storeName) return;

    if (!confirm(`작업 점포를 [${newStore}]로 변경하시겠습니까?`)) {
        document.getElementById('header-store-select').value = currentState.storeName;
        return;
    }

    currentState.storeName = newStore;

    // Select-store (로그인 화면 드롭다운) 동기화
    const storeSelect = document.getElementById('select-store');
    if (storeSelect) storeSelect.value = newStore;

    // 세션 갱신
    const sessionDataStr = localStorage.getItem('pdaSession');
    if (sessionDataStr) {
        try {
            const sessionData = JSON.parse(sessionDataStr);
            sessionData.storeName = newStore;
            sessionData.expires = new Date().getTime() + 30 * 60 * 1000;
            localStorage.setItem('pdaSession', JSON.stringify(sessionData));
        } catch (e) { }
    }

    document.getElementById('plan-store-name').innerText = currentState.storeName;
    loadReturnPlan(currentState.storeName, currentState.batchName);

    // 진행중인 스캔 폼 초기화
    document.getElementById('barcode-input').value = '';
    document.getElementById('duplicate-selection').classList.add('hidden');
    document.getElementById('scan-result').classList.add('hidden');
    document.getElementById('barcode-input').focus();

    // 알림용 Toast 혹은 간략 Alert (선택사항)
    // alert(`점포가 ${newStore}로 변경되었습니다.`);
}

// 현재 조회된 중복 상품 임시 저장소
let currentScannedProducts = [];

// 2. 바코드 스캔 처리 (Worker)
async function handleScan() {
    const barcode = document.getElementById('barcode-input').value.trim();
    if (!barcode) return alert("바코드를 입력해주세요.");

    document.getElementById('duplicate-selection').classList.add('hidden');
    document.getElementById('scan-result').classList.add('hidden');

    try {
        const response = await fetch(`/api/products/${encodeURIComponent(barcode)}?store=${encodeURIComponent(currentState.storeName)}&batch=${encodeURIComponent(currentState.batchName)}`);
        if (response.ok) {
            const products = await response.json();

            // 검색 결과 없음 (마스터에 없고 DB에도 없는 경우) - API가 기본 미등록 리스트를 보내나 0건으로 올 수도 있음
            if (!products || products.length === 0) {
                alert("조회된 상품이 없습니다.");
                return;
            }

            // 상품이 1건일 경우 직행
            if (products.length === 1) {
                renderProductResult(products[0]);
            }
            // 2건 이상 동일 바코드가 존재할 경우
            else {
                currentScannedProducts = products;
                const dupList = document.getElementById('duplicate-list');

                dupList.innerHTML = products.map((p, index) => `
                    <label class="flex gap-2 items-center" style="padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; cursor: pointer;">
                        <input type="radio" name="dup_product" value="${index}" ${index === 0 ? 'checked' : ''}>
                        <div>
                            <div style="font-weight: 600;">${p.name}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">코드: ${p.code} | 예정: ${p.expected_qty}개</div>
                        </div>
                    </label>
                `).join('');

                document.getElementById('duplicate-selection').classList.remove('hidden');
            }
        } else {
            alert("서버 통신 오류가 발생했습니다.");
        }
    } catch (err) {
        console.error(err);
        alert("예기치 않은 통신 오류가 발생했습니다.");
    }
}

// 중복 선택 완료
function confirmDuplicateSelection() {
    const selectedRadio = document.querySelector('input[name="dup_product"]:checked');
    if (!selectedRadio) return alert("상품을 선택해주세요.");

    const index = parseInt(selectedRadio.value);
    const selectedProduct = currentScannedProducts[index];

    document.getElementById('duplicate-selection').classList.add('hidden');
    renderProductResult(selectedProduct);
}

// 스캔 결과 렌더링
function renderProductResult(product) {
    let planInfoHtml = '';

    // 정상/불량 누적 수량 (이번 차수 기준)
    const currentTotal = product.scanned_normal_now + product.scanned_defective_now;

    if (product.is_planned) {
        let statusText = '';
        let statusColor = '';

        if (currentTotal >= product.expected_qty) {
            statusText = '완료(또는 초과)';
            statusColor = 'var(--accent-green)';
        } else {
            statusText = '진행중';
            statusColor = 'var(--accent-blue)';
        }

        planInfoHtml = `
            <div style="background: rgba(59, 130, 246, 0.1); padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid var(--accent-blue);">
                <p style="margin-bottom:0.3rem;"><span style="color:var(--accent-blue); font-weight:bold;">✓ 예정 리스트 상품</span> (예정수량: <strong>${product.expected_qty}</strong>개) - 상태: <strong style="color:${statusColor}">${statusText}</strong></p>
                <div style="font-size: 0.9rem; color: var(--text-secondary); display:flex; gap: 1rem;">
                    <span>현재 누적 스캔 ➔</span>
                    <span style="color:var(--accent-green)">정상: <b>${product.scanned_normal_now}</b>개</span>
                    <span style="color:var(--accent-red)">불량: <b>${product.scanned_defective_now}</b>개</span>
                </div>
            </div>
        `;
    } else if (product.code === document.getElementById('barcode-input').value.trim() && product.name.includes("미등록상품")) {
        planInfoHtml = `<div style="background: rgba(239, 68, 68, 0.1); padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid var(--accent-red);"><p style="color:var(--accent-red); margin:0;">⚠️ 마스터/예정 리스트에 <strong>없는</strong> 미등록 상품입니다.</p></div>`;
    } else {
        planInfoHtml = `<div style="background: rgba(245, 158, 11, 0.1); padding: 0.8rem; border-radius: 8px; margin-bottom: 0.5rem; border: 1px solid var(--accent-orange);"><p style="color:var(--accent-orange); margin:0;">⚠️ 반품 예정 리스트에 <strong>없는</strong> '다른 상품'입니다. (초과/예외 반품)</p></div>`;
    }

    // 전송 시 바코드가 아닌 '선택된 상품코드'를 보내기 위해 저장 (중요)
    document.getElementById('barcode-input').dataset.selectedCode = product.code;

    const size = product.code && product.code.length >= 3 ? product.code.slice(-3) : '';
    const sizeHtml = size ? `<p><strong>사이즈(끝 3자리):</strong> <span style="font-size: 1.4rem; color: var(--accent-blue); font-weight: 800; background: #eef2ff; padding: 0.2rem 0.6rem; border-radius: 4px; border: 1px solid #c7d2fe;">${size}</span></p>` : '';
    const fixedCellStr = product.fixed_cell ? product.fixed_cell : '미배정';
    const fixedCellHtml = `<p><strong>로케이션(고정셀):</strong> <span style="font-size: 1.4rem; color: var(--accent-red); font-weight: 800; background: #fef2f2; padding: 0.2rem 0.6rem; border-radius: 4px; border: 1px solid #fecaca;">${fixedCellStr}</span></p>`;

    document.getElementById('product-info').innerHTML = `
        <div class="flex flex-col gap-2" style="font-size: 1.05rem;">
            <p style="font-size:1.15rem; font-weight:700; color:var(--text-color);">[ ${product.name} ]</p>
            <p><strong>상품코드:</strong> ${product.code}</p>
            <div class="flex gap-4 items-center" style="margin-top: 0.5rem; margin-bottom: 0.5rem;">
                ${sizeHtml}
                ${fixedCellHtml}
            </div>
            ${planInfoHtml}
        </div>
    `;
    document.getElementById('scan-result').classList.remove('hidden');
    document.getElementById('qty-normal').focus();
}

// 스캔 입력창 엔터키 이벤트 바인딩
document.getElementById('barcode-input')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') handleScan();
});

// 검수 데이터 등록
async function submitScanData() {
    const normal = document.getElementById('qty-normal').value;
    const defective = document.getElementById('qty-defective').value;
    const notes = document.getElementById('scan-notes').value;

    if (normal == 0 && defective == 0) {
        return alert("수량을 1개 이상 입력해주세요.");
    }

    // 서버 제출
    const codeToSend = document.getElementById('barcode-input').dataset.selectedCode || document.getElementById('barcode-input').value.trim();

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                batch_name: currentState.batchName,
                barcode: codeToSend, // 상품코드 전송
                store_name: currentState.storeName,
                normal_qty: normal,
                defective_qty: defective,
                notes: notes,
                worker: currentState.workerName
            })
        });

        if (response.ok) {
            alert(`정상: ${normal}개, 불량: ${defective}개 처리가 완료되었습니다.\n(메모: ${notes ? notes : '없음'})`);
            loadReturnPlan(currentState.storeName); // 표 새로고침 연동
        } else {
            alert("서버 저장 중 오류가 발생했습니다.");
        }
    } catch (err) {
        console.error(err);
        alert("예기치 않은 통신 오류가 발생했습니다.");
    }

    // 초기화
    document.getElementById('barcode-input').value = '';
    document.getElementById('qty-normal').value = 1;
    document.getElementById('qty-defective').value = 0;
    document.getElementById('scan-notes').value = '';
    document.getElementById('scan-result').classList.add('hidden');
    document.getElementById('barcode-input').focus();
}

// 대시보드 탭 전환
function switchDashboardTab(tabName) {
    document.querySelectorAll('.dashboard-section').forEach(el => el.classList.add('hidden'));
    document.getElementById(`dashboard-${tabName}`).classList.remove('hidden');

    // 버튼 스타일 처리
    document.getElementById('tab-all').className = 'btn';
    document.getElementById('tab-store').className = 'btn';
    document.getElementById('tab-locations').className = 'btn';
    document.getElementById(`tab-${tabName}`).classList.add('btn-primary');

    if (tabName === 'all') {
        loadDashboardData(); // 전체 스캔 로드 (필터 적용)
    }
    else if (tabName === 'store') {
        loadStoreListForMasterStoreView().then(() => {
            loadStoreDetail();     // 선택된 차수/점포 기준 로드
        });
    }
    else if (tabName === 'locations') {
        loadLocationsData();
    }
}

// 3. 대시보드 로드 (Master) - 전체 스캔 내역
async function loadDashboardData() {
    const batchFilter = document.getElementById('master-batch-filter-all')?.value || '전체';
    const tbody = document.getElementById('all-scan-tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">데이터를 불러오는 중...</td></tr>';

    try {
        const res = await fetch(`/api/scans?batch=${encodeURIComponent(batchFilter)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center">조회된 스캔 내역이 없습니다. (차수 필터 확인 요망)</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(item => `
                <tr id="scan-row-${item.id}">
                    <td>${item.id}</td>
                    <td><span style="color:var(--accent-blue); font-weight:bold;">${item.batch_name}</span></td>
                    <td>${item.store_name}</td>
                    <td>
                        <div style="font-weight:600">${item.product_name}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">${item.product_code}</div>
                    </td>
                    <td><input type="number" id="edit-n-${item.id}" value="${item.normal_qty}" class="input-control" style="width:60px; padding:0.2rem" disabled></td>
                    <td><input type="number" id="edit-d-${item.id}" value="${item.defective_qty}" class="input-control" style="width:60px; padding:0.2rem" disabled></td>
                    <td><input type="text" id="edit-notes-${item.id}" value="${item.notes || ''}" class="input-control" style="width:120px; padding:0.2rem" disabled></td>
                    <td style="font-size:0.85rem;">${item.scanned_at}<br/>(${item.worker})</td>
                    <td>
                        <div id="btn-group-view-${item.id}">
                            <button class="btn btn-primary" style="padding:0.2rem 0.5rem" onclick="enableEdit(${item.id})">수정</button>
                            <button class="btn btn-danger" style="padding:0.2rem 0.5rem; margin-top:2px;" onclick="deleteScan(${item.id})">삭제</button>
                        </div>
                        <div id="btn-group-edit-${item.id}" class="hidden flex gap-1" style="flex-direction:column">
                            <button class="btn btn-success" style="padding:0.2rem 0.5rem" onclick="saveEdit(${item.id})">저장</button>
                            <button class="btn" style="padding:0.2rem 0.5rem" onclick="cancelEdit(${item.id}, ${item.normal_qty}, ${item.defective_qty}, '${item.notes || ''}')">취소</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">서버 연결 오류</td></tr>';
    }
}

// 4. 점포별 상세 뷰 로드
async function loadStoreDetail() {
    const batchName = document.getElementById('master-batch-filter-store').value;
    const storeName = document.getElementById('master-store-filter').value;
    const scanTbody = document.getElementById('store-scan-tbody');
    const planTbody = document.getElementById('store-plan-tbody');

    if (!storeName) {
        scanTbody.innerHTML = '<tr><td colspan="7" class="text-center">위에서 점포를 선택해주세요.</td></tr>';
        planTbody.innerHTML = '<tr><td colspan="4" class="text-center">위에서 점포를 선택해주세요.</td></tr>';
        return;
    }

    scanTbody.innerHTML = '<tr><td colspan="7" class="text-center">불러오는 중...</td></tr>';
    planTbody.innerHTML = '<tr><td colspan="4" class="text-center">불러오는 중...</td></tr>';

    try {
        // 스캔 데이터
        const scanRes = await fetch(`/api/scans?store=${encodeURIComponent(storeName)}&batch=${encodeURIComponent(batchName)}`);
        if (scanRes.ok) {
            const scanData = await scanRes.json();
            if (scanData.length === 0) scanTbody.innerHTML = '<tr><td colspan="7" class="text-center">해당 점포/차수의 스캔 내역이 없습니다.</td></tr>';
            else scanTbody.innerHTML = scanData.map(item => `
                <tr id="scan-row-${item.id}">
                    <td>${item.id}</td>
                    <td>
                        <div style="font-weight:600">${item.product_name}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary)">${item.product_code}</div>
                    </td>
                    <td><input type="number" id="edit-n-${item.id}" value="${item.normal_qty}" class="input-control" style="width:60px; padding:0.2rem" disabled></td>
                    <td><input type="number" id="edit-d-${item.id}" value="${item.defective_qty}" class="input-control" style="width:60px; padding:0.2rem" disabled></td>
                    <td><input type="text" id="edit-notes-${item.id}" value="${item.notes || ''}" class="input-control" style="width:120px; padding:0.2rem" disabled></td>
                    <td style="font-size:0.85rem;">${item.scanned_at}<br/>(${item.worker})</td>
                    <td>
                        <div id="btn-group-view-${item.id}">
                            <button class="btn btn-primary" style="padding:0.2rem 0.5rem" onclick="enableEdit(${item.id})">수정</button>
                            <button class="btn btn-danger" style="padding:0.2rem 0.5rem; margin-top:2px;" onclick="deleteScan(${item.id})">삭제</button>
                        </div>
                        <div id="btn-group-edit-${item.id}" class="hidden flex gap-1" style="flex-direction:column">
                            <button class="btn btn-success" style="padding:0.2rem 0.5rem" onclick="saveEdit(${item.id})">저장</button>
                            <button class="btn" style="padding:0.2rem 0.5rem" onclick="cancelEdit(${item.id}, ${item.normal_qty}, ${item.defective_qty}, '${item.notes || ''}')">취소</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        }

        // 반품 예정 리스트 데이터
        const planRes = await fetch(`/api/plan/${encodeURIComponent(storeName)}?batch=${encodeURIComponent(batchName)}`);
        if (planRes.ok) {
            const planData = await planRes.json();
            if (planData.length === 0) planTbody.innerHTML = '<tr><td colspan="4" class="text-center">해당 점포/차수의 예정 리스트가 없습니다.</td></tr>';
            else planTbody.innerHTML = planData.map(item => `
                <tr>
                    <td>${item.id}</td>
                    <td>${item.product_code}</td>
                    <td>${item.product_name}</td>
                    <td>${item.expected_qty}</td>
                </tr>
            `).join('');
        }
    } catch (err) {
        scanTbody.innerHTML = '<tr><td colspan="7" class="text-center">서버 통신 오류</td></tr>';
        planTbody.innerHTML = '<tr><td colspan="4" class="text-center">서버 통신 오류</td></tr>';
    }
}

// 대시보드 - 데이터 과부하 제거 (Master/Plan 테이블 제거)
// loadMasterData, loadPlanList 데이터베이스 호출 부분 삭제 (엑셀로만 확인)
function enableEdit(id) {
    document.getElementById(`edit-n-${id}`).disabled = false;
    document.getElementById(`edit-d-${id}`).disabled = false;
    document.getElementById(`edit-notes-${id}`).disabled = false;
    document.getElementById(`btn-group-view-${id}`).classList.add('hidden');
    document.getElementById(`btn-group-edit-${id}`).classList.remove('hidden');
}

// 편집 취소
function cancelEdit(id, origN, origD, origNotes) {
    document.getElementById(`edit-n-${id}`).value = origN;
    document.getElementById(`edit-d-${id}`).value = origD;
    document.getElementById(`edit-notes-${id}`).value = origNotes !== 'null' ? origNotes : '';
    document.getElementById(`edit-n-${id}`).disabled = true;
    document.getElementById(`edit-d-${id}`).disabled = true;
    document.getElementById(`edit-notes-${id}`).disabled = true;
    document.getElementById(`btn-group-edit-${id}`).classList.add('hidden');
    document.getElementById(`btn-group-view-${id}`).classList.remove('hidden');
}

// 편집 내용 저장
async function saveEdit(id) {
    const nQty = document.getElementById(`edit-n-${id}`).value;
    const dQty = document.getElementById(`edit-d-${id}`).value;
    const notes = document.getElementById(`edit-notes-${id}`).value;

    try {
        const res = await fetch(`/api/scans/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                normal_qty: parseInt(nQty),
                defective_qty: parseInt(dQty),
                notes: notes
            })
        });
        if (res.ok) {
            alert("수정되었습니다.");
            loadDashboardData();
        } else {
            alert("수정 실패!");
        }
    } catch (err) {
        alert("통신 오류 발생");
    }
}

// 스캔 내역 엑셀 다운로드
function downloadScansExcel() {
    const batchFilter = document.getElementById('master-batch-filter-all')?.value || '전체';
    if (!confirm(`[${batchFilter}] 내역을 엑셀 파일로 다운로드 하시겠습니까?`)) return;

    const url = `/api/export/scans?batch=${encodeURIComponent(batchFilter)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `스캔내역_${batchFilter}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// 삭제
async function deleteScan(id) {
    if (!confirm("이 스캔 내역을 정말 삭제하시겠습니까?")) return;
    try {
        const res = await fetch(`/api/scans/${id}`, { method: 'DELETE' });
        if (res.ok) {
            alert("삭제되었습니다.");
            loadDashboardData();
        } else {
            alert("삭제 실패!");
        }
    } catch (e) {
        alert("통신 오류!");
    }
}

// 파일 업로드 (상품마스터)
document.getElementById('upload-master')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    alert(`${file.name} (상품 마스터) 서버 업로드 중...`);

    try {
        const res = await fetch('/api/upload/master', { method: 'POST', body: formData });
        const data = await res.json();
        alert(data.message);
    } catch (err) {
        alert("업로드 통신 오류");
    }
    e.target.value = ''; // 초기화
});

// 반품예정 파일 업로드 (차수 모달 컨트롤)
function openPlanUploadModal() {
    document.getElementById('modal-upload-plan').classList.remove('hidden');
    document.getElementById('input-upload-batch-name').value = '';
    document.getElementById('input-upload-plan-file').value = '';
}

function closePlanUploadModal() {
    document.getElementById('modal-upload-plan').classList.add('hidden');
}

async function submitPlanUpload() {
    const batchName = document.getElementById('input-upload-batch-name').value.trim();
    const fileInput = document.getElementById('input-upload-plan-file');
    const file = fileInput.files[0];

    if (!batchName) return alert("차수명을 입력해주세요. (예: 1차, 2024-05-01 반품 등)");
    if (!file) return alert("업로드할 엑셀 파일을 선택해주세요.");

    const formData = new FormData();
    formData.append('batch_name', batchName);
    formData.append('file', file);

    alert(`[${batchName}] 차수 반품 예정 정보 서버 업로드 중... \n(완료 알람이 뜰 때까지 기다려주세요)`);

    try {
        const res = await fetch('/api/upload/plan', { method: 'POST', body: formData });
        const data = await res.json();
        alert(data.message);

        // 업로드 성공 후 드롭다운 목록도 최신화
        if (res.ok) {
            closePlanUploadModal();
            await loadBatchesForMaster();
            switchDashboardTab('all'); // 새로고침 효과
        }
    } catch (err) {
        alert("업로드 통신 오류");
    }
}

// 차수 관리 모달 제어
function openBatchManageModal() {
    loadBatchesForMaster(); // 열 때 최신화
    document.getElementById('modal-manage-batch').classList.remove('hidden');
}

function closeBatchManageModal() {
    document.getElementById('modal-manage-batch').classList.add('hidden');
}

// 차수 삭제
async function deleteBatch(batchName) {
    if (!confirm(`정말로 [${batchName}] 차수를 삭제하시겠습니까?\n이 차수의 반품 예정 및 작업 스캔 데이터가 모두 삭제되며 복구할 수 없습니다!`)) return;

    try {
        const res = await fetch(`/api/batches/${encodeURIComponent(batchName)}`, { method: 'DELETE' });
        const data = await res.json();
        alert(data.message);

        if (res.ok) {
            await loadBatchesForMaster(); // 리스트 새로고침
            switchDashboardTab('all'); // 대시보드 새로고침
        }
    } catch (e) {
        alert("삭제 통신 오류가 발생했습니다.");
    }
}

// 파일 업로드 (고정 로케이션 배정)
document.getElementById('upload-locations')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    alert(`${file.name} (고정 로케이션 목록) 서버 업로드 및 자동 배정 중... \n(완료 알람이 뜰 때까지 기다려주세요)`);

    try {
        const res = await fetch('/api/upload/locations', { method: 'POST', body: formData });
        const data = await res.json();
        alert(data.message || data.detail || "알 수 없는 응답 오류 발생");
        // 업로드 성공 후 현황 최신화
        if (res.ok) await loadLocationsData();
    } catch (err) {
        alert("업로드 통신 오류: " + err.message);
    }
    e.target.value = ''; // 초기화
});

// 대시보드 - 로케이션 배정 리스트 로드
async function loadLocationsData() {
    const tbody = document.getElementById('locations-tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">데이터를 불러오는 중...</td></tr>';

    try {
        const res = await fetch('/api/aggregate-plans');
        if (res.ok) {
            const data = await res.json();
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">등록된 반품 예정 데이터가 없습니다. 먼저 반품예정리스트를 업로드하세요.</td></tr>';
                return;
            }
            tbody.innerHTML = data.map((item, index) => `
                <tr>
                    <td>${index + 1}위</td>
                    <td>${item.code}</td>
                    <td>${item.barcode}</td>
                    <td>${item.name}</td>
                    <td><strong style="color:var(--accent-blue)">${item.total_qty}</strong></td>
                    <td><span style="font-weight:600; color:var(--accent-green)">${item.fixed_cell || '미배정'}</span></td>
                </tr>
            `).join('');
        }
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">서버 연결 오류</td></tr>';
    }
}
