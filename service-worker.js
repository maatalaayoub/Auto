const MODEL = "gpt-oss-120b";
const API_KEY = "csk-fpthxwpj94yw3d239jjprk4ehtxxy6m2nvcvmcn9xwxcr968";

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