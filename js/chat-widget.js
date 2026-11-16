document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('ai_enabled') === 'false') return;
    if (document.body.dataset.aiDisabled === 'true') return;

    const PHONE = '+7 (939) 440-40-01';
    const FALLBACK = `Олег ушёл на обед. Позвоните: ${PHONE} или оставьте заявку: https://tochtex.ru/index.html#contact`;
    const WELCOME = 'Здравствуйте! Я Олег, инженер-технолог. Задайте вопрос по металлообработке или телеком-шкафам.';

    const widgetHTML = `
        <div id="ai-widget-container">
            <button id="ai-chat-btn" title="Задать вопрос ИИ-технологу">
                <span style="font-size:24px;margin-right:8px;">🤖</span>
                <span>Задать вопрос ИИ</span>
            </button>
            <div id="ai-chat-window" class="hidden">
                <div class="ai-chat-header">
                    <div>
                        <strong>Инженер-технолог Олег</strong>
                        <small>ИИ-консультант (Beta)</small>
                    </div>
                    <div class="ai-chat-header-actions">
                        <button id="ai-chat-clear" title="Очистить чат">🗑</button>
                        <button id="ai-chat-close" title="Закрыть">✖</button>
                    </div>
                </div>
                <div id="ai-chat-messages">
                    <div class="ai-msg bot">${WELCOME}</div>
                </div>
                <div id="ai-chat-input-area">
                    <input type="text" id="ai-chat-input" placeholder="Ваш вопрос..." autocomplete="off" maxlength="2000">
                    <button id="ai-chat-send" title="Отправить">➤</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const btn        = document.getElementById('ai-chat-btn');
    const win        = document.getElementById('ai-chat-window');
    const closeBtn   = document.getElementById('ai-chat-close');
    const clearBtn   = document.getElementById('ai-chat-clear');
    const input      = document.getElementById('ai-chat-input');
    const sendBtn    = document.getElementById('ai-chat-send');
    const messagesBox = document.getElementById('ai-chat-messages');

    let isCaptchaMode  = false;
    let pendingQuestion = null;

    btn.addEventListener('click', () => {
        win.classList.toggle('hidden');
        if (!win.classList.contains('hidden')) input.focus();
    });
    closeBtn.addEventListener('click', () => win.classList.add('hidden'));

    clearBtn.addEventListener('click', async () => {
        if (!confirm('Очистить историю чата?')) return;
        messagesBox.innerHTML = '';
        addMessage(WELCOME, 'bot');
        isCaptchaMode  = false;
        pendingQuestion = null;
        try {
            await fetch('/api/ai-proxy.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ action: 'clear' })
            });
        } catch (_) { /* молча */ }
    });

    function addMessage(text, role) {
        const div = document.createElement('div');
        div.className = 'ai-msg ' + role;
        div.textContent = text;
        messagesBox.appendChild(div);
        messagesBox.scrollTop = messagesBox.scrollHeight;
        return div;
    }

    function setBusy(busy) {
        input.disabled = busy;
        sendBtn.disabled = busy;
        if (!busy) input.focus();
    }

    async function callApi(payload) {
        const res = await fetch('/api/ai-proxy.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify(payload)
        });
        let data = null;
        try { data = await res.json(); } catch (_) {}
        if (!data) throw new Error('HTTP ' + res.status);
        return data;
    }

    async function sendMessage() {
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        setBusy(true);

        if (!isCaptchaMode) addMessage(text, 'user');

        const botBubble = addMessage('', 'bot');
        botBubble.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>';

        try {
            const payload = isCaptchaMode
                ? { message: pendingQuestion || '', captcha_answer: text }
                : { message: text };

            const data = await callApi(payload);

            if (data.captcha_required) {
                botBubble.textContent = '🛡️ ' + (data.question || 'Введите ответ');
                if (data.error) botBubble.textContent += ' (' + data.error + ')';
                botBubble.style.color = 'var(--accent)';
                isCaptchaMode = true;
                if (pendingQuestion === null) pendingQuestion = text;
            } else if (data.reply) {
                botBubble.textContent = data.reply;
                botBubble.style.color = '';
                isCaptchaMode = false;
                pendingQuestion = null;
            } else {
                botBubble.textContent = FALLBACK;
                botBubble.style.color = '#b00';
                isCaptchaMode = false;
                pendingQuestion = null;
            }
        } catch (error) {
            console.error('[AI widget]', error);
            botBubble.textContent = FALLBACK;
            botBubble.style.color = '#b00';
            isCaptchaMode = false;
            pendingQuestion = null;
        } finally {
            setBusy(false);
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
});