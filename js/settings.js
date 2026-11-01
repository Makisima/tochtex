document.addEventListener('DOMContentLoaded', function() {
    const themeSelect = document.getElementById('themeSelect');
    const aiToggle = document.getElementById('aiToggle');
    const saveStatus = document.getElementById('saveStatus');

    // Защита от ошибок, если элементы не найдены на странице
    if (!themeSelect || !aiToggle || !saveStatus) return;

    // 1. Устанавливаем текущие значения в интерфейсе при загрузке
    const savedTheme = localStorage.getItem('site_theme') || 'theme-hightech';
    const savedAI = localStorage.getItem('ai_enabled') !== 'false';
    
    themeSelect.value = savedTheme;
    aiToggle.checked = savedAI;

    // Функция для показа уведомления о сохранении
    function showToast() {
        saveStatus.style.display = 'block';
        setTimeout(() => { saveStatus.style.display = 'none'; }, 2000);
    }

    // 2. Мгновенное применение и сохранение темы
    themeSelect.addEventListener('change', function(e) {
        const selected = e.target.value;
        localStorage.setItem('site_theme', selected);
        
        // ВАЖНО: Меняем атрибут у корневого тега <html> (document.documentElement)
        if (selected === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', selected);
        }
        showToast();
    });

    // 3. Мгновенное сохранение настроек ИИ
    aiToggle.addEventListener('change', function(e) {
        const isEnabled = e.target.checked;
        localStorage.setItem('ai_enabled', isEnabled);
        
        // ВАЖНО: Управляем атрибутом, который скрывает виджет через CSS
        if (isEnabled) {
            document.documentElement.removeAttribute('data-ai-disabled');
        } else {
            document.documentElement.setAttribute('data-ai-disabled', 'true');
        }
        showToast();
    });
});