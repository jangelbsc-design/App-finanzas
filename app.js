// Constantes
const SHEET_ID = '1hq0tRYm5Y1wuTo-h0JUSqXGCgDRA5aMB4IHxUkw26X0';
const URL_GASTOS = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Gastos`;
const URL_INGRESOS = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Ingresos`;

// URL del App Script despues de publicar (Pega tu URL en vez de esto)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxquwMyhLrPaQ0wSix09fwVJYgT1JkmOQ4JHtYQZAUNuvy1RZ0sbBP5vwWO6HuNHcm4DA/exec';

let transacciones = [];
let totalGastos = 0;
let totalIngresos = 0;
let ahorroTotal = 0;
let recent6MonthsGlobal = [];

// Navegación principal (Barra Inferior)
document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();

        // Quitar 'active' de todos
        document.querySelectorAll('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Mostrar sección correspondiente
        const targetId = item.getAttribute('data-target');
        document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');

        // Redibujar gráficos si es necesario por el resizing
        if (targetId === 'view-analysis') {
            renderTrendChart();
        }
    });
});

// Navegación de Acciones (Grid)
function navigateAction(actionName) {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    if (actionName === 'Ingresos') {
        document.getElementById('view-ingresos').classList.add('active');
        // Setear fecha de hoy por defecto si esta vacío
        const fechaInput = document.getElementById('ingreso-fecha');
        if (!fechaInput.value) {
            fechaInput.value = new Date().toISOString().split('T')[0];
        }
    } else if (actionName === 'Gastos') {
        document.getElementById('view-gastos').classList.add('active');
        const fechaInput = document.getElementById('gasto-fecha');
        if (!fechaInput.value) {
            fechaInput.value = new Date().toISOString().split('T')[0];
        }
    } else {
        document.getElementById('view-dynamic').classList.add('active');
        document.getElementById('dynamic-title').innerText = actionName;
    }
}

function goBack() {
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById('view-home').classList.add('active');

    // reset nav
    document.querySelectorAll('.bottom-nav .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('.bottom-nav .nav-item[data-target="view-home"]').classList.add('active');
}

// Fetch y Parseo de CSV desde Google Sheets (gviz api)
async function fetchSheet(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        return parseCSV(text);
    } catch (e) {
        console.error("Error fetching data from Google Sheets:", e);
        return [];
    }
}

function parseCSV(text) {
    const lines = text.split('\n').map(l => l.replace(/\r/g, '').trim()).filter(line => line !== '');
    if (lines.length === 0) return [];

    // Extraer cabecera y limpiar comillas dobles
    const headers = lines[0].split(',').map(h => h.replace(/^"(.*)"$/, '$1').trim());

    const data = [];
    for (let i = 1; i < lines.length; i++) {
        // Simple CSV splitter que no maneja comas dentro de comillas perfectamente,
        // pero funciona para datos simples tabulados.
        const rowData = lines[i].split(',').map(cell => cell.replace(/^"(.*)"$/, '$1').trim());
        let obj = {};
        headers.forEach((header, index) => {
            obj[header] = rowData[index] || '';
        });
        data.push(obj);
    }
    return data;
}

function getLastNMonthsData(transactions, n) {
    const now = new Date();
    const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const results = [];
    
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = String(d.getFullYear());
        
        const monthTx = transactions.filter(tx => {
            if (!tx.Fecha) return false;
            const parts = tx.Fecha.split('/');
            return parts.length === 3 && parts[1] === mm && parts[2] === yyyy;
        });
        
        let ingresos = 0;
        let gastos = 0;
        monthTx.forEach(tx => {
            if (tx.tipo === 'ingreso') ingresos += (parseFloat(tx.Monto) || 0);
            if (tx.tipo === 'gasto') gastos += (parseFloat(tx.Monto) || 0);
        });
        
        results.push({ name: monthNames[d.getMonth()], month: mm, year: yyyy, ingresos: ingresos, gastos: gastos });
    }
    return results;
}

// Lógica de Inicialización
async function initApp() {
    // 1. Obtener Datos Concurrentemente
    const timeStamp = Date.now();
    const [gastosData, ingresosData] = await Promise.all([
        fetchSheet(`${URL_GASTOS}&_=${timeStamp}`),
        fetchSheet(`${URL_INGRESOS}&_=${timeStamp}`)
    ]);

    // Setear Identificador de Mes y Año
    const now = new Date();
    const monthNamesFull = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const currentMonthName = monthNamesFull[now.getMonth()];
    const currentYear = now.getFullYear();
    const indicatorEl = document.getElementById('month-indicator');
    if (indicatorEl) {
        indicatorEl.innerText = `${currentMonthName} ${currentYear}`;
    }

    // 2. Procesar Datos y Calcular Totales (Mes Actual)
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());

    totalGastos = 0;
    gastosData.forEach(g => {
        const parts = (g['Fecha'] || '').split('/');
        if (parts.length === 3 && String(parts[1]).padStart(2, '0') === mm && String(parts[2]) === yyyy) {
            totalGastos += (parseFloat(g['Monto']) || 0);
        }
    });

    totalIngresos = 0;
    ingresosData.forEach(i => {
        const parts = (i['Fecha'] || '').split('/');
        if (parts.length === 3 && String(parts[1]).padStart(2, '0') === mm && String(parts[2]) === yyyy) {
            totalIngresos += (parseFloat(i['Monto']) || 0);
        }
    });

    ahorroTotal = totalIngresos - totalGastos;

    // Generar array unificado para el Historial de Transacciones
    const movGastos = gastosData.map(g => ({ ...g, tipo: 'gasto', Descripcion: g['Descripcion'] || 'Gasto General' }));
    const movIngresos = ingresosData.map(i => ({ ...i, tipo: 'ingreso', Descripcion: i['Persona'] || 'Ingreso General' }));

    transacciones = [...movGastos, ...movIngresos]
        .filter(t => t.Fecha && t.Monto) // Solo registros consistentes
        .sort((a, b) => {
            // Orden básico de Fechas (Formato DD/MM/YYYY)
            const parseDate = (dStr) => {
                if (!dStr) return 0;
                const parts = dStr.split('/');
                if (parts.length === 3) return parseInt(parts[2] + parts[1] + parts[0]);
                return 0;
            };
            return parseDate(b.Fecha) - parseDate(a.Fecha);
        });

    // 3. Actualizar UI (Dashboard)
    document.getElementById('total-gastos').innerText = `-$${totalGastos.toFixed(2)}`;
    document.getElementById('total-ingresos').innerText = `$${totalIngresos.toFixed(2)}`; 
    document.getElementById('ingresos-amount').innerText = `$${totalIngresos.toFixed(2)}`;

    // 4. Procesar Datos y Graficar
    recent6MonthsGlobal = getLastNMonthsData(transacciones, 6);

    let valIngresosChart = totalIngresos;
    let valGastosChart = totalGastos;
    if (valIngresosChart === 0 && valGastosChart === 0) {
        valIngresosChart = 1; // Grafico por defecto si no hay data
    }

    try {
        renderPieChart(valIngresosChart, valGastosChart);
        renderTrendChart();
    } catch(e) {
        console.warn('Error al renderizar el grafico', e);
    }
    
    renderTransactionsList();
}

// Variables Globales de Chart.js para evitar overlapping
let balanceChartInstance = null;
let trendChartInstance = null;

function renderPieChart(ingresos, gastos) {
    const ctx = document.getElementById('balanceChart').getContext('2d');

    if (balanceChartInstance) balanceChartInstance.destroy();

    balanceChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Ingresos', 'Gastos'],
            datasets: [{
                data: [ingresos, gastos],
                backgroundColor: ['#8BC34A', '#C62828'], // Verde Secundario y Rojo Terciario
                borderWidth: 0,
                cutout: '72%',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: true }
            },
            onClick: (e, activeElements) => {
                if (activeElements.length > 0) {
                    const clickedIndex = activeElements[0].index;
                    if (clickedIndex === 0) {
                        navigateAction('Ingresos');
                    } else {
                        navigateAction('Gastos');
                    }
                }
            }
        }
    });
}

function renderTrendChart() {
    if (!recent6MonthsGlobal || recent6MonthsGlobal.length === 0) return;
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: recent6MonthsGlobal.map(m => m.name),
            datasets: [
                {
                    label: 'Ingresos',
                    data: recent6MonthsGlobal.map(m => m.ingresos),
                    backgroundColor: '#8BC34A',
                    borderRadius: 4
                },
                {
                    label: 'Gastos',
                    data: recent6MonthsGlobal.map(m => m.gastos),
                    backgroundColor: '#C62828',
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}

function renderTransactionsList() {
    const container = document.getElementById('transactions-list');
    container.innerHTML = '';

    if (transacciones.length === 0) {
        container.innerHTML = '<p style="color: #77767D; text-align: center;">No hay transacciones registradas.</p>';
        return;
    }

    // Limitar a las ultimas 20 transacciones
    transacciones.slice(0, 20).forEach(tx => {
        const div = document.createElement('div');
        div.className = 'tx-card';

        const isIngreso = tx.tipo === 'ingreso';
        const colorClass = isIngreso ? 'green' : 'red';
        const prefix = isIngreso ? '+' : '-';

        div.innerHTML = `
            <div class="tx-info">
                <span class="tx-desc">${tx.Descripcion}</span>
                <span class="tx-date">${tx.Fecha}</span>
            </div>
            <div class="tx-amount ${colorClass}">${prefix}$${parseFloat(tx.Monto).toFixed(2)}</div>
        `;
        container.appendChild(div);
    });
}

// Manejo de Formulario de Ingresos
document.getElementById('form-ingreso')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-ingreso');
    const originalText = btn.innerText;

    const fecha = document.getElementById('ingreso-fecha').value;
    const persona = document.getElementById('ingreso-persona').value;
    const monto = document.getElementById('ingreso-monto').value;
    const detalle = document.getElementById('ingreso-detalle').value;

    // Generar un ID simple
    const idIngreso = 'ING-' + Date.now().toString(36).toUpperCase();

    // Convert YYYY-MM-DD to DD/MM/YYYY to match format
    const [year, month, day] = fecha.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    const payload = {
        action: 'addIngreso',
        id: idIngreso,
        fecha: formattedDate,
        persona: persona,
        monto: monto,
        detalle: detalle
    };

    try {
        btn.innerText = 'Guardando...';
        btn.disabled = true;

        if (SCRIPT_URL === 'URL_DEL_SCRIPT_AQUI') {
            alert('¡Atención! Falta configurar la SCRIPT_URL del Google Apps Script en app.js para poder guardar.');
            throw new Error("Script URL no configurada");
        }

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            // Modo "no-cors" porque Google Apps Script no devuelve headers CORS para JSON a veces
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' }
        });

        alert('Cargado exitosamente');
        document.getElementById('form-ingreso').reset();
        goBack();
        setTimeout(() => {
            initApp(); // Recargar datos después de dar tiempo al script a guardar
        }, 2000);

    } catch (error) {
        console.error('Error al guardar:', error);
        if (SCRIPT_URL !== 'URL_DEL_SCRIPT_AQUI') {
            alert('Hubo un error al intentar guardar el ingreso.');
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Manejo de Formulario de Gastos
document.getElementById('form-gasto')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-save-gasto');
    const originalText = btn.innerText;

    const fecha = document.getElementById('gasto-fecha').value;
    const categoria = document.getElementById('gasto-categoria').value;
    const monto = document.getElementById('gasto-monto').value;
    const descripcion = document.getElementById('gasto-descripcion').value;

    const idGasto = 'GAS-' + Date.now().toString(36).toUpperCase();
    const [year, month, day] = fecha.split('-');
    const formattedDate = `${day}/${month}/${year}`;

    const payload = {
        action: 'addGasto',
        id: idGasto,
        fecha: formattedDate,
        categoria: categoria,
        monto: monto,
        descripcion: descripcion,
        // The original sheet also had "Cuenta_Origen" and "Recibo" columns according to your headers, 
        // they will default to empty text if not needed here.
        cuenta: "",
        recibo: ""
    };

    try {
        btn.innerText = 'Guardando...';
        btn.disabled = true;

        if (SCRIPT_URL.includes('URL_DEL_SCRIPT_AQUI')) {
            alert('¡Atención! Falta configurar la SCRIPT_URL del Google Apps Script en app.js para poder guardar.');
            throw new Error("Script URL no configurada");
        }

        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload),
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' }
        });

        alert('Gasto guardado exitosamente');
        document.getElementById('form-gasto').reset();
        goBack();
        setTimeout(() => {
            initApp(); // Recargar datos después de dar tiempo al script a guardar
        }, 2000);

    } catch (error) {
        console.error('Error al guardar:', error);
        if (!SCRIPT_URL.includes('URL_DEL_SCRIPT_AQUI')) {
            alert('Hubo un error al intentar guardar el gasto.');
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', initApp);
