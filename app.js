/* =========================================================
   Family Budget Planner Pro — Application Logic
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
    '#6366f1','#f43f5e','#10b981','#f59e0b',
    '#3b82f6','#06b6d4','#8b5cf6','#ec4899','#f97316','#64748b'
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

let currentMonthIdx = new Date().getMonth();
let currentMode     = 'monthly';
let selectedType    = 'expense';
let selectedCategory = categories[0] || 'Other';

// Chart instances
let pieChart, barChart, yearlyChart, yearlyDistributionPieChart;

// ── Utilities ─────────────────────────────────────────────

/** XSS-safe escaping for all user-supplied text injected into innerHTML */
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
    const absValue = Math.abs(amount).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    if (!includeSign) return `${sym} ${absValue}`;
    const sign = amount < 0 ? '-' : (amount > 0 ? '+' : '');
    return `${sign}${sym} ${absValue}`;
}

function formatDate(isoString) {
    if (!isoString) return '---';
    return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Proper CSV row parser — handles quoted fields containing commas */
function parseCSVRow(row) {
    const cols = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === '"') {
            if (inQuotes && row[i + 1] === '"') { current += '"'; i++; }
            else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) {
            cols.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cols.push(current.trim());
    return cols;
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
    const isHidden = modal.classList.contains('hidden');
    modal.classList.toggle('hidden', !isHidden);
    modal.classList.toggle('flex', isHidden);
    if (isHidden) {
        document.getElementById('settingFamilyName').value = settings.familyName || '';
        document.getElementById('settingYear').value       = settings.year;
        document.getElementById('settingCurrency').value   = settings.currency;
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
    document.getElementById('displayFamilyName').innerText = settings.familyName ? `(${settings.familyName})` : '';
    document.getElementById('currencyIcon').innerText      = sym;
    document.querySelectorAll('.curr-sym').forEach(el  => el.innerText = sym);
    document.querySelectorAll('.year-label').forEach(el => el.innerText = settings.year);
    document.getElementById('tableTitle').innerText = `${MONTHS[currentMonthIdx]} ${settings.year} Transactions`;
}

// ── Navigation / Tabs ─────────────────────────────────────
function renderTabs() {
    const container = document.getElementById('monthTabs');
    container.innerHTML = '';

    MONTHS.forEach((m, idx) => {
        const btn = document.createElement('button');
        btn.className = `px-6 py-4 text-sm font-semibold transition-all hover:text-indigo-600 ${
            currentMonthIdx === idx && currentMode === 'monthly' ? 'tab-active' : 'text-slate-400'
        }`;
        btn.innerText = m;
        btn.onclick   = () => switchMonth(idx);
        container.appendChild(btn);
    });

    const yearlyBtn = document.createElement('button');
    yearlyBtn.className = `px-6 py-4 text-sm font-semibold transition-all hover:text-indigo-600 ml-auto ${
        currentMode === 'yearly' ? 'tab-active' : 'text-slate-400'
    }`;
    yearlyBtn.innerText = "Yearly Overview";
    yearlyBtn.onclick   = showYearlyOverview;
    container.appendChild(yearlyBtn);

    const distBtn = document.createElement('button');
    distBtn.className = `px-6 py-4 text-sm font-semibold transition-all hover:text-indigo-600 ${
        currentMode === 'distribution' ? 'tab-active' : 'text-slate-400'
    }`;
    distBtn.innerText = "Yearly Distribution";
    distBtn.onclick   = showYearlyDistribution;
    container.appendChild(distBtn);
}

function switchMonth(idx) {
    currentMonthIdx = idx;
    currentMode = 'monthly';
    document.getElementById('monthlyView').classList.remove('hidden');
    document.getElementById('yearlyView').classList.add('hidden');
    document.getElementById('yearlyDistributionView').classList.add('hidden');
    applySettingsUI();
    renderTabs();
    updateUI();
    updateCharts();
}

function showYearlyOverview() {
    currentMode = 'yearly';
    document.getElementById('monthlyView').classList.add('hidden');
    document.getElementById('yearlyView').classList.remove('hidden');
    document.getElementById('yearlyDistributionView').classList.add('hidden');
    renderTabs();
    updateYearlyUI();
}

function showYearlyDistribution() {
    currentMode = 'distribution';
    document.getElementById('monthlyView').classList.add('hidden');
    document.getElementById('yearlyView').classList.add('hidden');
    document.getElementById('yearlyDistributionView').classList.remove('hidden');
    renderTabs();
    updateYearlyDistributionUI();
}

// ── Data Access ───────────────────────────────────────────
function getMonthData() {
    return allTransactions[`${settings.year}_${currentMonthIdx}`] || [];
}

function setMonthData(data) {
    allTransactions[`${settings.year}_${currentMonthIdx}`] = data;
    localStorage.setItem(`familyBudget_v${settings.year}`, JSON.stringify(allTransactions));
}

// ── Transactions ──────────────────────────────────────────
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

// ── UI Render — Monthly View ──────────────────────────────
function updateUI() {
    const data = getMonthData();
    const list = document.getElementById('transactionList');
    list.innerHTML = '';
    let inc = 0, exp = 0;
    document.getElementById('emptyState').classList.toggle('hidden', data.length > 0);

    const sortedData = [...data].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedData.forEach(t => {
        const isExp = t.type === 'expense';
        const row   = document.createElement('tr');
        row.className = "hover:bg-slate-50 transition-colors group";
        row.innerHTML = `
            <td class="px-6 py-4 text-xs font-semibold text-slate-400 tabular-nums">${formatDate(t.date)}</td>
            <td class="px-6 py-4 font-medium text-slate-700">${escapeHtml(t.desc)}</td>
            <td class="px-6 py-4">
                <span class="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-bold uppercase tracking-tight">
                    ${escapeHtml(t.category)}
                </span>
            </td>
            <td class="px-6 py-4 text-right font-bold ${isExp ? 'text-red-500' : 'text-green-500'} tabular-nums">
                ${formatCurrency(t.amount, true)}
            </td>
            <td class="px-6 py-4 text-right no-print">
                <button onclick="deleteTransaction(${JSON.stringify(t.id)})"
                    class="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                </button>
            </td>`;
        list.appendChild(row);
    });

    data.forEach(t => { if (t.type === 'expense') exp += t.amount; else inc += t.amount; });

    document.getElementById('totalBalance').innerText = formatCurrency(inc - exp, true);
    document.getElementById('totalIncome').innerText  = `+${formatCurrency(inc)}`;
    document.getElementById('totalExpense').innerText = `-${formatCurrency(exp)}`;
    document.getElementById('transCount').innerText   = `${data.length} Entries`;
}

// ── UI Render — Yearly Overview ───────────────────────────
function updateYearlyUI() {
    let yInc = 0, yExp = 0;
    const monthlyStats = MONTHS.map((_, idx) => {
        const data = allTransactions[`${settings.year}_${idx}`] || [];
        let inc = 0, exp = 0;
        data.forEach(t => { if (t.type === 'income') inc += t.amount; else exp += t.amount; });
        yInc += inc; yExp += exp;
        return { inc, exp, net: inc - exp };
    });

    document.getElementById('yearlyNet').innerText    = formatCurrency(yInc - yExp, true);
    document.getElementById('yearlyIncome').innerText = formatCurrency(yInc);
    document.getElementById('yearlyExpense').innerText = formatCurrency(yExp);

    const tbody = document.getElementById('yearlyTableBody');
    tbody.innerHTML = '';
    monthlyStats.forEach((s, i) => {
        const row = document.createElement('tr');
        row.className = "hover:bg-slate-50";
        row.innerHTML = `
            <td class="py-3 font-semibold text-slate-600">${MONTHS[i]}</td>
            <td class="py-3 text-green-600 tabular-nums">${formatCurrency(s.inc, true)}</td>
            <td class="py-3 text-red-600 tabular-nums">${formatCurrency(-s.exp, true)}</td>
            <td class="py-3 text-right font-bold ${s.net >= 0 ? 'text-indigo-600' : 'text-red-800'} tabular-nums">
                ${formatCurrency(s.net, true)}
            </td>`;
        tbody.appendChild(row);
    });
    updateYearlyChart(monthlyStats);
}

// ── UI Render — Yearly Distribution ──────────────────────
function updateYearlyDistributionUI() {
    const categoryExpenses = {};
    let totalYearlyExpense = 0;

    MONTHS.forEach((_, idx) => {
        const data = allTransactions[`${settings.year}_${idx}`] || [];
        data.forEach(t => {
            if (t.type === 'expense') {
                categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + t.amount;
                totalYearlyExpense += t.amount;
            }
        });
    });

    const tbody = document.getElementById('yearlyDistributionTableBody');
    tbody.innerHTML = '';

    const sortedCategories = Object.entries(categoryExpenses).sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="py-8 text-center text-slate-400 italic">No yearly expenses to display.</td></tr>';
    } else {
        sortedCategories.forEach(([cat, amount]) => {
            const pct = totalYearlyExpense > 0 ? ((amount / totalYearlyExpense) * 100).toFixed(1) : 0;
            const row = document.createElement('tr');
            row.className = "hover:bg-slate-50";
            row.innerHTML = `
                <td class="py-4 font-semibold text-slate-600">${escapeHtml(cat)}</td>
                <td class="py-4 text-right font-bold text-slate-800 tabular-nums">${formatCurrency(amount)}</td>
                <td class="py-4 text-right text-slate-400 tabular-nums">${pct}%</td>`;
            tbody.appendChild(row);
        });
    }

    yearlyDistributionPieChart.data.labels               = sortedCategories.map(c => c[0]);
    yearlyDistributionPieChart.data.datasets[0].data     = sortedCategories.map(c => c[1]);
    yearlyDistributionPieChart.update();
}

// ── Form Helpers ──────────────────────────────────────────
function setFormType(type) {
    selectedType = type;
    document.getElementById('typeExp').classList.toggle('pill-selected', type === 'expense');
    document.getElementById('typeInc').classList.toggle('pill-selected', type === 'income');
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
        b.className = `cat-pill px-3 py-1.5 text-[10px] uppercase font-bold border border-slate-200 rounded-full bg-slate-50 text-slate-500 transition-all ${
            selectedCategory === cat ? 'pill-selected' : ''
        }`;
        b.innerText = cat;
        b.onclick   = () => {
            selectedCategory = cat;
            document.querySelectorAll('.cat-pill').forEach(p => {
                p.classList.toggle('pill-selected', p.getAttribute('data-category') === cat);
            });
        };
        c.appendChild(b);
    });
}

function promptAddCategory() {
    const n = prompt("Enter new category name:");
    if (n && n.trim() && !categories.includes(n.trim())) {
        const newCat = n.trim();
        categories.push(newCat);
        localStorage.setItem('budgetCategories', JSON.stringify(categories));
        selectedCategory = newCat;
        renderCategoryPills();
    }
}

// ── Templates (Quick Add) ─────────────────────────────────
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
        c.innerHTML = '<div class="text-[10px] text-slate-400 text-center py-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">No quick-adds saved.</div>';
        return;
    }
    templates.forEach(t => {
        const wrapper = document.createElement('div');
        wrapper.className = "quick-add-item group relative flex items-center w-full";
        const isExp = t.type === 'expense';
        wrapper.innerHTML = `
            <button class="flex-1 flex justify-between items-center px-4 py-3 bg-white text-xs font-medium rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-all shadow-sm">
                <div class="flex flex-col text-left">
                    <span class="text-slate-800 font-bold">${escapeHtml(t.desc)}</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${escapeHtml(t.category)}</span>
                </div>
                <span class="${isExp ? 'text-red-500' : 'text-green-600'} font-bold tabular-nums">
                    ${formatCurrency(t.amount, true)}
                </span>
            </button>
            <button onclick="deleteTemplate(${t.id}, event)"
                class="delete-template absolute -right-1 -top-1 bg-red-500 text-white rounded-full p-1 opacity-0 transition-opacity shadow-md z-20">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                </svg>
            </button>`;
        wrapper.querySelector('button:first-child').onclick = () => {
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

    pieChart = new Chart(document.getElementById('pieChart').getContext('2d'), {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: CHART_COLORS }] },
        options: { ...opts, plugins: { legend: { display: false } } }
    });

    barChart = new Chart(document.getElementById('barChart').getContext('2d'), {
        type: 'bar',
        data: { labels: ['Income', 'Expense'], datasets: [{ data: [0, 0], backgroundColor: ['#10b981', '#f43f5e'] }] },
        options: { ...opts, plugins: { legend: { display: false } } }
    });

    yearlyChart = new Chart(document.getElementById('yearlyChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: MONTHS,
            datasets: [
                { label: 'Income',  data: [], borderColor: '#10b981', tension: 0.3, fill: false },
                { label: 'Expense', data: [], borderColor: '#f43f5e', tension: 0.3, fill: false }
            ]
        },
        options: opts
    });

    yearlyDistributionPieChart = new Chart(document.getElementById('yearlyDistributionPieChart').getContext('2d'), {
        type: 'pie',
        data: { labels: [], datasets: [{ data: [], backgroundColor: CHART_COLORS }] },
        options: { ...opts, plugins: { legend: { display: false } } }
    });
}

function updateCharts() {
    const data = getMonthData();
    const cats = {}; let inc = 0, exp = 0;
    data.forEach(t => {
        if (t.type === 'expense') { cats[t.category] = (cats[t.category] || 0) + t.amount; exp += t.amount; }
        else { inc += t.amount; }
    });
    pieChart.data.labels              = Object.keys(cats);
    pieChart.data.datasets[0].data    = Object.values(cats);
    pieChart.update();
    barChart.data.datasets[0].data    = [inc, exp];
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

            const key         = `${year}_${monthIdx}`;
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount)) continue;

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
        updateUI();
        updateCharts();
        if (currentMode === 'yearly')       updateYearlyUI();
        if (currentMode === 'distribution') updateYearlyDistributionUI();
        event.target.value = '';
    };
    reader.readAsText(file);
}

function exportToCSV() {
    let csv = "Year,Month,Date,Description,Category,Type,Amount,Currency\n";
    // Export current year only
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
    link.setAttribute('download', `Family_Budget_${settings.familyName || 'Planner'}_${settings.year}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url); // Free memory
}

// ── Bootstrap ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
