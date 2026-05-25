/* =========================================================
   Family Budget Planner — Application Logic
   (FreshBooks-restyled build)
   ========================================================= */

// ── Constants ────────────────────────────────────────────
const MONTHS = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
];

const CURRENCY_MAP = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥',
    THB: '฿', CAD: '$', AUD: '$', INR: '₹', BRL: 'R$'
};

const CHART_COLORS = [
    '#0075DD','#00A86B','#F97316','#E53E3E',
    '#8B5CF6','#06B6D4','#F59E0B','#EC4899','#64748B','#10B981'
];

// ── State ─────────────────────────────────────────────────
let settings = JSON.parse(localStorage.getItem('budgetSettings')) || {
    familyName: '',
    year: new Date().getFullYear(),
    currency: 'USD'
};

let allTransactions = JSON.parse(localStorage.getItem(`familyBudget_v${settings.year}`)) || {};
let templates       = JSON.parse(localStorage.getItem('budgetTemplates'))   || [];
let categories      = JSON.parse(localStorage.getItem('budgetCategories'))  || [
    'Housing','Food','Transport','Utilities',
    'Entertainment','Healthcare','Salary','Other'
];

let currentMonthIdx  = new Date().getMonth();
let currentMode      = 'monthly';
let selectedType     = 'expense';
let selectedCategory = categories[0] || 'Other';

let pieChart, barChart, yearlyChart, yearlyDistributionPieChart;

// ── Utilities ─────────────────────────────────────────────
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatCurrency(amount, includeSign = false) {
    const sym = CURRENCY_MAP[settings.currency];
    const abs = Math.abs(amount);
    // Show decimals only when there are actual cents
    const hasCents = (abs % 1) !== 0;
    const decimals = hasCents ? 2 : 0;
    const absValue = abs.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
    if (!includeSign) return `${sym}\u202F${absValue}`;
    const sign = amount < 0 ? '−' : (amount > 0 ? '+' : '');
    return `${sign}${sym}\u202F${absValue}`;
}

// Stat card amounts — never show decimals regardless of cents
function formatStat(amount) {
    const sym = CURRENCY_MAP[settings.currency];
    const absValue = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 0, maximumFractionDigits: 0
    });
    return `${sym}\u202F${absValue}`;
}

function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function parseCSVRow(row) {
    const cols = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
            if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
            cols.push(current.trim()); current = '';
        } else { current += ch; }
    }
    cols.push(current.trim());
    return cols;
}

// ── View switching ─────────────────────────────────────────
function showView(name) {
    document.getElementById('yearlyView').style.display            = name === 'yearly'       ? '' : 'none';
    document.getElementById('yearlyDistributionView').style.display = name === 'distribution' ? '' : 'none';
    document.getElementById('monthlyView').style.display           = name === 'monthly'      ? '' : 'none';
}

// ── Initialisation ────────────────────────────────────────
function init() {
    applySettingsUI();
    renderTabs();
    renderCategoryPills();
    updateTemplatesUI();
    initCharts();
    switchMonth(currentMonthIdx);
    document.getElementById('budgetForm').addEventListener('submit', handleFormSubmit);
}

// ── Settings ──────────────────────────────────────────────
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    const isOpen = modal.style.display !== 'none';
    if (isOpen) {
        modal.style.display = 'none';
    } else {
        document.getElementById('settingFamilyName').value = settings.familyName || '';
        document.getElementById('settingYear').value       = settings.year;
        document.getElementById('settingCurrency').value   = settings.currency;
        modal.style.display = 'flex';
    }
}

function saveSettings() {
    const oldYear = settings.year;
    settings.familyName = document.getElementById('settingFamilyName').value.trim();
    settings.year       = parseInt(document.getElementById('settingYear').value) || new Date().getFullYear();
    settings.currency   = document.getElementById('settingCurrency').value;
    localStorage.setItem('budgetSettings', JSON.stringify(settings));

    if (oldYear !== settings.year) {
        allTransactions = JSON.parse(localStorage.getItem(`familyBudget_v${settings.year}`)) || {};
    }
    applySettingsUI();
    toggleSettings();
    updateUI();
    updateCharts();
    if (currentMode === 'yearly')       updateYearlyUI();
    if (currentMode === 'distribution') updateYearlyDistributionUI();
}

function applySettingsUI() {
    const sym = CURRENCY_MAP[settings.currency];
    const name = settings.familyName;

    // Nav
    const navIcon = document.getElementById('navCurrencyIcon');
    if (navIcon) navIcon.textContent = sym;

    const nameEl = document.getElementById('displayFamilyName');
    if (nameEl) nameEl.textContent = name ? `— ${name}` : '';

    // Currency symbols in form
    document.querySelectorAll('.curr-sym').forEach(el => el.textContent = sym);

    // Year labels
    document.querySelectorAll('.year-label').forEach(el => el.textContent = settings.year);

    // Table title
    const titleEl = document.getElementById('tableTitle');
    if (titleEl) titleEl.textContent = `${MONTHS[currentMonthIdx]} ${settings.year} Transactions`;
}

// ── Tabs ──────────────────────────────────────────────────
function renderTabs() {
    const container = document.getElementById('monthTabs');
    container.innerHTML = '';

    MONTHS.forEach((m, idx) => {
        const btn = document.createElement('button');
        btn.className = `fb-tab${currentMonthIdx === idx && currentMode === 'monthly' ? ' active' : ''}`;
        btn.textContent = m;
        btn.onclick     = () => switchMonth(idx);
        container.appendChild(btn);
    });

    const spacer = document.createElement('div');
    spacer.className = 'fb-tab-spacer';
    container.appendChild(spacer);

    const yearBtn = document.createElement('button');
    yearBtn.className = `fb-tab${currentMode === 'yearly' ? ' active' : ''}`;
    yearBtn.textContent = 'Yearly';
    yearBtn.onclick     = showYearlyOverview;
    container.appendChild(yearBtn);

    const distBtn = document.createElement('button');
    distBtn.className = `fb-tab${currentMode === 'distribution' ? ' active' : ''}`;
    distBtn.textContent = 'Distribution';
    distBtn.onclick     = showYearlyDistribution;
    container.appendChild(distBtn);
}

function switchMonth(idx) {
    currentMonthIdx = idx;
    currentMode = 'monthly';
    showView('monthly');
    applySettingsUI();
    renderTabs();
    updateUI();
    updateCharts();
}

function showYearlyOverview() {
    currentMode = 'yearly';
    showView('yearly');
    renderTabs();
    updateYearlyUI();
}

function showYearlyDistribution() {
    currentMode = 'distribution';
    showView('distribution');
    renderTabs();
    updateYearlyDistributionUI();
}

// ── Data access ───────────────────────────────────────────
function getMonthData() {
    return allTransactions[`${settings.year}_${currentMonthIdx}`] || [];
}

function setMonthData(data) {
    allTransactions[`${settings.year}_${currentMonthIdx}`] = data;
    localStorage.setItem(`familyBudget_v${settings.year}`, JSON.stringify(allTransactions));
}

// ── Transaction form ──────────────────────────────────────
function handleFormSubmit(e) {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('amount').value);
    if (isNaN(amount) || amount <= 0) return;

    const data = getMonthData();
    data.push({
        id:       Date.now() + Math.random(),
        desc:     document.getElementById('desc').value,
        amount,
        type:     selectedType,
        category: selectedCategory,
        date:     new Date().toISOString()
    });
    setMonthData(data);
    e.target.reset();
    setFormType('expense');
    selectedCategory = categories[0] || 'Other';
    renderCategoryPills();
    updateUI();
    updateCharts();
}

function deleteTransaction(id) {
    const data = getMonthData().filter(t => t.id !== id);
    setMonthData(data);
    updateUI();
    updateCharts();
}

// ── Monthly UI render ─────────────────────────────────────
function updateUI() {
    const data = getMonthData();
    const list = document.getElementById('transactionList');
    list.innerHTML = '';

    const emptyEl = document.getElementById('emptyState');
    emptyEl.style.display = data.length === 0 ? '' : 'none';

    const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedData.forEach(t => {
        const isExp = t.type === 'expense';
        const row   = document.createElement('tr');
        row.innerHTML = `
            <td style="color:var(--fb-slate); font-size:.78rem;">${formatDate(t.date)}</td>
            <td style="font-weight:500;">${escapeHtml(t.desc)}</td>
            <td><span class="cat-badge">${escapeHtml(t.category)}</span></td>
            <td style="text-align:right;" class="${isExp ? 'amount-negative' : 'amount-positive'}">
                ${isExp ? '−' : '+'}${formatCurrency(t.amount)}
            </td>
            <td class="no-print" style="text-align:right;">
                <button class="delete-btn" onclick="deleteTransaction(${JSON.stringify(t.id)})" title="Delete">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                </button>
            </td>`;
        list.appendChild(row);
    });

    let inc = 0, exp = 0;
    data.forEach(t => { if (t.type === 'expense') exp += t.amount; else inc += t.amount; });
    const net = inc - exp;

    const balEl = document.getElementById('totalBalance');
    balEl.textContent = formatStat(Math.abs(net));
    balEl.className = `stat-value-sm ${net >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('totalIncome').textContent  = formatStat(inc);
    document.getElementById('totalExpense').textContent = formatStat(exp);
    document.getElementById('transCount').textContent   = `${data.length} entries`;
    applySettingsUI();
}

// ── Yearly Overview render ────────────────────────────────
function updateYearlyUI() {
    let yInc = 0, yExp = 0;
    const monthlyStats = MONTHS.map((_, idx) => {
        const data = allTransactions[`${settings.year}_${idx}`] || [];
        let inc = 0, exp = 0;
        data.forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
        yInc += inc; yExp += exp;
        return { inc, exp, net: inc - exp };
    });

    const net = yInc - yExp;
    const netEl = document.getElementById('yearlyNet');
    netEl.textContent = formatStat(Math.abs(net));
    netEl.className = `stat-value ${net >= 0 ? 'positive' : 'negative'}`;
    document.getElementById('yearlyIncome').textContent  = formatStat(yInc);
    document.getElementById('yearlyExpense').textContent = formatStat(yExp);

    const tbody = document.getElementById('yearlyTableBody');
    tbody.innerHTML = '';
    monthlyStats.forEach((s, i) => {
        const row = document.createElement('tr');
        const netCls = s.net >= 0 ? 'amount-positive' : 'amount-negative';
        row.innerHTML = `
            <td style="font-weight:500;">${MONTHS[i]}</td>
            <td class="amount-positive">${formatCurrency(s.inc)}</td>
            <td class="amount-negative">${formatCurrency(s.exp)}</td>
            <td style="text-align:right;" class="${netCls}">${formatCurrency(Math.abs(s.net))} ${s.net >= 0 ? '▲' : '▼'}</td>`;
        tbody.appendChild(row);
    });
    updateYearlyChart(monthlyStats);
}

// ── Yearly Distribution render ────────────────────────────
function updateYearlyDistributionUI() {
    const categoryExpenses = {};
    let total = 0;

    MONTHS.forEach((_, idx) => {
        const data = allTransactions[`${settings.year}_${idx}`] || [];
        data.forEach(t => {
            if (t.type === 'expense') {
                categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + t.amount;
                total += t.amount;
            }
        });
    });

    const sorted = Object.entries(categoryExpenses).sort((a, b) => b[1] - a[1]);
    const tbody  = document.getElementById('yearlyDistributionTableBody');
    tbody.innerHTML = '';

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:32px; color:var(--fb-slate-light);">No expenses yet</td></tr>';
    } else {
        sorted.forEach(([cat, amount]) => {
            const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : 0;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="cat-badge">${escapeHtml(cat)}</span></td>
                <td style="text-align:right; font-weight:600;">${formatCurrency(amount)}</td>
                <td style="text-align:right; color:var(--fb-slate);">${pct}%</td>`;
            tbody.appendChild(row);
        });
    }

    yearlyDistributionPieChart.data.labels           = sorted.map(c => c[0]);
    yearlyDistributionPieChart.data.datasets[0].data = sorted.map(c => c[1]);
    yearlyDistributionPieChart.update();
}

// ── Form helpers ──────────────────────────────────────────
function setFormType(type) {
    selectedType = type;
    const expBtn = document.getElementById('typeExp');
    const incBtn = document.getElementById('typeInc');
    expBtn.className = `type-btn${type === 'expense' ? ' active-expense' : ''}`;
    incBtn.className = `type-btn${type === 'income' ? ' active-income' : ''}`;
}

function renderCategoryPills() {
    const c = document.getElementById('categorySelector');
    c.innerHTML = '';
    if (!selectedCategory || !categories.includes(selectedCategory)) {
        selectedCategory = categories[0] || 'Other';
    }
    categories.forEach(cat => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('data-category', cat);
        b.className = `cat-pill${selectedCategory === cat ? ' pill-selected' : ''}`;
        b.textContent = cat;
        b.onclick = () => {
            selectedCategory = cat;
            document.querySelectorAll('.cat-pill').forEach(p => {
                p.classList.toggle('pill-selected', p.getAttribute('data-category') === cat);
            });
        };
        c.appendChild(b);
    });
}

function promptAddCategory() {
    const n = prompt("New category name:");
    if (n && n.trim() && !categories.includes(n.trim())) {
        categories.push(n.trim());
        localStorage.setItem('budgetCategories', JSON.stringify(categories));
        selectedCategory = n.trim();
        renderCategoryPills();
    }
}

// ── Templates ─────────────────────────────────────────────
function saveAsTemplate() {
    const desc   = document.getElementById('desc').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    if (!desc || isNaN(amount) || amount <= 0) return;
    templates.push({ desc, amount, type: selectedType, category: selectedCategory, id: Date.now() });
    localStorage.setItem('budgetTemplates', JSON.stringify(templates));
    updateTemplatesUI();
}

function deleteTemplate(id, event) {
    event.stopPropagation();
    templates = templates.filter(t => t.id !== id);
    localStorage.setItem('budgetTemplates', JSON.stringify(templates));
    updateTemplatesUI();
}

function updateTemplatesUI() {
    const c = document.getElementById('templatesContainer');
    c.innerHTML = '';
    if (templates.length === 0) {
        c.innerHTML = `<div style="text-align:center; padding:14px 0; font-size:.75rem; color:var(--fb-slate-light);">
            No quick-adds saved yet.<br>Save a transaction to create one.
        </div>`;
        return;
    }
    templates.forEach(t => {
        const isExp   = t.type === 'expense';
        const wrapper = document.createElement('div');
        wrapper.className = 'template-item';
        wrapper.innerHTML = `
            <button class="template-btn">
                <div>
                    <div style="font-size:.82rem; font-weight:600; color:var(--fb-lead);">${escapeHtml(t.desc)}</div>
                    <div style="font-size:.68rem; color:var(--fb-slate-light); text-transform:uppercase; letter-spacing:.04em; margin-top:1px;">${escapeHtml(t.category)}</div>
                </div>
                <span style="font-size:.82rem; font-weight:700; color:${isExp ? 'var(--fb-red)' : 'var(--fb-green)'};">
                    ${isExp ? '−' : '+'}${formatCurrency(t.amount)}
                </span>
            </button>
            <button class="template-delete" onclick="deleteTemplate(${t.id}, event)">✕</button>`;
        wrapper.querySelector('.template-btn').onclick = () => {
            const data = getMonthData();
            data.push({ ...t, id: Date.now() + Math.random(), date: new Date().toISOString() });
            setMonthData(data);
            updateUI();
            updateCharts();
        };
        c.appendChild(wrapper);
    });
}

// ── Charts ────────────────────────────────────────────────
function initCharts() {
    const opts = { responsive: true, maintainAspectRatio: false };

    Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
    Chart.defaults.color       = '#6B7280';

    pieChart = new Chart(document.getElementById('pieChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }] },
        options: { ...opts, cutout: '65%', plugins: { legend: { display: false } } }
    });

    barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: ['Income', 'Expenses'],
            datasets: [{ data: [0, 0], backgroundColor: ['#00A86B', '#E53E3E'], borderRadius: 6, borderSkipped: false }]
        },
        options: { ...opts, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#F0F2F5' } }, x: { grid: { display: false } } } }
    });

    yearlyChart = new Chart(document.getElementById('yearlyChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: MONTHS,
            datasets: [
                { label: 'Income',   data: [], borderColor: '#00A86B', backgroundColor: 'rgba(0,168,107,.08)', tension: 0.4, fill: true, pointBackgroundColor: '#00A86B', pointRadius: 4 },
                { label: 'Expenses', data: [], borderColor: '#E53E3E', backgroundColor: 'rgba(229,62,62,.06)',  tension: 0.4, fill: true, pointBackgroundColor: '#E53E3E', pointRadius: 4 }
            ]
        },
        options: { ...opts, scales: { y: { grid: { color: '#F0F2F5' } }, x: { grid: { display: false } } } }
    });

    yearlyDistributionPieChart = new Chart(document.getElementById('yearlyDistributionPieChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: CHART_COLORS, borderWidth: 2, borderColor: '#fff' }] },
        options: { ...opts, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } } } }
    });
}

function updateCharts() {
    const data = getMonthData();
    const cats = {}; let inc = 0, exp = 0;
    data.forEach(t => {
        if (t.type === 'expense') { cats[t.category] = (cats[t.category] || 0) + t.amount; exp += t.amount; }
        else { inc += t.amount; }
    });
    pieChart.data.labels           = Object.keys(cats);
    pieChart.data.datasets[0].data = Object.values(cats);
    pieChart.update();
    barChart.data.datasets[0].data = [inc, exp];
    barChart.update();
}

function updateYearlyChart(stats) {
    yearlyChart.data.datasets[0].data = stats.map(s => s.inc);
    yearlyChart.data.datasets[1].data = stats.map(s => s.exp);
    yearlyChart.update();
}

// ── CSV Import / Export ───────────────────────────────────
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const rows = e.target.result.split(/\r?\n/);
        let newTransactions = { ...allTransactions };
        for (let i = 1; i < rows.length; i++) {
            if (!rows[i].trim()) continue;
            const cols = parseCSVRow(rows[i]);
            if (cols.length < 7) continue;
            const [year, monthStr, date, desc, category, type, amount] = cols;
            const monthIdx = MONTHS.indexOf(monthStr);
            if (monthIdx === -1) continue;
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount)) continue;
            const key = `${year}_${monthIdx}`;
            if (!newTransactions[key]) newTransactions[key] = [];
            newTransactions[key].push({
                id:       Date.now() + Math.random(),
                desc:     desc || 'Imported',
                amount:   Math.abs(parsedAmount),
                type:     type === 'income' ? 'income' : 'expense',
                category: category || 'Other',
                date:     date || new Date().toISOString()
            });
        }
        allTransactions = newTransactions;
        localStorage.setItem(`familyBudget_v${settings.year}`, JSON.stringify(allTransactions));
        updateUI(); updateCharts();
        if (currentMode === 'yearly')       updateYearlyUI();
        if (currentMode === 'distribution') updateYearlyDistributionUI();
        event.target.value = '';
    };
    reader.readAsText(file);
}

function exportToCSV() {
    let csv = "Year,Month,Date,Description,Category,Type,Amount,Currency\n";
    const yearKeys = Object.keys(allTransactions).filter(k => k.startsWith(`${settings.year}_`));
    yearKeys.forEach(key => {
        const [y, m] = key.split('_');
        allTransactions[key].forEach(t => {
            const safeDesc = `"${(t.desc || '').replace(/"/g, '""')}"`;
            const safeCat  = `"${(t.category || '').replace(/"/g, '""')}"`;
            csv += `${y},${MONTHS[m]},${t.date},${safeDesc},${safeCat},${t.type},${t.amount},${settings.currency}\n`;
        });
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url  = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Budget_${settings.familyName || 'Planner'}_${settings.year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
