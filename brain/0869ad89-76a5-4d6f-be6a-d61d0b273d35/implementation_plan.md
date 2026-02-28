# Plan: Separate Master Dashboard (All) and Store View

## Goal
The Master Administrator needs a clear separation between viewing "All Stores (Global Dashboard)" and "Specific Working Store (점포별 현황)" directly within the Master UI, without relying on the initial login screen's store selection.

## Proposed Changes

### 1. Login Screen Adjustments (`index.html` & `app.js`)
- **[MODIFY]** When the user selects "마스터 관리자" (Master) on the login screen, hide the "작업 점포" (Store) selection dropdown entirely. Masters log in globally.

### 2. Master Dashboard Restructuring (`index.html`)
Redesign the Master tabs to clearly separate "Global" from "Store-specific" views.

**New Top-Level Tabs:**
1. **[전체 현황 (All)]**
   - Shows all scan history across all stores.
   - Shows all return plan items across all stores.
2. **[점포별 상세 (By Store)]**
   - Contains a new dropdown `<select id="master-store-filter">` to dynamically select a store within the dashboard.
   - Shows scan history and return plans *only for the selected store*.
3. **[상품 마스터 관리]**
   - Shows the Product Master table and upload functionality.
4. **[로케이션 배정]**
   - Shows the automated location mapping panel.

### 3. Frontend Logic (`app.js`)
- **[MODIFY]** `enterSystem()`: If role is 'master', bypass store selection checks.
- **[NEW]** `loadStoreDetail(storeName)`: Function to fetch scans and plans specifically for the store selected in the "점포별 상세" tab.
- **[MODIFY]** Update existing tab switching logic to handle the new tab structure and dynamically fetch data based on the active tab and filter.

## User Review Required
Does this structure align with your vision? By grouping "All" data in one tab and having a dedicated "By Store" tab where you can change the store dynamically, we achieve a clean separation without cluttering the interface.
