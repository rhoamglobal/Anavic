// Global App State
const state = {
  token: localStorage.getItem('token') || null,
  user: null,
  activeShift: null,
  customers: [],
  selectedCustomerId: null,
  currentTab: 'shiftsTab', // Accountant/Boss sub-tabs
  charts: {
    expenses: null
  },
  // Saved preview close payload to submit after confirmation
  closePayload: null
};

const API_URL = '';

// Initialize App
async function init() {
  if (state.token) {
    await fetchCurrentUser();
  } else {
    showScreen('loginScreen');
  }
}

// Fetch Current Logged In User
async function fetchCurrentUser() {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const data = await res.json();
      state.user = data.user;
      setupUserEnvironment();
    } else {
      handleLogout();
    }
  } catch (err) {
    console.error('Error auto logging in:', err);
    handleLogout();
  }
}

// Switch Screens / Area Layouts based on user role
function setupUserEnvironment() {
  document.getElementById('userInfoSection').classList.remove('hidden');
  document.getElementById('userFullName').innerText = state.user.fullName;
  document.getElementById('userRoleBadge').innerText = state.user.role;

  // Set role color scheme
  const roleBadge = document.getElementById('userRoleBadge');
  if (state.user.role === 'boss') {
    roleBadge.className = 'inline-block px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-yellow-500 text-slate-900';
  } else if (state.user.role === 'accountant') {
    roleBadge.className = 'inline-block px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-slate-700 text-white';
  } else {
    roleBadge.className = 'inline-block px-2 py-0.5 rounded text-[9px] uppercase font-bold tracking-wider bg-red-600 text-white';
  }

  if (state.user.role === 'attendant') {
    showScreen('attendantArea');
    loadActiveShift();
  } else if (state.user.role === 'accountant' || state.user.role === 'boss') {
    showScreen('accountantArea');

    // Manage dynamic visibility based on permissions
    const isBoss = state.user.role === 'boss';

    // Show/hide Boss-specific UI controls
    const addCustomerBtn = document.getElementById('addCustomerBtn');
    if (addCustomerBtn) addCustomerBtn.style.display = isBoss ? 'block' : 'none';

    const addStaffBtn = document.getElementById('addStaffBtn');
    if (addStaffBtn) addStaffBtn.style.display = isBoss ? 'block' : 'none';

    // Staff tab itself is visible to both Accountant & Boss
    const staffBtn = document.getElementById('btn-staffTab');
    if (staffBtn) staffBtn.classList.remove('hidden');

    switchAccountantTab('shiftsTab');
  }
}

function showScreen(screenId) {
  ['loginScreen', 'attendantArea', 'accountantArea'].forEach(id => {
    document.getElementById(id).classList.add('hidden');
  });
  document.getElementById(screenId).classList.remove('hidden');
}

// Handle Login Form Submission
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token);
      state.token = data.token;
      state.user = data.user;
      showToast('Logged in successfully!', 'success');
      setupUserEnvironment();
    } else {
      showToast(data.error || 'Authentication failed.', 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    showToast('Failed to connect to server.', 'error');
  }
}

function fillDemo(username, password) {
  document.getElementById('usernameInput').value = username;
  document.getElementById('passwordInput').value = password;
}

function handleLogout() {
  localStorage.removeItem('token');
  state.token = null;
  state.user = null;
  state.activeShift = null;
  document.getElementById('userInfoSection').classList.add('hidden');
  showScreen('loginScreen');
  showToast('Logged out.', 'success');
}

// ==========================================
// ATTENDANT SHIFT LOGIC (3 Products & Expenses modifications)
// ==========================================

// Load active shift
async function loadActiveShift() {
  try {
    const res = await fetch(`${API_URL}/api/shifts/active`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const data = await res.json();
      if (data.active) {
        state.activeShift = data.shift;
        renderActiveShift();
      } else {
        state.activeShift = null;
        document.getElementById('noShiftView').classList.remove('hidden');
        document.getElementById('activeShiftView').classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Error loading active shift:', err);
  }
}

// Render active shift content for all three product lines
function renderActiveShift() {
  document.getElementById('noShiftView').classList.add('hidden');
  document.getElementById('activeShiftView').classList.remove('hidden');

  const shift = state.activeShift;
  document.getElementById('shiftIDVal').innerText = `#${shift.id}`;
  document.getElementById('shiftAttendantVal').innerText = state.user.fullName.split(' ')[0];

  const openedDate = new Date(shift.opened_at);
  document.getElementById('shiftOpenedTime').innerText = openedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + openedDate.toLocaleDateString();

  // Meter start readings for AGO, DPK, Petrol
  const agoMeter = shift.meters.find(m => m.fuel_type === 'ago');
  const dpkMeter = shift.meters.find(m => m.fuel_type === 'dpk');
  const petrolMeter = shift.meters.find(m => m.fuel_type === 'petrol');

  document.getElementById('agoStartMeterBadge').innerText = agoMeter.start_meter.toFixed(2);
  document.getElementById('dpkStartMeterBadge').innerText = dpkMeter.start_meter.toFixed(2);
  document.getElementById('petrolStartMeterBadge').innerText = petrolMeter.start_meter.toFixed(2);

  document.getElementById('agoPriceBadge').innerText = `₦${agoMeter.unit_price.toLocaleString()}/L`;
  document.getElementById('dpkPriceBadge').innerText = `₦${dpkMeter.unit_price.toLocaleString()}/L`;
  document.getElementById('petrolPriceBadge').innerText = `₦${petrolMeter.unit_price.toLocaleString()}/L`;

  // Expenses summary list (WITH edit/delete capability)
  const expensesList = document.getElementById('shiftExpensesList');
  let totalExpenses = 0;
  if (shift.expenses.length === 0) {
    expensesList.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No shift expenses logged yet.</p>`;
  } else {
    expensesList.innerHTML = shift.expenses.map(e => {
      totalExpenses += e.amount;
      return `
        <div class="p-3 bg-red-50/50 border border-red-100 rounded-lg text-xs space-y-2">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-bold text-slate-800">${e.category}</span>
              <p class="text-[10px] text-slate-400 mt-0.5">${e.description}</p>
            </div>
            <span class="font-bold text-red-600">-₦${e.amount.toLocaleString()}</span>
          </div>
          <div class="flex items-center justify-end space-x-1.5 text-[10px] border-t border-red-100/40 pt-1.5 mt-1">
            <button onclick="triggerEditExpense(${e.id}, ${e.amount}, '${e.category}', '${e.description.replace(/'/g, "\\'")}')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[9px] transition">
              <i class="fa-solid fa-pen"></i> Correct
            </button>
            <button onclick="triggerDeleteExpense(${e.id})" class="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded text-[9px] transition">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('shiftExpenseTally').innerText = `Expenses: ₦${totalExpenses.toLocaleString()}`;

  // Credit sales summary list with interactive corrections triggers (AGO, DPK, Petrol)
  const creditList = document.getElementById('shiftCreditSalesList');
  let totalCredit = 0;
  if (shift.creditSales.length === 0) {
    creditList.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No credit sales logged yet.</p>`;
  } else {
    creditList.innerHTML = shift.creditSales.map(c => {
      totalCredit += c.total_amount;
      return `
        <div class="p-3 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs space-y-2">
          <div class="flex items-center justify-between">
            <span class="font-bold text-slate-800">${c.customer_name}</span>
            <span class="font-bold text-emerald-700">₦${c.total_amount.toLocaleString()}</span>
          </div>
          <div class="flex items-center justify-between text-[10px] border-t border-emerald-100/40 pt-1.5 mt-1">
            <span class="text-slate-400">${c.liters.toFixed(2)}L ${c.fuel_type.toUpperCase()} @ ₦${c.price_per_liter.toLocaleString()}/L</span>

            <div class="flex items-center space-x-1.5">
              <button onclick="triggerEditCreditSale(${c.id}, '${c.customer_name}', '${c.fuel_type.toUpperCase()}', ${c.liters})" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded text-[9px] transition">
                <i class="fa-solid fa-pen"></i> Correct
              </button>
              <button onclick="triggerDeleteCreditSale(${c.id}, '${c.customer_name}')" class="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 text-red-600 font-bold rounded text-[9px] transition">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }
  document.getElementById('shiftCreditTally').innerText = `Credits: ₦${totalCredit.toLocaleString()}`;
}

// Handle opening shift across three products
async function handleOpenShift(e) {
  e.preventDefault();
  const opening_float = document.getElementById('openFloatInput').value;
  const ago_start_meter = document.getElementById('openAgoMeterInput').value;
  const dpk_start_meter = document.getElementById('openDpkMeterInput').value;
  const petrol_start_meter = document.getElementById('openPetrolMeterInput').value;
  const ago_price = document.getElementById('openAgoPriceInput').value;
  const dpk_price = document.getElementById('openDpkPriceInput').value;
  const petrol_price = document.getElementById('openPetrolPriceInput').value;

  try {
    const res = await fetch(`${API_URL}/api/shifts/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ opening_float, ago_start_meter, dpk_start_meter, petrol_start_meter, ago_price, dpk_price, petrol_price })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Shift opened successfully!', 'success');
      toggleModal('openShiftModal', false);
      // Reset fields
      document.getElementById('openAgoMeterInput').value = '';
      document.getElementById('openDpkMeterInput').value = '';
      document.getElementById('openPetrolMeterInput').value = '';
      document.getElementById('openAgoPriceInput').value = '';
      document.getElementById('openDpkPriceInput').value = '';
      document.getElementById('openPetrolPriceInput').value = '';
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to open shift.', 'error');
    }
  } catch (err) {
    console.error('Error opening shift:', err);
    showToast('Failed to connect to server.', 'error');
  }
}

// Handle Logging Shift Expense
async function handleLogExpense(e) {
  e.preventDefault();
  const amount = document.getElementById('expenseAmountInput').value;
  const category = document.getElementById('expenseCategoryInput').value;
  const description = document.getElementById('expenseDescInput').value.trim();

  try {
    const res = await fetch(`${API_URL}/api/shifts/expense`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ amount, category, description })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Expense logged successfully.', 'success');
      toggleModal('logExpenseModal', false);
      // Reset fields
      document.getElementById('expenseAmountInput').value = '';
      document.getElementById('expenseDescInput').value = '';
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to log expense.', 'error');
    }
  } catch (err) {
    console.error('Error logging expense:', err);
  }
}

// Trigger edit modal for a shift expense
function triggerEditExpense(expenseId, amount, category, description) {
  document.getElementById('editExpenseId').value = expenseId;
  document.getElementById('editExpenseAmountInput').value = amount;
  document.getElementById('editExpenseCategoryInput').value = category;
  document.getElementById('editExpenseDescInput').value = description;

  toggleModal('editExpenseModal', true);
}

// Submit shift expense edit
async function handleSubmitEditExpense(e) {
  e.preventDefault();
  const expenseId = document.getElementById('editExpenseId').value;
  const amount = document.getElementById('editExpenseAmountInput').value;
  const category = document.getElementById('editExpenseCategoryInput').value;
  const description = document.getElementById('editExpenseDescInput').value.trim();

  try {
    const res = await fetch(`${API_URL}/api/shifts/expense/${expenseId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ amount, category, description })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Expense corrected successfully!', 'success');
      toggleModal('editExpenseModal', false);
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to correct expense.', 'error');
    }
  } catch (err) {
    console.error('Error submitting expense correction:', err);
  }
}

// Delete logged expense (with double confirmation block)
async function triggerDeleteExpense(expenseId) {
  const check = confirm(`Are you absolutely sure you want to remove this logged expense?`);
  if (!check) return;

  try {
    const res = await fetch(`${API_URL}/api/shifts/expense/${expenseId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Expense removed successfully.', 'success');
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to remove expense.', 'error');
    }
  } catch (err) {
    console.error('Error deleting expense:', err);
  }
}

// Open and populate customers list inside the credit sale modal
async function openCreditSaleModal() {
  try {
    const res = await fetch(`${API_URL}/api/customers`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const customers = await res.json();
      const activeCustomers = customers.filter(c => c.status === 'active');
      const select = document.getElementById('creditCustomerInput');

      if (activeCustomers.length === 0) {
        select.innerHTML = `<option value="">No Active Corporate Accounts</option>`;
      } else {
        select.innerHTML = activeCustomers.map(c => {
          let pricingDetail = '';
          if (c.custom_ago_price) pricingDetail += ` AGO: ₦${c.custom_ago_price.toLocaleString()}`;
          if (c.custom_dpk_price) pricingDetail += ` DPK: ₦${c.custom_dpk_price.toLocaleString()}`;
          if (c.custom_petrol_price) pricingDetail += ` Petrol: ₦${c.custom_petrol_price.toLocaleString()}`;
          if (!pricingDetail) pricingDetail = 'Standard pricing fallback';
          return `<option value="${c.id}">${c.name} (${pricingDetail})</option>`;
        }).join('');
      }

      toggleModal('logCreditSaleModal', true);
    }
  } catch (err) {
    console.error('Error loading customers for credit sale:', err);
  }
}

// Handle Logging Credit Sale
async function handleLogCreditSale(e) {
  e.preventDefault();
  const customer_id = document.getElementById('creditCustomerInput').value;
  const fuel_type = document.getElementById('creditFuelInput').value;
  const liters = document.getElementById('creditLitersInput').value;

  if (!customer_id) {
    showToast('Please select a valid active corporate customer account.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/shifts/credit-sale`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ customer_id, fuel_type, liters })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Credit sale logged successfully.', 'success');
      toggleModal('logCreditSaleModal', false);
      document.getElementById('creditLitersInput').value = '';
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to record credit sale.', 'error');
    }
  } catch (err) {
    console.error('Error logging credit sale:', err);
  }
}

// Trigger edit modal for a logged credit sale
function triggerEditCreditSale(saleId, customerName, fuelType, liters) {
  document.getElementById('editCreditSaleId').value = saleId;
  document.getElementById('editCreditSaleCustomerLabel').innerText = customerName;
  document.getElementById('editCreditSaleFuelLabel').innerText = fuelType;
  document.getElementById('editCreditSaleLitersInput').value = liters;

  toggleModal('editCreditSaleModal', true);
}

// Submit credit sale edit
async function handleSubmitEditCreditSale(e) {
  e.preventDefault();
  const saleId = document.getElementById('editCreditSaleId').value;
  const liters = document.getElementById('editCreditSaleLitersInput').value;

  try {
    const res = await fetch(`${API_URL}/api/shifts/credit-sale/${saleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ liters })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Credit sale corrected successfully!', 'success');
      toggleModal('editCreditSaleModal', false);
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to correct credit sale.', 'error');
    }
  } catch (err) {
    console.error('Error submitting credit sale correction:', err);
  }
}

// Trigger deletion for a logged credit sale (with double confirmation block)
async function triggerDeleteCreditSale(saleId, customerName) {
  const check = confirm(`Are you absolutely sure you want to completely remove this corporate sale for "${customerName}"?`);
  if (!check) return;

  try {
    const res = await fetch(`${API_URL}/api/shifts/credit-sale/${saleId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Credit sale removed successfully.', 'success');
      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to remove credit sale.', 'error');
    }
  } catch (err) {
    console.error('Error deleting credit sale:', err);
  }
}

// Trigger shift close preview before actual submission (Calculates across 3 product lines)
function handleTriggerShiftPreview(e) {
  e.preventDefault();
  const agoEnd = parseFloat(document.getElementById('closeAgoMeterInput').value);
  const dpkEnd = parseFloat(document.getElementById('closeDpkMeterInput').value);
  const petrolEnd = parseFloat(document.getElementById('closePetrolMeterInput').value);
  const cashActual = parseFloat(document.getElementById('closeCashInput').value);
  const posActual = parseFloat(document.getElementById('closePosInput').value || 0);

  const shift = state.activeShift;
  const agoMeter = shift.meters.find(m => m.fuel_type === 'ago');
  const dpkMeter = shift.meters.find(m => m.fuel_type === 'dpk');
  const petrolMeter = shift.meters.find(m => m.fuel_type === 'petrol');

  if (agoEnd < agoMeter.start_meter) {
    showToast(`AGO end reading (${agoEnd}) cannot be less than start (${agoMeter.start_meter}).`, 'error');
    return;
  }
  if (dpkEnd < dpkMeter.start_meter) {
    showToast(`DPK end reading (${dpkEnd}) cannot be less than start (${dpkMeter.start_meter}).`, 'error');
    return;
  }
  if (petrolEnd < petrolMeter.start_meter) {
    showToast(`Petrol end reading (${petrolEnd}) cannot be less than start (${petrolMeter.start_meter}).`, 'error');
    return;
  }

  // Calculate parameters for AGO, DPK, Petrol
  const agoLiters = agoEnd - agoMeter.start_meter;
  const dpkLiters = dpkEnd - dpkMeter.start_meter;
  const petrolLiters = petrolEnd - petrolMeter.start_meter;

  const agoRevenue = agoLiters * agoMeter.unit_price;
  const dpkRevenue = dpkLiters * dpkMeter.unit_price;
  const petrolRevenue = petrolLiters * petrolMeter.unit_price;
  const totalRevenue = agoRevenue + dpkRevenue + petrolRevenue;

  const totalExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCreditSales = shift.creditSales.reduce((sum, c) => sum + c.total_amount, 0);

  const expectedCash = totalRevenue - totalCreditSales - totalExpenses - posActual + shift.opening_float;
  const variance = cashActual - expectedCash;

  // Store close payload for confirmation
  state.closePayload = {
    ago_end_meter: agoEnd,
    dpk_end_meter: dpkEnd,
    petrol_end_meter: petrolEnd,
    closing_cash_actual: cashActual,
    closing_pos_actual: posActual
  };

  // Render preview HTML
  const container = document.getElementById('previewContent');
  container.innerHTML = `
    <div class="grid grid-cols-3 gap-2 border-b border-slate-100 pb-3 text-center">
      <div class="p-1.5 bg-orange-50/50 rounded-lg">
        <span class="block text-[8px] text-orange-700 font-extrabold uppercase">AGO SOLD</span>
        <span class="font-mono font-bold text-slate-800 text-xs">${agoLiters.toFixed(2)} L</span>
        <p class="text-[8px] text-slate-400">₦${agoRevenue.toLocaleString()}</p>
      </div>
      <div class="p-1.5 bg-amber-50/50 rounded-lg">
        <span class="block text-[8px] text-amber-800 font-extrabold uppercase">DPK SOLD</span>
        <span class="font-mono font-bold text-slate-800 text-xs">${dpkLiters.toFixed(2)} L</span>
        <p class="text-[8px] text-slate-400">₦${dpkRevenue.toLocaleString()}</p>
      </div>
      <div class="p-1.5 bg-red-50/50 rounded-lg">
        <span class="block text-[8px] text-red-700 font-extrabold uppercase">PMS SOLD</span>
        <span class="font-mono font-bold text-slate-800 text-xs">${petrolLiters.toFixed(2)} L</span>
        <p class="text-[8px] text-slate-400">₦${petrolRevenue.toLocaleString()}</p>
      </div>
    </div>

    <div class="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
      <div class="flex justify-between">
        <span>Opening Float (+)</span>
        <span class="font-bold text-slate-800">₦${shift.opening_float.toLocaleString()}</span>
      </div>
      <div class="flex justify-between">
        <span>Total Nozzle Fuel Revenue (+)</span>
        <span class="font-bold text-slate-800">₦${totalRevenue.toLocaleString()}</span>
      </div>
      <div class="flex justify-between">
        <span>Logged Shift Expenses (-)</span>
        <span class="font-bold text-red-600">-₦${totalExpenses.toLocaleString()}</span>
      </div>
      <div class="flex justify-between">
        <span>Logged Corporate Credit Sales (-)</span>
        <span class="font-bold text-emerald-700">-₦${totalCreditSales.toLocaleString()}</span>
      </div>
      <div class="flex justify-between">
        <span>Actual Card/POS Terminal Sales (-)</span>
        <span class="font-bold text-blue-600">-₦${posActual.toLocaleString()}</span>
      </div>
      <div class="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900">
        <span>Expected Cash in Drawer</span>
        <span>₦${expectedCash.toLocaleString()}</span>
      </div>
    </div>

    <div class="p-3 border rounded-xl flex items-center justify-between ${variance < 0 ? 'bg-red-50 border-red-100 text-red-800' : variance > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-100 border-slate-200 text-slate-800'}">
      <div>
        <span class="block text-[9px] uppercase font-bold opacity-60">Physical Cash Drawer Counted</span>
        <span class="text-sm font-extrabold">₦${cashActual.toLocaleString()}</span>
      </div>
      <div class="text-right">
        <span class="block text-[9px] uppercase font-bold opacity-60">Variance</span>
        <span class="text-sm font-extrabold">
          ${variance === 0 ? '₦0.00 (Balanced)' : (variance < 0 ? `-₦${Math.abs(variance).toLocaleString()} (Shortage)` : `+₦${variance.toLocaleString()} (Surplus)`)}
        </span>
      </div>
    </div>
  `;

  // Toggle modals
  toggleModal('closeShiftModal', false);
  toggleModal('closeShiftPreviewModal', true);
}

// Confirm final shift submission
async function handleConfirmShiftClose() {
  if (!state.closePayload) return;

  try {
    const res = await fetch(`${API_URL}/api/shifts/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify(state.closePayload)
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Shift submitted successfully!', 'success');
      toggleModal('closeShiftPreviewModal', false);

      // Reset inputs
      document.getElementById('closeAgoMeterInput').value = '';
      document.getElementById('closeDpkMeterInput').value = '';
      document.getElementById('closePetrolMeterInput').value = '';
      document.getElementById('closeCashInput').value = '';
      document.getElementById('closePosInput').value = '';
      state.closePayload = null;

      loadActiveShift();
    } else {
      showToast(data.error || 'Failed to close shift.', 'error');
    }
  } catch (err) {
    console.error('Error closing shift:', err);
  }
}

// Stub function left for backward compat
function handleCloseShift(e) {
  e.preventDefault();
}

// ==========================================
// ACCOUNTANT / BOSS DASHBOARD PORTAL
// ==========================================

function switchAccountantTab(tabId) {
  state.currentTab = tabId;

  // Highlight active tab button
  ['shiftsTab', 'analyticsTab', 'creditTab', 'tanksTab', 'staffTab'].forEach(id => {
    const btn = document.getElementById(`btn-${id}`);
    const section = document.getElementById(id);
    if (id === tabId) {
      btn.className = 'py-3 px-6 text-sm font-semibold border-b-2 border-red-600 text-red-600 focus:outline-none transition';
      section.classList.remove('hidden');
    } else {
      btn.className = 'py-3 px-6 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 focus:outline-none transition';
      section.classList.add('hidden');
    }
  });

  // Call relevant load methods
  if (tabId === 'shiftsTab') {
    loadShiftsList();
  } else if (tabId === 'analyticsTab') {
    loadAnalytics();
    loadCurrentPrices();
  } else if (tabId === 'creditTab') {
    loadCorporateCustomers();
  } else if (tabId === 'tanksTab') {
    loadTankReports();
    loadLiveTankStatus();
  } else if (tabId === 'staffTab') {
    loadStaffDirectory();
  }
}

// 1. Load shift reconciliations (formatted for AGO, DPK, Petrol)
async function loadShiftsList() {
  const status = document.getElementById('shiftStatusFilter').value;
  let url = `${API_URL}/api/shifts`;
  if (status) url += `?status=${status}`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const shifts = await res.json();
      const tbody = document.getElementById('shiftsTableBody');
      if (shifts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="text-center text-slate-400 py-12">No shift records matching criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = shifts.map(s => {
        const openedDate = new Date(s.opened_at).toLocaleDateString() + ' ' + new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const closedDate = s.closed_at ? (new Date(s.closed_at).toLocaleDateString() + ' ' + new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '---';

        const calc = s.calculations;
        const revVal = calc.totalRevenue.toLocaleString();
        const dedVal = (calc.totalExpenses + calc.totalCreditSales).toLocaleString();
        const expCash = calc.expectedCash.toLocaleString();
        const actCash = s.status === 'open' ? '---' : `₦${s.closing_cash_actual.toLocaleString()}`;

        // Variance coloring
        let varBadge = '---';
        if (s.status !== 'open') {
          if (calc.variance < 0) {
            varBadge = `<span class="px-2.5 py-1 bg-red-50 text-red-600 font-bold rounded">-₦${Math.abs(calc.variance).toLocaleString()} (Short)</span>`;
          } else if (calc.variance > 0) {
            varBadge = `<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 font-bold rounded">+₦${calc.variance.toLocaleString()} (Surplus)</span>`;
          } else {
            varBadge = `<span class="px-2.5 py-1 bg-slate-100 text-slate-600 font-bold rounded">₦0.00 (Balanced)</span>`;
          }
        }

        // Status coloring
        let statBadge = '';
        if (s.status === 'open') {
          statBadge = `<span class="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 font-bold text-[10px]">IN PROGRESS</span>`;
        } else if (s.status === 'closed') {
          statBadge = `<span class="px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 font-bold text-[10px]">PENDING AUDIT</span>`;
        } else {
          statBadge = `<span class="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">RECONCILED</span>`;
        }

        let actionBtn = '---';
        if (s.status === 'closed') {
          actionBtn = `<button onclick="openReconcileReviewModal(${s.id})" class="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded text-[11px] transition">Review & Approve</button>`;
        } else if (s.status === 'approved') {
          actionBtn = `<button onclick="openReconcileReviewModal(${s.id})" class="px-3 py-1.5 bg-slate-100 text-slate-500 font-semibold rounded text-[11px]">View Details</button>`;
        }

        return `
          <tr class="hover:bg-slate-50/50 transition">
            <td class="px-6 py-4 font-bold text-slate-900">#${s.id}</td>
            <td class="px-6 py-4 font-semibold text-slate-700">${s.attendant_name}</td>
            <td class="px-6 py-4 text-slate-500">
              <span class="block">O: ${openedDate}</span>
              <span class="block text-[10px]">C: ${closedDate}</span>
            </td>
            <td class="px-6 py-4 text-right font-bold text-slate-900">₦${revVal}</td>
            <td class="px-6 py-4 text-right text-slate-500">-₦${dedVal}</td>
            <td class="px-6 py-4 text-right font-semibold text-slate-700">₦${expCash}</td>
            <td class="px-6 py-4 text-right font-semibold text-slate-700">${actCash}</td>
            <td class="px-6 py-4 text-center">${varBadge}</td>
            <td class="px-6 py-4 text-center">${statBadge}</td>
            <td class="px-6 py-4 text-right">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching shifts list:', err);
  }
}

// Open Shift Detail Reconciliation popup review (With AGO, DPK, Petrol fields)
async function openReconcileReviewModal(shiftId) {
  try {
    const res = await fetch(`${API_URL}/api/shifts`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const shifts = await res.json();
      const s = shifts.find(item => item.id === shiftId);
      if (!s) return;

      const calc = s.calculations;
      const openedDate = new Date(s.opened_at).toLocaleString();
      const closedDate = s.closed_at ? new Date(s.closed_at).toLocaleString() : '---';

      let detailsHtml = `
        <div class="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
          <div>
            <span class="block text-[10px] text-slate-400 font-bold uppercase">ATTENDANT NAME</span>
            <span class="text-sm font-bold text-slate-800">${s.attendant_name}</span>
          </div>
          <div>
            <span class="block text-[10px] text-slate-400 font-bold uppercase">SHIFT INTERVAL</span>
            <span class="text-[10px] text-slate-600 block">Open: ${openedDate}</span>
            <span class="text-[10px] text-slate-600 block">Close: ${closedDate}</span>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="font-bold text-slate-900">1. Fuel Sales Breakdown</h4>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div class="bg-orange-50/40 border border-orange-100 p-2.5 rounded-xl">
              <span class="text-[9px] text-orange-800 font-extrabold">AGO (Diesel 1)</span>
              <span class="block font-mono font-bold mt-1 text-slate-800">${calc.agoLiters.toFixed(2)} L</span>
              <span class="text-[9px] text-slate-400">₦${calc.agoRevenue.toLocaleString()}</span>
            </div>
            <div class="bg-amber-50/40 border border-amber-100 p-2.5 rounded-xl">
              <span class="text-[9px] text-amber-800 font-extrabold">DPK (Diesel 2)</span>
              <span class="block font-mono font-bold mt-1 text-slate-800">${calc.dpkLiters.toFixed(2)} L</span>
              <span class="text-[9px] text-slate-400">₦${calc.dpkRevenue.toLocaleString()}</span>
            </div>
            <div class="bg-red-50/40 border border-red-100 p-2.5 rounded-xl">
              <span class="text-[9px] text-red-800 font-extrabold">PETROL (PMS)</span>
              <span class="block font-mono font-bold mt-1 text-slate-800">${calc.petrolLiters.toFixed(2)} L</span>
              <span class="text-[9px] text-slate-400">₦${calc.petrolRevenue.toLocaleString()}</span>
            </div>
          </div>
          <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl font-bold">
            <span>Total Calculated Fuel Revenue</span>
            <span class="text-slate-900">₦${calc.totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="font-bold text-slate-900">2. Drawers Deductions & Cash Expected</h4>
          <div class="space-y-2 border border-slate-100 rounded-xl p-3 text-slate-600">
            <div class="flex justify-between">
              <span>Opening Cash Float (+)</span>
              <span class="font-semibold text-slate-800">₦${s.opening_float.toLocaleString()}</span>
            </div>
            <div class="flex justify-between">
              <span>Shift Petty Expenses (-)</span>
              <span class="font-semibold text-red-600">-₦${calc.totalExpenses.toLocaleString()}</span>
            </div>
            <div class="flex justify-between">
              <span>Shift Credit/On-Account Sales (-)</span>
              <span class="font-semibold text-emerald-700">-₦${calc.totalCreditSales.toLocaleString()}</span>
            </div>
            <div class="flex justify-between">
              <span>POS Card Transactions (-)</span>
              <span class="font-semibold text-blue-600">-₦${s.closing_pos_actual.toLocaleString()}</span>
            </div>
            <div class="flex justify-between border-t border-slate-100 pt-2 font-bold text-slate-900">
              <span>Calculated Cash Expected in Drawer</span>
              <span>₦${calc.expectedCash.toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div class="space-y-3 border-t border-slate-100 pt-4">
          <h4 class="font-bold text-slate-900">3. Cash Counted & Reconciliation Status</h4>
          <div class="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
            <div>
              <span class="block text-[10px] text-slate-400 uppercase font-semibold">Attendant Counted Physical Cash</span>
              <span class="text-base font-bold text-slate-900">₦${s.closing_cash_actual.toLocaleString()}</span>
            </div>

            <div class="text-right">
              <span class="block text-[10px] text-slate-400 uppercase font-semibold">Audit Variance</span>
              ${calc.variance < 0
                ? `<span class="text-base font-bold text-red-600">-₦${Math.abs(calc.variance).toLocaleString()} (Shortage)</span>`
                : calc.variance > 0
                  ? `<span class="text-base font-bold text-emerald-600">+₦${calc.variance.toLocaleString()} (Surplus)</span>`
                  : `<span class="text-base font-bold text-slate-600">₦0.00 (Balanced)</span>`
              }
            </div>
          </div>
        </div>
      `;

      if (s.status === 'approved') {
        detailsHtml += `
          <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-3.5 text-[11px] text-emerald-800 mt-4">
            <span class="block font-bold">Approved & Audited on: ${new Date(s.reconciled_at).toLocaleString()}</span>
            <p class="mt-1">Audited By: ${s.reconciled_by_name || 'System Accountant'}</p>
            ${s.reconciliation_notes ? `<p class="mt-1.5 border-t border-emerald-200/50 pt-1.5"><strong>Audit Comments:</strong> "${s.reconciliation_notes}"</p>` : ''}
          </div>
        `;
        document.querySelector('#approveShiftModal form').classList.add('hidden');
      } else {
        document.querySelector('#approveShiftModal form').classList.remove('hidden');
        document.getElementById('approveShiftId').value = s.id;
        document.getElementById('approveNotes').value = '';
      }

      document.getElementById('reconcileDetailContent').innerHTML = detailsHtml;
      toggleModal('approveShiftModal', true);
    }
  } catch (err) {
    console.error('Error opening reconciliation review modal:', err);
  }
}

// Handle Approve Shift submission
async function handleApproveShift(e) {
  e.preventDefault();
  const shiftId = document.getElementById('approveShiftId').value;
  const notes = document.getElementById('approveNotes').value.trim();

  try {
    const res = await fetch(`${API_URL}/api/shifts/${shiftId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ notes })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Shift approved and locked successfully!', 'success');
      toggleModal('approveShiftModal', false);
      loadShiftsList();
    } else {
      showToast(data.error || 'Failed to approve shift.', 'error');
    }
  } catch (err) {
    console.error('Error approving shift:', err);
  }
}

// 2. Load analytics trends and Chart.js
async function loadAnalytics() {
  try {
    const res = await fetch(`${API_URL}/api/shifts/analytics`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const { summary, expenseTally } = await res.json();

      document.getElementById('statVolume').innerText = `${(summary.totalAgoLiters + summary.totalDpkLiters + summary.totalPetrolLiters).toFixed(2)} Liters`;
      document.getElementById('statRevenue').innerText = `₦${summary.totalRevenue.toLocaleString()}`;
      document.getElementById('statExpenses').innerText = `₦${summary.totalExpenses.toLocaleString()}`;

      const variance = summary.totalVariance;
      const varStat = document.getElementById('statVariance');
      const varSub = document.getElementById('statVarianceSub');
      if (variance < 0) {
        varStat.innerText = `-₦${Math.abs(variance).toLocaleString()}`;
        varStat.className = 'block text-lg sm:text-2xl font-bold mt-1 text-red-600';
        varSub.innerText = 'Total net shortage';
      } else if (variance > 0) {
        varStat.innerText = `+₦${variance.toLocaleString()}`;
        varStat.className = 'block text-lg sm:text-2xl font-bold mt-1 text-emerald-600';
        varSub.innerText = 'Total net surplus cash collected';
      } else {
        varStat.innerText = `₦0.00`;
        varStat.className = 'block text-lg sm:text-2xl font-bold mt-1 text-slate-800';
        varSub.innerText = 'Perfect physical match!';
      }

      // Render chart
      renderExpenseChart(expenseTally);
    }
  } catch (err) {
    console.error('Error loading analytics summaries:', err);
  }
}

// Draw beautiful chart
function renderExpenseChart(tally) {
  const ctx = document.getElementById('expenseChart').getContext('2d');

  if (state.charts.expenses) {
    state.charts.expenses.destroy();
  }

  const categories = tally.map(t => t.category);
  const amounts = tally.map(t => t.amount);

  if (categories.length === 0) {
    categories.push('No Expenses Logged');
    amounts.push(1);
  }

  state.charts.expenses = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: categories,
      datasets: [{
        data: amounts,
        backgroundColor: [
          '#dc2626', // Red-600
          '#f59e0b', // Orange
          '#10b981', // Emerald
          '#3b82f6', // Blue
          '#8b5cf6'  // Purple
        ],
        borderWidth: 2,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            font: { family: 'Plus Jakarta Sans', size: 11 },
            boxWidth: 12
          }
        }
      }
    }
  });
}

// Global price loader
async function loadCurrentPrices() {
  try {
    const res = await fetch(`${API_URL}/api/tanks/prices`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const prices = await res.json();
      const ago = prices.find(p => p.fuel_type === 'ago')?.price_per_liter || 1100.0;
      const dpk = prices.find(p => p.fuel_type === 'dpk')?.price_per_liter || 1000.0;
      const petrol = prices.find(p => p.fuel_type === 'petrol')?.price_per_liter || 950.0;

      document.getElementById('labelCurrentAgo').innerText = `Current: ₦${ago.toLocaleString()} / L`;
      document.getElementById('labelCurrentDpk').innerText = `Current: ₦${dpk.toLocaleString()} / L`;
      document.getElementById('labelCurrentPetrol').innerText = `Current: ₦${petrol.toLocaleString()} / L`;
    }
  } catch (err) {
    console.error('Error fetching standard prices:', err);
  }
}

// Global price updater
async function handlePriceUpdate(fuel_type) {
  let inputId = 'inputPetrolPrice';
  if (fuel_type === 'ago') inputId = 'inputAgoPrice';
  if (fuel_type === 'dpk') inputId = 'inputDpkPrice';

  const price_per_liter = document.getElementById(inputId).value;

  if (!price_per_liter) {
    showToast('Please enter a price first.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/tanks/prices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ fuel_type, price_per_liter })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`${fuel_type.toUpperCase()} standard price updated to ₦${data.price_per_liter.toLocaleString()}`, 'success');
      document.getElementById(inputId).value = '';
      loadCurrentPrices();
    } else {
      showToast(data.error || 'Failed to update standard price.', 'error');
    }
  } catch (err) {
    console.error('Error updating price:', err);
  }
}

// 3. Load Corporate Customer list
async function loadCorporateCustomers() {
  try {
    const res = await fetch(`${API_URL}/api/customers`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      state.customers = await res.json();
      const list = document.getElementById('corporateCustomersList');
      if (state.customers.length === 0) {
        list.innerHTML = `<p class="text-xs text-slate-400 text-center py-12">No corporate customer accounts yet.</p>`;
        return;
      }

      list.innerHTML = state.customers.map(c => {
        const activeClass = state.selectedCustomerId === c.id ? 'bg-red-50/50 border-red-200' : 'bg-slate-50/50 hover:bg-slate-50 border-slate-100';

        // Custom rates markers
        let pricingTags = [];
        if (c.custom_ago_price) pricingTags.push(`AGO: ₦${c.custom_ago_price}`);
        if (c.custom_dpk_price) pricingTags.push(`DPK: ₦${c.custom_dpk_price}`);
        if (c.custom_petrol_price) pricingTags.push(`PMS: ₦${c.custom_petrol_price}`);
        const finalPricingLabel = pricingTags.length > 0 ? pricingTags.join(', ') : 'Standard Prices';

        // Active status badge
        const statLabel = c.status === 'active' ? 'Active' : 'Inactive';
        const statColor = c.status === 'active' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100';

        return `
          <div onclick="selectCustomer(${c.id})" class="p-4 border rounded-xl cursor-pointer transition text-xs ${activeClass}">
            <div class="flex justify-between font-bold text-slate-900 mb-1.5">
              <span class="flex items-center gap-1.5">${c.name} <span class="text-[9px] px-1 py-0.5 rounded font-bold ${statColor}">${statLabel}</span></span>
              <span class="text-red-600">₦${c.balance.toLocaleString()}</span>
            </div>
            <div class="flex flex-col space-y-0.5 text-slate-400 text-[10px]">
              <span>Prices: <strong class="text-slate-600">${finalPricingLabel}</strong></span>
              <span>Limit: <strong>₦${c.credit_limit.toLocaleString()}</strong></span>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching corporate list:', err);
  }
}

// Select a customer to view ledger statement
function selectCustomer(id) {
  state.selectedCustomerId = id;
  loadCorporateCustomers(); // Redraw with active highlight
  loadCustomerLedger(id);
}

// Create new customer account
async function handleCreateCustomer(e) {
  e.preventDefault();
  const name = document.getElementById('custNameInput').value.trim();
  const custom_ago_price = document.getElementById('custCustomAgoInput').value;
  const custom_dpk_price = document.getElementById('custCustomDpkInput').value;
  const custom_petrol_price = document.getElementById('custCustomPetrolInput').value;
  const credit_limit = document.getElementById('custLimitInput').value;

  try {
    const res = await fetch(`${API_URL}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name, custom_ago_price, custom_dpk_price, custom_petrol_price, credit_limit })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Corporate customer registered successfully!', 'success');
      toggleModal('createCustomerModal', false);
      document.getElementById('custNameInput').value = '';
      document.getElementById('custCustomAgoInput').value = '';
      document.getElementById('custCustomDpkInput').value = '';
      document.getElementById('custCustomPetrolInput').value = '';
      document.getElementById('custLimitInput').value = '';
      loadCorporateCustomers();
    } else {
      showToast(data.error || 'Failed to create customer.', 'error');
    }
  } catch (err) {
    console.error('Error creating customer:', err);
  }
}

// Open customer edit modal
function openEditCustomerModal() {
  const customer = state.customers.find(c => c.id === state.selectedCustomerId);
  if (!customer) return;

  document.getElementById('editCustId').value = customer.id;
  document.getElementById('editCustNameInput').value = customer.name;
  document.getElementById('editCustCustomAgoInput').value = customer.custom_ago_price !== null ? customer.custom_ago_price : '';
  document.getElementById('editCustCustomDpkInput').value = customer.custom_dpk_price !== null ? customer.custom_dpk_price : '';
  document.getElementById('editCustCustomPetrolInput').value = customer.custom_petrol_price !== null ? customer.custom_petrol_price : '';
  document.getElementById('editCustLimitInput').value = customer.credit_limit;
  document.getElementById('editCustStatusInput').value = customer.status;

  toggleModal('editCustomerModal', true);
}

// Submit corporate customer updates
async function handleEditCustomerSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editCustId').value;
  const name = document.getElementById('editCustNameInput').value.trim();
  const custom_ago_price = document.getElementById('editCustCustomAgoInput').value;
  const custom_dpk_price = document.getElementById('editCustCustomDpkInput').value;
  const custom_petrol_price = document.getElementById('editCustCustomPetrolInput').value;
  const credit_limit = document.getElementById('editCustLimitInput').value;
  const status = document.getElementById('editCustStatusInput').value;

  try {
    const res = await fetch(`${API_URL}/api/customers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name, custom_ago_price, custom_dpk_price, custom_petrol_price, credit_limit, status })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Corporate profile updated successfully!', 'success');
      toggleModal('editCustomerModal', false);
      loadCorporateCustomers();
      loadCustomerLedger(state.selectedCustomerId);
    } else {
      showToast(data.error || 'Failed to update corporate profile.', 'error');
    }
  } catch (err) {
    console.error('Error updating customer:', err);
  }
}

// Accountant custom price update handler (Restricted to Accountants & Boss)
async function handleUpdateCustomPrice() {
  const ago = document.getElementById('customAgoPriceInput').value;
  const dpk = document.getElementById('customDpkPriceInput').value;
  const petrol = document.getElementById('customPetrolPriceInput').value;

  try {
    const res = await fetch(`${API_URL}/api/customers/${state.selectedCustomerId}/custom-price`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ custom_ago_price: ago, custom_dpk_price: dpk, custom_petrol_price: petrol })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Corporate custom rates updated!`, 'success');
      document.getElementById('customAgoPriceInput').value = '';
      document.getElementById('customDpkPriceInput').value = '';
      document.getElementById('customPetrolPriceInput').value = '';
      loadCorporateCustomers();
      loadCustomerLedger(state.selectedCustomerId);
    } else {
      showToast(data.error || 'Failed to update custom price.', 'error');
    }
  } catch (err) {
    console.error('Error updating custom price:', err);
  }
}

// Delete corporate customer account
async function handleDeleteCustomer() {
  const customer = state.customers.find(c => c.id === state.selectedCustomerId);
  if (!customer) return;

  const confirmation = confirm(`Are you absolutely sure you want to completely delete corporate customer "${customer.name}"? This action is permanent!`);
  if (!confirmation) return;

  try {
    const res = await fetch(`${API_URL}/api/customers/${customer.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Corporate customer deleted successfully.', 'success');
      state.selectedCustomerId = null;
      document.getElementById('ledgerDetailState').classList.add('hidden');
      document.getElementById('ledgerEmptyState').classList.remove('hidden');
      loadCorporateCustomers();
    } else {
      showToast(data.error || 'Failed to delete customer.', 'error');
    }
  } catch (err) {
    console.error('Error deleting customer:', err);
  }
}

// Load statement ledger lines (reflecting AGO, DPK, Petrol custom values)
async function loadCustomerLedger(customerId) {
  try {
    const res = await fetch(`${API_URL}/api/customers/${customerId}/ledger`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const { customer, ledger } = await res.json();

      document.getElementById('ledgerEmptyState').classList.add('hidden');
      document.getElementById('ledgerDetailState').classList.remove('hidden');

      document.getElementById('ledgerCustomerName').innerText = customer.name;

      const statusBadge = document.getElementById('ledgerCustomerStatusBadge');
      statusBadge.innerText = customer.status;
      if (customer.status === 'active') {
        statusBadge.className = 'text-[9px] uppercase px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800';
      } else {
        statusBadge.className = 'text-[9px] uppercase px-1.5 py-0.5 rounded font-bold bg-slate-200 text-slate-600';
      }

      const agoPriceLabel = customer.custom_ago_price ? `AGO Negotiated pricing rule: ₦${customer.custom_ago_price.toLocaleString()}/L` : 'AGO (Diesel 1): Standard pricing fallback';
      const dpkPriceLabel = customer.custom_dpk_price ? `DPK Negotiated pricing rule: ₦${customer.custom_dpk_price.toLocaleString()}/L` : 'DPK (Diesel 2): Standard pricing fallback';
      const petrolPriceLabel = customer.custom_petrol_price ? `Petrol Negotiated pricing rule: ₦${customer.custom_petrol_price.toLocaleString()}/L` : 'Petrol: Standard pricing fallback';

      document.getElementById('ledgerCustomerAgo').innerText = agoPriceLabel;
      document.getElementById('ledgerCustomerDpk').innerText = dpkPriceLabel;
      document.getElementById('ledgerCustomerPetrol').innerText = petrolPriceLabel;
      document.getElementById('ledgerCustomerLimit').innerText = `Credit Limit: ₦${customer.credit_limit.toLocaleString()}`;

      const balBadge = document.getElementById('ledgerCustomerBalance');
      balBadge.innerText = `₦${customer.balance.toLocaleString()}`;
      if (customer.balance > customer.credit_limit * 0.9) {
        balBadge.className = 'text-xl font-bold text-red-600 animate-pulse';
      } else {
        balBadge.className = 'text-xl font-bold text-red-600';
      }

      // Show/hide Boss profile action buttons dynamically based on roles
      const isBoss = state.user.role === 'boss';
      const editBtn = document.getElementById('editCustomerProfileBtn');
      const deleteBtn = document.getElementById('deleteCustomerProfileBtn');

      if (editBtn) editBtn.style.display = isBoss ? 'block' : 'none';
      if (deleteBtn) deleteBtn.style.display = isBoss ? 'block' : 'none';

      // Render table rows
      const tbody = document.getElementById('ledgerTableBody');
      if (ledger.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">Statement ledger is empty for this client.</td></tr>`;
        return;
      }

      tbody.innerHTML = ledger.map(line => {
        const dateStr = new Date(line.date).toLocaleDateString() + ' ' + new Date(line.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const details = line.type === 'purchase'
          ? `Fuel Taken: ${line.liters.toFixed(2)}L ${line.fuel_type.toUpperCase()} @ ₦${line.price_per_liter.toLocaleString()}/L`
          : `Payment Received (${line.payment_method}) ${line.reference_no ? `- Ref# ${line.reference_no}` : ''} (Rec: ${line.recorded_by_name})`;

        const debit = line.type === 'purchase' ? `+₦${line.amount.toLocaleString()}` : '---';
        const credit = line.type === 'payment' ? `-₦${line.amount.toLocaleString()}` : '---';

        return `
          <tr class="hover:bg-slate-50/50 transition border-b border-slate-100">
            <td class="px-4 py-3 text-slate-500">${dateStr}</td>
            <td class="px-4 py-3 font-semibold text-slate-800">${details}</td>
            <td class="px-4 py-3 text-right font-bold text-red-600">${debit}</td>
            <td class="px-4 py-3 text-right font-bold text-emerald-700">${credit}</td>
            <td class="px-4 py-3 text-right font-bold text-slate-900">₦${line.runningBalance.toLocaleString()}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading ledger line items:', err);
  }
}

// Record corporate client payment
async function handleRecordPayment() {
  const amount = document.getElementById('payAmountInput').value;
  const payment_method = document.getElementById('payMethodInput').value;
  const reference_no = document.getElementById('payRefInput').value.trim();

  if (!amount) {
    showToast('Please enter a payment amount first.', 'error');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/customers/${state.selectedCustomerId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ amount, payment_method, reference_no })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Payment of ₦${parseFloat(amount).toLocaleString()} recorded!`, 'success');
      document.getElementById('payAmountInput').value = '';
      document.getElementById('payRefInput').value = '';
      loadCorporateCustomers();
      loadCustomerLedger(state.selectedCustomerId);
    } else {
      showToast(data.error || 'Failed to record payment.', 'error');
    }
  } catch (err) {
    console.error('Error submitting payment details:', err);
  }
}

// Load real-time live stock status estimation levels across three tanks
async function loadLiveTankStatus() {
  try {
    const res = await fetch(`${API_URL}/api/tanks/status`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const data = await res.json();
      document.getElementById('liveAgoStockLabel').innerText = `${data.ago.live_estimated_stock.toFixed(2)} Liters`;
      document.getElementById('liveDpkStockLabel').innerText = `${data.dpk.live_estimated_stock.toFixed(2)} Liters`;
      document.getElementById('livePetrolStockLabel').innerText = `${data.petrol.live_estimated_stock.toFixed(2)} Liters`;
    }
  } catch (err) {
    console.error('Error fetching live tank status:', err);
  }
}

// 4. Load Tank Wet Stock reports for three products
async function loadTankReports() {
  try {
    const res = await fetch(`${API_URL}/api/tanks`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const logs = await res.json();
      const tbody = document.getElementById('tankTableBody');
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="19" class="text-center text-slate-400 py-12">No daily tank dip reports logged yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const aVarianceClass = l.ago_variance < 0 ? 'text-red-600 bg-red-50/50' : l.ago_variance > 0 ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-600';
        const dVarianceClass = l.dpk_variance < 0 ? 'text-red-600 bg-red-50/50' : l.dpk_variance > 0 ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-600';
        const pVarianceClass = l.petrol_variance < 0 ? 'text-red-600 bg-red-50/50' : l.petrol_variance > 0 ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-600';

        const agoVarLabel = l.ago_variance === 0 ? '0.00' : (l.ago_variance < 0 ? `-${Math.abs(l.ago_variance).toFixed(2)}` : `+${l.ago_variance.toFixed(2)}`);
        const dpkVarLabel = l.dpk_variance === 0 ? '0.00' : (l.dpk_variance < 0 ? `-${Math.abs(l.dpk_variance).toFixed(2)}` : `+${l.dpk_variance.toFixed(2)}`);
        const petrolVarLabel = l.petrol_variance === 0 ? '0.00' : (l.petrol_variance < 0 ? `-${Math.abs(l.petrol_variance).toFixed(2)}` : `+${l.petrol_variance.toFixed(2)}`);

        return `
          <tr class="hover:bg-slate-50/50 transition">
            <td class="px-6 py-4 font-bold text-slate-900 text-left">${l.date}</td>

            <td class="px-4 py-4 bg-orange-50/20 text-slate-700">${l.ago_start_dip.toFixed(2)}</td>
            <td class="px-4 py-4 bg-orange-50/20 text-slate-700">${l.ago_delivery > 0 ? `+${l.ago_delivery.toFixed(2)}` : '---'}</td>
            <td class="px-4 py-4 bg-orange-50/20 text-slate-700">-${l.ago_sold.toFixed(2)}</td>
            <td class="px-4 py-4 bg-orange-50/20 text-slate-700 font-semibold">${l.ago_expected.toFixed(2)}</td>
            <td class="px-4 py-4 bg-orange-50/20 text-slate-900 font-bold">${l.ago_end_dip.toFixed(2)}</td>
            <td class="px-4 py-4 font-bold ${aVarianceClass}">${agoVarLabel}</td>

            <td class="px-4 py-4 bg-amber-50/20 text-slate-700">${l.dpk_start_dip.toFixed(2)}</td>
            <td class="px-4 py-4 bg-amber-50/20 text-slate-700">${l.dpk_delivery > 0 ? `+${l.dpk_delivery.toFixed(2)}` : '---'}</td>
            <td class="px-4 py-4 bg-amber-50/20 text-slate-700">-${l.dpk_sold.toFixed(2)}</td>
            <td class="px-4 py-4 bg-amber-50/20 text-slate-700 font-semibold">${l.dpk_expected.toFixed(2)}</td>
            <td class="px-4 py-4 bg-amber-50/20 text-slate-900 font-bold">${l.dpk_end_dip.toFixed(2)}</td>
            <td class="px-4 py-4 font-bold ${dVarianceClass}">${dpkVarLabel}</td>

            <td class="px-4 py-4 bg-red-50/20 text-slate-700">${l.petrol_start_dip.toFixed(2)}</td>
            <td class="px-4 py-4 bg-red-50/20 text-slate-700">${l.petrol_delivery > 0 ? `+${l.petrol_delivery.toFixed(2)}` : '---'}</td>
            <td class="px-4 py-4 bg-red-50/20 text-slate-700">-${l.petrol_sold.toFixed(2)}</td>
            <td class="px-4 py-4 bg-red-50/20 text-slate-700 font-semibold">${l.petrol_expected.toFixed(2)}</td>
            <td class="px-4 py-4 bg-red-50/20 text-slate-900 font-bold">${l.petrol_end_dip.toFixed(2)}</td>
            <td class="px-4 py-4 font-bold ${pVarianceClass}">${petrolVarLabel}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching tank reports:', err);
  }
}

// Handle recording daily tank inventory dips across AGO, DPK, Petrol
async function handleRecordDips(e) {
  e.preventDefault();
  const date = document.getElementById('dipDateInput').value;
  const ago_start_dip = document.getElementById('dipAgoStart').value;
  const ago_delivery = document.getElementById('dipAgoDeliv').value || '0';
  const ago_end_dip = document.getElementById('dipAgoEnd').value;

  const dpk_start_dip = document.getElementById('dipDpkStart').value;
  const dpk_delivery = document.getElementById('dipDpkDeliv').value || '0';
  const dpk_end_dip = document.getElementById('dipDpkEnd').value;

  const petrol_start_dip = document.getElementById('dipPetrolStart').value;
  const petrol_delivery = document.getElementById('dipPetrolDeliv').value || '0';
  const petrol_end_dip = document.getElementById('dipPetrolEnd').value;

  try {
    const res = await fetch(`${API_URL}/api/tanks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        date,
        ago_start_dip,
        ago_delivery,
        ago_end_dip,
        dpk_start_dip,
        dpk_delivery,
        dpk_end_dip,
        petrol_start_dip,
        petrol_delivery,
        petrol_end_dip
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Inventory reconciled and recorded!', 'success');
      toggleModal('recordDipModal', false);
      // Reset inputs
      document.getElementById('dipDateInput').value = '';
      document.getElementById('dipAgoStart').value = '';
      document.getElementById('dipAgoDeliv').value = '';
      document.getElementById('dipAgoEnd').value = '';
      document.getElementById('dipDpkStart').value = '';
      document.getElementById('dipDpkDeliv').value = '';
      document.getElementById('dipDpkEnd').value = '';
      document.getElementById('dipPetrolStart').value = '';
      document.getElementById('dipPetrolDeliv').value = '';
      document.getElementById('dipPetrolEnd').value = '';
      loadTankReports();
      loadLiveTankStatus();
    } else {
      showToast(data.error || 'Failed to record dips.', 'error');
    }
  } catch (err) {
    console.error('Error logging dip readings:', err);
  }
}

// 5. Load Staff directory
async function loadStaffDirectory() {
  try {
    const res = await fetch(`${API_URL}/api/auth/users`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const users = await res.json();
      const tbody = document.getElementById('staffDirectoryBody');
      const isBoss = state.user.role === 'boss';

      tbody.innerHTML = users.map(u => {
        let actionButtons = '';

        // Only allow Boss role to Reset Password/Delete accounts under staff list
        if (state.user.id !== u.id) {
          if (isBoss) {
            actionButtons = `
              <button onclick="openChangePasswordModal(${u.id}, '${u.full_name}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-bold transition mr-2"><i class="fa-solid fa-key"></i> Reset</button>
              <button onclick="handleDeleteUser(${u.id}, '${u.full_name}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded font-bold transition"><i class="fa-solid fa-user-minus"></i> Remove</button>
            `;
          } else {
            actionButtons = `<span class="text-slate-400 text-[10px] italic font-semibold">Protected (Boss Only)</span>`;
          }
        } else {
          actionButtons = `<span class="text-slate-400 text-[10px] italic font-semibold">Active Account</span>`;
        }

        let roleBadge = '';
        if (u.role === 'boss') {
          roleBadge = `<span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 text-[10px] font-bold">Boss</span>`;
        } else if (u.role === 'accountant') {
          roleBadge = `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[10px] font-bold">Accountant</span>`;
        } else {
          roleBadge = `<span class="px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold">Attendant</span>`;
        }

        return `
          <tr class="hover:bg-slate-50/50 transition">
            <td class="px-6 py-3 font-bold text-slate-900">${u.full_name}</td>
            <td class="px-6 py-3 text-slate-600 font-mono">${u.username}</td>
            <td class="px-6 py-3">${roleBadge}</td>
            <td class="px-6 py-3 text-right">${actionButtons}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching staff directory:', err);
  }
}

// Create new user account directly from Staff tab
async function handleRegisterUser(e) {
  e.preventDefault();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const full_name = document.getElementById('regFullName').value.trim();
  const role = document.getElementById('regRole').value;

  try {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ username, password, full_name, role })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Registered staff account: ${data.user.fullName}!`, 'success');
      toggleModal('createUserModal', false);

      // Reset fields
      document.getElementById('regUsername').value = '';
      document.getElementById('regPassword').value = '';
      document.getElementById('regFullName').value = '';
      loadStaffDirectory();
    } else {
      showToast(data.error || 'Failed to register staff account.', 'error');
    }
  } catch (err) {
    console.error('Error registering user:', err);
  }
}

// Open change password modal
function openChangePasswordModal(userId, fullName) {
  document.getElementById('passTargetUserId').value = userId;
  document.getElementById('passTargetUserLabel').innerText = fullName;
  document.getElementById('regNewPassword').value = '';
  toggleModal('changePasswordModal', true);
}

// Submit password reset
async function handleChangePasswordSubmit(e) {
  e.preventDefault();
  const targetId = document.getElementById('passTargetUserId').value;
  const password = document.getElementById('regNewPassword').value;

  try {
    const res = await fetch(`${API_URL}/api/auth/users/${targetId}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ password })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Staff password changed successfully!', 'success');
      toggleModal('changePasswordModal', false);
    } else {
      showToast(data.error || 'Failed to update password.', 'error');
    }
  } catch (err) {
    console.error('Error updating password:', err);
  }
}

// Delete user account
async function handleDeleteUser(userId, fullName) {
  const confirmation = confirm(`Are you absolutely sure you want to delete staff account "${fullName}"? This user will lose server access instantly!`);
  if (!confirmation) return;

  try {
    const res = await fetch(`${API_URL}/api/auth/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Staff account deleted successfully.', 'success');
      loadStaffDirectory();
    } else {
      showToast(data.error || 'Failed to delete staff account.', 'error');
    }
  } catch (err) {
    console.error('Error deleting user account:', err);
  }
}

// ==========================================
// UTILS & HELPERS
// ==========================================

function toggleModal(modalId, show) {
  const modal = document.getElementById(modalId);
  if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

// Beautiful toast notification helper
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMessage');
  const icon = document.getElementById('toastIcon');

  msg.innerText = message;

  if (type === 'success') {
    toast.className = 'fixed bottom-5 right-5 z-50 flex items-center p-4 space-x-3 text-white rounded-lg shadow-lg bg-emerald-600 transition-all duration-300';
    icon.innerHTML = '<i class="fa-solid fa-circle-check text-lg"></i>';
  } else if (type === 'error') {
    toast.className = 'fixed bottom-5 right-5 z-50 flex items-center p-4 space-x-3 text-white rounded-lg shadow-lg bg-red-600 transition-all duration-300';
    icon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-lg"></i>';
  }

  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// Run initializer
init();
