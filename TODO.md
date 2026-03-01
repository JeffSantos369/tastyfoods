# TODO - Tasty Foods Pizzaria

## Phase 1: File-Based Data Persistence (COMPLETED ✅)
- [x] Create data directory and JSON files
- [x] Modify server.js for file-based loading
- [x] Test implementation

---

## Phase 2: Order History & Records Tracking (COMPLETED ✅)

### Objective
Keep permanent records of all orders including date, time, customer details, items, and payment status so that historical data can be retrieved when customers call or complain about past orders.

### Implementation Plan

#### Step 1: Enhance Order Data Structure
- [x] Add `created_at` timestamp to orders (auto-generated)
- [x] Add `status` field for order lifecycle (pending, confirmed, preparing, delivered, cancelled)
- [x] Add `customer_notes` field for special instructions
- [x] Add `payment_method` to track how customer paid

#### Step 2: Update server.js
- [x] Modify POST /orders to add timestamps and default status
- [x] Add GET /orders/:id endpoint for retrieving single order
- [x] Add PUT /orders/:id/status endpoint for status updates
- [x] Add ORDER_HISTORY table structure (for future database migration)

#### Step 3: Update Frontend (index.html)
- [x] Pass payment method to order
- [x] Add order status display in UI

#### Step 4: Enhance Admin Panel (admin.html)
- [x] Display order date/time in orders list
- [x] Add order status column with visual indicators
- [x] Add search/filter by customer name, phone, or date
- [x] Add order details expansion view
- [x] Add ability to update order status

#### Step 5: Testing
- [x] Create test order
- [x] Verify timestamp is recorded
- [x] Verify data persists after server restart
- [x] Test admin panel order search
