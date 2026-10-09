async function askAIForAnswer(questionData, retries = 2) {
    for (let i = 0; i < retries; i++) {
        const result = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { type: "ASK_CEREBRAS", question: questionData },
                (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    if (!response || !response.success) {
                        resolve(null);
                        return;
                    }
                    try {
                        const parsed = JSON.parse(response.answer);
                        resolve(parsed);
                    } catch (e) {
                        resolve(null);
                    }
                }
            );
        });

        if (result !== null && result.choiceIndex !== undefined && result.choiceIndex >= 0) {
            return result;
        }

        await delay(1500);
    }
    return null;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let lastUserScrollIntent = 0;
["wheel", "touchmove", "keydown"].forEach(ev =>
    window.addEventListener(ev, () => { lastUserScrollIntent = Date.now(); }, { passive: true })
);

function captureScrollState() {
    const state = { winX: window.scrollX, winY: window.scrollY, containers: [] };
    document.querySelectorAll("*").forEach(el => {
        const canScrollY = /(auto|scroll)/.test(getComputedStyle(el).overflowY)
            && el.scrollHeight > el.clientHeight + 2;
        if (canScrollY) state.containers.push({ el, top: el.scrollTop });
    });
    return state;
}

function restoreScrollState(state) {
    window.scrollTo({ left: state.winX, top: state.winY, behavior: "instant" });
    state.containers.forEach(c => {
        const prev = c.el.style.scrollBehavior;
        c.el.style.scrollBehavior = "auto";
        c.el.scrollTop = c.top;
        c.el.style.scrollBehavior = prev;
    });
}

function clickWithScrollGuard(element, afterClick) {
    const snapshot = captureScrollState();
    const clickedAt = Date.now();

    if (element) element.click();
    if (afterClick) afterClick();

    const restore = () => {
        if (lastUserScrollIntent >= clickedAt) return;
        restoreScrollState(snapshot);
    };
    restore();
    requestAnimationFrame(restore);
    setTimeout(restore, 350);
}

let isBusy = false;

async function processFormsAutomatically() {
    if (isBusy) return;
    isBusy = true;

    await delay(600);

    const questionElements = document.querySelectorAll(
        'div[data-automation-id*="question"], div[role="listitem"], div.question-item'
    );

    for (const el of questionElements) {
        const questionTextEl = el.querySelector('[data-automation-id="QuestionTextContainer"]');
        let questionText = "";

        if (questionTextEl) {
            const spans = questionTextEl.querySelectorAll("span");
            for (const span of spans) {
                const txt = span.innerText.trim();
                if (txt.length > 3 && !txt.includes("(1 Point)") && !txt.includes("Point")) {
                    questionText = txt;
                    break;
                }
            }
        }

        if (!questionText) {
            const titleEls = el.querySelectorAll('span, div[class*="title"], div[data-automation-id*="question-title"]');
            for (const t of titleEls) {
                const txt = t.innerText.trim();
                if (txt.length > 3 && !txt.includes("(1 Point)") && !txt.includes("Point")) {
                    questionText = txt;
                    break;
                }
            }
        }

        if (!questionText) {
            questionText = el.innerText.split('\n')[0] || "Question";
        }

        const options = el.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (options.length === 0) continue;

        const choices = [];
        const inputs = [];

        options.forEach(input => {
            const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`) || input.parentElement;
            if (label) {
                const text = label.innerText.trim();
                if (text && !choices.includes(text)) {
                    choices.push(text);
                    inputs.push({ inputElement: input, labelElement: label });
                }
            }
        });

        if (choices.length === 0) continue;

        const aiResult = await askAIForAnswer({ question: questionText, choices });

        if (aiResult && aiResult.choiceIndex !== undefined && aiResult.choiceIndex >= 0 && aiResult.choiceIndex < inputs.length) {
            const target = inputs[aiResult.choiceIndex];

            const clickEl = target.labelElement || target.inputElement;
            clickWithScrollGuard(clickEl, () => {
                if (!target.labelElement && target.inputElement) {
                    target.inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        await delay(1200);
    }
    isBusy = false;
}

if (!window.__aiFillReady) {
    window.__aiFillReady = true;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.type === "START_FILL") {
            if (isBusy) {
                sendResponse({ ok: true, busy: true });
                return false;
            }
            processFormsAutomatically();
            sendResponse({ ok: true });
            return false;
        }
        return false;
    });
}