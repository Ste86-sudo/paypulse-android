/* ==========================================================================
   PAYPULSE - CORE APPLICATION LOGIC
   ========================================================================== */

// 1. App State & Initial Configuration
let state = {
  transactions: [],
  budgets: {
    "Spesa": 250,
    "Intrattenimento": 60,
    "Trasporti": 120,
    "Shopping": 180,
    "Ristorazione": 100,
    "Utenze": 300,
    "Altro": 100
  },
  banksConnected: {
    "PayPal": true,
    "Intesa SP": true,
    "Revolut": false,
    "PostePay": false,
    "AMEX": false,
    "N26": false
  }
};

const CATEGORY_ICONS = {
  "Spesa": "🛒",
  "Intrattenimento": "🎬",
  "Trasporti": "🚗",
  "Shopping": "🛍️",
  "Ristorazione": "🍔",
  "Utenze": "🏠",
  "Stipendio": "💰",
  "Altro": "🏷️"
};

const CATEGORY_COLORS = {
  "Spesa": "#10b981",          // Emerald Green
  "Intrattenimento": "#a78bfa",  // Pastel Violet
  "Trasporti": "#3b82f6",      // Blue
  "Shopping": "#ec4899",       // Pink Neon
  "Ristorazione": "#f59e0b",     // Amber
  "Utenze": "#6366f1",         // Indigo
  "Stipendio": "#34d399",      // Mint Green
  "Altro": "#94a3b8"           // Slate Grey
};

// Standard mock data to boot the app beautifully on first load
const INITIAL_TRANSACTIONS = [
  { id: "tx-1", type: "expense", amount: 14.99, merchant: "Netflix Inc.", category: "Intrattenimento", bank: "PayPal", date: getOffsetDateString(0) },
  { id: "tx-2", type: "expense", amount: 48.50, merchant: "Esselunga Supermercati", category: "Spesa", bank: "Intesa SP", date: getOffsetDateString(-1) },
  { id: "tx-3", type: "income", amount: 1650.00, merchant: "Stipendio Azienda SRL", category: "Stipendio", bank: "Intesa SP", date: getOffsetDateString(-2) },
  { id: "tx-4", type: "expense", amount: 8.20, merchant: "Uber Trip Rome", category: "Trasporti", bank: "Revolut", date: getOffsetDateString(-3) },
  { id: "tx-5", type: "expense", amount: 85.20, merchant: "Servizio Elettrico (Bolletta)", category: "Utenze", bank: "Intesa SP", date: getOffsetDateString(-5) },
  { id: "tx-6", type: "expense", amount: 39.99, merchant: "Zara S.P.A.", category: "Shopping", bank: "PostePay", date: getOffsetDateString(-7) }
];

// Helper to generate dates relative to today
function getOffsetDateString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

// Format currency standard Italian style
function formatCurrency(amount) {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
}

// Format dates in user-friendly Italian format
function formatDateItalian(dateString) {
  const options = { day: 'numeric', month: 'short' };
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  
  const today = new Date().toISOString().split('T')[0];
  const yesterday = getOffsetDateString(-1);
  
  if (dateString === today) return "Oggi";
  if (dateString === yesterday) return "Ieri";
  
  return d.toLocaleDateString('it-IT', options);
}

// 2. LocalStorage Persistence & Init
function initStorage() {
  const stored = localStorage.getItem('paypulse_state');
  if (stored) {
    try {
      state = JSON.parse(stored);
    } catch (e) {
      console.error("Error reading LocalStorage, recovering state.", e);
      resetToDefaultState();
    }
  } else {
    resetToDefaultState();
  }
}

function saveState() {
  localStorage.setItem('paypulse_state', JSON.stringify(state));
}

function resetToDefaultState() {
  state.transactions = [...INITIAL_TRANSACTIONS];
  state.budgets = {
    "Spesa": 250,
    "Intrattenimento": 60,
    "Trasporti": 120,
    "Shopping": 180,
    "Ristorazione": 100,
    "Utenze": 300,
    "Altro": 100
  };
  state.banksConnected = {
    "PayPal": true,
    "Intesa SP": true,
    "Revolut": false,
    "PostePay": false,
    "AMEX": false,
    "N26": false
  };
  saveState();
}

// 3. Smart Parser RegEx Engine (Italian & European notification structures)
function parseNotificationText(text) {
  if (!text || text.trim() === "") return null;
  
  const cleanText = text.trim();
  let amount = null;
  let merchant = "Esercente Sconosciuto";
  let type = "expense"; // Default to expense
  let bank = "Banca / Carta";

  // A. Bank / Card extraction patterns
  if (/paypal/i.test(cleanText)) bank = "PayPal";
  else if (/intesa/i.test(cleanText)) bank = "Intesa SP";
  else if (/revolut/i.test(cleanText)) bank = "Revolut";
  else if (/postepay/i.test(cleanText)) bank = "PostePay";
  else if (/amex|american express/i.test(cleanText)) bank = "AMEX";
  else if (/n26/i.test(cleanText)) bank = "N26";

  // B. Amount detection (Matches formats: 15,99 EUR, €15.99, 1.250,00 €, etc.)
  // Regular expressions to extract floats with decimals
  const amountRegexes = [
    /(?:eur|€)\s*([\d\.,]+)/i,        // e.g. € 15,99 or EUR15.00
    /([\d\.,]+)\s*(?:eur|€)/i,        // e.g. 15,99 EUR or 12.50€
    /addebito di\s*([\d\.,]+)/i,
    /spesa di\s*([\d\.,]+)/i
  ];

  for (const regex of amountRegexes) {
    const match = cleanText.match(regex);
    if (match && match[1]) {
      let rawVal = match[1];
      // Convert standard European numbering (dots as thousands, commas as decimals)
      // Remove all dots first if there are commas, then replace commas with dots
      if (rawVal.includes(',') && rawVal.includes('.')) {
        rawVal = rawVal.replace(/\./g, '').replace(/,/g, '.');
      } else if (rawVal.includes(',')) {
        rawVal = rawVal.replace(/,/g, '.');
      }
      
      const parsedFloat = parseFloat(rawVal);
      if (!isNaN(parsedFloat)) {
        amount = parsedFloat;
        break;
      }
    }
  }

  // C. Type Detection (Accrediti vs Spese)
  if (/ricevuto|accredito|accreditati|stipendio|bonifico a tuo favore/i.test(cleanText)) {
    type = "income";
  }

  // D. Merchant Extraction Patterns
  // Look for keywords indicating the recipient/merchant
  const merchantPatterns = [
    /presso\s+([^,\.\d\n]+)/i,          // "presso Esselunga..."
    /a\s+favore\s+di\s+([^,\.\d\n]+)/i,  // "a favore di Netflix..."
    /inviato\s+(?:a|per)\s+([^,\.\d\n]+?)(?:\s+con|\.|$)/i, // "inviato a Spotify..."
    /da\s+([^,\.\d\n]+)/i,               // "ricevuto da Mario Rossi..."
    /effettuata\s+da\s+([^,\.\d\n]+)/i,   // "effettuata da ENI Station..."
    /a\s+([^,\.\d\n]+)/i                 // generic backup: "inviato a Netflix..."
  ];

  for (const pattern of merchantPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].trim();
      // Clean up common boilerplate words from merchant names
      candidate = candidate.replace(/^(?:un|una|il|lo|la|i|gli|le|a|da|su|con|per|in|con successo)\s+/i, '');
      candidate = candidate.replace(/\s+(?:effettuato|effettuata|carta|terminante|con successo|con|del|al).*$/i, '');
      if (candidate.length > 2 && candidate.length < 40) {
        merchant = candidate;
        break;
      }
    }
  }

  // If no amount was parsed, we return failure
  if (amount === null) return null;

  // E. Dynamic Auto-Categorization based on extracted merchant
  let category = "Altro";
  const mLower = merchant.toLowerCase();
  
  if (type === "income") {
    category = "Stipendio";
  } else {
    if (/netflix|spotify|disney|prime|steam|playstation|cinema|teatro|audible|youtube/i.test(mLower)) {
      category = "Intrattenimento";
    } else if (/esselunga|coop|conad|carrefour|lidl|supermercato|despar|pam|unes|cra/i.test(mLower)) {
      category = "Spesa";
    } else if (/uber|eni|q8|ip|treno|trenitalia|itotali|taxi|benzina|carburante|autostrade|atm|ticket/i.test(mLower)) {
      category = "Trasporti";
    } else if (/zara|h&m|amazon|asos|nike|zalando|decathlon|mediaworld|unieuro|apple|shopping|ebay/i.test(mLower)) {
      category = "Shopping";
    } else if (/deliveroo|just\s*eat|glovo|ristorante|pizzeria|mcdonald|starbucks|bar|caffetteria|burger\s*king/i.test(mLower)) {
      category = "Ristorazione";
    } else if (/enel|gas|luce|servizio\s+elettrico|acquedotto|affitto|condominio|bolletta|vodafone|tim|wind/i.test(mLower)) {
      category = "Utenze";
    }
  }

  return {
    id: "tx-" + Date.now(),
    type,
    amount,
    merchant,
    category,
    bank,
    date: new Date().toISOString().split('T')[0]
  };
}

// 4. UI RENDER ENGINE (HTML Injection)

// Update all dashboards statistics (Income, Expense, Balance)
function updateFinancialStats() {
  let incomeTotal = 0;
  let expenseTotal = 0;

  state.transactions.forEach(t => {
    if (t.type === "income") incomeTotal += t.amount;
    else expenseTotal += t.amount;
  });

  const estimatedBalance = incomeTotal - expenseTotal;

  document.getElementById('dashboard-total-balance').textContent = formatCurrency(estimatedBalance);
  document.getElementById('dashboard-total-income').textContent = formatCurrency(incomeTotal);
  document.getElementById('dashboard-total-expenses').textContent = formatCurrency(expenseTotal);
}

// Render dynamic recent transaction items on Dashboard
function renderDashboardTransactions() {
  const container = document.getElementById('dashboard-transactions-list');
  container.innerHTML = "";

  // Get last 4 transactions
  const recents = [...state.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);

  if (recents.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">📭</span>
        <p>Nessuna transazione registrata.</p>
      </div>
    `;
    return;
  }

  recents.forEach(t => {
    const icon = CATEGORY_ICONS[t.category] || "🏷️";
    const bgCol = CATEGORY_COLORS[t.category] || "#94a3b8";
    const amountFormatted = (t.type === 'expense' ? '-' : '+') + formatCurrency(t.amount);
    const amountClass = t.type === 'expense' ? 'expense' : 'income';

    const item = document.createElement('div');
    item.className = "transaction-item";
    item.innerHTML = `
      <div class="trans-left">
        <div class="trans-icon-bg" style="border-color: ${bgCol}33; color: ${bgCol}; background: ${bgCol}0a;">
          ${icon}
        </div>
        <div class="trans-info">
          <span class="trans-merchant">${t.merchant}</span>
          <span class="trans-bank-date">
            <span>🏦 ${t.bank}</span> • <span>${formatDateItalian(t.date)}</span>
          </span>
        </div>
      </div>
      <div class="trans-right">
        <span class="trans-amount ${amountClass}">${amountFormatted}</span>
        <span class="trans-category-tag">${t.category}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

// Calculate spending per category
function getCategorySpending() {
  const spending = {};
  // Initialize standard categories
  Object.keys(state.budgets).forEach(cat => {
    spending[cat] = 0;
  });

  state.transactions.forEach(t => {
    if (t.type === 'expense') {
      spending[t.category] = (spending[t.category] || 0) + t.amount;
    }
  });

  return spending;
}

// Render dynamic budgets lists with custom colors & warnings
function renderDashboardBudgets() {
  const container = document.getElementById('dashboard-budget-list');
  container.innerHTML = "";

  const categorySpending = getCategorySpending();
  
  // Show top 3 budgets with highest usage percentage
  const budgetList = [];
  Object.keys(state.budgets).forEach(cat => {
    const limit = state.budgets[cat];
    const spent = categorySpending[cat] || 0;
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    budgetList.push({ category: cat, limit, spent, percent });
  });

  // Sort by highest percentage of budget used
  budgetList.sort((a, b) => b.percent - a.percent);

  // Render top 3
  budgetList.slice(0, 3).forEach(b => {
    let barColorClass = "budget-bar-success";
    if (b.percent > 90) barColorClass = "budget-bar-danger";
    else if (b.percent > 65) barColorClass = "budget-bar-warning";

    const item = document.createElement('div');
    item.className = "budget-item";
    item.innerHTML = `
      <div class="budget-meta-row">
        <span class="budget-cat-name">${CATEGORY_ICONS[b.category]} ${b.category}</span>
        <span class="budget-values">${formatCurrency(b.spent)} / <small>${formatCurrency(b.limit)}</small></span>
      </div>
      <div class="budget-progress-track">
        <div class="budget-progress-bar ${barColorClass}" style="width: ${Math.min(b.percent, 100)}%;"></div>
      </div>
    `;
    container.appendChild(item);
  });
}

// 5. VECTOR SVG CHART GENERATOR (Offline Dashboard Analytics)

// Generates an interactive SVG Doughnut Chart for analytics screen
function renderDoughnutChart() {
  const container = document.getElementById('category-donut-chart-container');
  const legendContainer = document.getElementById('category-chart-legend');
  
  container.innerHTML = "";
  legendContainer.innerHTML = "";

  const categorySpending = getCategorySpending();
  let totalExpenses = 0;
  
  // Calculate total expense
  Object.values(categorySpending).forEach(val => totalExpenses += val);

  if (totalExpenses === 0) {
    container.innerHTML = `
      <div class="chart-center-label">
        <span class="chart-center-amount">€0,00</span>
        <span class="chart-center-text">Spese</span>
      </div>
    `;
    legendContainer.innerHTML = "<p style='grid-column: span 2; text-align: center; color: #a1a1aa; font-size: 0.8rem;'>Nessuna spesa nel periodo</p>";
    return;
  }

  // Generate SVG circles segments using stroke-dasharray
  let svgHTML = `<svg width="100%" height="100%" viewBox="0 0 42 42" class="donut-svg">
    <circle class="donut-hole" cx="21" cy="21" r="15.91549430918954" fill="transparent"></circle>
    <circle class="donut-ring" cx="21" cy="21" r="15.91549430918954" fill="transparent" stroke="rgba(255,255,255,0.03)" stroke-width="4.5"></circle>
  `;

  let accumulatedPercent = 0;

  Object.keys(categorySpending).forEach(cat => {
    const spent = categorySpending[cat];
    if (spent <= 0) return;

    const percent = (spent / totalExpenses) * 100;
    const color = CATEGORY_COLORS[cat] || "#94a3b8";
    
    // Stroke dash calculations for radius 15.915... (circumference is exactly 100)
    const strokeDash = `${percent} ${100 - percent}`;
    const offset = 100 - accumulatedPercent + 25; // 25 adds 90deg offset to start from 12 o'clock

    svgHTML += `
      <circle class="donut-segment" cx="21" cy="21" r="15.91549430918954" 
              fill="transparent" stroke="${color}" stroke-width="4.8" 
              stroke-dasharray="${strokeDash}" stroke-dashoffset="${offset}"
              stroke-linecap="round"
              style="transition: stroke-dashoffset 0.6s ease-in-out;">
      </circle>
    `;

    accumulatedPercent += percent;

    // Inject Legend details
    const legendItem = document.createElement('div');
    legendItem.className = "legend-item";
    legendItem.innerHTML = `
      <span class="legend-color" style="background-color: ${color};"></span>
      <span class="legend-text">${cat} (${Math.round(percent)}%)</span>
    `;
    legendContainer.appendChild(legendItem);
  });

  svgHTML += `</svg>
    <div class="chart-center-label">
      <span class="chart-center-amount">${formatCurrency(totalExpenses)}</span>
      <span class="chart-center-text">Tot. Speso</span>
    </div>
  `;

  container.innerHTML = svgHTML;
}

// Generates a dynamic linear trend SVG curve of last 5 days
function renderTrendLineChart() {
  const container = document.getElementById('trend-line-chart-container');
  container.innerHTML = "";

  // 1. Group expenses of last 5 days
  const dataPoints = [];
  for (let i = 4; i >= 0; i--) {
    const dateStr = getOffsetDateString(-i);
    const dayName = new Date(dateStr).toLocaleDateString('it-IT', { weekday: 'short' });
    
    // Sum expenses for this specific date
    let dailySum = 0;
    state.transactions.forEach(t => {
      if (t.date === dateStr && t.type === 'expense') {
        dailySum += t.amount;
      }
    });

    dataPoints.push({ label: dayName, value: dailySum });
  }

  // 2. Build coordinate geometry
  const width = 340;
  const height = 90;
  const paddingX = 30;
  const paddingY = 15;

  const maxVal = Math.max(...dataPoints.map(d => d.value), 20); // Minimum scale height of 20
  
  // Calculate X & Y coordinates
  const points = dataPoints.map((dp, idx) => {
    const x = paddingX + (idx * (width - 2 * paddingX) / (dataPoints.length - 1));
    const y = height - paddingY - (dp.value * (height - 2 * paddingY) / maxVal);
    return { x, y, val: dp.value, label: dp.label };
  });

  // 3. Create SVG template
  let dPath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    // Make it a smooth cubic bezier spline curve instead of straight jagged lines
    const prev = points[i - 1];
    const curr = points[i];
    const cpX1 = prev.x + (curr.x - prev.x) / 2;
    const cpY1 = prev.y;
    const cpX2 = prev.x + (curr.x - prev.x) / 2;
    const cpY2 = curr.y;
    dPath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
  }

  // Dynamic gradient area under the path
  let dArea = `${dPath} L ${points[points.length-1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

  let svgHTML = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
    <defs>
      <!-- Neon Line Gradient -->
      <linearGradient id="trendLineGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#8b5cf6"/>
        <stop offset="50%" stop-color="#ec4899"/>
        <stop offset="100%" stop-color="#f43f5e"/>
      </linearGradient>
      
      <!-- Translucent Fill Gradient -->
      <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.0"/>
      </linearGradient>
      
      <!-- Glow filter -->
      <filter id="lineGlow" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    
    <!-- Horizon grid lines -->
    <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
    <line x1="${paddingX}" y1="${height/2}" x2="${width - paddingX}" y2="${height/2}" stroke="rgba(255,255,255,0.03)" stroke-width="1" stroke-dasharray="2,4"/>
    
    <!-- Shaded area beneath the curve -->
    <path d="${dArea}" fill="url(#trendAreaGrad)" />
    
    <!-- Main Glowing Trend Line -->
    <path d="${dPath}" fill="none" stroke="url(#trendLineGrad)" stroke-width="3" stroke-linecap="round" filter="url(#lineGlow)" />
  `;

  // Draw dots and day labels
  points.forEach(p => {
    svgHTML += `
      <!-- Glow Circle -->
      <circle cx="${p.x}" cy="${p.y}" r="4.5" fill="#fff" stroke="#ec4899" stroke-width="1.5" />
      
      <!-- Amount value tag on top of active points -->
      <text x="${p.x}" y="${p.y - 8}" fill="#a78bfa" font-size="6.5" font-weight="700" text-anchor="middle">
        ${p.val > 0 ? '€' + Math.round(p.val) : ''}
      </text>
      
      <!-- Weekday Labels -->
      <text x="${p.x}" y="${height - 2}" fill="#a1a1aa" font-size="7.5" font-weight="600" text-anchor="middle" style="text-transform: uppercase;">
        ${p.label}
      </text>
    `;
  });

  svgHTML += `</svg>`;
  container.innerHTML = svgHTML;
}

// Render dynamic table details in Analytics screen
function renderAnalyticsCategoryList() {
  const container = document.getElementById('analysis-category-list');
  container.innerHTML = "";

  const categorySpending = getCategorySpending();

  Object.keys(state.budgets).forEach(cat => {
    const limit = state.budgets[cat];
    const spent = categorySpending[cat] || 0;
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const color = CATEGORY_COLORS[cat] || "#94a3b8";

    let barColorClass = "budget-bar-success";
    if (percent > 90) barColorClass = "budget-bar-danger";
    else if (percent > 65) barColorClass = "budget-bar-warning";

    const item = document.createElement('div');
    item.className = "category-detail-item";
    item.innerHTML = `
      <div class="cat-detail-left">
        <div class="trans-icon-bg" style="color: ${color}; border-color: ${color}22; background-color: ${color}0a;">
          ${CATEGORY_ICONS[cat] || "🏷️"}
        </div>
        <div class="cat-detail-text">
          <div class="cat-detail-title-percent">
            <span>${cat}</span>
            <span style="color: ${color}; font-weight: 700;">${percent}%</span>
          </div>
          <div class="budget-progress-track">
            <div class="budget-progress-bar ${barColorClass}" style="width: ${Math.min(percent, 100)}%;"></div>
          </div>
        </div>
      </div>
      <div class="cat-detail-right">
        <div class="cat-detail-spent">${formatCurrency(spent)}</div>
        <div class="cat-detail-budget">Budget: ${formatCurrency(limit)}</div>
      </div>
    `;
    container.appendChild(item);
  });
}

// 6. RENDER THE DETAILED TRANSACTIONS VIEW (LIST TAB)

let activeFilter = "all";
let activeSearchQuery = "";

// Group transactions by date for the history list
function groupTransactionsByDate(list) {
  const groups = {};
  list.forEach(t => {
    if (!groups[t.date]) {
      groups[t.date] = [];
    }
    groups[t.date].push(t);
  });
  return groups;
}

function renderHistoryTransactions() {
  const container = document.getElementById('history-transactions-list');
  container.innerHTML = "";

  // Apply filters and searches
  let filtered = [...state.transactions];

  // A. Search query filter
  if (activeSearchQuery !== "") {
    const q = activeSearchQuery.toLowerCase();
    filtered = filtered.filter(t => 
      t.merchant.toLowerCase().includes(q) || 
      t.category.toLowerCase().includes(q) ||
      t.bank.toLowerCase().includes(q)
    );
  }

  // B. Button pill filters
  if (activeFilter === "expense") {
    filtered = filtered.filter(t => t.type === "expense");
  } else if (activeFilter === "income") {
    filtered = filtered.filter(t => t.type === "income");
  } else if (activeFilter === "bank-paypal") {
    filtered = filtered.filter(t => t.bank === "PayPal");
  } else if (activeFilter === "bank-intesa") {
    filtered = filtered.filter(t => t.bank === "Intesa SP");
  } else if (activeFilter === "bank-revolut") {
    filtered = filtered.filter(t => t.bank === "Revolut");
  } else if (activeFilter === "bank-postepay") {
    filtered = filtered.filter(t => t.bank === "PostePay");
  }

  // Sort descending by date
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">🔍</span>
        <p>Nessun risultato corrisponde alla ricerca.</p>
      </div>
    `;
    return;
  }

  const grouped = groupTransactionsByDate(filtered);
  const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));

  sortedDates.forEach(dateStr => {
    const groupHTML = document.createElement('div');
    groupHTML.className = "history-group";
    
    let itemsHTML = "";
    grouped[dateStr].forEach(t => {
      const icon = CATEGORY_ICONS[t.category] || "🏷️";
      const bgCol = CATEGORY_COLORS[t.category] || "#94a3b8";
      const amountFormatted = (t.type === 'expense' ? '-' : '+') + formatCurrency(t.amount);
      const amountClass = t.type === 'expense' ? 'expense' : 'income';

      itemsHTML += `
        <div class="transaction-item" data-tx-id="${t.id}">
          <div class="trans-left">
            <div class="trans-icon-bg" style="border-color: ${bgCol}33; color: ${bgCol}; background: ${bgCol}0a;">
              ${icon}
            </div>
            <div class="trans-info">
              <span class="trans-merchant">${t.merchant}</span>
              <span class="trans-bank-date">🏦 ${t.bank}</span>
            </div>
          </div>
          <div class="trans-right">
            <span class="trans-amount ${amountClass}">${amountFormatted}</span>
            <span class="trans-category-tag">${t.category}</span>
          </div>
          <button class="trans-delete-btn" aria-label="Elimina spesa">🗑️</button>
        </div>
      `;
    });

    groupHTML.innerHTML = `
      <div class="history-date-header">${formatDateItalian(dateStr)}</div>
      <div class="transaction-list">
        ${itemsHTML}
      </div>
    `;
    container.appendChild(groupHTML);
  });

  // Attach delete click listeners to generated icons
  container.querySelectorAll('.trans-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const txId = e.target.closest('.transaction-item').dataset.txId;
      deleteTransaction(txId);
    });
  });
}

function deleteTransaction(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  saveState();
  refreshAllUI();
}

// 7. OPEN BANKING CONNECTIONS & SETTINGS UI RENDERING

function renderOpenBankingToggles() {
  const container = document.getElementById('bank-connection-list');
  container.innerHTML = "";

  const banks = Object.keys(state.banksConnected);
  
  banks.forEach(bank => {
    const isConnected = state.banksConnected[bank];
    const statusText = isConnected ? "Sincronizzato in tempo reale" : "Non connesso";
    const statusClass = isConnected ? "active" : "";
    const logoSymbol = bank === "PayPal" ? "🔵" : bank === "Intesa SP" ? "🟢" : bank === "Revolut" ? "🟣" : bank === "PostePay" ? "🟡" : bank === "AMEX" ? "🔵" : "teal";

    const item = document.createElement('div');
    item.className = "bank-conn-item";
    item.innerHTML = `
      <div class="bank-details">
        <div class="bank-logo-placeholder">${logoSymbol}</div>
        <div class="bank-name-sync">
          <span class="bank-name">${bank}</span>
          <span class="bank-status ${statusClass}">${statusText}</span>
        </div>
      </div>
      <label class="switch">
        <input type="checkbox" id="toggle-bank-${bank}" ${isConnected ? 'checked' : ''}>
        <span class="slider"></span>
      </label>
    `;
    container.appendChild(item);

    // Bind event
    item.querySelector('input').addEventListener('change', (e) => {
      state.banksConnected[bank] = e.target.checked;
      saveState();
      renderOpenBankingToggles();
    });
  });
}

// Generate the budget limits settings inputs
function renderBudgetSettingsInputs() {
  const container = document.getElementById('settings-budget-inputs');
  container.innerHTML = "";

  Object.keys(state.budgets).forEach(cat => {
    const limit = state.budgets[cat];
    const color = CATEGORY_COLORS[cat] || "#8b5cf6";

    const row = document.createElement('div');
    row.className = "budget-edit-row";
    row.innerHTML = `
      <span class="budget-edit-label">${CATEGORY_ICONS[cat]} ${cat}</span>
      <div class="budget-edit-input-group">
        <span>€</span>
        <input type="number" id="budget-edit-val-${cat}" value="${limit}" min="0" step="5">
      </div>
    `;
    container.appendChild(row);

    // Bind real-time inputs
    row.querySelector('input').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (!isNaN(v) && v >= 0) {
        state.budgets[cat] = v;
        saveState();
        // Refresh dashboard budgets and analytics in background
        updateFinancialStats();
        renderDashboardBudgets();
        renderDoughnutChart();
        renderAnalyticsCategoryList();
      }
    });
  });
}

// Global UI Redraw
function refreshAllUI() {
  updateFinancialStats();
  renderDashboardTransactions();
  renderDashboardBudgets();
  renderDoughnutChart();
  renderTrendLineChart();
  renderAnalyticsCategoryList();
  renderHistoryTransactions();
}

// 8. INTERACTIVE PUSH NOTIFICATION SIMULATOR

let activePushTransaction = null;
let bannerTimeout = null;

function triggerMockPushNotification(bankName, smsText) {
  // 1. Run parser to see what PayPulse would extract
  const parsed = parseNotificationText(smsText);
  if (!parsed) {
    alert("Impossibile simulare la notifica: l'algoritmo non è riuscito a rilevare un importo valido in euro (€ o EUR). Verifica il formato.");
    return;
  }
  
  // Custom inject bank if matched manually
  parsed.bank = bankName;
  activePushTransaction = parsed;

  // 2. Setup banner content
  const appIcon = bankName === "PayPal" ? "🔵" : bankName === "Intesa SP" ? "🟢" : bankName === "Revolut" ? "🟣" : bankName === "PostePay" ? "🟡" : bankName === "AMEX" ? "🔵" : "💳";
  
  document.getElementById('push-banner-app-icon').textContent = appIcon;
  document.getElementById('push-banner-app-name').textContent = bankName;
  document.getElementById('push-banner-title').textContent = parsed.type === 'income' ? 'Notifica Accredito' : 'Notifica di Spesa';
  document.getElementById('push-banner-text').textContent = smsText;

  // 3. Show banner with animation
  const banner = document.getElementById('push-notification-banner');
  banner.classList.remove('hidden', 'exit');

  // Trigger tactile vibration mock (if supported by device)
  if (navigator.vibrate) {
    navigator.vibrate([100, 30, 100]);
  }

  // 4. Reset auto-dismiss timer
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => {
    dismissPushBanner();
  }, 6500);
}

function dismissPushBanner() {
  const banner = document.getElementById('push-notification-banner');
  banner.classList.add('exit');
  setTimeout(() => {
    banner.classList.add('hidden');
    banner.classList.remove('exit');
    activePushTransaction = null;
  }, 350);
}

// Tap banner event
document.getElementById('push-notification-banner').addEventListener('click', () => {
  if (activePushTransaction) {
    // Insert notification transaction into our local state
    state.transactions.push(activePushTransaction);
    saveState();
    
    // Dimiss banner and refresh page UI
    dismissPushBanner();
    refreshAllUI();

    // Trigger visual success pop on the active screen
    const feedback = document.getElementById('parse-success-feedback');
    document.getElementById('parse-feedback-message').textContent = `Notifica acquisita! €${activePushTransaction.amount.toFixed(2)} aggiunti a ${activePushTransaction.category}`;
    feedback.classList.remove('hidden', 'error');
    
    setTimeout(() => {
      feedback.classList.add('hidden');
    }, 4500);

    // Switch view to dashboard home
    switchTab('screen-dashboard');
  }
});

// 9. SPA PAGES NAVIGATION SYSTEM

function switchTab(targetId) {
  // Deactivate all screens
  document.querySelectorAll('.app-screen').forEach(scr => {
    scr.classList.remove('active');
  });

  // Deactivate all nav buttons
  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.classList.remove('active');
  });

  // Activate targets
  const targetScreen = document.getElementById(targetId);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  const targetBtn = document.querySelector(`.bottom-nav .nav-item[data-target="${targetId}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
  }

  // Perform screen specific triggers
  if (targetId === 'screen-analisi') {
    // Redraw vector SVG charts to ensure layout recalculations fit containers perfectly
    renderDoughnutChart();
    renderTrendLineChart();
  }
}

// 10. GLOBAL BINDING & EVENTS INITIALIZATION

document.addEventListener('DOMContentLoaded', () => {
  // A. Load cached states
  initStorage();
  refreshAllUI();
  renderOpenBankingToggles();
  renderBudgetSettingsInputs();

  // B. Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registered successfully!', reg.scope))
        .catch(err => console.error('Service Worker registration failed:', err));
    });
  }

  // C. Tab Switching bindings
  document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const target = e.currentTarget.dataset.target;
      switchTab(target);
    });
  });

  // Bind quick navigation text triggers inside widgets
  document.querySelectorAll('.navigate-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      switchTab(e.target.dataset.target);
    });
  });

  // D. Smart Clipboard Paste Parser Handlers
  const pasteBtn = document.getElementById('smart-parse-btn');
  const pasteInput = document.getElementById('smart-paste-input');
  const parseFeedback = document.getElementById('parse-success-feedback');

  pasteBtn.addEventListener('click', () => {
    const txt = pasteInput.value;
    const parsed = parseNotificationText(txt);
    
    if (parsed) {
      state.transactions.push(parsed);
      saveState();
      refreshAllUI();

      // Show gorgeous green success prompt
      document.getElementById('parse-feedback-message').textContent = `Spesa estratta! €${parsed.amount.toFixed(2)} categorizzata come ${parsed.category}`;
      parseFeedback.classList.remove('hidden', 'error');
      
      // Clean text area
      pasteInput.value = "";

      setTimeout(() => {
        parseFeedback.classList.add('hidden');
      }, 4500);
    } else {
      // Show red error message if regex failed
      document.getElementById('parse-feedback-message').textContent = "Impossibile estrarre importo ed esercente dal testo incollato. Controlla e riprova.";
      parseFeedback.classList.add('error');
      parseFeedback.classList.remove('hidden');

      setTimeout(() => {
        parseFeedback.classList.add('hidden');
        parseFeedback.classList.remove('error');
      }, 4500);
    }
  });

  // E. Float Manual Add Modal Handlers
  const fab = document.getElementById('fab-add-expense');
  const modal = document.getElementById('manual-expense-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const manualForm = document.getElementById('manual-expense-form');

  fab.addEventListener('click', () => {
    // Pre-fill date input with current ISO local date
    document.getElementById('modal-input-date').value = new Date().toISOString().split('T')[0];
    modal.classList.remove('hidden');
  });

  closeModalBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    manualForm.reset();
  });

  // Close modal clicking outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.add('hidden');
      manualForm.reset();
    }
  });

  // Manual save submit
  manualForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const amt = parseFloat(document.getElementById('modal-input-amount').value);
    const type = document.getElementById('modal-input-type').value;
    const bank = document.getElementById('modal-input-bank').value;
    const merchant = document.getElementById('modal-input-merchant').value.trim();
    const category = document.getElementById('modal-input-category').value;
    const date = document.getElementById('modal-input-date').value;

    const newTx = {
      id: "tx-" + Date.now(),
      type,
      amount: amt,
      merchant,
      category,
      bank,
      date
    };

    state.transactions.push(newTx);
    saveState();
    refreshAllUI();

    // Close and reset
    modal.classList.add('hidden');
    manualForm.reset();

    // Visual toast feedback on dashboard
    document.getElementById('parse-feedback-message').textContent = "Transazione manuale salvata con successo!";
    parseFeedback.classList.remove('hidden', 'error');
    setTimeout(() => {
      parseFeedback.classList.add('hidden');
    }, 3000);
  });

  // F. SEARCH & FILTER TRIGGERS ON HISTORY SCREEN
  const searchInput = document.getElementById('transaction-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');

  searchInput.addEventListener('input', (e) => {
    activeSearchQuery = e.target.value;
    if (activeSearchQuery !== "") {
      clearSearchBtn.classList.remove('hidden');
    } else {
      clearSearchBtn.classList.add('hidden');
    }
    renderHistoryTransactions();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = "";
    activeSearchQuery = "";
    clearSearchBtn.classList.add('hidden');
    renderHistoryTransactions();
  });

  // Filters pills selection row
  document.querySelectorAll('#transaction-filter-pills .btn-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('#transaction-filter-pills .btn-pill').forEach(p => p.classList.remove('active'));
      e.currentTarget.classList.add('active');
      activeFilter = e.currentTarget.dataset.filter;
      renderHistoryTransactions();
    });
  });

  // G. PRESET BANNER SIMULATION TRIGGERS
  document.querySelectorAll('.btn-sim').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.simType;
      let bank = "Banca";
      let text = "";

      switch (type) {
        case 'paypal':
          bank = "PayPal";
          text = "PayPal: hai inviato 14,99 EUR a Spotify Technology S.A. addebito su saldo.";
          break;
        case 'intesa':
          bank = "Intesa SP";
          text = "Intesa Sanpaolo: Operazione Carta. Addebito di EUR 48,50 presso Esselunga Roma effettuata con successo.";
          break;
        case 'revolut':
          bank = "Revolut";
          text = "Hai speso 8,20 EUR con la tua carta presso Uber Trip addebito istantaneo.";
          break;
        case 'amex':
          bank = "AMEX";
          text = "Avviso Carta: spesa di EUR 95.00 registrata presso ENI Station Roma Sud con carta terminante con X-1008.";
          break;
        case 'postepay':
          bank = "PostePay";
          text = "PostePay: operazione di prelievo/addebito di EUR 39,99 a favore di Zara Roma Termini effettuata alle 10:14.";
          break;
        case 'n26':
          bank = "N26";
          text = "N26: Transazione di 12,00 EUR autorizzata con successo a favore di Deliveroo Italia.";
          break;
      }

      triggerMockPushNotification(bank, text);
    });
  });

  // Custom simulation trigger
  document.getElementById('custom-sim-trigger-btn').addEventListener('click', () => {
    const bank = document.getElementById('custom-sim-bank').value;
    const text = document.getElementById('custom-sim-text').value;

    if (!text || text.trim() === "") {
      alert("Inserisci il testo della notifica personalizzata da simulare.");
      return;
    }

    triggerMockPushNotification(bank, text);
    // Clear simulator textarea
    document.getElementById('custom-sim-text').value = "";
  });

  // H. SETTINGS MANAGEMENT TRIGGERS (Reset / Clear data)
  document.getElementById('reset-mock-data-btn').addEventListener('click', () => {
    if (confirm("Sei sicuro di voler ripristinare i dati iniziali di esempio? Le tue transazioni correnti verranno sovrascritte.")) {
      resetToDefaultState();
      refreshAllUI();
      renderOpenBankingToggles();
      renderBudgetSettingsInputs();
      alert("Dati di esempio ripristinati correttamente.");
    }
  });

  document.getElementById('clear-all-data-btn').addEventListener('click', () => {
    if (confirm("ATTENZIONE: Questa azione cancellerà definitivamente tutte le tue transazioni e impostazioni salvate. Vuoi procedere?")) {
      state.transactions = [];
      state.budgets = { "Spesa":0,"Intrattenimento":0,"Trasporti":0,"Shopping":0,"Ristorazione":0,"Utenze":0,"Altro":0 };
      saveState();
      refreshAllUI();
      renderBudgetSettingsInputs();
      alert("Tutti i dati locali sono stati eliminati.");
    }
  });

  // I. NATIVE ANDROID BRIDGE INITIALIZATION
  if (window.AndroidBridge) {
    console.log("PayPulse running in native Android container!");
    
    const syncBanner = document.getElementById('android-sync-banner');
    const smartPasteCard = document.querySelector('.smart-paste-card');
    
    // Swap manual paste with automatic status card
    if (syncBanner) syncBanner.classList.remove('hidden');
    if (smartPasteCard) smartPasteCard.classList.add('hidden');
    
    // Define update handler for permission status
    window.updateAndroidBridgeStatus = function() {
      const actionArea = document.getElementById('android-sync-action-area');
      const subtitle = document.getElementById('android-sync-subtitle');
      if (!actionArea) return;
      
      const isEnabled = window.AndroidBridge.isNotificationServiceEnabled();
      if (isEnabled) {
        subtitle.textContent = "Cattura notifiche attiva in tempo reale ⚡";
        actionArea.innerHTML = `
          <div style="display:flex; align-items:center; gap:8px; color:#34d399; font-size:0.85rem; font-weight:700; background:rgba(16,185,129,0.06); border:1px solid rgba(16,185,129,0.15); padding:10px; border-radius:8px;">
            <span>✅</span> Sincronizzazione automatica attiva in background. Le spese compariranno istantaneamente!
          </div>
        `;
      } else {
        subtitle.textContent = "Configurazione necessaria.";
        actionArea.innerHTML = `
          <p style="font-size:0.8rem; color:#fb7185; margin-bottom:8px; font-weight:600; line-height:1.4;">L'applicazione richiede l'accesso alle notifiche per leggere gli avvisi delle banche.</p>
          <button id="android-enable-btn" class="btn btn-primary btn-glow">Consenti Accesso Notifiche</button>
        `;
        
        document.getElementById('android-enable-btn').addEventListener('click', () => {
          window.AndroidBridge.openNotificationAccessSettings();
        });
      }
    };
    
    // Run once at boot
    window.updateAndroidBridgeStatus();
    
    // Import any transactions cached in native background while app was closed
    try {
      const pendingStr = window.AndroidBridge.getPendingTransactions();
      const pending = JSON.parse(pendingStr);
      if (Array.isArray(pending) && pending.length > 0) {
        console.log(`Importing ${pending.length} cached background transactions...`);
        pending.forEach(tx => {
          if (!state.transactions.some(t => t.id === tx.id)) {
            state.transactions.push(tx);
          }
        });
        saveState();
        refreshAllUI();
        
        // Clear native cache
        window.AndroidBridge.clearPendingTransactions();
        
        // Visual toast
        document.getElementById('parse-feedback-message').textContent = `Importate ${pending.length} spese in background!`;
        const parseFeedback = document.getElementById('parse-success-feedback');
        parseFeedback.classList.remove('hidden', 'error');
        setTimeout(() => {
          parseFeedback.classList.add('hidden');
        }, 4500);
      }
    } catch(e) {
      console.error("Error reading pending background transactions:", e);
    }
    
    // Keep state updated when returning to app (checking permissions)
    window.addEventListener('focus', () => {
      window.updateAndroidBridgeStatus();
    });
  }
});

// Global Callback exposed on window so native code can inject transactions in real time
window.handleNativeNotification = function(jsonStr) {
  try {
    console.log("handleNativeNotification triggered: " + jsonStr);
    const tx = JSON.parse(jsonStr);
    
    // Avoid duplicate ID injection
    if (!state.transactions.some(t => t.id === tx.id)) {
      state.transactions.push(tx);
      saveState();
      refreshAllUI();
      
      // Spring iOS/Android styled banner visual confirmation
      const feedback = document.getElementById('parse-success-feedback');
      if (feedback) {
        document.getElementById('parse-feedback-message').textContent = `Notifica acquisita! €${tx.amount.toFixed(2)} addebitati da ${tx.merchant}`;
        feedback.classList.remove('hidden', 'error');
        setTimeout(() => {
          feedback.classList.add('hidden');
        }, 5000);
      }
    }
  } catch(e) {
    console.error("Error handling native notification: ", e);
  }
};

