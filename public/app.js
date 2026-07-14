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

    // Hide register user button if not Boss
    const staffBtn = document.getElementById('btn-staffTab');
    staffBtn.classList.remove('hidden');

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
// ATTENDANT SHIFT LOGIC
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

// Render active shift content
function renderActiveShift() {
  document.getElementById('noShiftView').classList.add('hidden');
  document.getElementById('activeShiftView').classList.remove('hidden');

  const shift = state.activeShift;
  document.getElementById('shiftIDVal').innerText = `#${shift.id}`;
  document.getElementById('shiftFloatVal').innerText = `₦${shift.opening_float.toLocaleString()}`;

  const openedDate = new Date(shift.opened_at);
  document.getElementById('shiftOpenedTime').innerText = openedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + openedDate.toLocaleDateString();

  // Meter start readings
  const dieselMeter = shift.meters.find(m => m.fuel_type === 'diesel');
  const petrolMeter = shift.meters.find(m => m.fuel_type === 'petrol');

  document.getElementById('dieselStartMeterBadge').innerText = dieselMeter.start_meter.toFixed(2);
  document.getElementById('petrolStartMeterBadge').innerText = petrolMeter.start_meter.toFixed(2);

  document.getElementById('dieselPriceBadge').innerText = `₦${dieselMeter.unit_price.toLocaleString()}/L`;
  document.getElementById('petrolPriceBadge').innerText = `₦${petrolMeter.unit_price.toLocaleString()}/L`;

  // Expenses summary list
  const expensesList = document.getElementById('shiftExpensesList');
  let totalExpenses = 0;
  if (shift.expenses.length === 0) {
    expensesList.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No shift expenses logged yet.</p>`;
  } else {
    expensesList.innerHTML = shift.expenses.map(e => {
      totalExpenses += e.amount;
      return `
        <div class="flex items-center justify-between p-2 bg-red-50/50 border border-red-100 rounded-lg text-xs">
          <div>
            <span class="font-bold text-slate-800">${e.category}</span>
            <p class="text-[10px] text-slate-400 mt-0.5">${e.description}</p>
          </div>
          <span class="font-bold text-red-600">-₦${e.amount.toLocaleString()}</span>
        </div>
      `;
    }).join('');
  }
  document.getElementById('shiftExpenseTally').innerText = `Expenses: ₦${totalExpenses.toLocaleString()}`;

  // Credit sales summary list
  const creditList = document.getElementById('shiftCreditSalesList');
  let totalCredit = 0;
  if (shift.creditSales.length === 0) {
    creditList.innerHTML = `<p class="text-xs text-slate-400 text-center py-6">No credit sales logged yet.</p>`;
  } else {
    creditList.innerHTML = shift.creditSales.map(c => {
      totalCredit += c.total_amount;
      return `
        <div class="flex items-center justify-between p-2 bg-emerald-50/50 border border-emerald-100 rounded-lg text-xs">
          <div>
            <span class="font-bold text-slate-800">${c.customer_name}</span>
            <p class="text-[10px] text-slate-400 mt-0.5">${c.liters.toFixed(2)}L ${c.fuel_type} @ ₦${c.price_per_liter.toLocaleString()}</p>
          </div>
          <span class="font-bold text-emerald-700">+₦${c.total_amount.toLocaleString()}</span>
        </div>
      `;
    }).join('');
  }
  document.getElementById('shiftCreditTally').innerText = `Credits: ₦${totalCredit.toLocaleString()}`;
}

// Handle opening shift
async function handleOpenShift(e) {
  e.preventDefault();
  const opening_float = document.getElementById('openFloatInput').value;
  const diesel_start_meter = document.getElementById('openDieselMeterInput').value;
  const petrol_start_meter = document.getElementById('openPetrolMeterInput').value;
  const diesel_price = document.getElementById('openDieselPriceInput').value;
  const petrol_price = document.getElementById('openPetrolPriceInput').value;

  try {
    const res = await fetch(`${API_URL}/api/shifts/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ opening_float, diesel_start_meter, petrol_start_meter, diesel_price, petrol_price })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Shift opened successfully!', 'success');
      toggleModal('openShiftModal', false);
      // Reset input fields
      document.getElementById('openFloatInput').value = '';
      document.getElementById('openDieselMeterInput').value = '';
      document.getElementById('openPetrolMeterInput').value = '';
      document.getElementById('openDieselPriceInput').value = '';
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
          const rateLabel = c.custom_diesel_price ? `(Custom Diesel Rate: ₦${c.custom_diesel_price.toLocaleString()}/L)` : '(Standard Price)';
          return `<option value="${c.id}">${c.name} ${rateLabel}</option>`;
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

// Trigger shift close preview before actual submission so attendant can review/correct!
function handleTriggerShiftPreview(e) {
  e.preventDefault();
  const dieselEnd = parseFloat(document.getElementById('closeDieselMeterInput').value);
  const petrolEnd = parseFloat(document.getElementById('closePetrolMeterInput').value);
  const cashActual = parseFloat(document.getElementById('closeCashInput').value);
  const posActual = parseFloat(document.getElementById('closePosInput').value || 0);

  const shift = state.activeShift;
  const dieselMeter = shift.meters.find(m => m.fuel_type === 'diesel');
  const petrolMeter = shift.meters.find(m => m.fuel_type === 'petrol');

  if (dieselEnd < dieselMeter.start_meter) {
    showToast(`Diesel end reading (${dieselEnd}) cannot be less than start (${dieselMeter.start_meter}).`, 'error');
    return;
  }
  if (petrolEnd < petrolMeter.start_meter) {
    showToast(`Petrol end reading (${petrolEnd}) cannot be less than start (${petrolMeter.start_meter}).`, 'error');
    return;
  }

  // Calculate parameters
  const dieselLiters = dieselEnd - dieselMeter.start_meter;
  const petrolLiters = petrolEnd - petrolMeter.start_meter;
  const dieselRevenue = dieselLiters * dieselMeter.unit_price;
  const petrolRevenue = petrolLiters * petrolMeter.unit_price;
  const totalRevenue = dieselRevenue + petrolRevenue;

  const totalExpenses = shift.expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCreditSales = shift.creditSales.reduce((sum, c) => sum + c.total_amount, 0);

  const expectedCash = totalRevenue - totalCreditSales - totalExpenses - posActual + shift.opening_float;
  const variance = cashActual - expectedCash;

  // Store close payload for confirmation
  state.closePayload = {
    diesel_end_meter: dieselEnd,
    petrol_end_meter: petrolEnd,
    closing_cash_actual: cashActual,
    closing_pos_actual: posActual
  };

  // Render preview HTML
  const container = document.getElementById('previewContent');
  container.innerHTML = `
    <div class="grid grid-cols-2 gap-4 border-b border-slate-100 pb-3">
      <div>
        <span class="block text-[10px] text-slate-400 font-bold">DIESEL SOLD</span>
        <span class="font-mono font-bold text-slate-800 text-sm">${dieselLiters.toFixed(2)} Liters</span>
        <p class="text-[10px] text-slate-400 mt-0.5">Revenue: ₦${dieselRevenue.toLocaleString()}</p>
      </div>
      <div>
        <span class="block text-[10px] text-slate-400 font-bold">PETROL SOLD</span>
        <span class="font-mono font-bold text-slate-800 text-sm">${petrolLiters.toFixed(2)} Liters</span>
        <p class="text-[10px] text-slate-400 mt-0.5">Revenue: ₦${petrolRevenue.toLocaleString()}</p>
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
      document.getElementById('closeDieselMeterInput').value = '';
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
  } else if (tabId === 'staffTab') {
    loadStaffDirectory();
  }
}

// 1. Load shift reconciliations
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
          actionBtn = `<button onclick="openReconcileReviewModal(${s.id})" class="px-3 py-1.5 bg-slate-100 text-slate-500 font-semibold rounded text-[11px]">View Audit Details</button>`;
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

// Open Shift Detail Reconciliation popup review
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
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-orange-50/40 border border-orange-100 p-3 rounded-xl">
              <span class="text-[10px] text-orange-800 font-bold">DIESEL</span>
              <span class="block font-mono font-bold mt-1 text-slate-800">${calc.dieselLiters.toFixed(2)} Liters</span>
              <span class="text-[10px] text-slate-400">Revenue: ₦${calc.dieselRevenue.toLocaleString()}</span>
            </div>
            <div class="bg-red-50/40 border border-red-100 p-3 rounded-xl">
              <span class="text-[10px] text-red-800 font-bold">PETROL</span>
              <span class="block font-mono font-bold mt-1 text-slate-800">${calc.petrolLiters.toFixed(2)} Liters</span>
              <span class="text-[10px] text-slate-400">Revenue: ₦${calc.petrolRevenue.toLocaleString()}</span>
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

      document.getElementById('statVolume').innerText = `${(summary.totalDieselLiters + summary.totalPetrolLiters).toFixed(2)} Liters`;
      document.getElementById('statRevenue').innerText = `₦${summary.totalRevenue.toLocaleString()}`;
      document.getElementById('statExpenses').innerText = `₦${summary.totalExpenses.toLocaleString()}`;

      const variance = summary.totalVariance;
      const varStat = document.getElementById('statVariance');
      const varSub = document.getElementById('statVarianceSub');
      if (variance < 0) {
        varStat.innerText = `-₦${Math.abs(variance).toLocaleString()}`;
        varStat.className = 'block text-2xl font-bold mt-1 text-red-600';
        varSub.innerText = 'Total net shortage (uncollected cash)';
      } else if (variance > 0) {
        varStat.innerText = `+₦${variance.toLocaleString()}`;
        varStat.className = 'block text-2xl font-bold mt-1 text-emerald-600';
        varSub.innerText = 'Total net surplus cash collected';
      } else {
        varStat.innerText = `₦0.00`;
        varStat.className = 'block text-2xl font-bold mt-1 text-slate-800';
        varSub.innerText = 'Perfect physical cash drawer match!';
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
      const diesel = prices.find(p => p.fuel_type === 'diesel')?.price_per_liter || 1100.0;
      const petrol = prices.find(p => p.fuel_type === 'petrol')?.price_per_liter || 950.0;

      document.getElementById('labelCurrentDiesel').innerText = `Current: ₦${diesel.toLocaleString()} / L`;
      document.getElementById('labelCurrentPetrol').innerText = `Current: ₦${petrol.toLocaleString()} / L`;
    }
  } catch (err) {
    console.error('Error fetching standard prices:', err);
  }
}

// Global price updater
async function handlePriceUpdate(fuel_type) {
  const inputId = fuel_type === 'diesel' ? 'inputDieselPrice' : 'inputPetrolPrice';
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
        const customPriceLabel = c.custom_diesel_price ? `₦${c.custom_diesel_price.toLocaleString()}/L` : 'Standard';

        // Active status badge
        const statLabel = c.status === 'active' ? 'Active' : 'Inactive';
        const statColor = c.status === 'active' ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100';

        return `
          <div onclick="selectCustomer(${c.id})" class="p-4 border rounded-xl cursor-pointer transition text-xs ${activeClass}">
            <div class="flex justify-between font-bold text-slate-900 mb-1.5">
              <span class="flex items-center gap-1.5">${c.name} <span class="text-[9px] px-1 py-0.5 rounded font-bold ${statColor}">${statLabel}</span></span>
              <span class="text-red-600">₦${c.balance.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-slate-400 text-[10px]">
              <span>Diesel Price: <strong class="text-slate-600">${customPriceLabel}</strong></span>
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
  const custom_diesel_price = document.getElementById('custCustomDieselInput').value;
  const credit_limit = document.getElementById('custLimitInput').value;

  try {
    const res = await fetch(`${API_URL}/api/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name, custom_diesel_price, credit_limit })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Corporate customer registered successfully!', 'success');
      toggleModal('createCustomerModal', false);
      document.getElementById('custNameInput').value = '';
      document.getElementById('custCustomDieselInput').value = '';
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
  document.getElementById('editCustCustomDieselInput').value = customer.custom_diesel_price !== null ? customer.custom_diesel_price : '';
  document.getElementById('editCustLimitInput').value = customer.credit_limit;
  document.getElementById('editCustStatusInput').value = customer.status;

  toggleModal('editCustomerModal', true);
}

// Submit corporate customer updates
async function handleEditCustomerSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('editCustId').value;
  const name = document.getElementById('editCustNameInput').value.trim();
  const custom_diesel_price = document.getElementById('editCustCustomDieselInput').value;
  const credit_limit = document.getElementById('editCustLimitInput').value;
  const status = document.getElementById('editCustStatusInput').value;

  try {
    const res = await fetch(`${API_URL}/api/customers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ name, custom_diesel_price, credit_limit, status })
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

// Load statement ledger lines
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

      const rateLabel = customer.custom_diesel_price ? `Custom Diesel Rate: ₦${customer.custom_diesel_price.toLocaleString()}/L` : 'Diesel: Standard Rate';
      document.getElementById('ledgerCustomerPrice').innerText = rateLabel;
      document.getElementById('ledgerCustomerLimit').innerText = `Credit Limit: ₦${customer.credit_limit.toLocaleString()}`;

      const balBadge = document.getElementById('ledgerCustomerBalance');
      balBadge.innerText = `₦${customer.balance.toLocaleString()}`;
      if (customer.balance > customer.credit_limit * 0.9) {
        balBadge.className = 'text-xl font-bold text-red-600 animate-pulse';
      } else {
        balBadge.className = 'text-xl font-bold text-red-600';
      }

      // Render table rows
      const tbody = document.getElementById('ledgerTableBody');
      if (ledger.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">Statement ledger is empty for this client.</td></tr>`;
        return;
      }

      tbody.innerHTML = ledger.map(line => {
        const dateStr = new Date(line.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        const details = line.type === 'purchase'
          ? `Fuel Taken: ${line.liters.toFixed(2)}L ${line.fuel_type.toUpperCase()} @ ₦${line.price_per_liter.toLocaleString()}/L`
          : `Payment Received (${line.payment_method}) ${line.reference_no ? `- Ref# ${line.reference_no}` : ''} (Rec: ${line.recorded_by_name})`;

        const debit = line.type === 'purchase' ? `+₦${line.amount.toLocaleString()}` : '---';
        const credit = line.type === 'payment' ? `-₦${line.amount.toLocaleString()}` : '---';

        return `
          <tr class="hover:bg-slate-50/50 transition">
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

// 4. Load Tank Wet Stock reports
async function loadTankReports() {
  try {
    const res = await fetch(`${API_URL}/api/tanks`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    if (res.ok) {
      const logs = await res.json();
      const tbody = document.getElementById('tankTableBody');
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="13" class="text-center text-slate-400 py-12">No daily tank dip reports logged yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = logs.map(l => {
        const dVarianceClass = l.diesel_variance < 0 ? 'text-red-600 bg-red-50/50' : l.diesel_variance > 0 ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-600';
        const pVarianceClass = l.petrol_variance < 0 ? 'text-red-600 bg-red-50/50' : l.petrol_variance > 0 ? 'text-emerald-700 bg-emerald-50/50' : 'text-slate-600';

        const dieselVarLabel = l.diesel_variance === 0 ? '0.00' : (l.diesel_variance < 0 ? `-${Math.abs(l.diesel_variance).toFixed(2)}` : `+${l.diesel_variance.toFixed(2)}`);
        const petrolVarLabel = l.petrol_variance === 0 ? '0.00' : (l.petrol_variance < 0 ? `-${Math.abs(l.petrol_variance).toFixed(2)}` : `+${l.petrol_variance.toFixed(2)}`);

        return `
          <tr class="hover:bg-slate-50/50 transition">
            <td class="px-6 py-4 font-bold text-slate-900">${l.date}</td>

            <td class="px-6 py-4 bg-orange-50/20 text-slate-700">${l.diesel_start_dip.toFixed(2)}</td>
            <td class="px-6 py-4 bg-orange-50/20 text-slate-700">${l.diesel_delivery > 0 ? `+${l.diesel_delivery.toFixed(2)}` : '---'}</td>
            <td class="px-6 py-4 bg-orange-50/20 text-slate-700">-${l.diesel_sold.toFixed(2)}</td>
            <td class="px-6 py-4 bg-orange-50/20 text-slate-700 font-semibold">${l.diesel_expected.toFixed(2)}</td>
            <td class="px-6 py-4 bg-orange-50/20 text-slate-900 font-bold">${l.diesel_end_dip.toFixed(2)}</td>
            <td class="px-6 py-4 font-bold ${dVarianceClass}">${dieselVarLabel}</td>

            <td class="px-6 py-4 bg-red-50/20 text-slate-700">${l.petrol_start_dip.toFixed(2)}</td>
            <td class="px-6 py-4 bg-red-50/20 text-slate-700">${l.petrol_delivery > 0 ? `+${l.petrol_delivery.toFixed(2)}` : '---'}</td>
            <td class="px-6 py-4 bg-red-50/20 text-slate-700">-${l.petrol_sold.toFixed(2)}</td>
            <td class="px-6 py-4 bg-red-50/20 text-slate-700 font-semibold">${l.petrol_expected.toFixed(2)}</td>
            <td class="px-6 py-4 bg-red-50/20 text-slate-900 font-bold">${l.petrol_end_dip.toFixed(2)}</td>
            <td class="px-6 py-4 font-bold ${pVarianceClass}">${petrolVarLabel}</td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error fetching tank reports:', err);
  }
}

// Handle recording daily tank inventory dips
async function handleRecordDips(e) {
  e.preventDefault();
  const date = document.getElementById('dipDateInput').value;
  const diesel_start_dip = document.getElementById('dipDieselStart').value;
  const diesel_delivery = document.getElementById('dipDieselDeliv').value || '0';
  const diesel_end_dip = document.getElementById('dipDieselEnd').value;

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
        diesel_start_dip,
        diesel_delivery,
        diesel_end_dip,
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
      document.getElementById('dipDieselStart').value = '';
      document.getElementById('dipDieselDeliv').value = '';
      document.getElementById('dipDieselEnd').value = '';
      document.getElementById('dipPetrolStart').value = '';
      document.getElementById('dipPetrolDeliv').value = '';
      document.getElementById('dipPetrolEnd').value = '';
      loadTankReports();
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

      tbody.innerHTML = users.map(u => {
        let actionButtons = '';

        // Prevent deletion of own user
        if (state.user.id !== u.id) {
          actionButtons = `
            <button onclick="openChangePasswordModal(${u.id}, '${u.full_name}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-bold transition mr-2"><i class="fa-solid fa-key"></i> Pass</button>
            <button onclick="handleDeleteUser(${u.id}, '${u.full_name}')" class="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded font-bold transition"><i class="fa-solid fa-user-minus"></i> Remove</button>
          `;
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
