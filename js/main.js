document.addEventListener('DOMContentLoaded', function() {

    // ===== ЗАГРУЗКА ПРАЙС-ЛИСТА =====
    var priceLoader = document.getElementById('price-loader');
    if (priceLoader) {
        // ПРАВИЛЬНЫЙ ПУТЬ: поднимаемся на уровень выше из папки js/
        fetch('../data/prices.json')
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
                if (priceLoader) {
                    priceLoader.innerHTML = '<p style="color: #999;">⚠️ Не удалось загрузить прайс-лист. <br> <a href="#contact" style="color: #FF6B00;">Пожалуйста, оставьте заявку</a> — мы рассчитаем индивидуально.</p>';
                }
            });
    }

    // ===== МАСКА ДЛЯ ТЕЛЕФОНА =====
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

    // ===== ПЛАВНЫЙ СКРОЛЛ =====
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
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

    // ===== ВАЛИДАЦИЯ ФОРМЫ =====
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

// ===== ОТРИСОВКА ТАБЛИЦ ЦЕН =====
function renderPrices(data) {
    var container = document.getElementById('price-loader');
    if (!container) return;

    container.innerHTML = '';

    // ---- Лазерная резка ----
    var laser = data.лазерная;
    if (laser) {
        var wrap = document.createElement('div');
        wrap.className = 'price-table-wrap';
        wrap.id = 'price-table-лазерная';

        var html = '';
        html += '<h3 style="margin-bottom: 12px;">' + laser.название + '</h3>';
        html += '<p style="margin-bottom: 20px; color: var(--gray-dark);">' + laser.описание + '</p>';
        html += '<div style="overflow-x: auto; background: var(--white); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 20px;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 15px;">';
        html += '<thead><tr style="background: var(--primary); color: var(--white);">';
        laser.колонки.forEach(function(col) {
            html += '<th style="padding: 14px 16px; text-align: left; font-weight: 600;">' + col + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody>';
        laser.строки.forEach(function(row) {
            html += '<tr style="border-bottom: 1px solid #eee;">';
            Object.values(row).forEach(function(val) {
                var isPrice = !isNaN(parseFloat(val)) && val.toString().includes('.');
                html += '<td style="padding: 12px 16px;' + (isPrice ? ' font-weight: 600; color: var(--accent);' : '') + '">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top: 16px; padding: 16px 20px; background: #fef9f0; border-left: 4px solid var(--accent); border-radius: 4px; font-size: 14px; color: var(--gray-dark);">' + laser.примечание + '</div>';

        wrap.innerHTML = html;
        container.appendChild(wrap);
    }

    // ---- Координатная пробивка ----
    var punching = data.пробивка;
    if (punching) {
        var wrap = document.createElement('div');
        wrap.className = 'price-table-wrap';
        wrap.id = 'price-table-пробивка';

        var html = '';
        html += '<h3 style="margin-bottom: 12px;">' + punching.название + '</h3>';
        html += '<p style="margin-bottom: 20px; color: var(--gray-dark);">' + punching.описание + '</p>';
        html += '<div style="overflow-x: auto; background: var(--white); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 20px;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 15px;">';
        html += '<thead><tr style="background: var(--primary); color: var(--white);">';
        punching.колонки.forEach(function(col) {
            html += '<th style="padding: 14px 16px; text-align: left; font-weight: 600;">' + col + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody>';
        punching.строки.forEach(function(row) {
            html += '<tr style="border-bottom: 1px solid #eee;">';
            Object.values(row).forEach(function(val) {
                var isPrice = !isNaN(parseFloat(val)) && val.toString().includes('.');
                html += '<td style="padding: 12px 16px;' + (isPrice ? ' font-weight: 600; color: var(--accent);' : '') + '">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top: 16px; padding: 16px 20px; background: #fef9f0; border-left: 4px solid var(--accent); border-radius: 4px; font-size: 14px; color: var(--gray-dark);">' + punching.примечание + '</div>';

        wrap.innerHTML = html;
        container.appendChild(wrap);
    }

    // ---- Порошковая окраска ----
    var painting = data.покраска;
    if (painting) {
        var wrap = document.createElement('div');
        wrap.className = 'price-table-wrap';
        wrap.id = 'price-table-покраска';

        var html = '';
        html += '<h3 style="margin-bottom: 12px;">' + painting.название + '</h3>';
        html += '<p style="margin-bottom: 20px; color: var(--gray-dark);">' + painting.описание + '</p>';
        html += '<div style="overflow-x: auto; background: var(--white); border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); padding: 20px;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 15px;">';
        html += '<thead><tr style="background: var(--primary); color: var(--white);">';
        painting.колонки.forEach(function(col) {
            html += '<th style="padding: 14px 16px; text-align: left; font-weight: 600;">' + col + '</th>';
        });
        html += '</tr></thead>';
        html += '<tbody>';
        painting.строки.forEach(function(row) {
            html += '<tr style="border-bottom: 1px solid #eee;">';
            Object.values(row).forEach(function(val) {
                var isPrice = !isNaN(parseFloat(val)) && val.toString().includes('.');
                html += '<td style="padding: 12px 16px;' + (isPrice ? ' font-weight: 600; color: var(--accent);' : '') + '">' + val + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<div style="margin-top: 16px; padding: 16px 20px; background: #fef9f0; border-left: 4px solid var(--accent); border-radius: 4px; font-size: 14px; color: var(--gray-dark);">' + painting.примечание + '</div>';

        wrap.innerHTML = html;
        container.appendChild(wrap);
    }
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