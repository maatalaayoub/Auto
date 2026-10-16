<<<<<<< HEAD
const MODEL = "gpt-oss-120b";
const API_KEY = "csk-9ntynen6djwc8w5h49dxtmdn4nejk58vndhynkhfjffpwtwp";
const API_URL = "https://api.cerebras.ai/v1/chat/completions";

const TAG = "[AI-Fill]";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildSystemPrompt(multiple) {
    if (multiple) {
        return (
            "You are a quiz solver. The question may have MORE THAN ONE correct choice. " +
            "Output ONLY a valid JSON object like {\"choiceIndexes\": [0, 2]} " +
            "containing the 0-based indexes of ALL correct choices."
        );
    }
    return (
        "You are a quiz solver. Output ONLY a valid JSON object like {\"choiceIndexes\": [0]} " +
        "containing the 0-based index of the single correct choice."
    );
}

async function callCerebras(question, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: "system", content: buildSystemPrompt(!!question.multiple) },
                    {
                        role: "user",
                        content: JSON.stringify({ question: question.question, choices: question.choices })
                    }
                ],
                temperature: 0.0,
                max_tokens: 4096,
                reasoning_effort: "low"
            })
        });

        // Rate limit / temporary server errors -> exponential backoff
        if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const wait = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
            console.warn(TAG, `HTTP ${response.status}, retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
            await sleep(wait);
            continue;
        }

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error?.message || `Cerebras HTTP ${response.status}`);
        }

        const answer = data.choices?.[0]?.message?.content;
        if (!answer) {
            const fr = data.choices?.[0]?.finish_reason;
            throw new Error(
                `Empty answer from model (finish_reason: ${fr ?? "unknown"}, ` +
                `completion_tokens: ${data.usage?.completion_tokens ?? "?"})`
            );
        }

        const jsonMatch = answer.match(/\{[\s\S]*?\}/);
        return jsonMatch ? jsonMatch[0] : answer;
    }
    throw new Error("Max retries reached");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "ASK_CEREBRAS") {
        return;
    }

    callCerebras(message.question)
        .then((answer) => sendResponse({ success: true, answer }))
        .catch((err) => {
            console.error(TAG, "Cerebras error:", err);
            sendResponse({ success: false, error: err.message });
        });

    return true;
});

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || tab.id == null) return;

    try {
        await chrome.tabs.sendMessage(tab.id, { type: "START_FILL" });
    } catch (e) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content.js"]
            });
            await chrome.tabs.sendMessage(tab.id, { type: "START_FILL" });
        } catch (e2) {
            console.error(TAG, "Could not inject content script:", e2);
        }
    }
});
=======
const MODEL = "gpt-oss-120b";
const API_KEY = "csk-9ntynen6djwc8w5h49dxtmdn4nejk58vndhynkhfjffpwtwp";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "ASK_CEREBRAS") {
        return;
    }

    (async () => {
        const response = await fetch(
            "https://api.cerebras.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        {
                            role: "system",
                            content: "You are a quiz solver. Output ONLY a valid JSON object: {\"choiceIndex\": 0}. Use the 0-based index of the correct choice."
                        },
                        {
                            role: "user",
                            content: JSON.stringify(message.question)
                        }
                    ],
                    temperature: 0.0,
                    max_tokens: 4096,
                    reasoning_effort: "low"
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error?.message || `Cerebras HTTP ${response.status}`);
        }

        let answer = data.choices?.[0]?.message?.content;
        if (!answer) {
            const fr = data.choices?.[0]?.finish_reason;
            throw new Error(
                `Empty answer from model (finish_reason: ${fr ?? "unknown"}, ` +
                `completion_tokens: ${data.usage?.completion_tokens ?? "?"}). Increase max_tokens.`
            );
        }

        const jsonMatch = answer.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            answer = jsonMatch[0];
        }

        sendResponse({
            success: true,
            answer
        });
    })().catch(error => {
        sendResponse({
            success: false,
            error: error.message
        });
    });

    return true;
});

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab || tab.id == null) return;

    try {
        await chrome.tabs.sendMessage(tab.id, { type: "START_FILL" });
    } catch (e) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ["content.js"]
            });
            await chrome.tabs.sendMessage(tab.id, { type: "START_FILL" });
        } catch (e2) {}
    }
});
>>>>>>> origin/main
