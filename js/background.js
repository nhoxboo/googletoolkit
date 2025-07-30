// Google One Token Processor Extension - Background Script (v3.5.8 - Async Listener Fix)

// Store for network requests that might contain tokens (cleared periodically)
let networkRequests = [];
let requestClearInterval = null;

// Regular expression patterns for token validation
const tokenRegexPatterns = [
    // Original pattern
    /https:\/\/tokenized\.play\.google\.com\/eacquire\/.*?(?:.*?)%3Ag1\.([^%"&?#]+)%22%2C21%5D/,
    // New pattern for complex URLs
    /https:\/\/tokenized\.play\.google\.com\/eacquire\/multiline\?.*?subs%3Acom\.google\.android\.apps\.subscriptions\.red%3Ag1\.([^%"&?#]+)%22%2C21%5D/
];

// --- Helper Functions ---

// Function to safely send a message to a tab, handling potential errors
async function sendMessageToTab(tabId, message) {
    try {
        // Check if the tab exists before sending
        await chrome.tabs.get(tabId);
        // Send the message and wait for a response (or undefined if none sent)
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        // Log errors unless it's the common "no receiving end" error
        if (!error.message.includes("Receiving end does not exist") && 
            !error.message.includes("Could not establish connection") &&
            !error.message.includes("No tab with id")) {
            console.error(`Error sending message to tab ${tabId}:`, error);
        }
        return null; // Indicate failure or no response
    }
}

// Function to inject content script if not already present
async function ensureContentScript(tabId, url) {
     // Don't inject into non-permitted URLs
    if (!url || !(url.startsWith("https://one.google.com/") || url.startsWith("https://tokenized.play.google.com/"))) {
        // console.log(`Skipping injection for non-permitted URL: ${url}`);
        return false;
    }
    try {
        // Ping the content script first
        const response = await sendMessageToTab(tabId, { action: 'ping' });
        if (response && response.status === 'ready') {
            return true; // Already injected and ready
        }
        throw new Error("Ping failed or no response");
    } catch (error) {
        // console.log(`Content script ping failed for tab ${tabId}, attempting injection...`);
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['js/content.js']
            });
            await chrome.scripting.insertCSS({
                target: { tabId: tabId },
                files: ['css/style.css']
            });
            // console.log(`Content script and CSS injected successfully into tab ${tabId}`);
            await new Promise(resolve => setTimeout(resolve, 200)); // Slightly longer delay
            return true;
        } catch (injectionError) {
            console.error(`Failed to inject script/CSS into tab ${tabId} (${url}):`, injectionError);
            return false;
        }
    }
}

// --- Event Listeners ---

// Listen for messages from content scripts or other parts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle synchronous actions first
    if (request.action === 'ping') {
        sendResponse({ status: 'ready' });
        return false; // Indicate synchronous response
    }

    // Handle asynchronous actions
    if (request.action === 'checkNetworkRequests') {
        (async () => {
            let foundToken = null;
            for (const url of networkRequests) {
                for (const pattern of tokenRegexPatterns) {
                    if (pattern.test(url)) {
                        foundToken = url;
                        break;
                    }
                }
                if (foundToken) break;
            }
            sendResponse({ token: foundToken });
        })();
        return true; // Indicate asynchronous handling
    }

    if (request.action === 'clearNetworkCache') {
        (async () => {
            networkRequests = [];
            // console.log("Network request cache cleared by content script.");
            sendResponse({ success: true });
        })();
        return true; // Indicate asynchronous handling
    }

    // If action is unknown, respond synchronously
    sendResponse({ success: false, error: "Unknown action" });
    return false;
});


// Monitor network requests
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (details.tabId > 0 && details.type === 'main_frame') {
            const url = details.url;
            if (url && url.includes("tokenized.play.google.com/eacquire")) {
                networkRequests.push(url);
                if (networkRequests.length > 50) {
                    networkRequests = networkRequests.slice(-50);
                }
                for (const pattern of tokenRegexPatterns) {
                    if (pattern.test(url)) {
                        // console.log(`Token detected in network request for tab ${details.tabId}`);
                        // Use a timeout to ensure content script might be ready
                        setTimeout(() => {
                           sendMessageToTab(details.tabId, {
                                action: 'newTokenDetected',
                                token: url
                           });
                        }, 300);
                        break;
                    }
                }
            }
        }
        return { cancel: false };
    },
    { urls: ["https://one.google.com/*", "https://tokenized.play.google.com/*"] }
);

// Handle tab updates (for auto-show and cleanup)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Ensure tab has finished loading and has a URL
    if (changeInfo.status === 'complete' && tab.url) {
        if (tab.url.startsWith("https://one.google.com/")) {
            // Inject script if needed, then send message to auto-show panel
            const scriptReady = await ensureContentScript(tabId, tab.url);
            if (scriptReady) {
                // console.log(`Sending autoShowPanel request to tab ${tabId}`);
                await sendMessageToTab(tabId, { action: 'autoShowPanel' });
            }
        } else {
            // Clear badge on non-relevant pages
            try {
                await chrome.action.setBadgeText({ text: '', tabId: tabId });
            } catch (e) { /* Ignore error if tab closed */ }
        }
    }
});

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.url || !(tab.url.startsWith("https://one.google.com/") || tab.url.startsWith("https://tokenized.play.google.com/"))) {
        console.log("Extension clicked on a non-permitted page.");
        return;
    }
    const scriptReady = await ensureContentScript(tab.id, tab.url);
    if (scriptReady) {
        await sendMessageToTab(tab.id, { action: 'togglePanel' });
    } else {
        console.error("Could not ensure content script is running. Cannot toggle panel.");
    }
});

// --- Initialization & Cleanup ---

function startRequestCleanup() {
    if (requestClearInterval) clearInterval(requestClearInterval);
    requestClearInterval = setInterval(() => {
        networkRequests = [];
    }, 3600 * 1000); // Clear every hour
}

chrome.runtime.onStartup.addListener(() => {
    networkRequests = [];
    startRequestCleanup();
});

chrome.runtime.onInstalled.addListener((details) => {
    networkRequests = [];
    startRequestCleanup();
    if (details.reason === 'install') {
        console.log('Google One Token Processor installed.');
    } else if (details.reason === 'update') {
        console.log('Google One Token Processor updated to version ' + chrome.runtime.getManifest().version);
    }
});

startRequestCleanup();


