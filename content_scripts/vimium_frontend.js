"use strict";
(function() {
  var HUD, Tween, firstKeys, secondKeys, currentSeconds, time1 //
    , enterInsertModeWithoutShowingIndicator, executeFind, exitFindMode //
    , exitInsertMode, findAndFocus, findMode, findChangeListened //
    , findModeAnchorNode, findModeQuery, findModeQueryHasResults, focusFoundLink, followLink //
    , frameId, getNextQueryFromRegexMatches, handleDeleteForFindMode //
    , handleEnterForFindMode, handleEscapeForFindMode, handleKeyCharForFindMode, KeydownEvents //
    , CursorHider, ELs //
    , initializeWhenEnabled, insertModeLock //
    , isEnabledForUrl, isInsertMode, elementCanTakeInput //
    , isValidKey, getFullCommand, keyQueue //
    , setPassKeys, performFindInPlace //
    , restoreDefaultSelectionHighlight //
    , settings, showFindModeHUDForQuery, textInputXPath, oldActivated //
    , updateFindModeQuery, goBy, getVisibleInputs, mainPort, requestHandlers //
    ;
  
  frameId = Math.floor(Math.random() * 999999997) + 2;

  window._DEBUG = /*/ 1 /*/ 0 /**/;

  if (window._DEBUG) {
    time1 = Date.now();
  }

  insertModeLock = null;

  findMode = false;
  
  findChangeListened = 0;

  findModeQuery = {
    rawQuery: "",
    matchCount: 0,
    parsedQuery: "",
    isRegex: false,
    ignoreCase: false,
    activeRegexIndex: 0,
    regexMatches: null
  };

  findModeQueryHasResults = false;

  findModeAnchorNode = null;

  isEnabledForUrl = false;

  keyQueue = false;

  firstKeys = {};

  secondKeys = {"": {}};

  currentSeconds = {};
  
  oldActivated = {
    target: null,
    isSecond: false
  };

  textInputXPath = DomUtils.makeXPath([
    'input[not(@disabled or @readonly) and (@type="text" or @type="search" or @type="email" \
or @type="url" or @type="number" or @type="password" or @type="date" or @type="tel" or not(@type))]',
    "textarea",
    "*[@contenteditable='' or translate(@contenteditable, 'TRUE', 'true')='true']"
  ]);
  
  mainPort = {
    _port: null,
    _callbacks: {},
    postMessage: function(request, callback) {
      if (callback) {
        request = {
          _msgId: Utils.createUniqueId(),
          request: request
        };
      }
      this._get().postMessage(request);
      if (callback) {
        this._callbacks[request._msgId] = callback;
      }
      return callback ? request._msgId : -1;
    },
    Listener: function(response) {
      var id, handler;
      if (id = response._msgId) {
        handler = mainPort._callbacks[id];
        delete mainPort._callbacks[id];
        handler(response.response, id);
      } else {
        requestHandlers[response.name](response);
      }
    },
    ClearPort: function() {
      mainPort._port = null;
    },
    _get: function() {
      var port;
      if (port = this._port) {
        return port;
      }
      port = this._port = chrome.runtime.connect({ name: "main" });
      port.onDisconnect.addListener(this.ClearPort);
      port.onMessage.addListener(this.Listener);
      return port;
    }
  };

  settings = {
    values: {},
    valuesToLoad: ["scrollStepSize", "linkHintCharacters", "linkHintNumbers", "filterLinkHints" //
      , "hideHud", "previousPatterns", "nextPatterns", "findModeRawQuery", "regexFindMode" //
      , "smoothScroll" //
      , "findModeRawQueryList" //
    ], // should be the same as bg.Settings.valuesToLoad
    isLoading: 0,
    autoRetryInterval: 2000,
    set: function(key, value) {
      this.values[key] = value;
      mainPort.postMessage({
        handler: "setSetting",
        key: key,
        value: value
      });
    },
    refresh: function(keys) {
      mainPort.postMessage({
        handler: "getSettings",
        keys: ((keys instanceof Array) ? keys : [keys])
      }, settings.ReceiveSettings);
    },
    load: function(request2, err) {
      if (this.isLoading) {
        if (err) { err(); }
      } else {
        this.isLoading = setInterval(this.load.bind(this, request2, err), this.autoRetryInterval);
      }
      mainPort.postMessage({
        handlerSettings: "load",
        request: request2
      });
    },
    ReceiveSettings: function(response) {
      var _this = settings, ref = response.keys || _this.valuesToLoad, i, v1, v2;
      for (v1 = response.values, v2 = _this.values, i = v1.length; 0 <= --i; ) {
        v2[ref[i]] = v1[i];
      }
      if (i = _this.isLoading) {
        clearInterval(i);
        _this.isLoading = 0;
      }
      if (response = response.response) {
        requestHandlers[response.name](response);
      }
    }
  };

  ELs = { //
    focusMsg: {
      handler: "frameFocused",
      tabId: 0,
      status: "disabled",
      url: window.location.href,
      frameId: frameId
    }, css: null, //
    onKeydown: null, onKeypress: null, onKeyup: null, //
    docOnFocus: null, onBlur: null, onActivate: null, //
    destroy: null //
  };

  initializeWhenEnabled = function(newPassKeys) {
    (initializeWhenEnabled = setPassKeys)(newPassKeys);
    LinkHints.init();
    Scroller.init();
    CursorHider.init();
    window.addEventListener("keydown", ELs.onKeydown, true);
    window.addEventListener("keypress", ELs.onKeypress, true);
    window.addEventListener("keyup", ELs.onKeyup = function(event) {
      if (isEnabledForUrl) {
        var handledKeydown = KeydownEvents.pop(event);
        if (handlerStack.bubbleEvent("keyup", event) && handledKeydown) {
          DomUtils.suppressPropagation(event);
        }
      }
    }, true);
    // it seems window.addEventListener("focus") doesn't work (only now).
    document.addEventListener("focus", ELs.docOnFocus = function(event) {
      if (isEnabledForUrl && DomUtils.getEditableType(event.target) && !findMode) {
        enterInsertModeWithoutShowingIndicator(event.target);
        // it seems we do not need to check DomUtils.getEditableType(event.target) >= 2
        if (!oldActivated.target || oldActivated.isSecond) {
          oldActivated.target = event.target;
          oldActivated.isSecond = true;
        }
      }
    }, true);
    document.addEventListener("blur", ELs.onBlur = function(event) {
      if (isEnabledForUrl && DomUtils.getEditableType(event.target)) {
        exitInsertMode(event.target);
      }
    }, true);
    document.addEventListener("DOMActivate", ELs.onActivate = function(event) {
      if (isEnabledForUrl) {
        handlerStack.bubbleEvent('DOMActivate', event);
      }
    }, true);
    if (window._DEBUG) {
      console.log(frameId + ": set:", Date.now() - time1);
    }
    if (document.activeElement && DomUtils.getEditableType(document.activeElement) >= 2 && !findMode) {
      enterInsertModeWithoutShowingIndicator(document.activeElement);
    }
  };

  extend(window, {
    scrollToBottom: function() {
      Scroller.scrollTo("y", "max");
    },
    scrollToTop: function() {
      Scroller.scrollTo("y", 0);
    },
    scrollToLeft: function() {
      Scroller.scrollTo("x", 0);
    },
    scrollToRight: function() {
      Scroller.scrollTo("x", "max");
    },
    scrollUp: function() {
      Scroller.scrollBy("y", -1 * (settings.values.scrollStepSize || 100));
    },
    scrollDown: function() {
      Scroller.scrollBy("y", settings.values.scrollStepSize || 100);
    },
    scrollPageUp: function() {
      Scroller.scrollBy("y", "viewSize", -1 / 2);
    },
    scrollPageDown: function() {
      Scroller.scrollBy("y", "viewSize", 1 / 2);
    },
    scrollFullPageUp: function() {
      Scroller.scrollBy("y", "viewSize", -1);
    },
    scrollFullPageDown: function() {
      Scroller.scrollBy("y", "viewSize");
    },
    scrollLeft: function() {
      Scroller.scrollBy("x", -1 * (settings.values.scrollStepSize || 60));
    },
    scrollRight: function() {
      Scroller.scrollBy("x", settings.values.scrollStepSize || 60);
    },

    reload: function() {
      window.location.reload();
    },
    switchFocus: function() {
      var newEl = document.activeElement;
      if (newEl !== document.body) {
        oldActivated.target = newEl;
        oldActivated.isSecond = false;
        if (newEl.blur) {
          newEl.blur();
        }
        return;
      }
      newEl = oldActivated.target;
      if (!newEl || !DomUtils.isVisibile(newEl)) {
        return;
      }
      document.activeElement = newEl;
      oldActivated.target = null;
      if (newEl.scrollIntoViewIfNeeded) {
        newEl.scrollIntoViewIfNeeded();
      } else if (newEl.scrollIntoView) {
        newEl.scrollIntoView();
      }
      DomUtils.simulateHover(newEl);
      if (newEl.focus) {
        newEl.focus();
      }
    },
    simBackspace: function() {
      var el = document.activeElement;
      if (el === document.body) {
        switchFocus();
      } else if (!DomUtils.isVisibile(el) || DomUtils.getEditableType(el) < 2) {
        return;
      }
      DomUtils.simulateBackspace(el);
    },
    goBack: function(count) {
      history.go(-count);
    },
    goForward: function(count) {
      history.go(count);
    },
    goUp: function(count) {
      var url, urlsplit;
      url = window.location.href;
      if (url[url.length - 1] === "/") {
        url = url.substring(0, url.length - 1);
      }
      urlsplit = url.split("/");
      if (urlsplit.length > 3) {
        urlsplit = urlsplit.slice(0, Math.max(3, urlsplit.length - count));
        window.location.href = urlsplit.join('/');
      }
    },
    goToRoot: function() {
      window.location.href = window.location.origin;
    },
    showHelp: function() {
      mainPort.postMessage({
        handler: "initHelp",
      }, showHelpDialog);
    },
    toggleViewSource: function() {
      mainPort.postMessage({
        handler: "getCurrentTabUrl"
      }, function(url) {
        if (url.substring(0, 12) === "view-source:") {
          url = url.substring(12);
        } else {
          url = "view-source:" + url;
        }
        mainPort.postMessage({
          handler: "openUrlInNewTab",
          url: url
        });
      });
    },
    copyCurrentUrl: function() {
      mainPort.postMessage({
        handler: "getCurrentTabUrl"
      }, function(url) {
        mainPort.postMessage({
          handler: "copyToClipboard",
          data: url
        });
        HUD.showForDuration("Yanked URL" + ((url.length > 28)
            ? (url.substring(0, 25) + "...") : url), 2000);
      });
    },
    focusInput: function(count) {
      var hintContainingDiv, hints, selectedInputIndex, visibleInputs;
      visibleInputs = getVisibleInputs(DomUtils.evaluateXPath(textInputXPath, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE));
      if (visibleInputs.length === 0) {
        return;
      }
      selectedInputIndex = Math.min(count - 1, visibleInputs.length - 1);
      visibleInputs[selectedInputIndex].element.focus();
      if (visibleInputs.length === 1) {
        return;
      }
      hints = visibleInputs.map(function(tuple) {
        var hint = document.createElement("div");
        hint.className = "vimB vimI vimIH";
        hint.style.left = (tuple.rect[0] - 1) + "px";
        hint.style.top = (tuple.rect[1] - 1) + "px";
        hint.style.width = (tuple.rect[2] - tuple.rect[0]) + "px";
        hint.style.height = (tuple.rect[3] - tuple.rect[1]) + "px";
        return hint;
      });
      hints[selectedInputIndex].classList.add('vimS');
      hintContainingDiv = DomUtils.addElementList(hints, {
        id: "vimIMC",
        className: "vimB vimR"
      });
      hintContainingDiv.style.left = window.scrollX + "px";
      hintContainingDiv.style.top = window.scrollY + "px";
      handlerStack.push({
        keydown: function(event) {
          if (event.keyCode === KeyCodes.tab) {
            hints[selectedInputIndex].classList.remove('vimS');
            if (event.shiftKey) {
              if (--selectedInputIndex === -1) {
                selectedInputIndex = hints.length - 1;
              }
            } else if (++selectedInputIndex === hints.length) {
              selectedInputIndex = 0;
            }
            hints[selectedInputIndex].classList.add('vimS');
            visibleInputs[selectedInputIndex].element.focus();
          } else if (event.keyCode !== KeyCodes.shiftKey) {
            DomUtils.removeNode(hintContainingDiv);
            handlerStack.remove();
            return true;
          }
          return false;
        }
      });
    }
  });

  KeydownEvents = {
    _handledEvents: {},
    stringify: function(event) {
      return (event.metaKey + event.altKey * 2 + event.ctrlKey * 4) + "" //
         + event.keyCode + event.keyIdentifier;
    },
    push: function(event) {
      this._handledEvents[this.stringify(event)] = true;
    },
    pop: function(event) {
      var key = this.stringify(event), value = this._handledEvents[key];
      delete this._handledEvents[key];
      return value;
    }
  };

  ELs.onKeypress = function(event) {
    if (!isEnabledForUrl || !handlerStack.bubbleEvent('keypress', event) || event.keyCode < 32) {
      return;
    }
    var keyChar = String.fromCharCode(event.charCode);
    if (!keyChar) {
      return;
    }
    // it seems event can not be <a/c/m-*>
    if (findMode) {
      handleKeyCharForFindMode(keyChar);
      DomUtils.suppressEvent(event);
    } else if (isInsertMode()) {
    } else if (isValidKey(keyChar)) { // keyChar is just the full command
      mainPort.postMessage({
        handlerKey: keyChar
      });
      DomUtils.suppressEvent(event);
    }
  };

  ELs.onKeydown = function(event) {
    if (!isEnabledForUrl) {
      return;
    } else if (!handlerStack.bubbleEvent('keydown', event)) {
      KeydownEvents.push(event);
      return;
    }
    var keyChar, key = event.keyCode, action = -1;
    if (isInsertMode()) {
      if (key === KeyCodes.esc) {
        if (KeyboardUtils.isPlain(event)) {
          if (DomUtils.getEditableType(event.srcElement)) {
            event.srcElement.blur();
          }
          exitInsertMode();
          action = 2;
        }
      } else if (key >= KeyCodes.f1 && key <= KeyCodes.f12) {
        keyChar = getFullCommand(event, KeyboardUtils.getKeyName(event));
        if (isValidKey(keyChar)) {
          mainPort.postMessage({ handlerKey: keyChar });
          action = 2;
        }
      }
    }
    else if (findMode) {
      if (key === KeyCodes.esc) {
        if (KeyboardUtils.isPlain(event)) {
          handleEscapeForFindMode();
          action = 2;
        }
      } else if (key === KeyCodes.backspace || key === KeyCodes.deleteKey) {
        handleDeleteForFindMode();
        action = 2;
      } else if (key === KeyCodes.enter) {
        handleEnterForFindMode();
        action = 2;
      } else if (key >= 32 && (event.metaKey || event.ctrlKey || event.altKey)) {
        if (!KeyboardUtils.getKeyChar(event)) {
          action = 1;
        }
      } else if (event.keyIdentifier.startsWith("U+")) {
      } else if (! (key in KeyboardUtils.keyNames)) {
        action = 1;
      }
    }
    else if (key === KeyCodes.esc) {
      if (keyQueue && KeyboardUtils.isPlain(event)) {
        mainPort.postMessage({ handler: "esc" });
        action = 2
        keyQueue = false;
        currentSeconds = secondKeys[""];
      }
    } else if (!(keyChar = KeyboardUtils.getKeyChar(event))) {
    }
    else if ((key >= 32 && (event.metaKey || event.ctrlKey || event.altKey)) //
        || ! event.keyIdentifier.startsWith("U+")) {
      keyChar = getFullCommand(event, keyChar);
      if (isValidKey(keyChar)) {
        mainPort.postMessage({ handlerKey: keyChar });
        action = 2;
      }
    } else if (isValidKey(keyChar)) { // keyChar is just the full command
      action = 1;
    }
    if (action <= 0) {
      return;
    }
    if (action === 2) {
      DomUtils.suppressEvent(event);
    } else {
      DomUtils.suppressPropagation(event);
    }
    KeydownEvents.push(event);
  };

  (function() {
    var numRegex = /^[1-9]/, num0Regex = /^[0-9]/, passKeys = "";
    setPassKeys = function(newPassKeys) {
      passKeys = newPassKeys;
    };
    isValidKey = function(key) {
      if (passKeys && !keyQueue && passKeys.indexOf(key) !== -1) {
        return false;
      }
      return (key in firstKeys) || (key in currentSeconds) || //
        (keyQueue ? num0Regex : numRegex).test(key);
    };
  })();

  getFullCommand = function(event, keyChar) {
    var left = event.altKey ? "<a-" : "<";
    if (event.ctrlKey) {
      return left + (event.metaKey ? "c-m-" : "c-") + keyChar + ">";
    } else if (event.metaKey) {
      return left + "m-" + keyChar + ">";
    } else if (event.altKey || keyChar.length > 1) {
      return left + keyChar + ">";
    } else {
      return keyChar;
    }
  };

  window.enterInsertMode = function(target) {
    enterInsertModeWithoutShowingIndicator(target);
    HUD.show("Insert mode");
  };

  enterInsertModeWithoutShowingIndicator = function(target) {
    insertModeLock = target;
  };

  exitInsertMode = function(target) {
    if (target === undefined || insertModeLock === target) {
      insertModeLock = null;
      HUD.hide();
    }
  };

  isInsertMode = function() {
    if (insertModeLock !== null) {
      return true;
    }
    var el = document.activeElement;
    if (el && el.isContentEditable) {
      enterInsertModeWithoutShowingIndicator(el);
      return true;
    }
    return false;
  };

  getVisibleInputs = function(pathSet) {
    for (var element, rect, results = [], i = 0, _ref = pathSet.snapshotLength; i < _ref; ++i) {
      element = pathSet.snapshotItem(i);
      rect = DomUtils.getVisibleClientRect(element);
      if (rect) {
        results.push({
          element: element,
          rect: rect
        });
      }
    }
    return results;
  };
  
  updateFindModeQuery = function() {
    var error, escapeRegEx, hasNoIgnoreCaseFlag, parsedNonRegexQuery, pattern, text, _ref;
    findModeQuery.isRegex = settings.values.regexFindMode ? true : false;
    hasNoIgnoreCaseFlag = false;
    findModeQuery.parsedQuery = findModeQuery.rawQuery.replace(/\\./g, function(match) {
      switch (match) {
        case "\\r":
          findModeQuery.isRegex = true;
          return "";
        case "\\R":
          findModeQuery.isRegex = false;
          return "";
        case "\\I":
          hasNoIgnoreCaseFlag = true;
          return "";
        case "\\\\":
          return "\\";
        default:
          return match;
      }
    });
    findModeQuery.ignoreCase = !hasNoIgnoreCaseFlag && !Utils.hasUpperCase(findModeQuery.parsedQuery);
    if (findModeQuery.isRegex) {
      try {
        pattern = new RegExp(findModeQuery.parsedQuery, "g" + (findModeQuery.ignoreCase ? "i" : ""));
      } catch (_error) {
        error = _error;
        return;
      }
      text = document.body.innerText;
      findModeQuery.regexMatches = text.match(pattern);
      findModeQuery.activeRegexIndex = 0;
      findModeQuery.matchCount = (findModeQuery.regexMatches || []).length;
    } else {
      escapeRegEx = /[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g;
      parsedNonRegexQuery = findModeQuery.parsedQuery.replace(escapeRegEx, function(ch) {
        return "\\" + ch;
      });
      pattern = new RegExp(parsedNonRegexQuery, "g" + (findModeQuery.ignoreCase ? "i" : ""));
      text = document.body.innerText;
      findModeQuery.matchCount = (text.match(pattern) || []).length;
    }
  };

  handleKeyCharForFindMode = function(keyChar) {
    findModeQuery.rawQuery += keyChar;
    updateFindModeQuery();
    performFindInPlace();
    showFindModeHUDForQuery();
  };

  handleEscapeForFindMode = function() {
    var range, selection;
    exitFindMode();
    restoreDefaultSelectionHighlight();
    selection = window.getSelection();
    if (!selection.isCollapsed) {
      range = selection.getRangeAt(0);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    focusFoundLink();
    if (findModeQueryHasResults && DomUtils.canTakeInput(findModeAnchorNode)) {
      DomUtils.simulateSelect(document.activeElement);
      enterInsertModeWithoutShowingIndicator(document.activeElement);
    }
  };

  handleDeleteForFindMode = function() {
    if (! findModeQuery.rawQuery) {
      exitFindMode();
      performFindInPlace();
    } else {
      findModeQuery.rawQuery = findModeQuery.rawQuery.substring(0, findModeQuery.rawQuery.length - 1);
      updateFindModeQuery();
      performFindInPlace();
      showFindModeHUDForQuery();
    }
  };

  handleEnterForFindMode = function() {
    exitFindMode();
    focusFoundLink();
    document.body.classList.add("vimFindMode");
    settings.set("findModeRawQuery", findModeQuery.rawQuery);
  };

  performFindInPlace = function() {
    var cachedScrollX = window.scrollX, cachedScrollY = window.scrollY
      , query = findModeQuery.isRegex ? getNextQueryFromRegexMatches(0) : findModeQuery.parsedQuery;
    executeFind(query, {
      backwards: true,
      caseSensitive: !findModeQuery.ignoreCase
    });
    window.scrollTo(cachedScrollX, cachedScrollY);
    executeFind(query, {
      caseSensitive: !findModeQuery.ignoreCase
    });
  };

  executeFind = function(query, options) {
    var oldFindMode = findMode, result;
    findMode = true;
    document.body.classList.add("vimFindMode");
    HUD.hide(true);
    findModeQueryHasResults = !!window.find(query, options.caseSensitive, options.backwards, true, false, true, false);
    if (findChangeListened === 0) {
      findChangeListened = setTimeout(function() {
        document.addEventListener("selectionchange", restoreDefaultSelectionHighlight, true);
      }, 1000);
    }
    findMode = oldFindMode;
    findModeAnchorNode = document.getSelection().anchorNode;
  };

  restoreDefaultSelectionHighlight = function() {
    document.body.classList.remove("vimFindMode");
    document.removeEventListener("selectionchange", restoreDefaultSelectionHighlight, true);
    if (findChangeListened) {
      clearTimeout(findChangeListened);
      findChangeListened = 0;
    }
  };

  focusFoundLink = function() {
    if (findModeQueryHasResults) {
      var link, node = window.getSelection().anchorNode;
      while (node && node !== document.body) {
        if (node.nodeName.toLowerCase() === "a") {
          node.focus();
          return;
        }
        node = node.parentNode;
      }
    }
  };

  getNextQueryFromRegexMatches = function(stepSize) {
    var totalMatches;
    if (!findModeQuery.regexMatches) {
      return "";
    }
    totalMatches = findModeQuery.regexMatches.length;
    findModeQuery.activeRegexIndex += stepSize + totalMatches;
    findModeQuery.activeRegexIndex %= totalMatches;
    return findModeQuery.regexMatches[findModeQuery.activeRegexIndex];
  };

  findAndFocus = function(backwards) {
    var mostRecentQuery, query;
    mostRecentQuery = settings.values.findModeRawQuery || "";
    if (mostRecentQuery !== findModeQuery.rawQuery) {
      findModeQuery.rawQuery = mostRecentQuery;
      updateFindModeQuery();
    }
    query = findModeQuery.isRegex ? getNextQueryFromRegexMatches(backwards ? -1 : 1) : findModeQuery.parsedQuery;
    executeFind(query, {
      backwards: backwards,
      caseSensitive: !findModeQuery.ignoreCase
    });
    if (!findModeQueryHasResults) {
      HUD.showForDuration("No matches for '" + findModeQuery.rawQuery + "'", 1000);
      return;
    }
    focusFoundLink();
    // TODO: remove this `if`
    if (DomUtils.canTakeInput(findModeAnchorNode)) {
      handlerStack.push({
        keydown: function(event) {
          handlerStack.remove();
          if (event.keyCode === KeyCodes.esc && KeyboardUtils.isPlain(event)) {
            DomUtils.simulateSelect(document.activeElement);
            enterInsertModeWithoutShowingIndicator(document.activeElement);
            return false;
          }
          return true;
        }
      });
    }
  };

  window.performFind = function() {
    findAndFocus();
  };

  window.performBackwardsFind = function() {
    findAndFocus(true);
  };

  followLink = function(linkElement) {
    if (linkElement.nodeName.toLowerCase() === "link") {
      window.location.href = linkElement.href;
    } else {
      linkElement.scrollIntoView();
      linkElement.focus();
      DomUtils.simulateClick(linkElement, {
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false
      });
    }
  };
  
  goBy = function(relName, pattern) {
    if (relName && typeof relName === "string" && goBy.findAndFollowRel(relName)) {
      return true;
    }
    pattern = typeof pattern === "string" && (pattern = pattern.trim())
      ? pattern.toLowerCase().split(/\s*,\s*/).filter(function(s) { return s.length;})
      : (pattern instanceof Array) ? pattern : [];
    if (pattern.length > 0) {
      goBy.findAndFollowLink(pattern);
    }
  };

  goBy.findAndFollowLink = function(linkStrings) {
    var boundingClientRect, candidateLinks, computedStyle, exactWordRegex, link, linkString, links, linksXPath, _i, _j, _len, _len1;
    linksXPath = DomUtils.makeXPath(["a", "*[@onclick or @role='link' or contains(@class, 'button')]"]);
    links = DomUtils.evaluateXPath(linksXPath, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
    candidateLinks = [];
    _len = links.snapshotLength;
    while (0 <= --_len) {
      link = links.snapshotItem(_len);
      boundingClientRect = link.getBoundingClientRect();
      if (boundingClientRect.width === 0 || boundingClientRect.height === 0) {
        continue;
      }
      computedStyle = window.getComputedStyle(link, null);
      if (computedStyle.getPropertyValue("visibility") !== "visible" || computedStyle.getPropertyValue("display") === "none") {
        continue;
      }
      linkString = link.innerText.toLowerCase();
      for (_j = 0, _len1 = linkStrings.length; _j < _len1; _j++) {
        if (linkString.indexOf(linkStrings[_j]) !== -1) {
          candidateLinks.push(link);
          break;
        }
      }
    }
    _len = candidateLinks.length;
    if (_len === 0) {
      return;
    }
    while (0 <= --_len) {
      link = candidateLinks[_len];
      link.wordCount = link.innerText.trim().split(/\s+/).length;
      link.originalIndex = _len;
    }
    candidateLinks = candidateLinks.sort(function(a, b) {
      return (a.wordCount - b.wordCount) || (a.originalIndex - b.originalIndex);
    });
    _len = candidateLinks[0].wordCount + 1;
    candidateLinks = candidateLinks.filter(function(a) {
      return a.wordCount <= _len;
    });
    for (_i = 0, _len = linkStrings.length; _i < _len; _i++) {
      linkString = linkStrings[_i];
      exactWordRegex = /\b/.test(linkString[0]) || /\b/.test(linkString[linkString.length - 1]) ? new RegExp("\\b" + linkString + "\\b", "i") : new RegExp(linkString, "i");
      for (_j = 0, _len1 = candidateLinks.length; _j < _len1; _j++) {
        link = candidateLinks[_j];
        if (exactWordRegex.test(link.innerText)) {
          followLink(link);
          return true;
        }
      }
    }
    return false;
  };

  goBy.findAndFollowRel = function(value) {
    var element, elements, relTags, tag, _i, _j, _len, _len1;
    relTags = ["link", "a", "area"];
    for (_i = 0, _len = relTags.length; _i < _len; _i++) {
      tag = relTags[_i];
      elements = document.getElementsByTagName(tag);
      for (_j = 0, _len1 = elements.length; _j < _len1; _j++) {
        element = elements[_j];
        if (element.hasAttribute("rel") && element.rel.toLowerCase() === value) {
          followLink(element);
          return true;
        }
      }
    }
    return false;
  };

  window.goPrevious = function() {
    goBy("prev", settings.values.previousPatterns || "");
  };

  window.goNext = function() {
    goBy("next", settings.values.nextPatterns || "");
  };

  showFindModeHUDForQuery = function() {
    if (findModeQueryHasResults || !findModeQuery.parsedQuery) {
      HUD.show("/" + findModeQuery.rawQuery + " (" + findModeQuery.matchCount + " Matches)");
    } else {
      HUD.show("/" + findModeQuery.rawQuery + " (No Matches)");
    }
  };

  window.enterFindMode = function() {
    findModeQuery.rawQuery = "";
    findMode = true;
    HUD.show("/");
  };

  exitFindMode = function() {
    findMode = false;
    HUD.hide();
  };

  window.showHelpDialog = function(response) {
    var container, handlerId, oldShowHelp, hide, toggleAdvancedCommands, //
    showAdvancedCommands, shouldShowAdvanced = response.advanced === true;
    if (!document.body) {
      return;
    }
    container = document.createElement("div");
    container.id = "vimHelpDialogContainer";
    container.className = "vimB vimR";
    (document.documentElement || document.body).appendChild(container);
    container.addEventListener("mousewheel", DomUtils.suppressPropagation, false);
    container.innerHTML = response.html;

    hide = function(event) {
      handlerStack.remove(handlerId);
      DomUtils.removeNode(container);
      window.showHelp = oldShowHelp;
      if (event) {
        DomUtils.suppressEvent(event);
      }
      container.innerHTML = "";
      container = null;
    };
    toggleAdvancedCommands = function(event) {
      shouldShowAdvanced = !shouldShowAdvanced;
      showAdvancedCommands(shouldShowAdvanced);
      settings.set("showAdvancedCommands", shouldShowAdvanced);
      DomUtils.suppressEvent(event);
    };
    showAdvancedCommands = function(visible) {
      var advancedEls, el, _i, _len;
      document.getElementById("vimAdvancedCommands").innerHTML = visible ? "Hide advanced commands" : "Show advanced commands...";
      advancedEls = container.getElementsByClassName("vimHelpAdvanced");
      visible = visible ? "table-row" : "none";
      for (_i = 0, _len = advancedEls.length; _i < _len; _i++) {
        el = advancedEls[_i];
        el.style.display = visible;
      }
    };
    
    oldShowHelp = window.showHelp;
    document.getElementById("vimAdvancedCommands").addEventListener("click" //
      , toggleAdvancedCommands, false);
    document.getElementById("vimCloseButton").addEventListener("click" //
      , window.showHelp = hide, false);
    document.getElementById("vimOptionsPage").addEventListener("click", function(event) {
      mainPort.postMessage({
        handler: "openRawUrlInNewTab",
        url: "pages/options.html"
      });
      DomUtils.suppressEvent(event);
    }, false);
    document.getElementById("vimHelpDialog").style.maxHeight = window.innerHeight - 80;
    showAdvancedCommands(shouldShowAdvanced);
    handlerId = handlerStack.unshift({
      keydown: function(event) {
        if (event.keyCode === KeyCodes.esc && KeyboardUtils.isPlain(event)) {
          hide(event);
          return false;
        }
        return true;
      }
    });
  };

  HUD = {
    _tweenId: -1,
    _displayElement: null,
    _durationTimer: 0,
    showForDuration: function(text, duration) {
      this.show(text);
      this._durationTimer = setTimeout(this.hide.bind(this, false), duration);
    },
    show: function(text) {
      if (!this.enabled()) {
        return;
      }
      clearTimeout(this._durationTimer);
      this._durationTimer = 0;
      var el = this.displayElement();
      el.innerText = text;
      clearInterval(this._tweenId);
      this._tweenId = Tween.fade(el, 1.0, 150);
      el.style.display = "";
    },
    displayElement: function() {
      var element = this._displayElement;
      if (!element) {
        element = this._displayElement = document.createElement("div");
        element.className = "vimB vimR vimHUD";
        document.documentElement.appendChild(element);
        element.style.right = "150px";
      }
      return element;
    },
    hide: function(immediate) {
      var hud = HUD, el;
      clearInterval(hud._tweenId);
      if (!(el = hud._displayElement)) {
      } else if (immediate) {
        el.style.display = "none";
      } else {
        hud._tweenId = Tween.fade(el, 0, 150, function() {
          el.style.display = "none";
        });
      }
    },
    enabled: function() {
      return !settings.values.hideHud;
    },
    destroy: function() {
      clearInterval(this._tweenId);
      clearInterval(this._durationTimer);
      this._displayElement && DomUtils.removeNode(this._displayElement);
      HUD = null;
    }
  };

  Tween = {
    fade: function(element, toAlpha, duration, onComplete) {
      var state = {
        duration: duration,
        startTime: Date.now(),
        from: parseInt(element.style.opacity) || 0,
        to: toAlpha,
        onUpdate: null,
        timerId: 0
      };
      state.onUpdate = function(value) {
        element.style.opacity = value;
        if (value === state.to && onComplete) {
          onComplete();
        }
      };
      return state.timerId = setInterval((function() {
        Tween.performTweenStep(state);
      }), 50);
    },
    performTweenStep: function(state) {
      var elapsed = Date.now() - state.startTime;
      if (elapsed >= state.duration) {
        clearInterval(state.timerId);
        state.onUpdate(state.to);
      } else {
        state.onUpdate((elapsed / state.duration) * (state.to - state.from) + state.from);
      }
    }
  };

  CursorHider = {
    cursorHideStyle: null,
    isScrolling: false,
    onScroll: function(event) {
      CursorHider.isScrolling = true;
      if (!CursorHider.cursorHideStyle.parentElement) {
        document.head.appendChild(CursorHider.cursorHideStyle);
      }
    },
    onMouseMove: function(event) {
      if (CursorHider.cursorHideStyle.parentElement && !CursorHider.isScrolling) {
        CursorHider.cursorHideStyle.remove();
      }
      return CursorHider.isScrolling = false;
    },
    init: function() {
      return;
      this.cursorHideStyle = document.createElement("style");
      this.cursorHideStyle.innerHTML = "body * {pointer-events: none !important; cursor: none !important;}\nbody, html {cursor: none !important;}";
      window.addEventListener("mousemove", this.onMouseMove);
      window.addEventListener("scroll", this.onScroll);
    }
  };

  window.settings = settings;

  window.HUD = HUD;

  window.mainPort = mainPort;

  requestHandlers = {
    checkIfEnabled: function() {
      mainPort.postMessage(initializeWhenEnabled !== setPassKeys ? {
        handler: "initIfEnabled",
        isTop: false, // icon is set when window.focus
        tabId: ELs.focusMsg.tabId,
        url: window.location.href
      } : {
        handler: "checkIfEnabled",
        url: window.location.href
      }, mainPort.Listener);
    },
    ifEnabled: function(response) {
      ELs.focusMsg.status = response.passKeys ? "partial" : "enabled";
      if (response.tabId) {
        ELs.focusMsg.tabId = response.tabId;
        requestHandlers.refreshKeyMappings(response);
        requestHandlers.refreshKeyQueue(response);
      }
      initializeWhenEnabled(response.passKeys);
      isEnabledForUrl = true;
    },
    ifDisabled: function(response) {
      isEnabledForUrl = false;
      var msg = ELs.focusMsg;
      if (response.tabId) {
        msg.tabId = response.tabId;
      } else {
        HUD.hide();
      }
      msg.status = "disabled";
    },
    settings: settings.ReceiveSettings,
    registerFrame: function(request) {
      if (window._DEBUG >= 2) {
        console.log(frameId + ": reg:", Date.now() - time1, "@", document.readyState);
      }
      // reRegisterFrame is called only when document.ready
      requestHandlers.injectCSS(request);
    },
    reRegisterFrame: function(request) {
      if (document.body && document.body.nodeName.toLowerCase() !== "frameset") {
        mainPort.postMessage({
          handlerSettings: request ? request.work : "reg",
          frameId: frameId
        });
      }
    },
    injectCSS: function(request) {
      var css = ELs.css = document.createElement("style");
      css.id = "vimUserCss";
      css.type = "text/css";
      css.innerHTML = request.css;
      document.head.appendChild(css);
    },
    showHUDforDuration: function(request) {
      HUD.showForDuration(request.text, request.duration);
    },
    focusFrame: function(request) {
      if (frameId !== request.frameId) { return; }
      if (window.innerWidth < 3 || window.innerHeight < 3) {
        mainPort.postMessage({
          handler: "nextFrame",
          tabId: ELs.focusMsg.tabId,
          frameId: frameId
        });
        return;
      }
      window.focus();
      if (document.body && request.highlight) {
        var borderWas = document.body.style.border;
        document.body.style.border = '5px solid yellow';
        setTimeout((function() {
          document.body.style.border = borderWas;
        }), 200);
      }
    },
    refreshKeyMappings: function(response) {
      var arr = response.firstKeys, i = arr.length, map, key, sec, sec2;
      map = firstKeys = {};
      map.__proto__ = null;
      while (0 <= --i) {
        map[arr[i]] = 1;
      }
      sec = response.secondKeys;
      sec2 = secondKeys = {};
      sec2.__proto__ = null;
      for (key in sec) {
        arr = sec[key];
        map = sec2[key] = {};
        map.__proto__ = null;
        i = arr.length;
        while (0 <= --i) {
          map[arr[i]] = 1;
        }
      }
    },
    refreshKeyQueue: function(response) {
      if (response.currentFirst !== null) {
        keyQueue = true;
        currentSeconds = secondKeys[response.currentFirst];
      } else {
        keyQueue = false;
        currentSeconds = secondKeys[""];
      }
    },
    esc: function() {
      keyQueue = false;
      currentSeconds = secondKeys[""];
    },
    executePageCommand: function(request) {
      keyQueue = false;
      currentSeconds = secondKeys[""];
      if (request.count < 0) {
        Utils.invokeCommandString(request.command, -request.count);
      } else {
        for (var i = 0, _ref = request.count; i < _ref; ++i) {
          Utils.invokeCommandString(request.command);
        }
      }
    },
    setScrollPosition: function(request) {
      var scrollX = request.scroll[0], scrollY = request.scroll[1];
      if (scrollX > 0 || scrollY > 0) {
        DomUtils.DocumentReady(window.scrollTo.bind(window, scrollX, scrollY));
      }
    }
  };

  settings.load({
    handler: "initIfEnabled",
    isTop: window.top === window.self,
    url: window.location.href
  }, function() {
    if (document.readyState !== "loading") {
      requestHandlers.reRegisterFrame({
        work: "doreg"
      });
    }
  });

  DomUtils.DocumentReady(function() {
    requestHandlers.reRegisterFrame();
    window.onunload = function() {
      try {
        mainPort.postMessage({
          handlerSettings: "unreg",
          frameId: frameId,
          isTop: window.top === window.self,
        });
      } catch (e) {
      }
    };
    // NOTE: here, we should always postMessage, since
    //     NO MESSAGE will be sent if not isEnabledForUrl,
    // which would make the auto-destroy logic not work.
    window.onfocus = (function() {
      try {
        this();
      } catch (e) {
        // this extension is reloaded
        ELs.destroy();
      }
    }).bind(mainPort.postMessage.bind( //
      mainPort, ELs.focusMsg, requestHandlers.refreshKeyQueue //
    ));
  });

  chrome.runtime.onMessage.addListener(function(request, handler, sendResponse) {
    sendResponse(0);
    if (isEnabledForUrl) {
      requestHandlers[request.name](request); // do not check `handler != null`
    } else if (request.name === "checkIfEnabled") {
      requestHandlers.checkIfEnabled();
    }
  });

  if (window._DEBUG >= 3) {
    console.log(frameId + ": got:", Date.now() - time1);
  }

  ELs.destroy = function() {
    isEnabledForUrl = false;
    window.onfocus = null;
    window.onunload = null;
    window.removeEventListener("keydown", this.onKeydown, true);
    window.removeEventListener("keypress", this.onKeypress, true);
    window.removeEventListener("keyup", this.onKeyup, true);
    document.removeEventListener("focus", this.docOnFocus, true);
    document.removeEventListener("blur", this.onBlur, true);
    document.removeEventListener("DOMActivate", this.onActivate, true);
    Vomnibar.destroy();
    LinkHints.destroy();
    HUD.destroy();
    mainPort = null;
    requestHandlers = null;
    if (ELs.css) {
      DomUtils.removeNode(ELs.css);
    }
    console.log("%cvim %c#" + frameId + "%c has destroyed."//
      , "color:red", "color:blue", "color:auto");
    window.frameId = frameId;
    window.tabId = ELs.focusMsg.tabId;
    window.isEnabledForUrl = false;
    ELs = null;
  };

})();