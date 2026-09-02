"use strict";
(function () {
    "use strict";
    /* ---------- alto real de pantalla en modo "agregado a inicio" (PWA standalone) ----------
       En iOS, cuando la app está agregada a la pantalla de inicio (sin barra de navegador),
       a veces el primer dibujo usa un alto de pantalla que todavía no incluye del todo el área
       bajo la barra de estado / sobre el "home indicator" — 100dvh y env(safe-area-inset-bottom)
       deberían resolverlo solos, pero en algunos iPhone queda un resto de espacio vacío (del
       color de fondo de la página) debajo de la barra inferior hasta que la app se repinta.
       Guardamos el alto real en una variable CSS y la recalculamos ante cualquier evento que
       pueda cambiarlo, para que .phone (que la usa como respaldo de 100dvh) siempre calce con
       la pantalla real y no se quede pegada a una medida vieja. */
    function setAppHeight() {
        document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
    }
    setAppHeight();
    ['resize', 'orientationchange', 'pageshow', 'visibilitychange'].forEach(function (ev) {
        window.addEventListener(ev, setAppHeight);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', setAppHeight);
    }
    /* ===================== ICONS ===================== */
    const ICONS = {
        transacciones: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
        resumen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12l6 3.2"/></svg>',
        menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.6" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none"/></svg>',
        cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4h2l1.6 11.2A2 2 0 0 0 9.1 17H18a2 2 0 0 0 2-1.6L21.5 8H6"/><circle cx="10" cy="21" r="1.3" fill="currentColor" stroke="none"/><circle cx="18" cy="21" r="1.3" fill="currentColor" stroke="none"/></svg>',
        car: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V11.5L6 6h12l2 5.5V16"/><path d="M4 16h16v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V17h-9v1.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V16Z"/><circle cx="7.5" cy="13" r="1.1" fill="currentColor" stroke="none"/><circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none"/></svg>',
        utensils: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v6.5a2 2 0 1 0 4 0V3M9 9.5V21"/><path d="M16.5 3c-1.5 1.4-2 3.2-2 5.2 0 1.7 1 2.8 2 3.3V21"/></svg>',
        home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5h4v5"/></svg>',
        film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M16 5v14M3.5 9.5h4M16.5 9.5h4M3.5 14.5h4M16.5 14.5h4"/></svg>',
        heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.6-9.3C1 7.4 3 4.5 6.2 4.5c2 0 3.4 1.1 5.8 3.7 2.4-2.6 3.8-3.7 5.8-3.7 3.2 0 5.2 2.9 3.8 6.2C19.5 15.4 12 20 12 20Z"/></svg>',
        repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.6-5.7L20 8.5M20 8.5V4M20 8.5h-4.5M20 12a8 8 0 0 1-13.6 5.7L4 15.5M4 15.5V20M4 15.5h4.5"/></svg>',
        more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 12h6M12 9v6"/></svg>',
        briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 12.5c5 2 13 2 18 0"/></svg>',
        laptop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="5" width="15" height="10" rx="1.5"/><path d="M2.5 19.5h19"/></svg>',
        plusCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
        trending: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 17 10 10.5l4 4L20.5 7"/><path d="M15 7h5.5v5.5"/></svg>',
        bank: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5 9.5v8.5M9.5 9.5v8.5M14.5 9.5v8.5M19 9.5v8.5M3 19h18"/></svg>',
        coin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.3 15.2c.4.9 1.4 1.4 2.7 1.4 1.7 0 2.8-.8 2.8-2 0-3-5.5-1.5-5.5-4.4 0-1.2 1.1-2 2.7-2 1.3 0 2.3.5 2.7 1.4"/></svg>',
        card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="M3 9.5h18"/></svg>',
        cash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/></svg>',
        lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
        lockSmall: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2a4 4 0 0 0-4 4v3H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V6a4 4 0 0 0-4-4Zm-2 4a2 2 0 1 1 4 0v3h-4Z"/></svg>',
        close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
        chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
        chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.5 5.5L20 7"/></svg>',
        checkCircle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.6L16.5 9"/></svg>',
        users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M2.8 19c.6-3 2.9-5 6.2-5s5.6 2 6.2 5"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.8 6.3A2.6 2.6 0 0 1 20.8 8c0 1.6-1.2 2.7-2.6 3.2"/><path d="M16.2 14.3c2.4.4 4 2 4.6 4.7"/></svg>',
        ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
        plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 .9h8a1 1 0 0 0 1-.9L18 7"/></svg>',
        inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12h5l1.8 3h3.4l1.8-3h5"/><path d="M5.5 5h13l2 7v6a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 18v-6Z"/></svg>',
        tags: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 8v8M12 8v8M15.5 8v8"/></svg>',
        sparkle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/></svg>',
        filterFunnel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6.2 7.2v5.3L10.2 20v-7.8Z"/></svg>',
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 4.5 19.5 8.5 8 20H4v-4Z"/></svg>',
        calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>',
        question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2.9-1.2 1.8"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
        layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 3 8l9 4.5 9-4.5-9-4.5Z"/><path d="M3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5"/></svg>',
        minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
        camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h1.8l1-2h7.4l1 2h1.8A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.3"/></svg>',
        image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" stroke="none"/><path d="M4 16.5l5-5 3.5 3.5L16 11l4.5 5.5"/></svg>',
        share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="6" r="2.3"/><circle cx="6" cy="12" r="2.3"/><circle cx="18" cy="18" r="2.3"/><path d="M8 10.8 16 6.9M8 13.2l8 3.9"/></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/></svg>',
        bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.2H4c.5-.7 2-2.2 2-6.2Z"/><path d="M9.5 19a2.6 2.6 0 0 0 5 0"/></svg>'
    };
    function icon(name, cls) { return '<span class="icon-wrap' + (cls ? (' ' + cls) : '') + '">' + ICONS[name] + '</span>'; }
    // Las categorías pueden usar un ícono de este set fijo (nombre conocido, ej. 'trending') O
    // directamente un emoji suelto (ej. '🛒') como valor de "icon" — esto último es lo que usan
    // las categorías por defecto y lo que se puede elegir/escribir en el editor de categorías.
    // Este helper decide cuál de los dos casos es y arma el HTML que corresponda.
    function catIconMarkup(name) { return ICONS[name] !== undefined ? ICONS[name] : '<span class="emoji-icon">' + name + '</span>'; }
    /* ===================== DATA MODEL ===================== */
    // Categorías por defecto (Fase "diseño de categorías") — nombre, tipo, color e ícono definidos
    // a pedido: el ícono ahora es directamente un emoji (no un nombre del set ICONS de arriba),
    // gracias a catIconMarkup(). Las de tipo 'inversion' (fintual/racional/banco_chile/buda) NO son
    // categorías libres: son las plataformas de inversión reales, ligadas a PLATAFORMA_DATA y a
    // METAS_INVERSION.plataformaId — por eso se dejaron con su ícono de siempre en vez de emoji.
    const CATS = {
        supermercado: { nombre: 'Supermercado', tipo: 'gasto', color: 'mint', icon: '🛒' },
        restoranes: { nombre: 'Restoranes y bares', tipo: 'gasto', color: 'peach', icon: '🍽️' },
        transporte: { nombre: 'Transporte', tipo: 'gasto', color: 'sky', icon: '🚕' },
        hogar: { nombre: 'Hogar', tipo: 'gasto', color: 'lavender', icon: '🏠' },
        salud: { nombre: 'Salud', tipo: 'gasto', color: 'pink', icon: '💊' },
        entretenimiento: { nombre: 'Entretenimiento', tipo: 'gasto', color: 'neutral', icon: '🎬' },
        deporte: { nombre: 'Deporte', tipo: 'gasto', color: 'mint', icon: '🏃' },
        carrete: { nombre: 'Carrete', tipo: 'gasto', color: 'butter', icon: '🍻' },
        suscripciones: { nombre: 'Suscripciones', tipo: 'gasto', color: 'sage', icon: '📺' },
        compras: { nombre: 'Compras', tipo: 'gasto', color: 'peach', icon: '🛍️' },
        viajes: { nombre: 'Viajes', tipo: 'gasto', color: 'sky', icon: '✈️' },
        regalos: { nombre: 'Regalos y donaciones', tipo: 'gasto', color: 'lavender', icon: '🎁' },
        gastos_hormiga: { nombre: 'Gastos hormiga', tipo: 'gasto', color: 'neutral', icon: '🐜' },
        sueldo: { nombre: 'Sueldo', tipo: 'ingreso', color: 'mint', icon: '💼' },
        pololos_extra: { nombre: 'Pololos extra', tipo: 'ingreso', color: 'sky', icon: '✨' },
        fintual: { nombre: 'Fintual', tipo: 'inversion', color: 'mint', icon: 'trending' },
        racional: { nombre: 'Racional', tipo: 'inversion', color: 'peach', icon: 'trending' },
        banco_chile: { nombre: 'Banco de Chile', tipo: 'inversion', color: 'butter', icon: 'bank' },
        buda: { nombre: 'Buda (cripto)', tipo: 'inversion', color: 'pink', icon: 'coin' }
    };
    // Snapshot de categorías "de fábrica" (solo gasto/ingreso, sin plataformas de inversión —
    // esas las crea cada quien desde cero) — se toma UNA vez acá, antes de que nada la toque,
    // para poder armar el estado inicial de una cuenta nueva de verdad sin arrastrar los datos
    // de ejemplo (Fran/Cata/Sushi Itto, etc.) de esta maqueta.
    const CATS_SEED_DEFAULTS = (function () {
        const out = {};
        Object.keys(CATS).forEach(function (k) { if (CATS[k].tipo !== 'inversion')
            out[k] = Object.assign({}, CATS[k]); });
        return out;
    })();
    const MEDIOS = {
        visa_bch: { nombre: 'Visa Banco de Chile', corto: '•••• 4821', icon: 'card' },
        debito_bci: { nombre: 'Débito BCI', corto: '•••• 9034', icon: 'card' },
        cuenta_vista: { nombre: 'Cuenta Vista', corto: 'Cta. Vista', icon: 'bank' },
        efectivo: { nombre: 'Efectivo', corto: 'Efectivo', icon: 'cash' }
    };
    const CONTACTOS = ['Cata', 'Fran', 'Pancho', 'Mamá'];
    // Presupuesto (Fase 2): meta mensual + alertas por categoría de gasto.
    // Sólo las categorías presentes acá tienen presupuesto asignado; el resto
    // se muestra con un "+ Agregar presupuesto" para simular el estado vacío.
    let PRESUPUESTOS = {
        supermercado: { meta: 180000, alertas: { 80: true, 90: true, 100: true } },
        transporte: { meta: 90000, alertas: { 80: true, 90: false, 100: true } },
        restoranes: { meta: 60000, alertas: { 80: true, 90: true, 100: true } },
        hogar: { meta: 420000, alertas: { 80: false, 90: false, 100: true } },
        salud: { meta: 30000, alertas: { 80: true, 90: true, 100: true } },
        suscripciones: { meta: 15000, alertas: { 80: true, 90: true, 100: true } }
    };
    let presupuestoTotalMensual = 900000;
    // Metas de Fijo/Variable como % de tus ingresos (editable en Presupuesto) — la de Inversión
    // NO se guarda acá: sale sola de la suma de "aporteMensualMeta" de tus metas en Inversiones,
    // para no tener el mismo número escrito en dos partes de la app.
    let METAS_GASTO_PCT = { fijo: 45, variable: 17 };
    // Tus datos de transferencia (Menú > Mi cuenta) — para poder copiar de un tiro, en formato
    // listo para pegar en WhatsApp, un cobro pendiente + cómo te pueden transferir. Nunca se
    // manda a ninguna parte sola: solo se usa para armar el texto que TÚ decides copiar y pegar.
    let DATOS_TRANSFERENCIA = { nombre: '', rut: '', banco: '', tipoCuenta: '', numeroCuenta: '', email: '' };
    // Metas de inversión estilo Fintual (Fase 3): objetivo + aporte mensual meta +
    // historial de monto acumulado por mes + check manual de cumplimiento por mes.
    let metaIdCounter = 3;
    let importIdCounter = 0; // contador de ids para transacciones creadas por "Importar CSV de cartola" (Menú)
    // Todavía sin tipar (queda para una próxima pasada de la migración, según lo conversado --
    // esta primera pasada se enfocó en el modelo de datos de Transacciones). "any[]" es explícito
    // a propósito, para no dejar pasar un tipo inferido de la data de ejemplo por accidente.
    let METAS_INVERSION = [
        {
            id: 'm1', nombre: 'Fondo de emergencia', montoObjetivo: 3000000, aporteMensualMeta: 150000, plataformaId: 'banco_chile', plazo: 'corto', comision: null,
            // aportadoNeto: cuánto de lo acumulado es plata que tú pusiste (a diferencia de las
            // plataformas, acá no hay transacciones por meta para calcularlo solo, así que se
            // guarda directo) — la diferencia con "acumulado" es la ganancia real de esta meta.
            aportadoNeto: 2150000,
            historial: { '2026-04': 1700000, '2026-05': 1850000, '2026-06': 1900000, '2026-07': 2050000, '2026-08': 2200000 },
            checks: { '2026-04': true, '2026-05': true, '2026-06': false, '2026-07': true, '2026-08': true }
        },
        {
            id: 'm2', nombre: 'Pie departamento', montoObjetivo: 8000000, aporteMensualMeta: 300000, plataformaId: 'banco_chile', plazo: 'medio', comision: null,
            aportadoNeto: 3200000,
            historial: { '2026-04': 2000000, '2026-05': 2300000, '2026-06': 2600000, '2026-07': 2950000, '2026-08': 3300000 },
            checks: { '2026-04': true, '2026-05': true, '2026-06': true, '2026-07': true, '2026-08': true }
        }
    ];
    // Check manual mes a mes de "¿cumplí mi objetivo de inversión TOTAL este mes?" — independiente
    // de los checks de cada meta individual (esos ya existen dentro de cada meta). Es una marca
    // que tú pones a mano, no algo que la app calcule sola: un mes puede faltar (todavía no llega,
    // o simplemente no lo has marcado) y eso se ve igual que "no marcado", nunca como "false".
    let METAS_TOTAL_CHECKS = { '2026-01': true, '2026-02': true, '2026-03': true, '2026-04': true, '2026-05': true, '2026-06': false, '2026-07': true, '2026-08': true };
    // Qué avisos de presupuesto (catId+mes+umbral, ej. "supermercado|2026-09|80") ya se mandaron
    // como notificación push, para no repetirla cada vez que se recalcula el gasto del mes —
    // ver checkPresupuestoPushAvisos(). Viaja en el respaldo/app_state para no re-avisar apenas
    // se recarga la app en otro dispositivo.
    let PRESUPUESTO_AVISOS_ENVIADOS = {};
    // Inversiones por plataforma (Fase 4): valor aproximado que la usuaria actualiza a mano
    // de vez en cuando (valorHistorial = lo que iba ingresando cada mes), fecha de la última
    // actualización real y una tasa de crecimiento anual opcional (apagada por defecto, sin
    // ningún porcentaje sugerido por la app). El "aportado neto" no se guarda acá — se calcula
    // siempre desde las transacciones de tipo inversión ya clasificadas.
    const DIAS_UMBRAL_ACTUALIZACION = 30;
    let PLATAFORMA_DATA = {
        fintual: {
            valorHistorial: { '2026-04': 81600, '2026-05': 185400, '2026-06': 291200, '2026-07': 395600, '2026-08': 504000 },
            fechaActualizacion: '2026-08-20', tasaAnual: null, comision: null, plazo: 'largo'
        },
        racional: {
            valorHistorial: { '2026-04': 40800, '2026-05': 91800, '2026-06': 142800, '2026-07': 143500, '2026-08': 206000 },
            fechaActualizacion: '2026-07-10', tasaAnual: null, comision: null, plazo: 'largo'
        },
        banco_chile: {
            // Es la cuenta de ahorro donde viven "Fondo de emergencia" + "Pie departamento" (no el APV,
            // que en realidad está en Fintual) — por eso el valor acá es la suma de esas dos metas mes a mes.
            // Sin plazo propio: sus dos metas ya traen el suyo (corto/medio) por separado.
            valorHistorial: { '2026-04': 3700000, '2026-05': 4150000, '2026-06': 4500000, '2026-07': 5000000, '2026-08': 5500000 },
            fechaActualizacion: '2026-06-15', tasaAnual: null, comision: null, plazo: null
        },
        buda: {
            valorHistorial: { '2026-04': 0, '2026-05': 0, '2026-06': 0, '2026-07': 46000, '2026-08': 17500 },
            fechaActualizacion: '2026-08-25', tasaAnual: null, comision: null, plazo: null
        }
    };
    // Planificador de sueldo (Fase 4, sub-sección dentro de Inversiones).
    // Ya no reparte el sueldo completo (fijo + libre): ahora es puramente "cuánto de mi
    // excedente mensual mando a cada meta de inversión", agrupado por plazo (Corto/Medio/
    // Largo, el mismo sistema de plazo que ya existe en Inversiones), más un sub-reparto de
    // cómo se compone la pata de largo plazo (ETF/cripto/especulativo).
    function computeDefaultPlanBase() {
        const mesActual = todayISO().slice(0, 7);
        const t = monthTotals(mesActual);
        return Math.max(0, Math.round(t.ingresos - t.gastos));
    }
    function computeDefaultMetaPcts(base) {
        const out = {};
        METAS_INVERSION.forEach(m => {
            out[m.id] = base > 0 ? round1(m.aporteMensualMeta / base * 100) : 0;
        });
        return out;
    }
    function getPlanificadorDefaults() {
        const base = computeDefaultPlanBase();
        return {
            base,
            metaPcts: computeDefaultMetaPcts(base)
        };
    }
    // PLANIFICADOR se inicializa más abajo, después de declarar TX y MONTHS — su valor por
    // defecto depende de monthTotals(), que necesita ambos ya definidos.
    // Cada transacción: id, fecha, hora, comercio, monto, medio, tipo, recurrencia, estado, categorias:[{cat,monto}],
    // porCobrar:[{persona,monto,pagado,tipo:'persona'|'reembolso',montoRecibido,linkedTxId}] (persona = nombre o entidad
    // que te debe/reembolsa; monto puede ser null cuando es un reembolso de monto desconocido; montoRecibido/linkedTxId
    // se llenan solo al vincular un depósito real — ver resolvePendiente), reglaAuto, nota
    let TX = [
        { id: 't1', fecha: '2026-08-28', hora: '09:12', comercio: 'Jumbo Ñuñoa', monto: 45000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 31500 }, { cat: 'hogar', monto: 13500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't2', fecha: '2026-08-28', hora: '08:05', comercio: 'Copec Providencia', monto: 18000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 18000 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't3', fecha: '2026-08-27', hora: '20:40', comercio: 'Uber', monto: 6200, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 6200 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't4', fecha: '2026-08-27', hora: '13:15', comercio: 'Copec Las Condes', monto: 22000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 22000 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't5', fecha: '2026-08-26', hora: '21:03', comercio: 'Restobar Lastarria', monto: 64000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 64000 }], porCobrar: [{ persona: 'Cata', monto: 21333, pagado: true, tipo: 'persona', montoRecibido: 21333, linkedTxId: null }, { persona: 'Fran', monto: 21333, pagado: true, tipo: 'persona', montoRecibido: 21333, linkedTxId: 't72' }], reglaAuto: false, nota: 'Cumpleaños Cata' },
        { id: 't6', fecha: '2026-08-25', hora: '07:50', comercio: 'Sueldo Agosto', monto: 1250000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1250000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't7', fecha: '2026-08-24', hora: '19:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't8', fecha: '2026-08-23', hora: '12:30', comercio: 'Farmacias Ahumada', monto: 15200, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 15200 }], porCobrar: [{ persona: 'Isapre', monto: null, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null }], reglaAuto: false, nota: 'Espero reembolso de la isapre' },
        { id: 't9', fecha: '2026-08-22', hora: '10:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't70', fecha: '2026-08-16', hora: '11:40', comercio: 'Retiro parcial Buda', monto: -20000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'buda', monto: -20000 }], porCobrar: [], reglaAuto: false, nota: 'Retiro' },
        { id: 't71', fecha: '2026-07-20', hora: '10:00', comercio: 'Reembolso Isapre', monto: 7500, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' },
        // Fran te transfirió su parte de Restobar Lastarria (t5) — un depósito real, vinculado a ese
        // pendiente tipo 'persona'. Esa plata NO debe sumar en "Ingresos": ya se descontó de "Gastos"
        // al dividir la cuenta, así que contarla de nuevo acá la duplicaría a tu favor.
        { id: 't72', fecha: '2026-08-27', hora: '10:15', comercio: 'Transferencia de Fran', monto: 21333, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: 'Su parte de la cena en Restobar Lastarria' },
        { id: 't10', fecha: '2026-08-21', hora: '18:22', comercio: 'Cine Hoyts Costanera', monto: 12000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'entretenimiento', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't11', fecha: '2026-08-20', hora: '09:00', comercio: 'Freelance diseño web', monto: 180000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 180000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't30', fecha: '2026-08-28', hora: '19:45', comercio: 'Compra Transbank *8842', monto: 12500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'pendiente', categorias: [], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't31', fecha: '2026-08-10', hora: '16:20', comercio: 'Falabella · Notebook', monto: 90000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 90000 }], porCobrar: [], reglaAuto: false, nota: '', cuotas: { total: 3 } },
        { id: 't32', fecha: '2026-08-07', hora: '13:30', comercio: 'Sushi Bar Vitacura', monto: 36000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'restoranes', monto: 36000 }], porCobrar: [{ persona: 'Pancho', monto: 18000, pagado: true, tipo: 'persona', montoRecibido: 18000, linkedTxId: null }], reglaAuto: false, nota: '' },
        { id: 't12', fecha: '2026-08-18', hora: '11:00', comercio: 'Líder Express', monto: 23800, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 23800 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't13', fecha: '2026-08-15', hora: '14:10', comercio: 'Transferencia entre mis cuentas', monto: 200000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'variable', estado: 'no_es_gasto', categorias: [], porCobrar: [], reglaAuto: false, nota: 'Traspaso, no es un gasto real' },
        { id: 't14', fecha: '2026-08-12', hora: '08:40', comercio: 'Copec Providencia', monto: 19500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 19500 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't15', fecha: '2026-08-05', hora: '10:00', comercio: 'Arriendo Depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't16', fecha: '2026-08-01', hora: '09:00', comercio: 'Aporte Racional', monto: 60000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'racional', monto: 60000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't17', fecha: '2026-07-31', hora: '10:00', comercio: 'Aporte Banco de Chile', monto: 50000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'banco_chile', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't18', fecha: '2026-07-28', hora: '09:00', comercio: 'Sueldo Julio', monto: 1250000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1250000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't19', fecha: '2026-07-26', hora: '20:00', comercio: 'Jumbo Ñuñoa', monto: 52000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 52000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't20', fecha: '2026-07-24', hora: '13:00', comercio: 'Copec Las Condes', monto: 21000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 21000 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't21', fecha: '2026-07-20', hora: '19:30', comercio: 'Rappi Delivery', monto: 14500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 14500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't22', fecha: '2026-07-18', hora: '09:00', comercio: 'Freelance diseño web', monto: 150000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 150000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't23', fecha: '2026-07-15', hora: '11:00', comercio: 'Farmacias Cruz Verde', monto: 9800, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'por_cobrar', categorias: [{ cat: 'salud', monto: 9800 }], porCobrar: [{ persona: 'Seguro complementario', monto: 8000, pagado: true, tipo: 'reembolso', montoRecibido: 7500, linkedTxId: 't71' }], reglaAuto: false, nota: '' },
        { id: 't24', fecha: '2026-07-14', hora: '18:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't25', fecha: '2026-07-10', hora: '10:00', comercio: 'Arriendo Depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: true, nota: '' },
        { id: 't26', fecha: '2026-07-08', hora: '12:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't27', fecha: '2026-07-05', hora: '21:00', comercio: 'Cine Hoyts Costanera', monto: 12000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'entretenimiento', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't28', fecha: '2026-07-03', hora: '10:00', comercio: 'Aporte Buda', monto: 40000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'buda', monto: 40000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't29', fecha: '2026-07-02', hora: '08:20', comercio: 'Uber', monto: 5400, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 5400 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't33', fecha: '2026-06-25', hora: '07:50', comercio: 'Sueldo Junio', monto: 1220000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1220000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't34', fecha: '2026-06-18', hora: '09:00', comercio: 'Freelance diseño web', monto: 90000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 90000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't35', fecha: '2026-06-20', hora: '19:10', comercio: 'Jumbo Ñuñoa', monto: 48000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 48000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't36', fecha: '2026-06-22', hora: '13:05', comercio: 'Copec Las Condes', monto: 20500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 20500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't37', fecha: '2026-06-14', hora: '19:40', comercio: 'Rappi Delivery', monto: 16000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 16000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't38', fecha: '2026-06-10', hora: '10:00', comercio: 'Arriendo Depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't39', fecha: '2026-06-12', hora: '18:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't40', fecha: '2026-06-08', hora: '11:20', comercio: 'Farmacias Cruz Verde', monto: 11200, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'salud', monto: 11200 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't41', fecha: '2026-06-06', hora: '21:00', comercio: 'Cine Hoyts Costanera', monto: 12000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'entretenimiento', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't42', fecha: '2026-06-05', hora: '10:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't43', fecha: '2026-06-03', hora: '10:00', comercio: 'Aporte Racional', monto: 50000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'racional', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't44', fecha: '2026-06-02', hora: '10:00', comercio: 'Aporte Banco de Chile', monto: 40000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'banco_chile', monto: 40000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't45', fecha: '2026-05-25', hora: '07:50', comercio: 'Sueldo Mayo', monto: 1200000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1200000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't46', fecha: '2026-05-16', hora: '09:00', comercio: 'Freelance diseño web', monto: 60000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'pololos_extra', monto: 60000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't47', fecha: '2026-05-19', hora: '19:30', comercio: 'Jumbo Ñuñoa', monto: 50500, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 50500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't48', fecha: '2026-05-21', hora: '08:10', comercio: 'Copec Providencia', monto: 19000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 19000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't49', fecha: '2026-05-11', hora: '20:45', comercio: 'Uber', monto: 5800, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 5800 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't50', fecha: '2026-05-09', hora: '19:15', comercio: 'Rappi Delivery', monto: 13200, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 13200 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't51', fecha: '2026-05-10', hora: '10:00', comercio: 'Arriendo Depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't52', fecha: '2026-05-12', hora: '18:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't53', fecha: '2026-05-07', hora: '12:30', comercio: 'Farmacias Ahumada', monto: 13500, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'salud', monto: 13500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't54', fecha: '2026-05-04', hora: '21:00', comercio: 'Cine Hoyts Costanera', monto: 12000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'entretenimiento', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't55', fecha: '2026-05-05', hora: '10:00', comercio: 'Aporte Fintual', monto: 100000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 100000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't56', fecha: '2026-05-03', hora: '10:00', comercio: 'Aporte Racional', monto: 50000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'racional', monto: 50000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't57', fecha: '2026-05-02', hora: '10:00', comercio: 'Aporte Banco de Chile', monto: 30000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'banco_chile', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't58', fecha: '2026-04-25', hora: '07:50', comercio: 'Sueldo Abril', monto: 1200000, medio: 'cuenta_vista', tipo: 'ingreso', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'sueldo', monto: 1200000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't59', fecha: '2026-04-14', hora: '12:00', comercio: 'Venta bicicleta', monto: 40000, medio: 'efectivo', tipo: 'ingreso', recurrencia: 'variable', estado: 'confirmado', categorias: [], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't60', fecha: '2026-04-20', hora: '19:20', comercio: 'Jumbo Ñuñoa', monto: 46000, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'supermercado', monto: 46000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't61', fecha: '2026-04-22', hora: '13:00', comercio: 'Copec Las Condes', monto: 18500, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'transporte', monto: 18500 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't62', fecha: '2026-04-08', hora: '19:00', comercio: 'Rappi Delivery', monto: 11000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'restoranes', monto: 11000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't63', fecha: '2026-04-10', hora: '10:00', comercio: 'Arriendo Depto', monto: 380000, medio: 'cuenta_vista', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'hogar', monto: 380000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't64', fecha: '2026-04-12', hora: '18:00', comercio: 'Netflix', monto: 7990, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'suscripciones', monto: 7990 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't65', fecha: '2026-04-06', hora: '11:00', comercio: 'Farmacias Cruz Verde', monto: 8900, medio: 'debito_bci', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'salud', monto: 8900 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't66', fecha: '2026-04-03', hora: '21:00', comercio: 'Cine Hoyts Costanera', monto: 12000, medio: 'visa_bch', tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado', categorias: [{ cat: 'entretenimiento', monto: 12000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't67', fecha: '2026-04-05', hora: '10:00', comercio: 'Aporte Fintual', monto: 80000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'fintual', monto: 80000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't68', fecha: '2026-04-03', hora: '10:00', comercio: 'Aporte Racional', monto: 40000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'racional', monto: 40000 }], porCobrar: [], reglaAuto: false, nota: '' },
        { id: 't69', fecha: '2026-04-02', hora: '10:00', comercio: 'Aporte Banco de Chile', monto: 30000, medio: 'cuenta_vista', tipo: 'inversion', recurrencia: 'mensual', estado: 'confirmado', categorias: [{ cat: 'banco_chile', monto: 30000 }], porCobrar: [], reglaAuto: false, nota: '' }
    ];
    // Ahora que TX y METAS_INVERSION ya existen, se puede calcular el default real
    // (ingresos − gastos del mes actual, y el % por meta que cubre su aporte mensual meta).
    let PLANIFICADOR = getPlanificadorDefaults();
    const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    const MONTH_LABEL = { '2026-04': 'Abril 2026', '2026-05': 'Mayo 2026', '2026-06': 'Junio 2026', '2026-07': 'Julio 2026', '2026-08': 'Agosto 2026' };
    const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    // El índice del mes REAL de hoy dentro de MONTHS — nunca "el último mes del arreglo", porque
    // las cuotas de tarjeta (regenerateCuotasFor) empujan meses futuros hacia adelante en MONTHS
    // (si compraste algo en 6 cuotas este mes, MONTHS se extiende varios meses hacia el futuro), y
    // por eso Balance/Presupuesto deben abrir siempre en el mes de hoy, no en ese mes futuro.
    function currentMonthIndex() {
        const ym = todayISO().slice(0, 7);
        if (!MONTHS.includes(ym)) {
            MONTHS.push(ym);
            MONTHS.sort();
            if (!MONTH_LABEL[ym])
                MONTH_LABEL[ym] = monthLabelFor(ym);
        }
        return MONTHS.indexOf(ym);
    }
    const fmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
    // En Modo demo, cualquier monto mostrado (no editable) se enmascara acá mismo — un solo
    // punto de cambio que cubre toda la app sin tocar cada vista una por una.
    function money(n) { return state.demoMode ? '$••••••' : fmt.format(Math.round(n)); }
    function moneyPlain(n) { return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(Math.round(n)); }
    // moneyPlain() por sí sola NO se enmascara (la usan también los inputs editables, que deben
    // seguir mostrando el número real mientras se completan) — para texto de solo lectura que use
    // el formato "plain" (sin "$"), como el centro del donut o las etiquetas de un gráfico, hay que
    // pasar por acá en vez de moneyPlain() directo.
    function moneyPlainMasked(n) { return state.demoMode ? '••••••' : moneyPlain(n); }
    // Formato abreviado ("$1,2M", "$45K") para las etiquetas del eje Y del gráfico de inversiones
    // -- son valores "aprox" a propósito, no cada peso exacto, así que no tiene sentido mostrar el
    // monto completo ahí. Coma como separador decimal, como el resto del formato chileno de la app.
    function moneyShort(n) {
        const abs = Math.abs(Math.round(n));
        const sign = n < 0 ? '−' : '';
        if (abs >= 1000000)
            return sign + '$' + (abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace('.', ',') + 'M';
        if (abs >= 1000)
            return sign + '$' + Math.round(abs / 1000) + 'K';
        return sign + '$' + abs;
    }
    // Nombre corto de un mes (1=enero ... 12=diciembre), reusando MESES_LARGO en vez de mantener
    // otra lista de nombres aparte.
    function monthAbbr(monthNum1based) {
        const s = MESES_LARGO[monthNum1based - 1];
        return s.charAt(0).toUpperCase() + s.slice(1, 3);
    }
    /* ===================== STATE ===================== */
    const state = {
        tab: 'transacciones', // transacciones | resumen | menu
        resumenSub: 'balance', // balance | presupuesto | evolucion | inversiones
        filter: 'todas', // todas | entradas | porcobrar | pendientes
        categoryFilter: null, // cat id or null
        categoryFilterMonth: null, // 'YYYY-MM' or null, set together with categoryFilter from a Balance drill-down
        monthIndex: currentMonthIndex(),
        openTxId: null,
        creatingNew: false,
        draftTx: null,
        splitCatMode: {}, // per tx id: bool
        splitCatUnit: {}, // per tx id: '%'|'$'
        splitCobroMode: {},
        splitCobroUnit: {},
        categoryEditMode: {}, // per tx id: bool — true mientras se está reeligiendo la categoría
        searchQuery: '', // texto libre para buscar por comercio en Transacciones
        advFilters: { cats: [], medios: [], dateFrom: '', dateTo: '' },
        filterSheetOpen: false,
        addingMedio: false, // true mientras se muestra el mini-formulario "agregar tarjeta"
        newMedioDraft: { nombre: '', ultimos4: '' },
        editingBudgetCat: null, // catId en edición inline, o null
        budgetDraft: { meta: '', alertas: { 80: true, 90: true, 100: true } },
        editingBudgetTotal: false,
        budgetTotalDraft: '',
        editingMetasGasto: false,
        metasGastoDraft: { fijo: '', variable: '' },
        editingDatosTransferencia: false,
        datosTransferenciaDraft: { nombre: '', rut: '', banco: '', tipoCuenta: '', numeroCuenta: '', email: '' },
        editingMetaId: null, // id de meta en edición, o 'nueva', o null
        metaDraft: { nombre: '', montoObjetivo: '', aporteMensualMeta: '', plazo: '', comision: '' },
        addMetaPlataformaId: null, // plataforma a la que quedará asociada una meta nueva
        evoSelectedMonth: null, // mes tocado en el gráfico de Evolución, o null (= último mes)
        platformAbierta: null, // id de la plataforma con el acordeón desplegado en Inversiones, o null (todas cerradas)
        editingPlatformId: null, // id de plataforma en edición ("actualizar valor"), o null
        platformDraft: { valor: '', tasaAnual: '', comision: '', plazo: '' },
        creatingPlatform: false, // true mientras se muestra el formulario de "nueva plataforma"
        confirmDeletePlatformId: null, // id de la plataforma para la que se está mostrando "¿seguro?" antes de eliminarla de verdad
        confirmArchivePlatformId: null, // mismo "¿seguro?" pero para "cerrar" una plataforma (reversible, pero igual se pregunta)
        newPlatformDraft: { nombre: '', icon: 'bank', color: 'butter', valor: '', plazo: '' },
        // Monto mensual que la usuaria escribió a mano en el simulador de Inversiones, reemplazando
        // el promedio real de sus últimos 3 meses -- null mientras no lo toque (usa el promedio).
        proySimulatedAporte: null,
        resumenSubOrder: ['balance', 'presupuesto', 'evolucion', 'inversiones'], // orden de sub-tabs de Resumen, reordenable con drag and drop
        subtabDragId: null, // id de la sub-tab que se está arrastrando ahora mismo, o null
        // ---- Menú ----
        menuSection: null, // null | 'categorias' | 'medios' | 'reglas' | 'exportar' | 'respaldo' | 'importar' | 'demo' | 'asesoria' | 'cuenta' | 'importarcorreo' | 'notificaciones'
        importCorreoLoaded: false, // si ya se cargó el código de importación al menos una vez
        importCorreoLoading: false,
        importCorreoError: null,
        importToken: null, // código de importación del hogar (households.import_token), para el Apps Script y el Worker de push
        // ---- Notificaciones push (nueva transacción importada, alerta de presupuesto) ----
        notifLoaded: false, // si ya se revisó el estado de la suscripción de este navegador al menos una vez
        notifLoading: false,
        notifError: null,
        notifSubscribed: false, // si ESTE navegador ya tiene una suscripción push guardada
        notifBusy: false, // activando/desactivando ahora mismo (deshabilita el botón)
        notifTestBusy: false, // mandando el aviso de prueba ahora mismo
        notifTestResult: null, // texto con el resultado real del Worker (a diferencia de enviarPushHogar, este SÍ espera la respuesta)
        confirmDeleteTxId: null, // id de la transacción para la que se está mostrando "¿seguro que quieres borrarla?"
        sueldoBannerDescartadoMes: null, // 'YYYY-MM' del mes en que se apretó "Todavía no" en la sugerencia de sueldo
        editingCatId: null, // catId en edición, 'nueva', o null
        catDraft: { nombre: '', tipo: 'gasto', color: 'sage', icon: 'more' },
        editingMedioId: null, // medioId en edición, 'nueva', o null (distinto del mini-form dentro de la hoja de nueva transacción)
        medioDraft: { nombre: '', corto: '', icon: 'card' },
        demoMode: false,
        importSummary: null, // resultado del último CSV importado, para mostrarlo en pantalla
        reconciliar: {
            archivo: null, // nombre del PDF leído
            cargando: false,
            error: null,
            tipo: null, // 'cuenta_corriente' | 'tarjeta_nacional'
            movimientos: [], // [{fecha,detalle,monto,tipoMov,esEspecial,yaRegistrada,idSugerido}]
            pagosTarjeta: null, // resumen aparte para las filas "CARGO POR PAGO TC"
            disponibles: [], // cartolas que llegaron solas por correo, todavía sin usar
            usandoId: null, // id de la que se está por abrir (pidiendo la clave), o null
            passwordDraft: '',
            errorPassword: null,
            archivoBuffer: null, // ArrayBuffer de un PDF elegido a mano que pidió clave, mientras se espera que la escriba
            archivoNombrePendiente: null // nombre de ese archivo, o null si no hay ninguno pendiente de clave
        },
        // ---- Cobros y reembolsos pendientes (vincular un depósito a un pendiente, o viceversa) ----
        linkFlow: null, // null | {mode:'fromPendiente', gastoTxId, idx} | {mode:'fromIngreso', ingresoTxId}
        // ---- Dividir boleta (simulado: sin OCR ni link real) ----
        boleta: null // null cuando el asistente está cerrado, o {step, gastoTxId, comercio, items, asign} —
        // siempre asociado a una transacción ya existente marcada "por cobrar"
    };
    let subtabDrag = null; // bookkeeping transitorio del drag (no es parte de state: no se pinta directo)
    let suppressNextSubtabClick = false;
    // Antes de conectar la cuenta real esto devolvía una fecha fija ('2026-08-28', el "hoy" de
    // la maqueta de demostración) — con datos reales de verdad tiene que ser el día de hoy.
    function todayISO() {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
    }
    function normalize(s) {
        return (s || '').toString().toLowerCase().normalize('NFD').replace(new RegExp('[̀-ͯ]', 'g'), '');
    }
    /* ===================== HELPERS ===================== */
    function txsOfMonth(m) { return TX.filter(t => t.fecha.slice(0, 7) === m); }
    function catInfo(id) { return CATS[id] || { nombre: 'Sin categoría', color: 'neutral', icon: 'more', tipo: 'gasto' }; }
    // Tu sueldo no manda correo (a diferencia de una compra con tarjeta), así que nunca se
    // importa solo — esto detecta que ya pasó a un mes nuevo sin que hayas registrado un
    // ingreso con categoría "sueldo" todavía, para sugerírtelo con el monto de la última vez
    // como referencia (la confirmas o la ajustas, nunca se agrega sola sin que la veas).
    function lastSueldoTx() {
        const candidatos = TX.filter(t => t.categorias.some(c => c.cat === 'sueldo')).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
        return candidatos[0] || null;
    }
    function mesActualTieneSueldo() {
        return txsOfMonth(todayISO().slice(0, 7)).some(t => t.categorias.some(c => c.cat === 'sueldo'));
    }
    // Etiqueta liviana de plazo para metas y plataformas — no reestructura nada, solo te
    // deja ver de un vistazo qué es corto/medio/largo plazo dentro de la misma organización
    // por plataforma que ya tenemos.
    const PLAZO_META = {
        corto: { label: 'Corto', color: 'sky' },
        medio: { label: 'Medio', color: 'sage' },
        largo: { label: 'Largo', color: 'lavender' }
    };
    function plazoChip(plazo) {
        if (!plazo || !PLAZO_META[plazo])
            return '';
        const p = PLAZO_META[plazo];
        return '<span class="plazo-chip" style="background:var(--cat-' + p.color + '-fill);color:var(--cat-' + p.color + '-ink);">' + p.label + '</span>';
    }
    // Si una transacción quedó apuntando a un medio que ya no existe (o nunca tuvo uno, ej. datos
    // viejos de antes de que el campo fuera obligatorio), antes esto devolvía un objeto sin
    // "corto" — y como el texto de la fila se arma con medio.corto directo, JS lo mostraba
    // literalmente como la palabra "undefined" en vez de algo legible.
    function medioInfo(id) { return MEDIOS[id] || { nombre: 'Medio desconocido', corto: 'Sin medio', icon: 'card' }; }
    // Ícono chico junto a los últimos dígitos del medio de pago en la lista de Transacciones —
    // tarjeta si es tarjeta, bolsa de plata si es efectivo. Los demás medios (cuenta vista, etc.)
    // se quedan sin ícono acá, tal como están hoy.
    function medioTagIcon(medio) {
        if (medio.icon === 'card')
            return '💳';
        if (medio.icon === 'cash')
            return '💰';
        return '';
    }
    function catTotalMonto(t) { return t.categorias.reduce((s, c) => s + c.monto, 0); }
    // Un pendiente (por cobrar de una persona, o reembolso de un gasto) puede no tener monto
    // esperado todavía (reembolsos: no siempre sabes cuánto te van a devolver hasta que llega).
    // Mientras no esté pagado, cuenta como "monto esperado" (0 si no se sabe todavía — o sea,
    // sigue siendo tu parte del gasto hasta que se resuelva). Una vez pagado/vinculado a un
    // depósito real, manda el monto que efectivamente llegó (montoRecibido), no el estimado.
    function pendienteMontoEfectivo(p) {
        if (p.pagado)
            return p.montoRecibido != null ? p.montoRecibido : (p.monto || 0);
        return p.monto != null ? p.monto : 0;
    }
    function porCobrarTotal(t) { return t.porCobrar.reduce((s, p) => s + pendienteMontoEfectivo(p), 0); }
    // ---- Neteo de cuentas por cobrar (splits con amigos) vs. reembolsos ----
    //
    // Dos casos que se ven parecidos pero se contabilizan distinto:
    //  · tipo 'persona' (dividiste una boleta, alguien te debe su parte): esa plata NUNCA fue tu
    //    gasto — solo la adelantaste. Se descuenta de "Gastos" DESDE que la divides (no cuando te
    //    pagan), y en el mismo mes de la transacción original. Cuando te pagan, solo se salda la
    //    cuenta por cobrar: no vuelve a entrar como ingreso ni se resta de nuevo del gasto.
    //  · tipo 'reembolso' (isapre, seguro, tu empresa): ese gasto SÍ fue 100% tuyo — el reembolso
    //    es plata que vuelve después, y se muestra como crédito en el mes en que llega (tarjeta
    //    "Reembolsado este mes"), sin tocar el mes original.
    // Como el neteo ocurre al dividir (no al recibir el depósito), un mes ya cerrado no cambia
    // por un reembolso o pago que llega después — solo cambia si tú editas esa transacción vieja.
    function gastoNetoTx(t) {
        if (t.tipo !== 'gasto')
            return catTotalMonto(t);
        const personaSplits = (t.porCobrar || []).filter(p => p.tipo === 'persona').reduce((s, p) => s + (p.monto || 0), 0);
        return Math.max(catTotalMonto(t) - personaSplits, 0);
    }
    // Factor para repartir el neteo proporcionalmente si el gasto está dividido en categorías.
    function gastoNetoFactor(t) {
        const bruto = catTotalMonto(t);
        return bruto > 0 ? gastoNetoTx(t) / bruto : 1;
    }
    function catMontoNeto(t, c) {
        if (t.tipo !== 'gasto')
            return c.monto;
        return c.monto * gastoNetoFactor(t);
    }
    // Un ingreso que en realidad es solo el pago de un amigo devolviéndote su parte (vinculado a
    // un pendiente tipo 'persona') no es plata nueva — ya se descontó del gasto al dividir, así
    // que no debe volver a sumar como "Ingresos" o se contaría dos veces a tu favor.
    function ingresoEsSaldoDePersona(t) {
        if (t.tipo !== 'ingreso')
            return false;
        const vinculo = pendienteVinculadaA(t.id);
        if (!vinculo)
            return false;
        const gastoTx = getTx(vinculo.gastoTxId);
        const p = gastoTx && gastoTx.porCobrar[vinculo.idx];
        return !!(p && p.tipo === 'persona');
    }
    function ingresoNetoTx(t) {
        if (t.tipo !== 'ingreso')
            return catTotalMonto(t);
        return ingresoEsSaldoDePersona(t) ? 0 : catTotalMonto(t);
    }
    // El monto "de verdad tuyo" de una transacción para agregados de Balance/Presupuesto/Evolución
    // — reemplaza a catTotalMonto(t) en esos cálculos (nunca en la vista de la transacción misma,
    // que sigue mostrando el monto real completo que pagaste o recibiste).
    function montoAgregadoTx(t) {
        if (t.tipo === 'gasto')
            return gastoNetoTx(t);
        if (t.tipo === 'ingreso')
            return ingresoNetoTx(t);
        return catTotalMonto(t);
    }
    // Todos los pendientes (persona o reembolso) de todas las transacciones que todavía no
    // están pagados — para el flujo "vincular un depósito" desde el lado del ingreso.
    function pendientesGlobales() {
        const out = [];
        TX.forEach(t => {
            (t.porCobrar || []).forEach((p, idx) => {
                if (!p.pagado)
                    out.push({ gastoTxId: t.id, idx, comercio: t.comercio, fecha: t.fecha, persona: p.persona, monto: p.monto, tipo: p.tipo || 'persona' });
            });
        });
        return out.sort((a, b) => b.fecha.localeCompare(a.fecha));
    }
    // Si este ingreso ya está vinculado a algún pendiente, lo encuentra (para poder mostrarlo
    // y ofrecer "quitar vínculo" desde el detalle del ingreso).
    function pendienteVinculadaA(ingresoTxId) {
        for (const t of TX) {
            for (let idx = 0; idx < (t.porCobrar || []).length; idx++) {
                if (t.porCobrar[idx].linkedTxId === ingresoTxId)
                    return { gastoTxId: t.id, idx, comercio: t.comercio, persona: t.porCobrar[idx].persona };
            }
        }
        return null;
    }
    function resolvePendiente(gastoTxId, idx, ingresoTxId) {
        const gastoTx = getTx(gastoTxId), ingresoTx = getTx(ingresoTxId);
        if (!gastoTx || !ingresoTx || !gastoTx.porCobrar[idx])
            return false;
        const p = gastoTx.porCobrar[idx];
        p.pagado = true;
        p.montoRecibido = ingresoTx.monto;
        p.linkedTxId = ingresoTx.id;
        return true;
    }
    // Convierte una cuenta por cobrar (tipo 'persona') que nunca te pagaron en un gasto real del
    // MES ACTUAL — se crea una transacción nueva (no se edita la original, que ya cerró su mes con
    // el neteo aplicado) y se quita el pendiente de la transacción original.
    function darPorPerdida(gastoTxId, idx) {
        const gastoTx = getTx(gastoTxId);
        if (!gastoTx || !gastoTx.porCobrar[idx])
            return false;
        const p = gastoTx.porCobrar[idx];
        if (p.pagado || p.tipo !== 'persona')
            return false;
        const monto = Math.round(p.monto || 0);
        if (monto <= 0) {
            gastoTx.porCobrar.splice(idx, 1);
            return true;
        }
        // Antes caía en una categoría "otros_gastos" fija que ya no existe en el set de categorías
        // por defecto — si la transacción original no tenía categoría, esta tampoco: queda "Sin
        // categoría" (mismo estado ya soportado en el resto de la app, con su chip para asignarle una).
        const catId = gastoTx.categorias[0] ? gastoTx.categorias[0].cat : null;
        const nuevaTx = {
            id: 'perdida-' + Date.now(), fecha: todayISO(), hora: '12:00',
            comercio: (p.persona || 'Cuenta por cobrar') + ' — nunca pagó',
            monto, medio: gastoTx.medio, tipo: 'gasto', recurrencia: 'variable', estado: 'confirmado',
            categorias: catId ? [{ cat: catId, monto }] : [], porCobrar: [], reglaAuto: false,
            nota: 'Dada por perdida: ' + (p.persona || 'esta persona') + ' nunca pagó su parte de "' + gastoTx.comercio + '" (' + dayLabel(gastoTx.fecha) + ').'
        };
        TX.push(nuevaTx);
        ensureMonthExists(nuevaTx.fecha.slice(0, 7));
        gastoTx.porCobrar.splice(idx, 1);
        return true;
    }
    // Cuánto te reembolsaron en un mes dado — se cuenta en el mes en que llegó el depósito
    // (no en el mes del gasto original), porque es cuando esa plata realmente volvió a tu bolsillo.
    function monthlyReembolsoTotal(monthKey) {
        let total = 0, count = 0;
        TX.forEach(t => {
            (t.porCobrar || []).forEach(p => {
                if (p.tipo === 'reembolso' && p.pagado && p.linkedTxId) {
                    const ingresoTx = getTx(p.linkedTxId);
                    if (ingresoTx && ingresoTx.fecha.slice(0, 7) === monthKey) {
                        total += (p.montoRecibido != null ? p.montoRecibido : 0);
                        count++;
                    }
                }
            });
        });
        return { total, count };
    }
    function dayLabel(fecha) {
        const d = new Date(fecha + 'T00:00:00');
        const today = new Date(todayISO() + 'T00:00:00');
        const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
        if (diff === 0)
            return 'Hoy';
        if (diff === 1)
            return 'Ayer';
        const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        return dias[d.getDay()] + ' ' + d.getDate() + ' de ' + meses[d.getMonth()];
    }
    // Deja solo la primera letra en mayúscula ("miércoles 12 de agosto" -> "Miércoles 12 de
    // agosto") — se usa nada más en el encabezado de fecha de Transacciones; el resto de los usos
    // de dayLabel() (el detalle de una transacción, por ejemplo) se quedan tal cual, en minúscula.
    function capitalizeFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function applyLockRule(tx) {
        // Simula la regla: futuras (y existentes) transacciones del mismo comercio heredan categoría/tipo/recurrencia
        // (incluyendo si quedan como "fijo" — ver bloque Fijo/Variable/Inversión en Balance).
        const cat = tx.categorias[0] ? tx.categorias[0].cat : null;
        TX.forEach(t => {
            if (t.comercio === tx.comercio && t.id !== tx.id) {
                t.reglaAuto = true;
                t.tipo = tx.tipo;
                t.recurrencia = tx.recurrencia;
                if (cat)
                    t.categorias = [{ cat, monto: catTotalMonto(t) || t.monto }];
            }
        });
        tx.reglaAuto = true;
    }
    function allCobrado(t) {
        return t.porCobrar.length > 0 && t.porCobrar.every(p => p.pagado);
    }
    // 'persona' (dividiste una boleta con alguien) y 'reembolso' (isapre/seguro/empresa) se ven
    // parecidos pero son casos distintos — esto permite filtrarlos y mostrarlos por separado.
    function tienePorCobrarTipo(t, tipo) {
        return (t.porCobrar || []).some(p => p.tipo === tipo);
    }
    /* ----- expresiones tipo Tricount: "22000-5000", "64000/2", etc. ----- */
    function safeEvalExpr(raw) {
        const cleaned = String(raw).replace(/,/g, '.').replace(/\s+/g, '');
        if (cleaned === '' || !/^[0-9+\-*/().]*$/.test(cleaned))
            return null;
        let pos = 0;
        function peek() { return cleaned[pos]; }
        function parseExpr() {
            let v = parseTerm();
            while (peek() === '+' || peek() === '-') {
                const op = peek();
                pos++;
                const rhs = parseTerm();
                v = op === '+' ? v + rhs : v - rhs;
            }
            return v;
        }
        function parseTerm() {
            let v = parseFactor();
            while (peek() === '*' || peek() === '/') {
                const op = peek();
                pos++;
                const rhs = parseFactor();
                v = op === '*' ? v * rhs : v / rhs;
            }
            return v;
        }
        function parseFactor() {
            if (peek() === '(') {
                pos++;
                const v = parseExpr();
                if (peek() === ')')
                    pos++;
                else
                    throw 0;
                return v;
            }
            if (peek() === '-') {
                pos++;
                return -parseFactor();
            }
            if (peek() === '+') {
                pos++;
                return parseFactor();
            }
            const start = pos;
            while (/[0-9.]/.test(peek() || ''))
                pos++;
            if (start === pos)
                throw 0;
            return parseFloat(cleaned.slice(start, pos));
        }
        try {
            const result = parseExpr();
            if (pos !== cleaned.length)
                return null;
            return isFinite(result) ? result : null;
        }
        catch (e) {
            return null;
        }
    }
    function formatEditableNumber(v) {
        const r = Math.round(v * 100) / 100;
        return (Math.abs(r - Math.round(r)) < 0.001) ? String(Math.round(r)) : String(r);
    }
    /* ----- meses (para proyecciones de cuotas) ----- */
    function monthAddStr(ym, n) {
        const [y, m] = ym.split('-').map(Number);
        const total = (y * 12 + (m - 1)) + n;
        const ny = Math.floor(total / 12), nm = (total % 12) + 1;
        return ny + '-' + String(nm).padStart(2, '0');
    }
    function monthLabelFor(ym) {
        const [y, m] = ym.split('-').map(Number);
        const nombre = MESES_LARGO[m - 1];
        return nombre.charAt(0).toUpperCase() + nombre.slice(1) + ' ' + y;
    }
    function ensureMonthExists(ym) {
        if (!MONTHS.includes(ym)) {
            MONTHS.push(ym);
            MONTHS.sort();
            MONTH_LABEL[ym] = monthLabelFor(ym);
        }
        state.monthIndex = Math.min(state.monthIndex, MONTHS.length - 1);
    }
    function fechaForCuota(rootFecha, monthsAhead) {
        const ym = monthAddStr(rootFecha.slice(0, 7), monthsAhead);
        const day = parseInt(rootFecha.slice(8, 10), 10);
        const [y, m] = ym.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return ym + '-' + String(Math.min(day, lastDay)).padStart(2, '0');
    }
    function regenerateCuotasFor(rootId) {
        TX = TX.filter(t => t.cuotaOf !== rootId);
        const root = getTx(rootId);
        if (root && root.cuotas && root.cuotas.total > 1) {
            for (let k = 2; k <= root.cuotas.total; k++) {
                const fecha = fechaForCuota(root.fecha, k - 1);
                ensureMonthExists(fecha.slice(0, 7));
                TX.push({
                    id: root.id + '-c' + k, fecha, hora: root.hora, comercio: root.comercio, monto: root.monto,
                    medio: root.medio, tipo: root.tipo, recurrencia: root.recurrencia, estado: 'confirmado',
                    categorias: root.categorias.map(c => ({ cat: c.cat, monto: c.monto })),
                    porCobrar: [], reglaAuto: false, nota: root.nota,
                    cuotaOf: root.id, cuotaNumero: k, cuotaTotal: root.cuotas.total, cuotaProyectada: true
                });
            }
        }
    }
    /* ===================== TOASTS ===================== */
    function toast(msg) {
        const stack = document.getElementById('toast-stack');
        const el = document.createElement('div');
        el.className = 'toast';
        el.innerHTML = icon('check') + '<span>' + msg + '</span>';
        stack.appendChild(el);
        requestAnimationFrame(() => el.classList.add('show'));
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2400);
    }
    /* ===================== TABBAR ===================== */
    function renderTabbar() {
        const tabs = [
            { id: 'transacciones', label: 'Transacciones', icon: 'transacciones' },
            { id: 'resumen', label: 'Resumen', icon: 'resumen' },
            { id: 'menu', label: 'Menú', icon: 'menu' }
        ];
        document.getElementById('tabbar').innerHTML = tabs.map(t => '<button class="tab ' + (state.tab === t.id ? 'active' : '') + '" data-tab="' + t.id + '">' + ICONS[t.icon] + '<span>' + t.label + '</span></button>').join('');
    }
    /* ===================== TRANSACCIONES VIEW ===================== */
    function filteredTx() {
        // La Vista 1 muestra todas las transacciones (no se filtra por mes, a diferencia de Balance),
        // salvo cuando se llega por un "drill-down" de categoría desde Balance (que sí trae mes).
        let list = TX.slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
        if (state.filter === 'entradas')
            list = list.filter(t => t.tipo === 'ingreso');
        else if (state.filter === 'porcobrar')
            list = list.filter(t => t.estado === 'por_cobrar' && tienePorCobrarTipo(t, 'persona') && !allCobrado(t));
        else if (state.filter === 'reembolso')
            list = list.filter(t => t.estado === 'por_cobrar' && tienePorCobrarTipo(t, 'reembolso') && !allCobrado(t));
        else if (state.filter === 'pendientes')
            list = list.filter(t => t.estado === 'pendiente');
        if (state.categoryFilter) {
            list = list.filter(t => t.categorias.some(c => c.cat === state.categoryFilter));
        }
        if (state.categoryFilterMonth) {
            list = list.filter(t => t.fecha.slice(0, 7) === state.categoryFilterMonth);
        }
        if (state.searchQuery.trim()) {
            const q = normalize(state.searchQuery);
            list = list.filter(t => normalize(t.comercio).includes(q));
        }
        const af = state.advFilters;
        if (af.cats.length) {
            list = list.filter(t => t.categorias.some(c => af.cats.includes(c.cat)) || (t.categorias.length === 0 && af.cats.includes('__sin_cat__')));
        }
        if (af.medios.length) {
            list = list.filter(t => af.medios.includes(t.medio));
        }
        if (af.dateFrom) {
            list = list.filter(t => t.fecha >= af.dateFrom);
        }
        if (af.dateTo) {
            list = list.filter(t => t.fecha <= af.dateTo);
        }
        return list;
    }
    function renderFilterSummary() {
        // Resumen agregado sobre TODAS las transacciones (todo el año), salvo que ya haya un
        // filtro de categoría/mes activo — en ese caso se calcula sobre ese mismo subconjunto.
        const base = state.categoryFilter ? filteredTx() : TX;
        if (state.filter === 'entradas') {
            const ingresos = base.filter(t => t.tipo === 'ingreso').reduce((s, t) => s + ingresoNetoTx(t), 0);
            const reembolsos = base.reduce((s, t) => s + t.porCobrar.filter(p => p.pagado && p.tipo === 'reembolso').reduce((ss, p) => ss + pendienteMontoEfectivo(p), 0), 0);
            return '<div class="stat-grid" style="grid-template-columns:1fr 1fr;margin-bottom:14px;">' +
                '<div class="card stat-tile stat-ingresos"><div class="stat-label">Ingresos</div><div class="stat-value tabular">' + money(ingresos) + '</div></div>' +
                '<div class="card stat-tile" style="background:var(--surface);border:1px solid var(--border);"><div class="stat-label">Reembolsos</div><div class="stat-value tabular">' + money(reembolsos) + '</div></div>' +
                '</div>';
        }
        if (state.filter === 'porcobrar') {
            const relevantes = base.filter(t => t.estado === 'por_cobrar' && tienePorCobrarTipo(t, 'persona'));
            const bruto = relevantes.reduce((s, t) => s + t.monto, 0);
            const pendiente = relevantes.reduce((s, t) => s + t.porCobrar.filter(p => p.tipo === 'persona' && !p.pagado).reduce((ss, p) => ss + p.monto, 0), 0);
            const saldado = relevantes.reduce((s, t) => s + t.porCobrar.filter(p => p.tipo === 'persona' && p.pagado).reduce((ss, p) => ss + p.monto, 0), 0);
            return '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">' +
                '<div class="card stat-tile" style="padding:11px 10px;background:var(--surface);border:1px solid var(--border);"><div class="stat-label" style="font-size:10.5px;">Salidas</div><div class="stat-value tabular" style="font-size:15px;">' + money(bruto) + '</div></div>' +
                '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--invest-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Por cobrar</div><div class="stat-value tabular" style="font-size:15px;color:var(--invest-ink);">' + money(pendiente) + '</div></div>' +
                '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--income-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Saldadas</div><div class="stat-value tabular" style="font-size:15px;color:var(--income-ink);">' + money(saldado) + '</div></div>' +
                '</div>';
        }
        if (state.filter === 'reembolso') {
            const relevantes = base.filter(t => t.estado === 'por_cobrar' && tienePorCobrarTipo(t, 'reembolso'));
            const bruto = relevantes.reduce((s, t) => s + t.monto, 0);
            const yaLlego = relevantes.reduce((s, t) => s + t.porCobrar.filter(p => p.tipo === 'reembolso' && p.pagado).reduce((ss, p) => ss + pendienteMontoEfectivo(p), 0), 0);
            const pendiente = relevantes.reduce((s, t) => s + t.porCobrar.filter(p => p.tipo === 'reembolso' && !p.pagado).reduce((ss, p) => ss + (p.monto || 0), 0), 0);
            return '<div class="stat-grid" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:14px;">' +
                '<div class="card stat-tile" style="padding:11px 10px;background:var(--surface);border:1px solid var(--border);"><div class="stat-label" style="font-size:10.5px;">Gasto original</div><div class="stat-value tabular" style="font-size:15px;">' + money(bruto) + '</div></div>' +
                '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--cat-mint-fill) 30%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Ya llegó</div><div class="stat-value tabular" style="font-size:15px;color:var(--cat-mint-ink);">' + money(yaLlego) + '</div></div>' +
                '<div class="card stat-tile" style="padding:11px 10px;background:color-mix(in srgb, var(--invest-fill) 16%, var(--surface));"><div class="stat-label" style="font-size:10.5px;">Pendiente</div><div class="stat-value tabular" style="font-size:15px;color:var(--invest-ink);">' + money(pendiente) + '</div></div>' +
                '</div>';
        }
        if (state.filter === 'pendientes') {
            const relevantes = base.filter(t => t.estado === 'pendiente');
            const total = relevantes.reduce((s, t) => s + t.monto, 0);
            return '<div class="card" style="padding:12px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;">' +
                '<span class="muted" style="font-size:12.5px;">' + relevantes.length + ' transacción' + (relevantes.length === 1 ? '' : 'es') + ' sin clasificar</span>' +
                '<span class="tabular" style="font-weight:500;font-size:14px;">' + money(total) + '</span>' +
                '</div>';
        }
        return '';
    }
    function renderTxItem(t) {
        const cats = t.categorias;
        const isUnclassified = cats.length === 0 && t.estado !== 'no_es_gasto';
        const primaryCat = cats[0] ? catInfo(cats[0].cat) : { nombre: 'Sin categoría', color: 'neutral', icon: isUnclassified ? 'question' : 'more' };
        const isMulti = cats.length > 1;
        const isIncome = t.tipo === 'ingreso';
        const isNoGasto = t.estado === 'no_es_gasto';
        const isCobrado = t.estado === 'por_cobrar' && allCobrado(t);
        let amountClass = 'neg';
        if (isIncome)
            amountClass = 'pos';
        if (isNoGasto)
            amountClass = 'muted-amt';
        let sign = isIncome ? '+' : (isNoGasto ? '' : '');
        let amtDisplay = sign + money(t.monto);
        let leftLabel;
        if (t.cuotaProyectada)
            leftLabel = 'Cuota ' + t.cuotaNumero + '/' + t.cuotaTotal;
        else if (isMulti)
            leftLabel = cats.length + ' categorías';
        else if (isUnclassified)
            leftLabel = 'Sin clasificar';
        else
            leftLabel = primaryCat.nombre;
        let stateTag = '';
        if (isCobrado)
            stateTag = '<span class="tx-state state-cobrado-inline">' + (tienePorCobrarTipo(t, 'reembolso') ? 'Reembolsado' : 'Cobrado') + '</span>';
        else if (t.estado === 'por_cobrar')
            stateTag = tienePorCobrarTipo(t, 'reembolso') ? '<span class="tx-state state-reembolso">Reembolso</span>' : '<span class="tx-state state-porcobrar">Por cobrar</span>';
        else if (t.estado === 'no_es_gasto')
            stateTag = '<span class="tx-state state-noesgasto">No es gasto</span>';
        const medio = medioInfo(t.medio);
        return '<button class="tx-item" data-tx="' + t.id + '">' +
            '<span class="tx-avatar" style="--fill:var(--cat-' + primaryCat.color + '-fill);--ink:var(--cat-' + primaryCat.color + '-ink)">' + catIconMarkup(primaryCat.icon) + '</span>' +
            '<span class="tx-info">' +
            '<span class="tx-name' + (isCobrado ? ' tachado' : '') + '">' + t.comercio + '</span>' +
            '<span class="tx-sub">' + (t.reglaAuto ? '<span class="lock-badge">' + ICONS.lockSmall + '</span>' : '') +
            '<span style="overflow:hidden;text-overflow:ellipsis;">' + leftLabel + '</span>' + stateTag +
            '</span>' +
            '</span>' +
            '<span class="tx-right">' +
            '<span class="tx-amount tabular ' + amountClass + '">' + amtDisplay + '</span>' +
            '<div class="tx-right-sub">' + (medioTagIcon(medio) ? '<span class="medio-tag-icon">' + medioTagIcon(medio) + '</span>' : '') + medio.corto + '</div>' +
            '</span>' +
            '</button>';
    }
    function advFilterCount() {
        const af = state.advFilters;
        return af.cats.length + af.medios.length + (af.dateFrom ? 1 : 0) + (af.dateTo ? 1 : 0);
    }
    function renderTxResultsInner() {
        const list = filteredTx();
        let groupsHtml = '';
        if (list.length === 0) {
            groupsHtml = '<div class="empty-state">' + ICONS.inbox + '<div>No hay transacciones que calcen con esta búsqueda o filtro.</div></div>';
        }
        else {
            const groups = [];
            let lastDay = null, curGroup = null;
            list.forEach(t => {
                if (t.fecha !== lastDay) {
                    curGroup = { fecha: t.fecha, items: [] };
                    groups.push(curGroup);
                    lastDay = t.fecha;
                }
                curGroup.items.push(t);
            });
            groupsHtml = groups.map(g => '<div class="day-group"><div class="day-label">' + capitalizeFirst(dayLabel(g.fecha)) + '</div><div class="tx-list">' +
                g.items.map(renderTxItem).join('') + '</div></div>').join('');
        }
        return renderFilterSummary() + groupsHtml;
    }
    // Re-renderiza sólo los resultados (no el buscador) para no perder el foco/cursor
    // mientras la persona sigue escribiendo en el buscador.
    function renderTxResultsOnly() {
        const el = document.getElementById('tx-results');
        if (el)
            el.innerHTML = renderTxResultsInner();
    }
    function renderTransaccionesView() {
        document.getElementById('header-title').textContent = 'Transacciones';
        const chips = [
            { id: 'todas', label: 'Todas' },
            { id: 'entradas', label: 'Entradas' },
            { id: 'porcobrar', label: 'Por cobrar' },
            { id: 'reembolso', label: 'Reembolso' },
            { id: 'pendientes', label: 'Pendientes' }
        ];
        let chipsHtml = chips.map(c => '<button class="chip ' + (state.filter === c.id ? 'active' : '') + '" data-filter="' + c.id + '">' + c.label + '</button>').join('');
        let filterPill = '';
        if (state.categoryFilter) {
            const pillLabel = catInfo(state.categoryFilter).nombre + (state.categoryFilterMonth ? ' · ' + MONTH_LABEL[state.categoryFilterMonth] : '');
            filterPill = '<button class="chip filter-active" data-clear-catfilter="1">' + pillLabel + ' ' + ICONS.close + '</button>';
        }
        const advCount = advFilterCount();
        const searchRow = '<div class="search-row">' +
            '<div class="search-field">' +
            '<span class="search-icon">' + ICONS.search + '</span>' +
            '<input type="text" class="search-input" id="tx-search-input" placeholder="Buscar por comercio, ej: uber" value="' + (state.searchQuery || '').replace(/"/g, '&quot;') + '">' +
            '<button class="search-clear" id="tx-search-clear" data-clear-search aria-label="Borrar búsqueda" ' + (state.searchQuery ? '' : 'hidden') + '>' + ICONS.close + '</button>' +
            '</div>' +
            '<button class="filter-open-btn' + (advCount ? ' active' : '') + '" data-open-filters aria-label="Filtros">' + ICONS.filterFunnel + (advCount ? '<span class="filter-badge">' + advCount + '</span>' : '') + '</button>' +
            '</div>';
        let sueldoBanner = '';
        if (state.filter === 'todas' && !state.categoryFilter && !state.searchQuery.trim()) {
            const ym = todayISO().slice(0, 7);
            const last = lastSueldoTx();
            if (last && !mesActualTieneSueldo() && state.sueldoBannerDescartadoMes !== ym) {
                sueldoBanner = '<div class="card sueldo-suggestion">' +
                    '<div class="sueldo-suggestion-title">¿Ya te llegó tu sueldo de ' + (MONTH_LABEL[ym] || ym) + '?</div>' +
                    '<div class="sueldo-suggestion-sub">Como no manda correo, no se agrega sola — la última vez fue ' + money(last.monto) + '.</div>' +
                    '<div class="sueldo-suggestion-actions">' +
                    '<button class="chip" data-dismiss-sueldo-suggestion>Todavía no</button>' +
                    '<button class="save-tx-btn" data-confirm-sueldo-suggestion="' + last.id + '">Confirmar o ajustar</button>' +
                    '</div>' +
                    '</div>';
            }
        }
        document.getElementById('view-root').innerHTML =
            searchRow +
                '<div class="chip-row">' + filterPill + chipsHtml + '</div>' +
                sueldoBanner +
                '<div id="tx-results">' + renderTxResultsInner() + '</div>' +
                '<div style="height:64px;"></div>';
    }
    // Abre la hoja de "nueva transacción" pre-llena con los datos de la última vez que se
    // registró el sueldo, para que la usuaria solo tenga que confirmar el monto (si no cambió)
    // o ajustarlo (si sí cambió) antes de guardar — nunca se guarda sola sin que la vea primero.
    function openSueldoSuggestionSheet(lastId) {
        const last = getTx(lastId);
        const ym = todayISO().slice(0, 7);
        const mesNombre = (MONTH_LABEL[ym] || '').split(' ')[0] || '';
        openNewTxSheet('ingreso');
        state.draftTx.comercio = mesNombre ? ('Sueldo ' + mesNombre) : 'Sueldo';
        state.draftTx.monto = last ? last.monto : 0;
        state.draftTx.medio = last ? last.medio : state.draftTx.medio;
        state.draftTx.recurrencia = 'mensual';
        state.draftTx.categorias = [{ cat: 'sueldo', monto: last ? last.monto : 0 }];
        renderSheet();
    }
    /* ===================== DONUT SVG ===================== */
    function buildDonut(segments, size, strokeW) {
        // segments: [{value, color, id, nombre}]
        const total = segments.reduce((s, x) => s + x.value, 0);
        const r = (size / 2) - strokeW / 2 - 2;
        const cx = size / 2, cy = size / 2;
        // 6° (antes 3°) -- un gap más ancho ayuda a distinguir dos segmentos vecinos que por
        // casualidad quedaron con el mismo color (ver categoriasConColor), sin lo cual se ven
        // como un solo bloque continuo.
        const gapDeg = segments.length > 1 ? 6 : 0;
        let startAngle = -90;
        let paths = '';
        if (total <= 0) {
            paths = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="' + strokeW + '"/>';
        }
        else if (segments.length === 1) {
            // Un solo segmento = 100% del círculo. Un arco SVG (comando "A") no puede dibujar la
            // vuelta completa: el punto de inicio y de término quedan en el mismo lugar, así que el
            // trazo se ve como un punto en vez de un anillo. Un <circle> completo sí lo dibuja bien.
            paths = '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + segments[0].color + '" stroke-width="' + strokeW + '"/>';
        }
        else {
            segments.forEach(seg => {
                const frac = seg.value / total;
                const sweep = frac * 360 - gapDeg;
                if (sweep <= 0) {
                    startAngle += frac * 360;
                    return;
                }
                const a0 = startAngle;
                const a1 = startAngle + sweep;
                const large = sweep > 180 ? 1 : 0;
                const p0 = polar(cx, cy, r, a0);
                const p1 = polar(cx, cy, r, a1);
                paths += '<path class="arc-seg" data-cat="' + seg.id + '" d="M ' + p0.x + ' ' + p0.y + ' A ' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x + ' ' + p1.y + '" fill="none" stroke="' + seg.color + '" stroke-width="' + strokeW + '" stroke-linecap="round"/>';
                startAngle += frac * 360;
            });
        }
        return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '">' + paths + '</svg>';
    }
    function polar(cx, cy, r, angleDeg) {
        const a = angleDeg * Math.PI / 180;
        return { x: (cx + r * Math.cos(a)).toFixed(2), y: (cy + r * Math.sin(a)).toFixed(2) };
    }
    function renderDonutBlock(titulo, subtitulo, tipo, monthTx) {
        const byCat = {};
        monthTx.filter(t => t.tipo === tipo && t.estado !== 'no_es_gasto').forEach(t => {
            if (tipo === 'ingreso' && ingresoEsSaldoDePersona(t))
                return; // no es plata nueva, solo salda un pendiente
            t.categorias.forEach(c => {
                const v = tipo === 'gasto' ? catMontoNeto(t, c) : c.monto;
                byCat[c.cat] = (byCat[c.cat] || 0) + v;
            });
        });
        const entries = Object.keys(byCat).map(id => ({ id, value: byCat[id], info: catInfo(id) }))
            .sort((a, b) => b.value - a.value);
        const total = entries.reduce((s, e) => s + e.value, 0);
        const segs = entries.map(e => ({ value: e.value, color: 'var(--cat-' + e.info.color + '-fill)', id: e.id, nombre: e.info.nombre }));
        const donutSvg = buildDonut(segs, 172, 24);
        const legend = entries.length === 0
            ? '<div class="empty-state" style="padding:14px 4px;">' + icon('inbox') + '<div>Sin movimientos este mes.</div></div>'
            : entries.map(e => {
                const pct = total > 0 ? Math.round((e.value / total) * 100) : 0;
                return '<button class="legend-row" data-cat="' + e.id + '">' +
                    '<span class="legend-dot" style="--fill:var(--cat-' + e.info.color + '-fill)"></span>' +
                    '<span class="legend-icon">' + catIconMarkup(e.info.icon) + '</span>' +
                    '<span class="legend-name">' + e.info.nombre + '</span>' +
                    '<span class="legend-pct">' + pct + '%</span>' +
                    '<span class="legend-value tabular">' + money(e.value) + '</span>' +
                    '</button>';
            }).join('');
        return '<div class="card donut-card">' +
            '<div class="donut-card-title">' + titulo + '</div>' +
            '<div class="donut-card-sub">' + subtitulo + '</div>' +
            '<div class="donut-row">' +
            '<div class="donut-svg-wrap">' + donutSvg +
            '<div class="donut-center"><span class="dc-total tabular">' + (total > 0 ? moneyPlainMasked(total) : '$0') + '</span><span class="dc-label">total</span></div>' +
            '</div>' +
            '<div class="donut-legend">' + legend + '</div>' +
            '</div>' +
            '</div>';
    }
    // ---- Metas de Fijo / Variable / Inversión (Resumen > Balance) ----
    // Fijo y Variable son % de tus ingresos que tú defines (editable en Presupuesto). Inversión
    // NO se define acá — sale sola de la suma de "aporte mensual meta" de tus metas en la
    // pestaña Inversiones, para que ambas vistas cuenten siempre la misma historia.
    function metaInversionMensualCLP() {
        return METAS_INVERSION.reduce((s, m) => s + (m.aporteMensualMeta || 0), 0);
    }
    // Ingreso de referencia para comparar tus metas — el mes actual si ya tiene ingresos
    // registrados; si no (recién empezando el mes), tu último sueldo conocido, más estable
    // que comparar contra $0.
    function ingresoMensualReferencia() {
        const ingresosMes = monthTotals(todayISO().slice(0, 7)).ingresos;
        if (ingresosMes > 0)
            return ingresosMes;
        const last = lastSueldoTx();
        return last ? last.monto : 0;
    }
    function metaInversionPct() {
        const ref = ingresoMensualReferencia();
        return ref > 0 ? (metaInversionMensualCLP() / ref) * 100 : 0;
    }
    function sumaMetasGastoPct() {
        return METAS_GASTO_PCT.fijo + METAS_GASTO_PCT.variable + metaInversionPct();
    }
    // Franjas de color alrededor de una meta: para Fijo/Variable menos es mejor (verde hasta la
    // meta, ámbar hasta un 30% por sobre ella, rojo más allá); para Inversión es al revés (más
    // es mejor).
    function zonasMeta(metaPct, masEsMejor) {
        if (masEsMejor)
            return [{ hasta: metaPct * 0.6, tono: 'bad' }, { hasta: metaPct, tono: 'ok' }, { hasta: 100, tono: 'good' }];
        return [{ hasta: metaPct, tono: 'good' }, { hasta: metaPct * 1.3, tono: 'ok' }, { hasta: 100, tono: 'bad' }];
    }
    function metaZoneRow(nombre, pct, monto, zones, sinIngresos, metaPct) {
        // zones: array de {hasta, tono} en orden ascendente 0-100, tono: good|ok|bad
        let gradient = 'linear-gradient(to right';
        let prev = 0;
        zones.forEach(z => {
            const color = 'var(--' + (z.tono === 'good' ? 'income' : z.tono === 'ok' ? 'cat-butter' : 'expense') + '-fill)';
            gradient += ', ' + color + ' ' + prev + '%, ' + color + ' ' + z.hasta + '%';
            prev = z.hasta;
        });
        gradient += ')';
        const pctText = sinIngresos ? '—' : Math.round(pct) + '%';
        const marker = sinIngresos ? '' : '<div class="meta-marker" style="left:' + Math.max(0, Math.min(100, pct)) + '%"></div>';
        const goalMarker = (sinIngresos || metaPct == null) ? '' :
            '<div class="meta-goal-marker" style="left:' + Math.max(0, Math.min(100, metaPct)) + '%">' + Math.round(metaPct) + '%</div>';
        let statusHtml;
        if (sinIngresos) {
            statusHtml = '<span class="meta-status" style="background:var(--surface-sunken);color:var(--text-secondary);">Sin ingresos este mes</span>';
        }
        else {
            const zoneAt = zones.find(z => pct <= z.hasta) || zones[zones.length - 1];
            const statusLabel = { good: 'En buen rango', ok: 'Un poco fuera de meta', bad: 'Lejos de tu meta' }[zoneAt.tono];
            statusHtml = '<span class="meta-status ' + zoneAt.tono + '">' + statusLabel + '</span>';
        }
        return '<div class="meta-row">' +
            '<div class="meta-row-head"><span class="meta-row-name">' + nombre + '</span>' +
            '<span class="meta-row-figs"><span class="meta-row-pct tabular">' + pctText + '</span><span class="meta-row-amt tabular">' + money(monto) + '</span></span></div>' +
            '<div class="meta-track-wrap">' + goalMarker + '<div class="meta-track" style="background:' + gradient + '">' + marker + '</div></div>' +
            statusHtml +
            '</div>';
    }
    function renderMetaCard(monthTx, ingresos) {
        let fijo = 0, variable = 0, inversion = 0;
        monthTx.forEach(t => {
            if (t.estado === 'no_es_gasto')
                return;
            if (t.tipo === 'gasto') {
                if (t.recurrencia === 'variable')
                    variable += gastoNetoTx(t);
                else
                    fijo += gastoNetoTx(t);
            }
            else if (t.tipo === 'inversion') {
                inversion += catTotalMonto(t);
            }
        });
        const sinIngresos = ingresos <= 0;
        const pctFijo = sinIngresos ? 0 : (fijo / ingresos) * 100, pctVar = sinIngresos ? 0 : (variable / ingresos) * 100, pctInv = sinIngresos ? 0 : (inversion / ingresos) * 100;
        const metaInvPct = metaInversionPct();
        const sumaMetas = METAS_GASTO_PCT.fijo + METAS_GASTO_PCT.variable + metaInvPct;
        const avisoSuma = sumaMetas > 100
            ? '<div class="meta-caption warn">Ojo: tus 3 metas suman ' + Math.round(sumaMetas) + '% de tus ingresos — eso es más del 100%, no calzan entre ellas. Ajusta Fijo/Variable en Presupuesto.</div>'
            : '';
        return '<div class="card meta-card">' +
            '<div class="donut-card-title">Fijo · Variable · Inversión</div>' +
            '<div class="donut-card-sub">Como porcentaje de tus ingresos del mes, contra tus propias metas</div>' +
            metaZoneRow('Gasto fijo', pctFijo, fijo, zonasMeta(METAS_GASTO_PCT.fijo, false), sinIngresos, METAS_GASTO_PCT.fijo) +
            metaZoneRow('Gasto variable', pctVar, variable, zonasMeta(METAS_GASTO_PCT.variable, false), sinIngresos, METAS_GASTO_PCT.variable) +
            metaZoneRow('Inversión', pctInv, inversion, zonasMeta(metaInvPct, true), sinIngresos, metaInvPct) +
            '<div class="meta-caption">"Fijo" = tus gastos con recurrencia mensual o anual · "Variable" = el resto · tu meta de Inversión (' + Math.round(metaInvPct) + '%) sale sola de lo que ya definiste en Inversiones. Edita Fijo/Variable en Presupuesto.</div>' +
            avisoSuma +
            '</div>';
    }
    function monthSwitcherHtml() {
        const month = MONTHS[state.monthIndex];
        return '<div class="month-switcher">' +
            '<button data-month-nav="-1" ' + (state.monthIndex <= 0 ? 'disabled' : '') + ' aria-label="Mes anterior">' + ICONS.chevL + '</button>' +
            '<span class="m-label">' + MONTH_LABEL[month] + '</span>' +
            '<button data-month-nav="1" ' + (state.monthIndex >= MONTHS.length - 1 ? 'disabled' : '') + ' aria-label="Mes siguiente">' + ICONS.chevR + '</button>' +
            '</div>';
    }
    /* ===================== PRESUPUESTO (Fase 2) ===================== */
    function catGastoEnMes(catId, monthKey) {
        return txsOfMonth(monthKey)
            .filter(t => t.tipo === 'gasto' && t.estado !== 'no_es_gasto')
            .reduce((sum, t) => sum + t.categorias.filter(c => c.cat === catId).reduce((s, c) => s + catMontoNeto(t, c), 0), 0);
    }
    function priorMonths(monthKey, n) {
        const idx = MONTHS.indexOf(monthKey);
        const result = [];
        for (let i = idx - 1; i >= 0 && result.length < n; i--) {
            result.push(MONTHS[i]);
        }
        return result;
    }
    function catPromedio3Meses(catId, monthKey) {
        const prior = priorMonths(monthKey, 3);
        if (prior.length === 0)
            return null;
        const total = prior.reduce((s, m) => s + catGastoEnMes(catId, m), 0);
        return total / prior.length;
    }
    function catGastoMesAnterior(catId, monthKey) {
        const prior = priorMonths(monthKey, 1);
        if (prior.length === 0)
            return null;
        return catGastoEnMes(catId, prior[0]);
    }
    function budgetZoneColor(pct) {
        return pct >= 100 ? 'var(--expense-fill)' : pct >= 80 ? 'var(--cat-butter-fill)' : 'var(--income-fill)';
    }
    function renderBudgetBar(pct) {
        const w = Math.max(0, Math.min(100, pct));
        return '<div class="budget-track"><div class="budget-fill" style="width:' + w + '%;background:' + budgetZoneColor(pct) + ';"></div></div>';
    }
    function budgetAlertBadge(pct, alertas) {
        if (!alertas)
            return '';
        const crossed = [100, 90, 80].find(t => alertas[t] && pct >= t);
        if (crossed === undefined)
            return '';
        const tone = crossed >= 100 ? 'bad' : crossed >= 90 ? 'bad' : 'ok';
        const label = crossed >= 100 ? 'Llegaste al 100% de tu meta' : 'Ya vas en el ' + crossed + '% de tu meta';
        return '<span class="meta-status ' + tone + '" style="margin-top:8px;">' + label + '</span>';
    }
    function renderBudgetEditForm(catId, cfg) {
        const cat = catInfo(catId);
        const d = state.budgetDraft;
        const alertChip = (t) => '<button class="alert-chip' + (d.alertas[t] ? ' active' : '') + '" data-toggle-alert="' + t + '">' + t + '%</button>';
        return '<div class="card budget-cat-card editing">' +
            '<div class="budget-cat-head">' +
            '<span class="budget-cat-icon" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + '</span>' +
            '<span class="budget-cat-name">' + cat.nombre + '</span>' +
            '</div>' +
            '<label class="draft-label">Meta mensual</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-budget-meta-input value="' + d.meta + '" placeholder="0">' +
            '<label class="draft-label" style="margin-top:12px;">Avisarme al</label>' +
            '<div class="alert-chip-row">' + alertChip(80) + alertChip(90) + alertChip(100) + '</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-budget-edit>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-budget="' + catId + '">Guardar</button>' +
            '</div>' +
            (cfg ? '<button class="budget-delete-link" data-delete-budget="' + catId + '">Eliminar presupuesto</button>' : '') +
            '</div>';
    }
    function renderBudgetCatCard(catId) {
        const cat = catInfo(catId);
        const month = MONTHS[state.monthIndex];
        const cfg = PRESUPUESTOS[catId];
        if (state.editingBudgetCat === catId) {
            return renderBudgetEditForm(catId, cfg);
        }
        if (!cfg) {
            return '<div class="card budget-cat-card empty">' +
                '<span class="budget-cat-icon" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + '</span>' +
                '<span class="budget-cat-name">' + cat.nombre + '</span>' +
                '<button class="budget-add-link" data-edit-budget="' + catId + '">+ Agregar presupuesto</button>' +
                '</div>';
        }
        const gastado = catGastoEnMes(catId, month);
        const meta = cfg.meta;
        const pct = meta > 0 ? (gastado / meta) * 100 : 0;
        const promedio3 = catPromedio3Meses(catId, month);
        const mesAnterior = catGastoMesAnterior(catId, month);
        const contexto = 'Prom. 3 meses: ' + (promedio3 === null ? 'sin datos' : money(Math.round(promedio3))) +
            ' · Mes anterior: ' + (mesAnterior === null ? 'sin datos' : money(mesAnterior));
        return '<div class="card budget-cat-card">' +
            '<div class="budget-cat-head">' +
            '<span class="budget-cat-icon" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + '</span>' +
            '<span class="budget-cat-name">' + cat.nombre + '</span>' +
            '<button class="budget-edit-btn" data-edit-budget="' + catId + '" aria-label="Editar presupuesto de ' + cat.nombre + '">' + ICONS.edit + '</button>' +
            '</div>' +
            '<div class="budget-cat-figs"><span class="tabular gastado">' + money(gastado) + '</span><span class="of-text"> de ' + money(meta) + '</span><span class="budget-pct tabular">' + Math.round(pct) + '%</span></div>' +
            renderBudgetBar(pct) +
            budgetAlertBadge(pct, cfg.alertas) +
            '<div class="budget-context muted">' + contexto + '</div>' +
            '<button class="budget-ver-mas" data-budget-vermas="' + catId + '">Ver transacciones →</button>' +
            '</div>';
    }
    // Cuánto suman, en total, los presupuestos que ya pusiste por categoría — para poder avisar
    // (chico, sin interrumpir) si esas categorías ya cuadran con el presupuesto total del mes o
    // si todavía queda una diferencia por asignar/ajustar.
    function sumaPresupuestosCategorias() {
        return Object.keys(PRESUPUESTOS).reduce((s, id) => s + (PRESUPUESTOS[id].meta || 0), 0);
    }
    function renderBudgetCatsCalce(meta) {
        const sumaCats = sumaPresupuestosCategorias();
        if (sumaCats === 0)
            return '';
        const diff = meta - sumaCats;
        if (Math.abs(diff) < 1) {
            return '<div class="budget-cats-calce ok">' + ICONS.checkCircle + ' Tus categorías calzan justo con el presupuesto total (' + money(sumaCats) + ').</div>';
        }
        if (diff > 0) {
            return '<div class="budget-cats-calce">Categorías: ' + money(sumaCats) + ' asignados · quedan ' + money(diff) + ' del total sin repartir.</div>';
        }
        return '<div class="budget-cats-calce warn">Categorías: ' + money(sumaCats) + ' asignados · ' + money(Math.abs(diff)) + ' más que tu presupuesto total.</div>';
    }
    function renderBudgetTotalCard(month) {
        const monthTx = txsOfMonth(month);
        const gastoTotal = monthTx.filter(t => t.tipo === 'gasto' && t.estado !== 'no_es_gasto').reduce((s, t) => s + gastoNetoTx(t), 0);
        const meta = presupuestoTotalMensual;
        const pct = meta > 0 ? (gastoTotal / meta) * 100 : 0;
        const restante = meta - gastoTotal;
        if (state.editingBudgetTotal) {
            return '<div class="card budget-total-card editing">' +
                '<div class="budget-total-label">Presupuesto total del mes</div>' +
                '<input type="text" inputmode="decimal" class="draft-input tabular" data-budget-total-input value="' + state.budgetTotalDraft + '" placeholder="0" style="margin-top:8px;">' +
                '<div style="display:flex;gap:10px;margin-top:12px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-budget-total>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-save-budget-total>Guardar</button>' +
                '</div>' +
                '</div>';
        }
        return '<div class="card budget-total-card">' +
            '<div class="budget-total-head">' +
            '<span class="budget-total-label">Presupuesto total del mes</span>' +
            '<button class="budget-edit-btn" data-edit-budget-total aria-label="Editar presupuesto total">' + ICONS.edit + '</button>' +
            '</div>' +
            '<div class="budget-total-note muted">Son tus gastos del mes — no incluye lo que aportas a inversión (eso se ve aparte en Balance).</div>' +
            '<div class="budget-total-figs"><span class="tabular gastado">' + money(gastoTotal) + '</span><span class="of-text"> de ' + money(meta) + '</span></div>' +
            renderBudgetBar(pct) +
            '<div class="budget-total-remaining muted">' + (restante >= 0 ? 'Te quedan ' + money(restante) + ' · llevas el ' + Math.round(pct) + '% de tu presupuesto' : 'Te pasaste por ' + money(Math.abs(restante)) + ' · ya usaste el ' + Math.round(pct) + '% de tu presupuesto') + '</div>' +
            renderBudgetCatsCalce(meta) +
            '</div>';
    }
    // Metas de Fijo/Variable (% de tus ingresos, editable) + Inversión (de solo lectura, sale
    // de tus metas en la pestaña Inversiones) — con aviso chico si entre las 3 pasan del 100%
    // de tus ingresos (no puedes destinar más de lo que ganas).
    function renderMetasGastoCard() {
        const metaInvPct = metaInversionPct();
        const suma = METAS_GASTO_PCT.fijo + METAS_GASTO_PCT.variable + metaInvPct;
        const ref = ingresoMensualReferencia();
        const fijoCLP = ref > 0 ? Math.round(ref * METAS_GASTO_PCT.fijo / 100) : null;
        const variableCLP = ref > 0 ? Math.round(ref * METAS_GASTO_PCT.variable / 100) : null;
        const inversionCLP = metaInversionMensualCLP();
        if (state.editingMetasGasto) {
            return '<div class="card metas-gasto-card editing">' +
                '<div class="budget-total-label">Metas de Fijo / Variable (% de tus ingresos)</div>' +
                '<div class="metas-gasto-inputs">' +
                '<label class="metas-gasto-input-row"><span>Fijo</span><input type="text" inputmode="decimal" class="draft-input tabular" data-metas-gasto-input="fijo" value="' + state.metasGastoDraft.fijo + '" placeholder="0">%</label>' +
                '<label class="metas-gasto-input-row"><span>Variable</span><input type="text" inputmode="decimal" class="draft-input tabular" data-metas-gasto-input="variable" value="' + state.metasGastoDraft.variable + '" placeholder="0">%</label>' +
                '</div>' +
                '<div class="metas-gasto-inversion-note muted">+ Inversión: ' + Math.round(metaInvPct) + '% (desde Inversiones, no se edita acá)</div>' +
                '<div style="display:flex;gap:10px;margin-top:12px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-metas-gasto>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-save-metas-gasto>Guardar</button>' +
                '</div>' +
                '</div>';
        }
        return '<div class="card metas-gasto-card">' +
            '<div class="budget-total-head">' +
            '<span class="budget-total-label">Metas de Fijo / Variable / Inversión</span>' +
            '<button class="budget-edit-btn" data-edit-metas-gasto aria-label="Editar metas de Fijo/Variable">' + ICONS.edit + '</button>' +
            '</div>' +
            '<div class="metas-gasto-figs">' +
            '<span class="metas-gasto-fig"><b class="tabular">' + METAS_GASTO_PCT.fijo + '%</b> Fijo' + (fijoCLP != null ? '<span class="metas-gasto-fig-abs tabular">' + money(fijoCLP) + '</span>' : '') + '</span>' +
            '<span class="metas-gasto-fig"><b class="tabular">' + METAS_GASTO_PCT.variable + '%</b> Variable' + (variableCLP != null ? '<span class="metas-gasto-fig-abs tabular">' + money(variableCLP) + '</span>' : '') + '</span>' +
            '<span class="metas-gasto-fig"><b class="tabular">' + Math.round(metaInvPct) + '%</b> Inversión' + (inversionCLP > 0 ? '<span class="metas-gasto-fig-abs tabular">' + money(inversionCLP) + '</span>' : '') + '</span>' +
            '</div>' +
            '<div class="' + (suma > 100 ? 'budget-cats-calce warn' : 'budget-cats-calce') + '" style="border-top:none;padding-top:0;">' +
            (suma > 100
                ? 'Suman ' + Math.round(suma) + '% de tus ingresos — más del 100%, no calzan.'
                : 'Suman ' + Math.round(suma) + '% de tus ingresos.') +
            '</div>' +
            '</div>';
    }
    function renderPresupuestoView() {
        const month = MONTHS[state.monthIndex];
        const gastoCatIds = Object.keys(CATS).filter(k => CATS[k].tipo === 'gasto');
        const conPresupuesto = gastoCatIds.filter(id => PRESUPUESTOS[id]);
        const sinPresupuesto = gastoCatIds.filter(id => !PRESUPUESTOS[id]);
        const conHtml = conPresupuesto.length
            ? conPresupuesto.map(renderBudgetCatCard).join('')
            : '<div class="empty-state" style="padding:20px 4px;">' + ICONS.inbox + '<div>Todavía no tienes categorías con presupuesto.</div></div>';
        const sinHtml = sinPresupuesto.map(renderBudgetCatCard).join('');
        document.getElementById('resumen-content').innerHTML =
            monthSwitcherHtml() +
                renderBudgetTotalCard(month) +
                renderMetasGastoCard() +
                '<div class="section-title">Categorías con presupuesto</div>' +
                conHtml +
                (sinPresupuesto.length ? '<div class="section-title">Sin presupuesto</div>' + sinHtml : '') +
                '<div style="height:12px;"></div>';
    }
    function renderBalanceView() {
        const month = MONTHS[state.monthIndex];
        const monthTx = txsOfMonth(month);
        let ingresos = 0, gastos = 0, inversiones = 0;
        monthTx.forEach(t => {
            if (t.estado === 'no_es_gasto')
                return;
            const monto = montoAgregadoTx(t);
            if (t.tipo === 'ingreso')
                ingresos += monto;
            else if (t.tipo === 'gasto')
                gastos += monto;
            else if (t.tipo === 'inversion')
                inversiones += monto;
        });
        const balance = ingresos - gastos - inversiones;
        const html = monthSwitcherHtml() +
            '<div class="stat-grid">' +
            '<div class="card stat-tile stat-ingresos"><div class="stat-label">Ingresos</div><div class="stat-value tabular">' + money(ingresos) + '</div></div>' +
            '<div class="card stat-tile stat-gastos"><div class="stat-label">Gastos</div><div class="stat-value tabular">' + money(gastos) + '</div></div>' +
            '<div class="card stat-tile stat-inversiones"><div class="stat-label">Inversiones</div><div class="stat-value tabular">' + money(inversiones) + '</div></div>' +
            '<div class="card stat-tile stat-balance"><div class="stat-label">Balance</div><div class="stat-value tabular" style="color:' + (balance >= 0 ? 'var(--income-ink)' : 'var(--expense-ink)') + '">' + money(balance) + '</div></div>' +
            '</div>' +
            renderReembolsoCard(month) +
            renderMetaCard(monthTx, ingresos) +
            renderDonutBlock('Ingresos por categoría', 'De dónde llegó la plata este mes', 'ingreso', monthTx) +
            renderDonutBlock('Gastos por categoría', 'A dónde se te fue la plata este mes', 'gasto', monthTx) +
            renderDonutBlock('Inversiones por categoría', 'Tus aportes por plataforma este mes', 'inversion', monthTx);
        document.getElementById('resumen-content').innerHTML = html;
    }
    // Cuánto le reembolsaron este mes (isapre, seguro complementario, etc.) — informativo, no
    // resta de "Gastos" arriba: el gasto completo sí salió de su bolsillo en su momento, esto
    // solo le muestra cuánta plata de eso ya volvió.
    function renderReembolsoCard(month) {
        const r = monthlyReembolsoTotal(month);
        if (r.count === 0)
            return '';
        return '<div class="card reembolso-card">' +
            '<span class="reembolso-icon">' + ICONS.checkCircle + '</span>' +
            '<div><div class="reembolso-label">Reembolsado este mes</div>' +
            '<div class="reembolso-value tabular">' + money(r.total) + '</div></div>' +
            '</div>';
    }
    function renderComingSoon(sub) {
        document.getElementById('resumen-content').innerHTML =
            '<div class="card placeholder-card">' + ICONS.sparkle + '<h3>Próximamente</h3><p>Esta sección todavía no está lista.</p></div>';
    }
    /* ===================== EVOLUCIÓN (Fase 3) ===================== */
    function monthTotals(monthKey) {
        const monthTx = txsOfMonth(monthKey);
        let ingresos = 0, gastos = 0, inversiones = 0;
        monthTx.forEach(t => {
            if (t.estado === 'no_es_gasto')
                return;
            const monto = montoAgregadoTx(t);
            if (t.tipo === 'ingreso')
                ingresos += monto;
            else if (t.tipo === 'gasto')
                gastos += monto;
            else if (t.tipo === 'inversion')
                inversiones += monto;
        });
        return {
            ingresos, gastos, inversiones, balance: ingresos - gastos - inversiones,
            tasaAhorro: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0,
            tasaGastos: ingresos > 0 ? (gastos / ingresos) * 100 : 0
        };
    }
    // Suma los 12 meses del año completo (Enero-Diciembre) para mostrar el total anual en
    // Evolución — ingresos, gastos, inversiones, tasa de ahorro y tasa de gastos, agregado
    // para todo el año, no solo los meses que ya tienen movimientos (los que faltan cuentan
    // como $0, así que no inflan ni distorsionan la suma).
    function yearTotals(year) {
        const months = fullYearMonths(year);
        let ingresos = 0, gastos = 0, inversiones = 0;
        months.forEach(m => {
            const t = monthTotals(m);
            ingresos += t.ingresos;
            gastos += t.gastos;
            inversiones += t.inversiones;
        });
        return {
            year, months, ingresos, gastos, inversiones,
            tasaAhorro: ingresos > 0 ? ((ingresos - gastos) / ingresos) * 100 : 0,
            tasaGastos: ingresos > 0 ? (gastos / ingresos) * 100 : 0
        };
    }
    // Proyección a futuro basada SOLO en tu ritmo real de aportes (promedio de los últimos
    // N meses con datos) — sin inventar ninguna rentabilidad ni tasa de retorno, siguiendo
    // el mismo principio que el resto de la app (nunca sugerimos un % de crecimiento). Es
    // "cuánto habrás puesto tú" en ese plazo, no una promesa de cuánto crecerá tu plata.
    // Único lugar de la app donde SÍ inventamos un número — a pedido explícito de la usuaria,
    // para poder proyectar a 20 años. Por defecto un retorno moderado y una inflación típica,
    // pero ambos quedan siempre editables a la vista, nunca escondidos como si fueran un hecho.
    let PROYECCION_SUPUESTOS = { retornoAnual: 6, inflacionAnual: 3 };
    function proyeccionAportes(mesesPromedio, aniosProyeccion) {
        const mesActual = todayISO().slice(0, 7);
        const mesesConDatos = MONTHS.filter(m => m <= mesActual).slice(-mesesPromedio);
        const promedioMensual = mesesConDatos.length
            ? mesesConDatos.reduce((s, m) => s + monthTotals(m).inversiones, 0) / mesesConDatos.length
            : 0;
        // La usuaria puede reemplazar ese promedio por un monto mensual propio en el simulador
        // (por ejemplo, para ver qué pasaría si aportara más o menos que su promedio real) — si no
        // lo ha tocado (null), se sigue usando el promedio real de siempre.
        const aporteMensualUsado = state.proySimulatedAporte != null ? state.proySimulatedAporte : promedioMensual;
        const totalActual = activePlatformIds().reduce((s, id) => s + platformValorActual(id), 0);
        const aporteAnual = aporteMensualUsado * 12;
        // Referencia honesta: solo lo aportado, sin ningún % de retorno inventado.
        const proyectadoSinRetorno = totalActual + aporteAnual * aniosProyeccion;
        // Proyección con retorno + inflación (tasa real vía Fisher), expresada en pesos de hoy.
        const retornoAnual = PROYECCION_SUPUESTOS.retornoAnual;
        const inflacionAnual = PROYECCION_SUPUESTOS.inflacionAnual;
        const rReal = ((1 + retornoAnual / 100) / (1 + inflacionAnual / 100)) - 1;
        const factor = Math.pow(1 + rReal, aniosProyeccion);
        const valorFuturoActual = totalActual * factor;
        const valorFuturoAportes = Math.abs(rReal) < 0.0001 ? aporteAnual * aniosProyeccion : aporteAnual * ((factor - 1) / rReal);
        const proyectadoConRetorno = valorFuturoActual + valorFuturoAportes;
        return { promedioMensual, aporteMensualUsado, totalActual, proyectadoSinRetorno, proyectadoConRetorno, retornoAnual, inflacionAnual, rReal, meses: mesesConDatos, anios: aniosProyeccion };
    }
    function buildSparkline(values, w, h, color) {
        if (values.length < 2)
            return '';
        const maxV = Math.max(...values), minV = Math.min(...values);
        const range = (maxV - minV) || 1;
        const stepX = w / (values.length - 1);
        const pad = 3;
        const pts = values.map((v, i) => [i * stepX, pad + (1 - (v - minV) / range) * (h - pad * 2)]);
        const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
        const last = pts[pts.length - 1];
        return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" style="display:block;overflow:visible;">' +
            '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3" fill="' + color + '"/>' +
            '</svg>';
    }
    function buildEvolucionBars(months, selMonth) {
        const totals = months.map(monthTotals);
        const maxVal = Math.max(1, ...totals.flatMap(t => [t.ingresos, t.gastos, t.inversiones]));
        const W = 320, chartH = 128, padTop = 6, padBottom = 20, H = chartH + padTop + padBottom;
        const groupW = W / months.length;
        const barGap = 3, groupPad = 8;
        let out = '';
        months.forEach((m, i) => {
            const t = totals[i];
            const gx = i * groupW;
            const isSelected = m === selMonth;
            const vals = [t.ingresos, t.gastos, t.inversiones];
            const colors = ['var(--income-fill)', 'var(--expense-fill)', 'var(--invest-fill)'];
            const innerX = gx + groupPad / 2;
            const innerW = groupW - groupPad;
            const barW = (innerW - barGap * 2) / 3;
            let bars = '';
            vals.forEach((v, vi) => {
                const h = maxVal > 0 ? Math.max(2, (v / maxVal) * chartH) : 2;
                const bx = innerX + vi * (barW + barGap);
                const by = padTop + (chartH - h);
                bars += '<rect x="' + bx.toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + Math.max(0, barW).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2.5" fill="' + colors[vi] + '" opacity="' + (isSelected ? 1 : 0.4) + '"/>';
            });
            const short = MONTH_LABEL[m].split(' ')[0].slice(0, 3);
            out += '<g data-evo-month="' + m + '" style="cursor:pointer;">' +
                '<rect x="' + gx.toFixed(1) + '" y="0" width="' + groupW.toFixed(1) + '" height="' + (padTop + chartH + 4).toFixed(1) + '" rx="8" fill="' + (isSelected ? 'var(--surface-sunken)' : 'transparent') + '"/>' +
                bars +
                '<text x="' + (gx + groupW / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9.5" fill="' + (isSelected ? 'var(--text)' : 'var(--text-tertiary)') + '" font-weight="' + (isSelected ? '700' : '400') + '">' + short + '</text>' +
                '</g>';
        });
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;overflow:visible;">' + out + '</svg>';
    }
    // Sólo los meses con datos reales de la meta (evita que meses futuros proyectados
    // por cuotas de tarjeta —que sí extienden MONTHS— aparezcan como "incumplidos").
    function metaMonths(meta) {
        return MONTHS.filter(m => meta.historial[m] != null);
    }
    function metaAcumuladoActual(meta) {
        const months = metaMonths(meta);
        return months.length ? meta.historial[months[months.length - 1]] : 0;
    }
    // Ganancia estimada de la meta: lo acumulado menos lo que realmente aportaste (nunca el
    // total) — es la base sobre la que se calcula su comisión, igual que en las plataformas.
    function metaGananciaEstimada(meta) {
        return Math.max(0, metaAcumuladoActual(meta) - (meta.aportadoNeto || 0));
    }
    function metaRacha(meta) {
        const months = metaMonths(meta);
        let racha = 0;
        for (let i = months.length - 1; i >= 0; i--) {
            if (meta.checks[months[i]])
                racha++;
            else
                break;
        }
        return racha;
    }
    function metasForPlataforma(id) {
        return METAS_INVERSION.filter(m => m.plataformaId === id);
    }
    // Resumen combinado de las metas de UNA plataforma: suma de objetivo/acumulado, y una
    // racha combinada que solo se prende si TODAS las metas de esa plataforma tienen racha
    // activa hoy — en ese caso el número es la racha más corta (los meses en que las
    // cumpliste TODAS a la vez), no la más larga.
    function platformMetasResumen(id) {
        const metas = metasForPlataforma(id);
        const totalObjetivo = metas.reduce((s, m) => s + m.montoObjetivo, 0);
        const totalAcumulado = metas.reduce((s, m) => s + metaAcumuladoActual(m), 0);
        const rachas = metas.map(metaRacha);
        const rachaCombinada = (metas.length > 0 && rachas.every(r => r > 0)) ? Math.min(...rachas) : 0;
        return { metas, totalObjetivo, totalAcumulado, rachaCombinada };
    }
    function metaProgresoTotal() {
        const totalObjetivo = METAS_INVERSION.reduce((s, m) => s + m.montoObjetivo, 0);
        const totalAcumulado = METAS_INVERSION.reduce((s, m) => s + metaAcumuladoActual(m), 0);
        return { totalObjetivo, totalAcumulado };
    }
    // 12 cuadraditos (enero-diciembre del año en curso) para marcar a mano si cumpliste tu
    // objetivo de inversión TOTAL ese mes — independiente de los checks de cada meta individual.
    // Un mes sin marcar se ve igual que "no cumplido" (no hay forma de distinguir "todavía no
    // llega" de "no lo marcaste"), lo cual está bien: es un hábito que tú llevas, no un cálculo.
    // Racha del objetivo de inversión TOTAL — mismo criterio que metaRacha (cuenta hacia atrás
    // desde el mes actual mientras esté marcado como cumplido), pero sobre METAS_TOTAL_CHECKS en
    // vez de los checks de una meta puntual. Antes esto no generaba ninguna racha, a diferencia
    // de las metas por plataforma, que sí la mostraban.
    function metaTotalRacha() {
        const year = todayISO().slice(0, 4);
        const mesActual = todayISO().slice(0, 7);
        const months = fullYearMonths(year).filter(m => m <= mesActual);
        let racha = 0;
        for (let i = months.length - 1; i >= 0; i--) {
            if (METAS_TOTAL_CHECKS[months[i]])
                racha++;
            else
                break;
        }
        return racha;
    }
    function renderMetaTotalChecksGrid() {
        const year = todayISO().slice(0, 4);
        const months = fullYearMonths(year);
        const racha = metaTotalRacha();
        const cells = months.map(m => {
            const checked = !!METAS_TOTAL_CHECKS[m];
            const monthIdx = parseInt(m.slice(5, 7), 10) - 1;
            const short = MESES_LARGO[monthIdx].slice(0, 3);
            const label = short.charAt(0).toUpperCase() + short.slice(1);
            return '<button class="meta-total-check-cell' + (checked ? ' done' : '') + '" data-toggle-meta-total-check="' + m + '" aria-pressed="' + (checked ? 'true' : 'false') + '" aria-label="' + label + ' ' + year + (checked ? ': objetivo total cumplido' : ': no marcado') + '">' +
                '<span class="mcc-icon">' + (checked ? ICONS.check : ICONS.close) + '</span><span class="mcc-label">' + label + '</span>' +
                '</button>';
        }).join('');
        return '<div class="meta-total-checks-label muted" style="display:flex;align-items:center;gap:6px;justify-content:space-between;">' +
            '<span>¿Cumpliste tu objetivo total cada mes?</span>' +
            (racha > 0 ? '<span class="meta-racha-badge">' + racha + ' 🔥</span>' : '') +
            '</div>' +
            '<div class="meta-total-checks-grid">' + cells + '</div>' +
            '<div class="meta-racha">' + (racha > 0 ? 'Racha activa — cumpliste tu objetivo total ' + racha + ' ' + (racha === 1 ? 'mes' : 'meses') + ' seguidos hasta hoy' : 'Sin racha activa — marca los meses en que cumpliste tu objetivo total') + '</div>';
    }
    function renderMetaEditForm(meta, plataformaId) {
        const d = state.metaDraft;
        const ctxId = meta ? meta.plataformaId : (plataformaId || state.addMetaPlataformaId);
        const ctxNombre = ctxId ? catInfo(ctxId).nombre : '';
        return '<div class="card meta-goal-card editing">' +
            (ctxNombre ? '<div class="meta-goal-ctx muted">' + (meta ? 'Meta en ' : 'Nueva meta en ') + ctxNombre + '</div>' : '') +
            '<label class="draft-label">Nombre de la meta</label>' +
            '<input type="text" class="draft-input" data-meta-field="nombre" value="' + d.nombre.replace(/"/g, '&quot;') + '" placeholder="Ej: Fondo de emergencia">' +
            '<label class="draft-label" style="margin-top:12px;">Monto objetivo</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="montoObjetivo" value="' + d.montoObjetivo + '" placeholder="0">' +
            '<label class="draft-label" style="margin-top:12px;">Aporte mensual meta</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="aporteMensualMeta" value="' + d.aporteMensualMeta + '" placeholder="0">' +
            '<label class="draft-label" style="margin-top:12px;">Plazo</label>' +
            segmentedHtml('meta-plazo', [{ id: 'corto', label: 'Corto' }, { id: 'medio', label: 'Medio' }, { id: 'largo', label: 'Largo' }], d.plazo, false) +
            '<label class="draft-label" style="margin-top:12px;">Comisión anual / TAC (opcional)</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-meta-field="comision" value="' + d.comision + '" placeholder="Ej: 1.1">' +
            '<div class="platform-hint muted">El % que te cobra el fondo específico de esta meta — ponlo tú, la app no te sugiere ningún número. Se calcula sobre tu ganancia, no sobre el total ahorrado.</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-meta-edit>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-meta="' + (meta ? meta.id : 'nueva') + '">Guardar</button>' +
            '</div>' +
            (meta ? '<button class="budget-delete-link" data-delete-meta="' + meta.id + '">Eliminar meta</button>' : '') +
            '</div>';
    }
    // Antes los cuadraditos de check solo llegaban hasta el último mes con dato real
    // (metaMonths) — así, si recién creaste la meta en agosto, septiembre en adelante ni
    // aparecía. Ahora se extienden desde el primer mes con dato (o el mes actual, si la meta es
    // nueva y todavía no tiene ninguno) hasta diciembre del año en curso, mismo criterio que ya
    // usa la grilla del objetivo total: los meses futuros se ven igual que "no marcado" — no hay
    // forma de distinguir "todavía no llega" de "no lo marcaste", y está bien así.
    function metaChecksMonths(meta) {
        const year = todayISO().slice(0, 4);
        const tracked = metaMonths(meta);
        const start = tracked.length ? tracked[0] : todayISO().slice(0, 7);
        return fullYearMonths(year).filter(m => m >= start);
    }
    function renderMetaGoalCard(meta) {
        if (state.editingMetaId === meta.id)
            return renderMetaEditForm(meta);
        const trackedMonths = metaMonths(meta);
        const acumulado = metaAcumuladoActual(meta);
        const pct = meta.montoObjetivo > 0 ? (acumulado / meta.montoObjetivo) * 100 : 0;
        const racha = metaRacha(meta);
        const comision = meta.comision;
        const gananciaMeta = metaGananciaEstimada(meta);
        const comisionRow = comision != null ? ('<div class="platform-comision-row">' +
            '<span>Comisión anual: <b class="tabular">' + comision + '%</b></span>' +
            '<span class="muted tabular">≈ ' + money(gananciaMeta * comision / 100) + '/año sobre tu ganancia</span>' +
            '</div>') : '';
        const historialVals = trackedMonths.map(m => meta.historial[m]);
        const checksRow = metaChecksMonths(meta).map(m => {
            const short = MONTH_LABEL[m].split(' ')[0].slice(0, 3);
            const done = !!meta.checks[m];
            return '<button class="meta-check-chip' + (done ? ' done' : '') + '" data-toggle-meta-check="' + meta.id + '" data-toggle-meta-month="' + m + '">' +
                '<span class="mcc-icon">' + (done ? ICONS.check : ICONS.close) + '</span><span class="mcc-label">' + short + '</span>' +
                '</button>';
        }).join('');
        return '<div class="card meta-goal-card">' +
            '<div class="meta-goal-head">' +
            '<span class="meta-goal-name">' + meta.nombre + '</span>' +
            plazoChip(meta.plazo) +
            (racha > 0 ? '<span class="meta-racha-badge">' + racha + ' 🔥</span>' : '') +
            '<button class="budget-edit-btn" data-edit-meta="' + meta.id + '" aria-label="Editar ' + meta.nombre + '">' + ICONS.edit + '</button>' +
            '</div>' +
            '<div class="meta-goal-figs"><span class="tabular gastado">' + money(acumulado) + '</span><span class="of-text"> de ' + money(meta.montoObjetivo) + '</span><span class="budget-pct tabular">' + Math.round(pct) + '%</span></div>' +
            '<div class="budget-track"><div class="budget-fill" style="width:' + Math.max(0, Math.min(100, pct)) + '%;background:var(--accent);"></div></div>' +
            comisionRow +
            '<div class="meta-goal-spark-row">' +
            '<div class="meta-goal-spark">' + buildSparkline(historialVals, 120, 32, 'var(--accent)') + '</div>' +
            '<div class="meta-goal-aporte muted">Meta de aporte<br><span class="tabular" style="color:var(--text);font-weight:600;">' + money(meta.aporteMensualMeta) + '</span>/mes</div>' +
            '</div>' +
            '<div class="meta-check-row">' + checksRow + '</div>' +
            '<div class="meta-racha">' + (racha > 0 ? 'Racha activa — cumpliste tu aporte ' + racha + ' ' + (racha === 1 ? 'mes' : 'meses') + ' seguidos hasta hoy' : 'Sin racha activa — marca los meses en que cumpliste tu aporte') + '</div>' +
            '</div>';
    }
    // Los 12 meses de un año completo (enero-diciembre), independiente de MONTHS (que solo
    // tiene los meses que realmente se han usado en Transacciones/Presupuesto). Evolución
    // quiere ver el año entero aunque los meses sin datos salgan en cero — así que generamos
    // las llaves y sus etiquetas al vuelo, sin tocar el MONTHS global (eso rompería el resto
    // de la app: navegación de Balance, metas, plataformas, etc).
    function fullYearMonths(year) {
        const out = [];
        for (let m = 1; m <= 12; m++) {
            const key = year + '-' + String(m).padStart(2, '0');
            if (!MONTH_LABEL[key])
                MONTH_LABEL[key] = monthLabelFor(key);
            out.push(key);
        }
        return out;
    }
    function renderEvolucionView() {
        const year = todayISO().slice(0, 4);
        const months = fullYearMonths(year);
        const mesActual = todayISO().slice(0, 7);
        const selMonth = (state.evoSelectedMonth && months.includes(state.evoSelectedMonth)) ? state.evoSelectedMonth : mesActual;
        const sel = monthTotals(selMonth);
        const legendRow = '<div class="evo-legend-row">' +
            '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--income-fill)"></span>Ingresos</span>' +
            '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--expense-fill)"></span>Gastos</span>' +
            '<span class="evo-legend-item"><span class="evo-dot" style="background:var(--invest-fill)"></span>Inversiones</span>' +
            '</div>';
        const detailRow = '<div class="evo-detail-row">' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Ingresos</span><span class="evo-detail-value tabular">' + money(sel.ingresos) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Gastos</span><span class="evo-detail-value tabular">' + money(sel.gastos) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Inversiones</span><span class="evo-detail-value tabular">' + money(sel.inversiones) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de ahorro</span><span class="evo-detail-value tabular">' + Math.round(sel.tasaAhorro) + '%</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de gastos</span><span class="evo-detail-value tabular">' + Math.round(sel.tasaGastos) + '%</span></div>' +
            '</div>';
        const yr = yearTotals(selMonth.slice(0, 4));
        const yearRow = '<div class="evo-detail-row">' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Ingresos</span><span class="evo-detail-value tabular">' + money(yr.ingresos) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Gastos</span><span class="evo-detail-value tabular">' + money(yr.gastos) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Inversiones</span><span class="evo-detail-value tabular">' + money(yr.inversiones) + '</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de ahorro</span><span class="evo-detail-value tabular">' + Math.round(yr.tasaAhorro) + '%</span></div>' +
            '<div class="evo-detail-item"><span class="evo-detail-label">Tasa de gastos</span><span class="evo-detail-value tabular">' + Math.round(yr.tasaGastos) + '%</span></div>' +
            '</div>';
        const html = '<div class="section-title" style="margin-top:4px;">Ingresos, gastos e inversiones por mes</div>' +
            '<div class="card evo-card">' +
            legendRow +
            buildEvolucionBars(months, selMonth) +
            '<div class="evo-caption muted">Toca un mes para ver el detalle</div>' +
            '<div class="evo-detail-month">' + MONTH_LABEL[selMonth] + '</div>' +
            detailRow +
            '</div>' +
            '<div class="section-title">Total del año ' + yr.year + '</div>' +
            '<div class="card evo-card">' +
            '<div class="evo-detail-month">Enero – Diciembre ' + yr.year + '</div>' +
            yearRow +
            '</div>' +
            '<div class="evo-caption muted" style="padding:0 4px;">¿Buscas tus metas de inversión y tus plataformas? Ahora viven juntas en <b>Inversiones</b>.</div>' +
            '<div style="height:12px;"></div>';
        document.getElementById('resumen-content').innerHTML = html;
    }
    /* ===================== INVERSIONES (Fase 4) ===================== */
    function platformIds() {
        return Object.keys(CATS).filter(k => CATS[k].tipo === 'inversion');
    }
    // "Cerrar" una plataforma (ej: cerraste tu cuenta en Buda) no borra su historial — tus
    // transacciones pasadas de esa plataforma siguen intactas en Transacciones/Balance/
    // Presupuesto/Evolución, tal como fueron. Solo deja de contar hacia adelante: desaparece
    // de "Mis plataformas", del "Total invertido" y de la proyección a futuro.
    function isPlatformArchived(id) { return !!(PLATAFORMA_DATA[id] && PLATAFORMA_DATA[id].archivada); }
    function activePlatformIds() { return platformIds().filter(id => !isPlatformArchived(id)); }
    function archivedPlatformIds() { return platformIds().filter(id => isPlatformArchived(id)); }
    function platformAportadoNeto(id) {
        let total = 0;
        TX.forEach(t => {
            if (t.tipo !== 'inversion')
                return;
            t.categorias.forEach(c => { if (c.cat === id)
                total += c.monto; });
        });
        return total;
    }
    function platformValorMonths(id) {
        return MONTHS.filter(m => PLATAFORMA_DATA[id].valorHistorial[m] != null);
    }
    function platformValorActual(id) {
        const months = platformValorMonths(id);
        return months.length ? PLATAFORMA_DATA[id].valorHistorial[months[months.length - 1]] : 0;
    }
    function platformDiasDesdeActualizacion(id) {
        const hoy = new Date(todayISO() + 'T00:00:00');
        const fecha = new Date(PLATAFORMA_DATA[id].fechaActualizacion + 'T00:00:00');
        return Math.max(0, Math.round((hoy.getTime() - fecha.getTime()) / 86400000));
    }
    // El eje X del gráfico de inversiones siempre muestra el año calendario completo (enero a
    // diciembre) del año de HOY -- no un rango que dependa de qué meses tengan datos. Así, cuando
    // sea 2027, esto automáticamente devuelve los 12 meses de 2027 en vez de seguir mostrando 2026.
    function inversionesMonthsCalendarYear() {
        const year = todayISO().slice(0, 4);
        const out = [];
        for (let m = 1; m <= 12; m++)
            out.push(year + '-' + String(m).padStart(2, '0'));
        return out;
    }
    // true si TODAS las plataformas activas ya tienen un valor guardado para ese mes -- se usa
    // para decidir si el mes tiene "dato real" o si el gráfico debe dejar un hueco ahí (mes futuro
    // que todavía no llega, o mes anterior a que existiera la plataforma).
    function mesTieneValorParaTodas(monthKey) {
        const ids = activePlatformIds();
        return ids.length > 0 && ids.every(id => PLATAFORMA_DATA[id].valorHistorial[monthKey] != null);
    }
    // Aportado acumulado hasta ese mes (inclusive), sumando TODA la historia de transacciones de
    // inversión hasta esa fecha (no solo un rango fijo de meses) -- o null si ese mes no tiene dato
    // de valor para todas las plataformas, para que el gráfico deje un hueco en vez de un $0 falso.
    function aportadoAcumuladoHastaMesONull(monthKey) {
        if (!mesTieneValorParaTodas(monthKey))
            return null;
        let total = 0;
        TX.forEach(t => {
            if (t.tipo !== 'inversion' || t.estado === 'no_es_gasto')
                return;
            if (t.fecha.slice(0, 7) <= monthKey)
                total += montoAgregadoTx(t);
        });
        return total;
    }
    function valorTotalEnMesONull(monthKey) {
        if (!mesTieneValorParaTodas(monthKey))
            return null;
        return activePlatformIds().reduce((s, id) => s + (PLATAFORMA_DATA[id].valorHistorial[monthKey] || 0), 0);
    }
    // Gráfico de líneas "aportado vs. valor". Eje X: 12 posiciones fijas (enero-diciembre), tengan
    // o no dato ese mes -- si una serie no tiene dato en un mes (null), esa serie simplemente deja
    // un hueco ahí en vez de inventar un valor (por eso se corta en tramos, no una sola ruta).
    // Eje Y: 3 etiquetas aproximadas (arriba/medio/abajo), con formato abreviado.
    function buildDualLineChart(months, seriesA, seriesB, colorA, colorB) {
        const W = 320, H = 180, padL = 38, padR = 8, padTop = 16, padBottom = 24;
        const plotW = W - padL - padR, plotH = H - padTop - padBottom;
        const valoresReales = seriesA.concat(seriesB).filter(v => v != null);
        const maxV = valoresReales.length ? Math.max(...valoresReales, 0) : 1;
        const minV = valoresReales.length ? Math.min(...valoresReales, 0) : 0;
        const range = (maxV - minV) || 1;
        const stepX = plotW / ((months.length - 1) || 1);
        function xAt(i) { return padL + i * stepX; }
        function yAt(v) { return padTop + (1 - (v - minV) / range) * plotH; }
        function segmentos(vals) {
            const segs = [];
            let actual = [];
            vals.forEach((v, i) => {
                if (v == null) {
                    if (actual.length)
                        segs.push(actual);
                    actual = [];
                    return;
                }
                actual.push([xAt(i), yAt(v)]);
            });
            if (actual.length)
                segs.push(actual);
            return segs;
        }
        function pathsFor(segs, extraAttrs) {
            return segs.map(seg => '<path d="' + seg.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + '" ' + extraAttrs + '/>').join('');
        }
        const segsA = segmentos(seriesA), segsB = segmentos(seriesB);
        const linesA = pathsFor(segsA, 'fill="none" stroke="' + colorA + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"');
        const linesB = pathsFor(segsB, 'fill="none" stroke="' + colorB + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4"');
        const dotsA = segsA.flat().map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + colorA + '"/>').join('');
        const dotsB = segsB.flat().map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + colorB + '" stroke="var(--surface)" stroke-width="1"/>').join('');
        const labelsX = months.map((m, i) => '<text x="' + xAt(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="var(--text-tertiary)">' + monthAbbr(parseInt(m.slice(5, 7), 10)) + '</text>').join('');
        const yTicks = [maxV, (maxV + minV) / 2, minV];
        const gridY = yTicks.map(v => {
            const y = yAt(v);
            return '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>' +
                '<text x="' + (padL - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" font-size="9" fill="var(--text-tertiary)">' + moneyShort(v) + '</text>';
        }).join('');
        function ultimoPunto(vals) {
            for (let i = vals.length - 1; i >= 0; i--) {
                if (vals[i] != null)
                    return [xAt(i), yAt(vals[i]), vals[i]];
            }
            return null;
        }
        const lastA = ultimoPunto(seriesA), lastB = ultimoPunto(seriesB);
        let labelsFin = '';
        if (lastA && lastB) {
            // separa las etiquetas finales si los dos valores terminan muy cerca (para que no se encimen)
            let yA = lastA[1] - 8, yB = lastB[1] - 8;
            const minGap = 13;
            if (Math.abs(yA - yB) < minGap) {
                const mid = (yA + yB) / 2;
                if (yA <= yB) {
                    yA = mid - minGap / 2;
                    yB = mid + minGap / 2;
                }
                else {
                    yA = mid + minGap / 2;
                    yB = mid - minGap / 2;
                }
            }
            labelsFin =
                '<text x="' + lastA[0].toFixed(1) + '" y="' + Math.max(10, yA).toFixed(1) + '" text-anchor="end" font-size="10" font-weight="700" fill="' + colorA + '">' + moneyPlainMasked(lastA[2]) + '</text>' +
                    '<text x="' + lastB[0].toFixed(1) + '" y="' + Math.max(10, yB).toFixed(1) + '" text-anchor="end" font-size="10" font-weight="700" fill="' + colorB + '">' + moneyPlainMasked(lastB[2]) + '</text>';
        }
        else if (lastA) {
            labelsFin = '<text x="' + lastA[0].toFixed(1) + '" y="' + Math.max(10, lastA[1] - 8).toFixed(1) + '" text-anchor="end" font-size="10" font-weight="700" fill="' + colorA + '">' + moneyPlainMasked(lastA[2]) + '</text>';
        }
        else if (lastB) {
            labelsFin = '<text x="' + lastB[0].toFixed(1) + '" y="' + Math.max(10, lastB[1] - 8).toFixed(1) + '" text-anchor="end" font-size="10" font-weight="700" fill="' + colorB + '">' + moneyPlainMasked(lastB[2]) + '</text>';
        }
        return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;overflow:visible;">' +
            gridY + linesA + linesB + dotsA + dotsB + labelsX + labelsFin +
            '</svg>';
    }
    function renderPlatformEditForm(id) {
        const cat = catInfo(id);
        const d = state.platformDraft;
        return '<div class="card platform-card editing">' +
            '<div class="platform-head">' +
            '<span class="platform-icon" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + '</span>' +
            '<span class="platform-name">' + cat.nombre + '</span>' +
            '</div>' +
            '<label class="draft-label">Valor actual aproximado</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="valor" value="' + d.valor + '" placeholder="0">' +
            '<label class="draft-label" style="margin-top:12px;">Crecimiento anual estimado (opcional)</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="tasaAnual" value="' + d.tasaAnual + '" placeholder="Sin estimar, ej: 6">' +
            '<div class="platform-hint muted">Escríbelo solo si quieres que el valor "crezca" solo entre actualizaciones — la app no te sugiere ningún número. Déjalo vacío para que se mueva solo con tus aportes y retiros.</div>' +
            // La comisión ahora vive en cada meta (depende del fondo/inversión específica) — acá
            // solo se ofrece cuando la plataforma todavía no tiene ninguna meta propia.
            (metasForPlataforma(id).length === 0 ?
                '<label class="draft-label" style="margin-top:12px;">Comisión anual / TAC (opcional)</label>' +
                    '<input type="text" inputmode="decimal" class="draft-input tabular" data-platform-field="comision" value="' + d.comision + '" placeholder="Ej: 1.1">' +
                    '<div class="platform-hint muted">El % que te cobra esta plataforma al año (TAC, comisión de administración, etc.) — ponlo tú, la app no te sugiere ningún número. Se calcula sobre tu ganancia, no sobre el total de la cuenta. Si más adelante le agregas metas, la comisión se define por cada una, ya que puede variar por fondo.</div>'
                : '') +
            '<label class="draft-label" style="margin-top:12px;">Plazo de esta plataforma (opcional)</label>' +
            segmentedHtml('platform-plazo', [{ id: 'corto', label: 'Corto' }, { id: 'medio', label: 'Medio' }, { id: 'largo', label: 'Largo' }], d.plazo, false) +
            '<div class="platform-hint muted">Solo si esta plataforma no tiene metas propias con su plazo ya definido.</div>' +
            '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-platform-edit>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-platform="' + id + '">Guardar</button>' +
            '</div>' +
            platformDeleteBlock(id) +
            '</div>';
    }
    // Si la plataforma nunca tuvo movimientos ni metas, se puede borrar de verdad (ej: la
    // creaste sin querer). Si ya tiene historial, "eliminar" borraría transacciones reales —
    // en vez de eso se ofrece "cerrar" (como cerrar una cuenta): deja de contar hacia adelante
    // pero conserva intacto todo lo que ya pasó. Con metas activas, hay que borrarlas primero
    // en cualquiera de los dos casos, para no dejarlas apuntando a una plataforma fantasma.
    function platformDeleteBlock(id) {
        const enUso = catEnUso(id);
        const tieneMetas = metasForPlataforma(id).length > 0;
        if (tieneMetas) {
            return '<div class="file-format-hint">No se puede cerrar ni eliminar: tiene metas asociadas. Elimínalas primero.</div>';
        }
        if (!enUso) {
            // Eliminar de verdad no tiene vuelta atrás (a diferencia de "cerrar", que se puede
            // reabrir) — por eso pide confirmar antes de borrarla y su categoría de Menú.
            if (state.confirmDeletePlatformId === id) {
                return '<div class="file-format-hint" style="margin-bottom:8px;">¿Eliminar esta plataforma? No se puede deshacer, y también desaparece de Menú &gt; Categorías.</div>' +
                    '<div style="display:flex;gap:10px;">' +
                    '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-delete-platform>Cancelar</button>' +
                    '<button class="save-tx-btn" style="flex:1;background:var(--expense-ink);" data-confirm-delete-platform="' + id + '">Sí, eliminar</button>' +
                    '</div>';
            }
            return '<button class="budget-delete-link" style="margin-top:10px;" data-delete-platform="' + id + '">Eliminar plataforma</button>';
        }
        if (state.confirmArchivePlatformId === id) {
            return '<div class="file-format-hint" style="margin-bottom:8px;">¿Cerrar esta plataforma? Deja de contar en "Mis plataformas", en el total invertido y en Menú &gt; Categorías — tus transacciones pasadas no se tocan, y puedes reabrirla cuando quieras.</div>' +
                '<div style="display:flex;gap:10px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-archive-platform>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-confirm-archive-platform="' + id + '">Sí, cerrar</button>' +
                '</div>';
        }
        return '<button class="budget-delete-link" style="margin-top:10px;" data-archive-platform="' + id + '">Cerrar plataforma</button>' +
            '<div class="platform-hint muted">Deja de contar en "Mis plataformas" y en el total invertido — tus transacciones pasadas no se tocan.</div>';
    }
    // Crea una plataforma de inversión nueva (ej: "Banco Santander") — hasta ahora las categorías
    // de tipo inversión solo podían nacer si ya existían en la data semilla; esto le da a la
    // usuaria una forma real de agregar una plataforma que todavía no tiene.
    function renderNewPlatformForm() {
        const d = state.newPlatformDraft;
        return '<div class="card platform-card editing">' +
            '<div class="platform-head"><span class="platform-name">Nueva plataforma</span></div>' +
            '<label class="draft-label">Nombre</label>' +
            '<input type="text" class="draft-input" data-newplatform-field="nombre" value="' + d.nombre + '" placeholder="Ej: Banco Santander">' +
            '<label class="draft-label" style="margin-top:12px;">Ícono</label>' +
            '<div class="icon-picker">' + CAT_ICON_CHOICES.map(ic => '<button type="button" data-newplatform-icon="' + ic + '" class="' + (d.icon === ic ? 'active' : '') + '">' + ICONS[ic] + '</button>').join('') + '</div>' +
            '<label class="draft-label" style="margin-top:12px;">Color</label>' +
            '<div class="color-picker">' + CAT_COLOR_CHOICES.map(c => '<button type="button" data-newplatform-color="' + c + '" class="' + (d.color === c ? 'active' : '') + '" style="--sw:var(--cat-' + c + '-fill)"></button>').join('') + '</div>' +
            '<label class="draft-label" style="margin-top:12px;">Valor actual aproximado</label>' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-newplatform-field="valor" value="' + d.valor + '" placeholder="0">' +
            '<div class="platform-hint muted">Si ya tienes plata en esta plataforma, pon cuánto vale hoy — si acabas de abrirla, déjalo en 0.</div>' +
            '<label class="draft-label" style="margin-top:12px;">Plazo (opcional)</label>' +
            segmentedHtml('newplatform-plazo', [{ id: 'corto', label: 'Corto' }, { id: 'medio', label: 'Medio' }, { id: 'largo', label: 'Largo' }], d.plazo, false) +
            '<div style="display:flex;gap:10px;margin-top:14px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-newplatform>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-newplatform>Guardar</button>' +
            '</div>' +
            '</div>';
    }
    // Antes cada plataforma se veía siempre desplegada por completo (valor, comisión, mini
    // gráfico mes a mes, y sus metas, todo junto y siempre a la vista) — mucho espacio para
    // revisar varias plataformas de un vistazo. Ahora es un acordeón: colapsada solo muestra
    // nombre + hace cuánto se actualizó + el total + una flecha; tocarla despliega el resto
    // (comisión, botones, y sus metas) debajo. Se sacó también el mini gráfico por plataforma
    // (quedaba redundante con el gráfico general de "Aportado vs. valor" más abajo) y se
    // renombró "Valor estimado" a algo que se entienda directo como el total de esa plataforma.
    function renderPlatformGroup(id) {
        if (state.editingPlatformId === id)
            return '<div class="platform-group">' + renderPlatformEditForm(id) + '</div>';
        const cat = catInfo(id);
        const valorActual = platformValorActual(id);
        const aportado = platformAportadoNeto(id);
        const diff = valorActual - aportado;
        const dias = platformDiasDesdeActualizacion(id);
        const stale = dias > DIAS_UMBRAL_ACTUALIZACION;
        const tieneMetas = metasForPlataforma(id).length > 0;
        const comision = PLATAFORMA_DATA[id].comision;
        // La comisión se cobra sobre la ganancia (total en la plataforma − aportado neto), nunca
        // sobre el total de la cuenta — si no hay ganancia todavía, la comisión estimada es $0.
        const ganancia = Math.max(0, diff);
        const comisionRow = (comision != null && !tieneMetas) ? ('<div class="platform-comision-row">' +
            '<span>Comisión anual: <b class="tabular">' + comision + '%</b></span>' +
            '<span class="muted tabular">≈ ' + money(ganancia * comision / 100) + '/año sobre tu ganancia</span>' +
            '</div>') : '';
        const open = state.platformAbierta === id;
        const header = '<button class="platform-head-toggle" data-toggle-platform="' + id + '" aria-expanded="' + (open ? 'true' : 'false') + '">' +
            '<span class="platform-icon" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + '</span>' +
            '<span class="platform-head-body">' +
            '<span class="platform-name">' + cat.nombre + '</span>' +
            '<span class="platform-update-tag' + (stale ? ' stale' : '') + '">Actualizado hace ' + dias + ' ' + (dias === 1 ? 'día' : 'días') + '</span>' +
            '</span>' +
            '<span class="platform-head-value tabular">' + money(valorActual) + '</span>' +
            '<span class="platform-chev' + (open ? ' open' : '') + '">' + ICONS.chevR + '</span>' +
            '</button>';
        if (!open)
            return '<div class="card platform-group">' + header + '</div>';
        const { metas, totalObjetivo, totalAcumulado, rachaCombinada } = platformMetasResumen(id);
        const addingHere = state.editingMetaId === 'nueva' && state.addMetaPlataformaId === id;
        const combinedPct = totalObjetivo > 0 ? (totalAcumulado / totalObjetivo) * 100 : 0;
        const combinedSummary = metas.length > 0 ? ('<div class="platform-meta-summary">' +
            '<div class="platform-meta-summary-head">' +
            '<span>Tus metas en ' + cat.nombre + '</span>' +
            (rachaCombinada > 0 ? '<span class="meta-racha-badge">' + rachaCombinada + ' 🔥</span>' : '') +
            '</div>' +
            '<div class="platform-meta-summary-figs tabular">' + money(totalAcumulado) + '<span class="of-text"> de ' + money(totalObjetivo) + '</span><span class="budget-pct tabular">' + Math.round(combinedPct) + '%</span></div>' +
            '<div class="budget-track"><div class="budget-fill" style="width:' + Math.max(0, Math.min(100, combinedPct)) + '%;background:var(--accent);"></div></div>' +
            '</div>') : '';
        const metasBody = combinedSummary + metas.map(renderMetaGoalCard).join('') +
            (addingHere
                ? renderMetaEditForm(null, id)
                : '<button class="budget-add-link platform-add-meta-link" data-add-meta="' + id + '">+ Agregar meta a ' + cat.nombre + '</button>');
        const body = '<div class="platform-body">' +
            '<div class="platform-figs">' +
            '<div class="platform-fig"><span class="platform-fig-label">Total en esta plataforma</span><span class="platform-fig-value tabular">' + money(valorActual) + '</span></div>' +
            '<div class="platform-fig"><span class="platform-fig-label">Aportado neto</span><span class="platform-fig-value tabular muted">' + money(aportado) + '</span></div>' +
            '</div>' +
            '<div class="platform-diff-row">' +
            '<span class="platform-diff ' + (diff >= 0 ? 'pos' : 'neg') + '">' + (diff >= 0 ? '+' : '−') + money(Math.abs(diff)) + ' aprox.</span>' +
            // El chip de plazo solo se muestra si todavía no tiene metas propias — en cuanto
            // agregas una meta, su plazo manda y este queda de más.
            (!tieneMetas ? plazoChip(PLATAFORMA_DATA[id].plazo) : '') +
            '</div>' +
            comisionRow +
            '<div class="platform-actions-row">' +
            '<button class="budget-ver-mas" data-platform-vermas="' + id + '">Ver transacciones →</button>' +
            '<button class="budget-edit-btn" data-edit-platform="' + id + '" aria-label="Actualizar valor de ' + cat.nombre + '">' + ICONS.edit + '</button>' +
            '</div>' +
            '<div class="platform-goal-nest">' + metasBody + '</div>' +
            '</div>';
        return '<div class="card platform-group open">' + header + body + '</div>';
    }
    // Plataformas cerradas: no cuentan en "Mis plataformas" ni en el total, pero su historial
    // de transacciones sigue intacto — este bloque solo existe para poder reabrirlas si te
    // equivocaste, o para recordar que existieron.
    function renderArchivedPlatformsBlock() {
        const ids = archivedPlatformIds();
        if (!ids.length)
            return '';
        return '<div class="section-title" style="margin-top:18px;">Plataformas cerradas</div>' +
            ids.map(id => {
                const cat = catInfo(id);
                return '<div class="card platform-card archived-card">' +
                    '<div class="platform-head">' +
                    '<span class="platform-icon" style="--fill:var(--surface-sunken);--ink:var(--text-tertiary)">' + catIconMarkup(cat.icon) + '</span>' +
                    '<span class="platform-name muted">' + cat.nombre + '</span>' +
                    '<button class="budget-edit-btn" data-reopen-platform="' + id + '" aria-label="Reabrir ' + cat.nombre + '">' + ICONS.repeat + '</button>' +
                    '</div>' +
                    '<button class="budget-ver-mas" data-platform-vermas="' + id + '">Ver transacciones →</button>' +
                    '</div>';
            }).join('');
    }
    /* ---------- planificador de sueldo ---------- */
    function round1(n) { return Math.round(n * 10) / 10; }
    function metasPorPlazo(plazo) {
        return METAS_INVERSION.filter(m => (m.plazo || null) === plazo);
    }
    function planMetaRowHtml(meta) {
        const pct = PLANIFICADOR.metaPcts[meta.id] || 0;
        return '<div class="plan-row">' +
            '<div class="plan-name">' + meta.nombre + '<small>Meta de aporte: ' + money(meta.aporteMensualMeta) + '/mes</small></div>' +
            '<div class="plan-pctbox"><input type="text" inputmode="decimal" data-plan-meta-pct data-plan-meta-id="' + meta.id + '" value="' + pct + '"><span>%</span></div>' +
            '<div class="plan-amt tabular" data-plan-meta-amt="' + meta.id + '"></div>' +
            '</div>';
    }
    function planGroupBlock(plazoKey) {
        const info = PLAZO_META[plazoKey];
        const metas = metasPorPlazo(plazoKey);
        const rows = metas.length
            ? metas.map(planMetaRowHtml).join('')
            : '<div class="plan-empty-hint muted">Sin metas de plazo ' + info.label.toLowerCase() + ' todavía — agrégalas en Inversiones.</div>';
        return '<div class="card plan-block">' +
            '<div class="plan-block-head" style="color:var(--cat-' + info.color + '-ink);"><span class="tag" style="background:var(--cat-' + info.color + '-fill);"></span>' + info.label + ' plazo</div>' +
            rows +
            (metas.length ? '<div class="plan-subtotal" style="color:var(--cat-' + info.color + '-ink);"><span>Subtotal ' + info.label.toLowerCase() + ' · <span data-plan-group-pct="' + plazoKey + '"></span>%</span><span class="plan-subtotal-amt tabular" data-plan-group-amt="' + plazoKey + '"></span></div>' : '') +
            '</div>';
    }
    function renderPlanificadorSection() {
        const P = PLANIFICADOR;
        const defaultBase = computeDefaultPlanBase();
        const mesActualLabel = MONTH_LABEL[todayISO().slice(0, 7)] || '';
        return '<div class="section-title">Planificador de sueldo</div>' +
            '<div class="card plan-base-card">' +
            '<div class="plan-base-input-row">' +
            '<div class="plan-base-field">' +
            '<label class="draft-label">Total mensual a repartir</label>' +
            '<div class="plan-base-input"><span>$</span><input type="text" inputmode="numeric" data-plan-base-input value="' + moneyPlain(P.base) + '"></div>' +
            '</div>' +
            '<div style="flex-shrink:0;">' +
            '<span class="plan-total-pill" data-plan-total-pill><span class="dot"></span><span data-plan-total-txt></span></span>' +
            '<div class="plan-unassigned" data-plan-unassigned></div>' +
            '</div>' +
            '</div>' +
            '<div class="plan-base-hint muted">Sugerido: ingresos − gastos de ' + mesActualLabel + ' = ' + money(defaultBase) + '. Edítalo si tu excedente real es otro.</div>' +
            '</div>' +
            '<div class="plan-bar" data-plan-bar></div>' +
            '<div class="plan-legend" data-plan-legend></div>' +
            '<div class="plan-cols">' +
            planGroupBlock('corto') +
            planGroupBlock('medio') +
            planGroupBlock('largo') +
            '</div>';
    }
    // Recalcula solo los números de la card de proyección al vivo, sin re-renderizar todo
    // (así los inputs de % de retorno/inflación no pierden el foco mientras se escribe).
    function updateProyeccionCompute() {
        const proy = proyeccionAportes(3, 20);
        const totalEl = document.querySelector('[data-proy-total]');
        if (totalEl)
            totalEl.textContent = money(proy.proyectadoConRetorno);
    }
    function updatePlanCompute() {
        const P = PLANIFICADOR;
        const base = P.base;
        const groupPct = { corto: 0, medio: 0, largo: 0 };
        ['corto', 'medio', 'largo'].forEach(plazoKey => {
            metasPorPlazo(plazoKey).forEach(meta => {
                const pct = P.metaPcts[meta.id] || 0;
                groupPct[plazoKey] += pct;
                const el = document.querySelector('[data-plan-meta-amt="' + meta.id + '"]');
                if (el)
                    el.textContent = money(base * pct / 100);
            });
            const pctEl = document.querySelector('[data-plan-group-pct="' + plazoKey + '"]');
            if (pctEl)
                pctEl.textContent = String(round1(groupPct[plazoKey]));
            const amtEl = document.querySelector('[data-plan-group-amt="' + plazoKey + '"]');
            if (amtEl)
                amtEl.textContent = money(base * groupPct[plazoKey] / 100);
        });
        const total = groupPct.corto + groupPct.medio + groupPct.largo;
        const pillEl = document.querySelector('[data-plan-total-pill]');
        const txtEl = document.querySelector('[data-plan-total-txt]');
        const unEl = document.querySelector('[data-plan-unassigned]');
        const diff = 100 - total;
        if (pillEl && txtEl && unEl) {
            if (Math.abs(diff) < 0.05) {
                pillEl.classList.remove('warn');
                txtEl.textContent = '100% asignado';
                unEl.textContent = '';
            }
            else if (diff > 0) {
                pillEl.classList.remove('warn');
                txtEl.textContent = round1(total) + '% asignado';
                unEl.textContent = 'Sin asignar: ' + money(base * diff / 100) + ' (' + round1(diff) + '%)';
            }
            else {
                pillEl.classList.add('warn');
                txtEl.textContent = round1(total) + '% — te pasaste';
                unEl.textContent = 'Asignaste ' + money(base * (-diff) / 100) + ' (' + round1(-diff) + '%) más de tu excedente';
            }
        }
        const barEl = document.querySelector('[data-plan-bar]');
        const legEl = document.querySelector('[data-plan-legend]');
        if (barEl && legEl) {
            barEl.innerHTML = '';
            legEl.innerHTML = '';
            const segs = [
                { pct: groupPct.corto, color: 'var(--cat-sky-fill)' },
                { pct: groupPct.medio, color: 'var(--cat-sage-fill)' },
                { pct: groupPct.largo, color: 'var(--cat-lavender-fill)' }
            ];
            const denom = Math.max(total, 100);
            segs.forEach(s => {
                if (s.pct <= 0)
                    return;
                const d = document.createElement('span');
                d.style.width = (s.pct / denom * 100) + '%';
                d.style.background = s.color;
                barEl.appendChild(d);
            });
            [['var(--cat-sky-fill)', 'Corto'], ['var(--cat-sage-fill)', 'Medio'], ['var(--cat-lavender-fill)', 'Largo']].forEach(([c, l]) => {
                const s = document.createElement('span');
                s.innerHTML = '<i style="background:' + c + '"></i>' + l;
                legEl.appendChild(s);
            });
        }
    }
    function renderInversionesView() {
        const ids = activePlatformIds();
        const totalValor = ids.reduce((s, id) => s + platformValorActual(id), 0);
        const totalAportado = ids.reduce((s, id) => s + platformAportadoNeto(id), 0);
        const totalDiff = totalValor - totalAportado;
        const invMonths = inversionesMonthsCalendarYear();
        const aportadoSerie = invMonths.map(aportadoAcumuladoHastaMesONull);
        const valorSerie = invMonths.map(valorTotalEnMesONull);
        const { totalObjetivo, totalAcumulado } = metaProgresoTotal();
        const metaPct = totalObjetivo > 0 ? (totalAcumulado / totalObjetivo) * 100 : 0;
        // Una sola card: el total invertido (aplica siempre, tengas o no metas) y, si tienes al
        // menos una meta con monto objetivo, el progreso hacia esas metas como bloque secundario
        // dentro de la misma card — antes eran dos cards separadas y no quedaba claro que "objetivo"
        // solo suma las plataformas con meta, mientras "total invertido" suma todo.
        const goalBlock = METAS_INVERSION.length ? ('<div class="platform-total-goal-block">' +
            '<div class="platform-total-label" style="color:var(--accent-ink);">Objetivo de inversión ' + todayISO().slice(0, 4) + ' (todas tus metas)</div>' +
            '<div class="platform-total-value tabular" style="font-size:20px;">' + money(totalAcumulado) + '<span class="of-text"> de ' + money(totalObjetivo) + '</span></div>' +
            '<div class="budget-track" style="margin-top:10px;"><div class="budget-fill" style="width:' + Math.max(0, Math.min(100, metaPct)) + '%;background:var(--accent);"></div></div>' +
            '<div class="platform-total-sub"><span>' + Math.round(metaPct) + '% completado entre ' + METAS_INVERSION.length + ' ' + (METAS_INVERSION.length === 1 ? 'meta' : 'metas') + '</span></div>' +
            // Detalle chico: cuánto es, en plata, "todas tus metas" sumadas por mes — y de paso deja
            // claro que ese mismo número es el que define tu % de meta de Inversión en Balance.
            '<div class="platform-total-sub" style="margin-top:2px;color:var(--text-tertiary);font-size:11.5px;">Aporte mensual objetivo: <b class="tabular">' + money(metaInversionMensualCLP()) + '</b> · ' + Math.round(metaInversionPct()) + '% de tus ingresos</div>' +
            renderMetaTotalChecksGrid() +
            '</div>') : '';
        const proy = proyeccionAportes(3, 20);
        const proyeccionCard = proy.meses.length >= 2 ? ('<div class="card proyeccion-card">' +
            '<div class="proyeccion-head"><span class="proyeccion-icon">' + ICONS.sparkle + '</span><span class="proyeccion-title">Simulador</span></div>' +
            '<div class="proyeccion-value tabular" data-proy-total>' + money(proy.proyectadoConRetorno) + '</div>' +
            '<div class="proyeccion-sub">en ' + proy.anios + ' años · pesos de hoy</div>' +
            '<div class="proyeccion-text">Aportando <input type="text" inputmode="numeric" class="proy-inline-input proy-aporte-input" data-proy-aporte-input placeholder="' + moneyPlain(Math.round(proy.promedioMensual)) + '" value="' + (state.proySimulatedAporte != null ? moneyPlain(state.proySimulatedAporte) : '') + '">/mes al ' +
            '<input type="text" inputmode="decimal" class="proy-inline-input" data-proy-retorno-input value="' + proy.retornoAnual + '">% anual, −' +
            '<input type="text" inputmode="decimal" class="proy-inline-input" data-proy-inflacion-input value="' + proy.inflacionAnual + '">% inflación.</div>' +
            '<div class="proyeccion-caption">Promedio de tus últimas 3 inversiones mensuales: <b class="tabular">' + money(proy.promedioMensual) + '</b></div>' +
            '</div>') : '';
        const html = '<div class="card platform-total-card">' +
            '<div class="platform-total-label">Total invertido</div>' +
            '<div class="platform-total-value tabular">' + money(totalValor) + '</div>' +
            '<div class="stat-grid stat-grid-compact" style="margin-top:14px;margin-bottom:0;">' +
            '<div class="stat-tile stat-inversiones"><div class="stat-label">Aportado neto</div><div class="stat-value tabular">' + money(totalAportado) + '</div></div>' +
            '<div class="stat-tile ' + (totalDiff >= 0 ? 'stat-ingresos' : 'stat-gastos') + '"><div class="stat-label">Ganancia/pérdida aprox.</div><div class="stat-value tabular">' + (totalDiff >= 0 ? '+' : '−') + money(Math.abs(totalDiff)) + '</div></div>' +
            '</div>' +
            goalBlock +
            '</div>' +
            '<div class="section-title" style="margin-top:4px;">Mis plataformas</div>' +
            ids.map(renderPlatformGroup).join('') +
            (state.creatingPlatform ? renderNewPlatformForm() : '<button class="budget-add-link" data-add-platform style="margin:4px 0 2px;margin-bottom:16px;">+ Agregar nueva plataforma</button>') +
            renderArchivedPlatformsBlock() +
            '<div class="section-title">Aportado vs. valor mes a mes</div>' +
            '<div class="card evo-card">' +
            '<div class="evo-legend-row">' +
            '<span class="evo-legend-item"><span class="evo-line-sample" style="background:var(--invest-ink);"></span>Aportado</span>' +
            '<span class="evo-legend-item"><span class="evo-line-sample dashed" style="border-color:var(--accent);"></span>Valor estimado</span>' +
            '</div>' +
            buildDualLineChart(invMonths, aportadoSerie, valorSerie, 'var(--invest-ink)', 'var(--accent)') +
            '<div class="evo-caption muted">El valor es una aproximación manual: sube y baja solo cuando tú lo actualizas, o con tus aportes y retiros.</div>' +
            '</div>' +
            renderPlanificadorSection() +
            proyeccionCard +
            '<div class="plan-disclaimer">Herramienta de orden personal, no asesoría financiera formal. Para decisiones grandes, valídalo con una persona profesional licenciada.</div>' +
            '<div style="height:12px;"></div>';
        document.getElementById('resumen-content').innerHTML = html;
        updatePlanCompute();
    }
    function renderResumenSubContent() {
        if (state.resumenSub === 'balance')
            renderBalanceView();
        else if (state.resumenSub === 'presupuesto')
            renderPresupuestoView();
        else if (state.resumenSub === 'evolucion')
            renderEvolucionView();
        else if (state.resumenSub === 'inversiones')
            renderInversionesView();
        else
            renderComingSoon(state.resumenSub);
    }
    const SUBS_META = {
        balance: { label: 'Balance' },
        presupuesto: { label: 'Presupuesto' },
        evolucion: { label: 'Evolución' },
        inversiones: { label: 'Inversiones' }
    };
    // El cuerpo interno de la barra de sub-tabs, aparte, para poder repintar SOLO esto
    // mientras se arrastra una pestaña (sin tocar #resumen-content ni perder el drag).
    function renderResumenSubtabsInner() {
        return state.resumenSubOrder.map(id => '<button class="subtab ' + (state.resumenSub === id ? 'active' : '') + (state.subtabDragId === id ? ' dragging' : '') + '" data-resumen-sub="' + id + '">' + SUBS_META[id].label + '</button>').join('');
    }
    function renderResumenView() {
        document.getElementById('header-title').textContent = 'Resumen';
        const subHtml = '<div class="subtabs" id="resumen-subtabs">' + renderResumenSubtabsInner() + '</div>';
        document.getElementById('view-root').innerHTML = subHtml + '<div id="resumen-content"></div>';
        renderResumenSubContent();
    }
    /* ===================== MENÚ (Fase 4) ===================== */
    const CAT_ICON_CHOICES = ['tags', 'cart', 'car', 'utensils', 'home', 'film', 'heart', 'repeat', 'briefcase', 'laptop', 'plusCircle', 'trending', 'bank', 'coin', 'card', 'cash', 'users', 'layers', 'sparkle', 'more'];
    const CAT_COLOR_CHOICES = ['lavender', 'mint', 'peach', 'sky', 'pink', 'butter', 'sage', 'neutral'];
    const MEDIO_ICON_CHOICES = ['card', 'bank', 'cash', 'coin'];
    // Set curado de emojis para el ícono de una categoría — no es el set completo de Unicode (eso
    // se cubre con el campo "o escribe cualquier otro emoji", que usa el teclado de emojis nativo
    // del celular, igual que en WhatsApp). Este grid es solo un atajo para los más comunes.
    const CAT_EMOJI_CHOICES = ['🛒', '🍽️', '🚕', '🏠', '💊', '🍻', '📺', '💼', '✨', '🌱', '🪙', '🛍️', '✈️', '🎁', '🐜', '🏃', '🎬',
        '🐾', '👶', '📚', '💻', '🎮', '🎵', '💅', '☕', '🍕', '🧴', '💡', '🚌', '⛽', '🧹', '🏥', '🎓', '🧸', '📱', '🖥️', '🎂', '🏋️',
        '⚽', '🎨', '📦', '🧳', '🏦', '💵', '📈', '🚗', '🧾', '🎗️'];
    function catEnUso(catId) { return TX.some(t => t.categorias.some(c => c.cat === catId)); }
    function medioEnUso(medioId) { return TX.some(t => t.medio === medioId); }
    // Otras categorías del mismo tipo (gasto/ingreso/inversión) que ya usan este color -- se
    // usa para avisar en el editor de categorías, porque dos categorías del mismo tipo con el
    // mismo color se ven como un solo bloque en los gráficos de torta (no se pueden distinguir).
    function categoriasConColor(tipo, color, excludeId) {
        return Object.keys(CATS)
            .filter(id => id !== excludeId && CATS[id].tipo === tipo && CATS[id].color === color)
            .map(id => CATS[id].nombre);
    }
    // Agrupa las transacciones marcadas con reglaAuto por comercio, para la pantalla de
    // "Reglas de clasificación" — se lee, no se crea nada nuevo acá (las reglas nacen del
    // candado dentro del detalle de una transacción, en applyLockRule).
    function reglasAgrupadas() {
        const map = {};
        TX.forEach(t => {
            if (!t.reglaAuto)
                return;
            (map[t.comercio] = map[t.comercio] || []).push(t);
        });
        return Object.keys(map).map(comercio => {
            const txs = map[comercio].slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
            const recent = txs[0];
            return {
                comercio, count: txs.length, tipo: recent.tipo, recurrencia: recent.recurrencia,
                cat: recent.categorias[0] ? recent.categorias[0].cat : null
            };
        }).sort((a, b) => a.comercio.localeCompare(b.comercio));
    }
    function menuScreenHead(title) {
        return '<div class="menu-screen-head"><button class="menu-back-btn" data-menu-back aria-label="Volver al menú">' + ICONS.chevL + '</button><h2 class="menu-screen-title">' + title + '</h2></div>';
    }
    /* ---------- descargas reales: CSV y JSON ---------- */
    function downloadFile(filename, content, mime) {
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function csvEscape(s) {
        s = String(s == null ? '' : s);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    function buildTransaccionesCSV() {
        const header = ['fecha', 'hora', 'comercio', 'monto', 'tipo', 'categoria', 'medio', 'recurrencia', 'estado'];
        const rows = TX.slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora)).map(t => {
            const catNames = t.categorias.map(c => catInfo(c.cat).nombre).join(' / ');
            const medioNombre = MEDIOS[t.medio] ? MEDIOS[t.medio].nombre : t.medio;
            return [t.fecha, t.hora, csvEscape(t.comercio), t.monto, t.tipo, csvEscape(catNames), csvEscape(medioNombre), t.recurrencia, t.estado].join(',');
        });
        // ﻿: BOM para que Excel abra bien los acentos y la ñ en Windows.
        return '﻿' + header.join(',') + '\n' + rows.join('\n');
    }
    function buildBackupJSON() {
        const snapshot = Object.assign({ app: 'Pitucas sin lucas', version: 2, exportadoEl: todayISO() }, buildFullStateBlob());
        return JSON.stringify(snapshot, null, 2);
    }
    /* ---------- importar CSV de cartola (parser simple) ---------- */
    function splitCsvLine(line) {
        const out = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                inQ = !inQ;
                continue;
            }
            if (ch === ',' && !inQ) {
                out.push(cur);
                cur = '';
                continue;
            }
            cur += ch;
        }
        out.push(cur);
        return out;
    }
    function normalizeFecha(raw) {
        raw = String(raw || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw))
            return raw;
        const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m)
            return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
        return null;
    }
    function parseCsvMonto(raw) {
        raw = String(raw || '').trim().replace(/\$/g, '').replace(/\s/g, '');
        if (raw === '')
            return NaN;
        const neg = /^-/.test(raw) || /^\(.*\)$/.test(raw);
        raw = raw.replace(/[()\-]/g, '');
        if (raw.includes(',') && raw.includes('.'))
            raw = raw.replace(/\./g, '').replace(',', '.');
        else if (raw.includes(','))
            raw = raw.replace(',', '.');
        else
            raw = raw.replace(/\.(?=\d{3}(\D|$))/g, '');
        const v = parseFloat(raw);
        if (isNaN(v))
            return NaN;
        return neg ? -v : v;
    }
    function parseCartolaCSV(text) {
        const lines = String(text || '').split(/\r\n|\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
        lines.shift(); // primera línea = encabezado, se descarta siempre
        const rows = [], errors = [];
        lines.forEach((line, idx) => {
            const parts = splitCsvLine(line);
            if (parts.length < 3) {
                errors.push('Línea ' + (idx + 2) + ': formato inválido');
                return;
            }
            const fecha = normalizeFecha(parts[0]);
            const descripcion = (parts[1] || '').trim();
            const monto = parseCsvMonto(parts[2]);
            if (!fecha || !descripcion || isNaN(monto)) {
                errors.push('Línea ' + (idx + 2) + ': no se pudo leer la fecha, descripción o monto');
                return;
            }
            rows.push({ fecha, descripcion, monto });
        });
        return { rows, errors };
    }
    function importCartolaRows(rows) {
        const reglaByComercio = {};
        reglasAgrupadas().forEach(r => { reglaByComercio[r.comercio] = r; });
        let conRegla = 0, pendientes = 0;
        rows.forEach(row => {
            const regla = reglaByComercio[row.descripcion];
            const tipo = regla ? regla.tipo : (row.monto < 0 ? 'gasto' : 'ingreso');
            const monto = Math.abs(row.monto);
            const categorias = regla && regla.cat ? [{ cat: regla.cat, monto }] : [];
            const estado = regla && regla.cat ? 'confirmado' : 'pendiente';
            if (regla && regla.cat)
                conRegla++;
            else
                pendientes++;
            TX.unshift({
                id: 'timp' + (++importIdCounter), fecha: row.fecha, hora: '00:00', comercio: row.descripcion,
                monto, medio: ensureCuentaVistaMedio(), tipo, recurrencia: regla ? regla.recurrencia : 'variable', estado,
                categorias, porCobrar: [], reglaAuto: !!(regla && regla.cat), nota: 'Importado desde cartola CSV'
            });
        });
        return { creadas: rows.length, conRegla, pendientes };
    }
    /* ---------- pantalla principal ---------- */
    function renderMenuMain() {
        const nReglas = reglasAgrupadas().length;
        const items = [
            { section: 'cuenta', icon: 'lockSmall', label: 'Mi cuenta', sub: currentUser ? currentUser.email : 'Sesión' },
            { section: 'categorias', icon: 'tags', label: 'Categorías', sub: Object.keys(CATS).length + ' categorías' },
            { section: 'medios', icon: 'card', label: 'Medios de pago', sub: Object.keys(MEDIOS).length + ' medios de pago' },
            { section: 'reglas', icon: 'lockSmall', label: 'Reglas de clasificación', sub: nReglas + ' regla' + (nReglas === 1 ? '' : 's') + ' automática' + (nReglas === 1 ? '' : 's') },
            { section: 'exportar', icon: 'trending', label: 'Exportar a Excel', sub: 'Descarga tus transacciones en un CSV' },
            { section: 'respaldo', icon: 'inbox', label: 'Respaldo en JSON', sub: 'Descarga una copia completa de tus datos' },
            { section: 'importar', icon: 'plusCircle', label: 'Importar CSV de cartola', sub: 'Sube movimientos desde un archivo de tu banco' },
            { section: 'importarcorreo', icon: 'inbox', label: 'Importar desde tu correo', sub: 'Automático, vía Gmail' },
            { section: 'notificaciones', icon: 'bell', label: 'Notificaciones', sub: state.notifSubscribed ? 'Activadas en este dispositivo' : 'Avísame de transacciones y presupuesto' },
            { section: 'reconciliar', icon: 'checkCircle', label: 'Reconciliar con la cartola', sub: 'Compara un mes contra el PDF de tu banco' },
            { section: 'demo', icon: 'lock', label: 'Modo demo', sub: state.demoMode ? 'Activado' : 'Desactivado' },
            { section: 'asesoria', icon: 'sparkle', label: 'Asesoría financiera con Claude', sub: 'Próximamente' }
        ];
        document.getElementById('view-root').innerHTML =
            '<ul class="menu-list">' + items.map(i => '<li><button class="menu-list-item" data-menu-open="' + i.section + '">' +
                '<span class="menu-item-icon">' + ICONS[i.icon] + '</span>' +
                '<span class="menu-item-label">' + i.label + '<span class="menu-item-sub">' + i.sub + '</span></span>' +
                '<span class="menu-item-chev">' + ICONS.chevL + '</span>' +
                '</button></li>').join('') + '</ul>';
    }
    /* ---------- categorías ---------- */
    function renderMenuCatEditForm() {
        const d = state.catDraft;
        const isNew = state.editingCatId === 'nueva';
        return '<div class="card" style="padding:16px;">' +
            '<label class="draft-label">Nombre</label>' +
            '<input type="text" class="draft-input" data-cat-draft-field="nombre" value="' + d.nombre + '" placeholder="Ej: Mascotas">' +
            '<label class="draft-label" style="margin-top:12px;">Tipo</label>' +
            segmentedHtml('cat-draft-tipo', [{ id: 'gasto', label: 'Gasto' }, { id: 'ingreso', label: 'Ingreso' }], d.tipo, !isNew) +
            (!isNew ? '<div class="platform-hint muted">El tipo no se puede cambiar una vez creada la categoría.</div>' : '') +
            '<label class="draft-label" style="margin-top:12px;">Ícono</label>' +
            '<div class="icon-picker emoji-icon-picker">' + CAT_EMOJI_CHOICES.map(em => '<button type="button" data-cat-draft-icon="' + em + '" class="' + (d.icon === em ? 'active' : '') + '">' + em + '</button>').join('') + '</div>' +
            '<input type="text" class="draft-input" data-cat-draft-field="icon" value="' + d.icon + '" maxlength="8" placeholder="O escribe/pega cualquier otro emoji 😊" style="margin-top:8px;text-align:center;">' +
            '<label class="draft-label" style="margin-top:12px;">Color</label>' +
            '<div class="color-picker">' + CAT_COLOR_CHOICES.map(c => '<button type="button" data-cat-draft-color="' + c + '" class="' + (d.color === c ? 'active' : '') + '" style="--sw:var(--cat-' + c + '-fill)"></button>').join('') + '</div>' +
            (function () {
                const excludeId = isNew ? null : state.editingCatId;
                const colision = categoriasConColor(d.tipo, d.color, excludeId);
                return colision.length
                    ? '<div class="file-format-hint" style="color:var(--expense-ink);">Ese color ya lo usa "' + colision.join('", "') + '" -- en los gráficos de torta se van a ver como un solo bloque. Prueba otro color.</div>'
                    : '';
            })() +
            '<div style="display:flex;gap:10px;margin-top:16px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-cat-edit>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-cat="' + (isNew ? 'nueva' : state.editingCatId) + '">Guardar</button>' +
            '</div>' +
            (!isNew && !catEnUso(state.editingCatId) ? '<button class="budget-delete-link" data-delete-cat="' + state.editingCatId + '">Eliminar categoría</button>' : '') +
            (!isNew && catEnUso(state.editingCatId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '') +
            '</div>';
    }
    function renderMenuCategorias() {
        if (state.editingCatId) {
            document.getElementById('view-root').innerHTML = menuScreenHead('Categorías') + renderMenuCatEditForm();
            return;
        }
        function rowFor(id) {
            const c = CATS[id];
            return '<div class="card menu-item-card">' +
                '<span class="menu-item-card-icon" style="--fill:var(--cat-' + c.color + '-fill);--ink:var(--cat-' + c.color + '-ink)">' + catIconMarkup(c.icon) + '</span>' +
                '<div class="menu-item-card-body"><div class="menu-item-card-name">' + c.nombre + '</div></div>' +
                '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-cat="' + id + '" aria-label="Editar ' + c.nombre + '">' + ICONS.edit + '</button></div>' +
                '</div>';
        }
        function readonlyRowFor(id) {
            const c = CATS[id];
            return '<div class="card menu-item-card">' +
                '<span class="menu-item-card-icon" style="--fill:var(--cat-' + c.color + '-fill);--ink:var(--cat-' + c.color + '-ink)">' + catIconMarkup(c.icon) + '</span>' +
                '<div class="menu-item-card-body"><div class="menu-item-card-name">' + c.nombre + '</div><div class="menu-item-card-sub">Se administra desde Inversiones</div></div>' +
                '</div>';
        }
        const gastoIds = Object.keys(CATS).filter(k => CATS[k].tipo === 'gasto');
        const ingresoIds = Object.keys(CATS).filter(k => CATS[k].tipo === 'ingreso');
        // Una plataforma cerrada no se muestra acá — "cerrar" la saca de todas las vistas activas,
        // igual que en Inversiones (su historial de transacciones sigue intacto, solo se deja de
        // administrar desde este lado; se puede reabrir en Inversiones y vuelve a aparecer).
        const inversionIds = Object.keys(CATS).filter(k => CATS[k].tipo === 'inversion' && !isPlatformArchived(k));
        document.getElementById('view-root').innerHTML = menuScreenHead('Categorías') +
            '<div class="menu-list-divider">Gastos</div>' + gastoIds.map(rowFor).join('') +
            '<div class="menu-list-divider">Ingresos</div>' + ingresoIds.map(rowFor).join('') +
            '<button class="budget-add-link" data-add-cat style="margin:2px 0 16px;">+ Agregar categoría</button>' +
            '<div class="menu-list-divider">Inversión</div>' +
            '<p class="muted" style="font-size:12px;margin:0 0 8px;">Estas categorías nacen solas cuando creas una plataforma o meta en Inversiones.</p>' +
            inversionIds.map(readonlyRowFor).join('');
    }
    /* ---------- medios de pago ---------- */
    function renderMenuMedioEditForm() {
        const d = state.medioDraft;
        const isNew = state.editingMedioId === 'nueva';
        return '<div class="card" style="padding:16px;">' +
            '<label class="draft-label">Nombre</label>' +
            '<input type="text" class="draft-input" data-medio-draft-field="nombre" value="' + d.nombre + '" placeholder="Ej: Mastercard Falabella">' +
            '<label class="draft-label" style="margin-top:12px;">Detalle (opcional)</label>' +
            '<input type="text" class="draft-input" data-medio-draft-field="corto" value="' + d.corto + '" placeholder="Ej: •••• 1234">' +
            '<label class="draft-label" style="margin-top:12px;">Ícono</label>' +
            '<div class="icon-picker" style="grid-template-columns:repeat(4,1fr);">' + MEDIO_ICON_CHOICES.map(ic => '<button type="button" data-medio-draft-icon="' + ic + '" class="' + (d.icon === ic ? 'active' : '') + '">' + ICONS[ic] + '</button>').join('') + '</div>' +
            '<div style="display:flex;gap:10px;margin-top:16px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-medio-edit>Cancelar</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-save-medio="' + (isNew ? 'nueva' : state.editingMedioId) + '">Guardar</button>' +
            '</div>' +
            (!isNew && !medioEnUso(state.editingMedioId) ? '<button class="budget-delete-link" data-delete-medio="' + state.editingMedioId + '">Eliminar medio de pago</button>' : '') +
            (!isNew && medioEnUso(state.editingMedioId) ? '<div class="file-format-hint">No se puede eliminar: tiene transacciones asociadas.</div>' : '') +
            '</div>';
    }
    function renderMenuMedios() {
        if (state.editingMedioId) {
            document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago') + renderMenuMedioEditForm();
            return;
        }
        const rows = Object.keys(MEDIOS).map(id => {
            const m = MEDIOS[id];
            return '<div class="card menu-item-card">' +
                '<span class="menu-item-card-icon" style="--fill:var(--surface-sunken);--ink:var(--text-secondary);">' + ICONS[m.icon] + '</span>' +
                '<div class="menu-item-card-body"><div class="menu-item-card-name">' + m.nombre + '</div><div class="menu-item-card-sub">' + m.corto + '</div></div>' +
                '<div class="menu-item-card-actions"><button class="budget-edit-btn" data-edit-medio="' + id + '" aria-label="Editar ' + m.nombre + '">' + ICONS.edit + '</button></div>' +
                '</div>';
        }).join('');
        document.getElementById('view-root').innerHTML = menuScreenHead('Medios de pago') +
            rows + '<button class="budget-add-link" data-add-medio style="margin:2px 0 4px;">+ Agregar medio de pago</button>';
    }
    /* ---------- reglas de clasificación ---------- */
    function renderMenuReglas() {
        const reglas = reglasAgrupadas();
        document.getElementById('view-root').innerHTML = menuScreenHead('Reglas de clasificación') +
            '<p class="muted" style="font-size:12.5px;margin:0 0 14px;line-height:1.5;">Cuando activas el candado dentro del detalle de una transacción, esa categoría, tipo y recurrencia se aplican a futuras compras del mismo comercio. Acá puedes revisarlas y eliminarlas.</p>' +
            (reglas.length === 0 ?
                '<div class="card placeholder-card">' + ICONS.lockSmall + '<h3>Todavía no tienes reglas</h3><p>Actívalas desde el detalle de cualquier transacción, con el ícono de candado.</p></div>'
                : reglas.map(r => {
                    const cat = r.cat ? catInfo(r.cat) : null;
                    return '<div class="card rule-card">' +
                        '<div class="rule-card-head">' +
                        '<span class="rule-card-comercio">' + r.comercio + '</span>' +
                        '<span class="rule-card-count">' + r.count + ' transac.</span>' +
                        '<button class="budget-edit-btn" data-delete-regla="' + encodeURIComponent(r.comercio) + '" aria-label="Eliminar regla de ' + r.comercio + '">' + ICONS.trash + '</button>' +
                        '</div>' +
                        '<div class="rule-card-detail">' +
                        (cat ? '<span class="rule-card-catchip" style="--fill:var(--cat-' + cat.color + '-fill);--ink:var(--cat-' + cat.color + '-ink)">' + catIconMarkup(cat.icon) + ' ' + cat.nombre + '</span>' : '') +
                        '<span>' + (r.tipo === 'gasto' ? 'Gasto' : r.tipo === 'ingreso' ? 'Ingreso' : 'Inversión') + '</span>' +
                        '<span>·</span><span>' + (r.recurrencia === 'mensual' ? 'Fijo mensual' : 'Variable') + '</span>' +
                        '</div>' +
                        '</div>';
                }).join(''));
    }
    /* ---------- exportar / respaldo / importar ---------- */
    function renderMenuExportar() {
        document.getElementById('view-root').innerHTML = menuScreenHead('Exportar a Excel') +
            '<div class="card" style="padding:16px;">' +
            '<div class="menu-item-card" style="padding:0;margin-bottom:16px;">' +
            '<span class="menu-item-card-icon" style="--fill:var(--cat-sage-fill);--ink:var(--cat-sage-ink)">' + ICONS.trending + '</span>' +
            '<div class="menu-item-card-body"><div class="menu-item-card-name">' + TX.length + ' transacciones</div><div class="menu-item-card-sub">Se exportan todas, sin importar el filtro o mes abierto</div></div>' +
            '</div>' +
            '<button class="save-tx-btn" data-export-csv style="width:100%;">Descargar CSV</button>' +
            '<div class="file-format-hint">Se abre directo en Excel, Google Sheets o Numbers. Columnas: <code>fecha, hora, comercio, monto, tipo, categoria, medio, recurrencia, estado</code>.</div>' +
            '</div>';
    }
    function renderMenuRespaldo() {
        document.getElementById('view-root').innerHTML = menuScreenHead('Respaldo en JSON') +
            '<div class="card" style="padding:16px;">' +
            '<div class="menu-item-card" style="padding:0;margin-bottom:16px;">' +
            '<span class="menu-item-card-icon" style="--fill:var(--cat-sky-fill);--ink:var(--cat-sky-ink)">' + ICONS.inbox + '</span>' +
            '<div class="menu-item-card-body"><div class="menu-item-card-name">Copia completa de tus datos</div><div class="menu-item-card-sub">Transacciones, categorías, medios, presupuestos, metas y plataformas</div></div>' +
            '</div>' +
            '<button class="save-tx-btn" data-export-json style="width:100%;">Descargar JSON</button>' +
            '<div class="file-format-hint">Pensado para guardar una copia de respaldo o migrarla más adelante — no se puede volver a importar desde esta maqueta.</div>' +
            '</div>';
    }
    function renderMenuImportar() {
        const s = state.importSummary;
        document.getElementById('view-root').innerHTML = menuScreenHead('Importar CSV de cartola') + (s ?
            '<div class="card" style="padding:16px;">' +
                '<div class="menu-item-card" style="padding:0;margin-bottom:14px;">' +
                '<span class="menu-item-card-icon" style="--fill:var(--cat-mint-fill);--ink:var(--cat-mint-ink)">' + ICONS.checkCircle + '</span>' +
                '<div class="menu-item-card-body"><div class="menu-item-card-name">' + s.archivo + '</div><div class="menu-item-card-sub">' + s.creadas + ' fila' + (s.creadas === 1 ? '' : 's') + ' leída' + (s.creadas === 1 ? '' : 's') + '</div></div>' +
                '</div>' +
                '<div class="rule-card-detail" style="margin-bottom:8px;">' + ICONS.check + '<span>' + s.creadas + ' transacciones creadas</span></div>' +
                '<div class="rule-card-detail" style="margin-bottom:8px;">' + ICONS.lockSmall + '<span>' + s.conRegla + ' categorizadas automáticamente por una regla existente</span></div>' +
                '<div class="rule-card-detail" style="margin-bottom:' + (s.errores.length ? '8px' : '0') + ';">' + ICONS.question + '<span>' + s.pendientes + ' quedaron pendientes de categorizar</span></div>' +
                (s.errores.length ? '<div class="rule-card-detail" style="color:var(--expense-ink);">' + s.errores.length + ' fila' + (s.errores.length === 1 ? '' : 's') + ' no se pudo leer</div>' : '') +
                '<button class="budget-add-link" data-import-again style="margin-top:14px;">Importar otro archivo</button>' +
                (s.pendientes > 0 ? '<button class="save-tx-btn" style="width:100%;margin-top:10px;" data-goto-pendientes>Ir a categorizarlas</button>' : '') +
                '</div>'
            :
                '<div class="card file-drop-card">' +
                    ICONS.inbox +
                    '<p>Sube un archivo CSV con tus movimientos. Cada fila necesita fecha, descripción del comercio y monto (negativo para gastos, positivo para ingresos).</p>' +
                    '<label class="save-tx-btn" style="display:inline-block;cursor:pointer;">Elegir archivo<input type="file" accept=".csv,text/csv" data-csv-file-input style="display:none;"></label>' +
                    '<div class="file-format-hint">Formato esperado: <code>fecha,descripcion,monto</code><br>Ej: <code>2026-08-20,Jumbo Ñuñoa,-45000</code></div>' +
                    '</div>');
    }
    /* ---------- reconciliar con la cartola (PDF) ----------
       Lee el PDF de la cartola (cuenta corriente o estado de cuenta de tarjeta de crédito)
       directo en el navegador con pdf.js — el archivo nunca se sube a ningún servidor nuestro.
       Extrae cada movimiento por posición (columna) en vez de solo el orden del texto, porque
       el texto plano de estos PDF no alcanza a distinguir columna de cargo/abono/saldo (todas
       son solo números seguidos). Las coordenadas de las columnas fueron medidas contra
       cartolas reales de Banco Edwards (cuenta corriente y tarjeta Visa/Mastercard) — el mismo
       banco emite ambas con el mismo formato. */
    const RECON_PDFJS_VERSION = '3.11.174';
    const CC_COLS = { fecha: [15, 50], detalle: [50, 236], sucursal: [236, 343], cargo: [343, 419], abono: [419, 533], saldo: [533, 650] };
    const TC_COLS = { lugar: [20, 97], fecha: [97, 140], codigo: [140, 194], detalle: [194, 379], monto_op: [379, 441], monto_pagar: [441, 503], ncuota: [503, 534], valor_cuota: [534, 650] };
    function ensurePdfJs() {
        if (typeof pdfjsLib === 'undefined')
            return false;
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + RECON_PDFJS_VERSION + '/pdf.worker.min.js';
        }
        return true;
    }
    function parseMontoCLP(s) {
        if (!s)
            return null;
        const neg = /-/.test(s);
        const digits = s.replace(/[^0-9]/g, '');
        if (!digits)
            return null;
        const v = parseInt(digits, 10);
        return neg ? -v : v;
    }
    async function extractPdfPagesWords(arrayBuffer, password) {
        const params = { data: arrayBuffer };
        if (password)
            params.password = password;
        const pdf = await pdfjsLib.getDocument(params).promise;
        const pages = [];
        for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 1 });
            const content = await page.getTextContent();
            const words = [];
            content.items.forEach(function (it) {
                const text = (it.str || '').trim();
                if (!text)
                    return;
                // pdf.js da y en coordenadas PDF (0 = borde INFERIOR de la página) — lo damos vuelta
                // para que "top" crezca hacia abajo, como en cualquier lectura normal de la página.
                words.push({ text: text, x0: it.transform[4], top: viewport.height - it.transform[5] });
            });
            pages.push(words);
        }
        return pages;
    }
    function groupRows(words) {
        // Agrupa por cercanía (no por una grilla fija) porque en el mismo renglón visual, la
        // columna de la fecha puede quedar 1-2pt más arriba/abajo que la del detalle o el monto
        // (distinta línea base de fuente) — una grilla fija de redondeo los partía en dos filas
        // distintas justo en el límite del redondeo.
        const TOL = 4;
        const sorted = words.slice().sort(function (a, b) { return a.top - b.top; });
        const rows = [];
        sorted.forEach(function (w) {
            let row = null;
            for (let i = rows.length - 1; i >= 0; i--) {
                if (Math.abs(rows[i].top - w.top) <= TOL) {
                    row = rows[i];
                    break;
                }
                if (rows[i].top < w.top - TOL)
                    break; // ya no hay filas más cercanas posibles
            }
            if (!row) {
                row = { top: w.top, items: [] };
                rows.push(row);
            }
            row.items.push(w);
            row.top = (row.top * (row.items.length - 1) + w.top) / row.items.length;
        });
        rows.sort(function (a, b) { return a.top - b.top; });
        return rows.map(function (r) { return r.items.slice().sort(function (a, b) { return a.x0 - b.x0; }); });
    }
    function bucketColumn(x0, cols) {
        for (const name in cols) {
            const r = cols[name];
            if (x0 >= r[0] && x0 < r[1])
                return name;
        }
        return null;
    }
    // Devuelve un objeto plano con una clave de texto por cada columna de "cols" (ej. fecha,
    // detalle, cargo, abono para CC_COLS) -- Record<string,string> porque las claves son
    // dinámicas (dependen de qué "cols" se le pase: CC_COLS o TC_COLS), pero el valor de cada una
    // siempre termina siendo el texto de esa columna ya unido y recortado.
    function bucketizeRow(row, cols) {
        const out = {};
        Object.keys(cols).forEach(function (k) { out[k] = []; });
        row.forEach(function (w) {
            const b = bucketColumn(w.x0, cols);
            if (b)
                out[b].push(w.text);
        });
        const flat = {};
        Object.keys(out).forEach(function (k) { flat[k] = out[k].join(' ').trim(); });
        return flat;
    }
    function detectarTipoCartola(pagesWords) {
        const t = (pagesWords[0] || []).map(function (w) { return w.text; }).join(' ').toUpperCase();
        if (t.indexOf('TARJETA DE CR') !== -1 && t.indexOf('NACIONAL') !== -1)
            return 'tarjeta_nacional';
        if (t.indexOf('CUENTA CORRIENTE') !== -1)
            return 'cuenta_corriente';
        return null;
    }
    // De la primera página saca la fecha "HASTA" del período (contexto de año/mes), porque las
    // filas de la cuenta corriente solo traen día/mes, sin año.
    function contextoAnioCuentaCorriente(pagesWords) {
        const t = (pagesWords[0] || []).map(function (w) { return w.text; }).join(' ');
        const fechas = t.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
        if (!fechas.length)
            return { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
        // la última fecha DD/MM/AAAA que aparece en el encabezado es la fecha "HASTA"
        const ultima = fechas[fechas.length - 1];
        const [dd, mm, yyyy] = ultima.split('/').map(Number);
        return { year: yyyy, month: mm };
    }
    function fechaConContexto(ddmm, ctx) {
        const m = ddmm.match(/^(\d{2})\/(\d{2})$/);
        if (!m)
            return null;
        const dd = m[1], mm = parseInt(m[2], 10);
        const year = (mm <= ctx.month) ? ctx.year : (ctx.year - 1);
        return year + '-' + String(mm).padStart(2, '0') + '-' + dd;
    }
    function parseCuentaCorrienteMovs(pagesWords) {
        const ctx = contextoAnioCuentaCorriente(pagesWords);
        const merged = [];
        pagesWords.forEach(function (words) {
            const rows = groupRows(words).map(function (r) { return bucketizeRow(r, CC_COLS); });
            let i = 0;
            while (i < rows.length) {
                const r = rows[i];
                if (/^\d{2}\/\d{2}$/.test(r.fecha)) {
                    // normalmente fecha+detalle+monto ya vienen juntos en la misma fila agrupada; solo
                    // si esta fila viene "pelada" (sin detalle ni montos) se completa con la siguiente
                    if (r.detalle && (r.cargo || r.abono)) {
                        merged.push({ fecha: r.fecha, detalle: r.detalle, cargo: r.cargo, abono: r.abono });
                        i += 1;
                    }
                    else {
                        const nxt = rows[i + 1] || { detalle: '', sucursal: '', cargo: '', abono: '', saldo: '' };
                        const detalle = (r.detalle + ' ' + nxt.detalle).replace(/\s+/g, ' ').trim();
                        merged.push({ fecha: r.fecha, detalle: detalle, cargo: r.cargo || nxt.cargo, abono: r.abono || nxt.abono });
                        i += 2;
                    }
                }
                else {
                    i += 1;
                }
            }
        });
        const movimientos = [];
        merged.forEach(function (r) {
            const fechaISO = fechaConContexto(r.fecha, ctx);
            if (!fechaISO)
                return;
            const cargo = parseMontoCLP(r.cargo);
            const abono = parseMontoCLP(r.abono);
            if (cargo === null && abono === null)
                return; // fila sin montos (saldo inicial/final, ruido)
            const detalleUpper = r.detalle.toUpperCase();
            let esEspecial = null;
            if (/SUELDO/.test(detalleUpper))
                esEspecial = 'sueldo';
            else if (/CARGO POR PAGO TC|PAGO TARJETA DE CREDITO|PAGO TARJETA DE CR/.test(detalleUpper))
                esEspecial = 'pago_tarjeta';
            const contraparte = r.detalle.match(/(?:DE|A)\s*:\s*(.+?)(?:\s+(?:INTERNET|CENTRAL))?$/i);
            const comercioSugerido = contraparte ? contraparte[1].trim() : r.detalle.replace(/\s+(INTERNET|CENTRAL)$/i, '').trim();
            movimientos.push({
                fecha: fechaISO,
                detalle: r.detalle,
                comercioSugerido: comercioSugerido || r.detalle,
                monto: abono !== null ? abono : -Math.abs(cargo),
                tipoMov: abono !== null ? 'ingreso' : 'gasto',
                esEspecial: esEspecial
            });
        });
        return movimientos;
    }
    function parseTarjetaNacionalMovs(pagesWords) {
        const merged = [];
        pagesWords.forEach(function (words) {
            const rows = groupRows(words).map(function (r) { return bucketizeRow(r, TC_COLS); });
            rows.forEach(function (r) {
                if (/^\d{2}\/\d{2}\/\d{2}$/.test(r.fecha) && /\$/.test(r.monto_op))
                    merged.push(r);
            });
        });
        const movimientos = [];
        merged.forEach(function (r) {
            const [dd, mm, yy] = r.fecha.split('/');
            const fechaISO = '20' + yy + '-' + mm + '-' + dd;
            const monto = parseMontoCLP(r.monto_op);
            if (monto === null)
                return;
            // A veces pdf.js entrega el nombre del comercio pegado al código de operación en un solo
            // texto (p.ej. "270711605897 VIRTUAL*RECAUDACION"), que arranca dentro de la columna
            // "codigo" aunque se extienda visualmente hacia "detalle" — así que sacamos el código
            // numérico del inicio y usamos el resto como parte del detalle/comercio.
            const codigoSinNumero = r.codigo.replace(/^\d{6,}\s*/, '').trim();
            const detalleCompleto = (codigoSinNumero + ' ' + r.detalle).replace(/\s+/g, ' ').trim();
            const filaCompleta = (r.codigo + ' ' + r.detalle).toUpperCase();
            let esEspecial = null;
            if (/MONTO CANCELADO/.test(filaCompleta))
                esEspecial = 'pago_recibido'; // pago hecho a la tarjeta, no una compra
            movimientos.push({
                fecha: fechaISO,
                detalle: detalleCompleto,
                comercioSugerido: detalleCompleto,
                monto: monto < 0 ? monto : -Math.abs(monto), // en la cartola de tarjeta, toda compra es un gasto
                tipoMov: 'gasto',
                esEspecial: esEspecial
            });
        });
        return movimientos;
    }
    async function parseCartolaPDF(arrayBuffer, password) {
        if (!ensurePdfJs())
            throw new Error('No se pudo cargar el lector de PDF (revisa tu conexión a internet).');
        let pagesWords;
        try {
            pagesWords = await extractPdfPagesWords(arrayBuffer, password);
        }
        catch (err) {
            // pdf.js lanza este código cuando el PDF tiene clave y falta o está mala — un mensaje
            // más claro que el genérico de la librería.
            if (err && err.name === 'PasswordException')
                throw new Error('PDF_PASSWORD_REQUERIDA');
            throw err;
        }
        const tipo = detectarTipoCartola(pagesWords);
        if (tipo === 'cuenta_corriente')
            return { tipo, movimientos: parseCuentaCorrienteMovs(pagesWords) };
        if (tipo === 'tarjeta_nacional')
            return { tipo, movimientos: parseTarjetaNacionalMovs(pagesWords) };
        return { tipo: null, movimientos: [] };
    }
    // ---- Cartolas capturadas por correo (Menú > "Reconciliar con la cartola") ----
    // Convierte el bytea que devuelve Supabase (texto hexadecimal tipo "\\x2550..." o, según el
    // cliente, ya un array de bytes) al ArrayBuffer que pdf.js necesita.
    function pgBytesToArrayBuffer(val) {
        if (val instanceof ArrayBuffer)
            return val;
        if (Array.isArray(val))
            return new Uint8Array(val).buffer;
        let hex = String(val || '');
        if (hex.slice(0, 2) === '\\x')
            hex = hex.slice(2);
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++)
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        return bytes.buffer;
    }
    async function cargarCartolasDisponibles() {
        if (!sb || !currentHouseholdId)
            return;
        try {
            const { data, error } = await sb.from('cartolas_importadas')
                .select('id,tipo,nombre_archivo,recibido_en')
                .eq('household_id', currentHouseholdId)
                .eq('procesado', false)
                .order('recibido_en', { ascending: false });
            if (error)
                throw error;
            state.reconciliar.disponibles = data || [];
        }
        catch (err) {
            console.error('Pitucas sin lucas — error cargando cartolas por correo:', err);
            state.reconciliar.disponibles = [];
        }
        if (state.menuSection === 'reconciliar')
            renderMenuView();
    }
    async function usarCartolaImportada(id, password) {
        const item = state.reconciliar.disponibles.find(function (d) { return d.id === id; });
        if (!item)
            return;
        state.reconciliar.cargando = true;
        state.reconciliar.errorPassword = null;
        renderMenuView();
        try {
            const { data, error } = await sb.from('cartolas_importadas').select('contenido').eq('id', id).single();
            if (error)
                throw error;
            const buf = pgBytesToArrayBuffer(data.contenido);
            const res = await parseCartolaPDF(buf, password);
            state.reconciliar.cargando = false;
            if (!res.tipo) {
                state.reconciliar.error = 'No reconocí el formato de este PDF — pruébalo subiéndolo a mano para revisar.';
                renderMenuView();
                return;
            }
            state.reconciliar.archivo = item.nombre_archivo || (item.tipo === 'cuenta_corriente' ? 'Cartola cuenta corriente' : 'Estado de cuenta tarjeta');
            res.movimientos.forEach(function (m) { m.__match = buscarTxParecida(m); });
            state.reconciliar.tipo = res.tipo;
            state.reconciliar.movimientos = res.movimientos;
            state.reconciliar.usandoId = null;
            renderMenuView();
            // Se marca "procesada" en segundo plano — si esto fallara, en el peor caso te la vuelve
            // a ofrecer el próximo mes (no hay riesgo de perder nada por marcarla mal).
            sb.from('cartolas_importadas').update({ procesado: true }).eq('id', id).then(function () { }, function () { });
        }
        catch (err) {
            state.reconciliar.cargando = false;
            if (err && err.message === 'PDF_PASSWORD_REQUERIDA') {
                state.reconciliar.errorPassword = password ? 'Esa clave no abrió el archivo — pruébala de nuevo.' : 'Este PDF pide una clave.';
            }
            else {
                state.reconciliar.errorPassword = 'No se pudo leer el archivo: ' + (err && err.message ? err.message : err);
            }
            renderMenuView();
        }
    }
    // Cartola elegida a mano con "Elegir archivo PDF" (Menú > Reconciliar). A diferencia de las
    // que llegan por correo, acá el archivo nunca sale del navegador — si pide clave, se guarda su
    // ArrayBuffer en memoria (nunca la clave) mientras se muestra el mismo tipo de campo que usan
    // las cartolas de correo, y se vuelve a intentar leer cuando el usuario aprieta "Abrir".
    async function intentarAbrirArchivoCartola(buffer, nombre, password) {
        state.reconciliar.cargando = true;
        state.reconciliar.error = null;
        state.reconciliar.errorPassword = null;
        renderMenuView();
        try {
            // pdf.js toma "posesión" del ArrayBuffer que le pasamos (lo transfiere a su worker interno
            // y lo deja inutilizable después) — por eso siempre le mandamos una COPIA (slice(0)) y
            // guardamos el original intacto en el estado, para poder reintentar con otra clave las
            // veces que haga falta sin volver a pedir el archivo.
            const res = await parseCartolaPDF(buffer.slice(0), password);
            state.reconciliar.cargando = false;
            state.reconciliar.archivoBuffer = null;
            state.reconciliar.archivoNombrePendiente = null;
            if (!res.tipo) {
                state.reconciliar.error = 'No reconocí el formato de este PDF — por ahora solo lee cartolas de cuenta corriente y estados de cuenta de tarjeta de crédito de Banco Edwards / Banco de Chile.';
                renderMenuView();
                return;
            }
            state.reconciliar.archivo = nombre;
            res.movimientos.forEach(function (m) { m.__match = buscarTxParecida(m); });
            state.reconciliar.tipo = res.tipo;
            state.reconciliar.movimientos = res.movimientos;
            renderMenuView();
        }
        catch (err) {
            state.reconciliar.cargando = false;
            if (err && err.message === 'PDF_PASSWORD_REQUERIDA') {
                state.reconciliar.archivoBuffer = buffer;
                state.reconciliar.archivoNombrePendiente = nombre;
                state.reconciliar.errorPassword = password ? 'Esa clave no abrió el archivo — pruébala de nuevo.' : 'Este PDF pide una clave.';
            }
            else {
                state.reconciliar.archivoBuffer = null;
                state.reconciliar.archivoNombrePendiente = null;
                state.reconciliar.error = 'No se pudo leer el archivo: ' + (err && err.message ? err.message : err);
            }
            renderMenuView();
        }
    }
    // Busca si ya existe una transacción parecida (misma fecha ±1 día, mismo monto, mismo
    // sentido ingreso/gasto) — para no sugerir agregar lo que ya está.
    function buscarTxParecida(mov) {
        const montoAbs = Math.abs(mov.monto);
        return TX.find(function (t) {
            if (t.tipo !== mov.tipoMov)
                return false;
            if (Math.abs(t.monto - montoAbs) > 1)
                return false;
            const d1 = new Date(t.fecha + 'T00:00:00'), d2 = new Date(mov.fecha + 'T00:00:00');
            const diffDias = Math.abs(d1.getTime() - d2.getTime()) / 86400000;
            return diffDias <= 2;
        }) || null;
    }
    // La lista de cartolas que ya llegaron solas por correo (todavía sin usar) — cada una con
    // un botón para abrirla, que pide la clave del PDF ahí mismo (nunca se guarda esa clave).
    function renderCartolasDisponiblesBlock() {
        const R = state.reconciliar;
        if (!R.disponibles.length)
            return '';
        const tipoLabel = { cuenta_corriente: 'Cartola cuenta corriente', tarjeta_nacional: 'Estado de cuenta tarjeta' };
        const filas = R.disponibles.map(function (d) {
            const abriendo = R.usandoId === d.id;
            const label = tipoLabel[d.tipo] || d.nombre_archivo || 'Cartola';
            const fechaTxt = dayLabel(d.recibido_en.slice(0, 10));
            if (abriendo) {
                return '<div class="card" style="padding:14px;margin-bottom:8px;">' +
                    '<div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">' + label + '</div>' +
                    '<div class="muted" style="font-size:12px;margin-bottom:10px;">Llegó por correo el ' + fechaTxt + '</div>' +
                    '<input type="password" inputmode="numeric" class="draft-input" data-cartola-password-input placeholder="Clave del PDF (4 últimos dígitos de tu RUT)" value="' + (R.passwordDraft || '') + '">' +
                    (R.errorPassword ? '<div class="field-error">' + R.errorPassword + '</div>' : '') +
                    '<div style="display:flex;gap:8px;margin-top:10px;">' +
                    '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cartola-cancelar>Cancelar</button>' +
                    '<button class="save-tx-btn" style="flex:1;" data-cartola-abrir="' + d.id + '">Abrir</button>' +
                    '</div>' +
                    '</div>';
            }
            return '<div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
                '<div style="min-width:0;">' +
                '<div style="font-weight:700;font-size:13.5px;">' + label + '</div>' +
                '<div class="muted" style="font-size:12px;">Llegó por correo el ' + fechaTxt + '</div>' +
                '</div>' +
                '<button class="chip" data-cartola-usar="' + d.id + '">Usar esta</button>' +
                '</div>';
        }).join('');
        return '<div class="section-title" style="margin-top:0;">Llegaron solas por correo</div>' + filas;
    }
    function renderMenuReconciliar() {
        const R = state.reconciliar;
        const head = menuScreenHead('Reconciliar con la cartola');
        if (R.cargando) {
            document.getElementById('view-root').innerHTML = head + '<div class="card placeholder-card">' + ICONS.inbox + '<h3>Leyendo tu PDF…</h3></div>';
            return;
        }
        if (R.archivoNombrePendiente) {
            document.getElementById('view-root').innerHTML = head +
                '<div class="card" style="padding:14px;">' +
                '<div style="font-weight:700;font-size:13.5px;margin-bottom:2px;">' + R.archivoNombrePendiente + '</div>' +
                '<div class="muted" style="font-size:12px;margin-bottom:10px;">Este PDF está protegido con clave.</div>' +
                '<input type="password" inputmode="numeric" class="draft-input" data-cartola-password-input placeholder="Clave del PDF (4 últimos dígitos de tu RUT)" value="' + (R.passwordDraft || '') + '">' +
                (R.errorPassword ? '<div class="field-error">' + R.errorPassword + '</div>' : '') +
                '<div style="display:flex;gap:8px;margin-top:10px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-reconciliar-archivo-cancelar>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-reconciliar-archivo-abrir>Abrir</button>' +
                '</div>' +
                '</div>';
            return;
        }
        if (!R.movimientos.length && !R.error) {
            document.getElementById('view-root').innerHTML = head +
                renderCartolasDisponiblesBlock() +
                '<div class="card file-drop-card">' + ICONS.inbox +
                '<p>Sube el PDF de tu cuenta corriente o de tu estado de cuenta de tarjeta de crédito. La app compara cada movimiento contra lo que ya tienes registrado — nunca sube el archivo a ningún servidor, se lee acá mismo en tu navegador.</p>' +
                '<label class="save-tx-btn" style="display:inline-block;cursor:pointer;">Elegir archivo PDF<input type="file" accept="application/pdf" data-reconciliar-file-input style="display:none;"></label>' +
                '</div>';
            return;
        }
        if (R.error) {
            document.getElementById('view-root').innerHTML = head +
                '<div class="card placeholder-card">' + ICONS.ban + '<h3>No se pudo leer</h3><p>' + R.error + '</p>' +
                '<button class="save-tx-btn" style="margin-top:12px;" data-reconciliar-reset>Probar con otro archivo</button></div>';
            return;
        }
        const normales = R.movimientos.filter(function (m) { return m.esEspecial !== 'pago_tarjeta' && m.esEspecial !== 'pago_recibido'; });
        const pagosTarjeta = R.movimientos.filter(function (m) { return m.esEspecial === 'pago_tarjeta'; });
        const conMatch = normales.filter(function (m) { return !!m.__match; });
        const sinMatch = normales.filter(function (m) { return !m.__match; });
        let resumenTarjeta = '';
        if (pagosTarjeta.length) {
            const totalPagos = pagosTarjeta.reduce(function (s, m) { return s + Math.abs(m.monto); }, 0);
            const ym = R.movimientos[0] ? R.movimientos[0].fecha.slice(0, 7) : todayISO().slice(0, 7);
            const comprasRegistradas = txsOfMonth(ym).filter(function (t) { return t.tipo === 'gasto' && MEDIOS[t.medio] && MEDIOS[t.medio].icon === 'card'; }).reduce(function (s, t) { return s + t.monto; }, 0);
            resumenTarjeta = '<div class="card" style="padding:14px 16px;margin-bottom:14px;">' +
                '<div class="sheet-block-title" style="margin-bottom:6px;">Pago de tarjeta este mes</div>' +
                '<p class="muted" style="margin-bottom:4px;">Se pagó ' + money(totalPagos) + ' en ' + pagosTarjeta.length + ' cargo' + (pagosTarjeta.length === 1 ? '' : 's') + ' de tarjeta de crédito.</p>' +
                '<p class="muted">Tienes ' + money(comprasRegistradas) + ' en compras con tarjeta registradas este mes — esto es solo referencial, la cartola de tarjeta detalla cada compra por separado.</p>' +
                '</div>';
        }
        function filaHtml(m, idx, yaRegistrada) {
            // Cuando todavía no está registrado, además de "+ Agregar" (que la clasifica como
            // gasto/ingreso normal) se ofrece "No es gasto" para movimientos que no deberían contar en
            // las estadísticas -- ej. un traspaso entre sus propias cuentas -- sin tener que agregarla
            // primero y después ir a marcarla desde el detalle.
            const acciones = yaRegistrada
                ? '<span class="tx-state state-cobrado-inline">Ya registrada</span>'
                : '<div style="display:flex;gap:6px;">' +
                    '<button class="chip" data-reconciliar-agregar="' + idx + '">+ Agregar</button>' +
                    '<button class="chip" style="background:var(--surface-sunken);color:var(--text-secondary);" data-reconciliar-noesgasto="' + idx + '">No es gasto</button>' +
                    '</div>';
            return '<div class="card" style="padding:12px 14px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:10px;">' +
                '<div style="min-width:0;">' +
                '<div style="font-weight:700;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (m.comercioSugerido || m.detalle) + '</div>' +
                '<div class="muted" style="font-size:12px;">' + dayLabel(m.fecha) + (m.esEspecial === 'sueldo' ? ' · Sueldo' : '') + '</div>' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">' +
                '<span class="tabular" style="font-weight:600;">' + (m.tipoMov === 'ingreso' ? '+' : '') + money(Math.abs(m.monto)) + '</span>' +
                acciones +
                '</div>' +
                '</div>';
        }
        const listaHtml = normales.map(function (m, idx) { return filaHtml(m, idx, !!m.__match); }).join('');
        document.getElementById('view-root').innerHTML = head +
            '<div class="card placeholder-card" style="padding:14px;margin-bottom:14px;">' +
            '<p class="muted" style="margin:0;">' + R.archivo + ' — ' + normales.length + ' movimiento' + (normales.length === 1 ? '' : 's') + ', ' + conMatch.length + ' ya registrado' + (conMatch.length === 1 ? '' : 's') + ', ' + sinMatch.length + ' para revisar.</p>' +
            '</div>' +
            resumenTarjeta +
            (sinMatch.length ? '<button class="budget-add-link" data-reconciliar-agregar-todo style="margin-bottom:10px;">Agregar los ' + sinMatch.length + ' que faltan</button>' : '') +
            listaHtml +
            '<button class="budget-add-link" data-reconciliar-reset style="margin-top:10px;">Probar con otro archivo</button>';
    }
    function crearTxDesdeMovimiento(m, opts) {
        opts = opts || {};
        const reglaByComercio = {};
        reglasAgrupadas().forEach(function (r) { reglaByComercio[r.comercio] = r; });
        const regla = reglaByComercio[m.comercioSugerido];
        const catId = m.esEspecial === 'sueldo' ? 'sueldo' : (regla && regla.cat ? regla.cat : null);
        // Antes esto era siempre "Cuenta Vista", sin importar de qué cartola venía el movimiento —
        // así, las compras sacadas de tu ESTADO DE CUENTA DE TARJETA (que por definición nunca son
        // en efectivo ni de tu cuenta corriente) quedaban mal etiquetadas. Ahora se elige según la
        // cartola: cuenta corriente → Cuenta Vista; tarjeta de crédito → un medio genérico de
        // tarjeta (ella puede renombrarlo o reasignar la transacción después, desde el detalle).
        const medioId = state.reconciliar.tipo === 'tarjeta_nacional' ? ensureMedioDesconocido() : ensureCuentaVistaMedio();
        // opts.noEsGasto: para movimientos que aparecen en la cartola pero no son ni un gasto ni un
        // ingreso real (ej. un traspaso entre sus propias cuentas) -- mismo estado 'no_es_gasto' que
        // usa el botón "No es gasto" del detalle de una transacción normal, así queda excluido de los
        // totales de gasto/ingreso pero registrado para que no vuelva a aparecer como pendiente.
        TX.unshift({
            id: 'trec' + (++importIdCounter), fecha: m.fecha, hora: '00:00', comercio: m.comercioSugerido || m.detalle,
            monto: Math.abs(m.monto), medio: medioId, tipo: m.tipoMov,
            recurrencia: m.esEspecial === 'sueldo' ? 'mensual' : 'variable',
            estado: opts.noEsGasto ? 'no_es_gasto' : (catId ? 'confirmado' : 'pendiente'),
            categorias: (!opts.noEsGasto && catId) ? [{ cat: catId, monto: Math.abs(m.monto) }] : [],
            porCobrar: [], reglaAuto: false,
            nota: opts.noEsGasto ? 'Agregada al reconciliar con la cartola — marcada como "no es gasto"' : 'Agregada al reconciliar con la cartola'
        });
        ensureMonthExists(m.fecha.slice(0, 7));
    }
    /* ---------- modo demo ---------- */
    function renderMenuDemo() {
        document.getElementById('view-root').innerHTML = menuScreenHead('Modo demo') +
            '<div class="card" style="padding:16px;">' +
            '<div class="menu-item-card" style="padding:0;">' +
            '<span class="menu-item-card-icon" style="--fill:var(--cat-butter-fill);--ink:var(--cat-butter-ink)">' + ICONS.lock + '</span>' +
            '<div class="menu-item-card-body"><div class="menu-item-card-name">Ocultar montos reales</div><div class="menu-item-card-sub">Útil para mostrar la app en público sin revelar tus números</div></div>' +
            '<button class="switch ' + (state.demoMode ? 'on' : '') + '" data-toggle-demo aria-label="Activar modo demo" aria-pressed="' + (state.demoMode ? 'true' : 'false') + '"></button>' +
            '</div>' +
            '<div class="platform-hint muted" style="margin-top:14px;">Cuando está activado, los montos se reemplazan por "$••••••" en pantallas, tarjetas y gráficos. Los formularios donde tú editas un monto siguen mostrando el número real mientras los completas.</div>' +
            '</div>';
    }
    /* ---------- asesoría (Próximamente) ---------- */
    function renderMenuAsesoria() {
        document.getElementById('view-root').innerHTML = menuScreenHead('Asesoría financiera con Claude') +
            '<div class="card placeholder-card">' + ICONS.sparkle + '<h3>Próximamente</h3>' +
            '<p>La idea es conectar un asistente con acceso a tus transacciones, presupuestos y metas de inversión, para que puedas preguntarle directamente sobre tu plata — por ejemplo "¿en qué categoría me estoy pasando este mes?" o "¿cómo voy con la meta del pie del depto?".</p>' +
            '<p class="muted" style="margin-top:10px;">Todavía no está disponible en esta maqueta.</p>' +
            '</div>';
    }
    /* ---------- mi cuenta (sesión) ---------- */
    function datosTransferenciaCompletos() {
        const d = DATOS_TRANSFERENCIA;
        return !!(d.nombre || d.rut || d.banco || d.tipoCuenta || d.numeroCuenta || d.email);
    }
    function renderDatosTransferenciaCard() {
        const d = DATOS_TRANSFERENCIA;
        if (state.editingDatosTransferencia) {
            const dr = state.datosTransferenciaDraft;
            return '<div class="card" style="padding:16px;margin-top:14px;">' +
                '<div class="budget-total-label">Datos de transferencia</div>' +
                '<p class="cat-picker-hint" style="margin:6px 0 10px;">Se usan solo para armar el texto que copias al pedir un cobro pendiente — no se comparten con nadie más.</p>' +
                '<label class="draft-label">Nombre</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="nombre" value="' + dr.nombre + '" placeholder="Nombre completo">' +
                '<label class="draft-label" style="margin-top:10px;">RUT</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="rut" value="' + dr.rut + '" placeholder="12.345.678-9">' +
                '<label class="draft-label" style="margin-top:10px;">Banco</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="banco" value="' + dr.banco + '" placeholder="Ej: Banco Estado">' +
                '<label class="draft-label" style="margin-top:10px;">Tipo de cuenta</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="tipoCuenta" value="' + dr.tipoCuenta + '" placeholder="Cuenta RUT, Vista, Corriente…">' +
                '<label class="draft-label" style="margin-top:10px;">Número de cuenta</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="numeroCuenta" value="' + dr.numeroCuenta + '" placeholder="0000000000">' +
                '<label class="draft-label" style="margin-top:10px;">Email (opcional)</label>' +
                '<input type="text" class="draft-input" data-datos-transferencia-input="email" value="' + dr.email + '" placeholder="tucorreo@ejemplo.cl">' +
                '<div style="display:flex;gap:10px;margin-top:14px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-datos-transferencia>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-save-datos-transferencia>Guardar</button>' +
                '</div>' +
                '</div>';
        }
        const completos = datosTransferenciaCompletos();
        return '<div class="card" style="padding:16px;margin-top:14px;">' +
            '<div class="budget-total-head">' +
            '<span class="budget-total-label">Datos de transferencia</span>' +
            '<button class="budget-edit-btn" data-edit-datos-transferencia aria-label="Editar datos de transferencia">' + ICONS.edit + '</button>' +
            '</div>' +
            (completos
                ? '<div class="datos-transferencia-figs">' +
                    (d.nombre ? '<div>' + d.nombre + '</div>' : '') +
                    (d.rut ? '<div>RUT ' + d.rut + '</div>' : '') +
                    ((d.banco || d.tipoCuenta) ? '<div>' + [d.banco, d.tipoCuenta].filter(Boolean).join(' · ') + '</div>' : '') +
                    (d.numeroCuenta ? '<div>Cuenta ' + d.numeroCuenta + '</div>' : '') +
                    (d.email ? '<div>' + d.email + '</div>' : '') +
                    '</div>'
                : '<p class="cat-picker-hint" style="margin:6px 0 0;">Agrégalos para poder copiar, listo para pegar en WhatsApp, un cobro pendiente junto con cómo te pueden transferir.</p>') +
            '</div>';
    }
    function renderMenuCuenta() {
        const email = currentUser ? currentUser.email : '—';
        document.getElementById('view-root').innerHTML = menuScreenHead('Mi cuenta') +
            '<div class="card menu-item-card" style="padding:16px;">' +
            '<span class="menu-item-card-icon" style="--fill:var(--accent-soft);--ink:var(--accent-ink)">' + ICONS.lockSmall + '</span>' +
            '<div class="menu-item-card-body"><div class="menu-item-card-name">' + email + '</div><div class="menu-item-card-sub">Tus datos están protegidos: solo tú (o quien invites más adelante a tu hogar) puede verlos.</div></div>' +
            '</div>' +
            renderDatosTransferenciaCard() +
            '<button class="budget-delete-link" style="margin-top:14px;" data-auth-logout>Cerrar sesión</button>';
    }
    // Texto listo para pegar en WhatsApp con los cobros pendientes (tipo "persona", sin pagar)
    // de una transacción, más tus datos de transferencia si ya los configuraste en Mi cuenta.
    // Los reembolsos (isapre, seguro, etc.) no entran acá — eso es plata que TE deben a ti desde
    // una institución, no algo que le mandas a un grupo de WhatsApp para que te transfieran.
    function buildCobroWhatsAppText(t) {
        const pendientes = (t.porCobrar || []).filter(p => p.tipo === 'persona' && !p.pagado);
        if (pendientes.length === 0)
            return null;
        const lines = ['Pendiente de pago'];
        pendientes.forEach(p => { lines.push((p.persona || 'Sin nombre') + ' ' + fmt.format(Math.round(p.monto || 0))); });
        const d = DATOS_TRANSFERENCIA;
        const datosLines = [];
        if (d.nombre)
            datosLines.push(d.nombre);
        if (d.banco || d.tipoCuenta)
            datosLines.push([d.banco, d.tipoCuenta].filter(Boolean).join(' · '));
        if (d.numeroCuenta)
            datosLines.push('Cuenta ' + d.numeroCuenta);
        if (d.rut)
            datosLines.push('RUT ' + d.rut);
        if (d.email)
            datosLines.push(d.email);
        if (datosLines.length) {
            lines.push('');
            lines.push('Datos transferencia');
            datosLines.forEach(l => lines.push(l));
        }
        return lines.join('\n');
    }
    /* ---------- importar desde tu correo (Gmail + Apps Script) ---------- */
    async function loadImportCorreoScreen() {
        if (!sb || !currentHouseholdId) {
            state.importCorreoLoading = false;
            state.importCorreoError = 'No hay conexión con el servidor todavía.';
            renderMenuView();
            return;
        }
        try {
            const { data: hh, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
            if (hhErr)
                throw hhErr;
            state.importToken = hh ? hh.import_token : null;
            state.importCorreoLoaded = true;
        }
        catch (err) {
            console.error('Pitucas sin lucas — error cargando importación por correo:', err);
            state.importCorreoError = translateAuthError(err);
        }
        state.importCorreoLoading = false;
        renderMenuView();
    }
    function guessMedioIdFromSuggestion(sug) {
        if (!sug)
            return null;
        const m = String(sug).match(/(\d{4})\D*$/);
        if (!m)
            return null;
        const last4 = m[1];
        const found = Object.keys(MEDIOS).find(function (id) { return (MEDIOS[id].corto || '').indexOf(last4) >= 0; });
        return found || null;
    }
    // El correo del banco ya trae los últimos 4 dígitos de la tarjeta usada (ej. "****0507") —
    // si ya existe un medio de pago con esos dígitos, se usa ese. Si no, en vez de caer en
    // "Efectivo" (que queda mal y obliga a corregir cada transacción a mano), se crea solo un
    // medio nuevo con esos dígitos, para que la tarjeta "aparezca" automáticamente. Después,
    // desde Menú > Medios de pago, ella puede renombrarlo (ej. "Visa BCH" en vez de "Tarjeta
    // ****0507") sin perder el vínculo con las transacciones ya asignadas a ese medio.
    function ensureMedioForSugerido(sug) {
        // Algunas reglas del script de correo saben que el movimiento salió de la cuenta corriente
        // (una transferencia, una compra de Racional) aunque no haya ningún número de tarjeta que
        // leer — en esos casos mandan el texto literal 'cuenta_vista' en vez de "****NNNN".
        if (sug === 'cuenta_vista')
            return ensureCuentaVistaMedio();
        const existing = guessMedioIdFromSuggestion(sug);
        if (existing)
            return existing;
        if (!sug)
            return null;
        const m = String(sug).match(/(\d{4})\D*$/);
        if (!m)
            return null;
        const last4 = m[1];
        const id = 'tarjeta_' + last4;
        if (!MEDIOS[id]) {
            MEDIOS[id] = { nombre: 'Tarjeta •••• ' + last4, corto: '•••• ' + last4, icon: 'card' };
        }
        return id;
    }
    // Medios "genéricos" para cuando SABEMOS que una transacción no fue en efectivo (llegó de
    // un correo bancario, o de una cartola/estado de cuenta) pero no logramos identificar cuál
    // tarjeta o cuenta específica — antes, en esos casos, se caía en el primer medio de la lista
    // (que en una cuenta nueva es literalmente "Efectivo"), mostrando compras con tarjeta como si
    // hubieran sido en efectivo. Mejor mostrar honestamente "sin identificar" y que ella lo
    // corrija a mano si quiere, que inventar un medio que no corresponde.
    function ensureCuentaVistaMedio() {
        const id = 'cuenta_vista';
        if (!MEDIOS[id]) {
            MEDIOS[id] = { nombre: 'Cuenta Vista', corto: 'Cta. Vista', icon: 'bank' };
        }
        return id;
    }
    function ensureMedioDesconocido() {
        const id = 'medio_desconocido';
        if (!MEDIOS[id]) {
            MEDIOS[id] = { nombre: 'Medio sin identificar', corto: 'Sin identificar', icon: 'card' };
        }
        return id;
    }
    function guessCatIdFromImportRow(row) {
        if (row.tipo !== 'inversion')
            return null; // gasto/ingreso: que ella elija, igual que en la importación CSV
        const f = (row.fuente || '').toLowerCase();
        const candidatos = ['racional', 'fintual', 'banco_chile', 'buda'];
        return candidatos.find(function (id) { return CATS[id] && f.indexOf(id.replace('_', '')) >= 0; }) || null;
    }
    // Antes, lo que el script de Google encontraba en el correo quedaba en una bandeja aparte
    // ("Importar desde tu correo") esperando que ella la aprobara una por una. Ahora se agregan
    // directo a Transacciones, marcadas como "pendiente" (sin categoría) igual que cualquier
    // otra transacción sin clasificar — así las revisa en el mismo lugar donde ya revisa todo
    // lo demás, en vez de tener que acordarse de visitar una pantalla aparte.
    // Arma la transacción que resulta de una fila importada por correo -- separado de
    // absorbImportedRows para poder testearlo sin necesitar una conexión real a Supabase.
    // Antes esto solo intentaba adivinar la categoría para inversiones (guessCatIdFromImportRow)
    // y dejaba SIEMPRE pendiente cualquier gasto/ingreso importado, aunque ya existiera una regla
    // de clasificación para ese mismo comercio (ej. "Copec Providencia" -> Transporte) — la
    // importación por CSV de cartola sí las usaba (ver importCartolaRows), esta no. Ahora consulta
    // las mismas reglas, para que se comporte igual sin importar de dónde vino la transacción.
    function txDesdeImportEmail(row) {
        const reglaByComercio = {};
        reglasAgrupadas().forEach(function (r) { reglaByComercio[r.comercio] = r; });
        const regla = reglaByComercio[row.comercio];
        const catId = (regla && regla.cat) ? regla.cat : guessCatIdFromImportRow(row);
        const medioId = ensureMedioForSugerido(row.medio_sugerido) || ensureMedioDesconocido();
        return {
            id: 'temail' + (++importIdCounter), fecha: row.fecha, hora: row.hora || '00:00', comercio: row.comercio,
            monto: Math.round(row.monto), medio: medioId, tipo: row.tipo,
            recurrencia: regla ? regla.recurrencia : 'variable',
            estado: catId ? 'confirmado' : 'pendiente',
            categorias: catId ? [{ cat: catId, monto: Math.round(row.monto) }] : [],
            porCobrar: [], reglaAuto: !!(regla && regla.cat), nota: 'Importado automáticamente desde tu correo',
            importadoEmail: true
        };
    }
    async function absorbImportedRows() {
        if (!sb || !currentHouseholdId)
            return;
        try {
            const { data: rows, error } = await sb.from('transacciones_importadas').select('*')
                .eq('household_id', currentHouseholdId).eq('procesado', false).order('fecha', { ascending: true });
            if (error)
                throw error;
            if (!rows || !rows.length)
                return;
            rows.forEach(function (row) {
                TX.unshift(txDesdeImportEmail(row));
                ensureMonthExists(row.fecha.slice(0, 7));
            });
            render();
            toast(rows.length === 1 ? 'Se agregó 1 transacción desde tu correo' : 'Se agregaron ' + rows.length + ' transacciones desde tu correo');
            const ids = rows.map(function (r) { return r.id; });
            await sb.from('transacciones_importadas').update({ procesado: true }).in('id', ids);
        }
        catch (err) {
            console.error('Pitucas sin lucas — error agregando transacciones importadas:', err);
        }
    }
    /* ---------- notificaciones push reales (Cloudflare Worker + Web Push) ----------
       Dos avisos: (1) "llegó una transacción nueva de tu correo" -- lo dispara el Apps Script,
       directo al Worker, sin pasar por acá. (2) "cruzaste el 80/90/100% de un presupuesto" --
       solo puede pasar mientras la app está abierta (una transacción importada nunca llega con
       categoría puesta, así que jamás empuja un presupuesto por sí sola sin que ella la
       clasifique primero) -- ver checkPresupuestoPushAvisos() más abajo. Esta sección solo se
       encarga de: activar/desactivar el permiso del navegador, y mandarle avisos al Worker. */
    function pushWorkerConfigured() {
        return typeof PUSH_WORKER_URL === 'string' && PUSH_WORKER_URL.indexOf('PEGA_AQUI') === -1;
    }
    function notifApiSupported() {
        return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
            typeof window !== 'undefined' && 'PushManager' in window &&
            typeof Notification !== 'undefined';
    }
    function urlBase64ToUint8Array_(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const out = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i)
            out[i] = rawData.charCodeAt(i);
        return out;
    }
    async function loadNotifStatus() {
        state.notifLoading = true;
        state.notifError = null;
        renderMenuView();
        try {
            if (!notifApiSupported()) {
                state.notifSubscribed = false;
            }
            else {
                const reg = await navigator.serviceWorker.getRegistration('./sw.js').catch(function () { return null; });
                const sub = reg ? await reg.pushManager.getSubscription().catch(function () { return null; }) : null;
                state.notifSubscribed = !!sub;
            }
            state.notifLoaded = true;
        }
        catch (err) {
            console.error('Pitucas sin lucas — error revisando el estado de notificaciones:', err);
            state.notifError = 'No se pudo revisar el estado de las notificaciones.';
        }
        state.notifLoading = false;
        renderMenuView();
    }
    async function activarNotificaciones() {
        if (state.notifBusy)
            return;
        state.notifBusy = true;
        state.notifError = null;
        renderMenuView();
        try {
            if (!notifApiSupported())
                throw new Error('Este navegador no soporta notificaciones push.');
            if (!pushWorkerConfigured())
                throw new Error('Todavía falta desplegar el Worker de notificaciones (ver DOCUMENTACION.md).');
            const permission = await Notification.requestPermission();
            if (permission !== 'granted')
                throw new Error('No diste el permiso de notificaciones (revísalo en los ajustes del navegador/celular).');
            const reg = await navigator.serviceWorker.register('./sw.js');
            await navigator.serviceWorker.ready;
            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array_(VAPID_PUBLIC_KEY) });
            }
            const json = sub.toJSON();
            if (!sb || !currentHouseholdId)
                throw new Error('No hay conexión con el servidor todavía.');
            const { error } = await sb.from('push_subscriptions').upsert({
                household_id: currentHouseholdId, endpoint: json.endpoint,
                p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent
            }, { onConflict: 'household_id,endpoint' });
            if (error)
                throw error;
            state.notifSubscribed = true;
            toast('Notificaciones activadas en este dispositivo');
        }
        catch (err) {
            console.error('Pitucas sin lucas — error activando notificaciones:', err);
            state.notifError = err && err.message ? err.message : 'No se pudo activar las notificaciones.';
        }
        state.notifBusy = false;
        renderMenuView();
    }
    async function desactivarNotificaciones() {
        if (state.notifBusy)
            return;
        state.notifBusy = true;
        state.notifError = null;
        renderMenuView();
        try {
            if (notifApiSupported()) {
                const reg = await navigator.serviceWorker.getRegistration('./sw.js').catch(function () { return null; });
                const sub = reg ? await reg.pushManager.getSubscription().catch(function () { return null; }) : null;
                if (sub) {
                    const endpoint = sub.endpoint;
                    await sub.unsubscribe().catch(function () { });
                    if (sb && currentHouseholdId) {
                        await sb.from('push_subscriptions').delete().eq('household_id', currentHouseholdId).eq('endpoint', endpoint);
                    }
                }
            }
            state.notifSubscribed = false;
            toast('Notificaciones desactivadas en este dispositivo');
        }
        catch (err) {
            console.error('Pitucas sin lucas — error desactivando notificaciones:', err);
            state.notifError = err && err.message ? err.message : 'No se pudo desactivar las notificaciones.';
        }
        state.notifBusy = false;
        renderMenuView();
    }
    // Le pide al Worker que le mande un push a todos los dispositivos suscritos de este hogar.
    // Nunca lanza ni bloquea nada más: un push es un avisito extra, jamás algo de lo que
    // dependa el guardado de datos reales.
    // Devuelve true/false según si el aviso SE INTENTÓ mandar de verdad (no si llegó -- es fire
    // and forget). El valor de retorno importa: quien llama a esto decide si vale la pena marcar
    // "ya avisado" con ese resultado -- si el Worker todavía no está configurado (por ejemplo,
    // antes de que jesu lo despliegue), no hay que quemar el aviso como si ya se hubiera mandado,
    // o el día que lo despliegue esa alerta pasada nunca le va a llegar.
    function enviarPushHogar(title, message, url) {
        if (!pushWorkerConfigured() || !sb || !currentHouseholdId || !state.importToken)
            return false;
        fetch(PUSH_WORKER_URL + '/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ household_id: currentHouseholdId, token: state.importToken, title: title, message: message || '', url: url || './index.html' })
        }).catch(function (err) { console.error('Pitucas sin lucas — error mandando notificación push:', err); });
        return true;
    }
    // A diferencia de enviarPushHogar() (que es "dispara y olvida", nunca sabe si de verdad
    // llegó a algún dispositivo), esta SÍ espera la respuesta real del Worker y se la muestra a
    // la usuaria -- pensada para el botón "Enviar aviso de prueba" del Menú > Notificaciones,
    // para poder diagnosticar sin adivinar cuando algo no llega.
    async function enviarPushPrueba() {
        if (state.notifTestBusy)
            return;
        state.notifTestBusy = true;
        state.notifTestResult = null;
        renderMenuView();
        try {
            if (!pushWorkerConfigured())
                throw new Error('Todavía falta desplegar el Worker de notificaciones.');
            if (!sb || !currentHouseholdId || !state.importToken)
                throw new Error('No hay conexión con el servidor todavía -- espera un momento y prueba de nuevo.');
            const res = await fetch(PUSH_WORKER_URL + '/notify', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ household_id: currentHouseholdId, token: state.importToken, title: 'Aviso de prueba', message: 'Si ves esto, las notificaciones están funcionando.', url: './index.html' })
            });
            let data = null;
            try {
                data = await res.json();
            }
            catch (e) { }
            if (!res.ok) {
                state.notifTestResult = 'El Worker respondió con un error (' + res.status + '): ' + (data && data.error ? data.error : 'sin más detalle.');
            }
            else if (data && data.delivered > 0) {
                state.notifTestResult = 'El Worker mandó el aviso a ' + data.delivered + ' dispositivo(s). Si aun así no te llegó, revisa que las notificaciones estén permitidas para este sitio en los ajustes de tu celular/navegador.';
            }
            else {
                state.notifTestResult = (data && data.note) ? data.note : 'El Worker respondió, pero no hay ningún dispositivo suscrito en tu hogar para mandarle el aviso -- prueba desactivar y activar notificaciones de nuevo en este dispositivo.';
            }
        }
        catch (err) {
            state.notifTestResult = 'No se pudo hacer la prueba: ' + (err && err.message ? err.message : err);
        }
        state.notifTestBusy = false;
        renderMenuView();
    }
    // Título/mensaje del push de presupuesto -- separado de checkPresupuestoPushAvisos() para
    // poder testear el texto exacto sin necesitar una sesión de Supabase real (que es lo único
    // que falta en el entorno de test, ver shot_notificaciones_push.js).
    function presupuestoAvisoTexto(catNombre, umbral, gastado, meta) {
        return {
            titulo: catNombre + ': has alcanzado el ' + umbral + '% de tu presupuesto mensual!',
            mensaje: money(gastado) + ' de ' + money(meta)
        };
    }
    // Compara, categoría por categoría, si el gasto del mes actual acaba de cruzar un umbral
    // (80/90/100%) que no se había avisado todavía -- y si es así, manda el push y lo marca
    // como ya avisado (PRESUPUESTO_AVISOS_ENVIADOS) para no repetirlo. Se llama después de
    // cualquier cambio que pueda mover el gasto de una categoría (guardar/editar/reclasificar
    // una transacción) -- ver los data-save-tx / data-cat-select / etc. más abajo.
    function checkPresupuestoPushAvisos() {
        // Ojo: usa el mes calendario de HOY, no MONTHS[state.monthIndex] -- ese es solo el mes que
        // se está mirando en pantalla (Balance/Presupuesto pueden estar mostrando un mes pasado
        // mientras se guarda un cambio), y un presupuesto siempre es sobre el mes en curso.
        const month = todayISO().slice(0, 7);
        Object.keys(PRESUPUESTOS).forEach(function (catId) {
            const cfg = PRESUPUESTOS[catId];
            if (!cfg || !cfg.meta || !cfg.alertas)
                return;
            const gastado = catGastoEnMes(catId, month);
            const pct = (gastado / cfg.meta) * 100;
            [80, 90, 100].forEach(function (umbral) {
                if (!cfg.alertas[umbral] || pct < umbral)
                    return;
                const key = catId + '|' + month + '|' + umbral;
                if (PRESUPUESTO_AVISOS_ENVIADOS[key])
                    return;
                const cat = catInfo(catId);
                const aviso = presupuestoAvisoTexto(cat.nombre, umbral, gastado, cfg.meta);
                const seIntento = enviarPushHogar(aviso.titulo, aviso.mensaje);
                // Solo se marca "ya avisado" si de verdad se intentó mandar -- si el Worker todavía no
                // está configurado, este cruce de umbral queda disponible para avisarse el día que sí
                // lo esté, en vez de perderse para siempre.
                if (seIntento)
                    PRESUPUESTO_AVISOS_ENVIADOS[key] = true;
            });
        });
    }
    function renderMenuImportarCorreo() {
        const head = menuScreenHead('Importar desde tu correo');
        if (state.importCorreoLoading) {
            document.getElementById('view-root').innerHTML = head + '<div class="card placeholder-card">Cargando…</div>';
            return;
        }
        if (state.importCorreoError) {
            document.getElementById('view-root').innerHTML = head +
                '<div class="card placeholder-card">' + ICONS.ban + '<h3>No se pudo cargar</h3><p>' + state.importCorreoError + '</p>' +
                '<button class="save-tx-btn" style="margin-top:12px;" data-reload-import-correo>Reintentar</button></div>';
            return;
        }
        const credBlock = '<div class="card" style="padding:16px;margin-bottom:14px;">' +
            '<div class="sheet-block-title" style="margin-bottom:8px;">Datos para tu Apps Script</div>' +
            '<p class="muted" style="margin-bottom:12px;">Un script de Google Apps Script (gratis, corre dentro de tu propia cuenta de Gmail) revisa cada cierto tiempo tus correos de notificación bancaria y manda cada transacción para acá. Estos dos códigos son los únicos datos que necesita — no sirven para nada más que eso.</p>' +
            '<label class="draft-label">Household ID</label>' +
            '<div style="display:flex;gap:8px;margin-bottom:12px;">' +
            '<input class="draft-input" readonly value="' + (currentHouseholdId || '') + '" style="font-size:11.5px;">' +
            '<button class="budget-edit-btn" data-copy-text="' + (currentHouseholdId || '') + '" aria-label="Copiar Household ID">' + ICONS.copy + '</button>' +
            '</div>' +
            '<label class="draft-label">Código de importación</label>' +
            '<div style="display:flex;gap:8px;">' +
            '<input class="draft-input" readonly value="' + (state.importToken || '') + '" style="font-size:11.5px;">' +
            '<button class="budget-edit-btn" data-copy-text="' + (state.importToken || '') + '" aria-label="Copiar código de importación">' + ICONS.copy + '</button>' +
            '</div>' +
            '</div>';
        const infoBlock = '<div class="card placeholder-card">' + ICONS.checkCircle + '<h3>Se agregan solas</h3>' +
            '<p>Cuando el script encuentre una transacción nueva en tu correo, la agrega directo a tu pestaña de <b>Transacciones</b>, marcada como pendiente (sin categoría) para que la clasifiques ahí mismo — igual que cualquier otra transacción sin clasificar. Si alguna se agregó por error, ábrela y elimínala desde ahí.</p></div>';
        document.getElementById('view-root').innerHTML = head + credBlock + infoBlock;
    }
    function renderMenuNotificaciones() {
        const head = menuScreenHead('Notificaciones');
        if (!notifApiSupported()) {
            document.getElementById('view-root').innerHTML = head +
                '<div class="card placeholder-card">' + ICONS.ban + '<h3>No disponible en este navegador</h3>' +
                '<p>Este navegador no soporta notificaciones push. Prueba desde Chrome/Safari en tu celular, idealmente con la app instalada en tu pantalla de inicio.</p></div>';
            return;
        }
        if (state.notifLoading) {
            document.getElementById('view-root').innerHTML = head + '<div class="card placeholder-card">Cargando…</div>';
            return;
        }
        const errorBlock = state.notifError ? '<div class="file-format-hint" style="margin-bottom:12px;">' + state.notifError + '</div>' : '';
        const statusBlock = '<div class="card placeholder-card">' +
            (state.notifSubscribed ? ICONS.checkCircle : ICONS.bell) +
            '<h3>' + (state.notifSubscribed ? 'Activadas en este dispositivo' : 'Notificaciones desactivadas') + '</h3>' +
            '<p>Te avisamos apenas llega una transacción nueva desde tu correo, y cuando un presupuesto de categoría cruza el 80%, 90% o 100% de su meta. Esto se activa por separado en cada celular/computador donde uses la app.</p>' +
            '<button class="save-tx-btn" style="margin-top:12px;" data-notif-toggle' + (state.notifBusy ? ' disabled' : '') + '>' +
            (state.notifBusy ? 'Un momento…' : (state.notifSubscribed ? 'Desactivar en este dispositivo' : 'Activar en este dispositivo')) +
            '</button></div>';
        // Botón de prueba: manda un aviso real y muestra la respuesta del Worker tal cual (a
        // diferencia del aviso automático por transacción/presupuesto, que es "dispara y olvida" y
        // nunca te avisa si algo falló en el camino). Solo tiene sentido si este dispositivo ya
        // está suscrito.
        const testBlock = !state.notifSubscribed ? '' :
            '<div class="card placeholder-card" style="margin-top:12px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);" data-notif-test' + (state.notifTestBusy ? ' disabled' : '') + '>' +
                (state.notifTestBusy ? 'Enviando…' : 'Enviar aviso de prueba') +
                '</button>' +
                (state.notifTestResult ? '<p class="platform-hint" style="margin-top:10px;">' + state.notifTestResult + '</p>' : '') +
                '</div>';
        document.getElementById('view-root').innerHTML = head + errorBlock + statusBlock + testBlock;
    }
    function renderMenuView() {
        document.getElementById('header-title').textContent = 'Menú';
        if (state.menuSection === 'cuenta')
            renderMenuCuenta();
        else if (state.menuSection === 'categorias')
            renderMenuCategorias();
        else if (state.menuSection === 'medios')
            renderMenuMedios();
        else if (state.menuSection === 'reglas')
            renderMenuReglas();
        else if (state.menuSection === 'exportar')
            renderMenuExportar();
        else if (state.menuSection === 'respaldo')
            renderMenuRespaldo();
        else if (state.menuSection === 'importar')
            renderMenuImportar();
        else if (state.menuSection === 'importarcorreo')
            renderMenuImportarCorreo();
        else if (state.menuSection === 'notificaciones')
            renderMenuNotificaciones();
        else if (state.menuSection === 'reconciliar')
            renderMenuReconciliar();
        else if (state.menuSection === 'demo')
            renderMenuDemo();
        else if (state.menuSection === 'asesoria')
            renderMenuAsesoria();
        else
            renderMenuMain();
    }
    /* ===================== MAIN RENDER ===================== */
    function render() {
        renderTabbar();
        if (state.tab === 'transacciones')
            renderTransaccionesView();
        else if (state.tab === 'resumen')
            renderResumenView();
        else
            renderMenuView();
        const fab = document.getElementById('fab-add');
        if (fab)
            fab.hidden = state.tab !== 'transacciones';
        const demoBanner = document.getElementById('demo-banner');
        if (demoBanner) {
            demoBanner.hidden = !state.demoMode;
            if (state.demoMode)
                demoBanner.innerHTML = ICONS.lock + '<span>Demo</span>';
        }
        renderSheet();
    }
    /* ===================== DETAIL SHEET ===================== */
    function getTx(id) { return TX.find(t => t.id === id); }
    function segmentedHtml(name, options, value, disabled) {
        return '<div class="segmented" data-seg="' + name + '">' + options.map(o => '<button data-seg-val="' + o.id + '" class="' + (value === o.id ? 'active' : '') + '" ' + (disabled ? 'disabled' : '') + '>' + o.label + '</button>').join('') + '</div>';
    }
    // Filas de categoría siempre editables (select + monto/％ + borrar), con el conmutador $/％
    // arriba y "Agregar categoría" siempre visible — así clasificas o repartes sin tener que
    // primero entrar a un "modo edición" aparte. `allowSplit` se apaga para inversiones (ahí la
    // plataforma es una sola, no algo que se reparte entre varias).
    function renderCategoriaRows(t, allowSplit) {
        const unit = allowSplit ? (state.splitCatUnit[t.id] || '$') : '$';
        const catOptions = Object.keys(CATS).filter(k => CATS[k].tipo === t.tipo && (t.tipo !== 'inversion' || !isPlatformArchived(k) || (t.categorias[0] && t.categorias[0].cat === k)));
        const list = t.categorias.length ? t.categorias : [{ cat: '', monto: t.monto }];
        const rows = list.map((c, idx) => {
            const ci = c.cat ? catInfo(c.cat) : null;
            const opts = '<option value="">Sin categoría</option>' + catOptions.map(k => {
                const icon = CATS[k].icon;
                const label = (ICONS[icon] === undefined ? icon + ' ' : '') + CATS[k].nombre;
                return '<option value="' + k + '" ' + (c.cat === k ? 'selected' : '') + '>' + label + '</option>';
            }).join('');
            const shown = unit === '%' ? (t.monto ? Math.round((c.monto / t.monto) * 1000) / 10 : 0) : c.monto;
            return '<div class="split-row" data-cat-row="' + idx + '">' +
                '<span class="cat-row-icon" style="--fill:' + (ci ? 'var(--cat-' + ci.color + '-fill)' : 'var(--surface-sunken)') + ';--ink:' + (ci ? 'var(--cat-' + ci.color + '-ink)' : 'var(--text-tertiary)') + '">' + (ci ? catIconMarkup(ci.icon) : ICONS.more) + '</span>' +
                '<select data-cat-select="' + idx + '">' + opts + '</select>' +
                '<span class="num-wrap"><input type="text" inputmode="decimal" data-cat-amount="' + idx + '" value="' + shown + '">' +
                '<span>' + unit + '</span></span>' +
                (list.length > 1 && allowSplit ? '<button class="rm-btn" data-cat-remove="' + idx + '">' + ICONS.trash + '</button>' : '') +
                '</div>';
        }).join('');
        if (!allowSplit)
            return '<div class="cat-rows">' + rows + '</div>';
        const sum = t.categorias.reduce((s, c) => s + c.monto, 0);
        const diff = t.monto - sum;
        const ok = Math.abs(diff) < 1;
        return '<div class="cat-rows">' +
            '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">Repartir el monto total</span>' +
            '<div class="mini-toggle"><button data-catunit="$" class="' + (unit === '$' ? 'active' : '') + '">$</button><button data-catunit="%" class="' + (unit === '%' ? 'active' : '') + '">%</button></div>' +
            '</div>' +
            rows +
            '<button class="split-add" data-add-catrow="' + t.id + '">' + ICONS.plus + ' Agregar categoría</button>' +
            (t.categorias.length > 0 ? '<div class="split-remaining"><span>Por asignar</span><span class="' + (ok ? 'ok' : 'bad') + ' tabular">' + money(diff) + '</span></div>' : '') +
            '</div>';
    }
    function renderCobroSplitBlock(t) {
        const mode = state.splitCobroMode[t.id] || t.porCobrar.length > 0;
        if (!mode) {
            return '';
        }
        // "Por cobrar a alguien" y "Reembolso pendiente" son acciones separadas — si esta
        // transacción solo tiene filas de un tipo (el caso normal, entrando por una u otra acción
        // rápida), este bloque se especializa: no se ofrece agregar del otro tipo, para no mezclar
        // "cobrarle a una persona" con "un reembolso que esperas". Si ya tiene de ambos tipos (por
        // ejemplo, datos de antes de este cambio), se muestran ambas opciones para no bloquear nada.
        const hasPersona = tienePorCobrarTipo(t, 'persona');
        const hasReembolso = tienePorCobrarTipo(t, 'reembolso');
        const soloPersona = hasPersona && !hasReembolso;
        const soloReembolso = hasReembolso && !hasPersona;
        const unit = state.splitCobroUnit[t.id] || '$';
        const usedNames = t.porCobrar.map(p => p.persona);
        const suggestions = soloReembolso ? [] : CONTACTOS.filter(c => !usedNames.includes(c));
        const todosPagados = allCobrado(t);
        const rows = t.porCobrar.map((p, idx) => {
            const isReembolso = p.tipo === 'reembolso';
            const montoConocido = p.monto != null;
            const shown = !montoConocido ? '' : (unit === '%' ? Math.round((p.monto / t.monto) * 1000) / 10 : p.monto);
            const tipoTag = isReembolso ? '<span class="pend-tipo-tag">Reembolso</span>' : '';
            const nameField = p.pagado
                ? '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;">' + tipoTag + '<span class="persona-label" style="font-size:13px;font-weight:600;">' + (p.persona || 'Sin nombre') + '</span></span>'
                : '<span style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">' + tipoTag +
                    '<input type="text" class="persona-label" style="width:100%;" data-cobro-name="' + idx + '" value="' + p.persona + '" placeholder="' + (isReembolso ? 'Isapre, seguro…' : 'Nombre') + '"></span>';
            const amtField = p.pagado
                ? '<span class="persona-amt tabular" style="font-size:13px;font-weight:500;width:96px;text-align:right;flex-shrink:0;">' +
                    moneyPlainMasked(pendienteMontoEfectivo(p)) + ' ' + unit +
                    (isReembolso && p.montoRecibido != null && p.monto != null && p.montoRecibido !== p.monto ? '<span class="pend-esperado muted">de ' + moneyPlainMasked(p.monto) + ' esperado</span>' : '') +
                    '</span>'
                : '<span class="num-wrap persona-amt"><input type="text" inputmode="decimal" data-cobro-amount="' + idx + '" value="' + shown + '" placeholder="' + (isReembolso ? 'Por confirmar' : '0') + '"><span>' + unit + '</span></span>';
            const vincularBtn = p.pagado ? '' : '<button class="link-btn" data-link-pendiente="' + idx + '" aria-label="Vincular a un depósito">' + ICONS.inbox + '</button>';
            // "Dar por perdida" solo aplica a partes de una persona (una cuenta por cobrar real) —
            // un reembolso que nunca llega no necesita esto: ese gasto ya contaba 100% como tuyo.
            const darPorPerdidaLink = (!p.pagado && !isReembolso)
                ? '<button class="split-toggle-link" data-dar-por-perdida="' + idx + '" style="display:block;margin:-2px 0 10px;font-size:11px;">Dar por perdida — pasarla a gasto de este mes</button>'
                : '';
            return '<div>' +
                '<div class="split-row' + (p.pagado ? ' paid' : '') + '" data-cobro-row="' + idx + '">' +
                '<button class="chk-pagado' + (p.pagado ? ' checked' : '') + '" data-toggle-pagado="' + idx + '" aria-label="Marcar ' + (p.persona || 'esta persona') + ' como pagado" aria-pressed="' + (p.pagado ? 'true' : 'false') + '">' + ICONS.check + '</button>' +
                nameField + amtField + vincularBtn +
                '<button class="rm-btn" data-cobro-remove="' + idx + '">' + ICONS.trash + '</button>' +
                '</div>' +
                darPorPerdidaLink +
                '</div>';
        }).join('');
        const totalCobro = porCobrarTotal(t);
        const tuParte = t.monto - totalCobro;
        const bad = tuParte < 0;
        const emptyHint = soloReembolso
            ? 'Agrega el reembolso que esperas por este gasto (isapre, seguro, etc).'
            : soloPersona
                ? 'Agrega a quién le cobras este gasto.'
                : 'Agrega a quién le cobras, o un reembolso que esperas por este gasto.';
        const tieneCobroPersonaPendiente = t.porCobrar.some(p => p.tipo === 'persona' && !p.pagado);
        const copiarBtn = tieneCobroPersonaPendiente
            ? '<button class="boleta-entry-link" data-copy-cobro="' + t.id + '">' + ICONS.copy + ' Copiar para WhatsApp</button>'
            : '';
        return '<div class="split-block">' +
            (todosPagados ? '<div class="cobro-banner-done">' + ICONS.checkCircle + '<span>Ya te pagaron/reembolsaron todo lo de esta transacción.</span></div>' : '') +
            (soloReembolso ? '' : '<button class="boleta-entry-link" data-open-boleta="' + t.id + '">' + ICONS.camera + ' Subir foto de la boleta y repartir automático</button>') +
            (suggestions.length ? '<div class="contact-chips">' + suggestions.map(c => '<button class="contact-chip" data-add-contact="' + c + '">+ ' + c + '</button>').join('') + '</div>' : '') +
            '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">A cuánto le corresponde a cada uno</span>' +
            '<div class="mini-toggle"><button data-cobrounit="$" class="' + (unit === '$' ? 'active' : '') + '">$</button><button data-cobrounit="%" class="' + (unit === '%' ? 'active' : '') + '">%</button></div>' +
            '</div>' +
            (rows || '<p class="muted" style="font-size:12.5px;padding:6px 0;">' + emptyHint + '</p>') +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            (soloReembolso ? '' : '<button class="split-add" data-add-cobrorow="' + t.id + '">' + ICONS.plus + ' Agregar persona</button>') +
            (soloPersona ? '' : '<button class="split-add" data-add-reembolsorow="' + t.id + '">' + ICONS.plus + ' Agregar reembolso</button>') +
            '</div>' +
            '<div class="split-remaining"><span>Tu parte del gasto</span><span class="' + (bad ? 'bad' : 'ok') + ' tabular">' + money(tuParte) + '</span></div>' +
            copiarBtn +
            '</div>';
    }
    // Fila compacta de categoría para "Nueva transacción" — mismo componente visual que ya usa
    // el detalle de una transacción existente (avatar redondo con el emoji/ícono de la categoría
    // + un <select> nativo al lado, que al tocarlo despliega solo las opciones), en vez de la
    // grilla grande de chips que se mostraba antes siempre abierta. Como una transacción recién
    // creada solo admite una categoría (se puede dividir en varias después, ya guardada, desde
    // su propio detalle), esta fila no tiene monto/% ni botón de "agregar otra".
    function renderDraftCategoriaRow(d) {
        const catTipo = d.tipo === 'inversion' ? 'inversion' : d.tipo;
        const catOptions = Object.keys(CATS).filter(k => CATS[k].tipo === catTipo && (catTipo !== 'inversion' || !isPlatformArchived(k)));
        const chosen = d.categorias[0] ? d.categorias[0].cat : '';
        const ci = chosen ? catInfo(chosen) : null;
        const opts = '<option value="">Sin categoría</option>' + catOptions.map(k => {
            const icon = CATS[k].icon;
            const label = (ICONS[icon] === undefined ? icon + ' ' : '') + CATS[k].nombre;
            return '<option value="' + k + '" ' + (chosen === k ? 'selected' : '') + '>' + label + '</option>';
        }).join('');
        return '<div class="cat-rows"><div class="split-row" data-draft-cat-row>' +
            '<span class="cat-row-icon" style="--fill:' + (ci ? 'var(--cat-' + ci.color + '-fill)' : 'var(--surface-sunken)') + ';--ink:' + (ci ? 'var(--cat-' + ci.color + '-ink)' : 'var(--text-tertiary)') + '">' + (ci ? catIconMarkup(ci.icon) : ICONS.more) + '</span>' +
            '<select data-draft-cat-select>' + opts + '</select>' +
            '</div></div>';
    }
    function catPickerGrid(tipoFilter, attrName, selectedId) {
        // Una plataforma cerrada no se ofrece para clasificar transacciones nuevas (ya no la usas),
        // pero si una transacción vieja ya quedó apuntando a ella, se sigue mostrando seleccionada.
        return '<div class="cat-picker-grid">' + Object.keys(CATS).filter(k => CATS[k].tipo === tipoFilter && (tipoFilter !== 'inversion' || !isPlatformArchived(k) || k === selectedId)).map(k => {
            const c = CATS[k];
            const sel = k === selectedId;
            return '<button class="cat-picker-chip" data-' + attrName + '="' + k + '" ' + (sel ? 'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"' : '') + '>' + catIconMarkup(c.icon) + ' ' + c.nombre + '</button>';
        }).join('') + '</div>';
    }
    function renderSheetContent(t) {
        const isIncome = t.tipo === 'ingreso';
        const isInvest = t.tipo === 'inversion';
        const cats = t.categorias;
        const needsClassifying = cats.length === 0 && t.estado === 'pendiente';
        // Antes había que tocar la categoría para entrar a un "modo edición" aparte (chip -> grilla).
        // Ahora, salvo la primera clasificación de un movimiento importado (needsClassifying, que
        // sigue mostrando la grilla grande de íconos para elegir por primera vez), la categoría
        // siempre se ve como filas editables con select — igual que el resto de la app.
        const categoriaSection = needsClassifying
            ? '<p class="cat-picker-hint">Todavía no le has puesto categoría. Elige una para clasificarla (y luego puedes activar el candado para que se repita sola).</p>' +
                catPickerGrid(t.tipo, 'pick-cat')
            : renderCategoriaRows(t, !isInvest);
        // Antes una transacción ya creada como inversión quedaba con un chip fijo ("se edita en la
        // Fase 4") y, al revés, una importada como gasto/ingreso no se podía pasar a inversión — por
        // ejemplo, una transferencia a Fintual que llega sola desde el correo. Ahora las 3 opciones
        // siempre están disponibles acá, igual que al crear una transacción nueva.
        const tipoSelector = segmentedHtml('tipo', [{ id: 'gasto', label: 'Gasto' }, { id: 'ingreso', label: 'Ingreso' }, { id: 'inversion', label: 'Inversión' }], t.tipo);
        const recurrenciaSelector = segmentedHtml('recurrencia', [
            { id: 'variable', label: 'Variable' }, { id: 'mensual', label: 'Mensual' }, { id: 'anual', label: 'Anual' }
        ], t.recurrencia);
        const cuotaBlock = (t.tipo !== 'gasto' || isInvest) ? '' :
            t.cuotaProyectada
                ? '<div class="sheet-block card" style="padding:16px;"><div class="cuota-note">' + ICONS.layers + '<span>Esta es la cuota ' + t.cuotaNumero + ' de ' + t.cuotaTotal + ' de la compra en <b>' + t.comercio + '</b>. Se generó sola a partir de la cuota 1 y va a dejar de aparecer después de la cuota ' + t.cuotaTotal + '.</span></div></div>'
                : '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Pago en cuotas</div>' +
                    '<div class="cuota-row"><span class="cuota-icon">' + ICONS.layers + '</span>' +
                    '<span class="cuota-text">La pagaste en cuotas y quieres verla los próximos meses</span>' +
                    '<button class="switch ' + (t.cuotas ? 'on' : '') + '" data-toggle-cuotas="' + t.id + '" aria-label="Pago en cuotas" aria-pressed="' + (t.cuotas ? 'true' : 'false') + '"></button></div>' +
                    (t.cuotas ? '<div class="cuota-stepper-wrap"><span class="cs-label">Número de cuotas</span>' +
                        '<div class="stepper"><button data-cuotas-step="-1" data-tx="' + t.id + '" aria-label="Menos cuotas">' + ICONS.minus + '</button>' +
                        '<span class="count tabular">' + t.cuotas.total + '</span>' +
                        '<button data-cuotas-step="1" data-tx="' + t.id + '" aria-label="Más cuotas">' + ICONS.plus + '</button></div></div>' : '') +
                    '</div>';
        const medioOptsExisting = Object.keys(MEDIOS).map(function (k) {
            return '<option value="' + k + '" ' + (t.medio === k ? 'selected' : '') + '>' + MEDIOS[k].nombre + '</option>';
        }).join('');
        // El botón de borrar ya no depende de que la transacción venga importada por correo — ver
        // sheet-bottom-actions más abajo, que ahora ofrece borrar cualquier transacción. Acá solo
        // queda el aviso informativo de dónde salió, sin su propio botón de borrar duplicado.
        const importedBlock = !t.importadoEmail ? '' :
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Importada desde tu correo</div>' +
                '<p class="muted" style="font-size:12.5px;margin:0;">Esta transacción se agregó sola a partir de un correo de tu banco.</p>' +
                '</div>';
        // Formato del detalle, encapsulado en tarjetas .card (una por sección) — mismo criterio
        // visual que usamos en el resto de la app. El orden agrupa lo que va junto: Monto/Fecha
        // con el medio de pago (todo "cuándo y con qué"), Tipo con Recurrencia (todo "qué tipo de
        // movimiento es"), y deja Cuotas/Categoría/regla-automática/acciones cada una en la suya —
        // las funciones (cuotas, reembolsos, por-cobrar) siguen intactas, solo cambia el envoltorio.
        const tipoRecurrenciaCard = isInvest
            ? '<div class="sheet-block card" style="padding:16px;">' +
                '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>' + tipoSelector +
                '</div>'
            : '<div class="sheet-block card" style="padding:16px;">' +
                '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>' + tipoSelector +
                '<div class="draft-label" style="margin:16px 0 7px;">Recurrencia</div>' + recurrenciaSelector +
                '<p class="cat-picker-hint" style="margin-top:8px;">"Mensual" y "Anual" cuentan como <b>gasto fijo</b> en tus metas de Resumen · Balance — "Variable" es todo lo demás. No existe una opción separada llamada "Fijo".</p>' +
                '</div>';
        return '<div class="sheet-top">' +
            '<div class="merchant" id="sheet-title-el">' + t.comercio + '</div>' +
            '<div class="meta">' + dayLabel(t.fecha) + ' · ' + t.hora + ' · ' + medioInfo(t.medio).nombre + '</div>' +
            '<div class="sheet-amount ' + (isIncome ? 'pos' : '') + ' tabular">' + (isIncome ? '+' : '') + money(t.monto) + '</div>' +
            '<div class="meta" data-nota-echo style="margin-top:6px;' + (t.nota ? '' : 'display:none;') + '">' + (t.nota || '') + '</div>' +
            '</div>' +
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Monto y fecha</div>' +
            '<div class="draft-field"><label class="draft-label">Monto</label>' +
            '<div class="edit-amount-row">' +
            '<input type="text" inputmode="decimal" class="draft-input tabular" data-tx-field="monto" data-tx="' + t.id + '" value="' + t.monto + '">' +
            '<span class="edit-amount-echo tabular">' + (isIncome ? '+' : '') + money(t.monto) + '</span>' +
            '</div>' +
            '</div>' +
            '<div class="edit-field-pair">' +
            '<div class="edit-field-col draft-field"><label class="draft-label">Fecha</label>' +
            '<input type="date" class="draft-input" data-tx-field="fecha" data-tx="' + t.id + '" value="' + t.fecha + '"></div>' +
            '<div class="edit-field-col draft-field"><label class="draft-label">Hora</label>' +
            '<input type="time" class="draft-input" data-tx-field="hora" data-tx="' + t.id + '" value="' + t.hora + '"></div>' +
            '</div>' +
            '<div class="muted edit-day-hint">' + dayLabel(t.fecha) + '</div>' +
            '<div class="draft-field" style="margin:14px 0 0;"><label class="draft-label">Con qué pagaste</label>' +
            '<select class="draft-select" data-tx-medio-select="' + t.id + '">' + medioOptsExisting + '</select>' +
            '</div>' +
            '</div>' +
            tipoRecurrenciaCard +
            cuotaBlock +
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Categoría' + (cats.length > 1 ? 's' : '') + '</div>' + categoriaSection +
            '</div>' +
            (isInvest ? '' :
                '<div class="sheet-block card lock-card' + (t.reglaAuto ? ' active-rule' : '') + '" style="padding:14px 16px;"><div class="lock-row">' +
                    '<span class="lock-icon">' + ICONS.lock + '</span>' +
                    '<span class="lock-text">' + (t.reglaAuto ? 'Ya clasificamos siempre así lo de <b>' + t.comercio + '</b>' : 'Clasificar siempre así los gastos de <b>' + t.comercio + '</b>') + '</span>' +
                    '<button class="switch ' + (t.reglaAuto ? 'on' : '') + '" data-toggle-lock="' + t.id + '" aria-label="Activar regla automática" aria-pressed="' + (t.reglaAuto ? 'true' : 'false') + '"></button>' +
                    '</div></div>') +
            (isInvest ? '' :
                isIncome
                    ? (function () {
                        const vinculo = pendienteVinculadaA(t.id);
                        // Antes esta tarjeta aparecía en el detalle de CUALQUIER ingreso apenas hubiera algún
                        // pendiente en algún otro lado de la app — así que un sueldo con su categoría normal
                        // ("Sueldo Agosto") también la mostraba, sin ningún sentido: un sueldo categorizado
                        // nunca es la plata de un cobro o reembolso. Ahora la tarjeta solo se ofrece cuando
                        // este ingreso todavía no tiene categoría asignada (un depósito ambiguo, tipo
                        // "Transferencia de Fran", es justo el caso en que podría ser el pago de un pendiente)
                        // — salvo que ya esté vinculado, en cuyo caso siempre se muestra para poder verlo/quitarlo.
                        if (!vinculo && (t.categorias.length > 0 || pendientesGlobales().length === 0))
                            return '';
                        return '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos</div>' +
                            (vinculo
                                ? '<div class="cobro-banner-done">' + ICONS.checkCircle + '<span>Vinculado a ' + (vinculo.persona || 'un pendiente') + ' · ' + vinculo.comercio + '</span></div>' +
                                    '<button class="split-toggle-link" data-unlink-ingreso="' + t.id + '">Quitar vínculo</button>'
                                : '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">Si este depósito corresponde a un cobro o reembolso pendiente, vincúlalo para tacharlo de la lista.</p>' +
                                    '<button class="action-btn" data-open-link-ingreso="' + t.id + '">' + ICONS.inbox + ' Vincular a un pendiente</button>') +
                            '</div>';
                    })()
                    : '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Acciones rápidas</div><div class="quick-actions">' +
                        '<button class="action-btn ' + (t.estado === 'confirmado' ? 'selected' : '') + '" data-action="confirmar" data-tx="' + t.id + '">' + ICONS.checkCircle + ' Confirmar gasto</button>' +
                        '<button class="action-btn ' + (tienePorCobrarTipo(t, 'persona') ? 'selected' : '') + '" data-action="porcobrar_persona" data-tx="' + t.id + '">' + ICONS.users + ' Por cobrar a alguien</button>' +
                        '<button class="action-btn ' + (tienePorCobrarTipo(t, 'reembolso') ? 'selected' : '') + '" data-action="porcobrar_reembolso" data-tx="' + t.id + '">' + ICONS.inbox + ' Reembolso pendiente</button>' +
                        '<button class="action-btn ' + (t.estado === 'no_es_gasto' ? 'selected' : '') + '" data-action="noesgasto" data-tx="' + t.id + '">' + ICONS.ban + ' No es gasto</button>' +
                        '</div></div>' +
                        (t.estado === 'por_cobrar' ? '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Cobros y reembolsos pendientes</div>' + renderCobroSplitBlock(t) + '</div>' : ''))
            + '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Nota</div>' +
            '<input type="text" class="draft-input nota-input" data-tx-field="nota" data-tx="' + t.id + '" value="' + (t.nota || '').replace(/"/g, '&quot;') + '" placeholder="Agregar notas personales">' +
            '</div>'
            + importedBlock
            + (state.confirmDeleteTxId === t.id
                ? '<div class="sheet-delete-confirm">' +
                    '<p class="muted" style="font-size:12.5px;margin:0 0 10px;">¿Seguro que quieres eliminar esta transacción? No se puede deshacer.</p>' +
                    '<div style="display:flex;gap:8px;">' +
                    '<button class="save-tx-btn" style="flex:1;background:var(--surface-sunken);color:var(--text);" data-cancel-delete-tx="' + t.id + '">Cancelar</button>' +
                    '<button class="save-tx-btn" style="flex:1;background:var(--cat-pink-fill);color:var(--expense-ink);" data-confirm-delete-tx="' + t.id + '">Sí, eliminar</button>' +
                    '</div></div>'
                : '<div class="sheet-bottom-actions">' +
                    '<button class="sheet-delete-btn" data-ask-delete-tx="' + t.id + '" aria-label="Eliminar transacción">' + ICONS.trash + '</button>' +
                    '<button class="sheet-done-btn" data-close-sheet-done>' + ICONS.check + ' Listo</button>' +
                    '</div>');
    }
    function openSheet(txId) {
        state.openTxId = txId;
        state.creatingNew = false;
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
        setTimeout(() => { const b = document.getElementById('sheet-close-btn'); if (b)
            b.focus(); }, 260);
    }
    let draftIdCounter = 1;
    let medioIdCounter = 0;
    function openNewTxSheet(tipoInicial) {
        state.openTxId = null;
        state.creatingNew = true;
        state.draftTx = {
            // Antes esto era siempre 'visa_bch' — un medio que solo existe en los datos de ejemplo.
            // En una cuenta real (que empieza solo con "Efectivo"), ese id no existía en MEDIOS: el
            // selector de abajo mostraba "Efectivo" por default del navegador (al no encontrar la
            // opción marcada), pero por dentro el borrador seguía apuntando a 'visa_bch' — si no
            // tocabas el selector, se guardaba así, roto. Ahora arranca con el primer medio real que
            // ya tengas, así lo que se ve seleccionado y lo que se guarda siempre calzan.
            comercio: '', monto: 0, fecha: todayISO(), hora: '12:00', medio: Object.keys(MEDIOS)[0] || 'efectivo',
            tipo: tipoInicial || 'gasto', recurrencia: 'variable', categorias: [], porCobrar: []
        };
        state.addingMedio = false;
        state.newMedioDraft = { nombre: '', ultimos4: '' };
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
        setTimeout(() => { const el = document.querySelector('[data-draft-field="comercio"]'); if (el)
            el.focus(); }, 260);
    }
    function openFilterSheet() {
        state.openTxId = null;
        state.creatingNew = false;
        state.filterSheetOpen = true;
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
    }
    function closeSheet() {
        state.openTxId = null;
        state.creatingNew = false;
        state.draftTx = null;
        state.filterSheetOpen = false;
        state.linkFlow = null;
        state.boleta = null;
        state.confirmDeleteTxId = null;
        document.getElementById('sheet-overlay').classList.remove('open');
    }
    /* ---------- vincular un depósito a un pendiente (o viceversa) ---------- */
    function openLinkFromPendiente(gastoTxId, idx) {
        state.linkFlow = { mode: 'fromPendiente', gastoTxId, idx };
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
    }
    function openLinkFromIngreso(ingresoTxId) {
        state.linkFlow = { mode: 'fromIngreso', ingresoTxId };
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
    }
    function renderLinkFlowContent() {
        const lf = state.linkFlow;
        if (lf.mode === 'fromPendiente') {
            const gastoTx = getTx(lf.gastoTxId);
            const p = gastoTx ? gastoTx.porCobrar[lf.idx] : null;
            if (!gastoTx || !p)
                return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
            const ingresos = TX.filter(t => t.tipo === 'ingreso').slice().sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
            const rows = ingresos.map(t => {
                const yaVinculado = pendienteVinculadaA(t.id);
                return '<button class="link-pick-row" data-pick-ingreso="' + t.id + '">' +
                    '<span class="link-pick-body"><span class="link-pick-name">' + t.comercio + '</span>' +
                    '<span class="link-pick-sub">' + dayLabel(t.fecha) + (yaVinculado ? ' · ya vinculado a ' + yaVinculado.comercio : '') + '</span></span>' +
                    '<span class="link-pick-amt tabular pos">+' + money(t.monto) + '</span>' +
                    '</button>';
            }).join('');
            return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
                '<div class="merchant" style="font-size:17px;">¿Qué depósito corresponde?</div>' +
                '<div class="meta">Elige el ingreso que corresponde a ' + (p.persona || 'este pendiente') + ' — ' + gastoTx.comercio + '.</div>' +
                '</div>' +
                (ingresos.length ? rows : '<div class="card placeholder-card">' + ICONS.inbox + '<h3>No tienes ingresos registrados</h3><p>Cuando tengas una transacción de ingreso, aparecerá acá para vincularla.</p></div>');
        }
        else {
            const ingresoTx = getTx(lf.ingresoTxId);
            if (!ingresoTx)
                return '<div class="sheet-top"><div class="merchant">Ya no existe</div></div>';
            const pendientes = pendientesGlobales();
            const rows = pendientes.map(p => {
                const montoTxt = p.monto != null ? money(p.monto) + ' esperado' : 'monto por confirmar';
                return '<button class="link-pick-row" data-pick-pendiente="' + p.gastoTxId + '|' + p.idx + '">' +
                    '<span class="link-pick-body"><span class="link-pick-name">' + (p.persona || 'Sin nombre') +
                    (p.tipo === 'reembolso' ? ' <span class="pend-tipo-tag" style="margin-left:4px;">Reembolso</span>' : '') + '</span>' +
                    '<span class="link-pick-sub">' + p.comercio + ' · ' + dayLabel(p.fecha) + '</span></span>' +
                    '<span class="link-pick-amt tabular muted">' + montoTxt + '</span>' +
                    '</button>';
            }).join('');
            return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
                '<div class="merchant" style="font-size:17px;">¿A qué pendiente corresponde?</div>' +
                '<div class="meta">Este depósito de ' + money(ingresoTx.monto) + ' (' + ingresoTx.comercio + ') se vinculará a lo que elijas.</div>' +
                '</div>' +
                (pendientes.length ? rows : '<div class="card placeholder-card">' + ICONS.checkCircle + '<h3>No tienes pendientes</h3><p>No hay ningún cobro o reembolso pendiente para vincular todavía.</p></div>');
        }
    }
    /* ---------- dividir boleta con amigos (simulado — sin OCR ni link real) ---------- */
    let boletaItemIdCounter = 0;
    // Un par de boletas de ejemplo para que "escanear" no muestre siempre lo mismo — nada de
    // esto viene de una foto real, es solo para practicar el flujo de asignar y repartir.
    const BOLETA_EJEMPLOS = [
        { comercio: 'Sushi Itto Providencia', items: [
                { nombre: 'Roll California x2', monto: 14000 }, { nombre: 'Sashimi mixto', monto: 16000 },
                { nombre: 'Bebidas (3)', monto: 6000 }, { nombre: 'Propina sugerida', monto: 3600 }
            ] },
        { comercio: 'Pizzería Don Telmo', items: [
                { nombre: 'Pizza familiar', monto: 18000 }, { nombre: 'Papas fritas', monto: 6000 },
                { nombre: 'Cervezas (4)', monto: 16000 }
            ] }
    ];
    function boletaPersonas() { return ['Yo'].concat(CONTACTOS); }
    function openBoletaFlow(gastoTxId) {
        const gastoTx = getTx(gastoTxId);
        if (!gastoTx)
            return;
        state.boleta = { step: 'capturar', gastoTxId, comercio: gastoTx.comercio, items: [], asign: {}, propinaUnit: '%', propinaValor: '' };
        document.getElementById('sheet-overlay').classList.add('open');
        renderSheet();
        document.getElementById('sheet-content').scrollTop = 0;
    }
    function boletaPersonTotals() {
        const b = state.boleta;
        const totals = {};
        boletaPersonas().forEach(p => totals[p] = 0);
        b.items.forEach(item => {
            const asignados = b.asign[item.id] || [];
            if (asignados.length === 0)
                return;
            const share = item.monto / asignados.length;
            asignados.forEach(p => { totals[p] = (totals[p] || 0) + share; });
        });
        return totals;
    }
    function boletaTotal() { return state.boleta.items.reduce((s, i) => s + i.monto, 0); }
    // Propina: un % (sobre el subtotal de los items) o un monto fijo — se suma aparte de los
    // items y multiplica por igual lo que le corresponde a cada persona (nadie se "salva" de la
    // propina solo porque comió menos, se reparte proporcional a lo que consumió cada uno).
    function boletaPropinaMonto() {
        const b = state.boleta;
        const v = b.propinaValor === '' ? null : safeEvalExpr(String(b.propinaValor));
        if (v == null || v <= 0)
            return 0;
        return b.propinaUnit === '%' ? Math.round(boletaTotal() * v / 100) : Math.round(v);
    }
    function boletaTotalConPropina() { return boletaTotal() + boletaPropinaMonto(); }
    function boletaPersonTotalsConPropina() {
        const subtotal = boletaTotal();
        const propina = boletaPropinaMonto();
        const base = boletaPersonTotals();
        if (propina <= 0 || subtotal <= 0)
            return base;
        const factor = (subtotal + propina) / subtotal;
        const out = {};
        Object.keys(base).forEach(p => { out[p] = base[p] * factor; });
        return out;
    }
    function renderBoletaCapturar() {
        const b = state.boleta;
        return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
            '<div class="merchant" style="font-size:17px;">Boleta de ' + (b.comercio || 'esta transacción') + '</div>' +
            '<div class="meta">Sácale una foto o súbela desde tu galería y la convertimos en una lista de items para repartir.</div>' +
            '</div>' +
            '<div class="boleta-capture-row">' +
            '<button class="boleta-capture-btn" data-boleta-capture="camara">' + ICONS.camera + '<span>Tomar foto</span></button>' +
            '<button class="boleta-capture-btn" data-boleta-capture="galeria">' + ICONS.image + '<span>Elegir de galería</span></button>' +
            '</div>' +
            '<div class="file-format-hint">Esta maqueta simula el resultado con una boleta de ejemplo — no procesa fotos de verdad.</div>';
    }
    function renderBoletaProcesando() {
        return '<div class="boleta-processing"><div class="boleta-spinner"></div><span>Leyendo tu boleta…</span></div>';
    }
    function renderBoletaItems() {
        const b = state.boleta;
        const rows = b.items.map((item, idx) => '<div class="split-row" data-boleta-item-row="' + idx + '">' +
            '<input type="text" data-boleta-item-nombre="' + idx + '" value="' + item.nombre + '" placeholder="Nombre del item">' +
            '<span class="num-wrap"><input type="text" inputmode="decimal" data-boleta-item-monto="' + idx + '" value="' + item.monto + '"><span>$</span></span>' +
            '<button class="rm-btn" data-boleta-item-remove="' + idx + '">' + ICONS.trash + '</button>' +
            '</div>').join('');
        const total = boletaTotal();
        const canContinue = b.items.length > 0 && total > 0;
        const quickChips = [10, 15, 20].map(pct => '<button class="boleta-tip-chip' + (b.propinaUnit === '%' && Number(b.propinaValor) === pct ? ' active' : '') + '" data-boleta-propina-quick="' + pct + '">' + pct + '%</button>').join('');
        const propinaCard = '<div class="card boleta-propina-card">' +
            '<div class="split-mode-row"><span class="muted" style="font-size:12.5px;">¿Agregaste propina?</span>' +
            '<div class="mini-toggle"><button data-boleta-propina-unit="%" class="' + (b.propinaUnit === '%' ? 'active' : '') + '">%</button><button data-boleta-propina-unit="$" class="' + (b.propinaUnit === '$' ? 'active' : '') + '">$</button></div>' +
            '</div>' +
            (b.propinaUnit === '%' ? '<div class="boleta-tip-chips">' + quickChips + '</div>' : '') +
            '<span class="num-wrap"><input type="text" inputmode="decimal" data-boleta-propina-input value="' + b.propinaValor + '" placeholder="' + (b.propinaUnit === '%' ? 'Otro %' : 'Monto $') + '"><span>' + b.propinaUnit + '</span></span>' +
            '</div>';
        return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
            '<div class="merchant" style="font-size:17px;">' + (b.comercio || 'Tu boleta') + '</div>' +
            '<div class="meta">Revisa los items — puedes editarlos, agregar o borrar antes de repartir.</div>' +
            '</div>' +
            rows +
            '<button class="split-add" data-boleta-add-item>' + ICONS.plus + ' Agregar item</button>' +
            propinaCard +
            '<div id="boleta-totals-summary">' + renderBoletaItemsTotalsSummary() + '</div>' +
            '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-goto="asignar" ' + (canContinue ? '' : 'disabled') + '>Continuar</button>';
    }
    // El resumen de totales del paso "items" vive en su propio bloque con id fijo para poder
    // refrescarlo solo (sin re-renderizar todo el sheet) mientras la usuaria sigue escribiendo
    // en un monto o en la propina — así no pierde el foco del input a medio tipeo.
    function renderBoletaItemsTotalsSummary() {
        const total = boletaTotal();
        const propina = boletaPropinaMonto();
        const totalConPropina = boletaTotalConPropina();
        return propina > 0
            ? '<div class="split-remaining"><span>Subtotal (sin propina)</span><span class="tabular muted">' + money(total) + '</span></div>' +
                '<div class="split-remaining"><span>Propina</span><span class="tabular">' + money(propina) + '</span></div>' +
                '<div class="split-remaining"><span>Total con propina</span><span class="tabular" style="font-weight:800;">' + money(totalConPropina) + '</span></div>'
            : '<div class="split-remaining"><span>Total de la boleta</span><span class="tabular">' + money(total) + '</span></div>';
    }
    function renderBoletaAsignar() {
        const b = state.boleta;
        const personas = boletaPersonas();
        const itemBlocks = b.items.map(item => {
            const asignados = b.asign[item.id] || [];
            const chips = personas.map(p => '<button class="boleta-person-chip' + (asignados.includes(p) ? ' active' : '') + '" data-boleta-toggle-person="' + item.id + '|' + p + '">' + p + '</button>').join('');
            return '<div class="card boleta-item-block">' +
                '<div class="boleta-item-head"><span class="boleta-item-name">' + item.nombre + '</span><span class="boleta-item-amt tabular">' + money(item.monto) + '</span></div>' +
                '<div class="boleta-person-chips">' + chips + '</div>' +
                (asignados.length === 0 ? '<div class="file-format-hint" style="margin-top:8px;">Sin asignar todavía.</div>' : '') +
                '</div>';
        }).join('');
        const totals = boletaPersonTotalsConPropina();
        const totalsSin = boletaPersonTotals();
        const conPropina = boletaPropinaMonto() > 0;
        const sinAsignar = b.items.some(i => !(b.asign[i.id] || []).length);
        return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
            '<div class="merchant" style="font-size:17px;">¿Quién se comió qué?</div>' +
            '<div class="meta">Toca los nombres de cada item — si lo comieron entre varios, se divide en partes iguales.</div>' +
            '</div>' +
            itemBlocks +
            '<div class="card boleta-totals-card">' +
            personas.map(p => boletaTotalRowHtml(p, totalsSin[p] || 0, totals[p] || 0, conPropina, false)).join('') +
            '</div>' +
            '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-goto="resumen" ' + (sinAsignar ? 'disabled' : '') + '>Continuar</button>' +
            (sinAsignar ? '<div class="field-error">Asigna cada item a al menos una persona para continuar.</div>' : '');
    }
    // Fila de un total por persona — si hay propina, muestra el monto sin propina (chico, arriba)
    // y el monto con propina (el que realmente le corresponde pagar) debajo.
    function boletaTotalRowHtml(nombre, sinPropina, conPropinaMonto, showBoth, esYo) {
        const amt = showBoth
            ? '<span class="amt-group"><span class="muted tabular boleta-amt-sin">' + money(sinPropina) + ' sin propina</span><span class="amt tabular">' + money(conPropinaMonto) + '</span></span>'
            : '<span class="amt tabular">' + money(conPropinaMonto) + '</span>';
        return '<div class="boleta-total-row"><span class="name">' + nombre + (esYo ? ' (tú)' : '') + '</span>' + amt + '</div>';
    }
    function renderBoletaResumen() {
        const b = state.boleta;
        const totals = boletaPersonTotalsConPropina();
        const totalsSin = boletaPersonTotals();
        const conPropina = boletaPropinaMonto() > 0;
        return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
            '<div class="merchant" style="font-size:17px;">Así queda repartido</div>' +
            '<div class="meta">Total de la boleta: ' + money(boletaTotalConPropina()) + (conPropina ? ' (incluye propina)' : '') + '</div>' +
            '</div>' +
            '<div class="card boleta-totals-card">' +
            boletaPersonas().map(p => boletaTotalRowHtml(p, totalsSin[p] || 0, totals[p] || 0, conPropina, p === 'Yo')).join('') +
            '</div>' +
            '<div class="boleta-preview-banner">' + ICONS.sparkle + '<span>Próximamente: vas a poder mandarles un link para que cada uno marque lo que consumió, sin que tengas que calcular tú.</span></div>' +
            '<button class="save-tx-btn" style="width:100%;margin-top:14px;" data-boleta-guardar>Guardar reparto en la transacción</button>';
    }
    function renderBoletaSheetContent() {
        const step = state.boleta.step;
        if (step === 'capturar')
            return renderBoletaCapturar();
        if (step === 'procesando')
            return renderBoletaProcesando();
        if (step === 'items')
            return renderBoletaItems();
        if (step === 'asignar')
            return renderBoletaAsignar();
        return renderBoletaResumen();
    }
    function guardarBoleta() {
        const b = state.boleta;
        const gastoTx = getTx(b.gastoTxId);
        if (!gastoTx)
            return;
        const totals = boletaPersonTotalsConPropina();
        const nuevoPorCobrar = boletaPersonas().filter(p => p !== 'Yo' && totals[p] > 0).map(p => ({ persona: p, monto: Math.round(totals[p]), pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null }));
        // la foto reemplaza el reparto manual que hubiera antes en esta transacción — es la fuente de verdad
        // sobre quién consumió qué; el monto total del gasto no se toca, sigue siendo lo que tú pagaste.
        gastoTx.porCobrar = nuevoPorCobrar;
        if (nuevoPorCobrar.length > 0)
            gastoTx.estado = 'por_cobrar';
        state.splitCobroMode[gastoTx.id] = true;
        state.boleta = null;
        closeSheet();
        render();
        openSheet(gastoTx.id);
        toast('Reparto guardado en la transacción');
    }
    // Antes usaba ICONS[icon] directo — funciona para un ícono con nombre del set fijo (los
    // medios de pago: 'card', 'bank', 'cash'), pero la mayoría de las categorías de gasto/ingreso
    // usan un emoji suelto como ícono (ver catIconMarkup más arriba), así que ICONS[icon] daba
    // "undefined" y los chips de categoría del filtro se veían como "undefined Hogar", "undefined
    // Supermercado", etc. catIconMarkup ya resuelve ambos casos (nombre conocido o emoji suelto).
    function chipToggle(attrName, id, label, icon, active) {
        return '<button class="cat-picker-chip" data-' + attrName + '="' + id + '" ' + (active ? 'style="background:var(--accent-soft);border-color:var(--accent);color:var(--accent-ink);"' : '') + '>' + (icon ? catIconMarkup(icon) + ' ' : '') + label + '</button>';
    }
    function renderFilterSheetContent() {
        const af = state.advFilters;
        const catChips = '<div class="cat-picker-grid">' +
            chipToggle('toggle-filter-cat', '__sin_cat__', 'Sin categoría', null, af.cats.includes('__sin_cat__')) +
            Object.keys(CATS).map(k => chipToggle('toggle-filter-cat', k, CATS[k].nombre, CATS[k].icon, af.cats.includes(k))).join('') +
            '</div>';
        const medioChips = '<div class="cat-picker-grid">' +
            Object.keys(MEDIOS).map(k => chipToggle('toggle-filter-medio', k, MEDIOS[k].nombre, MEDIOS[k].icon, af.medios.includes(k))).join('') +
            '</div>';
        const count = advFilterCount();
        return '<div class="sheet-top" style="text-align:left;padding:8px 2px 4px;">' +
            '<div class="merchant" style="font-size:17px;">Filtros</div>' +
            '<div class="meta">Filtra las transacciones por categoría, tarjeta o fecha.</div>' +
            '</div>' +
            '<div class="sheet-block"><div class="sheet-block-title">Categoría</div>' + catChips + '</div>' +
            '<div class="sheet-block"><div class="sheet-block-title">Tarjeta / medio</div>' + medioChips + '</div>' +
            '<div class="sheet-block"><div class="sheet-block-title">Rango de fechas</div>' +
            '<div class="filter-date-row">' +
            '<input type="date" data-filter-date="from" value="' + (af.dateFrom || '') + '" aria-label="Desde">' +
            '<input type="date" data-filter-date="to" value="' + (af.dateTo || '') + '" aria-label="Hasta">' +
            '</div>' +
            '</div>' +
            '<div class="sheet-block" style="display:flex;gap:10px;">' +
            '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-clear-advfilters>Limpiar' + (count ? ' (' + count + ')' : '') + '</button>' +
            '<button class="save-tx-btn" style="flex:1;" data-apply-advfilters>Ver resultados</button>' +
            '</div>';
    }
    function renderNewTxSheetContent(d) {
        const tipoOpts = [{ id: 'gasto', label: 'Gasto' }, { id: 'ingreso', label: 'Ingreso' }, { id: 'inversion', label: 'Inversión' }];
        const medioOpts = Object.keys(MEDIOS).map(k => '<option value="' + k + '" ' + (d.medio === k ? 'selected' : '') + '>' + MEDIOS[k].nombre + '</option>').join('') +
            '<option value="__nuevo_medio__">+ Agregar tarjeta o medio nuevo…</option>';
        const canSave = d.comercio.trim().length > 0 && d.monto > 0;
        const nm = state.newMedioDraft;
        const isInvestDraft = d.tipo === 'inversion';
        const newMedioForm = state.addingMedio
            ? '<div class="new-medio-form">' +
                '<label class="draft-label">Nombre de la tarjeta o medio</label>' +
                '<input type="text" class="draft-input" data-new-medio-field="nombre" value="' + nm.nombre.replace(/"/g, '&quot;') + '" placeholder="Ej: Visa Falabella, Mach…">' +
                '<label class="draft-label" style="margin-top:12px;">Últimos 4 dígitos (opcional)</label>' +
                '<input type="text" inputmode="numeric" maxlength="4" class="draft-input" data-new-medio-field="ultimos4" value="' + nm.ultimos4.replace(/"/g, '&quot;') + '" placeholder="Ej: 1234">' +
                '<div style="display:flex;gap:10px;margin-top:12px;">' +
                '<button class="save-tx-btn" style="background:var(--surface-sunken);color:var(--text);flex:1;" data-cancel-new-medio>Cancelar</button>' +
                '<button class="save-tx-btn" style="flex:1;" data-save-new-medio ' + (nm.nombre.trim() ? '' : 'disabled') + '>Agregar</button>' +
                '</div>' +
                '</div>'
            : '';
        // Mismo envoltorio de tarjetas .sheet-block/.card que usa el detalle de una transacción ya
        // creada (antes esta hoja era una lista plana de campos sueltos, muy distinta a como se ve
        // después al abrir esa misma transacción) — agrupa lo mismo que agrupa el detalle: monto y
        // fecha, tipo + recurrencia, categoría (con la fila compacta de ícono + select), medio de pago.
        return '<div class="sheet-top" style="padding-top:4px;">' +
            '<div class="meta" style="font-size:13px;font-weight:700;color:var(--text);">Nueva transacción</div>' +
            '</div>' +
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Comercio y monto</div>' +
            '<div class="draft-field"><label class="draft-label">Comercio</label>' +
            '<input type="text" class="draft-input" data-draft-field="comercio" value="' + d.comercio.replace(/"/g, '&quot;') + '" placeholder="Ej: Jumbo, Uber, Sueldo…"></div>' +
            '<div class="draft-field" style="margin-top:14px;"><label class="draft-label">Monto</label>' +
            '<input type="text" inputmode="decimal" class="draft-input amount tabular" data-draft-field="monto" value="' + (d.monto || '') + '" placeholder="0"></div>' +
            '<div class="draft-field" style="margin-top:14px;"><label class="draft-label">Fecha</label>' +
            '<input type="date" class="draft-input" data-draft-field="fecha" value="' + d.fecha + '"></div>' +
            '</div>' +
            '<div class="sheet-block card" style="padding:16px;">' +
            '<div class="draft-label" style="margin-bottom:7px;">Tipo</div>' + segmentedHtml('draft-tipo', tipoOpts, d.tipo) +
            (isInvestDraft ? '' :
                '<div class="draft-label" style="margin:16px 0 7px;">Recurrencia</div>' +
                    segmentedHtml('draft-recurrencia', [{ id: 'variable', label: 'Variable' }, { id: 'mensual', label: 'Mensual' }, { id: 'anual', label: 'Anual' }], d.recurrencia)) +
            '</div>' +
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Categoría</div>' + renderDraftCategoriaRow(d) + '</div>' +
            '<div class="sheet-block card" style="padding:16px;"><div class="sheet-block-title">Medio de pago</div>' +
            (state.addingMedio ? '' : '<select class="draft-select" data-draft-field="medio">' + medioOpts + '</select>') +
            newMedioForm +
            '</div>' +
            '<button class="save-tx-btn" data-save-draft="1" ' + (canSave ? '' : 'disabled') + '>Guardar transacción</button>' +
            (canSave ? '' : '<div class="field-error">Ponle un nombre de comercio y un monto para poder guardar.</div>');
    }
    function saveDraftTx() {
        const d = state.draftTx;
        if (!d || d.comercio.trim().length === 0 || !(d.monto > 0))
            return;
        draftIdCounter++;
        const id = 'manual-' + Date.now() + '-' + draftIdCounter;
        const tx = {
            id, fecha: d.fecha, hora: d.hora, comercio: d.comercio.trim(), monto: Math.round(d.monto),
            medio: d.medio, tipo: d.tipo, recurrencia: d.recurrencia,
            estado: d.categorias.length > 0 ? 'confirmado' : 'pendiente',
            categorias: d.categorias.length > 0 ? [{ cat: d.categorias[0].cat, monto: Math.round(d.monto) }] : [],
            porCobrar: [], reglaAuto: false, nota: ''
        };
        TX.push(tx);
        ensureMonthExists(tx.fecha.slice(0, 7));
        state.categoryFilter = null;
        state.categoryFilterMonth = null;
        state.filter = 'todas';
        state.tab = 'transacciones';
        closeSheet();
        render();
        toast('Transacción agregada');
    }
    function renderSheet() {
        if (state.boleta) {
            const contentEl = document.getElementById('sheet-content');
            contentEl.innerHTML = renderBoletaSheetContent();
            document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
            return;
        }
        if (state.linkFlow) {
            const contentEl = document.getElementById('sheet-content');
            contentEl.innerHTML = renderLinkFlowContent();
            document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
            return;
        }
        if (state.filterSheetOpen) {
            const contentEl = document.getElementById('sheet-content');
            contentEl.innerHTML = renderFilterSheetContent();
            document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
            return;
        }
        if (state.creatingNew) {
            const contentEl = document.getElementById('sheet-content');
            contentEl.innerHTML = renderNewTxSheetContent(state.draftTx);
            document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
            return;
        }
        if (!state.openTxId) {
            return;
        }
        const t = getTx(state.openTxId);
        if (!t) {
            closeSheet();
            return;
        }
        const contentEl = document.getElementById('sheet-content');
        contentEl.innerHTML = renderSheetContent(t);
        document.getElementById('sheet-close-btn').innerHTML = ICONS.close;
    }
    /* ===================== EVENT HANDLING (delegated) ===================== */
    const phone = document.getElementById('phone');
    phone.addEventListener('click', function (e) {
        const authTabBtn = e.target.closest('[data-auth-tab]');
        if (authTabBtn) {
            switchAuthMode(authTabBtn.getAttribute('data-auth-tab'));
            return;
        }
        const authLogoutBtn = e.target.closest('[data-auth-logout]');
        if (authLogoutBtn) {
            handleLogout();
            return;
        }
        const copyTextBtn = e.target.closest('[data-copy-text]');
        if (copyTextBtn) {
            const txt = copyTextBtn.getAttribute('data-copy-text');
            if (txt && navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(function () { toast('Copiado'); }).catch(function () { toast('No se pudo copiar'); });
            }
            return;
        }
        const reloadImportCorreoBtn = e.target.closest('[data-reload-import-correo]');
        if (reloadImportCorreoBtn) {
            state.importCorreoLoaded = false;
            state.importCorreoError = null;
            state.importCorreoLoading = true;
            renderMenuView();
            loadImportCorreoScreen();
            return;
        }
        const askDeleteTxBtn = e.target.closest('[data-ask-delete-tx]');
        if (askDeleteTxBtn) {
            state.confirmDeleteTxId = askDeleteTxBtn.getAttribute('data-ask-delete-tx');
            renderSheet();
            return;
        }
        const cancelDeleteTxBtn = e.target.closest('[data-cancel-delete-tx]');
        if (cancelDeleteTxBtn) {
            state.confirmDeleteTxId = null;
            renderSheet();
            return;
        }
        const confirmDeleteTxBtn = e.target.closest('[data-confirm-delete-tx]');
        if (confirmDeleteTxBtn) {
            const delId = confirmDeleteTxBtn.getAttribute('data-confirm-delete-tx');
            TX = TX.filter(function (t) { return t.id !== delId; });
            state.confirmDeleteTxId = null;
            closeSheet();
            render();
            toast('Transacción eliminada');
            return;
        }
        if (suppressNextSubtabClick) {
            suppressNextSubtabClick = false;
            return;
        }
        const fabBtn = e.target.closest('#fab-add');
        if (fabBtn) {
            openNewTxSheet();
            return;
        }
        const tabBtn = e.target.closest('[data-tab]');
        if (tabBtn) {
            state.tab = tabBtn.getAttribute('data-tab');
            render();
            // aprovechamos que abrió Transacciones para revisar si el script de Google dejó algo
            // nuevo en la bandeja de importadas y agregarlo solo, sin que tenga que ir a buscarlo
            if (state.tab === 'transacciones')
                absorbImportedRows();
            return;
        }
        const filterBtn = e.target.closest('[data-filter]');
        if (filterBtn) {
            state.filter = filterBtn.getAttribute('data-filter');
            render();
            return;
        }
        const dismissSueldo = e.target.closest('[data-dismiss-sueldo-suggestion]');
        if (dismissSueldo) {
            state.sueldoBannerDescartadoMes = todayISO().slice(0, 7);
            renderTransaccionesView();
            return;
        }
        const confirmSueldo = e.target.closest('[data-confirm-sueldo-suggestion]');
        if (confirmSueldo) {
            openSueldoSuggestionSheet(confirmSueldo.getAttribute('data-confirm-sueldo-suggestion'));
            return;
        }
        const clearCat = e.target.closest('[data-clear-catfilter]');
        if (clearCat) {
            state.categoryFilter = null;
            state.categoryFilterMonth = null;
            render();
            return;
        }
        const clearSearch = e.target.closest('[data-clear-search]');
        if (clearSearch) {
            state.searchQuery = '';
            renderTransaccionesView();
            return;
        }
        const openFiltersBtn = e.target.closest('[data-open-filters]');
        if (openFiltersBtn) {
            openFilterSheet();
            return;
        }
        const toggleFilterCat = e.target.closest('[data-toggle-filter-cat]');
        if (toggleFilterCat) {
            const cid = toggleFilterCat.getAttribute('data-toggle-filter-cat');
            const arr = state.advFilters.cats;
            const i = arr.indexOf(cid);
            if (i >= 0)
                arr.splice(i, 1);
            else
                arr.push(cid);
            renderSheet();
            return;
        }
        const toggleFilterMedio = e.target.closest('[data-toggle-filter-medio]');
        if (toggleFilterMedio) {
            const mid = toggleFilterMedio.getAttribute('data-toggle-filter-medio');
            const arr = state.advFilters.medios;
            const i = arr.indexOf(mid);
            if (i >= 0)
                arr.splice(i, 1);
            else
                arr.push(mid);
            renderSheet();
            return;
        }
        const clearAdv = e.target.closest('[data-clear-advfilters]');
        if (clearAdv) {
            state.advFilters = { cats: [], medios: [], dateFrom: '', dateTo: '' };
            renderSheet();
            return;
        }
        const applyAdv = e.target.closest('[data-apply-advfilters]');
        if (applyAdv) {
            closeSheet();
            renderTransaccionesView();
            return;
        }
        const subBtn = e.target.closest('[data-resumen-sub]');
        if (subBtn) {
            state.resumenSub = subBtn.getAttribute('data-resumen-sub');
            renderResumenView();
            return;
        }
        const monthNav = e.target.closest('[data-month-nav]');
        if (monthNav && !monthNav.disabled) {
            const d = parseInt(monthNav.getAttribute('data-month-nav'), 10);
            state.monthIndex = Math.max(0, Math.min(MONTHS.length - 1, state.monthIndex + d));
            renderResumenSubContent();
            return;
        }
        const legendRow = e.target.closest('[data-cat]');
        if (legendRow && (legendRow.classList.contains('legend-row') || legendRow.classList.contains('arc-seg'))) {
            const cid = legendRow.getAttribute('data-cat');
            state.categoryFilter = cid;
            state.categoryFilterMonth = MONTHS[state.monthIndex];
            state.filter = 'todas';
            state.tab = 'transacciones';
            render();
            return;
        }
        const txItem = e.target.closest('[data-tx]');
        if (txItem && txItem.classList.contains('tx-item')) {
            openSheet(txItem.getAttribute('data-tx'));
            return;
        }
        if (e.target.closest('#sheet-close-btn') || e.target === overlayEl() || e.target.closest('[data-close-sheet-done]')) {
            closeSheet();
            return;
        }
        const segBtn = e.target.closest('[data-seg-val]');
        if (segBtn && !segBtn.disabled) {
            const group = segBtn.closest('[data-seg]').getAttribute('data-seg');
            const val = segBtn.getAttribute('data-seg-val');
            if (group === 'draft-tipo' && state.draftTx) {
                state.draftTx.tipo = val;
                state.draftTx.categorias = []; // la categoría depende del tipo, se reinicia
                renderSheet();
                return;
            }
            if (group === 'draft-recurrencia' && state.draftTx) {
                state.draftTx.recurrencia = val;
                renderSheet();
                return;
            }
            if (group === 'meta-plazo') {
                state.metaDraft.plazo = val;
                renderInversionesView();
                return;
            }
            if (group === 'platform-plazo') {
                state.platformDraft.plazo = val;
                renderInversionesView();
                return;
            }
            if (group === 'newplatform-plazo') {
                state.newPlatformDraft.plazo = val;
                renderInversionesView();
                return;
            }
            if (group === 'cat-draft-tipo') {
                state.catDraft.tipo = val;
                renderMenuView();
                return;
            }
            const t = getTx(state.openTxId);
            if (t) {
                if (group === 'tipo' && t.tipo !== val) {
                    // La categoría depende del tipo (gasto/ingreso/inversión usan listas de categorías
                    // distintas) — igual que al crear una transacción nueva, se reinicia para no dejar
                    // una categoría "huérfana" que ya no corresponde a este tipo. Eso hacía que Balance
                    // contara mal: una transacción de gasto con una categoría vieja de otro tipo se
                    // colaba (o se perdía) en el desglose por categoría.
                    t.tipo = val;
                    t.categorias = [];
                }
                if (group === 'recurrencia')
                    t.recurrencia = val;
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const toggleCatEdit = e.target.closest('[data-toggle-catedit]');
        if (toggleCatEdit) {
            const id = toggleCatEdit.getAttribute('data-toggle-catedit');
            state.categoryEditMode[id] = true;
            renderSheet();
            return;
        }
        const cancelCatEdit = e.target.closest('[data-cancel-catedit]');
        if (cancelCatEdit) {
            const id = cancelCatEdit.getAttribute('data-cancel-catedit');
            state.categoryEditMode[id] = false;
            renderSheet();
            return;
        }
        const pickCatBtn = e.target.closest('[data-pick-cat]');
        if (pickCatBtn) {
            const t = getTx(state.openTxId);
            if (t) {
                const catId = pickCatBtn.getAttribute('data-pick-cat');
                const wasClassified = t.categorias.length > 0;
                t.categorias = [{ cat: catId, monto: t.monto }];
                if (t.estado === 'pendiente')
                    t.estado = 'confirmado';
                state.categoryEditMode[t.id] = false;
                toast(wasClassified ? 'Categoría actualizada a ' + catInfo(catId).nombre : 'Clasificada como ' + catInfo(catId).nombre);
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const toggleCuotas = e.target.closest('[data-toggle-cuotas]');
        if (toggleCuotas) {
            const t = getTx(toggleCuotas.getAttribute('data-toggle-cuotas'));
            if (t) {
                if (t.cuotas) {
                    delete t.cuotas;
                }
                else {
                    t.cuotas = { total: 2 };
                }
                regenerateCuotasFor(t.id);
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const cuotasStep = e.target.closest('[data-cuotas-step]');
        if (cuotasStep) {
            const t = getTx(cuotasStep.getAttribute('data-tx'));
            if (t && t.cuotas) {
                const delta = parseInt(cuotasStep.getAttribute('data-cuotas-step'), 10);
                t.cuotas.total = Math.max(2, Math.min(24, t.cuotas.total + delta));
                regenerateCuotasFor(t.id);
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const pagadoBtn = e.target.closest('[data-toggle-pagado]');
        if (pagadoBtn) {
            const t = getTx(state.openTxId);
            const idx = parseInt(pagadoBtn.getAttribute('data-toggle-pagado'), 10);
            if (t && t.porCobrar[idx]) {
                t.porCobrar[idx].pagado = !t.porCobrar[idx].pagado;
                if (allCobrado(t))
                    toast('¡Ya te pagaron todo!');
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const saveDraftBtn = e.target.closest('[data-save-draft]');
        if (saveDraftBtn && !saveDraftBtn.disabled) {
            saveDraftTx();
            return;
        }
        const cancelNewMedio = e.target.closest('[data-cancel-new-medio]');
        if (cancelNewMedio) {
            state.addingMedio = false;
            renderSheet();
            return;
        }
        const saveNewMedio = e.target.closest('[data-save-new-medio]');
        if (saveNewMedio && !saveNewMedio.disabled) {
            const nombre = state.newMedioDraft.nombre.trim();
            if (nombre && state.draftTx) {
                medioIdCounter++;
                const key = 'custom_' + medioIdCounter;
                const ultimos4 = state.newMedioDraft.ultimos4.trim();
                MEDIOS[key] = { nombre, corto: ultimos4 ? '•••• ' + ultimos4 : nombre, icon: 'card' };
                state.draftTx.medio = key;
                state.addingMedio = false;
                state.newMedioDraft = { nombre: '', ultimos4: '' };
                toast('Tarjeta agregada: ' + nombre);
                renderSheet();
            }
            return;
        }
        const editBudgetBtn = e.target.closest('[data-edit-budget]');
        if (editBudgetBtn) {
            const catId = editBudgetBtn.getAttribute('data-edit-budget');
            const cfg = PRESUPUESTOS[catId];
            state.editingBudgetCat = catId;
            state.budgetDraft = cfg
                ? { meta: String(cfg.meta), alertas: Object.assign({}, cfg.alertas) }
                : { meta: '', alertas: { 80: true, 90: true, 100: true } };
            renderPresupuestoView();
            return;
        }
        const cancelBudgetEdit = e.target.closest('[data-cancel-budget-edit]');
        if (cancelBudgetEdit) {
            state.editingBudgetCat = null;
            renderPresupuestoView();
            return;
        }
        const toggleAlert = e.target.closest('[data-toggle-alert]');
        if (toggleAlert) {
            const t = toggleAlert.getAttribute('data-toggle-alert');
            state.budgetDraft.alertas[t] = !state.budgetDraft.alertas[t];
            renderPresupuestoView();
            return;
        }
        const saveBudget = e.target.closest('[data-save-budget]');
        if (saveBudget) {
            const catId = saveBudget.getAttribute('data-save-budget');
            const meta = safeEvalExpr(state.budgetDraft.meta);
            if (meta !== null && meta > 0) {
                PRESUPUESTOS[catId] = { meta: Math.round(meta), alertas: Object.assign({}, state.budgetDraft.alertas) };
                state.editingBudgetCat = null;
                toast('Presupuesto guardado: ' + catInfo(catId).nombre);
                renderPresupuestoView();
            }
            else {
                toast('Pon una meta mensual válida');
            }
            return;
        }
        const deleteBudget = e.target.closest('[data-delete-budget]');
        if (deleteBudget) {
            const catId = deleteBudget.getAttribute('data-delete-budget');
            delete PRESUPUESTOS[catId];
            state.editingBudgetCat = null;
            toast('Presupuesto eliminado');
            renderPresupuestoView();
            return;
        }
        const budgetVerMas = e.target.closest('[data-budget-vermas]');
        if (budgetVerMas) {
            const catId = budgetVerMas.getAttribute('data-budget-vermas');
            state.categoryFilter = catId;
            state.categoryFilterMonth = MONTHS[state.monthIndex];
            state.filter = 'todas';
            state.tab = 'transacciones';
            render();
            return;
        }
        const editBudgetTotal = e.target.closest('[data-edit-budget-total]');
        if (editBudgetTotal) {
            state.editingBudgetTotal = true;
            state.budgetTotalDraft = String(presupuestoTotalMensual);
            renderPresupuestoView();
            return;
        }
        const cancelBudgetTotal = e.target.closest('[data-cancel-budget-total]');
        if (cancelBudgetTotal) {
            state.editingBudgetTotal = false;
            renderPresupuestoView();
            return;
        }
        const saveBudgetTotal = e.target.closest('[data-save-budget-total]');
        if (saveBudgetTotal) {
            const v = safeEvalExpr(state.budgetTotalDraft);
            if (v !== null && v > 0) {
                presupuestoTotalMensual = Math.round(v);
                state.editingBudgetTotal = false;
                toast('Presupuesto total actualizado');
                renderPresupuestoView();
            }
            else {
                toast('Pon un presupuesto total válido');
            }
            return;
        }
        const editMetasGasto = e.target.closest('[data-edit-metas-gasto]');
        if (editMetasGasto) {
            state.editingMetasGasto = true;
            state.metasGastoDraft = { fijo: String(METAS_GASTO_PCT.fijo), variable: String(METAS_GASTO_PCT.variable) };
            renderPresupuestoView();
            return;
        }
        const cancelMetasGasto = e.target.closest('[data-cancel-metas-gasto]');
        if (cancelMetasGasto) {
            state.editingMetasGasto = false;
            renderPresupuestoView();
            return;
        }
        const saveMetasGasto = e.target.closest('[data-save-metas-gasto]');
        if (saveMetasGasto) {
            const fijo = safeEvalExpr(state.metasGastoDraft.fijo);
            const variable = safeEvalExpr(state.metasGastoDraft.variable);
            if (fijo !== null && fijo >= 0 && variable !== null && variable >= 0) {
                METAS_GASTO_PCT.fijo = Math.round(fijo);
                METAS_GASTO_PCT.variable = Math.round(variable);
                state.editingMetasGasto = false;
                toast('Metas actualizadas');
                renderPresupuestoView();
            }
            else {
                toast('Pon valores válidos para Fijo y Variable');
            }
            return;
        }
        const editDatosTransferencia = e.target.closest('[data-edit-datos-transferencia]');
        if (editDatosTransferencia) {
            state.editingDatosTransferencia = true;
            state.datosTransferenciaDraft = Object.assign({}, DATOS_TRANSFERENCIA);
            renderMenuView();
            return;
        }
        const cancelDatosTransferencia = e.target.closest('[data-cancel-datos-transferencia]');
        if (cancelDatosTransferencia) {
            state.editingDatosTransferencia = false;
            renderMenuView();
            return;
        }
        const saveDatosTransferencia = e.target.closest('[data-save-datos-transferencia]');
        if (saveDatosTransferencia) {
            DATOS_TRANSFERENCIA = Object.assign({}, state.datosTransferenciaDraft);
            Object.keys(DATOS_TRANSFERENCIA).forEach(k => { DATOS_TRANSFERENCIA[k] = (DATOS_TRANSFERENCIA[k] || '').trim(); });
            state.editingDatosTransferencia = false;
            toast('Datos de transferencia guardados');
            renderMenuView();
            return;
        }
        const copyCobroBtn = e.target.closest('[data-copy-cobro]');
        if (copyCobroBtn) {
            const t = getTx(copyCobroBtn.getAttribute('data-copy-cobro'));
            const txt = t ? buildCobroWhatsAppText(t) : null;
            if (!txt) {
                toast('No hay cobros pendientes para copiar');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(function () {
                    toast(datosTransferenciaCompletos() ? 'Copiado — listo para pegar en WhatsApp' : 'Copiado — agrega tus datos de transferencia en Menú > Mi cuenta para incluirlos');
                }).catch(function () { toast('No se pudo copiar'); });
            }
            else {
                toast('No se pudo copiar');
            }
            return;
        }
        const evoMonthGroup = e.target.closest('[data-evo-month]');
        if (evoMonthGroup) {
            state.evoSelectedMonth = evoMonthGroup.getAttribute('data-evo-month');
            renderEvolucionView();
            return;
        }
        const editMetaBtn = e.target.closest('[data-edit-meta]');
        if (editMetaBtn) {
            const id = editMetaBtn.getAttribute('data-edit-meta');
            const meta = METAS_INVERSION.find(m => m.id === id);
            state.editingMetaId = id;
            state.metaDraft = meta
                ? { nombre: meta.nombre, montoObjetivo: String(meta.montoObjetivo), aporteMensualMeta: String(meta.aporteMensualMeta), plazo: meta.plazo || '', comision: meta.comision != null ? String(meta.comision) : '' }
                : { nombre: '', montoObjetivo: '', aporteMensualMeta: '', plazo: '', comision: '' };
            renderInversionesView();
            return;
        }
        const addMetaBtn = e.target.closest('[data-add-meta]');
        if (addMetaBtn) {
            state.editingMetaId = 'nueva';
            state.addMetaPlataformaId = addMetaBtn.getAttribute('data-add-meta');
            state.metaDraft = { nombre: '', montoObjetivo: '', aporteMensualMeta: '', plazo: '', comision: '' };
            renderInversionesView();
            return;
        }
        const cancelMetaEdit = e.target.closest('[data-cancel-meta-edit]');
        if (cancelMetaEdit) {
            state.editingMetaId = null;
            state.addMetaPlataformaId = null;
            renderInversionesView();
            return;
        }
        const saveMetaBtn = e.target.closest('[data-save-meta]');
        if (saveMetaBtn) {
            const id = saveMetaBtn.getAttribute('data-save-meta');
            const nombre = state.metaDraft.nombre.trim();
            const objetivo = safeEvalExpr(state.metaDraft.montoObjetivo);
            const aporte = safeEvalExpr(state.metaDraft.aporteMensualMeta);
            const comisionRaw = state.metaDraft.comision.trim();
            const comisionVal = comisionRaw === '' ? null : safeEvalExpr(comisionRaw);
            const comisionFinal = (comisionRaw !== '' && comisionVal !== null) ? comisionVal : null;
            if (nombre && objetivo !== null && objetivo > 0 && aporte !== null && aporte >= 0) {
                if (id === 'nueva') {
                    metaIdCounter++;
                    const newId = 'm' + metaIdCounter;
                    // Una meta nueva arranca su historial desde el mes actual — no se le inventan
                    // meses "incumplidos" hacia atrás, de antes de que existiera.
                    const mesActual = todayISO().slice(0, 7);
                    const historial = {};
                    historial[mesActual] = 0;
                    const checks = {};
                    checks[mesActual] = false;
                    METAS_INVERSION.push({ id: newId, nombre, montoObjetivo: Math.round(objetivo), aporteMensualMeta: Math.round(aporte), plataformaId: state.addMetaPlataformaId, plazo: state.metaDraft.plazo || null, comision: comisionFinal, aportadoNeto: 0, historial, checks });
                    toast('Meta creada: ' + nombre);
                }
                else {
                    const meta = METAS_INVERSION.find(m => m.id === id);
                    if (meta) {
                        meta.nombre = nombre;
                        meta.montoObjetivo = Math.round(objetivo);
                        meta.aporteMensualMeta = Math.round(aporte);
                        meta.plazo = state.metaDraft.plazo || null;
                        meta.comision = comisionFinal;
                    }
                    toast('Meta actualizada');
                }
                state.editingMetaId = null;
                state.addMetaPlataformaId = null;
                renderInversionesView();
            }
            else {
                toast('Completa nombre, objetivo y aporte meta válidos');
            }
            return;
        }
        const deleteMetaBtn = e.target.closest('[data-delete-meta]');
        if (deleteMetaBtn) {
            const id = deleteMetaBtn.getAttribute('data-delete-meta');
            METAS_INVERSION = METAS_INVERSION.filter(m => m.id !== id);
            state.editingMetaId = null;
            toast('Meta eliminada');
            renderInversionesView();
            return;
        }
        const toggleMetaCheck = e.target.closest('[data-toggle-meta-check]');
        if (toggleMetaCheck) {
            const id = toggleMetaCheck.getAttribute('data-toggle-meta-check');
            const mk = toggleMetaCheck.getAttribute('data-toggle-meta-month');
            const meta = METAS_INVERSION.find(m => m.id === id);
            if (meta) {
                meta.checks[mk] = !meta.checks[mk];
                renderInversionesView();
            }
            return;
        }
        const toggleMetaTotalCheck = e.target.closest('[data-toggle-meta-total-check]');
        if (toggleMetaTotalCheck) {
            const mk = toggleMetaTotalCheck.getAttribute('data-toggle-meta-total-check');
            METAS_TOTAL_CHECKS[mk] = !METAS_TOTAL_CHECKS[mk];
            renderInversionesView();
            return;
        }
        const togglePlatformBtn = e.target.closest('[data-toggle-platform]');
        if (togglePlatformBtn) {
            const id = togglePlatformBtn.getAttribute('data-toggle-platform');
            state.platformAbierta = (state.platformAbierta === id) ? null : id;
            renderInversionesView();
            return;
        }
        const editPlatformBtn = e.target.closest('[data-edit-platform]');
        if (editPlatformBtn) {
            const id = editPlatformBtn.getAttribute('data-edit-platform');
            state.editingPlatformId = id;
            state.confirmDeletePlatformId = null;
            state.confirmArchivePlatformId = null;
            state.platformDraft = {
                valor: String(platformValorActual(id)),
                tasaAnual: PLATAFORMA_DATA[id].tasaAnual != null ? String(PLATAFORMA_DATA[id].tasaAnual) : '',
                comision: PLATAFORMA_DATA[id].comision != null ? String(PLATAFORMA_DATA[id].comision) : '',
                plazo: PLATAFORMA_DATA[id].plazo || ''
            };
            renderInversionesView();
            return;
        }
        const cancelPlatformEdit = e.target.closest('[data-cancel-platform-edit]');
        if (cancelPlatformEdit) {
            state.editingPlatformId = null;
            state.confirmDeletePlatformId = null;
            state.confirmArchivePlatformId = null;
            renderInversionesView();
            return;
        }
        const savePlatformBtn = e.target.closest('[data-save-platform]');
        if (savePlatformBtn) {
            const id = savePlatformBtn.getAttribute('data-save-platform');
            const valor = safeEvalExpr(state.platformDraft.valor);
            const tasaRaw = state.platformDraft.tasaAnual.trim();
            const tasa = tasaRaw === '' ? null : safeEvalExpr(tasaRaw);
            const comisionRaw = state.platformDraft.comision.trim();
            const comisionVal = comisionRaw === '' ? null : safeEvalExpr(comisionRaw);
            if (valor !== null && valor >= 0) {
                const mesActual = todayISO().slice(0, 7);
                PLATAFORMA_DATA[id].valorHistorial[mesActual] = Math.round(valor);
                PLATAFORMA_DATA[id].fechaActualizacion = todayISO();
                PLATAFORMA_DATA[id].tasaAnual = (tasaRaw !== '' && tasa !== null) ? tasa : null;
                PLATAFORMA_DATA[id].comision = (comisionRaw !== '' && comisionVal !== null) ? comisionVal : null;
                PLATAFORMA_DATA[id].plazo = state.platformDraft.plazo || null;
                state.editingPlatformId = null;
                toast('Valor actualizado: ' + catInfo(id).nombre);
                renderInversionesView();
            }
            else {
                toast('Pon un valor válido');
            }
            return;
        }
        const deletePlatformBtn = e.target.closest('[data-delete-platform]');
        if (deletePlatformBtn) {
            const id = deletePlatformBtn.getAttribute('data-delete-platform');
            if (catEnUso(id)) {
                toast('No puedes eliminar una plataforma con transacciones');
                return;
            }
            if (metasForPlataforma(id).length > 0) {
                toast('Elimina primero sus metas');
                return;
            }
            state.confirmDeletePlatformId = id;
            renderInversionesView();
            return;
        }
        const cancelDeletePlatformBtn = e.target.closest('[data-cancel-delete-platform]');
        if (cancelDeletePlatformBtn) {
            state.confirmDeletePlatformId = null;
            renderInversionesView();
            return;
        }
        const confirmDeletePlatformBtn = e.target.closest('[data-confirm-delete-platform]');
        if (confirmDeletePlatformBtn) {
            const id = confirmDeletePlatformBtn.getAttribute('data-confirm-delete-platform');
            if (catEnUso(id)) {
                toast('No puedes eliminar una plataforma con transacciones');
                return;
            }
            if (metasForPlataforma(id).length > 0) {
                toast('Elimina primero sus metas');
                return;
            }
            const nombre = catInfo(id).nombre;
            delete CATS[id]; // esto también la saca de Menú > Categorías, que solo lista lo que hay en CATS
            delete PLATAFORMA_DATA[id];
            state.editingPlatformId = null;
            state.confirmDeletePlatformId = null;
            toast('Plataforma eliminada: ' + nombre);
            renderInversionesView();
            return;
        }
        const archivePlatformBtn = e.target.closest('[data-archive-platform]');
        if (archivePlatformBtn) {
            const id = archivePlatformBtn.getAttribute('data-archive-platform');
            if (metasForPlataforma(id).length > 0) {
                toast('Elimina primero sus metas');
                return;
            }
            state.confirmArchivePlatformId = id;
            renderInversionesView();
            return;
        }
        const cancelArchivePlatformBtn = e.target.closest('[data-cancel-archive-platform]');
        if (cancelArchivePlatformBtn) {
            state.confirmArchivePlatformId = null;
            renderInversionesView();
            return;
        }
        const confirmArchivePlatformBtn = e.target.closest('[data-confirm-archive-platform]');
        if (confirmArchivePlatformBtn) {
            const id = confirmArchivePlatformBtn.getAttribute('data-confirm-archive-platform');
            if (metasForPlataforma(id).length > 0) {
                toast('Elimina primero sus metas');
                return;
            }
            PLATAFORMA_DATA[id].archivada = true;
            state.editingPlatformId = null;
            state.confirmArchivePlatformId = null;
            toast('Plataforma cerrada: ' + catInfo(id).nombre);
            renderInversionesView();
            return;
        }
        const reopenPlatformBtn = e.target.closest('[data-reopen-platform]');
        if (reopenPlatformBtn) {
            const id = reopenPlatformBtn.getAttribute('data-reopen-platform');
            PLATAFORMA_DATA[id].archivada = false;
            toast('Plataforma reabierta: ' + catInfo(id).nombre);
            renderInversionesView();
            return;
        }
        const addPlatformBtn = e.target.closest('[data-add-platform]');
        if (addPlatformBtn) {
            state.creatingPlatform = true;
            state.newPlatformDraft = { nombre: '', icon: 'bank', color: 'butter', valor: '', plazo: '' };
            renderInversionesView();
            return;
        }
        const cancelNewPlatformBtn = e.target.closest('[data-cancel-newplatform]');
        if (cancelNewPlatformBtn) {
            state.creatingPlatform = false;
            renderInversionesView();
            return;
        }
        const newPlatformIconBtn = e.target.closest('[data-newplatform-icon]');
        if (newPlatformIconBtn) {
            state.newPlatformDraft.icon = newPlatformIconBtn.getAttribute('data-newplatform-icon');
            renderInversionesView();
            return;
        }
        const newPlatformColorBtn = e.target.closest('[data-newplatform-color]');
        if (newPlatformColorBtn) {
            state.newPlatformDraft.color = newPlatformColorBtn.getAttribute('data-newplatform-color');
            renderInversionesView();
            return;
        }
        const saveNewPlatformBtn = e.target.closest('[data-save-newplatform]');
        if (saveNewPlatformBtn) {
            const d = state.newPlatformDraft;
            if (!d.nombre.trim()) {
                toast('Ponle un nombre a la plataforma');
                return;
            }
            const valor = d.valor.trim() === '' ? 0 : safeEvalExpr(d.valor);
            if (valor === null || valor < 0) {
                toast('Pon un valor válido (o déjalo en 0)');
                return;
            }
            const id = 'plataforma_' + Date.now();
            CATS[id] = { nombre: d.nombre.trim(), tipo: 'inversion', color: d.color, icon: d.icon };
            // se rellenan todos los meses ya existentes con el mismo valor inicial (línea plana antes de
            // crearla) para no romper el gráfico compartido "Aportado vs. valor mes a mes", que solo
            // grafica los meses donde TODAS las plataformas tienen dato.
            const valorHistorial = {};
            MONTHS.forEach(m => { valorHistorial[m] = Math.round(valor); });
            PLATAFORMA_DATA[id] = { valorHistorial, fechaActualizacion: todayISO(), tasaAnual: null, comision: null, plazo: d.plazo || null };
            state.creatingPlatform = false;
            toast('Plataforma agregada: ' + d.nombre.trim());
            renderInversionesView();
            return;
        }
        const platformVerMas = e.target.closest('[data-platform-vermas]');
        if (platformVerMas) {
            const id = platformVerMas.getAttribute('data-platform-vermas');
            state.categoryFilter = id;
            state.categoryFilterMonth = null;
            state.filter = 'todas';
            state.tab = 'transacciones';
            render();
            return;
        }
        const lockBtn = e.target.closest('[data-toggle-lock]');
        if (lockBtn) {
            const t = getTx(lockBtn.getAttribute('data-toggle-lock'));
            if (t) {
                if (!t.reglaAuto) {
                    applyLockRule(t);
                    toast('Regla creada para ' + t.comercio);
                }
                else {
                    t.reglaAuto = false;
                }
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const actionBtn = e.target.closest('[data-action]');
        if (actionBtn) {
            const t = getTx(actionBtn.getAttribute('data-tx'));
            const act = actionBtn.getAttribute('data-action');
            if (t) {
                if (act === 'confirmar') {
                    if (t.categorias.length === 0) {
                        toast('Primero elige una categoría');
                    }
                    else {
                        t.estado = 'confirmado';
                        toast('Marcado como confirmado');
                    }
                }
                else if (act === 'porcobrar_persona') {
                    if (tienePorCobrarTipo(t, 'persona')) {
                        // ya estaba marcada — apretar de nuevo la deselecciona (quita solo las filas de
                        // este tipo; si no queda ninguna cobranza/reembolso pendiente, vuelve a confirmado).
                        t.porCobrar = t.porCobrar.filter(p => p.tipo !== 'persona');
                        if (t.porCobrar.length === 0) {
                            t.estado = t.categorias.length > 0 ? 'confirmado' : 'pendiente';
                            state.splitCobroMode[t.id] = false;
                        }
                        toast('Se quitó el cobro pendiente');
                    }
                    else {
                        t.estado = 'por_cobrar';
                        state.splitCobroMode[t.id] = true;
                        const already = t.porCobrar.reduce((s, p) => s + (p.monto || 0), 0);
                        const remaining = Math.max(t.monto - already, 0);
                        t.porCobrar.push({ persona: '', monto: Math.round(remaining / 2), pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null });
                        toast('Marcado como por cobrar');
                    }
                }
                else if (act === 'porcobrar_reembolso') {
                    if (tienePorCobrarTipo(t, 'reembolso')) {
                        t.porCobrar = t.porCobrar.filter(p => p.tipo !== 'reembolso');
                        if (t.porCobrar.length === 0) {
                            t.estado = t.categorias.length > 0 ? 'confirmado' : 'pendiente';
                            state.splitCobroMode[t.id] = false;
                        }
                        toast('Se quitó el reembolso pendiente');
                    }
                    else {
                        t.estado = 'por_cobrar';
                        state.splitCobroMode[t.id] = true;
                        t.porCobrar.push({ persona: '', monto: null, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null });
                        toast('Marcado como reembolso pendiente');
                    }
                }
                else if (act === 'noesgasto') {
                    if (t.estado === 'no_es_gasto') {
                        t.estado = t.categorias.length > 0 ? 'confirmado' : 'pendiente';
                        toast('Ya no está marcado como "no es gasto"');
                    }
                    else {
                        t.estado = 'no_es_gasto';
                        toast('Marcado como no es gasto');
                    }
                }
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const toggleCatSplit = e.target.closest('[data-toggle-catsplit]');
        if (toggleCatSplit) {
            const id = toggleCatSplit.getAttribute('data-toggle-catsplit');
            state.splitCatMode[id] = true;
            renderSheet();
            return;
        }
        const catUnitBtn = e.target.closest('[data-catunit]');
        if (catUnitBtn) {
            state.splitCatUnit[state.openTxId] = catUnitBtn.getAttribute('data-catunit');
            renderSheet();
            return;
        }
        const addCatRow = e.target.closest('[data-add-catrow]');
        if (addCatRow) {
            const t = getTx(addCatRow.getAttribute('data-add-catrow'));
            if (t) {
                const usedCats = t.categorias.map(c => c.cat);
                const pool = Object.keys(CATS).filter(k => CATS[k].tipo === t.tipo && !usedCats.includes(k));
                const nextCat = pool[0] || Object.keys(CATS).find(k => CATS[k].tipo === t.tipo);
                t.categorias.push({ cat: nextCat, monto: 0 });
                renderSheet();
            }
            return;
        }
        const rmCatRow = e.target.closest('[data-cat-remove]');
        if (rmCatRow) {
            const t = getTx(state.openTxId);
            const idx = parseInt(rmCatRow.getAttribute('data-cat-remove'), 10);
            if (t && t.categorias.length > 1) {
                const removedMonto = t.categorias[idx].monto;
                t.categorias.splice(idx, 1);
                t.categorias[0].monto += removedMonto;
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const toggleCobroSplit = e.target.closest('[data-toggle-cobrosplit]');
        if (toggleCobroSplit) {
            state.splitCobroMode[toggleCobroSplit.getAttribute('data-toggle-cobrosplit')] = true;
            renderSheet();
            return;
        }
        const cobroUnitBtn = e.target.closest('[data-cobrounit]');
        if (cobroUnitBtn) {
            state.splitCobroUnit[state.openTxId] = cobroUnitBtn.getAttribute('data-cobrounit');
            renderSheet();
            return;
        }
        const addContact = e.target.closest('[data-add-contact]');
        if (addContact) {
            const t = getTx(state.openTxId);
            if (t) {
                const name = addContact.getAttribute('data-add-contact');
                const already = t.porCobrar.reduce((s, p) => s + (p.monto || 0), 0);
                const remaining = Math.max(t.monto - already, 0);
                const share = t.porCobrar.length === 0 ? Math.round(remaining / 2) : Math.round(remaining / 2);
                t.porCobrar.push({ persona: name, monto: share, pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null });
                if (t.estado !== 'por_cobrar') {
                    t.estado = 'por_cobrar';
                }
                state.splitCobroMode[t.id] = true;
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const addCobroRow = e.target.closest('[data-add-cobrorow]');
        if (addCobroRow) {
            const t = getTx(addCobroRow.getAttribute('data-add-cobrorow'));
            if (t) {
                const already = t.porCobrar.reduce((s, p) => s + (p.monto || 0), 0);
                const remaining = Math.max(t.monto - already, 0);
                t.porCobrar.push({ persona: '', monto: Math.round(remaining / 2), pagado: false, tipo: 'persona', montoRecibido: null, linkedTxId: null });
                renderSheet();
            }
            return;
        }
        const addReembolsoRow = e.target.closest('[data-add-reembolsorow]');
        if (addReembolsoRow) {
            const t = getTx(addReembolsoRow.getAttribute('data-add-reembolsorow'));
            if (t) {
                t.porCobrar.push({ persona: '', monto: null, pagado: false, tipo: 'reembolso', montoRecibido: null, linkedTxId: null });
                if (t.estado !== 'por_cobrar') {
                    t.estado = 'por_cobrar';
                }
                state.splitCobroMode[t.id] = true;
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const linkPendienteBtn = e.target.closest('[data-link-pendiente]');
        if (linkPendienteBtn) {
            const idx = parseInt(linkPendienteBtn.getAttribute('data-link-pendiente'), 10);
            openLinkFromPendiente(state.openTxId, idx);
            return;
        }
        const darPorPerdidaBtn = e.target.closest('[data-dar-por-perdida]');
        if (darPorPerdidaBtn) {
            const idx = parseInt(darPorPerdidaBtn.getAttribute('data-dar-por-perdida'), 10);
            if (darPorPerdida(state.openTxId, idx)) {
                toast('Registrada como gasto de este mes');
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const openLinkIngresoBtn = e.target.closest('[data-open-link-ingreso]');
        if (openLinkIngresoBtn) {
            openLinkFromIngreso(openLinkIngresoBtn.getAttribute('data-open-link-ingreso'));
            return;
        }
        const unlinkPendienteBtn = e.target.closest('[data-unlink-ingreso]');
        if (unlinkPendienteBtn) {
            const ingresoId = unlinkPendienteBtn.getAttribute('data-unlink-ingreso');
            const found = pendienteVinculadaA(ingresoId);
            if (found) {
                const gastoTx = getTx(found.gastoTxId);
                const p = gastoTx.porCobrar[found.idx];
                p.pagado = false;
                p.montoRecibido = null;
                p.linkedTxId = null;
                toast('Vínculo eliminado');
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const pickIngresoBtn = e.target.closest('[data-pick-ingreso]');
        if (pickIngresoBtn && state.linkFlow && state.linkFlow.mode === 'fromPendiente') {
            const ingresoId = pickIngresoBtn.getAttribute('data-pick-ingreso');
            const { gastoTxId, idx } = state.linkFlow;
            if (resolvePendiente(gastoTxId, idx, ingresoId)) {
                state.linkFlow = null;
                toast('Depósito vinculado');
                openSheet(gastoTxId);
                renderIfListVisible();
            }
            return;
        }
        const pickPendienteBtn = e.target.closest('[data-pick-pendiente]');
        if (pickPendienteBtn && state.linkFlow && state.linkFlow.mode === 'fromIngreso') {
            const [gastoTxId, idxStr] = pickPendienteBtn.getAttribute('data-pick-pendiente').split('|');
            const idx = parseInt(idxStr, 10);
            const ingresoTxId = state.linkFlow.ingresoTxId;
            if (resolvePendiente(gastoTxId, idx, ingresoTxId)) {
                state.linkFlow = null;
                toast('Pendiente vinculado');
                openSheet(ingresoTxId);
                renderIfListVisible();
            }
            return;
        }
        const rmCobroRow = e.target.closest('[data-cobro-remove]');
        if (rmCobroRow) {
            const t = getTx(state.openTxId);
            const idx = parseInt(rmCobroRow.getAttribute('data-cobro-remove'), 10);
            if (t) {
                t.porCobrar.splice(idx, 1);
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        /* ---------- Dividir boleta con amigos (simulado) ---------- */
        const openBoletaBtn = e.target.closest('[data-open-boleta]');
        if (openBoletaBtn) {
            openBoletaFlow(openBoletaBtn.getAttribute('data-open-boleta'));
            return;
        }
        const boletaCaptureBtn = e.target.closest('[data-boleta-capture]');
        if (boletaCaptureBtn && state.boleta) {
            state.boleta.step = 'procesando';
            renderSheet();
            setTimeout(function () {
                if (!state.boleta || state.boleta.step !== 'procesando')
                    return; // el sheet pudo cerrarse mientras "procesaba"
                // el nombre del comercio ya lo sabemos (es el de la transacción real) — de la "foto" solo tomamos los items
                const ejemplo = BOLETA_EJEMPLOS[Math.floor(Math.random() * BOLETA_EJEMPLOS.length)];
                state.boleta.items = ejemplo.items.map(function (it) { return { id: ++boletaItemIdCounter, nombre: it.nombre, monto: it.monto }; });
                state.boleta.step = 'items';
                renderSheet();
            }, 900);
            return;
        }
        const boletaItemRemoveBtn = e.target.closest('[data-boleta-item-remove]');
        if (boletaItemRemoveBtn && state.boleta) {
            const idx = parseInt(boletaItemRemoveBtn.getAttribute('data-boleta-item-remove'), 10);
            state.boleta.items.splice(idx, 1);
            renderSheet();
            return;
        }
        const boletaAddItemBtn = e.target.closest('[data-boleta-add-item]');
        if (boletaAddItemBtn && state.boleta) {
            state.boleta.items.push({ id: ++boletaItemIdCounter, nombre: '', monto: 0 });
            renderSheet();
            return;
        }
        const boletaGotoBtn = e.target.closest('[data-boleta-goto]');
        if (boletaGotoBtn && state.boleta) {
            state.boleta.step = boletaGotoBtn.getAttribute('data-boleta-goto');
            renderSheet();
            return;
        }
        const boletaTogglePersonBtn = e.target.closest('[data-boleta-toggle-person]');
        if (boletaTogglePersonBtn && state.boleta) {
            const [itemIdStr, persona] = boletaTogglePersonBtn.getAttribute('data-boleta-toggle-person').split('|');
            const itemId = parseInt(itemIdStr, 10);
            const asign = state.boleta.asign;
            const list = asign[itemId] || (asign[itemId] = []);
            const pos = list.indexOf(persona);
            if (pos === -1)
                list.push(persona);
            else
                list.splice(pos, 1);
            renderSheet();
            return;
        }
        const boletaGuardarBtn = e.target.closest('[data-boleta-guardar]');
        if (boletaGuardarBtn && state.boleta) {
            guardarBoleta();
            return;
        }
        const boletaPropinaUnitBtn = e.target.closest('[data-boleta-propina-unit]');
        if (boletaPropinaUnitBtn && state.boleta) {
            state.boleta.propinaUnit = boletaPropinaUnitBtn.getAttribute('data-boleta-propina-unit');
            state.boleta.propinaValor = ''; // cambiar de % a $ (o viceversa) parte de cero para no confundir unidades
            renderSheet();
            return;
        }
        const boletaPropinaQuickBtn = e.target.closest('[data-boleta-propina-quick]');
        if (boletaPropinaQuickBtn && state.boleta) {
            state.boleta.propinaUnit = '%';
            state.boleta.propinaValor = boletaPropinaQuickBtn.getAttribute('data-boleta-propina-quick');
            renderSheet();
            return;
        }
        /* ---------- Menú (Fase 4) ---------- */
        const menuOpenBtn = e.target.closest('[data-menu-open]');
        if (menuOpenBtn) {
            state.menuSection = menuOpenBtn.getAttribute('data-menu-open');
            if (state.menuSection === 'importarcorreo' && !state.importCorreoLoaded) {
                state.importCorreoLoading = true;
                renderMenuView();
                loadImportCorreoScreen();
                return;
            }
            if (state.menuSection === 'reconciliar' && !state.reconciliar.movimientos.length) {
                cargarCartolasDisponibles();
            }
            if (state.menuSection === 'notificaciones' && !state.notifLoaded) {
                loadNotifStatus();
                return;
            }
            renderMenuView();
            return;
        }
        const notifToggleBtn = e.target.closest('[data-notif-toggle]');
        if (notifToggleBtn) {
            if (state.notifSubscribed)
                desactivarNotificaciones();
            else
                activarNotificaciones();
            return;
        }
        const notifTestBtn = e.target.closest('[data-notif-test]');
        if (notifTestBtn) {
            enviarPushPrueba();
            return;
        }
        const menuBackBtn = e.target.closest('[data-menu-back]');
        if (menuBackBtn) {
            state.menuSection = null;
            state.editingCatId = null;
            state.editingMedioId = null;
            renderMenuView();
            return;
        }
        const addCatBtn = e.target.closest('[data-add-cat]');
        if (addCatBtn) {
            state.editingCatId = 'nueva';
            state.catDraft = { nombre: '', tipo: 'gasto', color: 'sage', icon: '🏷️' };
            renderMenuView();
            return;
        }
        const editCatBtn = e.target.closest('[data-edit-cat]');
        if (editCatBtn) {
            const id = editCatBtn.getAttribute('data-edit-cat');
            const c = CATS[id];
            state.editingCatId = id;
            state.catDraft = { nombre: c.nombre, tipo: c.tipo, color: c.color, icon: c.icon };
            renderMenuView();
            return;
        }
        const cancelCatEditBtn = e.target.closest('[data-cancel-cat-edit]');
        if (cancelCatEditBtn) {
            state.editingCatId = null;
            renderMenuView();
            return;
        }
        const catDraftIconBtn = e.target.closest('[data-cat-draft-icon]');
        if (catDraftIconBtn) {
            state.catDraft.icon = catDraftIconBtn.getAttribute('data-cat-draft-icon');
            renderMenuView();
            return;
        }
        const catDraftColorBtn = e.target.closest('[data-cat-draft-color]');
        if (catDraftColorBtn) {
            state.catDraft.color = catDraftColorBtn.getAttribute('data-cat-draft-color');
            renderMenuView();
            return;
        }
        const saveCatBtn = e.target.closest('[data-save-cat]');
        if (saveCatBtn) {
            const idAttr = saveCatBtn.getAttribute('data-save-cat');
            const d = state.catDraft;
            if (!d.nombre.trim()) {
                toast('Ponle un nombre a la categoría');
                return;
            }
            if (idAttr === 'nueva') {
                CATS['cat_' + Date.now()] = { nombre: d.nombre.trim(), tipo: d.tipo, color: d.color, icon: d.icon };
                toast('Categoría creada');
            }
            else {
                CATS[idAttr].nombre = d.nombre.trim();
                CATS[idAttr].color = d.color;
                CATS[idAttr].icon = d.icon;
                toast('Categoría actualizada');
            }
            state.editingCatId = null;
            renderMenuView();
            return;
        }
        const deleteCatBtn = e.target.closest('[data-delete-cat]');
        if (deleteCatBtn) {
            const id = deleteCatBtn.getAttribute('data-delete-cat');
            if (catEnUso(id)) {
                toast('No puedes eliminar una categoría con transacciones');
                return;
            }
            delete CATS[id];
            delete PRESUPUESTOS[id];
            state.editingCatId = null;
            toast('Categoría eliminada');
            renderMenuView();
            return;
        }
        const addMedioBtn = e.target.closest('[data-add-medio]');
        if (addMedioBtn) {
            state.editingMedioId = 'nueva';
            state.medioDraft = { nombre: '', corto: '', icon: 'card' };
            renderMenuView();
            return;
        }
        const editMedioBtn = e.target.closest('[data-edit-medio]');
        if (editMedioBtn) {
            const id = editMedioBtn.getAttribute('data-edit-medio');
            const m = MEDIOS[id];
            state.editingMedioId = id;
            state.medioDraft = { nombre: m.nombre, corto: m.corto, icon: m.icon };
            renderMenuView();
            return;
        }
        const cancelMedioEditBtn = e.target.closest('[data-cancel-medio-edit]');
        if (cancelMedioEditBtn) {
            state.editingMedioId = null;
            renderMenuView();
            return;
        }
        const medioDraftIconBtn = e.target.closest('[data-medio-draft-icon]');
        if (medioDraftIconBtn) {
            state.medioDraft.icon = medioDraftIconBtn.getAttribute('data-medio-draft-icon');
            renderMenuView();
            return;
        }
        const saveMedioBtn = e.target.closest('[data-save-medio]');
        if (saveMedioBtn) {
            const idAttr = saveMedioBtn.getAttribute('data-save-medio');
            const d = state.medioDraft;
            if (!d.nombre.trim()) {
                toast('Ponle un nombre al medio de pago');
                return;
            }
            if (idAttr === 'nueva') {
                MEDIOS['medio_' + Date.now()] = { nombre: d.nombre.trim(), corto: d.corto.trim(), icon: d.icon };
                toast('Medio de pago creado');
            }
            else {
                MEDIOS[idAttr].nombre = d.nombre.trim();
                MEDIOS[idAttr].corto = d.corto.trim();
                MEDIOS[idAttr].icon = d.icon;
                toast('Medio de pago actualizado');
            }
            state.editingMedioId = null;
            renderMenuView();
            return;
        }
        const deleteMedioBtn = e.target.closest('[data-delete-medio]');
        if (deleteMedioBtn) {
            const id = deleteMedioBtn.getAttribute('data-delete-medio');
            if (medioEnUso(id)) {
                toast('No puedes eliminar un medio de pago con transacciones');
                return;
            }
            delete MEDIOS[id];
            state.editingMedioId = null;
            toast('Medio de pago eliminado');
            renderMenuView();
            return;
        }
        const deleteReglaBtn = e.target.closest('[data-delete-regla]');
        if (deleteReglaBtn) {
            const comercio = decodeURIComponent(deleteReglaBtn.getAttribute('data-delete-regla'));
            TX.forEach(t => { if (t.comercio === comercio)
                t.reglaAuto = false; });
            toast('Regla eliminada para ' + comercio);
            renderMenuView();
            return;
        }
        const exportCsvBtn = e.target.closest('[data-export-csv]');
        if (exportCsvBtn) {
            downloadFile('pitucas-sin-lucas-transacciones-' + todayISO() + '.csv', buildTransaccionesCSV(), 'text/csv;charset=utf-8;');
            toast('CSV descargado');
            return;
        }
        const exportJsonBtn = e.target.closest('[data-export-json]');
        if (exportJsonBtn) {
            downloadFile('pitucas-sin-lucas-respaldo-' + todayISO() + '.json', buildBackupJSON(), 'application/json;charset=utf-8;');
            toast('Respaldo JSON descargado');
            return;
        }
        const importAgainBtn = e.target.closest('[data-import-again]');
        if (importAgainBtn) {
            state.importSummary = null;
            renderMenuView();
            return;
        }
        const reconciliarReset = e.target.closest('[data-reconciliar-reset]');
        if (reconciliarReset) {
            state.reconciliar = { archivo: null, cargando: false, error: null, tipo: null, movimientos: [], pagosTarjeta: null,
                disponibles: state.reconciliar.disponibles, usandoId: null, passwordDraft: '', errorPassword: null,
                archivoBuffer: null, archivoNombrePendiente: null };
            renderMenuView();
            return;
        }
        const reconciliarArchivoAbrir = e.target.closest('[data-reconciliar-archivo-abrir]');
        if (reconciliarArchivoAbrir) {
            intentarAbrirArchivoCartola(state.reconciliar.archivoBuffer, state.reconciliar.archivoNombrePendiente, state.reconciliar.passwordDraft);
            return;
        }
        const reconciliarArchivoCancelar = e.target.closest('[data-reconciliar-archivo-cancelar]');
        if (reconciliarArchivoCancelar) {
            state.reconciliar.archivoBuffer = null;
            state.reconciliar.archivoNombrePendiente = null;
            state.reconciliar.errorPassword = null;
            state.reconciliar.passwordDraft = '';
            renderMenuView();
            return;
        }
        const cartolaUsar = e.target.closest('[data-cartola-usar]');
        if (cartolaUsar) {
            state.reconciliar.usandoId = cartolaUsar.getAttribute('data-cartola-usar');
            state.reconciliar.passwordDraft = '';
            state.reconciliar.errorPassword = null;
            renderMenuView();
            return;
        }
        const cartolaCancelar = e.target.closest('[data-cartola-cancelar]');
        if (cartolaCancelar) {
            state.reconciliar.usandoId = null;
            state.reconciliar.errorPassword = null;
            renderMenuView();
            return;
        }
        const cartolaAbrir = e.target.closest('[data-cartola-abrir]');
        if (cartolaAbrir) {
            usarCartolaImportada(cartolaAbrir.getAttribute('data-cartola-abrir'), state.reconciliar.passwordDraft);
            return;
        }
        const reconciliarAgregar = e.target.closest('[data-reconciliar-agregar]');
        if (reconciliarAgregar) {
            const idx = parseInt(reconciliarAgregar.getAttribute('data-reconciliar-agregar'), 10);
            const normales = state.reconciliar.movimientos.filter(function (m) { return m.esEspecial !== 'pago_tarjeta' && m.esEspecial !== 'pago_recibido'; });
            const m = normales[idx];
            if (m && !m.__match) {
                crearTxDesdeMovimiento(m);
                m.__match = buscarTxParecida(m); // ahora sí calza (con la que se acaba de crear)
                renderMenuView();
                renderIfListVisible();
                toast('Transacción agregada');
            }
            return;
        }
        const reconciliarNoEsGasto = e.target.closest('[data-reconciliar-noesgasto]');
        if (reconciliarNoEsGasto) {
            const idx = parseInt(reconciliarNoEsGasto.getAttribute('data-reconciliar-noesgasto'), 10);
            const normales = state.reconciliar.movimientos.filter(function (m) { return m.esEspecial !== 'pago_tarjeta' && m.esEspecial !== 'pago_recibido'; });
            const m = normales[idx];
            if (m && !m.__match) {
                crearTxDesdeMovimiento(m, { noEsGasto: true });
                m.__match = buscarTxParecida(m);
                renderMenuView();
                renderIfListVisible();
                toast('Agregada como "no es gasto"');
            }
            return;
        }
        const reconciliarAgregarTodo = e.target.closest('[data-reconciliar-agregar-todo]');
        if (reconciliarAgregarTodo) {
            const normales = state.reconciliar.movimientos.filter(function (m) { return m.esEspecial !== 'pago_tarjeta' && m.esEspecial !== 'pago_recibido'; });
            let n = 0;
            normales.forEach(function (m) {
                if (!m.__match) {
                    crearTxDesdeMovimiento(m);
                    m.__match = buscarTxParecida(m);
                    n++;
                }
            });
            renderMenuView();
            renderIfListVisible();
            toast(n === 1 ? 'Se agregó 1 transacción' : 'Se agregaron ' + n + ' transacciones');
            return;
        }
        const gotoPendientesBtn = e.target.closest('[data-goto-pendientes]');
        if (gotoPendientesBtn) {
            state.filter = 'pendientes';
            state.tab = 'transacciones';
            render();
            return;
        }
        const toggleDemoBtn = e.target.closest('[data-toggle-demo]');
        if (toggleDemoBtn) {
            state.demoMode = !state.demoMode;
            render();
            toast(state.demoMode ? 'Modo demo activado' : 'Modo demo desactivado');
            return;
        }
    });
    phone.addEventListener('change', function (e) {
        const sel = e.target.closest('[data-cat-select]');
        if (sel) {
            const t = getTx(state.openTxId);
            const idx = parseInt(sel.getAttribute('data-cat-select'), 10);
            if (t) {
                if (sel.value === '') {
                    // "Sin categoría": si es la única fila, la transacción queda sin clasificar (vuelve
                    // a mostrarse la fila vacía); si hay más filas, se quita esta y su monto se suma a
                    // la primera que quede — mismo criterio que el botón de borrar fila.
                    if (t.categorias[idx]) {
                        const removedMonto = t.categorias[idx].monto;
                        t.categorias.splice(idx, 1);
                        if (t.categorias[0])
                            t.categorias[0].monto += removedMonto;
                    }
                }
                else if (t.categorias[idx]) {
                    t.categorias[idx].cat = sel.value;
                }
                else {
                    t.categorias[idx] = { cat: sel.value, monto: t.monto };
                }
                renderSheet();
                renderIfListVisible();
            }
            return;
        }
        const draftCatSelect = e.target.closest('[data-draft-cat-select]');
        if (draftCatSelect && state.draftTx) {
            const val = draftCatSelect.value;
            state.draftTx.categorias = val ? [{ cat: val, monto: state.draftTx.monto }] : [];
            renderSheet();
            return;
        }
        const draftMedio = e.target.closest('[data-draft-field="medio"]');
        if (draftMedio && state.draftTx) {
            if (draftMedio.value === '__nuevo_medio__') {
                state.addingMedio = true;
                state.newMedioDraft = { nombre: '', ultimos4: '' };
                renderSheet();
                setTimeout(() => { const el = document.querySelector('[data-new-medio-field="nombre"]'); if (el)
                    el.focus(); }, 50);
                return;
            }
            state.draftTx.medio = draftMedio.value;
            return;
        }
        const txMedioSelect = e.target.closest('[data-tx-medio-select]');
        if (txMedioSelect) {
            const t = getTx(txMedioSelect.getAttribute('data-tx-medio-select'));
            if (t) {
                t.medio = txMedioSelect.value;
                renderIfListVisible();
            }
            return;
        }
        const filterDate = e.target.closest('[data-filter-date]');
        if (filterDate) {
            const which = filterDate.getAttribute('data-filter-date');
            if (which === 'from')
                state.advFilters.dateFrom = filterDate.value;
            else
                state.advFilters.dateTo = filterDate.value;
            return;
        }
        const csvFileInput = e.target.closest('[data-csv-file-input]');
        if (csvFileInput) {
            const file = csvFileInput.files && csvFileInput.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (ev) {
                    const { rows, errors } = parseCartolaCSV(String(ev.target.result || ''));
                    const result = importCartolaRows(rows);
                    state.importSummary = { archivo: file.name, errores: errors, creadas: result.creadas, conRegla: result.conRegla, pendientes: result.pendientes };
                    renderMenuView();
                    renderIfListVisible();
                    toast(result.creadas + ' transacciones importadas');
                };
                reader.readAsText(file, 'UTF-8');
            }
            return;
        }
        const reconciliarFileInput = e.target.closest('[data-reconciliar-file-input]');
        if (reconciliarFileInput) {
            const file = reconciliarFileInput.files && reconciliarFileInput.files[0];
            if (file) {
                state.reconciliar.passwordDraft = '';
                const reader = new FileReader();
                reader.onload = function (ev) {
                    intentarAbrirArchivoCartola(ev.target.result, file.name, '');
                };
                state.reconciliar.cargando = true;
                state.reconciliar.error = null;
                renderMenuView();
                reader.readAsArrayBuffer(file);
            }
            return;
        }
    });
    phone.addEventListener('input', function (e) {
        const searchInput = e.target.closest('#tx-search-input');
        if (searchInput) {
            state.searchQuery = searchInput.value;
            const clearBtn = document.getElementById('tx-search-clear');
            if (clearBtn)
                clearBtn.hidden = !state.searchQuery;
            renderTxResultsOnly();
            return;
        }
        const amtInput = e.target.closest('[data-cat-amount]');
        if (amtInput) {
            const t = getTx(state.openTxId);
            const idx = parseInt(amtInput.getAttribute('data-cat-amount'), 10);
            if (t && t.categorias[idx]) {
                const unit = state.splitCatUnit[t.id] || '$';
                const v = safeEvalExpr(amtInput.value);
                if (v !== null) {
                    t.categorias[idx].monto = unit === '%' ? Math.round(t.monto * v / 100) : Math.round(v);
                    const catRowsWrap = amtInput.closest('.cat-rows');
                    const remainingEl = catRowsWrap ? catRowsWrap.querySelector('.split-remaining span:last-child') : null;
                    if (remainingEl) {
                        const sum = t.categorias.reduce((s, c) => s + c.monto, 0);
                        const diff = t.monto - sum;
                        remainingEl.textContent = money(diff);
                        remainingEl.className = (Math.abs(diff) < 1 ? 'ok' : 'bad') + ' tabular';
                    }
                }
            }
            return;
        }
        const cobroAmt = e.target.closest('[data-cobro-amount]');
        if (cobroAmt) {
            const t = getTx(state.openTxId);
            const idx = parseInt(cobroAmt.getAttribute('data-cobro-amount'), 10);
            if (t) {
                const unit = state.splitCobroUnit[t.id] || '$';
                const v = safeEvalExpr(cobroAmt.value);
                if (v !== null) {
                    t.porCobrar[idx].monto = unit === '%' ? Math.round(t.monto * v / 100) : Math.round(v);
                    const remainingEl = cobroAmt.closest('.split-block').querySelector('.split-remaining span:last-child');
                    if (remainingEl) {
                        const totalCobro = porCobrarTotal(t);
                        const tuParte = t.monto - totalCobro;
                        remainingEl.textContent = money(tuParte);
                        remainingEl.className = (tuParte < 0 ? 'bad' : 'ok') + ' tabular';
                    }
                }
            }
            return;
        }
        const cobroName = e.target.closest('[data-cobro-name]');
        if (cobroName) {
            const t = getTx(state.openTxId);
            const idx = parseInt(cobroName.getAttribute('data-cobro-name'), 10);
            if (t) {
                t.porCobrar[idx].persona = cobroName.value;
            }
            return;
        }
        const boletaItemNombre = e.target.closest('[data-boleta-item-nombre]');
        if (boletaItemNombre && state.boleta) {
            const idx = parseInt(boletaItemNombre.getAttribute('data-boleta-item-nombre'), 10);
            state.boleta.items[idx].nombre = boletaItemNombre.value;
            return;
        }
        const boletaItemMonto = e.target.closest('[data-boleta-item-monto]');
        if (boletaItemMonto && state.boleta) {
            const idx = parseInt(boletaItemMonto.getAttribute('data-boleta-item-monto'), 10);
            const v = safeEvalExpr(boletaItemMonto.value);
            if (v !== null) {
                state.boleta.items[idx].monto = Math.round(v);
                const summaryEl = document.getElementById('boleta-totals-summary');
                if (summaryEl)
                    summaryEl.innerHTML = renderBoletaItemsTotalsSummary();
                const continueBtn = document.querySelector('[data-boleta-goto="asignar"]');
                if (continueBtn)
                    continueBtn.disabled = !(state.boleta.items.length > 0 && boletaTotal() > 0);
            }
            return;
        }
        const boletaPropinaInput = e.target.closest('[data-boleta-propina-input]');
        if (boletaPropinaInput && state.boleta) {
            state.boleta.propinaValor = boletaPropinaInput.value;
            const summaryEl = document.getElementById('boleta-totals-summary');
            if (summaryEl)
                summaryEl.innerHTML = renderBoletaItemsTotalsSummary();
            return;
        }
        // Editar Monto/Fecha/Hora de una transacción ya existente, desde el detalle — se actualiza
        // el dato de una y se refresca a mano el eco formateado y el encabezado (sin renderSheet()
        // completo, para no perder el foco del campo mientras se sigue escribiendo/eligiendo).
        const txFieldMonto = e.target.closest('[data-tx-field="monto"]');
        if (txFieldMonto) {
            const tx = getTx(txFieldMonto.getAttribute('data-tx'));
            if (tx) {
                tx.monto = parseInt(txFieldMonto.value.replace(/\D/g, ''), 10) || 0;
                const echoEl = txFieldMonto.closest('.edit-amount-row').querySelector('.edit-amount-echo');
                const txt = (tx.tipo === 'ingreso' ? '+' : '') + money(tx.monto);
                if (echoEl)
                    echoEl.textContent = txt;
                const headEl = document.querySelector('.sheet-amount');
                if (headEl)
                    headEl.textContent = txt;
            }
            return;
        }
        const txFieldFecha = e.target.closest('[data-tx-field="fecha"]');
        if (txFieldFecha && txFieldFecha.value) {
            const tx = getTx(txFieldFecha.getAttribute('data-tx'));
            if (tx) {
                tx.fecha = txFieldFecha.value;
                ensureMonthExists(tx.fecha.slice(0, 7));
                const hintEl = document.querySelector('.edit-day-hint');
                if (hintEl)
                    hintEl.textContent = dayLabel(tx.fecha);
                const metaEl = document.querySelector('.sheet-top .meta');
                if (metaEl)
                    metaEl.textContent = dayLabel(tx.fecha) + ' · ' + tx.hora + ' · ' + medioInfo(tx.medio).nombre;
            }
            return;
        }
        const txFieldHora = e.target.closest('[data-tx-field="hora"]');
        if (txFieldHora && txFieldHora.value) {
            const tx = getTx(txFieldHora.getAttribute('data-tx'));
            if (tx) {
                tx.hora = txFieldHora.value;
                const metaEl = document.querySelector('.sheet-top .meta');
                if (metaEl)
                    metaEl.textContent = dayLabel(tx.fecha) + ' · ' + tx.hora + ' · ' + medioInfo(tx.medio).nombre;
            }
            return;
        }
        const txFieldNota = e.target.closest('[data-tx-field="nota"]');
        if (txFieldNota) {
            const tx = getTx(txFieldNota.getAttribute('data-tx'));
            if (tx) {
                tx.nota = txFieldNota.value;
                const notaEl = document.querySelector('.sheet-top [data-nota-echo]');
                if (notaEl) {
                    notaEl.textContent = tx.nota;
                    notaEl.style.display = tx.nota ? '' : 'none';
                }
            }
            return;
        }
        const newMedioField = e.target.closest('[data-new-medio-field]');
        if (newMedioField) {
            const field = newMedioField.getAttribute('data-new-medio-field');
            if (field === 'nombre')
                state.newMedioDraft.nombre = newMedioField.value;
            else if (field === 'ultimos4')
                state.newMedioDraft.ultimos4 = newMedioField.value.replace(/\D/g, '').slice(0, 4);
            const saveNewBtn = document.querySelector('[data-save-new-medio]');
            if (saveNewBtn)
                saveNewBtn.disabled = !state.newMedioDraft.nombre.trim();
            return;
        }
        const budgetMetaInput = e.target.closest('[data-budget-meta-input]');
        if (budgetMetaInput) {
            state.budgetDraft.meta = budgetMetaInput.value;
            return;
        }
        const budgetTotalInput = e.target.closest('[data-budget-total-input]');
        if (budgetTotalInput) {
            state.budgetTotalDraft = budgetTotalInput.value;
            return;
        }
        const metasGastoInput = e.target.closest('[data-metas-gasto-input]');
        if (metasGastoInput) {
            state.metasGastoDraft[metasGastoInput.getAttribute('data-metas-gasto-input')] = metasGastoInput.value;
            return;
        }
        const datosTransferenciaInput = e.target.closest('[data-datos-transferencia-input]');
        if (datosTransferenciaInput) {
            state.datosTransferenciaDraft[datosTransferenciaInput.getAttribute('data-datos-transferencia-input')] = datosTransferenciaInput.value;
            return;
        }
        const cartolaPasswordInput = e.target.closest('[data-cartola-password-input]');
        if (cartolaPasswordInput) {
            state.reconciliar.passwordDraft = cartolaPasswordInput.value;
            return;
        }
        const metaField = e.target.closest('[data-meta-field]');
        if (metaField) {
            state.metaDraft[metaField.getAttribute('data-meta-field')] = metaField.value;
            return;
        }
        const platformField = e.target.closest('[data-platform-field]');
        if (platformField) {
            state.platformDraft[platformField.getAttribute('data-platform-field')] = platformField.value;
            return;
        }
        const newPlatformField = e.target.closest('[data-newplatform-field]');
        if (newPlatformField) {
            state.newPlatformDraft[newPlatformField.getAttribute('data-newplatform-field')] = newPlatformField.value;
            return;
        }
        const catDraftField = e.target.closest('[data-cat-draft-field]');
        if (catDraftField) {
            state.catDraft[catDraftField.getAttribute('data-cat-draft-field')] = catDraftField.value;
            return;
        }
        const medioDraftField = e.target.closest('[data-medio-draft-field]');
        if (medioDraftField) {
            state.medioDraft[medioDraftField.getAttribute('data-medio-draft-field')] = medioDraftField.value;
            return;
        }
        const planBaseInput = e.target.closest('[data-plan-base-input]');
        if (planBaseInput) {
            PLANIFICADOR.base = parseInt(planBaseInput.value.replace(/\D/g, ''), 10) || 0;
            updatePlanCompute();
            return;
        }
        const planMetaPctInput = e.target.closest('[data-plan-meta-pct]');
        if (planMetaPctInput) {
            const metaId = planMetaPctInput.getAttribute('data-plan-meta-id');
            const v = parseFloat(planMetaPctInput.value.replace(',', '.'));
            PLANIFICADOR.metaPcts[metaId] = isNaN(v) ? 0 : v;
            updatePlanCompute();
            return;
        }
        const proyAporteInput = e.target.closest('[data-proy-aporte-input]');
        if (proyAporteInput) {
            const raw = proyAporteInput.value.trim();
            // Vacío = "vuelve a usar tu promedio real" (mismo criterio que dejar el placeholder).
            state.proySimulatedAporte = raw === '' ? null : (parseInt(raw.replace(/\D/g, ''), 10) || 0);
            updateProyeccionCompute();
            return;
        }
        const proyRetornoInput = e.target.closest('[data-proy-retorno-input]');
        if (proyRetornoInput) {
            const v = parseFloat(proyRetornoInput.value.replace(',', '.'));
            PROYECCION_SUPUESTOS.retornoAnual = isNaN(v) ? 0 : v;
            updateProyeccionCompute();
            return;
        }
        const proyInflacionInput = e.target.closest('[data-proy-inflacion-input]');
        if (proyInflacionInput) {
            const v = parseFloat(proyInflacionInput.value.replace(',', '.'));
            PROYECCION_SUPUESTOS.inflacionAnual = isNaN(v) ? 0 : v;
            updateProyeccionCompute();
            return;
        }
        const draftField = e.target.closest('[data-draft-field]');
        if (draftField && state.draftTx) {
            const field = draftField.getAttribute('data-draft-field');
            if (field === 'comercio') {
                state.draftTx.comercio = draftField.value;
            }
            else if (field === 'fecha') {
                state.draftTx.fecha = draftField.value;
            }
            else if (field === 'monto') {
                const v = safeEvalExpr(draftField.value);
                if (v !== null) {
                    state.draftTx.monto = v;
                    if (state.draftTx.categorias[0])
                        state.draftTx.categorias[0].monto = v;
                }
            }
            const saveBtn = document.querySelector('[data-save-draft]');
            if (saveBtn)
                saveBtn.disabled = !(state.draftTx.comercio.trim().length > 0 && state.draftTx.monto > 0);
            return;
        }
    });
    // Normaliza los campos con expresiones (Tricount-style) al salir del input,
    // así el usuario ve el número final en vez de la expresión que escribió.
    phone.addEventListener('focusout', function (e) {
        const amtInput = e.target.closest('[data-cat-amount]');
        if (amtInput) {
            const t = getTx(state.openTxId);
            const idx = parseInt(amtInput.getAttribute('data-cat-amount'), 10);
            if (t && t.categorias[idx]) {
                const unit = state.splitCatUnit[t.id] || '$';
                const shown = unit === '%' ? (t.categorias[idx].monto / t.monto) * 100 : t.categorias[idx].monto;
                amtInput.value = formatEditableNumber(shown);
            }
            return;
        }
        const cobroAmt = e.target.closest('[data-cobro-amount]');
        if (cobroAmt) {
            const t = getTx(state.openTxId);
            const idx = parseInt(cobroAmt.getAttribute('data-cobro-amount'), 10);
            if (t && t.porCobrar[idx].monto != null) {
                const unit = state.splitCobroUnit[t.id] || '$';
                const shown = unit === '%' ? (t.porCobrar[idx].monto / t.monto) * 100 : t.porCobrar[idx].monto;
                cobroAmt.value = formatEditableNumber(shown);
            }
            return;
        }
        const draftMonto = e.target.closest('[data-draft-field="monto"]');
        if (draftMonto && state.draftTx) {
            draftMonto.value = state.draftTx.monto ? formatEditableNumber(state.draftTx.monto) : '';
            return;
        }
        const boletaItemMontoOut = e.target.closest('[data-boleta-item-monto]');
        if (boletaItemMontoOut && state.boleta) {
            const idx = parseInt(boletaItemMontoOut.getAttribute('data-boleta-item-monto'), 10);
            const item = state.boleta.items[idx];
            if (item)
                boletaItemMontoOut.value = formatEditableNumber(item.monto);
            return;
        }
        const planBaseInput = e.target.closest('[data-plan-base-input]');
        if (planBaseInput) {
            planBaseInput.value = moneyPlain(PLANIFICADOR.base);
            return;
        }
        const boletaPropinaInputOut = e.target.closest('[data-boleta-propina-input]');
        if (boletaPropinaInputOut && state.boleta && state.boleta.propinaValor !== '') {
            const v = safeEvalExpr(String(state.boleta.propinaValor));
            if (v != null)
                boletaPropinaInputOut.value = state.boleta.propinaUnit === '%' ? String(v) : formatEditableNumber(v);
            return;
        }
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && (state.openTxId || state.creatingNew || state.filterSheetOpen || state.linkFlow || state.boleta))
            closeSheet();
    });
    // Evita que el navegador haga scroll automático de la hoja al enfocar un botón
    // (eso era lo que causaba el salto molesto al tocar acciones dentro del sheet).
    phone.addEventListener('mousedown', function (e) {
        const btn = e.target.closest('button');
        if (btn)
            e.preventDefault();
    });
    /* ---------- reordenar sub-tabs de Resumen con drag and drop ---------- */
    // Funciona con mouse y con touch (Pointer Events unifica ambos). Un movimiento chico
    // sigue siendo un tap normal (lo maneja el click de siempre); solo pasa a "drag" si
    // el dedo/mouse se mueve más de un umbral, y ahí vamos reordenando en vivo mientras
    // se arrastra, sin tocar el resto de la vista (#resumen-content sigue intacto).
    const SUBTAB_DRAG_THRESHOLD = 6;
    phone.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0)
            return;
        const pill = e.target.closest('[data-resumen-sub]');
        const container = document.getElementById('resumen-subtabs');
        if (!pill || !container)
            return;
        subtabDrag = {
            id: pill.getAttribute('data-resumen-sub'),
            pointerId: e.pointerId,
            startX: e.clientX,
            dragging: false,
            container
        };
    });
    phone.addEventListener('pointermove', function (e) {
        if (!subtabDrag || e.pointerId !== subtabDrag.pointerId)
            return;
        if (!subtabDrag.dragging) {
            if (Math.abs(e.clientX - subtabDrag.startX) < SUBTAB_DRAG_THRESHOLD)
                return;
            subtabDrag.dragging = true;
            state.subtabDragId = subtabDrag.id;
            try {
                subtabDrag.container.setPointerCapture(e.pointerId);
            }
            catch (err) { }
            subtabDrag.container.innerHTML = renderResumenSubtabsInner();
        }
        e.preventDefault();
        const hovered = document.elementFromPoint(e.clientX, e.clientY);
        const hoveredPill = hovered && hovered.closest && hovered.closest('[data-resumen-sub]');
        if (!hoveredPill)
            return;
        const hoveredId = hoveredPill.getAttribute('data-resumen-sub');
        if (hoveredId === subtabDrag.id)
            return;
        const order = state.resumenSubOrder;
        const from = order.indexOf(subtabDrag.id);
        const to = order.indexOf(hoveredId);
        if (from === -1 || to === -1)
            return;
        order.splice(from, 1);
        order.splice(to, 0, subtabDrag.id);
        subtabDrag.container.innerHTML = renderResumenSubtabsInner();
    });
    function endSubtabDrag(e) {
        if (!subtabDrag || e.pointerId !== subtabDrag.pointerId)
            return;
        const wasDragging = subtabDrag.dragging;
        const container = subtabDrag.container;
        try {
            container.releasePointerCapture(e.pointerId);
        }
        catch (err) { }
        subtabDrag = null;
        state.subtabDragId = null;
        if (wasDragging) {
            // El click (si el navegador llega a dispararlo) va sincrónico justo después de
            // pointerup/mouseup dentro del mismo gesto — con 0ms alcanza para dejarlo pasar
            // y no correr el riesgo de bloquear un tap real y posterior de la usuaria.
            suppressNextSubtabClick = true;
            setTimeout(function () { suppressNextSubtabClick = false; }, 0);
            container.innerHTML = renderResumenSubtabsInner();
        }
    }
    phone.addEventListener('pointerup', endSubtabDrag);
    phone.addEventListener('pointercancel', endSubtabDrag);
    function overlayEl() { return document.getElementById('sheet-overlay'); }
    function renderIfListVisible() {
        if (state.tab === 'transacciones')
            renderTransaccionesView();
        else if (state.tab === 'resumen')
            renderResumenSubContent();
    }
    document.getElementById('fab-add').innerHTML = ICONS.plus;
    document.getElementById('auth-brand-icon').innerHTML = ICONS.lock;
    regenerateCuotasFor('t31');
    render();
    /* ===================== SUPABASE: CUENTAS + GUARDADO EN LA NUBE =====================
       Hasta acá arriba todo corrió igual que la maqueta: se pintó con los datos de ejemplo
       (Fran/Cata/Sushi Itto, etc.) mientras se resuelve si hay o no una sesión real. Todo lo
       de abajo reemplaza esos datos de ejemplo por los datos reales del hogar de la persona
       que inició sesión (o por un estado vacío recién creado, si es una cuenta nueva) —
       nunca se mezclan ni se guardan encima de los de la demo. */
    const SUPABASE_URL = 'https://wuxdctmhbuttzssiknkt.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_uLIIyeomS52mPIie__KvAA_ErW-lYhb';
    // Notificaciones push: la llave pública VAPID (segura de tener acá, es pública por diseño —
    // la privada vive SOLO como secret en el Cloudflare Worker) y la URL de ese Worker, que es
    // quien realmente manda los avisos (ver cloudflare-worker/worker.js).
    const VAPID_PUBLIC_KEY = 'BBVwNyDtQKLPpTNpIRMLpl13w9_3ucBwbZKyStc-v5LFU3shPh9Q7HfrmDxR4m60riF1-3dGth9Iwe3BOTgF_uk';
    // Reemplaza esto por la URL real de tu Worker una vez que lo despliegues (Cloudflare te la
    // muestra apenas creas el Worker, algo como https://tu-worker.tu-cuenta.workers.dev).
    const PUSH_WORKER_URL = 'https://curly-thunder-b4c6.talajesu.workers.dev';
    const sb = (typeof window !== 'undefined' && window.supabase)
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;
    let currentUser = null; // objeto user de Supabase Auth, o null si no hay sesión
    let currentHouseholdId = null; // uuid del hogar cuyos datos están cargados ahora mismo
    let authMode = 'login'; // 'login' | 'signup' — qué pestaña del auth-gate está activa
    let suppressAutoSave = true; // true mientras se están aplicando datos cargados (para no
    // reguardar de vuelta lo que se acaba de leer)
    let saveTimer = null;
    let lastSavedBlobJSON = null; // último estado ya guardado en Supabase — para no reguardar
    // (ni mostrar "Guardando…") cuando el DOM cambió pero los
    // datos reales son los mismos (ver writeStateToSupabase)
    function emptyAppStateBlob() {
        const ym = todayISO().slice(0, 7);
        const catsBase = {};
        Object.keys(CATS_SEED_DEFAULTS).forEach(function (k) { catsBase[k] = Object.assign({}, CATS_SEED_DEFAULTS[k]); });
        const monthLabelObj = {};
        monthLabelObj[ym] = monthLabelFor(ym);
        return {
            transacciones: [],
            categorias: catsBase,
            mediosPago: { efectivo: { nombre: 'Efectivo', corto: 'Efectivo', icon: 'cash' } },
            presupuestos: {},
            presupuestoTotalMensual: 0,
            metasGastoPct: { fijo: 45, variable: 17 },
            datosTransferencia: { nombre: '', rut: '', banco: '', tipoCuenta: '', numeroCuenta: '', email: '' },
            metasInversion: [],
            plataformas: {},
            planificador: { base: 0, metaPcts: {} },
            metasTotalChecks: {},
            presupuestoAvisosEnviados: {},
            months: [ym],
            monthLabel: monthLabelObj
        };
    }
    // El mismo formato que ya usaba "Respaldo en JSON" (buildBackupJSON), extendido con los
    // checks del objetivo total y con los meses — antes esos dos no viajaban en el respaldo.
    function buildFullStateBlob() {
        return {
            transacciones: TX, categorias: CATS, mediosPago: MEDIOS,
            presupuestos: PRESUPUESTOS, presupuestoTotalMensual: presupuestoTotalMensual,
            metasGastoPct: METAS_GASTO_PCT, datosTransferencia: DATOS_TRANSFERENCIA,
            metasInversion: METAS_INVERSION, plataformas: PLATAFORMA_DATA, planificador: PLANIFICADOR,
            metasTotalChecks: METAS_TOTAL_CHECKS, presupuestoAvisosEnviados: PRESUPUESTO_AVISOS_ENVIADOS,
            months: MONTHS, monthLabel: MONTH_LABEL
        };
    }
    // CATS, MEDIOS, MONTHS y MONTH_LABEL son const — se vacían y se vuelven a llenar en el
    // mismo objeto/arreglo, nunca se reasignan. TX, PRESUPUESTOS, METAS_INVERSION,
    // PLATAFORMA_DATA, PLANIFICADOR y METAS_TOTAL_CHECKS son let — esas sí se reasignan directo.
    function applyStateBlob(blob) {
        Object.keys(CATS).forEach(function (k) { delete CATS[k]; });
        Object.assign(CATS, blob.categorias || {});
        Object.keys(MEDIOS).forEach(function (k) { delete MEDIOS[k]; });
        Object.assign(MEDIOS, blob.mediosPago || {});
        TX = blob.transacciones || [];
        PRESUPUESTOS = blob.presupuestos || {};
        presupuestoTotalMensual = blob.presupuestoTotalMensual || 0;
        METAS_GASTO_PCT = blob.metasGastoPct || { fijo: 45, variable: 17 };
        DATOS_TRANSFERENCIA = blob.datosTransferencia || { nombre: '', rut: '', banco: '', tipoCuenta: '', numeroCuenta: '', email: '' };
        METAS_INVERSION = blob.metasInversion || [];
        PLATAFORMA_DATA = blob.plataformas || {};
        METAS_TOTAL_CHECKS = blob.metasTotalChecks || {};
        PRESUPUESTO_AVISOS_ENVIADOS = blob.presupuestoAvisosEnviados || {};
        const ym = todayISO().slice(0, 7);
        const meses = (blob.months && blob.months.length) ? blob.months.slice().sort() : [ym];
        MONTHS.length = 0;
        meses.forEach(function (m) { MONTHS.push(m); });
        Object.keys(MONTH_LABEL).forEach(function (k) { delete MONTH_LABEL[k]; });
        const ml = blob.monthLabel || {};
        MONTHS.forEach(function (m) { MONTH_LABEL[m] = ml[m] || monthLabelFor(m); });
        PLANIFICADOR = blob.planificador || getPlanificadorDefaults();
        // que los ids nuevos sigan después de lo cargado, no desde el número fijo de la demo
        metaIdCounter = METAS_INVERSION.reduce(function (mx, m) {
            const n = parseInt(String(m.id).replace(/[^0-9]/g, ''), 10);
            return isNaN(n) ? mx : Math.max(mx, n);
        }, 0);
        importIdCounter = TX.reduce(function (mx, t) {
            if (!/^timp/.test(t.id))
                return mx;
            const n = parseInt(t.id.replace('timp', ''), 10);
            return isNaN(n) ? mx : Math.max(mx, n);
        }, 0);
        state.monthIndex = currentMonthIndex();
        state.tab = 'transacciones';
        state.resumenSub = 'balance';
        state.menuSection = null;
        state.openTxId = null;
        state.creatingNew = false;
        state.draftTx = null;
        state.categoryFilter = null;
        state.categoryFilterMonth = null;
        state.evoSelectedMonth = null;
        state.editingPlatformId = null;
        state.creatingPlatform = false;
        state.confirmDeletePlatformId = null;
        state.confirmArchivePlatformId = null;
        state.confirmDeleteTxId = null;
        state.demoMode = false;
    }
    /* ---------- indicador de guardado (pastilla chica junto al título) ----------
       A pedido: el guardado normal (mientras escribe, al tocar algo) debe pasar solo, sin
       avisarle con palabras que está "Guardando…" ni "Guardado" — se entiende solo, sin que se
       lo digamos. La única vez que SÍ vale la pena avisar es cuando algo salió mal de verdad
       (sin conexión, no se guardó) — eso sí puede llevarla a perder datos sin darse cuenta, así
       que ese caso se sigue mostrando. */
    let syncHideTimer = null;
    function updateSyncIndicator(status) {
        const el = document.getElementById('sync-indicator');
        if (!el)
            return;
        clearTimeout(syncHideTimer);
        el.classList.toggle('error', status === 'error');
        if (status === 'error') {
            el.hidden = false;
            el.textContent = 'Sin conexión — no se guardó';
        }
        else {
            el.hidden = true;
        }
    }
    /* ---------- guardar en Supabase (con espera corta para no escribir en cada tecla) ---------- */
    async function writeStateToSupabase() {
        if (!sb || !currentHouseholdId)
            return;
        const blobJSON = JSON.stringify(buildFullStateBlob());
        // Casi todo lo que pasa en la app (cambiar de pestaña, abrir una transacción, filtrar)
        // termina en un repintado del teléfono, y por eso agenda un guardado (ver autoSaveObserver
        // más abajo) — pero la mayoría de esos repintados no cambiaron ningún dato real, solo la
        // pantalla. Si el estado es idéntico al último que se guardó, no hay nada que escribir:
        // ni llamada a Supabase ni "Guardando…/Guardado" en pantalla. Así el indicador aparece
        // solo cuando de verdad se guardó algo nuevo.
        if (blobJSON === lastSavedBlobJSON)
            return;
        updateSyncIndicator('saving');
        try {
            const { error } = await sb.from('app_state').update({
                data: JSON.parse(blobJSON),
                updated_at: new Date().toISOString(),
                updated_by: currentUser ? currentUser.id : null
            }).eq('household_id', currentHouseholdId);
            if (error) {
                console.error('Pitucas sin lucas — error guardando en Supabase:', error);
                updateSyncIndicator('error');
                return;
            }
            lastSavedBlobJSON = blobJSON;
            updateSyncIndicator('saved');
            // Justo después de un guardado real (no de cualquier repintado) es el único momento en
            // que el gasto de una categoría pudo haber cambiado -- por eso se revisa acá si algún
            // presupuesto cruzó recién un umbral, no en cada render.
            checkPresupuestoPushAvisos();
        }
        catch (err) {
            console.error('Pitucas sin lucas — error de red guardando en Supabase:', err);
            updateSyncIndicator('error');
        }
    }
    function scheduleSave() {
        if (suppressAutoSave || !sb || !currentHouseholdId)
            return;
        clearTimeout(saveTimer);
        saveTimer = setTimeout(writeStateToSupabase, 1200);
    }
    // Cualquier cambio de datos en esta app termina, casi siempre, en un re-render de algún
    // pedazo del teléfono — no hay un único punto "el estado cambió" al que engancharse (son
    // decenas de handlers, cada uno llamando a su propio render*()). En vez de instrumentar cada
    // uno, se observa el DOM del teléfono completo: cualquier repintado agenda un guardado
    // (con espera corta, así una racha de clicks solo guarda una vez al final) — el chequeo de
    // "¿en verdad cambió algo?" queda adentro de writeStateToSupabase (arriba), no acá, así que
    // navegar entre pantallas agenda un guardado que después se descarta solo, sin tocar la red.
    // OJO: el propio indicador "Guardando…/Guardado" vive DENTRO de #phone y se actualiza
    // en cada guardado — si no se excluye acá, cada actualización del indicador dispara una
    // mutación, que agenda OTRO guardado, que vuelve a actualizar el indicador... un loop
    // infinito de "Guardando/Guardado" sin que la usuaria haya tocado nada. Por eso se ignora
    // un lote de mutaciones cuando TODAS ocurrieron adentro del propio indicador.
    const syncIndicatorEl = document.getElementById('sync-indicator');
    const autoSaveObserver = new MutationObserver(function (mutList) {
        const soloIndicador = syncIndicatorEl && mutList.every(function (m) {
            return m.target === syncIndicatorEl || syncIndicatorEl.contains(m.target);
        });
        if (soloIndicador)
            return;
        scheduleSave();
    });
    autoSaveObserver.observe(phone, { childList: true, subtree: true, characterData: true });
    // Si la pestaña se oculta (se cambia de app, se apaga la pantalla, etc.) conviene guardar
    // de inmediato en vez de esperar los 1200ms, por si no vuelve a abrirse a tiempo.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && saveTimer) {
            clearTimeout(saveTimer);
            writeStateToSupabase();
        }
    });
    /* ---------- auth-gate: UI ---------- */
    function showAuthError(msg) {
        const el = document.getElementById('auth-error');
        el.textContent = msg;
        el.hidden = false;
    }
    function clearAuthError() {
        const el = document.getElementById('auth-error');
        el.hidden = true;
        el.textContent = '';
    }
    function showAuthHint(msg, success) {
        const el = document.getElementById('auth-hint');
        el.textContent = msg;
        el.hidden = false;
        el.classList.toggle('success', !!success);
    }
    function clearAuthHint() {
        const el = document.getElementById('auth-hint');
        el.hidden = true;
        el.textContent = '';
        el.classList.remove('success');
    }
    function setAuthLoading(isLoading) {
        const btn = document.getElementById('auth-submit-btn');
        btn.disabled = isLoading;
        btn.textContent = isLoading ? 'Un momento…' : (authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta');
    }
    // Al abrir la app, todavía no sabemos si ya había sesión iniciada — antes de tener esa
    // respuesta de Supabase, mostrábamos directo el formulario de "Iniciar sesión", así que
    // quien ya tenía sesión abierta veía un destello de esa pantalla antes de entrar a sus
    // datos. Ahora, mientras se resuelve esa pregunta, se ve solo un loader neutro (ni
    // formulario ni app) — recién se muestra el formulario si de verdad no hay sesión.
    function showAuthChecking() {
        document.getElementById('auth-checking').hidden = false;
        document.getElementById('auth-content').hidden = true;
    }
    function showAuthForm() {
        document.getElementById('auth-checking').hidden = true;
        document.getElementById('auth-content').hidden = false;
    }
    function switchAuthMode(mode) {
        authMode = mode;
        clearAuthError();
        clearAuthHint();
        document.querySelectorAll('[data-auth-tab]').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-auth-tab') === mode);
        });
        document.getElementById('auth-password').setAttribute('autocomplete', mode === 'signup' ? 'new-password' : 'current-password');
        setAuthLoading(false);
    }
    function translateAuthError(err) {
        const msg = (err && err.message) || '';
        if (/Invalid login credentials/i.test(msg))
            return 'Correo o contraseña incorrectos.';
        if (/User already registered/i.test(msg))
            return 'Ya existe una cuenta con ese correo — intenta iniciar sesión.';
        if (/Password should be at least|password.*6/i.test(msg))
            return 'La contraseña debe tener al menos 6 caracteres.';
        if (/Unable to validate email|invalid.*email/i.test(msg))
            return 'Ese correo no parece válido.';
        if (/Failed to fetch|NetworkError|network/i.test(msg))
            return 'No se pudo conectar. Revisa tu internet e intenta de nuevo.';
        return msg || 'Ocurrió un error inesperado. Intenta de nuevo.';
    }
    async function handleAuthSubmit() {
        if (!sb) {
            showAuthError('No se pudo cargar la conexión con el servidor. Recarga la página.');
            return;
        }
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        clearAuthError();
        clearAuthHint();
        if (!email || !password) {
            showAuthError('Completa tu correo y tu contraseña.');
            return;
        }
        if (password.length < 6) {
            showAuthError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        setAuthLoading(true);
        try {
            if (authMode === 'login') {
                const { error } = await sb.auth.signInWithPassword({ email, password });
                if (error)
                    throw error;
                // sb.auth.onAuthStateChange sigue solo desde acá (evento SIGNED_IN)
            }
            else {
                const { data, error } = await sb.auth.signUp({ email, password });
                if (error)
                    throw error;
                if (!data.session) {
                    // proyecto con confirmación de correo activada: no queda sesión hasta que confirme
                    setAuthLoading(false);
                    switchAuthMode('login');
                    showAuthHint('Cuenta creada — revisa tu correo (' + email + ') para confirmarla, y después inicia sesión aquí.', true);
                    return;
                }
                // si el proyecto no pide confirmación, ya llega con sesión y onAuthStateChange sigue solo
            }
        }
        catch (err) {
            setAuthLoading(false);
            showAuthError(translateAuthError(err));
        }
    }
    document.getElementById('auth-form').addEventListener('submit', function (e) {
        e.preventDefault();
        handleAuthSubmit();
    });
    /* ---------- cargar/guardar el hogar real tras autenticarse ---------- */
    async function onAuthenticated(user) {
        if (currentUser && currentUser.id === user.id)
            return; // ya está cargado, no repetir
        currentUser = user;
        setAuthLoading(true);
        showAuthHint('Cargando tus datos…', false);
        try {
            const { data: memberRows, error: memberErr } = await sb.from('household_members').select('household_id').eq('user_id', user.id).limit(1);
            if (memberErr)
                throw memberErr;
            if (!memberRows || !memberRows.length) {
                throw new Error('Tu cuenta todavía no tiene un hogar asociado. Cierra sesión, espera unos segundos y vuelve a entrar — se crea automáticamente al registrarte.');
            }
            currentHouseholdId = memberRows[0].household_id;
            // El código de importación (import_token) del hogar se usa para el import por correo Y
            // para las notificaciones push (así el Worker puede validar "de qué hogar es esto" sin
            // que tenga tu sesión) — se trae acá, apenas hay hogar, para no depender de que ella
            // abra la pantalla de "Importar desde tu correo" primero. Si falla, no es grave: esa
            // pantalla lo vuelve a intentar sola, y el push simplemente no se manda por ahora.
            try {
                const { data: hhRow, error: hhErr } = await sb.from('households').select('import_token').eq('id', currentHouseholdId).single();
                if (!hhErr && hhRow) {
                    state.importToken = hhRow.import_token;
                    state.importCorreoLoaded = true;
                }
            }
            catch (e) {
                console.error('Pitucas sin lucas — error precargando el código de importación:', e);
            }
            const { data: stateRow, error: stateErr } = await sb.from('app_state').select('data').eq('household_id', currentHouseholdId).single();
            if (stateErr)
                throw stateErr;
            const blob = (stateRow && stateRow.data) || {};
            suppressAutoSave = true;
            if (!blob || !Object.keys(blob).length) {
                applyStateBlob(emptyAppStateBlob());
                lastSavedBlobJSON = null; // fuerza el guardado inicial de abajo, aunque esté vacío
                await writeStateToSupabase(); // deja guardado el estado vacío recién armado
            }
            else {
                applyStateBlob(blob);
                lastSavedBlobJSON = JSON.stringify(buildFullStateBlob()); // ya está guardado tal cual en Supabase
            }
            document.getElementById('auth-gate').hidden = true;
            clearAuthError();
            clearAuthHint();
            render();
            setTimeout(function () { suppressAutoSave = false; absorbImportedRows(); }, 0);
        }
        catch (err) {
            console.error('Pitucas sin lucas — error cargando datos del hogar:', err);
            setAuthLoading(false);
            showAuthForm(); // si falla, hay que mostrar el formulario para que vea el error (estaba oculto)
            showAuthError(translateAuthError(err));
        }
    }
    function resetToLoggedOutState() {
        suppressAutoSave = true;
        applyStateBlob(emptyAppStateBlob());
        state.importCorreoLoaded = false;
        state.importCorreoError = null;
        state.importToken = null;
        state.notifLoaded = false;
        state.notifError = null;
        state.notifSubscribed = false;
        state.notifBusy = false;
        state.notifTestBusy = false;
        state.notifTestResult = null;
        document.getElementById('auth-email').value = '';
        document.getElementById('auth-password').value = '';
        clearAuthError();
        clearAuthHint();
        switchAuthMode('login');
        document.getElementById('auth-gate').hidden = false;
        showAuthForm();
        setTimeout(function () { suppressAutoSave = false; }, 0);
    }
    async function handleLogout() {
        clearTimeout(saveTimer);
        if (currentHouseholdId)
            await writeStateToSupabase();
        if (sb)
            await sb.auth.signOut();
        currentUser = null;
        currentHouseholdId = null;
        resetToLoggedOutState();
    }
    /* ---------- arranque: ¿ya había una sesión abierta? ---------- */
    if (sb) {
        sb.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_OUT') {
                if (currentUser) {
                    currentUser = null;
                    currentHouseholdId = null;
                    resetToLoggedOutState();
                }
                return;
            }
            if (session && session.user)
                onAuthenticated(session.user);
        });
        sb.auth.getSession().then(function (res) {
            const session = res && res.data && res.data.session;
            if (session && session.user)
                onAuthenticated(session.user);
            else {
                setAuthLoading(false);
                showAuthForm();
            }
        }).catch(function (err) {
            console.error('Pitucas sin lucas — error obteniendo la sesión:', err);
            setAuthLoading(false);
            showAuthForm();
            showAuthError('No se pudo conectar con el servidor. Revisa tu internet y recarga la página.');
        });
    }
    else {
        setAuthLoading(false);
        showAuthForm();
        showAuthError('No se pudo cargar la librería de conexión (revisa tu internet y recarga la página).');
    }
})();