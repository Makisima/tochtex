// ===== КАЛЬКУЛЯТОР СТОИМОСТИ =====
// Зависимости: data/prices.json (блоки "калькулятор" в услугах).

document.addEventListener('DOMContentLoaded', function () {

    var wrapper  = document.getElementById('calc-wrapper');
    var loading  = document.getElementById('calc-loading');
    if (!wrapper || !loading) return;

    var YM_ID = 113089370;
    function sendGoal(id) {
        if (typeof ym === 'function') ym(YM_ID, 'reachGoal', id);
    }

    var PRICES = null;
    var currentService = 'лазерная';
    var resultSent = false;
    var calcWasUsed = false;

    // ---- Загрузка цен ----
    fetch('data/prices.json')
        .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function (data) {
            PRICES = data;
            loading.style.display = 'none';
            wrapper.style.display = 'block';
            try {
                initCalculator();
                sendGoal('calc_open');
            } catch (e) {
                console.error('Калькулятор: ошибка инициализации', e);
                wrapper.style.display = 'none';
                loading.style.display = 'block';
                loading.innerHTML = '<p>⚠️ Калькулятор временно недоступен. Позвоните: <a href="tel:+79030021883">+7 (903) 002-18-83</a>.</p>';
            }
        })
        .catch(function (err) {
            console.error('Калькулятор: не удалось загрузить цены', err);
            loading.innerHTML = '<p>⚠️ Не удалось загрузить цены. Позвоните: <a href="tel:+79030021883">+7 (903) 002-18-83</a>.</p>';
        });

    // ---- Инициализация ----
    function initCalculator() {

        // Вкладки
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

        // Инициализация толщин
        fillThickness('punch-thick', Object.keys(PRICES['пробивка']['калькулятор']['цены_метр']));
        updateLaserThickness();

        // Слушатели
        ['laser-mat', 'laser-thick', 'laser-len', 'laser-urgent',
         'punch-thick', 'punch-mode', 'punch-qty',
         'paint-area', 'paint-complex'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', recalc);
                el.addEventListener('change', recalc);
            }
        });

        // При смене материала лазера — перестроить толщины
        document.getElementById('laser-mat').addEventListener('change', updateLaserThickness);

        // Кнопка «Оформить заявку»
        var sendBtn = document.getElementById('calc-to-form');
        sendBtn.addEventListener('click', function () {
            var summary = buildSummary();
            if (!summary) return;
            var serviceSelect = document.getElementById('form-service');
            var messageField  = document.getElementById('form-message');

            // Установить услугу
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

            // Спросить, если message уже заполнено
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

        // Обновление sticky top
        updateStickyTop();
        window.addEventListener('resize', updateStickyTop);

        // Событие submit формы
        var form = document.getElementById('contactForm');
        if (form) {
            form.addEventListener('submit', function () {
                if (calcWasUsed) {
                    sendGoal('calc_form_submit');
                }
            });
        }

        recalc();
    }

    // ---- Обновление sticky top ----
    function updateStickyTop() {
        var header = document.querySelector('.header');
        if (!header) return;
        var h = header.offsetHeight + 20;
        document.documentElement.style.setProperty('--calc-sticky-top', h + 'px');
    }

    // ---- Динамический список толщин для лазера ----
    function updateLaserThickness() {
        var mat = document.getElementById('laser-mat').value;
        var cfg = PRICES['лазерная']['калькулятор'];
        var thickObj = cfg.цены[mat];
        if (!thickObj) return;
        var keys = Object.keys(thickObj).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
        fillThickness('laser-thick', keys);
    }

    // ---- Заполнение выпадающего списка ----
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

    // ---- Пересчёт ----
    function recalc() {
        if (!PRICES) return;
        if (currentService === 'лазерная')  calcLaser();
        if (currentService === 'пробивка')  calcPunch();
        if (currentService === 'покраска')  calcPaint();
    }

    // ---- ЛАЗЕРНАЯ РЕЗКА ----
    function calcLaser() {
        var cfg = PRICES['лазерная']['калькулятор'];
        var mat = document.getElementById('laser-mat').value;
        var thick = document.getElementById('laser-thick').value;
        var lenInput = document.getElementById('laser-len');
        var len = parseFloat(lenInput.value) || 0;
        var urgent = document.getElementById('laser-urgent').checked;

        // Проверка максимума
        if (len > cfg.максимум) {
            showOverMax('Для объёмов свыше ' + cfg.максимум.toLocaleString('ru-RU') + ' м свяжитесь с менеджером: +7 (903) 002-18-83.');
            return;
        }

        var pricePerMeter = (cfg.цены[mat] && cfg.цены[mat][thick]) ? cfg.цены[mat][thick] : null;

        if (pricePerMeter === null || len <= 0) {
            showEmpty();
            return;
        }

        var base = pricePerMeter * len;
        var discount = pickDiscount(cfg.скидки, len);
        var coef = urgent ? cfg.коэффициент_срочности : 1;
        var total = base * (1 - discount) * coef;
        var warning = '';
        if (total < cfg.минимум) {
            warning = 'Минимальная стоимость заказа — ' + cfg.минимум + ' ₽. Итоговая цена: ' + cfg.минимум + ' ₽.';
            total = cfg.минимум;
        }

        showResult({
            base: base,
            discount: discount > 0 ? '-' + (discount * 100).toFixed(0) + '%' : null,
            coef: urgent ? '×' + coef + ' (срочность)' : null,
            totalNovat: total,
            totalVat: total * (1 + cfg.ндс),
            warning: warning
        });
    }

    // ---- ПРОБИВКА ----
    function calcPunch() {
        var cfg = PRICES['пробивка']['калькулятор'];
        var thick = document.getElementById('punch-thick').value;
        var modeSel = document.getElementById('punch-mode');
        var mode = modeSel.value;
        var qty = parseInt(document.getElementById('punch-qty').value, 10) || 0;
        var hintEl = document.getElementById('punch-hint');

        // Толщина > 3 мм — режим "за удар" недоступен
        var isHitAvailable = cfg.цены_удар[thick] !== undefined;
        Array.from(modeSel.options).forEach(function (o) {
            if (o.value === 'удар') o.disabled = !isHitAvailable;
        });

        if (!isHitAvailable) {
            hintEl.style.display = 'block';
            hintEl.textContent = 'Для толщины свыше 3 мм расчёт за удар недоступен — только за метр реза.';
            if (mode === 'удар') {
                modeSel.value = 'метр';
                mode = 'метр';
            }
        } else {
            hintEl.style.display = 'none';
        }

        var base = 0;
        var discount = 0;
        var minimum = 0;
        var maximum = 0;

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
        var warning = '';
        if (minimum > 0 && total < minimum) {
            warning = 'Минимальная стоимость заказа — ' + minimum + ' ₽. Итоговая цена: ' + minimum + ' ₽.';
            total = minimum;
        }

        showResult({
            base: base,
            discount: discount > 0 ? '-' + (discount * 100).toFixed(0) + '%' : null,
            coef: null,
            totalNovat: total,
            totalVat: total * (1 + cfg.ндс),
            warning: warning
        });
    }

    // ---- ПОКРАСКА ----
    function calcPaint() {
        var cfg = PRICES['покраска']['калькулятор'];
        var area = parseFloat(document.getElementById('paint-area').value) || 0;
        var complex = document.getElementById('paint-complex').checked;

        if (area > cfg.максимум) {
            showOverMax('Для объёмов свыше ' + cfg.максимум.toLocaleString('ru-RU') + ' м² свяжитесь с менеджером: +7 (903) 002-18-83.');
            return;
        }

        if (area <= 0) { showEmpty(); return; }

        var pricePerM2 = null;
        for (var i = 0; i < cfg.цены.length; i++) {
            var r = cfg.цены[i];
            if (r.до === null || area <= r.до) {
                pricePerM2 = r.цена;
                break;
            }
        }
        if (pricePerM2 === null) { showEmpty(); return; }

        var base = pricePerM2 * area;
        var coef = complex ? cfg.коэффициент_сложности : 1;
        var total = base * coef;
        var warning = '';
        if (cfg.минимум > 0 && total < cfg.минимум) {
            warning = 'Минимальная стоимость заказа — ' + cfg.минимум + ' ₽.';
            total = cfg.минимум;
        }

        showResult({
            base: base,
            discount: null,
            coef: complex ? '×' + coef + ' (сложный профиль)' : null,
            totalNovat: total,
            totalVat: total * (1 + cfg.ндс),
            warning: warning
        });
    }

    // ---- Утилиты ----
    function pickDiscount(ranges, value) {
        for (var i = 0; i < ranges.length; i++) {
            var r = ranges[i];
            if (r.до === null || value <= r.до) return r.скидка;
        }
        return 0;
    }

    function fmt(n) {
        // Обычный пробел вместо \u00A0, чтобы не ломать копирование
        return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 }).replace(/\u00A0/g, ' ') + ' ₽';
    }

    function showEmpty() {
        document.getElementById('res-base').textContent = '— ₽';
        document.getElementById('res-total-novat').textContent = '— ₽';
        document.getElementById('res-total-vat').textContent = '— ₽';
        document.getElementById('row-discount').style.display = 'none';
        document.getElementById('row-coef').style.display = 'none';
        document.getElementById('res-warning').style.display = 'none';
        document.getElementById('calc-to-form').disabled = true;
    }

    function showOverMax(msg) {
        document.getElementById('res-base').textContent = '— ₽';
        document.getElementById('res-total-novat').textContent = '— ₽';
        document.getElementById('res-total-vat').textContent = '— ₽';
        document.getElementById('row-discount').style.display = 'none';
        document.getElementById('row-coef').style.display = 'none';
        var warn = document.getElementById('res-warning');
        warn.style.display = 'block';
        warn.textContent = '⚠️ ' + msg;
        document.getElementById('calc-to-form').disabled = true;
    }

    function showResult(r) {
        document.getElementById('res-base').textContent = fmt(r.base);
        document.getElementById('res-total-novat').textContent = fmt(r.totalNovat);
        document.getElementById('res-total-vat').textContent = fmt(r.totalVat);

        var rowDisc = document.getElementById('row-discount');
        if (r.discount) {
            rowDisc.style.display = 'flex';
            document.getElementById('res-discount').textContent = r.discount;
        } else {
            rowDisc.style.display = 'none';
        }

        var rowCoef = document.getElementById('row-coef');
        if (r.coef) {
            rowCoef.style.display = 'flex';
            document.getElementById('res-coef').textContent = r.coef;
        } else {
            rowCoef.style.display = 'none';
        }

        var warn = document.getElementById('res-warning');
        if (r.warning) {
            warn.style.display = 'block';
            warn.textContent = '⚠️ ' + r.warning;
        } else {
            warn.style.display = 'none';
        }

        document.getElementById('calc-to-form').disabled = false;

        // Цель: первый успешный расчёт
        if (!resultSent) {
            resultSent = true;
            sendGoal('calc_result');
        }
    }

    // ---- Сборка текста заявки ----
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

        if (currentService === 'лазерная') {
            lines.push('Материал: ' + document.getElementById('laser-mat').value);
            lines.push('Толщина: ' + document.getElementById('laser-thick').value + ' мм');
            lines.push('Длина реза: ' + document.getElementById('laser-len').value + ' м');
            if (document.getElementById('laser-urgent').checked) lines.push('Срочность: да');
        } else if (currentService === 'пробивка') {
            lines.push('Толщина: ' + document.getElementById('punch-thick').value + ' мм');
            lines.push('Режим: ' + (document.getElementById('punch-mode').value === 'удар' ? 'за удар' : 'за метр'));
            lines.push('Количество: ' + document.getElementById('punch-qty').value);
        } else if (currentService === 'покраска') {
            lines.push('Площадь: ' + document.getElementById('paint-area').value + ' м²');
            if (document.getElementById('paint-complex').checked) lines.push('Сложный профиль: да');
        }

        lines.push('Без НДС: ' + document.getElementById('res-total-novat').textContent);
        lines.push('С НДС: ' + document.getElementById('res-total-vat').textContent);
        lines.push('');
        lines.push('--- Прикрепите, пожалуйста, чертёж или эскиз ---');

        return lines.join('\n');
    }

});