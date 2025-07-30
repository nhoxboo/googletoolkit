// ==UserScript==
// @name        Google One
// @namespace   Violentmonkey Scripts
// @match       *://*/*
// @grant       none
// @version     1.5
// @author      Nguyen Hao (Refactored by AI, Enhanced by AI), fix bug: Viên NV
// @description Refactored version of Google One Toolkit with further UI/UX enhancements including minimize button and selection highlighting.
// ==/UserScript==

(function () {
  'use strict';

  // --- Constants and Configuration ---
  const TOKEN_URL_PREFIX = "https://tokenized.play.google.com/eacquire/";
  const TOKEN_PACKAGE_REGEXES = [
    /https:\/\/tokenized\.play\.google\.com\/eacquire\/.*?%3Ag1\.([^%"&?#]+)/,
    /https:\/\/tokenized\.play\.google\.com\/eacquire\/multiline\?.*?subs%3Acom\.google\.android\.apps\.subscriptions\.red%3Ag1\.([^%"&?#]+)/
  ];
  // FIX: Broaden C_PERCENT_REGEX to capture any number, not just 0, 1, 5, 6
  const C_PERCENT_REGEX = /C(.)%/g;
  const EAR_PARAM_REGEX = /&ear=([^&]+)/;

  const DEFAULT_CURRENT_TOKEN_DETAILS = {
    token: null,
    packageCode: null,
    cPercent: null,
    earValue: null,
    processedTokenForFooter: null,
  };
  const DEFAULT_REPLACEMENT_TOKEN_DETAILS = {
    packageCode: null,
    cPercent: null,
  };

  const PACKAGE_OPTIONS_CONFIG = {
    "THÁNG": ["Không thay đổi", "100gb", "200gb", "2tb", "2tb.ai", "5tb", "10tb", "20tb", "30tb", "ai.pro.3months_ip_50p"],
    "NĂM": ["100gb.annual", "200gb.annual", "2tb.annual", "5tb.annual"],
    "100GB": ["100gb.1month_eft", "100gb.2months_eft", "100gb.3months_eft", "100gb.9months_eft", "100gb.1year_eft", "100gb.annual.1month_eft", "100gb.annual.3months_eft", "100gb.annual.1year_eft"],
    "200GB": ["200gb.1month_eft", "200gb.3months_eft", "200gb.1year_eft", "200gb.annual.1month_eft", "200gb.annual.3months_eft"],
    "2TB": ["2tb.ai.1month_eft", "2tb.ai.2months_eft", "2tb.1month_eft", "2tb.3months_eft", "2tb.6months_eft", "2tb.annual.1month_eft", "2tb.annual.3months_eft"]
  };
  const C_PERCENT_OPTIONS = ["C0%", "C1%", "C5%", "C6%"];
  const UI_TEXT = {
    panelTitle: "Google One",
    closeButton: "Đóng",
    minimizeButtonText: "–", // En dash
    restoreButtonText: "□",   // Square symbol
    minimizeButtonArialabel: "Thu nhỏ cửa sổ",
    restoreButtonArialabel: "Phục hồi cửa sổ",
    tokenInputLabel: "Nhập hoặc dán thủ công đoạn mã token:",
    tokenInputPlaceholder: "Token sẽ tự động điền nếu tìm thấy...",
    cPercentSectionTitle: "Chọn cách thay thế (C%):",
    packageSectionTitle: "Chọn code gói cần thay thế:",
    currentLabel: "Hiện tại:",
    replacementLabel: "Thay thế:",
    copyButton: "Sao chép Token",
    openLinkButton: "Mở Link Token",
    noChangeOption: "Không thay đổi",
    toastCopied: "Đã sao chép vào clipboard!",
    toastCopyError: "Lỗi sao chép: ",
    toastNoTokenToCopy: "Không có token để sao chép.",
    toastInvalidUrl: "Token không phải là URL hợp lệ để mở.",
    toastTokenDetected: "Đã tự động phát hiện và cập nhật token!",
    toastNewTokenOnPage: "Đã phát hiện token mới trên trang!",
    errorInvalidToken: "Đoạn mã token không hợp lệ.",
    errorNoOriginalToken: "Không tìm thấy token gốc hợp lệ.",
    errorProcessingToken: "Không thể xử lý token với lựa chọn này hoặc token gốc không hợp lệ.",
  };

  const TAB_TITLES_MAP = {
    "THÁNG": "Code gói THÁNG",
    "NĂM": "Code gói NĂM",
    "100GB": "Code trial 100GB",
    "200GB": "Code trial 200GB",
    "2TB": "Code trial 2TB"
  };
  const DEFAULT_TAB_KEY = "THÁNG";
  const TWO_COLUMN_TAB_KEY = "THÁNG";

  // --- State Variables ---
  let isPanelVisible = false;
  let isPanelMinimized = false;
  let panelElement = null;
  let toastContainerElement = null;
  let activeToastTimeouts = {};
  let dragStartX = 0, dragStartY = 0;
  let currentTokenDetails = { ...DEFAULT_CURRENT_TOKEN_DETAILS };
  let replacementTokenDetails = { ...DEFAULT_REPLACEMENT_TOKEN_DETAILS };
  let domMutationObserver = null;
  let tokenInputDebounceTimeoutId = null;
  let tokenInputElement = null;
  let packageOptionsSectionElement = null;
  let cPercentOptionsSectionElement = null;
  let errorMessageElement = null;
  let packageOptionsContainerElement = null;
  let packageOptionCategoryElements = {};
  let cPercentOptionsContainerElement = null;
  let panelContentAreaElement = null;
  let panelFooterElement = null;
  let panelFooterActionsElement = null;
  let footerCopyButton = null;
  let footerOpenLinkButton = null;
  let tabsNavElement = null;
  let tabsContentElement = null;
  let activeTabKey = DEFAULT_TAB_KEY;
  let minimizeRestoreButton = null;

  // --- Utility Functions ---
  function debounce(func, delay) {
    return function (...args) {
      clearTimeout(tokenInputDebounceTimeoutId);
      tokenInputDebounceTimeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  function showToastNotification(message, type = "info") {
    if (!toastContainerElement) {
      toastContainerElement = document.createElement("div");
      toastContainerElement.id = "g1tp-toast-container";
      document.body.appendChild(toastContainerElement);
    }
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const toastElement = document.createElement("div");
    toastElement.className = `g1tp-toast-notification g1tp-toast-${type}`;
    toastElement.textContent = message;
    toastElement.id = toastId;
    toastContainerElement.insertBefore(toastElement, toastContainerElement.firstChild);
    const dismissToast = () => {
      clearTimeout(activeToastTimeouts[toastId]);
      toastElement.classList.add("g1tp-toast-fade-out");
      setTimeout(() => {
        if (toastElement.parentNode) toastElement.parentNode.removeChild(toastElement);
        delete activeToastTimeouts[toastId];
        if (toastContainerElement && !toastContainerElement.hasChildNodes()) {
          if (toastContainerElement.parentNode) toastContainerElement.parentNode.removeChild(toastContainerElement);
          toastContainerElement = null;
        }
      }, 500);
    };
    activeToastTimeouts[toastId] = setTimeout(dismissToast, 3000);
    toastElement.addEventListener("click", dismissToast);
  }

  function showErrorMessageInPanel(message) {
    if (errorMessageElement) {
      errorMessageElement.textContent = message;
      errorMessageElement.style.display = "block";
    }
    if (packageOptionsSectionElement) packageOptionsSectionElement.style.display = "none";
    if (cPercentOptionsSectionElement) cPercentOptionsSectionElement.style.display = "none";
    updatePanelFooterStatus();
  }

  function hideErrorMessageInPanel() {
    if (errorMessageElement) errorMessageElement.style.display = "none";
  }

  function updatePanelFooterStatus() {
    if (!panelFooterElement) return;
    const currentPackage = currentTokenDetails.packageCode || "N/A";
    const currentCPercent = currentTokenDetails.cPercent || "N/A";
    const replacementPackage = replacementTokenDetails.packageCode || "N/A";
    const replacementCPercent = replacementTokenDetails.cPercent || "N/A";

    const statusDiv = panelFooterElement.querySelector(".g1tp-footer-status-area") || document.createElement("div");
    statusDiv.className = "g1tp-footer-status-area";
    statusDiv.innerHTML = `
      <div class="g1tp-footer-status-line">${UI_TEXT.currentLabel} <b>${currentPackage}</b> / <b>${currentCPercent}</b></div>
      <div class="g1tp-footer-status-line">${UI_TEXT.replacementLabel} <b>${replacementPackage}</b> / <b>${replacementCPercent}</b></div>
    `;
    if (!panelFooterElement.contains(statusDiv)) {
        panelFooterElement.insertBefore(statusDiv, panelFooterActionsElement);
    }
    updateFooterActionButtonsState();
  }

  function updateFooterActionButtonsState() {
    if (!footerCopyButton || !footerOpenLinkButton) return;
    const tokenAvailable = !!currentTokenDetails.processedTokenForFooter;
    footerCopyButton.disabled = !tokenAvailable;
    footerOpenLinkButton.disabled = !tokenAvailable;
    footerCopyButton.setAttribute('aria-disabled', String(!tokenAvailable));
    footerOpenLinkButton.setAttribute('aria-disabled', String(!tokenAvailable));
  }

  function ensurePanelInViewport() {
    if (!panelElement) return;
    // If minimized, viewport adjustment might not be as critical, or needs different logic.
    // For now, standard behavior for both states.
    const panelRect = panelElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 10;
    let newLeft = panelElement.offsetLeft;
    let newTop = panelElement.offsetTop;
    if (panelRect.right > viewportWidth - margin) newLeft = viewportWidth - panelRect.width - margin;
    if (panelRect.left < margin) newLeft = margin;
    if (panelRect.bottom > viewportHeight - margin) newTop = viewportHeight - panelRect.height - margin;
    if (panelRect.top < margin) newTop = margin;
    panelElement.style.left = `${newLeft}px`;
    panelElement.style.top = `${newTop}px`;
    panelElement.style.right = "auto";
    panelElement.style.bottom = "auto";
    panelElement.style.transform = "none";
  }

  // --- Token Processing Utilities ---
  const tokenUtils = {
    validateToken: function (tokenString) {
      if (!tokenString || typeof tokenString !== "string" || !tokenString.startsWith(TOKEN_URL_PREFIX)) return false;
      return tokenString.includes("%3Ag1.") && tokenString.includes("ear=");
    },
    extractPackageCode: function (tokenString) {
      if (!this.validateToken(tokenString)) return null;
      for (const regex of TOKEN_PACKAGE_REGEXES) {
        const match = tokenString.match(regex);
        if (match && match[1]) {
          try {
            const decodedPackageCode = decodeURIComponent(match[1]);
            if (!decodedPackageCode.includes("/") && !decodedPackageCode.includes("=") && !decodedPackageCode.includes("&")) return decodedPackageCode;
          } catch (e) {}
          const rawPackageCode = match[1];
          if (!rawPackageCode.includes("/") && !rawPackageCode.includes("=") && !rawPackageCode.includes("&")) return rawPackageCode;
        }
      }
      return null;
    },
    extractCPercentCode: function (tokenString) {
      if (!this.validateToken(tokenString)) return null;
	  /**
      const earMatch = tokenString.match(EAR_PARAM_REGEX);
      if (earMatch && earMatch[1]) {
        try {
          const decodedEarValue = decodeURIComponent(earMatch[1]);
          const cPercentMatch = decodedEarValue.match(C_PERCENT_REGEX);
          return cPercentMatch ? cPercentMatch[0] : null;
        } catch (e) {
          const cPercentMatchRaw = earMatch[1].match(C_PERCENT_REGEX);
          return cPercentMatchRaw ? cPercentMatchRaw[0] : null;
        }
      }
	  **/
      const generalMatch = tokenString.match(C_PERCENT_REGEX);
      return generalMatch ? generalMatch[0] : null;
    },
    extractEarValue: function (tokenString) {
      if (!this.validateToken(tokenString)) return null;
      const match = tokenString.match(EAR_PARAM_REGEX);
      return match ? match[1] : null;
    },
    processToken: function (originalToken, newPackageCode, newCPercent) {
      if (!this.validateToken(originalToken)) return null;
      let modifiedToken = originalToken;
      const currentPackageCode = this.extractPackageCode(originalToken);
      const currentCPercentInEar = this.extractCPercentCode(originalToken);
      const currentRawEarValue = this.extractEarValue(originalToken);

      if (newPackageCode && newPackageCode !== UI_TEXT.noChangeOption && currentPackageCode) {
        const encodedNewPackage = encodeURIComponent(newPackageCode);
        const encodedCurrentPackage = encodeURIComponent(currentPackageCode);
        const patternToReplace1 = `%3Ag1.${encodedCurrentPackage}`;
        const patternToReplace2 = `%3Ag1.${currentPackageCode}`; // Fallback for non-encoded current package in URL
        if (modifiedToken.includes(patternToReplace1)) modifiedToken = modifiedToken.replace(patternToReplace1, `%3Ag1.${encodedNewPackage}`);
        else if (modifiedToken.includes(patternToReplace2)) modifiedToken = modifiedToken.replace(patternToReplace2, `%3Ag1.${encodedNewPackage}`);
        else console.warn("Could not find package pattern to replace:", patternToReplace1, "or", patternToReplace2);
      } else if (newPackageCode && newPackageCode !== UI_TEXT.noChangeOption && !currentPackageCode) {
        console.warn("Cannot replace package code: Original package code not found.");
      }

	  modifiedToken = modifiedToken.replace(currentCPercentInEar, newCPercent);

      if (!modifiedToken.startsWith(TOKEN_URL_PREFIX) || !this.extractPackageCode(modifiedToken)) {
        console.error("Token processing resulted in invalid structure:", modifiedToken);
        return null;
      }
      return modifiedToken;
    }
  };

  // --- DOM Interaction and UI Logic ---
  function findTokenInPage() {
    const selectorsAndAttributes = [
      { selector: "*[href]", attribute: "href" }, { selector: "*[src]", attribute: "src" },
      { selector: "*[data-url]", attribute: "data-url" }, { selector: "*[data-src]", attribute: "data-src" },
      { selector: "*[data-href]", attribute: "data-href" }, { selector: "*[action]", attribute: "action" },
      { selector: "input[value]", attribute: "value" }, { selector: "meta[content]", attribute: "content" },
      { selector: "a", attribute: "href" }, { selector: "button[data-url]", attribute: "data-url" },
    ];
    for (const { selector, attribute } of selectorsAndAttributes) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (element.hasAttribute(attribute)) {
          const potentialToken = element.getAttribute(attribute);
          if (tokenUtils.validateToken(potentialToken)) return potentialToken;
        }
      }
    }
    const scriptElements = document.querySelectorAll("script");
    for (const scriptElement of scriptElements) {
      if (scriptElement.textContent) {
        for (const regex of TOKEN_PACKAGE_REGEXES) {
          // More robust regex for finding tokens in script content
          const scriptContentRegexSource = TOKEN_URL_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
                                       '.*?' +
                                       (regex.source.includes("multiline") ?
                                       'subs%3Acom\\.google\\.android\\.apps\\.subscriptions\\.red%3Ag1\\.([^%"\'\\s&?#]+)' :
                                       '%3Ag1\\.([^%"\'\\s&?#]+)');
          const scriptContentRegex = new RegExp(scriptContentRegexSource, "g");
          let match;
          while((match = scriptContentRegex.exec(scriptElement.textContent)) !== null) {
            // Reconstruct the full token URL based on prefix and matched part.
            // This is tricky as the regex finds parts. We need to ensure it's a full, valid token.
            // For simplicity, we'll look for quotes or spaces around the discovered URL.
            const potentialFullToken = scriptElement.textContent.substring(match.index, scriptElement.textContent.indexOf('"', match.index + TOKEN_URL_PREFIX.length) !== -1 ? scriptElement.textContent.indexOf('"', match.index + TOKEN_URL_PREFIX.length) : scriptElement.textContent.indexOf("'", match.index + TOKEN_URL_PREFIX.length) !== -1 ? scriptElement.textContent.indexOf("'", match.index + TOKEN_URL_PREFIX.length) : (match.index + match[0].length + 50) );

            const urlRegex = new RegExp(TOKEN_URL_PREFIX + "[^\\s\"']+");
            const urlMatch = potentialFullToken.match(urlRegex);
            if (urlMatch && tokenUtils.validateToken(urlMatch[0])) return urlMatch[0];
          }
        }
      }
    }
    return null;
  }

  function togglePanelMinimize() {
    isPanelMinimized = !isPanelMinimized;
    if (panelElement && minimizeRestoreButton) {
        panelElement.classList.toggle("g1tp-minimized", isPanelMinimized);
        minimizeRestoreButton.innerHTML = isPanelMinimized ? UI_TEXT.restoreButtonText : UI_TEXT.minimizeButtonText;
        minimizeRestoreButton.setAttribute("aria-label", isPanelMinimized ? UI_TEXT.restoreButtonArialabel : UI_TEXT.minimizeButtonArialabel);
        if (!isPanelMinimized) {
            ensurePanelInViewport();
        }
    }
  }

  function createPanelHeader() {
    const headerElement = document.createElement("div");
    headerElement.className = "g1tp-header";

    const titleElement = document.createElement("h2");
    // KHÔNG đặt textContent ở đây nữa
    
    // -- BẮT ĐẦU THAY ĐỔI --
    const iconElement = document.createElement("img");
    // Sử dụng icon SVG đã được mã hóa Base64 để không cần file ngoài
    iconElement.src = "data:image/png;base64,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";
    iconElement.className = "g1tp-header-icon"; // Thêm class để tạo kiểu trong CSS

    const titleText = document.createElement("span");
    titleText.textContent = UI_TEXT.panelTitle;

    titleElement.appendChild(iconElement);
    titleElement.appendChild(titleText);
    // -- KẾT THÚC THAY ĐỔI --

    const controlsDiv = document.createElement("div");
    controlsDiv.className = "g1tp-header-controls";

    minimizeRestoreButton = document.createElement("button");
    minimizeRestoreButton.innerHTML = isPanelMinimized ? UI_TEXT.restoreButtonText : UI_TEXT.minimizeButtonText;
    minimizeRestoreButton.className = "g1tp-control-button g1tp-minimize-button";
    minimizeRestoreButton.setAttribute("aria-label", isPanelMinimized ? UI_TEXT.restoreButtonArialabel : UI_TEXT.minimizeButtonArialabel);
    minimizeRestoreButton.addEventListener("click", togglePanelMinimize);

    const closeButton = document.createElement("button");
    closeButton.textContent = UI_TEXT.closeButton;
    closeButton.className = "g1tp-control-button g1tp-close-button";
    closeButton.setAttribute("aria-label", "Close Panel");
    closeButton.addEventListener("click", closeAndCleanupPanel);

    controlsDiv.appendChild(minimizeRestoreButton);
    controlsDiv.appendChild(closeButton);

    headerElement.appendChild(titleElement);
    headerElement.appendChild(controlsDiv);

    headerElement.addEventListener("mousedown", (event) => {
      if (event.target.closest('.g1tp-control-button')) return; // Don't drag if clicking a button
      panelElement.style.transform = "none"; // Reset transform if it was centered
      dragStartX = event.clientX; dragStartY = event.clientY;
      const panelInitialLeft = panelElement.offsetLeft; const panelInitialTop = panelElement.offsetTop;
      function handleDragMove(moveEvent) {
        panelElement.style.left = `${panelInitialLeft + (moveEvent.clientX - dragStartX)}px`;
        panelElement.style.top = `${panelInitialTop + (moveEvent.clientY - dragStartY)}px`;
        panelElement.style.right = "auto"; // Necessary if panel was initially right-aligned
      }
      function handleDragEnd() {
        document.removeEventListener("mousemove", handleDragMove);
        document.removeEventListener("mouseup", handleDragEnd);
        if (!isPanelMinimized) ensurePanelInViewport(); // Only ensure if not minimized, to prevent jump
      }
      document.addEventListener("mousemove", handleDragMove);
      document.addEventListener("mouseup", handleDragEnd);
    });
    return headerElement;
  }

  function createPanelContentArea(initialTokenValue) {
    panelContentAreaElement = document.createElement("div");
    panelContentAreaElement.className = "g1tp-content-area";

    const tokenInputSection = document.createElement("div");
    tokenInputSection.className = "g1tp-section";
    const tokenInputLabel = document.createElement("label");
    tokenInputLabel.htmlFor = "g1tp-tokenInput";
    tokenInputLabel.textContent = UI_TEXT.tokenInputLabel;

    // NEW: Tạo một div wrapper để chứa ô input và nút copy mới
    const tokenInputWrapper = document.createElement("div");
    tokenInputWrapper.className = "g1tp-token-input-wrapper";

    tokenInputElement = document.createElement("input");
    tokenInputElement.type = "text";
    tokenInputElement.id = "g1tp-tokenInput";
    tokenInputElement.placeholder = UI_TEXT.tokenInputPlaceholder;
    tokenInputElement.value = initialTokenValue || findTokenInPage() || '';

    // NEW: Tạo nút "Copy Raw Token"
    const copyRawTokenButton = document.createElement("button");
    copyRawTokenButton.textContent = "Copy token gốc";
    copyRawTokenButton.className = "g1tp-raw-copy-button";
    copyRawTokenButton.type = "button"; // Tránh việc submit form nếu có

    // NEW: Gán sự kiện click để sao chép nội dung
    copyRawTokenButton.addEventListener('click', () => {
        const tokenToCopy = tokenInputElement.value;
        if (tokenToCopy) {
            navigator.clipboard.writeText(tokenToCopy)
                .then(() => showToastNotification("Đã sao chép token gốc!", "success"))
                .catch(err => showToastNotification(`${UI_TEXT.toastCopyError}${err.message}`, "error"));
        } else {
            showToastNotification("Không có gì để sao chép.", "error");
        }
    });

    // CHANGED: Thêm các phần tử vào wrapper thay vì trực tiếp vào section
    tokenInputSection.appendChild(tokenInputLabel);
    tokenInputWrapper.appendChild(tokenInputElement);
    tokenInputWrapper.appendChild(copyRawTokenButton);
    tokenInputSection.appendChild(tokenInputWrapper); // Thêm wrapper vào section

    cPercentOptionsSectionElement = document.createElement("div");
    cPercentOptionsSectionElement.id = "g1tp-cPercentSection";
    cPercentOptionsSectionElement.className = "g1tp-section";
    cPercentOptionsSectionElement.style.display = "none";
    const cPercentTitle = document.createElement("h3");
    cPercentTitle.className = "g1tp-section-title";
    cPercentTitle.textContent = UI_TEXT.cPercentSectionTitle;
    cPercentOptionsContainerElement = document.createElement("div");
    cPercentOptionsContainerElement.className = "g1tp-cpercent-options";
    cPercentOptionsSectionElement.appendChild(cPercentTitle);
    cPercentOptionsSectionElement.appendChild(cPercentOptionsContainerElement);

    packageOptionsSectionElement = document.createElement("div");
    packageOptionsSectionElement.id = "g1tp-optionsSection";
    packageOptionsSectionElement.className = "g1tp-section";
    packageOptionsSectionElement.style.display = "none";
    const packageOptionsTitle = document.createElement("h3");
    packageOptionsTitle.className = "g1tp-section-title";
    packageOptionsTitle.textContent = UI_TEXT.packageSectionTitle;
    packageOptionsContainerElement = document.createElement("div");
    packageOptionsContainerElement.className = "g1tp-package-options-host";
    packageOptionsSectionElement.appendChild(packageOptionsTitle);
    packageOptionsSectionElement.appendChild(packageOptionsContainerElement);

    errorMessageElement = document.createElement("div");
    errorMessageElement.id = "g1tp-errorMessage";
    errorMessageElement.className = "g1tp-error-message";
    errorMessageElement.style.display = "none";

    panelContentAreaElement.appendChild(tokenInputSection);
    panelContentAreaElement.appendChild(cPercentOptionsSectionElement);
    panelContentAreaElement.appendChild(packageOptionsSectionElement);
    panelContentAreaElement.appendChild(errorMessageElement);
    return panelContentAreaElement;
  }
  
  function createPanelFooter() {
    panelFooterElement = document.createElement("div");
    panelFooterElement.className = "g1tp-footer";
    const statusArea = document.createElement("div");
    statusArea.className = "g1tp-footer-status-area";
    panelFooterActionsElement = document.createElement("div");
    panelFooterActionsElement.className = "g1tp-footer-actions";

    footerCopyButton = document.createElement("button");
    footerCopyButton.textContent = UI_TEXT.copyButton;
    footerCopyButton.className = "g1tp-footer-action-button g1tp-copy-button";
    footerCopyButton.disabled = true;
    footerCopyButton.setAttribute('aria-disabled', 'true');
    footerCopyButton.addEventListener("click", () => {
      const tokenToCopy = currentTokenDetails.processedTokenForFooter;
      if (tokenToCopy) {
        navigator.clipboard.writeText(tokenToCopy)
          .then(() => showToastNotification(UI_TEXT.toastCopied, "success"))
          .catch(err => showToastNotification(`${UI_TEXT.toastCopyError}${err.message}`, "error"));
      } else {
        showToastNotification(UI_TEXT.toastNoTokenToCopy, "error");
      }
    });

    footerOpenLinkButton = document.createElement("button");
    footerOpenLinkButton.textContent = UI_TEXT.openLinkButton;
    footerOpenLinkButton.className = "g1tp-footer-action-button g1tp-open-button";
    footerOpenLinkButton.disabled = true;
    footerOpenLinkButton.setAttribute('aria-disabled', 'true');
    footerOpenLinkButton.addEventListener("click", () => {
      const urlToOpen = currentTokenDetails.processedTokenForFooter;
      if (urlToOpen && (urlToOpen.startsWith("http://") || urlToOpen.startsWith("https://"))) {
        window.open(urlToOpen, "_blank");
      } else {
        showToastNotification(UI_TEXT.toastInvalidUrl, "error");
      }
    });

    panelFooterActionsElement.appendChild(footerCopyButton);
    panelFooterActionsElement.appendChild(footerOpenLinkButton);
    panelFooterElement.appendChild(statusArea);
    panelFooterElement.appendChild(panelFooterActionsElement);
    return panelFooterElement;
  }


  function injectPanelStyles() {
    const styleId = "g1tp-styles";
    if (document.getElementById(styleId)) return;

    const styles = `
      #googleOneTokenPanel {
        position: fixed;
        z-index: 2147483646;
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        color: #333;
        width: 450px;
        max-width: 90vw;
        display: flex;
        flex-direction: column;
        overflow: hidden; /* Important for minimize */
        transition: max-height 0.3s ease-in-out; /* For smooth minimize */
      }
      #googleOneTokenPanel.g1tp-minimized .g1tp-content-area,
      #googleOneTokenPanel.g1tp-minimized .g1tp-footer {
        display: none;
      }
      #googleOneTokenPanel.g1tp-minimized {
         /* Height will be determined by header content */
         max-height: 60px; /* Adjust to fit header, including padding */
         overflow: hidden;
      }
      .g1tp-header {
        background-color: #f5f5f5;
        padding: 12px 16px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #e0e0e0;
        cursor: move;
        user-select: none; /* Prevent text selection when dragging */
      }
      .g1tp-header:active {
        cursor: grabbing;
        background-color: #e8e8e8;
      }
      .g1tp-header h2 { 
		margin: 0; 
        font-size: 16px; 
        font-weight: 600; 
        color: #202124; 
        /* -- BẮT ĐẦU THAY ĐỔI -- */
        display: flex;
        align-items: center; 
        /* -- KẾT THÚC THAY ĐỔI -- */
	  }
	  /* -- THÊM ĐOẠN NÀY -- */
      .g1tp-header-icon {
        width: 20px;
        height: 20px;
        margin-right: 8px; /* Khoảng cách giữa icon và chữ */
      }
      /* -- KẾT THÚC -- */
      .g1tp-header-controls { display: flex; align-items: center; }
      .g1tp-header-controls { display: flex; align-items: center; }
      .g1tp-control-button {
        background: none; border: none; font-size: 18px;
        color: #5f6368; cursor: pointer; padding: 4px 8px; border-radius: 4px;
        line-height: 1; /* Ensure consistent height */
        margin-left: 4px;
      }
      .g1tp-control-button:hover { background-color: #e0e0e0; color: #000; }
      .g1tp-minimize-button { font-weight: bold; } /* Make dash thicker */
      .g1tp-close-button { font-weight: normal; } /* Use 'Đóng' text, not X */

      .g1tp-content-area { padding: 16px; max-height: 65vh; overflow-y: auto; }
      .g1tp-section { margin-bottom: 20px; }
      .g1tp-section-title {
        font-size: 15px; font-weight: 500; color: #3c4043;
        margin-top: 0; margin-bottom: 10px; padding-bottom: 4px; border-bottom: 1px solid #eee;
      }
      #g1tp-tokenInput {
        width: 100%; padding: 8px 10px; border: 1px solid #dadce0;
        border-radius: 4px; font-size: 13px; box-sizing: border-box; margin-top: 4px;
      }
      #g1tp-tokenInput:focus { border-color: #1a73e8; box-shadow: 0 0 0 1px #1a73e8; outline: none; }
      label[for="g1tp-tokenInput"] { font-weight: 500; font-size: 14px; }
      .g1tp-tabs-nav {
        display: flex; border-bottom: 1px solid #dadce0; margin-bottom: 12px; flex-wrap: wrap;
      }
      .g1tp-tab-button {
        padding: 10px 14px; cursor: pointer; border: none; background-color: transparent;
        color: #5f6368; font-size: 13px; font-weight: 500; margin-right: 4px;
        border-bottom: 2px solid transparent; transition: color 0.2s, border-color 0.2s;
      }
      .g1tp-tab-button:hover { color: #1a73e8; }
      .g1tp-tab-button.active { color: #1a73e8; border-bottom-color: #1a73e8; font-weight: 600; }
      .g1tp-tab-panel { display: none; }
      .g1tp-tab-panel.active { display: block; }
      .g1tp-tab-panel.two-columns {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0px 10px;
      }
      .g1tp-option-wrapper, .g1tp-cpercent-wrapper {
        display: flex; align-items: center; padding: 6px 4px;
        border: 1px solid transparent; /* For selected state border */
        border-radius: 4px; transition: background-color 0.15s, border-color 0.15s;
      }
      .g1tp-option-wrapper:hover, .g1tp-cpercent-wrapper:hover { background-color: #f0f4ff; }
      .g1tp-option-wrapper.g1tp-option-selected,
      .g1tp-cpercent-wrapper.g1tp-option-selected {
        background-color: #e8f0fe; /* Light blue background */
        border-color: #1a73e8; /* Blue border */
      }
      .g1tp-option-wrapper input[type="radio"],
      .g1tp-cpercent-wrapper input[type="radio"] {
        margin-right: 8px; accent-color: #1a73e8; cursor: pointer;
      }
      .g1tp-option-label, .g1tp-cpercent-label {
        font-size: 13px; color: #3c4043; flex-grow: 1; cursor: pointer;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 160px;
      }
      .g1tp-option-wrapper.g1tp-option-selected .g1tp-option-label,
      .g1tp-cpercent-wrapper.g1tp-option-selected .g1tp-cpercent-label {
        font-weight: 500; /* Slightly bolder text for selected */
        color: #174ea6; /* Darker blue for selected label */
      }
      .g1tp-option-label:hover, .g1tp-cpercent-label:hover { color: #1a73e8; }

      .g1tp-footer {
        padding: 12px 16px;
        border-top: 1px solid #e0e0e0;
        background-color: #f8f9fa;
      }
      .g1tp-footer-status-area { margin-bottom: 10px; }
      .g1tp-footer-status-line { margin-bottom: 4px; color: #5f6368; font-size: 12px; }
      .g1tp-footer-status-line:last-child { margin-bottom: 0; }
      .g1tp-footer-status-line b { color: #202124; font-weight: 500; }
      .g1tp-footer-actions { display: flex; gap: 10px; }
      .g1tp-footer-action-button {
        flex-grow: 1;
        background-color: #1a73e8; color: white; border: none;
        padding: 10px 12px;
        font-size: 14px;
        font-weight: 500; border-radius: 4px; cursor: pointer;
        transition: background-color 0.2s, opacity 0.2s;
        text-align: center;
      }
      .g1tp-footer-action-button:hover:not(:disabled) { background-color: #1765cc; }
      .g1tp-footer-action-button.g1tp-open-button { background-color: #34a853; }
      .g1tp-footer-action-button.g1tp-open-button:hover:not(:disabled) { background-color: #2b8a41; }
      .g1tp-footer-action-button:disabled {
        background-color: #e0e0e0;
        color: #a0a0a0;
        cursor: not-allowed;
        opacity: 0.7;
      }

      .g1tp-error-message {
        background-color: #fce8e6; color: #a50e0e; padding: 10px;
        border: 1px solid #f9bdbb; border-radius: 4px; margin-top: 10px; font-size: 13px;
      }
      #g1tp-toast-container {
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483646;
        display: flex; flex-direction: column-reverse;
      }
      .g1tp-toast-notification {
        background-color: #323232; color: #fff; padding: 12px 18px;
        border-radius: 4px; margin-top: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-size: 14px; opacity: 1; transition: opacity 0.5s, transform 0.5s;
      }
      .g1tp-toast-fade-out { opacity: 0; transform: translateY(20px); }
      .g1tp-toast-success { background-color: #1e8e3e; }
      .g1tp-toast-error { background-color: #d93025; }
      .g1tp-toast-info { background-color: #1a73e8; }
      .g1tp-content-area::-webkit-scrollbar { width: 8px; }
      .g1tp-content-area::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
      .g1tp-content-area::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
      .g1tp-content-area::-webkit-scrollbar-thumb:hover { background: #a1a1a1; }
	  .g1tp-token-input-wrapper {
          display: flex;
          gap: 8px; /* Khoảng cách giữa ô input và nút */
      }
      #g1tp-tokenInput {
          flex-grow: 1; /* Cho phép ô input co giãn lấp đầy không gian */
          width: auto; /* Ghi đè width 100% cũ */
      }
      .g1tp-raw-copy-button {
          background-color: #34a853; /* Màu xanh giống nút "Mở Link" */
          color: white;
          border: none;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 500;
          border-radius: 4px;
          cursor: pointer;
          transition: background-color 0.2s;
          white-space: nowrap; /* Đảm bảo chữ không bị xuống dòng */
          flex-shrink: 0; /* Không cho phép nút bị co lại */
		  margin-top: 4px;
      }
      .g1tp-raw-copy-button:hover {
          background-color: #2b8a41; /* Màu xanh đậm hơn khi hover */
      }
	  #g1tp-tokenInput, .g1tp-raw-copy-button {
		padding: 8px 12px;      /* Đồng bộ padding */
		font-size: 16px;        /* Đồng bộ cỡ chữ */
		border: 1px solid #ccc; /* Đồng bộ đường viền */
		border-radius: 4px;     /* Bo góc cho mềm mại */
		height: 40px;           /* Đặt chiều cao cố định */
		box-sizing: border-box; /* Quan trọng: Đảm bảo padding và border được tính vào chiều cao tổng */
	  }
    `;
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  function createAndShowPanel(initialTokenValue = '') {
    if (isPanelVisible) return;
    injectPanelStyles();

    panelElement = document.createElement("div");
    panelElement.id = "googleOneTokenPanel";
    // Initial position: top right. Dragging will change this.
    panelElement.style.top = "80px"; // Thay đổi từ "50%" sang một giá trị pixel cố định (ví dụ 20px từ trên xuống)
    panelElement.style.right = "20px";
    panelElement.style.transform = "none"; // Xóa bỏ phép biến đổi để căn giữa theo chiều dọc
    panelElement.style.left = "auto";

    if (isPanelMinimized) panelElement.classList.add("g1tp-minimized");


    const panelHeader = createPanelHeader();
    const panelContent = createPanelContentArea(initialTokenValue);
    const pFooter = createPanelFooter();

    panelElement.appendChild(panelHeader);
    panelElement.appendChild(panelContent);
    panelElement.appendChild(pFooter);

    document.body.appendChild(panelElement);
    isPanelVisible = true;

    populatePackageOptions();
    populateCPercentOptions();

    tokenInputElement.addEventListener("input", debounce(handleTokenInputChange, 300));
    handleTokenInputChange(true);

    window.addEventListener("resize", ensurePanelInViewport);
    if (window.location.hostname === "one.google.com" || window.location.hostname === "play.google.com") {
      startDomMutationObserverForTokens();
    }
    if (!isPanelMinimized) ensurePanelInViewport();
  }

  function closeAndCleanupPanel() {
    if (panelElement && panelElement.parentNode) panelElement.parentNode.removeChild(panelElement);
    if (domMutationObserver) domMutationObserver.disconnect();
    if (toastContainerElement && toastContainerElement.parentNode) {
      toastContainerElement.parentNode.removeChild(toastContainerElement); toastContainerElement = null;
    }
    Object.values(activeToastTimeouts).forEach(clearTimeout); activeToastTimeouts = {};
    window.removeEventListener("resize", ensurePanelInViewport);
    clearTimeout(tokenInputDebounceTimeoutId);
    panelElement = null; panelFooterElement = null; panelFooterActionsElement = null; footerCopyButton = null; footerOpenLinkButton = null;
    minimizeRestoreButton = null;
    tokenInputElement = null; tabsNavElement = null; tabsContentElement = null; activeTabKey = DEFAULT_TAB_KEY;
    domMutationObserver = null; isPanelVisible = false; /* isPanelMinimized state persists */
    currentTokenDetails = { ...DEFAULT_CURRENT_TOKEN_DETAILS };
    replacementTokenDetails = { ...DEFAULT_REPLACEMENT_TOKEN_DETAILS };
  }

  function switchTab(targetTabKey) {
    if (!tabsNavElement || !tabsContentElement) return;
    activeTabKey = targetTabKey;
    tabsNavElement.querySelectorAll(".g1tp-tab-button").forEach(button => {
      button.classList.toggle("active", button.dataset.tabKey === targetTabKey);
    });
    tabsContentElement.querySelectorAll(".g1tp-tab-panel").forEach(panel => {
      panel.classList.toggle("active", panel.id === `g1tp-tab-panel-${targetTabKey}`);
    });
  }

  function populatePackageOptions() {
    if (!packageOptionsContainerElement) return;
    packageOptionsContainerElement.innerHTML = ''; packageOptionCategoryElements = {};
    tabsNavElement = document.createElement("div"); tabsNavElement.className = "g1tp-tabs-nav";
    tabsContentElement = document.createElement("div"); tabsContentElement.className = "g1tp-tabs-content";
    packageOptionsContainerElement.appendChild(tabsNavElement);
    packageOptionsContainerElement.appendChild(tabsContentElement);

    Object.keys(PACKAGE_OPTIONS_CONFIG).forEach(categoryKey => {
      const tabButton = document.createElement("button");
      tabButton.className = "g1tp-tab-button";
      tabButton.textContent = TAB_TITLES_MAP[categoryKey] || categoryKey;
      tabButton.dataset.tabKey = categoryKey;
      const tabPanel = document.createElement("div");
      tabPanel.className = "g1tp-tab-panel";
      tabPanel.id = `g1tp-tab-panel-${categoryKey}`;

      if (categoryKey === TWO_COLUMN_TAB_KEY) tabPanel.classList.add("two-columns");
      if (categoryKey === activeTabKey) {
        tabButton.classList.add("active"); tabPanel.classList.add("active");
      }
      tabButton.addEventListener("click", () => switchTab(categoryKey));
      tabsNavElement.appendChild(tabButton);
      tabsContentElement.appendChild(tabPanel);
      packageOptionCategoryElements[categoryKey] = tabPanel;
      addPackageOptionsToCategory(tabPanel, PACKAGE_OPTIONS_CONFIG[categoryKey]);
    });
  }

  function addPackageOptionsToCategory(categoryContainer, optionsArray) {
    optionsArray.forEach(optionValue => {
      const wrapperDiv = document.createElement("div");
      wrapperDiv.className = "g1tp-option-wrapper";
      const radioButton = document.createElement("input");
      radioButton.type = "radio"; radioButton.name = "tokenOption";
      radioButton.value = optionValue;
      const sanitizedId = `g1tp_option_${optionValue.replace(/[^a-zA-Z0-9]/g, "_")}_${Math.random().toString(36).substring(2,7)}`;
      radioButton.id = sanitizedId;
      const label = document.createElement("label");
      label.htmlFor = radioButton.id; label.className = "g1tp-option-label";
      label.textContent = optionValue; label.title = optionValue;

      wrapperDiv.appendChild(radioButton);
      wrapperDiv.appendChild(label);
      categoryContainer.appendChild(wrapperDiv);
      radioButton.addEventListener("change", handlePackageOrCPercentOptionChange);
    });
  }

  function populateCPercentOptions() {
    if (!cPercentOptionsContainerElement) return;
    cPercentOptionsContainerElement.innerHTML = '';
    C_PERCENT_OPTIONS.forEach((cPercentValue, index) => {
      const wrapperDiv = document.createElement("div");
      wrapperDiv.className = "g1tp-cpercent-wrapper";
      const radioButton = document.createElement("input");
      radioButton.type = "radio"; radioButton.name = "cPercentOption";
      radioButton.value = cPercentValue;
      const sanitizedId = `g1tp_cPercent_${cPercentValue.replace('%','')}_${Math.random().toString(36).substring(2,7)}`;
      radioButton.id = sanitizedId;
      if (index === 0) radioButton.checked = true;
      const label = document.createElement("label");
      label.htmlFor = radioButton.id; label.className = "g1tp-cpercent-label";
      label.textContent = cPercentValue;
      wrapperDiv.appendChild(radioButton); wrapperDiv.appendChild(label);
      cPercentOptionsContainerElement.appendChild(wrapperDiv);
      radioButton.addEventListener("change", handlePackageOrCPercentOptionChange);
    });
    const checkedCPercent = cPercentOptionsContainerElement.querySelector("input[name='cPercentOption']:checked");
    replacementTokenDetails.cPercent = checkedCPercent ? checkedCPercent.value : C_PERCENT_OPTIONS[0];
  }

  function updateSelectedOptionHighlight() {
    if (!panelElement) return;
    // Remove from all package options
    panelElement.querySelectorAll('.g1tp-option-wrapper').forEach(w => w.classList.remove('g1tp-option-selected'));
    // Remove from all C% options
    panelElement.querySelectorAll('.g1tp-cpercent-wrapper').forEach(w => w.classList.remove('g1tp-option-selected'));

    const selectedPackageRadio = panelElement.querySelector("input[name='tokenOption']:checked");
    if (selectedPackageRadio) {
        const wrapper = selectedPackageRadio.closest('.g1tp-option-wrapper');
        if (wrapper) wrapper.classList.add('g1tp-option-selected');
    }

    const selectedCPercentRadio = panelElement.querySelector("input[name='cPercentOption']:checked");
    if (selectedCPercentRadio) {
        const wrapper = selectedCPercentRadio.closest('.g1tp-cpercent-wrapper');
        if (wrapper) wrapper.classList.add('g1tp-option-selected');
    }
  }


  function handlePackageOrCPercentOptionChange() {
    const originalToken = currentTokenDetails.token;
    const selectedPackageRadio = panelElement?.querySelector("input[name='tokenOption']:checked");
    const selectedCPercentRadio = panelElement?.querySelector("input[name='cPercentOption']:checked");

    if (!selectedPackageRadio || !selectedCPercentRadio) {
        currentTokenDetails.processedTokenForFooter = null;
        if (selectedPackageRadio) replacementTokenDetails.packageCode = selectedPackageRadio.value;
        else replacementTokenDetails.packageCode = UI_TEXT.noChangeOption;
        if (selectedCPercentRadio) replacementTokenDetails.cPercent = selectedCPercentRadio.value;
        else replacementTokenDetails.cPercent = C_PERCENT_OPTIONS[0];
        updatePanelFooterStatus();
        updateSelectedOptionHighlight(); // Update highlight even if processing fails
        return;
    }

    const selectedPackageCode = selectedPackageRadio.value;
    const selectedCPercentValue = selectedCPercentRadio.value;
    replacementTokenDetails.packageCode = selectedPackageCode;
    replacementTokenDetails.cPercent = selectedCPercentValue;

    if (!originalToken) {
      showErrorMessageInPanel(UI_TEXT.errorNoOriginalToken);
      currentTokenDetails.processedTokenForFooter = null;
      updatePanelFooterStatus();
      updateSelectedOptionHighlight();
      return;
    }

    const processedToken = tokenUtils.processToken(originalToken, selectedPackageCode, selectedCPercentValue);
    currentTokenDetails.processedTokenForFooter = processedToken;

    if (processedToken) {
      hideErrorMessageInPanel();
    } else {
      showErrorMessageInPanel(UI_TEXT.errorProcessingToken);
    }
    updatePanelFooterStatus();
    updateSelectedOptionHighlight();
  }


  function handleTokenInputChange(isInitialCall = false) {
    const tokenValue = tokenInputElement.value.trim();
    panelElement?.querySelectorAll("input[name='tokenOption']:checked").forEach(radio => radio.checked = false);
    activeTabKey = DEFAULT_TAB_KEY;
    if (tabsNavElement) switchTab(DEFAULT_TAB_KEY);
    currentTokenDetails.processedTokenForFooter = null;

    if (!tokenValue) {
      hideErrorMessageInPanel();
      if (packageOptionsSectionElement) packageOptionsSectionElement.style.display = "none";
      if (cPercentOptionsSectionElement) cPercentOptionsSectionElement.style.display = "none";
      currentTokenDetails = { ...DEFAULT_CURRENT_TOKEN_DETAILS };
      replacementTokenDetails.packageCode = null; // Reset replacement package
      replacementTokenDetails.cPercent = C_PERCENT_OPTIONS[0]; // Reset replacement C%
      updatePanelFooterStatus();
      updateSelectedOptionHighlight(); // Clear highlights
      return;
    }

    if (tokenUtils.validateToken(tokenValue)) {
      hideErrorMessageInPanel();
      if (packageOptionsSectionElement) packageOptionsSectionElement.style.display = "block";
      if (cPercentOptionsSectionElement) cPercentOptionsSectionElement.style.display = "block";
      const previousToken = currentTokenDetails.token;
      currentTokenDetails.token = tokenValue;
      currentTokenDetails.packageCode = tokenUtils.extractPackageCode(tokenValue);
      currentTokenDetails.cPercent = tokenUtils.extractCPercentCode(tokenValue);
      currentTokenDetails.earValue = tokenUtils.extractEarValue(tokenValue);

      const noChangeOptionRadio = panelElement?.querySelector(`#g1tp-tab-panel-${DEFAULT_TAB_KEY} input[value="${UI_TEXT.noChangeOption}"]`);
      if (noChangeOptionRadio) noChangeOptionRadio.checked = true;

      const defaultCPercentRadio = panelElement?.querySelector(`input[name="cPercentOption"][value="${C_PERCENT_OPTIONS[0]}"]`);
      if (defaultCPercentRadio) defaultCPercentRadio.checked = true;

      handlePackageOrCPercentOptionChange(); // This will also call updateSelectedOptionHighlight

      if (!isInitialCall && tokenValue !== previousToken) showToastNotification(UI_TEXT.toastTokenDetected, "info");
    } else {
      showErrorMessageInPanel(UI_TEXT.errorInvalidToken);
      if (packageOptionsSectionElement) packageOptionsSectionElement.style.display = "none";
      if (cPercentOptionsSectionElement) cPercentOptionsSectionElement.style.display = "none";
      currentTokenDetails = { ...DEFAULT_CURRENT_TOKEN_DETAILS };
      replacementTokenDetails.packageCode = null;
      replacementTokenDetails.cPercent = C_PERCENT_OPTIONS[0];
      updatePanelFooterStatus();
      updateSelectedOptionHighlight(); // Clear highlights
    }
  }

  function startDomMutationObserverForTokens() {
    if (domMutationObserver) return;
    const debouncedTokenCheck = debounce(() => {
      const foundToken = findTokenInPage();
      if (foundToken && foundToken !== currentTokenDetails.token) {
        if (isPanelVisible && panelElement && tokenInputElement) {
          tokenInputElement.value = foundToken;
          handleTokenInputChange(); // This will update everything including highlights
        } else if (!isPanelVisible) {
          showToastNotification(UI_TEXT.toastNewTokenOnPage, "info");
        }
      }
    }, 500);
    domMutationObserver = new MutationObserver(() => debouncedTokenCheck());
    const observerConfig = {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["href", "src", "value", "action", "data-url", "data-src", "data-href", "content"],
    };
    domMutationObserver.observe(document.body, observerConfig);
  }

  // --- Chrome Extension Message Handling / Fallback ---
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      let asyncResponse = false;
      if (message.action === "ping") { sendResponse({ status: "ready" }); }
      else if (message.action === "togglePanel") {
        if (isPanelVisible) closeAndCleanupPanel();
        else createAndShowPanel(message.token || findTokenInPage() || '');
        sendResponse({ success: true, visible: isPanelVisible });
        asyncResponse = true;
      } else if (message.action === "autoShowPanel") {
        if (!isPanelVisible) createAndShowPanel(findTokenInPage() || '');
        sendResponse({ success: true, panelVisible: isPanelVisible });
        asyncResponse = true;
      } else if (message.action === "newTokenDetected") {
        if (message.token && message.token !== currentTokenDetails.token) {
          if (isPanelVisible && panelElement && tokenInputElement) {
            tokenInputElement.value = message.token; handleTokenInputChange();
          } else showToastNotification("Đã phát hiện token mới!", "info"); // Use UI_TEXT
          sendResponse({ success: true });
        } else sendResponse({ success: false, reason: "Token is same or invalid" });
        asyncResponse = true;
      } else { sendResponse({ success: false, error: "Unknown action" }); }
      return asyncResponse;
    });
  } else {
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'G') { // Ctrl+Shift+G
            e.preventDefault(); // Prevent browser default action for this combo if any
            if (isPanelVisible) closeAndCleanupPanel();
            else createAndShowPanel(findTokenInPage() || '');
        }
    });
    console.info("Google One Toolkit: Running in non-extension mode. Use Ctrl+Shift+G to toggle panel.");
  }

})();