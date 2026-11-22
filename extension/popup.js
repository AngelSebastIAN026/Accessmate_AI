document.addEventListener("DOMContentLoaded", async () => {
    const chatMessages = document.getElementById("chatMessages");
    const questionInput = document.getElementById("question");
    const sendButton = document.getElementById("sendButton");
    const clearButton = document.getElementById("clearButton");
    const pageStatus = document.getElementById("pageStatus");

    let conversation = [];
    let isSending = false;
    let storageKey = null;
    let currentTabId = null;

      
        
    function escapeHTML(text) {
       return text.replace(/[&<>"']/g, char => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
    })[char]);
}

    function formatInline(text) {
     let safe = escapeHTML(text);

    // Inline code
    safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold
    safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__(.*?)__/g, "<strong>$1</strong>");

    // Italic
    safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");

    return safe;
}

    function renderMarkdown(text, container) {
       const lines = text.split("\n");

       let paragraph = [];
       let list = null;
       let codeMode = false;
       let codeLines = [];

    function flushParagraph() {
        if (paragraph.length > 0) {
            const p = document.createElement("p");
            p.innerHTML = formatInline(paragraph.join(" "));
            container.appendChild(p);
            paragraph = [];
        }
    }

    function flushList() {
        if (list) {
            container.appendChild(list);
            list = null;
        }
    }

    function flushCode() {
        const pre = document.createElement("pre");
        const code = document.createElement("code");

        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);

        codeLines = [];
    }

    for (const line of lines) {
        const trimmed = line.trim();

        // Fenced code blocks
        if (trimmed.startsWith("```")) {
            flushParagraph();
            flushList();

            if (codeMode) {
                flushCode();
                codeMode = false;
            } else {
                codeMode = true;
            }

            continue;
        }

        if (codeMode) {
            codeLines.push(line);
            continue;
        }

        // Empty lines
        if (!trimmed) {
            flushParagraph();
            flushList();
            continue;
        }

        // Headings
        const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);

        if (heading) {
            flushParagraph();
            flushList();

            const h = document.createElement(
                `h${heading[1].length}`
            );

            h.innerHTML = formatInline(heading[2]);
            container.appendChild(h);
            continue;
        }

        // Ordered lists: 1. 2. 3. or I. II. III.
        const ordered = trimmed.match(
            /^(?:(\d+)|([IVXLCDM]+))[.)]\s+(.+)$/i
        );

        if (ordered) {
            flushParagraph();

            if (!list || list.tagName !== "OL") {
                flushList();
                list = document.createElement("ol");
            }

            const li = document.createElement("li");
            li.innerHTML = formatInline(ordered[3]);
            list.appendChild(li);
            continue;
        }

        // Bullet lists
        const bullet = trimmed.match(/^[-*•]\s+(.+)$/);

        if (bullet) {
            flushParagraph();

            if (!list || list.tagName !== "UL") {
                flushList();
                list = document.createElement("ul");
            }

            const li = document.createElement("li");
            li.innerHTML = formatInline(bullet[1]);
            list.appendChild(li);
            continue;
        }

        flushList();
        paragraph.push(trimmed);
    }

    flushParagraph();
    flushList();

    if (codeMode) {
        flushCode();
    }
}

   function addMessage(text, role) {
      const message = document.createElement("div");
      message.className = `message ${role}`;

      if (role === "assistant") {
         renderMarkdown(text, message);
    } else {
        message.textContent = text;
    }

      chatMessages.appendChild(message);
      chatMessages.scrollTop = chatMessages.scrollHeight;

    return message;
}

    

    function getWebsiteStorageKey(url) {
        try {
            const parsedUrl = new URL(url);

            
            const hostname = parsedUrl.hostname.replace(/^www\./, "");

            return `accessmate_chat_${hostname}`;
        } catch {
            return null;
        }
    }

    async function initializeWebsiteChat() {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true
        });

        if (!tab || !tab.id || !tab.url) {
            pageStatus.textContent = "● Website unavailable";
            addMessage(
                "Open a regular webpage to start chatting with AccessMate.",
                "system"
            );
            sendButton.disabled = true;
            return;
        }

        currentTabId = tab.id;
        storageKey = getWebsiteStorageKey(tab.url);

        if (!storageKey) {
            pageStatus.textContent = "● Website unavailable";
            addMessage(
                "AccessMate cannot read this browser page. Please open a regular website.",
                "system"
            );
            sendButton.disabled = true;
            return;
        }

        const savedData = await chrome.storage.local.get(storageKey);
        conversation = savedData[storageKey] || [];

        chatMessages.innerHTML = "";

        if (conversation.length > 0) {
            conversation.forEach(message => {
                addMessage(
                    message.content,
                    message.role === "user" ? "user" : "assistant"
                );
            });
        } else {
            addMessage(
                "Hi! Ask me anything about this webpage.",
                "assistant"
            );
        }

        pageStatus.textContent = `● Chat for ${new URL(tab.url).hostname}`;
    }

    async function saveConversation() {
        if (!storageKey) {
            return;
        }

        await chrome.storage.local.set({
            [storageKey]: conversation
        });
    }

    async function readCurrentPage() {
        if (!currentTabId) {
            return "";
        }

        const results = await chrome.scripting.executeScript({
            target: { tabId: currentTabId },
            func: () => {
                function isVisible(element) {
                    const style = window.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();

                    return (
                        style.display !== "none" &&
                        style.visibility !== "hidden" &&
                        rect.width > 0 &&
                        rect.height > 0
                    );
                }

                function cleanText(text) {
                    return (text || "").replace(/\s+/g, " ").trim();
                }

                const pageTitle = document.title || "";

                const headings = Array.from(
                    document.querySelectorAll("h1, h2, h3, h4")
                )
                    .filter(isVisible)
                    .map(element => cleanText(element.innerText))
                    .filter(Boolean);

                const pageText = document.body
                    ? cleanText(document.body.innerText)
                    : "";

                
                const formFields = Array.from(
                    document.querySelectorAll(
                        "input, select, textarea, button"
                    )
                )
                    .filter(isVisible)
                    .map(element => {
                        const tagName = element.tagName.toLowerCase();
                        const type = (
                            element.getAttribute("type") || tagName
                        ).toLowerCase();

                        if (
                            ["password", "hidden", "file"].includes(type) ||
                            element.hasAttribute("data-sensitive")
                        ) {
                            return null;
                        }

                        let label = "";

                        if (element.labels && element.labels.length > 0) {
                            label = Array.from(element.labels)
                                .map(item => cleanText(item.innerText))
                                .filter(Boolean)
                                .join(" ");
                        }

                        label =
                            label ||
                            element.getAttribute("aria-label") ||
                            element.getAttribute("placeholder") ||
                            element.getAttribute("name") ||
                            "";

                        return [
                            `Field: ${cleanText(label) || "Unlabelled"}`,
                            `Type: ${type}`,
                            element.required ? "Required: yes" : "",
                            element.getAttribute("aria-invalid") === "true"
                                ? "Invalid: yes"
                                : ""
                        ]
                            .filter(Boolean)
                            .join(" | ");
                    })
                    .filter(Boolean);

                const errorSelectors = [
                    '[role="alert"]',
                    '[aria-live="assertive"]',
                    '[aria-live="polite"]',
                    ".error",
                    ".errors",
                    ".invalid-feedback",
                    ".validation-error",
                    ".field-error"
                ];

                const errorMessages = Array.from(
                    document.querySelectorAll(errorSelectors.join(","))
                )
                    .filter(isVisible)
                    .map(element => cleanText(element.innerText))
                    .filter(Boolean);

                const uniqueErrors = [...new Set(errorMessages)];

                return [
                    `PAGE TITLE:\n${pageTitle}`,
                    `PAGE HEADINGS:\n${headings.join("\n")}`,
                    `FORM FIELDS:\n${formFields.join("\n")}`,
                    `VISIBLE ERROR MESSAGES:\n${uniqueErrors.join("\n")}`,
                    `VISIBLE PAGE TEXT:\n${pageText}`
                ].join("\n\n");
            }
        });

        return results?.[0]?.result || "";
    }


async function readCurrentPageImages() {
    if (!currentTabId) {
        return [];
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: async () => {
            function isVisible(img) {
                const style = window.getComputedStyle(img);
                const rect = img.getBoundingClientRect();

                return (
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    rect.width >= 80 &&
                    rect.height >= 80
                );
            }

            function convertToBase64(blob) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();

                    reader.onloadend = () => {
                        const result = reader.result;
                        resolve(result.split(",")[1]);
                    };

                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            }

            const images = Array.from(document.images)
                .filter(img => isVisible(img))
                .filter(img => img.currentSrc)
                .filter(img =>
                    !img.currentSrc.startsWith("data:") &&
                    !img.currentSrc.startsWith("blob:")
                )
                .slice(0, 3);

            const collectedImages = [];

            for (const img of images) {
                try {
                    const imageResponse = await fetch(img.currentSrc);

                    if (!imageResponse.ok) {
                        continue;
                    }

                    const blob = await imageResponse.blob();

                    if (blob.size > 2 * 1024 * 1024) {
                        continue;
                    }

                    const mimeType = blob.type.toLowerCase();

                    if (![
                        "image/jpeg",
                        "image/png",
                        "image/webp"
                    ].includes(mimeType)) {
                        continue;
                    }

                    const base64Data = await convertToBase64(blob);

                    collectedImages.push({
                        mime_type: mimeType,
                        data: base64Data,
                        alt: img.alt || "Webpage image"
                    });

                } catch (error) {
                    console.log("Could not read image:", img.currentSrc);
                }
            }

            return collectedImages;
        }
    });

    return results?.[0]?.result || [];
}



async function collectImageCandidates() {
    if (!currentTabId) {
        return [];
    }

    const results = await chrome.scripting.executeScript({
        target: { tabId: currentTabId },

        func: () => {
            function cleanText(text) {
                return (text || "")
                    .replace(/\s+/g, " ")
                    .trim();
            }

            const images = Array.from(document.images);
            const candidates = [];
            const seenSources = new Set();

            images.forEach((img, index) => {
                const style = window.getComputedStyle(img);
                const rect = img.getBoundingClientRect();

                // Ignore hidden or very small images.
                if (
                    style.display === "none" ||
                    style.visibility === "hidden" ||
                    Number(style.opacity) === 0 ||
                    rect.width < 80 ||
                    rect.height < 80
                ) {
                    return;
                }

                const source =
                    img.currentSrc ||
                    img.src ||
                    img.getAttribute("data-src");

                if (!source || source.startsWith("data:")) {
                    return;
                }

                // Avoid processing duplicate image URLs.
                if (seenSources.has(source)) {
                    return;
                }

                seenSources.add(source);

                // Collect nearby descriptive text.
                const contextElement =
                    img.closest("figure, [role='figure'], article, li") ||
                    img.parentElement;

                const nearbyText = contextElement
                    ? cleanText(contextElement.innerText).slice(0, 300)
                    : "";

                candidates.push({
                    id: index + 1,
                    src: source,
                    alt: cleanText(img.alt),
                    title: cleanText(img.title),
                    nearby_text: nearbyText,
                    width: Math.round(img.naturalWidth || rect.width),
                    height: Math.round(img.naturalHeight || rect.height)
                });
            });

            // Safety limit for very image-heavy webpages.
            return candidates.slice(0, 150);
        }
    });

    return results?.[0]?.result || [];
}

    function isSimpleGreeting(question) {
        return /^(hi|hello|hey|hii|hiii|good morning|good afternoon|good evening)[!.,\s]*$/i
          .test(question.trim());
}
    function isImageQuestion(question) {
    return /\b(image|picture|photo|photograph|chart|graph|diagram|illustration|screenshot|visual)\b/i
        .test(question);
}

    
async function sendMessage() {
    const question = questionInput.value.trim();

    if (!question || isSending || !storageKey) {
        return;
    }

    isSending = true;
    sendButton.disabled = true;

    conversation.push({
        role: "user",
        content: question
    });

    addMessage(question, "user");
    questionInput.value = "";

    const loadingMessage = addMessage(
        "Thinking...",
        "system"
    );

    try {

        // FAST PATH: Handle greetings without Gemini
        if (isSimpleGreeting(question)) {

            loadingMessage.remove();

            const answer =
                "Hi! How can I help you with this webpage?";

            conversation.push({
                role: "assistant",
                content: answer
            });

            addMessage(answer, "assistant");

            await saveConversation();

            return;
        }

        // Normal webpage question processing
        pageStatus.textContent = "● Reading the current webpage...";

        const pageText = await readCurrentPage();

        // Collect images only when the question requires them
        const images = isImageQuestion(question)
            ? await readCurrentPageImages()
            : [];

        const response = await fetch(
            "http://127.0.0.1:8000/help",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    question: question,
                    page_text: pageText,
                    conversation: conversation.slice(0, -1),
                    images: images
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Backend error: ${response.status}`);
        }

        const data = await response.json();

        loadingMessage.remove();

        const answer =
            data.answer || "I couldn't generate an answer.";

        conversation.push({
            role: "assistant",
            content: answer
        });

        addMessage(answer, "assistant");

        await saveConversation();

    } catch (error) {

        console.error("AccessMate error:", error);

        loadingMessage.remove();

        conversation.pop();

        addMessage(
            "I couldn't connect or read this page. Please check that the backend is running and try again.",
            "assistant"
        );

    } finally {

        isSending = false;
        sendButton.disabled = false;
        questionInput.focus();
    }
}

    // Send button
    sendButton.addEventListener("click", sendMessage);

    // Send message when Enter is pressed
    questionInput.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendMessage();
        }
    });

    // Clear chat
    clearButton.addEventListener("click", async () => {
        conversation = [];

        if (storageKey) {
            await chrome.storage.local.remove(storageKey);
        }

        chatMessages.innerHTML = "";

        addMessage(
            "Chat cleared for this website. Ask me a new question!",
            "assistant"
        );
    });

    // Initialize chat
    await initializeWebsiteChat();

});
