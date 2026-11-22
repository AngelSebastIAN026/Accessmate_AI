(() => {
    if (window.__accessMateDetectionStarted) {
        return;
    }
    window.__accessMateDetectionStarted = true;

    let failedSubmissions = 0;
    let promptShown = false;
    let promptElement = null;

    function makeDraggable(prompt, titleBar) {
        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        titleBar.style.cursor = "grab";
        titleBar.style.userSelect = "none";
        titleBar.style.touchAction = "none";

        titleBar.addEventListener("pointerdown", event => {
            // Only drag with the primary mouse button or touch.
            if (event.pointerType === "mouse" && event.button !== 0) {
                return;
            }

            dragging = true;

            const rect = prompt.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            // Switch from right/bottom positioning to left/top.
            prompt.style.left = `${rect.left}px`;
            prompt.style.top = `${rect.top}px`;
            prompt.style.right = "auto";
            prompt.style.bottom = "auto";

            titleBar.style.cursor = "grabbing";
            titleBar.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        titleBar.addEventListener("pointermove", event => {
            if (!dragging) {
                return;
            }

            const maxX = window.innerWidth - prompt.offsetWidth;
            const maxY = window.innerHeight - prompt.offsetHeight;

            const newX = Math.max(
                0,
                Math.min(event.clientX - offsetX, maxX)
            );

            const newY = Math.max(
                0,
                Math.min(event.clientY - offsetY, maxY)
            );

            prompt.style.left = `${newX}px`;
            prompt.style.top = `${newY}px`;
        });

        function stopDragging() {
            dragging = false;
            titleBar.style.cursor = "grab";
        }

        titleBar.addEventListener("pointerup", stopDragging);
        titleBar.addEventListener("pointercancel", stopDragging);
    }

    function showHelpPrompt(reason) {
        if (promptShown || !document.body) {
            return;
        }

        promptShown = true;

        const prompt = document.createElement("div");
        promptElement = prompt;

        prompt.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 2147483647;
            width: 300px;
            max-width: calc(100vw - 24px);
            box-sizing: border-box;
            padding: 16px;
            background: #ffffff;
            color: #222222;
            border: 1px solid #d8d8d8;
            border-radius: 12px;
            box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
            font-family: Arial, sans-serif;
            font-size: 14px;
            line-height: 1.4;
        `;

        const title = document.createElement("div");
        title.textContent = "Having trouble with this page?";
        title.style.cssText = `
            font-weight: 700;
            font-size: 15px;
            margin-bottom: 6px;
        `;

        const description = document.createElement("div");
        description.textContent =
            reason || "AccessMate can help explain this page.";
        description.style.marginBottom = "12px";

        const helpButton = document.createElement("button");
        helpButton.textContent = "Open AccessMate";
        helpButton.style.cssText = `
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 7px;
            padding: 9px 12px;
            cursor: pointer;
            font-weight: 600;
            margin-right: 8px;
        `;

        helpButton.addEventListener("click", () => {
            description.textContent =
                "Click the AccessMate AI extension icon in Chrome to ask for help.";
            helpButton.textContent = "Got it";
            helpButton.disabled = true;
        });

        const dismissButton = document.createElement("button");
        dismissButton.textContent = "Dismiss";
        dismissButton.style.cssText = `
            background: #f1f1f1;
            color: #333333;
            border: none;
            border-radius: 7px;
            padding: 9px 12px;
            cursor: pointer;
        `;

        dismissButton.addEventListener("click", () => {
            prompt.remove();
            promptElement = null;
        });

        prompt.append(title, description, helpButton, dismissButton);
        document.body.appendChild(prompt);

        makeDraggable(prompt, title);

        window.setTimeout(() => {
            prompt.remove();
            promptElement = null;
        }, 20000);
    }

    function hasVisibleValidationErrors() {
        const invalidFields = Array.from(
            document.querySelectorAll(":invalid")
        ).filter(element => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0
            );
        });

        const visibleErrorMessages = Array.from(
            document.querySelectorAll(
                '[role="alert"], [aria-live="assertive"], .error, .field-error, .invalid-feedback'
            )
        ).some(element => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            return (
                style.display !== "none" &&
                style.visibility !== "hidden" &&
                rect.width > 0 &&
                rect.height > 0 &&
                (element.innerText || "").trim().length > 0
            );
        });

        return invalidFields.length > 0 || visibleErrorMessages;
    }

    document.addEventListener(
        "invalid",
        () => {
            showHelpPrompt(
                "A form field may need attention. I can help explain what it requires."
            );
        },
        true
    );

    document.addEventListener(
        "submit",
        event => {
            const form = event.target;

            if (!(form instanceof HTMLFormElement)) {
                return;
            }

            window.setTimeout(() => {
                if (hasVisibleValidationErrors()) {
                    failedSubmissions += 1;

                    if (failedSubmissions >= 1) {
                        showHelpPrompt(
                            "It looks like this form has a validation error. I can help you understand it."
                        );
                    }
                }
            }, 300);
        },
        true
    );

    const observer = new MutationObserver(() => {
        if (hasVisibleValidationErrors()) {
            showHelpPrompt(
                "A form error may be present. AccessMate can help explain it."
            );
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "aria-invalid", "style"]
    });
})();