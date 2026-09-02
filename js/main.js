// ===== ГЛАВНЫЙ МОДУЛЬ САЙТА =====
document.addEventListener('DOMContentLoaded', function() {

    // ==== 1. ОБРАБОТЧИК ДЛЯ БЫСТРЫХ КНОПОК (С ПРОВЕРКОЙ) ====
    const quickNavBtns = document.querySelectorAll('.quick-nav-btn');
    const pricesSection = document.getElementById('prices'); // Проверяем наличие блока цен

    quickNavBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            // Убираем активный класс у всех кнопок
            quickNavBtns.forEach(function(b) { b.classList.remove('active'); });
            this.classList.add('active');

            const service = this.dataset.service;
            if (service) {
                switchPriceTab(service);
            }

            // *** ГЛАВНОЕ ИСПРАВЛЕНИЕ: скроллим ТОЛЬКО если блок цен существует ***
            if (pricesSection) {
                setTimeout(function() {
                    pricesSection.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
            // Если блока нет — ничего не делаем, просто переключаем вкладку (если есть)
        });
    });

    // ==== 2. ЗАГРУЗКА ПРАЙС-ЛИСТА (ТОЛЬКО НА ГЛАВНОЙ) ====
    const priceLoader = document.getElementById('price-loader');
    if (priceLoader) {
        // Только если есть элемент для загрузки цен — запускаем загрузку
        switchPriceTab('лазерная');

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
            })
            .catch(function(error) {
                console.error('Ошибка загрузки прайс-листа:', error);
                // Безопасно показываем сообщение об ошибке
                if (priceLoader) {
                    priceLoader.innerHTML = 
                        '<p style="color: #999;">⚠️ Не удалось загрузить прайс-лист. <br> <a href="index.html#contact" style="color: #FF6B00;">Пожалуйста, оставьте заявку</a> — мы рассчитаем индивидуально.</p>';
                }
            });
    }

    // ==== 3. ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ЦЕН (ТОЛЬКО ЕСЛИ ОНИ ЕСТЬ) ====
    const tabBtns = document.querySelectorAll('.price-tab-btn');
    if (tabBtns.length > 0) {
        tabBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var tabId = this.dataset.tab;
                switchPriceTab(tabId);
            });
        });
    }

    // ==== 4. МАСКА ДЛЯ ТЕЛЕФОНА (РАБОТАЕТ ВСЕГДА) ====
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

    // ==== 5. ПЛАВНЫЙ СКРОЛЛ ДЛЯ ОБЫЧНЫХ ССЫЛОК ====
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

// ===== ФУНКЦИИ (ОСТАЛИСЬ БЕЗ ИЗМЕНЕНИЙ) =====

function switchPriceTab(tabId) {
    // Работаем только если есть кнопки и таблицы
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
    }
}

function renderPrices(data) {
    var container = document.getElementById('price-loader');
    if (!container) return; // Безопасный выход

    container.innerHTML = '';
    var allServices = [
        'лазерная', 'пробивка', 'покраска', 'прессформы', 'гибка', 'сварка', 'гальваника',
        'токарка', 'фрезерка', 'шлифовка', 'электроэрозионная', 'чпу',
        'сборка_жгутов', 'литьё_пластмасс', 'сборка_кондиционеров', 'электромонтаж'
    ];

    allServices.forEach(function(serviceKey) {
        var service = data[serviceKey];
        if (!service) return;

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
        service.колонки.forEach(function(col) {
            html += '<th style="padding: 14px 16px; text-align: left; font-weight: 600;">' + col + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody>';
        service.строки.forEach(function(row) {
            html += '<tr style="border-bottom: 1px solid #eee;">';
            Object.values(row).forEach(function(val) {
                var isPrice = !isNaN(parseFloat(val)) && val.toString().includes('.');
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

function updatePriceDate() {
    var el = document.getElementById('price-date');
    if (el) {
        var now = new Date();
        var options = { day: 'numeric', month: 'long', year: 'numeric' };
        el.textContent = now.toLocaleDateString('ru-RU', options);
    }
}