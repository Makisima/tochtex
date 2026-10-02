// ===== КАЛЬКУЛЯТОР СТОИМОСТИ =====
// Версия: ТД-5 v2 (материал + расчёт по целым листам, КИМ фиксирован 75%)
// Зависимости: /data/prices.json (блоки "калькулятор" услуг + "материалы")

document.addEventListener('DOMContentLoaded', function () {

    var wrapper = document.getElementById('calc-wrapper');
    var loading = document.getElementById('calc-loading');
    if (!wrapper || !loading) return;

    var YM_ID = 113089370;
    function sendGoal(id) {
        if (typeof ym === 'function') ym(YM_ID, 'reachGoal', id);
    }

    var PRICES = null;
    var MATERIALS = {};
    var currentService = 'лазерная';
    var materialMode = 'off'; // 'off' | 'on'
    var resultSent = false;
    var calcWasUsed = false;

    // КИМ фиксирован — клиент его не вводит
    var KIM = 0.75;

    // Группы материалов резки → категории материала
    var CUTTING_GROUPS = {
        'сталь':      ['сталь_углеродистая', 'сталь_низколегированная', 'сталь_строительная', 'оцинковка', 'рифленый', 'инструментальная', 'жесть'],
        'нержавейка': ['нержавейка'],
        'алюминий':   ['алюминий']
    };

    // Категория материала → материал резки (обратный маппинг)
    var CAT_TO_CUTTING = {
        'сталь_углеродистая':      'сталь',
        'сталь_низколегированная': 'сталь',
        'сталь_строительная':      'сталь',
        'оцинковка':               'сталь',
        'рифленый':                'сталь',
        'инструментальная':        'сталь',
        'жесть':                   'сталь',
        'нержавейка':              'нержавейка',
        'алюминий':                'алюминий'
    };

    // ---- Загрузка цен ----
    fetch('/data/prices.json')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            PRICES = data;
            MATERIALS = data.материалы || {};
            loading.style.display = 'none';
            wrapper.style.display = 'block';
            try {
                initCalculator();
                sendGoal('calc_open');
            } catch (e) {
                console.error('Калькулятор: ошибка инициализации', e);
                sendGoal('calc_error');
                wrapper.style.display = 'none';
                loading.style.display = 'block';
                loading.innerHTML = '<p>⚠️ Калькулятор временно недоступен. Позвоните: <a href="tel:+79030021883">+7 (903) 002-18-83</a>.</p>';
            }
        })
        .catch(function (err) {
            console.error('Калькулятор: не удалось загрузить цены', err);
            sendGoal('calc_error');
            loading.innerHTML = '<p>⚠️ Не удалось загрузить цены. Позвоните: <a href="tel:+79030021883">+7 (903) 002-18-83</a>.</p>';
        });

    // ==================================================
    //  ИНИЦИАЛИЗАЦИЯ
    // ==================================================
    function initCalculator() {

        // Вкладки услуг
        document.querySelectorAll('.calc-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                document.querySelectorAll('.calc-tab').forEach(function (t) { t.classList.remove('active'); });
                document.querySelectorAll('.calc-panel').forEach(function (p) { p.classList.remove('active'); });
                tab.classList.add('active');
                currentService = tab.dataset.calc;
                var panel = document.querySelector('.calc-panel[data-panel="' + currentService + '"]');
                if (panel) panel.classList.add('active');
                sendGoal('calc_tab_switch');
                recalc();
            });
        });

        // Тумблер «Без материала / С материалом»
        document.querySelectorAll('.calc-mode-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var mode = btn.dataset.materialMode;
                if (mode === materialMode) return;
                materialMode = mode;
                document.querySelectorAll('.calc-mode-btn').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.materialMode === mode);
                });
                sendGoal('calc_material_mode_' + mode);
                recalc();
            });
        });

        // Толщины
        fillThickness('punch-thick', Object.keys(PRICES['пробивка']['калькулятор']['цены_метр']));
        updateLaserThickness();

        // Селекты материала
        initMaterialSelects('laser');
        initMaterialSelects('punch');

        // Слушатели полей работы
        ['laser-mat', 'laser-thick', 'laser-len', 'laser-urgent',
         'punch-thick', 'punch-mode', 'punch-qty',
         'paint-area', 'paint-complex'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', recalc);
                el.addEventListener('change', recalc);
            }
        });

        // Слушатели полей материала
        ['laser-part-l', 'laser-part-w', 'laser-part-qty',
         'punch-part-l', 'punch-part-w', 'punch-part-qty'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', recalc);
                el.addEventListener('change', recalc);
            }
        });

        // Смена материала резки — фильтруем категории материала + обновляем толщины
        var laserMat = document.getElementById('laser-mat');
        if (laserMat) {
            laserMat.addEventListener('change', function () {
                updateMaterialCategoryList('laser');
                updateLaserThickness();
            });
        }

        // Кнопка «Оформить заявку»
        var sendBtn = document.getElementById('calc-to-form');
        if (sendBtn) {
            sendBtn.addEventListener('click', function () {
                var summary = buildSummary();
                if (!summary) return;
                var serviceSelect = document.getElementById('form-service');
                var messageField  = document.getElementById('form-message');

                if (serviceSelect) {
                    var serviceNames = {
                        'лазерная':  'Лазерная резка',
                        'пробивка':  'Координатная пробивка',
                        'покраска':  'Порошковая окраска'
                    };
                    Array.from(serviceSelect.options).forEach(function (o) {
                        if (o.value === serviceNames[currentService]) serviceSelect.value = o.value;
                    });
                }

                if (messageField && messageField.value.trim() !== '') {
                    if (!confirm('Заменить текст в поле «Сообщение» расчётом из калькулятора?')) {
                        document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
                        return;
                    }
                }
                if (messageField) messageField.value = summary;

                calcWasUsed = true;
                sendGoal('calc_send');
                document.getElementById('contact').scrollIntoView({ behavior: 'smooth' });
            });
        }

        updateStickyTop();
        window.addEventListener('resize', updateStickyTop);

        var form = document.getElementById('contactForm');
        if (form) {
            form.addEventListener('submit', function () {
                if (calcWasUsed) sendGoal('calc_form_submit');
            });
        }

        recalc();
    }

    // ==================================================
    //  МАТЕРИАЛ: СЕЛЕКТЫ
    // ==================================================
    function initMaterialSelects(prefix) {
        var catSel = document.getElementById(prefix + '-mat-cat');
        var gradeSel = document.getElementById(prefix + '-mat-grade');
        if (!catSel || !gradeSel) return;

        // Первичное заполнение категорий
        updateMaterialCategoryList(prefix);

        catSel.addEventListener('change', function () {
            fillGrades(prefix, catSel.value);
            recalc();
        });

        // Первичное заполнение марок
        if (catSel.value) {
            fillGrades(prefix, catSel.value);
        }
    }

    // Фильтрация категорий по выбранному материалу резки (только для лазера)
    function updateMaterialCategoryList(prefix) {
        var catSel = document.getElementById(prefix + '-mat-cat');
        if (!catSel) return;

        var allowedCats = null;

        if (prefix === 'laser') {
            var laserMatEl = document.getElementById('laser-mat');
            var laserMat = laserMatEl ? laserMatEl.value : null;
            allowedCats = laserMat ? CUTTING_GROUPS[laserMat] : null;
        }

        var prevValue = catSel.value;
        catSel.innerHTML = '';

        var added = 0;
        Object.keys(MATERIALS).forEach(function (catKey) {
            // Пропускаем служебные ключи
            if (catKey === 'ндс_включён' || catKey === 'ндс_ставка' || catKey === 'источник'
                || catKey === 'обновлено' || catKey === 'формат_листа_мм' || catKey === 'примечание') return;

            // Фильтрация для лазера
            if (allowedCats && allowedCats.indexOf(catKey) === -1) return;

            var cat = MATERIALS[catKey];
            if (!cat || !cat.название || !cat.марки) return;

            var opt = document.createElement('option');
            opt.value = catKey;
            opt.textContent = cat.название;
            catSel.appendChild(opt);
            added++;

            if (catKey === prevValue) catSel.value = catKey;
        });

        // Если прежнее значение не попало в список — ставим первое
        if (catSel.value === '' && added > 0) {
            catSel.selectedIndex = 0;
        }

        fillGrades(prefix, catSel.value);
    }

    function fillGrades(prefix, catKey) {
        var gradeSel = document.getElementById(prefix + '-mat-grade');
        if (!gradeSel) return;
        gradeSel.innerHTML = '';
        var cat = MATERIALS[catKey];
        if (!cat || !cat.марки) return;
        Object.keys(cat.марки).forEach(function (gKey) {
            var g = cat.марки[gKey];
            var opt = document.createElement('option');
            opt.value = gKey;
            opt.textContent = g.название || gKey;
            gradeSel.appendChild(opt);
        });
    }

    // Видимость блока материала
    function updateMaterialFieldsVisibility() {
        document.querySelectorAll('.calc-material-fields').forEach(function (el) {
            var forService = el.dataset.materialFor;
            var show = (materialMode === 'on') && (forService === currentService);
            el.style.display = show ? 'block' : 'none';
        });
    }

    // ==================================================
    //  STICKY / ТОЛЩИНЫ
    // ==================================================
    function updateStickyTop() {
        var header = document.querySelector('.header');
        if (!header) return;
        var h = header.offsetHeight + 20;
        document.documentElement.style.setProperty('--calc-sticky-top', h + 'px');
    }

    function updateLaserThickness() {
        var matEl = document.getElementById('laser-mat');
        if (!matEl) return;
        var mat = matEl.value;
        var cfg = PRICES['лазерная']['калькулятор'];
        var thickObj = cfg.цены[mat];
        if (!thickObj) return;
        var keys = Object.keys(thickObj).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
        fillThickness('laser-thick', keys);
    }

    function fillThickness(selectId, values) {
        var sel = document.getElementById(selectId);
        if (!sel) return;
        var current = sel.value;
        sel.innerHTML = '';
        values.forEach(function (v) {
            var opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v + ' мм';
            sel.appendChild(opt);
        });
        if (values.indexOf(current) !== -1) sel.value = current;
    }

    // ==================================================
    //  ПЕРЕСЧЁТ
    // ==================================================
    function recalc() {
        if (!PRICES) return;
        updateMaterialFieldsVisibility();
        if (currentService === 'лазерная')  calcLaser();
        if (currentService === 'пробивка')  calcPunch();
        if (currentService === 'покраска')  calcPaint();
    }

    // ==================================================
    //  ЛАЗЕРНАЯ РЕЗКА
    // ==================================================
    function calcLaser() {
        var cfg = PRICES['лазерная']['калькулятор'];
        var matEl = document.getElementById('laser-mat');
        var thickEl = document.getElementById('laser-thick');
        var lenInput = document.getElementById('laser-len');
        if (!matEl || !thickEl || !lenInput) { showEmpty(); return; }

        var mat = matEl.value;
        var thick = thickEl.value;
        var len = parseFloat(lenInput.value) || 0;
        var urgent = document.getElementById('laser-urgent').checked;

        if (len > cfg.максимум) {
            showOverMax('Для объёмов свыше ' + cfg.максимум.toLocaleString('ru-RU') + ' м свяжитесь с менеджером: +7 (903) 002-18-83.');
            return;
        }

        var pricePerMeter = (cfg.цены[mat] && cfg.цены[mat][thick]) ? cfg.цены[mat][thick] : null;

        if (pricePerMeter === null || len <= 0) { showEmpty(); return; }

        var base = pricePerMeter * len;
        var discount = pickDiscount(cfg.скидки, len);
        var coef = urgent ? cfg.коэффициент_срочности : 1;
        var total = base * (1 - discount) * coef;

        var totalBeforeMin = total;
        if (total < cfg.минимум) total = cfg.минимум;
        var minApplied = total - totalBeforeMin;

        var workTotal = total;
        var materialInfo = getMaterialInfo('laser', parseFloat(thick));

        showResult({
            formula: pricePerMeter + ' ₽/м × ' + fmtNum(len) + ' м',
            base: base,
            discountPct: discount > 0 ? discount : null,
            discountAmt: discount > 0 ? base * discount : null,
            coefLabel: urgent ? 'Коэффициент срочности ×' + coef : null,
            coefAmt: urgent ? base * (1 - discount) * (coef - 1) : null,
            minApplied: minApplied > 0 ? minApplied : 0,
            workTotal: workTotal,
            material: materialInfo,
            vatRate: cfg.ндс
        });
    }

    // ==================================================
    //  ПРОБИВКА
    // ==================================================
    function calcPunch() {
        var cfg = PRICES['пробивка']['калькулятор'];
        var thickEl = document.getElementById('punch-thick');
        var modeSel = document.getElementById('punch-mode');
        var qtyEl   = document.getElementById('punch-qty');
        var hintEl  = document.getElementById('punch-hint');
        if (!thickEl || !modeSel || !qtyEl) { showEmpty(); return; }

        var thick = thickEl.value;
        var mode = modeSel.value;
        var qty = parseInt(qtyEl.value, 10) || 0;

        var isHitAvailable = cfg.цены_удар[thick] !== undefined;
        Array.from(modeSel.options).forEach(function (o) {
            if (o.value === 'удар') o.disabled = !isHitAvailable;
        });

        if (!isHitAvailable) {
            if (hintEl) {
                hintEl.style.display = 'block';
                hintEl.textContent = 'Для толщины свыше 3 мм расчёт за удар недоступен — только за метр реза.';
            }
            if (mode === 'удар') { modeSel.value = 'метр'; mode = 'метр'; }
        } else {
            if (hintEl) hintEl.style.display = 'none';
        }

        var base = 0, discount = 0, minimum = 0, maximum = 0;

        if (mode === 'удар') {
            if (!isHitAvailable || qty <= 0) { showEmpty(); return; }
            maximum = cfg.максимум_удар;
            if (qty > maximum) {
                showOverMax('Для объёмов свыше ' + maximum.toLocaleString('ru-RU') + ' ударов свяжитесь с менеджером: +7 (903) 002-18-83.');
                return;
            }
            base = cfg.цены_удар[thick] * qty;
            discount = pickDiscount(cfg.скидки_удары, qty);
            minimum = cfg.минимум_удар;
        } else {
            var pricePerMeter = cfg.цены_метр[thick];
            if (!pricePerMeter || qty <= 0) { showEmpty(); return; }
            maximum = cfg.максимум_метр;
            if (qty > maximum) {
                showOverMax('Для объёмов свыше ' + maximum.toLocaleString('ru-RU') + ' м свяжитесь с менеджером: +7 (903) 002-18-83.');
                return;
            }
            base = pricePerMeter * qty;
            discount = pickDiscount(cfg.скидки_метры, qty);
            minimum = cfg.минимум_метр;
        }

        var total = base * (1 - discount);
        var totalBeforeMin = total;
        if (minimum > 0 && total < minimum) total = minimum;
        var minApplied = total - totalBeforeMin;

        var modeLabel = (mode === 'удар') ? 'за удар' : 'за метр';
        var formulaText = (mode === 'удар')
            ? cfg.цены_удар[thick] + ' ₽/удар × ' + qty + ' уд.'
            : cfg.цены_метр[thick] + ' ₽/м × ' + qty + ' м';

        var materialInfo = getMaterialInfo('punch', parseFloat(thick));

        showResult({
            formula: '(' + modeLabel + ') ' + formulaText,
            base: base,
            discountPct: discount > 0 ? discount : null,
            discountAmt: discount > 0 ? base * discount : null,
            coefLabel: null,
            coefAmt: null,
            minApplied: minApplied > 0 ? minApplied : 0,
            workTotal: total,
            material: materialInfo,
            vatRate: cfg.ндс
        });
    }

    // ==================================================
    //  ПОКРАСКА (материал не считается)
    // ==================================================
    function calcPaint() {
        var cfg = PRICES['покраска']['калькулятор'];
        var areaEl = document.getElementById('paint-area');
        var complexEl = document.getElementById('paint-complex');
        if (!areaEl) { showEmpty(); return; }

        var area = parseFloat(areaEl.value) || 0;
        var complex = complexEl ? complexEl.checked : false;

        if (area > cfg.максимум) {
            showOverMax('Для объёмов свыше ' + cfg.максимум.toLocaleString('ru-RU') + ' м² свяжитесь с менеджером: +7 (903) 002-18-83.');
            return;
        }
        if (area <= 0) { showEmpty(); return; }

        var pricePerM2 = null;
        for (var i = 0; i < cfg.цены.length; i++) {
            var r = cfg.цены[i];
            if (r.до === null || area <= r.до) { pricePerM2 = r.цена; break; }
        }
        if (pricePerM2 === null) { showEmpty(); return; }

        var base = pricePerM2 * area;
        var coef = complex ? cfg.коэффициент_сложности : 1;
        var total = base * coef;

        var totalBeforeMin = total;
        if (cfg.минимум > 0 && total < cfg.минимум) total = cfg.минимум;
        var minApplied = total - totalBeforeMin;

        showResult({
            formula: pricePerM2 + ' ₽/м² × ' + fmtNum(area) + ' м²',
            base: base,
            discountPct: null,
            discountAmt: null,
            coefLabel: complex ? 'Коэффициент сложности ×' + coef : null,
            coefAmt: complex ? base * (coef - 1) : null,
            minApplied: minApplied > 0 ? minApplied : 0,
            workTotal: total,
            material: null,
            vatRate: cfg.ндс
        });
    }

    // ==================================================
    //  МАТЕРИАЛ: РАСЧЁТ ПО ЦЕЛЫМ ЛИСТАМ
    // ==================================================
    function getMaterialInfo(prefix, thicknessMm) {
        if (materialMode !== 'on') return null;
        if (currentService !== 'лазерная' && currentService !== 'пробивка') return null;
        if (!MATERIALS || !MATERIALS.формат_листа_мм) return { error: 'Данные о материалах не загружены' };

        var catSel = document.getElementById(prefix + '-mat-cat');
        var gradeSel = document.getElementById(prefix + '-mat-grade');
        var lenEl = document.getElementById(prefix + '-part-l');
        var widEl = document.getElementById(prefix + '-part-w');
        var qtyEl = document.getElementById(prefix + '-part-qty');
        if (!catSel || !gradeSel || !lenEl || !widEl || !qtyEl) return null;

        var catKey   = catSel.value;
        var gradeKey = gradeSel.value;
        var L        = parseFloat(lenEl.value) || 0;
        var W        = parseFloat(widEl.value) || 0;
        var qty      = parseInt(qtyEl.value, 10) || 0;

        if (!catKey || !gradeKey || L <= 0 || W <= 0 || qty <= 0) return null;
        if (!thicknessMm || thicknessMm <= 0) return null;

        // Проверка габаритов детали
        if (L > 2500 || W > 1500) {
            return { error: 'Габариты детали ' + L + '×' + W + ' мм превышают максимум 2500×1500 мм' };
        }

        var cat = MATERIALS[catKey];
        if (!cat || !cat.марки) return { error: 'Категория материала не найдена' };
        var grade = cat.марки[gradeKey];
        if (!grade) return { error: 'Марка не найдена' };

        // ⚠️ Цены МетВэл — с НДС. Переводим в базу «без НДС»
        var priceKgWithVat = grade.цена_кг;
        if (!priceKgWithVat || priceKgWithVat <= 0) {
            return { error: 'Цена для марки «' + (grade.название || gradeKey) + '» уточняется у менеджера' };
        }
        var vatRate = MATERIALS.ндс_ставка || 0.22;
        var priceKgNoVat = priceKgWithVat / (1 + vatRate);

        var density = cat.плотность || 7850;

        // Формат листа
        var fmt = MATERIALS.формат_листа_мм;
        var sheetW_m = fmt.ширина / 1000;
        var sheetL_m = fmt.длина / 1000;
        var t_m = thicknessMm / 1000;

        var sheetMass = sheetW_m * sheetL_m * t_m * density; // кг

        // Площадь деталей
        var sOne = (L * W) / 1000000;   // м²
        var sAll = sOne * qty;          // м²

        // Масса деталей (чистый металл в деталях)
        var massParts = sAll * t_m * density;

        // Количество листов с учётом КИМ
        var sheetsNeeded = massParts / (sheetMass * KIM);
        var sheetCount = Math.ceil(sheetsNeeded);
        if (sheetCount < 1) sheetCount = 1;

        // Реальная масса покупки (целыми листами)
        var massPurchase = sheetCount * sheetMass;

        // Стоимость материала
        var costNoVat = massPurchase * priceKgNoVat;
        var costWithVat = massPurchase * priceKgWithVat;

        return {
            categoryName: cat.название,
            gradeName: grade.название || gradeKey,
            thickness: thicknessMm,
            density: density,
            priceKgNoVat: priceKgNoVat,
            priceKgWithVat: priceKgWithVat,
            sheetMass: sheetMass,
            massParts: massParts,
            massPurchase: massPurchase,
            sheetCount: sheetCount,
            costNoVat: costNoVat,
            costWithVat: costWithVat,
            error: null
        };
    }

    // ==================================================
    //  УТИЛИТЫ
    // ==================================================
    function pickDiscount(ranges, value) {
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            if (r.до === null || value <= r.до) return r.скидка;
        }
        return 0;
    }

    function fmt(n) {
        return Math.round(n).toLocaleString('ru-RU', { maximumFractionDigits: 0 }).replace(/\u00A0/g, ' ') + ' ₽';
    }

    function fmtNum(n) {
        return n.toLocaleString('ru-RU', { maximumFractionDigits: 1 }).replace(/\u00A0/g, ' ');
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function setDisplay(id, display) {
        var el = document.getElementById(id);
        if (el) el.style.display = display;
    }

    // ==================================================
    //  ОТОБРАЖЕНИЕ
    // ==================================================
    function showEmpty() {
        setText('res-formula', '—');
        setText('res-base', '— ₽');
        setText('res-total-novat', '— ₽');
        setText('res-vat', '— ₽');
        setText('res-total-vat', '— ₽');
        setDisplay('row-discount', 'none');
        setDisplay('row-coef', 'none');
        setDisplay('row-min', 'none');
        setDisplay('row-work-total', 'none');
        setDisplay('res-material-block', 'none');
        setDisplay('res-warning', 'none');
        var btn = document.getElementById('calc-to-form');
        if (btn) btn.disabled = true;
    }

    function showOverMax(msg) {
        showEmpty();
        var warn = document.getElementById('res-warning');
        if (warn) {
            warn.style.display = 'block';
            warn.textContent = '⚠️ ' + msg;
        }
    }

    function showResult(r) {
        setText('res-formula', r.formula || '—');
        setText('res-base', fmt(r.base));

        // Скидка
        if (r.discountPct && r.discountPct > 0) {
            setDisplay('row-discount', 'flex');
            setText('res-discount-label', 'Скидка за объём -' + (r.discountPct * 100).toFixed(0) + '%:');
            setText('res-discount', '- ' + fmt(r.discountAmt));
        } else {
            setDisplay('row-discount', 'none');
        }

        // Коэффициент
        if (r.coefLabel) {
            setDisplay('row-coef', 'flex');
            setText('res-coef-label', r.coefLabel + ':');
            setText('res-coef', '+ ' + fmt(r.coefAmt));
        } else {
            setDisplay('row-coef', 'none');
        }

        // Минимум
        if (r.minApplied && r.minApplied > 0) {
            setDisplay('row-min', 'flex');
            setText('res-min', '+ ' + fmt(r.minApplied));
        } else {
            setDisplay('row-min', 'none');
        }

        // Материал
        var matBlock = document.getElementById('res-material-block');
        var hasMaterial = r.material && !r.material.error && r.material.costNoVat > 0;

        if (hasMaterial) {
            setDisplay('res-material-block', 'block');
            setText('res-material-name', r.material.gradeName);
            setText('res-material-thick', r.material.thickness + ' мм');
            setText('res-material-count', r.material.sheetCount + ' шт');
            setText('res-material-cost', fmt(r.material.costNoVat));
        } else {
            setDisplay('res-material-block', 'none');
        }

        // Промежуточная строка «Работа без НДС» — показываем только если есть материал
        if (hasMaterial) {
            setDisplay('row-work-total', 'flex');
            setText('res-work-total', fmt(r.workTotal));
        } else {
            setDisplay('row-work-total', 'none');
        }

        // Итоги: работа + материал в одной базе «без НДС»
        var materialNoVat = hasMaterial ? r.material.costNoVat : 0;
        var baseNoVat = Math.round(r.workTotal + materialNoVat);
        var vatAmount = Math.round(baseNoVat * r.vatRate);
        var totalWithVat = baseNoVat + vatAmount;

        setText('res-total-novat', fmt(baseNoVat));
        setText('res-vat', fmt(vatAmount));
        setText('res-total-vat', fmt(totalWithVat));

        // Проверки и предупреждения
        var warn = document.getElementById('res-warning');
        var btn = document.getElementById('calc-to-form');
        var warningText = '';

        if (r.material && r.material.error) {
            warningText = r.material.error;
        } else if (materialMode === 'on' && currentService !== 'покраска' && !r.material) {
            warningText = 'Заполните параметры материала: категорию, марку, размеры детали и количество.';
        }

        if (warningText) {
            if (warn) {
                warn.style.display = 'block';
                warn.textContent = '⚠️ ' + warningText;
            }
            if (btn) btn.disabled = true;
        } else {
            if (warn) warn.style.display = 'none';
            if (btn) btn.disabled = false;
        }

        // Приписка про НДС и доставку
        var noteEl = document.querySelector('.calc-note');
        if (noteEl && materialMode === 'on' && currentService !== 'покраска') {
            noteEl.textContent = 'Расчёт ориентировочный. Цены материала указаны с НДС. Доставка и рез в размер не учтены. Точная стоимость — после получения чертежа или ТЗ.';
        } else if (noteEl) {
            noteEl.textContent = 'Расчёт ориентировочный. Точная стоимость — после получения чертежа или ТЗ.';
        }

        if (!resultSent) {
            resultSent = true;
            sendGoal('calc_result');
        }
    }

    // ==================================================
    //  СБОРКА ТЕКСТА ЗАЯВКИ
    // ==================================================
    function buildSummary() {
        if (!PRICES) return '';

        var lines = [];
        var serviceNames = {
            'лазерная':  'Лазерная резка',
            'пробивка':  'Координатная пробивка',
            'покраска':  'Порошковая окраска'
        };
        lines.push('=== Расчёт с калькулятора ===');
        lines.push('Услуга: ' + serviceNames[currentService]);
        lines.push('');

        lines.push('--- Параметры работы ---');
        if (currentService === 'лазерная') {
            var matEl = document.getElementById('laser-mat');
            var thickEl = document.getElementById('laser-thick');
            var lenEl = document.getElementById('laser-len');
            lines.push('Материал (для резки): ' + (matEl ? matEl.value : '—'));
            lines.push('Толщина: ' + (thickEl ? thickEl.value : '—') + ' мм');
            lines.push('Длина реза: ' + fmtNum(parseFloat(lenEl && lenEl.value) || 0) + ' м');
            if (document.getElementById('laser-urgent') && document.getElementById('laser-urgent').checked) {
                lines.push('Срочность: да');
            }
        } else if (currentService === 'пробивка') {
            var pThick = document.getElementById('punch-thick');
            var pMode = document.getElementById('punch-mode');
            var pQty = document.getElementById('punch-qty');
            lines.push('Толщина: ' + (pThick ? pThick.value : '—') + ' мм');
            lines.push('Режим: ' + (pMode && pMode.value === 'удар' ? 'за удар' : 'за метр'));
            lines.push('Количество: ' + (pQty ? pQty.value : '—'));
        } else if (currentService === 'покраска') {
            var pArea = document.getElementById('paint-area');
            lines.push('Площадь: ' + fmtNum(parseFloat(pArea && pArea.value) || 0) + ' м²');
            var pCompl = document.getElementById('paint-complex');
            if (pCompl && pCompl.checked) lines.push('Сложный профиль: да');
        }
        lines.push('');

        lines.push('--- Расчёт работы ---');
        var formulaEl = document.getElementById('res-formula');
        if (formulaEl && formulaEl.textContent && formulaEl.textContent !== '—') {
            lines.push('Формула: ' + formulaEl.textContent);
        }
        var baseEl = document.getElementById('res-base');
        if (baseEl) lines.push('База: ' + baseEl.textContent);

        var rowDisc = document.getElementById('row-discount');
        if (rowDisc && rowDisc.style.display !== 'none') {
            lines.push(document.getElementById('res-discount-label').textContent + ' ' +
                       document.getElementById('res-discount').textContent);
        }
        var rowCoef = document.getElementById('row-coef');
        if (rowCoef && rowCoef.style.display !== 'none') {
            lines.push(document.getElementById('res-coef-label').textContent + ' ' +
                       document.getElementById('res-coef').textContent);
        }
        var rowMin = document.getElementById('row-min');
        if (rowMin && rowMin.style.display !== 'none') {
            lines.push('Применён минимум заказа: ' + document.getElementById('res-min').textContent);
        }

        // Материал
        var matBlock = document.getElementById('res-material-block');
        if (matBlock && matBlock.style.display !== 'none') {
            lines.push('');
            lines.push('--- Материал ---');
            var mName = document.getElementById('res-material-name');
            var mThick = document.getElementById('res-material-thick');
            var mCount = document.getElementById('res-material-count');
            var mCost = document.getElementById('res-material-cost');
            if (mName) lines.push(mName.textContent + ', ' + (mThick ? mThick.textContent : ''));
            if (mCount) lines.push('Листов 1500×2500: ' + mCount.textContent);
            if (mCost) lines.push('Стоимость материала: ' + mCost.textContent);

            lines.push('');
            lines.push('Работа без НДС: ' + document.getElementById('res-work-total').textContent);
        }

        lines.push('');
        lines.push('--- Итого ---');
        lines.push('Без НДС: ' + document.getElementById('res-total-novat').textContent);
        lines.push('НДС 22%: ' + document.getElementById('res-vat').textContent);
        lines.push('Итого с НДС: ' + document.getElementById('res-total-vat').textContent);
        lines.push('');
        lines.push('Примечание: цены материала указаны с НДС. Доставка и рез в размер не учтены.');
        lines.push('');
        lines.push('--- Прикрепите, пожалуйста, чертёж или эскиз ---');

        return lines.join('\n');
    }

});
