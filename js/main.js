// ===== ГЛАВНЫЙ МОДУЛЬ САЙТА =====
document.addEventListener('DOMContentLoaded', function() {

    // ==== 1. ОБРАБОТЧИК ДЛЯ БЫСТРЫХ КНОПОК (С ПРОВЕРКОЙ) ====
    const quickNavBtns = document.querySelectorAll('.quick-nav-btn');
    const pricesSection = document.getElementById('prices');

    quickNavBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            quickNavBtns.forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');

            const service = this.dataset.service;
            if (service) {
                switchPriceTab(service);
            }

            if (pricesSection) {
                setTimeout(function() {
                    pricesSection.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        });
    });

    // ==== 2. ЗАГРУЗКА ПРАЙС-ЛИСТА ====
    const priceLoader = document.getElementById('price-loader');
    if (priceLoader) {
        // Проверяем URL-параметр ?tab=<slug>
        var urlParams = new URLSearchParams(window.location.search);
        var initialTab = urlParams.get('tab') || 'лазерная';
        switchPriceTab(initialTab);

        fetch('data/prices.json')
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Ошибка загрузки: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                renderPrices(data);
                updatePriceDate();
                // Повторно применяем вкладку после рендера (элементы только что созданы)
                switchPriceTab(initialTab);
            })
            .catch(function(error) {
                console.error('Ошибка загрузки прайс-листа:', error);
                if (priceLoader) {
                    priceLoader.innerHTML =
                        '<p style="color: #999;">⚠️ Не удалось загрузить прайс-лист. <br> <a href="index.html#contact" style="color: #FF6B00;">Пожалуйста, оставьте заявку</a> — мы рассчитаем индивидуально.</p>';
                }
            });
    }

    // ==== 3. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ЦЕН ====
    const tabBtns = document.querySelectorAll('.price-tab-btn');
    if (tabBtns.length > 0) {
        tabBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tabId = this.dataset.tab;
                switchPriceTab(tabId);
            });
        });
    }

    // ==== 4. МАСКА ДЛЯ ТЕЛЕФОНА ====
    document.querySelectorAll('input[type="tel"]').forEach(function(input) {
        input.addEventListener('input', function(e) {
            var value = this.value.replace(/\D/g, '');
            if (value.length > 11) value = value.slice(0, 11);
            var formatted = '';
            if (value.length > 0) {
                formatted = '+7';
                if (value.length > 1) {
                    formatted += ' (' + value.slice(1, 4);
                }
                if (value.length > 4) {
                    formatted += ') ' + value.slice(4, 7);
                }
                if (value.length > 7) {
                    formatted += '-' + value.slice(7, 9);
                }
                if (value.length > 9) {
                    formatted += '-' + value.slice(9, 11);
                }
            }
            this.value = formatted;
        });
    });

    // ==== 5. ПЛАВНЫЙ СКРОЛЛ ====
    document.querySelectorAll('a[href^="#"]:not(.quick-nav-btn)').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var href = this.getAttribute('href');
            if (href === '#') return;
            e.preventDefault();
            var target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    // ==== 6. ВАЛИДАЦИЯ ФОРМЫ ====
    var form = document.getElementById('contactForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            var name = this.querySelector('input[name="name"]');
            var phone = this.querySelector('input[name="phone"]');
            if (!name.value.trim() || !phone.value.trim()) {
                e.preventDefault();
                alert('Пожалуйста, заполните имя и телефон.');
                return false;
            }
        });
    }
});

// ===== ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ЦЕН =====
function switchPriceTab(tabId) {
    const quickBtns = document.querySelectorAll('.quick-nav-btn');
    quickBtns.forEach(function(t) {
        t.classList.remove('active');
        t.style.background = 'rgba(255,255,255,0.08)';
    });
    quickBtns.forEach(function(t) {
        if (t.dataset.service === tabId) {
            t.classList.add('active');
            t.style.background = 'var(--accent)';
        }
    });

    const tabBtns = document.querySelectorAll('.price-tab-btn');
    tabBtns.forEach(function(t) {
        t.style.background = 'var(--primary)';
        t.style.color = 'var(--white)';
    });
    tabBtns.forEach(function(t) {
        if (t.dataset.tab === tabId) {
            t.style.background = 'var(--accent)';
            t.style.color = 'var(--white)';
        }
    });

    const allWraps = document.querySelectorAll('.price-table-wrap');
    allWraps.forEach(function(wrap) {
        wrap.style.display = 'none';
    });
    var target = document.getElementById('price-table-' + tabId);
    if (target) {
        target.style.display = 'block';
    } else {
        console.warn('Панель не найдена: price-table-' + tabId);
    }
}

// ===== ОТРИСОВКА ТАБЛИЦ ЦЕН =====
function renderPrices(data) {
    var container = document.getElementById('price-loader');
    if (!container) return;

    container.innerHTML = '';
    var allServices = [
        'лазерная', 'пробивка', 'покраска', 'прессформы', 'гибка', 'сварка', 'гальваника',
        'токарка', 'фрезерка', 'шлифовка', 'электроэрозионная', 'чпу',
        'сборочная_чпу', 'сборка_кондиционеров', 'сборка_жгутов',
        'литьё_пластмасс', 'электромонтаж'
    ];

    allServices.forEach(function(serviceKey) {
        var service = data[serviceKey];
        if (!service) return;

        // Определяем колонки и строки
        var cols, rows;
        if (service.калькулятор) {
            var gen = generateRowsFromCalc(serviceKey, service.калькулятор);
            cols = gen.cols;
            rows = gen.rows;
        } else if (service.колонки && service.строки) {
            cols = service.колонки;
            rows = service.строки.map(function (row) { return Object.values(row); });
        } else {
            return;
        }

        var wrap = document.createElement('div');
        wrap.className = 'price-table-wrap';
        wrap.id = 'price-table-' + serviceKey;
        if (serviceKey !== 'лазерная') {
            wrap.style.display = 'none';
        }

        var html = '';
        html += '<h3 style="margin-bottom: 12px;">' + service.название + '</h3>';
        html += '<p style="margin-bottom: 20px; color: var(--gray-dark);">' + service.описание + '</p>';
        html += '<div style="overflow-x: auto; background: var(--white); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 20px;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 15px;">';
        html += '<thead><tr style="background: var(--primary); color: var(--white);">';
        cols.forEach(function (col) {
            html += '<th style="padding: 14px 16px; text-align: left; font-weight: 600;">' + col + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody>';
        rows.forEach(function (row) {
            html += '<tr style="border-bottom: 1px solid #eee;">';
            row.forEach(function (val, idx) {
                // Подсветка числовых значений (кроме первой колонки — там параметры)
                var isPrice = idx > 0 && /^\d+(\.\d+)?$/.test(String(val));
                html += '<td style="padding: 12px 16px;' + (isPrice ? ' font-weight: 600; color: var(--accent);' : '') + '">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top: 16px; padding: 16px 20px; background: #fef9f0; border-left: 4px solid var(--accent); border-radius: 4px; font-size: 14px; color: var(--gray-dark);">' + service.примечание + '</div>';

        wrap.innerHTML = html;
        container.appendChild(wrap);
    });
}

// ===== ГЕНЕРАЦИЯ СТРОК ИЗ БЛОКА "КАЛЬКУЛЯТОР" =====
function generateRowsFromCalc(serviceKey, calc) {
    var cols = [];
    var rows = [];

    if (serviceKey === 'лазерная') {
        cols = ['Толщина, мм', 'Сталь / Оцинковка', 'Нержавейка', 'Алюминий'];
        var allThick = {};
        ['сталь', 'нержавейка', 'алюминий'].forEach(function (mat) {
            if (calc.цены[mat]) {
                Object.keys(calc.цены[mat]).forEach(function (t) { allThick[t] = true; });
            }
        });
        var sorted = Object.keys(allThick).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
        sorted.forEach(function (t) {
            var row = [t];
            ['сталь', 'нержавейка', 'алюминий'].forEach(function (mat) {
                row.push(calc.цены[mat] && calc.цены[mat][t] !== undefined ? calc.цены[mat][t].toString() : '—');
            });
            rows.push(row);
        });
    } else if (serviceKey === 'пробивка') {
        cols = ['Толщина, мм', 'За удар (без НДС), ₽', 'За метр (без НДС), ₽'];
        var allThick2 = {};
        Object.keys(calc.цены_удар).forEach(function (t) { allThick2[t] = true; });
        Object.keys(calc.цены_метр).forEach(function (t) { allThick2[t] = true; });
        var sorted2 = Object.keys(allThick2).sort(function (a, b) { return parseFloat(a) - parseFloat(b); });
        sorted2.forEach(function (t) {
            var u = calc.цены_удар[t] !== undefined ? calc.цены_удар[t].toString() : '—';
            var m = calc.цены_метр[t] !== undefined ? calc.цены_метр[t].toString() : '—';
            rows.push([t, u, m]);
        });
    } else if (serviceKey === 'покраска') {
        cols = ['Объём заказа, м²', 'Цена, ₽/м²'];
        var prev = 0;
        calc.цены.forEach(function (r) {
            var label;
            if (r.до === null) {
                label = 'более ' + prev;
            } else if (prev === 0) {
                label = 'до ' + r.до;
            } else {
                label = prev + '–' + r.до;
            }
            rows.push([label, r.цена.toString()]);
            if (r.до !== null) prev = r.до;
        });
    }

    return { cols: cols, rows: rows };
}

// ===== ОБНОВЛЕНИЕ ДАТЫ ПРАЙСА =====
function updatePriceDate() {
    var el = document.getElementById('price-date');
    if (el) {
        var now = new Date();
        var options = { day: 'numeric', month: 'long', year: 'numeric' };
        el.textContent = now.toLocaleDateString('ru-RU', options);
    }
}