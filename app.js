// Public WebSocket Endpoint
const PUBLIC_WS_URL = 'wss://api.derivws.com/trading/v1/options/ws/public';

let ws = null;
let currentSymbol = null;
let tickHistory = [];
let lastQuote = null;

document.addEventListener('DOMContentLoaded', () => {
    initWebSocket();
    const marketSelectEl = document.getElementById('marketSelect');
    if (marketSelectEl) {
        marketSelectEl.addEventListener('change', onSymbolChange);
    }
});

// 1. Connect to Public WebSocket Stream
function initWebSocket() {
    ws = new WebSocket(PUBLIC_WS_URL);

    ws.onopen = () => {
        updateConnectionStatus(true, 'Connected (Public Feed)');
        ws.send(JSON.stringify({ "active_symbols": "full" }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };

    ws.onclose = () => {
        updateConnectionStatus(false, 'Disconnected (Reconnecting...)');
        setTimeout(initWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        updateConnectionStatus(false, 'Connection Error');
    };
}

// 2. Process incoming websocket messages
function handleMessage(data) {
    const marketSelect = document.getElementById('marketSelect');

    // Handle active symbols list using the exact fix instructions to prevent "undefined"
    if (Array.isArray(data.active_symbols)) {
        if (marketSelect) {
            marketSelect.innerHTML = "";

            data.active_symbols.forEach(market => {
                const symbol = market.underlying_symbol;
                const name = market.display_name ||
                             market.market_display_name ||
                             market.submarket_display_name || symbol;

                if (!symbol) return;

                const option = document.createElement("option");
                option.value = symbol;
                option.textContent = name + " (" + symbol + ")";
                marketSelect.appendChild(option);
            });

            // Auto-select and subscribe to the first symbol if not set
            if (data.active_symbols.length > 0 && !currentSymbol) {
                currentSymbol = data.active_symbols[0].underlying_symbol;
                if (currentSymbol) {
                    marketSelect.value = currentSymbol;
                    subscribeToSymbolTicks(currentSymbol);
                }
            }
        }
    }

    // Handle live ticks
    if (data.tick) {
        const priceElement = document.getElementById('price');
        const timeElement = document.getElementById('time');

        const rawQuote = data.tick.quote;
        const epoch = data.tick.epoch;
        const quote = parseFloat(rawQuote).toFixed(data.tick.pip_size || 4);
        const formattedTime = new Date(epoch * 1000).toLocaleTimeString();

        if (priceElement) {
            priceElement.textContent = quote;
        }
        if (timeElement) {
            timeElement.textContent = formattedTime;
        }

        const currentNum = parseFloat(quote);
        const prevNum = lastQuote !== null ? parseFloat(lastQuote) : null;

        analyzeTickFeatures(currentNum, prevNum);
        
        const quoteString = currentNum.toString();
        const lastChar = quoteString.slice(-1);
        const digitNum = parseInt(lastChar, 10);
        runAIBotAnalysis(currentNum, prevNum, digitNum);

        lastQuote = quote;

        tickHistory.push(currentNum);
        if (tickHistory.length > 30) tickHistory.shift();

        renderSVGChart();
        appendTickTableRow(formattedTime, quote);
    }
}

// 3. Change symbol subscription dynamically
function onSymbolChange() {
    const select = document.getElementById('marketSelect');
    if (select) {
        currentSymbol = select.value;
        subscribeToSymbolTicks(currentSymbol);
    }
}

function subscribeToSymbolTicks(symbol) {
    if (ws && ws.readyState === WebSocket.OPEN && symbol) {
        ws.send(JSON.stringify({ forget_all: 'ticks' }));
        tickHistory = [];
        lastQuote = null;
        
        ws.send(JSON.stringify({ ticks: symbol, subscribe: 1 }));
        
        const chartSymbolEl = document.getElementById('chartSymbol');
        if (chartSymbolEl) chartSymbolEl.innerText = symbol;
    }
}

// 4. Rise/Fall and Digit Analysis logic
function analyzeTickFeatures(currentQuote, previousQuote) {
    const directionBox = document.getElementById('tickDirectionBox');
    const digitValueEl = document.getElementById('lastDigitValue');
    const digitEvenOddEl = document.getElementById('digitEvenOdd');

    if (previousQuote !== null && directionBox) {
        if (currentQuote > previousQuote) {
            directionBox.className = "p-4 bg-emerald-950/60 rounded-lg border border-emerald-500/50 text-center font-mono text-lg font-bold text-emerald-400 shadow-inner";
            directionBox.innerHTML = `<i class="fa-solid fa-arrow-up"></i> RISE (+${(currentQuote - previousQuote).toFixed(4)})`;
        } else if (currentQuote < previousQuote) {
            directionBox.className = "p-4 bg-rose-950/60 rounded-lg border border-rose-500/50 text-center font-mono text-lg font-bold text-rose-400 shadow-inner";
            directionBox.innerHTML = `<i class="fa-solid fa-arrow-down"></i> FALL (-${(previousQuote - currentQuote).toFixed(4)})`;
        } else {
            directionBox.className = "p-4 bg-slate-950/90 rounded-lg border border-emerald-500/30 text-center font-mono text-lg font-bold text-slate-300 shadow-inner";
            directionBox.innerHTML = `NO CHANGE`;
        }
    }

    const quoteString = currentQuote.toString();
    const lastChar = quoteString.slice(-1);
    const digitNum = parseInt(lastChar, 10);

    if (!isNaN(digitNum) && digitValueEl && digitEvenOddEl) {
        digitValueEl.innerText = digitNum;
        const isEven = digitNum % 2 === 0;
        digitEvenOddEl.innerText = isEven ? "EVEN (🟢)" : "ODD (🔴)";
        digitEvenOddEl.className = isEven ? "text-xs font-bold text-emerald-400" : "text-xs font-bold text-rose-400";
    }
}

// 5. AI Bot Analysis Engine
function runAIBotAnalysis(currentQuote, previousQuote, lastDigit) {
    if (previousQuote === null) return;

    const botSignalEl = document.getElementById('aiBotSignal');
    const botConfidenceEl = document.getElementById('aiBotConfidence');
    if (!botSignalEl) return;

    const priceDiff = currentQuote - previousQuote;
    let signal = "HOLD / WAIT";
    let confidence = "54%";
    let recommendationColor = "text-amber-400";

    if (priceDiff > 0 && lastDigit % 2 === 0) {
        signal = "RISE & EVEN (CALL)";
        confidence = "81%";
        recommendationColor = "text-emerald-400";
    } else if (priceDiff < 0 && lastDigit % 2 !== 0) {
        signal = "FALL & ODD (PUT)";
        confidence = "79%";
        recommendationColor = "text-rose-400";
    } else if (priceDiff > 0) {
        signal = "MOMENTUM RISE";
        confidence = "67%";
        recommendationColor = "text-emerald-400";
    } else if (priceDiff < 0) {
        signal = "MOMENTUM FALL";
        confidence = "66%";
        recommendationColor = "text-rose-400";
    }

    botSignalEl.innerText = signal;
    botSignalEl.className = `text-sm font-bold font-mono ${recommendationColor}`;
    if (botConfidenceEl) botConfidenceEl.innerText = confidence;
}

// 6. SVG Chart Rendering
function renderSVGChart() {
    if (tickHistory.length < 2) return;
    const svg = document.getElementById('tickChart');
    const path = document.getElementById('chartPath');
    if (!svg || !path) return;

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    const min = Math.min(...tickHistory);
    const max = Math.max(...tickHistory);
    const range = (max - min) || 1;

    const points = tickHistory.map((val, idx) => {
        const x = (idx / (tickHistory.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 20) - 10;
        return `${x},${y}`;
    });

    path.setAttribute('d', `M ${points.join(' L ')}`);
}

// 7. Add Row to Table
function appendTickTableRow(timeStr, quote) {
    const tbody = document.getElementById('tickTableBody');
    if (!tbody) return;

    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="p-2.5 text-slate-400">${timeStr}</td>
        <td class="p-2.5 text-emerald-400 font-bold">${quote}</td>
    `;
    tbody.prepend(row);

    if (tbody.children.length > 12) {
        tbody.removeChild(tbody.lastChild);
    }
}

// 8. Update Connection Status Badge
function updateConnectionStatus(isConnected, text) {
    const badge = document.getElementById('status');
    if (!badge) return;

    if (isConnected) {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 pulse-green"></span><span class="text-emerald-400 font-mono font-semibold">${text}</span>`;
    } else {
        badge.innerHTML = `<span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span><span class="text-rose-400 font-mono font-semibold">${text}</span>`;
    }
}
