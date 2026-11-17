(function () {
  const THUMB_SIZE = 360;
  const DISCOVERY_BATCH_SIZE = 8;
  const OWNER_TOPICS_KEY = "xintycd-owned-topics";
  const PARTICIPATED_RESULTS_KEY = "xintycd-participated-results";
  const PRIVATE_TOPIC_PASSWORDS_KEY = "xintycd-private-topic-passwords";
  const PARTICIPANT_ID_KEY = "xintycd-participant-id";
  const DEFAULT_TOPIC_CATEGORIES = ["综合", "娱乐", "吃喝", "游戏", "校园", "生活", "二次元", "影视", "音乐", "科技", "其他"];
  const tiers = [
    { id: "bang", label: "夯" },
    { id: "top", label: "顶级" },
    { id: "elite", label: "人上人" },
    { id: "npc", label: "NPC" },
    { id: "trash", label: "拉完了" },
  ];

  const state = {
    topics: [],
    categories: [...DEFAULT_TOPIC_CATEGORIES],
    selectedCategory: "全部",
    discoveryOffset: 0,
    currentTopic: null,
    draggedItemId: null,
    lastItemDragAt: 0,
    reviewActive: false,
    reviewQueue: [],
    reviewIndex: 0,
    saving: false,
    reviewAnimating: false,
    settlingItemId: "",
    mode: "owner",
    ownerItems: [],
    currentResult: null,
    historyTab: "owned",
    historyOwnedTopics: [],
    historyParticipatedResults: [],
  };

  const els = {
    homeView: document.querySelector("#homeView"),
    boardView: document.querySelector("#boardView"),
    resultView: document.querySelector("#resultView"),
    createForm: document.querySelector("#createForm"),
    joinForm: document.querySelector("#joinForm"),
    joinCode: document.querySelector("#joinCode"),
    joinPassword: document.querySelector("#joinPassword"),
    topicTitle: document.querySelector("#topicTitle"),
    topicAuthor: document.querySelector("#topicAuthor"),
    topicCategory: document.querySelector("#topicCategory"),
    topicPasswordField: document.querySelector("#topicPasswordField"),
    topicPassword: document.querySelector("#topicPassword"),
    categoryList: document.querySelector("#categoryList"),
    topicList: document.querySelector("#topicList"),
    refreshTopicsButton: document.querySelector("#refreshTopicsButton"),
    homeButton: document.querySelector("#homeButton"),
    shareButton: document.querySelector("#shareButton"),
    boardTitle: document.querySelector("#boardTitle"),
    topicAuthorLine: document.querySelector("#topicAuthorLine"),
    editTopicInfoButton: document.querySelector("#editTopicInfoButton"),
    topicMeta: document.querySelector("#topicMeta"),
    rankingBoard: document.querySelector("#rankingBoard"),
    objectDock: document.querySelector(".object-dock"),
    objectForm: document.querySelector("#objectForm"),
    itemNameField: document.querySelector("#itemNameField"),
    itemName: document.querySelector("#itemName"),
    itemImage: document.querySelector("#itemImage"),
    itemShowName: document.querySelector("#itemShowName"),
    itemPool: document.querySelector("#itemPool"),
    itemCounter: document.querySelector("#itemCounter"),
    startReviewButton: document.querySelector("#startReviewButton"),
    stopReviewButton: document.querySelector("#stopReviewButton"),
    reviewStage: document.querySelector("#reviewStage"),
    reviewCard: document.querySelector("#reviewCard"),
    reviewProgress: document.querySelector("#reviewProgress"),
    copyShareButton: document.querySelector("#copyShareButton"),
    deleteTopicButton: document.querySelector("#deleteTopicButton"),
    shareDialog: document.querySelector("#shareDialog"),
    shareLink: document.querySelector("#shareLink"),
    shareUrl: document.querySelector("#shareUrl"),
    shareNote: document.querySelector("#shareNote"),
    dialogCopyButton: document.querySelector("#dialogCopyButton"),
    dialogCopyUrlButton: document.querySelector("#dialogCopyUrlButton"),
    historyDialog: document.querySelector("#historyDialog"),
    historyList: document.querySelector("#historyList"),
    historyOwnedTab: document.querySelector("#historyOwnedTab"),
    historyParticipatedTab: document.querySelector("#historyParticipatedTab"),
    editTiersButton: document.querySelector("#editTiersButton"),
    tiersDialog: document.querySelector("#tiersDialog"),
    tiersForm: document.querySelector("#tiersForm"),
    tierEditorGrid: document.querySelector("#tierEditorGrid"),
    closeTiersButton: document.querySelector("#closeTiersButton"),
    topicInfoDialog: document.querySelector("#topicInfoDialog"),
    topicInfoForm: document.querySelector("#topicInfoForm"),
    editTopicTitle: document.querySelector("#editTopicTitle"),
    editTopicAuthor: document.querySelector("#editTopicAuthor"),
    editTopicCategory: document.querySelector("#editTopicCategory"),
    editTopicPasswordField: document.querySelector("#editTopicPasswordField"),
    editTopicPassword: document.querySelector("#editTopicPassword"),
    closeTopicInfoButton: document.querySelector("#closeTopicInfoButton"),
    forkDialog: document.querySelector("#forkDialog"),
    forkForm: document.querySelector("#forkForm"),
    forkSourceId: document.querySelector("#forkSourceId"),
    forkTitle: document.querySelector("#forkTitle"),
    forkPasswordField: document.querySelector("#forkPasswordField"),
    forkPassword: document.querySelector("#forkPassword"),
    closeForkButton: document.querySelector("#closeForkButton"),
    comparisonPanel: document.querySelector("#comparisonPanel"),
    comparisonScore: document.querySelector("#comparisonScore"),
    comparisonSummary: document.querySelector("#comparisonSummary"),
    comparisonList: document.querySelector("#comparisonList"),
    resultTitle: document.querySelector("#resultTitle"),
    resultMeta: document.querySelector("#resultMeta"),
    resultAuthorLine: document.querySelector("#resultAuthorLine"),
    resultRankingPreview: document.querySelector("#resultRankingPreview"),
    resultScore: document.querySelector("#resultScore"),
    resultSummary: document.querySelector("#resultSummary"),
    resultShareNote: document.querySelector("#resultShareNote"),
    resultList: document.querySelector("#resultList"),
    copyResultLinkButton: document.querySelector("#copyResultLinkButton"),
    backToTopicButton: document.querySelector("#backToTopicButton"),
  };

  init();

  async function init() {
    bindEvents();
    await loadCategories();
    populateTopicCategorySelect();
    renderBoardShell();
    await restoreFromUrl();
  }

  function bindEvents() {
    els.createForm.addEventListener("submit", handleCreateTopic);
    els.joinForm.addEventListener("submit", handleJoinTopic);
    els.objectForm.addEventListener("submit", handleAddItem);
    els.homeButton.addEventListener("click", goHome);
    els.shareButton.addEventListener("click", openHistoryDialog);
    els.copyShareButton.addEventListener("click", openShareDialog);
    els.dialogCopyButton.addEventListener("click", copyCurrentShareCode);
    els.dialogCopyUrlButton.addEventListener("click", copyCurrentShareUrl);
    els.copyResultLinkButton.addEventListener("click", copyCurrentResultLink);
    els.backToTopicButton.addEventListener("click", openCurrentResultTopic);
    els.editTopicInfoButton.addEventListener("click", openTopicInfoDialog);
    els.historyOwnedTab.addEventListener("click", () => setHistoryTab("owned"));
    els.historyParticipatedTab.addEventListener("click", () => setHistoryTab("participated"));
    els.topicInfoForm.addEventListener("submit", handleSaveTopicInfo);
    els.closeTopicInfoButton.addEventListener("click", closeTopicInfoDialog);
    els.editTiersButton.addEventListener("click", openTiersDialog);
    els.tiersForm.addEventListener("submit", handleSaveTiers);
    els.closeTiersButton.addEventListener("click", closeTiersDialog);
    els.forkForm.addEventListener("submit", handleCreateFork);
    els.closeForkButton.addEventListener("click", closeForkDialog);
    els.deleteTopicButton.addEventListener("click", deleteCurrentTopic);
    els.refreshTopicsButton.addEventListener("click", rotateDiscoveryTopics);
    els.startReviewButton.addEventListener("click", startReview);
    els.stopReviewButton.addEventListener("click", stopReview);
    els.itemShowName.addEventListener("change", handleShowNamesChange);
    els.itemImage.addEventListener("change", syncItemNameField);
    bindFileDropUpload();
    els.createForm.querySelectorAll('input[name="visibility"]').forEach((input) => {
      input.addEventListener("change", syncCreatePasswordField);
    });
    els.forkForm.querySelectorAll('input[name="forkVisibility"]').forEach((input) => {
      input.addEventListener("change", syncForkPasswordField);
    });
    window.addEventListener("popstate", restoreFromUrl);
    syncCreatePasswordField();
    syncForkPasswordField();
    syncItemNameField();
  }

  async function restoreFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const topicId = params.get("topic");
    const resultId = params.get("result");
    const shareMode = params.get("share") === "1";
    if (topicId && resultId) {
      try {
        await showResult(topicId, resultId, { replaceUrl: true, confirmPassword: true });
      } catch (error) {
        alert(error.message || "结果不存在");
        await showHome();
      }
      return;
    }
    if (topicId) {
      try {
        await showBoard(topicId, { replaceUrl: true, shareMode, confirmPassword: shareMode });
      } catch (error) {
        alert(error.message || "主题不存在");
        await showHome();
      }
      return;
    }
    await showHome();
  }

  async function handleCreateTopic(event) {
    event.preventDefault();
    const form = new FormData(els.createForm);
    const title = String(form.get("topicTitle") || "").trim();
    const author = String(form.get("topicAuthor") || "").trim();
    const category = normalizeCategory(form.get("topicCategory"));
    const visibility = String(form.get("visibility") || "public");
    const sharePassword = String(form.get("sharePassword") || "").trim();
    if (!title || !author || !category) return;
    if (visibility === "private" && !sharePassword) {
      alert("私有主题需要设置分享密码");
      els.topicPassword.focus();
      return;
    }

    const { topic } = await api("/api/topics", {
      method: "POST",
      body: JSON.stringify({ title, author, category, visibility, sharePassword }),
    });

    els.createForm.reset();
    populateTopicCategorySelect();
    syncCreatePasswordField();
    rememberOwnedTopic(topic.id);
    rememberPrivateTopicPassword(topic.id, sharePassword);
    await showBoard(topic.id, { password: sharePassword });
  }

  async function handleJoinTopic(event) {
    event.preventDefault();
    const topicId = parseShareCode(els.joinCode.value);
    if (!topicId) return;
    try {
      await showBoard(topicId, { shareMode: true, password: els.joinPassword.value.trim() });
      els.joinForm.reset();
    } catch (error) {
      alert(error.message || "主题不存在");
    }
  }

  function syncCreatePasswordField() {
    const visibility = new FormData(els.createForm).get("visibility") || "public";
    const isPrivate = visibility === "private";
    els.topicPasswordField.hidden = !isPrivate;
    els.topicPassword.required = isPrivate;
    if (!isPrivate) els.topicPassword.value = "";
  }

  function syncForkPasswordField() {
    const visibility = new FormData(els.forkForm).get("forkVisibility") || "public";
    const isPrivate = visibility === "private";
    els.forkPasswordField.hidden = !isPrivate;
    els.forkPassword.required = isPrivate;
    if (!isPrivate) els.forkPassword.value = "";
  }

  async function showHome() {
    stopReview({ silent: true });
    state.currentTopic = null;
    state.ownerItems = [];
    state.currentResult = null;
    state.mode = "owner";
    els.homeView.hidden = false;
    els.boardView.hidden = true;
    els.resultView.hidden = true;
    els.shareButton.disabled = false;
    els.comparisonPanel.hidden = true;
    history.replaceState(null, "", cleanBaseUrl());
    await loadTopicList();
  }

  function goHome() {
    showHome();
  }

  async function showBoard(topicId, options = {}) {
    stopReview({ silent: true });
    const { topic } = await loadTopicWithPassword(topicId, options);
    state.ownerItems = topic.items.map((item) => ({ ...item }));
    state.currentResult = null;
    state.mode = options.shareMode || !isOwnedTopic(topic.id) ? "guest" : "owner";
    state.currentTopic =
      state.mode === "guest"
        ? {
            ...topic,
            items: topic.items.map((item, index) => ({
              ...item,
              rank: "",
              sortOrder: index,
            })),
          }
        : topic;

    els.homeView.hidden = true;
    els.boardView.hidden = false;
    els.resultView.hidden = true;
    els.shareButton.disabled = false;
    els.boardTitle.textContent = topic.title;
    els.topicAuthorLine.textContent = `By ${topic.author || "匿名"}`;
    els.topicMeta.textContent = `${topic.id} · ${topic.visibility === "public" ? "公开" : "私有"} · ${
      topic.author || "匿名"
    }`;
    els.objectForm.hidden = state.mode === "guest";
    els.editTiersButton.hidden = state.mode === "guest";
    els.editTopicInfoButton.hidden = state.mode === "guest";
    els.deleteTopicButton.hidden = state.mode === "guest";
    els.comparisonPanel.hidden = true;
    els.itemShowName.checked = state.currentTopic.showNames !== false;
    syncItemNameField();
    renderBoardShell();

    const url = new URL(cleanBaseUrl());
    url.searchParams.set("topic", topic.id);
    if (options.shareMode) url.searchParams.set("share", "1");
    if (options.replaceUrl) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }

    renderItems();
  }

  async function loadTopicList() {
    const { topics } = await api("/api/topics");
    state.topics = topics;
    syncCategoriesFromTopics(topics);
    renderCategoryList();
    renderTopicList();
  }

  function renderTopicList() {
    els.topicList.innerHTML = "";
    const topics = currentDiscoveryBatch();
    if (!topics.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.selectedCategory === "全部" ? "暂无发现主题" : "该分类暂无发现主题";
      els.topicList.append(empty);
      return;
    }

    for (const topic of topics) {
      const card = document.createElement("article");
      card.className = "topic-card";

      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = topic.title;
      const meta = document.createElement("p");
      meta.textContent = `${normalizeCategory(topic.category)} · ${topic.id} · ${topic.items.length} 个评价项`;
      body.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "toolbar-buttons";
      const badge = document.createElement("span");
      badge.className = "topic-badge";
      if (topic.hot) badge.classList.add("is-pinned");
      badge.textContent = topic.hot ? "置顶" : "公开";
      const open = document.createElement("button");
      open.className = "secondary-button";
      open.type = "button";
      open.textContent = "打开";
      open.addEventListener("click", () => showBoard(topic.id));
      const fork = document.createElement("button");
      fork.className = "secondary-button";
      fork.type = "button";
      fork.textContent = "新建分支";
      fork.addEventListener("click", () => openForkDialog(topic));
      actions.append(badge, open, fork);

      card.append(body, actions);
      els.topicList.append(card);
    }
  }

  function rotateDiscoveryTopics() {
    const topics = filteredDiscoveryTopics();
    const pinnedCount = topics.filter((topic) => topic.hot).length;
    const regularSlots = Math.max(1, DISCOVERY_BATCH_SIZE - Math.min(pinnedCount, DISCOVERY_BATCH_SIZE));
    state.discoveryOffset += regularSlots;
    renderTopicList();
  }

  function currentDiscoveryBatch() {
    const topics = filteredDiscoveryTopics();
    const pinned = topics.filter((topic) => topic.hot).slice(0, DISCOVERY_BATCH_SIZE);
    const regular = topics.filter((topic) => !topic.hot);
    const slots = DISCOVERY_BATCH_SIZE - pinned.length;
    if (slots <= 0 || !regular.length) return pinned;
    return [...pinned, ...takeCircular(regular, slots, state.discoveryOffset)];
  }

  function filteredDiscoveryTopics() {
    return state.topics
      .filter((topic) => isDiscoverableTopic(topic))
      .filter((topic) => state.selectedCategory === "全部" || normalizeCategory(topic.category) === state.selectedCategory)
      .sort(compareDiscoveryTopics);
  }

  function compareDiscoveryTopics(a, b) {
    if (Boolean(a.hot) !== Boolean(b.hot)) return a.hot ? -1 : 1;
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  }

  function isDiscoverableTopic(topic) {
    return topic.visibility === "public" && Array.isArray(topic.items) && topic.items.length > 0 && topic.items.every((item) => item.rank);
  }

  function takeCircular(items, count, offset) {
    const result = [];
    if (!items.length || count <= 0) return result;
    for (let index = 0; index < Math.min(count, items.length); index += 1) {
      result.push(items[(offset + index) % items.length]);
    }
    return result;
  }

  async function loadCategories() {
    try {
      const { categories } = await api("/api/categories");
      if (Array.isArray(categories) && categories.length) {
        state.categories = uniqueCategories(categories);
      }
    } catch {
      state.categories = [...DEFAULT_TOPIC_CATEGORIES];
    }
  }

  function populateTopicCategorySelect() {
    populateCategorySelect(els.topicCategory);
  }

  function populateCategorySelect(select, selected = state.categories[0]) {
    select.innerHTML = "";
    const categories = uniqueCategories([...state.categories, selected]);
    for (const category of categories) {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      option.selected = category === normalizeCategory(selected);
      select.append(option);
    }
  }

  function syncCategoriesFromTopics(topics) {
    const merged = uniqueCategories([...state.categories, ...topics.map((topic) => topic.category)]);
    if (merged.length !== state.categories.length || merged.some((category, index) => category !== state.categories[index])) {
      state.categories = merged;
      populateTopicCategorySelect();
    }
  }

  function renderCategoryList() {
    els.categoryList.innerHTML = "";
    const discoveryTopics = state.topics.filter((topic) => isDiscoverableTopic(topic));
    const counts = new Map();
    for (const topic of discoveryTopics) {
      const category = normalizeCategory(topic.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    const allButton = createCategoryButton("全部", discoveryTopics.length);
    els.categoryList.append(allButton);
    for (const category of state.categories) {
      els.categoryList.append(createCategoryButton(category, counts.get(category) || 0));
    }
  }

  function createCategoryButton(category, count) {
    const button = document.createElement("button");
    button.className = `category-button${state.selectedCategory === category ? " is-active" : ""}`;
    button.type = "button";
    const label = document.createElement("span");
    label.textContent = category;
    const number = document.createElement("strong");
    number.textContent = String(count);
    button.append(label, number);
    button.addEventListener("click", () => {
      state.selectedCategory = category;
      state.discoveryOffset = 0;
      renderCategoryList();
      renderTopicList();
    });
    return button;
  }

  function renderBoardShell() {
    const activeTiers = getActiveTiers();
    els.rankingBoard.innerHTML = "";
    for (const tier of activeTiers) {
      const row = document.createElement("section");
      row.className = "rank-row";
      row.dataset.rank = tier.id;
      row.addEventListener("click", () => handleRankClick(tier.id));

      const label = document.createElement("div");
      label.className = "rank-label";
      label.dataset.rank = tier.id;
      label.textContent = tier.label;

      const drop = document.createElement("div");
      drop.className = "rank-drop drop-zone";
      drop.dataset.rank = tier.id;
      registerDropZone(drop);

      row.append(label, drop);
      els.rankingBoard.append(row);
    }
    registerDropZone(els.itemPool);
  }

  function renderItems() {
    const topic = currentTopic();
    if (!topic) return;

    for (const drop of document.querySelectorAll(".rank-drop")) {
      drop.innerHTML = "";
    }
    els.itemPool.innerHTML = "";

    const sorted = [...topic.items].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const item of sorted) {
      const card = createItemElement(item);
      const target = item.rank ? document.querySelector(`.rank-drop[data-rank="${item.rank}"]`) : els.itemPool;
      (target || els.itemPool).append(card);
    }

    els.itemCounter.textContent = String(topic.items.length);
    els.startReviewButton.disabled = topic.items.length === 0;
  }

  function createItemElement(item) {
    const card = document.createElement("article");
    card.className = "rank-item";
    if (state.settlingItemId === item.id) {
      card.classList.add("settling-item");
    }
    card.draggable = canEditTopic() && !state.reviewActive;
    card.dataset.itemId = item.id;
    if (canEditTopic() && shouldShowItemName()) {
      card.title = "点击修改评价项名称";
    }

    card.append(createItemMedia(item));
    if (!shouldShowItemName()) {
      card.classList.add("name-hidden");
    }

    if (shouldShowItemName()) {
      const name = document.createElement("strong");
      name.textContent = item.name;
      card.append(name);
    }

    const remove = document.createElement("button");
    remove.className = "remove-item";
    remove.type = "button";
    remove.title = item.rank ? "移回待评" : "删除";
    remove.textContent = "×";
    remove.hidden = state.reviewActive || !canEditTopic();
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      await handleItemRemoveAction(item.id);
    });

    card.append(remove);
    card.addEventListener("dragstart", (event) => {
      if (state.reviewActive) {
        event.preventDefault();
        return;
      }
      if (!canEditTopic()) {
        event.preventDefault();
        return;
      }
      state.draggedItemId = item.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", item.id);
      event.dataTransfer.setData("application/x-rank-item", item.id);
    });
    card.addEventListener("dragend", () => {
      state.lastItemDragAt = Date.now();
      state.draggedItemId = null;
      for (const zone of document.querySelectorAll(".is-over")) {
        zone.classList.remove("is-over");
      }
    });
    card.addEventListener("dragover", (event) => event.preventDefault());
    card.addEventListener("drop", (event) => {
      if (isFileUploadDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canEditTopic()) return;
      const movedId = draggedItemIdFromTransfer(event.dataTransfer);
      if (!movedId || movedId === item.id) return;
      const zone = card.closest(".drop-zone");
      moveItem(movedId, zone?.dataset.rank || "", item.id);
    });
    card.addEventListener("click", () => {
      if (Date.now() - state.lastItemDragAt < 250) return;
      handleItemNameEdit(item.id);
    });

    return card;
  }

  function createItemMedia(item) {
    if (item.imagePath) {
      const image = document.createElement("img");
      const imageUrl = new URL(item.imagePath, location.origin);
      const topicId = imageUrl.pathname.split("/")[2];
      const password = readPrivateTopicPassword(topicId);
      if (password) imageUrl.searchParams.set("password", password);
      image.src = imageUrl.toString();
      image.alt = item.name;
      image.draggable = false;
      return image;
    }
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = shouldShowItemName() ? item.name.slice(0, 1).toUpperCase() : "";
    return placeholder;
  }

  function registerDropZone(zone) {
    if (zone.dataset.dropRegistered === "true") return;
    zone.dataset.dropRegistered = "true";
    zone.addEventListener("dragover", (event) => {
      if (state.reviewActive) return;
      if (!canEditTopic()) return;
      if (isFileUploadDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.classList.add("is-over");
    });
    zone.addEventListener("dragleave", (event) => {
      if (!zone.contains(event.relatedTarget)) {
        zone.classList.remove("is-over");
      }
    });
    zone.addEventListener("drop", (event) => {
      if (state.reviewActive) return;
      if (!canEditTopic()) return;
      if (isFileUploadDrag(event.dataTransfer)) return;
      event.preventDefault();
      zone.classList.remove("is-over");
      const itemId = draggedItemIdFromTransfer(event.dataTransfer);
      if (!itemId) return;
      const targetCard = event.target.closest(".rank-item");
      if (targetCard && zone.contains(targetCard)) {
        moveItem(itemId, zone.dataset.rank || "", targetCard.dataset.itemId);
      } else {
        moveItem(itemId, zone.dataset.rank || "");
      }
    });
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const topic = currentTopic();
    if (!topic) return;
    if (!canEditTopic()) return;

    const showNames = topic.showNames !== false;
    const explicitName = showNames ? els.itemName.value.trim() : "";
    const files = imageFilesFromList(els.itemImage.files);
    if (files.length) {
      await uploadItemFiles(topic, files, explicitName);
    } else {
      const name = showNames ? explicitName : createHiddenItemName(topic);
      if (!name) {
        alert("请填写评价项名称或选择图片");
        return;
      }
      const item = await createTopicItem(topic, name);
      topic.items.push(item);
    }

    els.objectForm.reset();
    els.itemShowName.checked = topic.showNames !== false;
    syncItemNameField();
    renderItems();
  }

  function syncItemNameField() {
    const showNames = els.itemShowName.checked;
    els.itemNameField.hidden = !showNames;
    els.itemName.required = false;
    if (!showNames) els.itemName.value = "";
  }

  function bindFileDropUpload() {
    const enterEvents = ["dragenter", "dragover"];
    for (const eventName of enterEvents) {
      els.objectDock.addEventListener(eventName, handleFileDragOver, true);
    }
    els.objectDock.addEventListener(
      "dragleave",
      (event) => {
        if (!els.objectDock.contains(event.relatedTarget)) {
          els.objectDock.classList.remove("is-over");
        }
      },
      true,
    );
    els.objectDock.addEventListener("drop", handleFileDropUpload, true);
  }

  function handleFileDragOver(event) {
    if (state.reviewActive || !canEditTopic()) return;
    if (!isFileUploadDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    els.objectDock.classList.add("is-over");
  }

  async function handleFileDropUpload(event) {
    if (state.reviewActive || !canEditTopic()) return;
    if (!isFileUploadDrag(event.dataTransfer)) return;
    const files = imageFilesFromList(event.dataTransfer?.files);
    if (!files.length) return;
    event.preventDefault();
    event.stopPropagation();
    els.objectDock.classList.remove("is-over");
    const topic = currentTopic();
    if (!topic) return;
    try {
      await uploadItemFiles(topic, files, els.itemName.value.trim());
      els.objectForm.reset();
      els.itemShowName.checked = topic.showNames !== false;
      syncItemNameField();
      renderItems();
    } catch (error) {
      alert(error.message || "批量上传失败");
    }
  }

  async function uploadItemFiles(topic, files, explicitName = "") {
    const baseCount = topic.items.length;
    const failed = [];
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const name = createItemNameForFile(file, index, files.length, explicitName, baseCount);
      try {
        const imageBlob = await resizeImage(file);
        const item = await createTopicItem(topic, name, imageBlob);
        topic.items.push(item);
      } catch (error) {
        failed.push(file.name || `第 ${index + 1} 张图片`);
      }
    }
    if (failed.length) {
      alert(`以下图片未能上传：${failed.join("、")}`);
    }
  }

  async function createTopicItem(topic, name, imageBlob = null) {
    const form = new FormData();
    form.append("name", name);
    if (imageBlob) form.append("image", imageBlob, "item.jpg");
    const { item } = await api(`/api/topics/${encodeURIComponent(topic.id)}/items`, {
      method: "POST",
      body: form,
      headers: {},
    });
    return item;
  }

  function createItemNameForFile(file, index, total, explicitName, baseCount) {
    if (!shouldShowItemName()) return `评价项${baseCount + index + 1}`;
    if (total === 1 && explicitName) return explicitName.slice(0, 24);
    return fileNameWithoutExtension(file.name) || explicitName.slice(0, 24) || `评价项${baseCount + index + 1}`;
  }

  function fileNameWithoutExtension(name) {
    return String(name || "")
      .replace(/\.[^/.]+$/, "")
      .trim()
      .slice(0, 24);
  }

  function draggedItemIdFromTransfer(dataTransfer) {
    return dataTransfer?.getData("application/x-rank-item") || dataTransfer?.getData("text/plain") || state.draggedItemId;
  }

  function isInternalItemDrag(dataTransfer) {
    if (state.draggedItemId) return true;
    const types = [...(dataTransfer?.types || [])];
    return types.includes("application/x-rank-item");
  }

  function isFileUploadDrag(dataTransfer) {
    return !isInternalItemDrag(dataTransfer) && hasImageFiles(dataTransfer);
  }

  function hasImageFiles(dataTransfer) {
    if (!dataTransfer) return false;
    if (dataTransfer.items?.length) {
      return [...dataTransfer.items].some((item) => {
        if (item.kind !== "file") return false;
        if (item.type.startsWith("image/")) return true;
        const file = item.getAsFile?.();
        return isImageFile(file);
      });
    }
    return imageFilesFromList(dataTransfer.files).length > 0;
  }

  function imageFilesFromList(fileList) {
    return [...(fileList || [])].filter(isImageFile);
  }

  function isImageFile(file) {
    if (!file) return false;
    if (file.type.startsWith("image/")) return true;
    return /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name || "");
  }

  async function handleShowNamesChange() {
    const topic = currentTopic();
    if (!topic) {
      syncItemNameField();
      return;
    }
    if (!canEditTopic()) {
      els.itemShowName.checked = topic.showNames !== false;
      syncItemNameField();
      return;
    }
    const previous = topic.showNames !== false;
    const showNames = els.itemShowName.checked;
    topic.showNames = showNames;
    syncItemNameField();
    renderItems();
    try {
      const { topic: updated } = await api(`/api/topics/${encodeURIComponent(topic.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ showNames }),
      });
      state.currentTopic = { ...state.currentTopic, showNames: updated.showNames };
    } catch (error) {
      topic.showNames = previous;
      els.itemShowName.checked = previous;
      syncItemNameField();
      renderItems();
      alert(error.message || "保存名称显示设置失败");
    }
  }

  function createHiddenItemName(topic) {
    return `评价项${topic.items.length + 1}`;
  }

  async function resizeImage(file) {
    if ("createImageBitmap" in window) {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        try {
          return await drawSquareImageToBlob(bitmap, bitmap.width, bitmap.height);
        } finally {
          bitmap.close?.();
        }
      } catch {
        // Some mobile formats and dragged files still need the HTMLImageElement path.
      }
    }
    const image = await loadImageElement(file);
    return drawSquareImageToBlob(image, image.naturalWidth, image.naturalHeight);
  }

  function loadImageElement(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`图片无法解码：${file.name || "未命名图片"}`));
      };
      image.src = url;
    });
  }

  function drawSquareImageToBlob(source, width, height) {
    return new Promise((resolve, reject) => {
      const sourceSize = Math.min(Number(width), Number(height));
      if (!Number.isFinite(sourceSize) || sourceSize <= 0) {
        reject(new Error("图片尺寸无效"));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_SIZE;
      canvas.height = THUMB_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("无法处理图片"));
        return;
      }
      const sx = (width - sourceSize) / 2;
      const sy = (height - sourceSize) / 2;
      context.drawImage(source, sx, sy, sourceSize, sourceSize, 0, 0, THUMB_SIZE, THUMB_SIZE);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片压缩失败"));
      }, "image/jpeg", 0.84);
    });
  }

  async function moveItem(itemId, rank, beforeItemId = "") {
    if (state.saving) return;
    const topic = currentTopic();
    if (!topic) return;
    if (!canEditTopic()) return;

    const itemIndex = topic.items.findIndex((item) => item.id === itemId);
    if (itemIndex < 0) return;
    const [item] = topic.items.splice(itemIndex, 1);
    item.rank = rank;

    const beforeIndex = beforeItemId
      ? topic.items.findIndex((candidate) => candidate.id === beforeItemId)
      : -1;
    if (beforeIndex >= 0) {
      topic.items.splice(beforeIndex, 0, item);
    } else {
      topic.items.push(item);
    }

    normalizeSortOrder(topic);
    renderItems();
    await saveOrder(topic);
  }

  async function handleItemRemoveAction(itemId) {
    const topic = currentTopic();
    if (!topic) return;
    if (!canEditTopic()) return;

    const item = topic.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    if (item.rank) {
      await moveItem(itemId, "");
      return;
    }

    const ok = confirm(`删除评价项「${item.name}」？`);
    if (!ok) return;
    await api(`/api/topics/${encodeURIComponent(topic.id)}/items/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
    topic.items = topic.items.filter((item) => item.id !== itemId);
    renderItems();
  }

  async function handleItemNameEdit(itemId) {
    const topic = currentTopic();
    if (!topic || !canEditTopic() || state.reviewActive || !shouldShowItemName()) return;

    const item = topic.items.find((candidate) => candidate.id === itemId);
    if (!item) return;

    const value = prompt("修改评价项名称", item.name);
    if (value === null) return;
    const name = value.trim().slice(0, 24);
    if (!name) {
      alert("评价项名称不能为空");
      return;
    }
    if (name === item.name) return;

    try {
      const { item: updated } = await api(`/api/topics/${encodeURIComponent(topic.id)}/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      item.name = updated.name;
      renderItems();
    } catch (error) {
      alert(error.message || "修改评价项失败");
    }
  }

  function startReview() {
    const topic = currentTopic();
    if (!topic || !topic.items.length) return;
    els.comparisonPanel.hidden = true;

    state.reviewQueue = topic.items.filter((item) => !item.rank);
    if (!state.reviewQueue.length) {
      state.reviewQueue = [...topic.items].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    state.reviewActive = true;
    state.reviewIndex = 0;
    document.body.classList.add("review-mode");
    els.objectDock.hidden = true;
    els.reviewStage.hidden = false;
    renderItems();
    renderReviewCard();
  }

  function stopReview(options = {}) {
    state.reviewActive = false;
    state.reviewAnimating = false;
    state.reviewQueue = [];
    state.reviewIndex = 0;
    document.body.classList.remove("review-mode");
    if (els.objectDock) els.objectDock.hidden = false;
    if (els.reviewStage) els.reviewStage.hidden = true;
    if (els.reviewCard) els.reviewCard.innerHTML = "";
    if (!options.silent) renderItems();
  }

  function renderReviewCard() {
    const item = currentReviewItem();
    if (!item) {
      finishReview();
      return;
    }

    els.reviewCard.innerHTML = "";
    els.reviewCard.classList.toggle("name-hidden", !shouldShowItemName());
    els.reviewCard.dataset.itemId = item.id;
    els.reviewCard.append(createItemMedia(item));
    if (shouldShowItemName()) {
      const name = document.createElement("strong");
      name.textContent = item.name;
      els.reviewCard.append(name);
    }
    els.reviewProgress.textContent = `${state.reviewIndex + 1} / ${state.reviewQueue.length}`;
  }

  async function handleRankClick(rank) {
    if (!state.reviewActive || state.reviewAnimating) return;
    const topic = currentTopic();
    const item = currentReviewItem();
    if (!topic || !item) return;

    state.reviewAnimating = true;
    const sourceRect = els.reviewCard.getBoundingClientRect();
    const flight = createFlightCard(sourceRect);

    item.rank = rank;
    const local = topic.items.find((candidate) => candidate.id === item.id);
    if (local) local.rank = rank;
    moveItemToEndOfRank(topic, item.id, rank);
    normalizeSortOrder(topic);
    state.settlingItemId = item.id;
    renderItems();
    await animateFlightToPlacedItem(item.id, flight);
    state.settlingItemId = "";
    revealPlacedItem(item.id);
    saveOrder(topic).then(() => {
      if (state.reviewActive && !state.reviewAnimating) renderItems();
    });

    state.reviewIndex += 1;
    state.reviewAnimating = false;
    renderReviewCard();
  }

  function currentReviewItem() {
    return state.reviewQueue[state.reviewIndex] || null;
  }

  function createFlightCard(sourceRect) {
    const clone = els.reviewCard.cloneNode(true);
    clone.removeAttribute("id");
    clone.className = "review-card flying-card";
    Object.assign(clone.style, {
      left: `${sourceRect.left}px`,
      top: `${sourceRect.top}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
    });
    document.body.append(clone);
    els.reviewCard.classList.add("is-switching");
    return { clone, sourceRect };
  }

  function animateFlightToPlacedItem(itemId, flight) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
      const placed = document.querySelector(`.rank-item[data-item-id="${itemId}"]`);
      if (!placed || !flight?.clone) {
        flight?.clone?.remove();
          els.reviewCard.classList.remove("is-switching");
        resolve();
        return;
      }

        const targetRect = placed.getBoundingClientRect();
        const sourceRect = flight.sourceRect;
        const scaleX = targetRect.width / sourceRect.width;
        const scaleY = targetRect.height / sourceRect.height;
        const animation = flight.clone.animate(
          [
            {
              transform: "translate3d(0, 0, 0) scale(1, 1)",
            },
            {
              transform: `translate3d(${targetRect.left - sourceRect.left}px, ${targetRect.top - sourceRect.top}px, 0) scale(${scaleX}, ${scaleY})`,
            },
          ],
          {
            duration: 420,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
          },
        );
        animation.onfinish = () => {
          flight.clone.remove();
          els.reviewCard.classList.remove("is-switching");
          resolve();
        };
        animation.oncancel = animation.onfinish;
      });
    });
  }

  function revealPlacedItem(itemId) {
    const placed = document.querySelector(`.rank-item[data-item-id="${itemId}"]`);
    if (placed) placed.classList.remove("settling-item");
  }

  function moveItemToEndOfRank(topic, itemId, rank) {
    const index = topic.items.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    const [item] = topic.items.splice(index, 1);
    item.rank = rank;

    let insertIndex = topic.items.length;
    for (let i = topic.items.length - 1; i >= 0; i -= 1) {
      if (topic.items[i].rank === rank) {
        insertIndex = i + 1;
        break;
      }
    }
    topic.items.splice(insertIndex, 0, item);
  }

  function normalizeSortOrder(topic) {
    topic.items.forEach((item, index) => {
      item.sortOrder = index;
    });
  }

  async function saveOrder(topic) {
    if (!canEditTopic()) return;
    state.saving = true;
    try {
      const { topic: savedTopic } = await api(`/api/topics/${encodeURIComponent(topic.id)}/items/order`, {
        method: "PUT",
        body: JSON.stringify({
          items: topic.items.map((item) => ({
            id: item.id,
            rank: item.rank || "",
            sortOrder: item.sortOrder,
          })),
        }),
      });
      state.currentTopic = savedTopic;
    } finally {
      state.saving = false;
    }
  }

  async function deleteCurrentTopic() {
    const topic = currentTopic();
    if (!topic) return;
    if (!canEditTopic()) return;
    const ok = confirm(`删除主题「${topic.title}」？`);
    if (!ok) return;
    await api(`/api/topics/${encodeURIComponent(topic.id)}`, { method: "DELETE" });
    await showHome();
  }

  function currentTopic() {
    return state.currentTopic;
  }

  function canEditTopic() {
    return state.mode === "owner";
  }

  async function finishReview() {
    const topic = currentTopic();
    if (!topic) {
      stopReview();
      return;
    }
    stopReview();
    if (state.mode === "guest") {
      const response = await submitGuestResponse(topic);
      rememberParticipatedResult(topic.id, response);
      await showResult(topic.id, response.id);
    }
  }

  async function submitGuestResponse(topic) {
    const { response } = await api(`/api/topics/${encodeURIComponent(topic.id)}/responses`, {
      method: "POST",
      body: JSON.stringify({
        participantId: getParticipantId(),
        rankings: topic.items.map((item) => ({
          itemId: item.id,
          rank: item.rank || "",
          sortOrder: item.sortOrder,
        })),
      }),
    });
    return response;
  }

  async function showResult(topicId, responseId, options = {}) {
    stopReview({ silent: true });
    const { topic } = await loadTopicWithPassword(topicId, options);
    const { response } = await api(`/api/topics/${encodeURIComponent(topicId)}/responses/${encodeURIComponent(responseId)}`);
    const responseByItem = new Map(response.rankings.map((ranking) => [ranking.itemId, ranking]));
    const participantTopic = {
      ...topic,
      items: topic.items.map((item, index) => {
        const ranking = responseByItem.get(item.id);
        return {
          ...item,
          rank: ranking?.rank || "",
          sortOrder: Number.isFinite(Number(ranking?.sortOrder)) ? Number(ranking.sortOrder) : index,
        };
      }),
    };

    state.ownerItems = topic.items.map((item) => ({ ...item }));
    state.currentTopic = participantTopic;
    state.currentResult = { topicId: topic.id, responseId: response.id };
    state.mode = "result";

    els.homeView.hidden = true;
    els.boardView.hidden = true;
    els.resultView.hidden = false;
    els.shareButton.disabled = false;
    els.comparisonPanel.hidden = true;
    renderResultTitle(topic.title);
    els.resultMeta.textContent = `${topic.id} · ${topic.visibility === "public" ? "公开" : "私有"} · ${topic.author || "匿名"}`;
    els.resultAuthorLine.textContent = `By ${topic.author || "匿名"}`;
    els.resultShareNote.textContent = "";
    renderResultRankingPreview(participantTopic);
    renderComparison(participantTopic, resultComparisonNodes());

    const url = new URL(cleanBaseUrl());
    url.searchParams.set("topic", topic.id);
    url.searchParams.set("result", response.id);
    if (options.replaceUrl) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
    }
  }

  function renderComparison(topic, nodes = boardComparisonNodes()) {
    const ownerById = new Map(state.ownerItems.map((item) => [item.id, item]));
    const total = topic.items.length;
    const matched = topic.items.filter((item) => ownerById.get(item.id)?.rank === item.rank).length;
    const percent = total ? Math.round((matched / total) * 100) : 0;

    nodes.score.textContent = `${percent}%`;
    nodes.summary.textContent = `你和分享者有 ${matched} / ${total} 个评价项放在同一行。`;
    nodes.list.innerHTML = "";

    for (const item of [...topic.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const ownerItem = ownerById.get(item.id);
      const row = document.createElement("article");
      row.className = "comparison-row";
      row.append(createComparisonThumb(item));

      const body = document.createElement("div");
      if (shouldShowItemName()) {
        const name = document.createElement("strong");
        name.textContent = item.name;
        body.append(name);
      }
      const meta = document.createElement("p");
      meta.textContent = `分享者：${rankLabel(ownerItem?.rank)} · 你：${rankLabel(item.rank)}`;
      body.append(meta);

      const badge = document.createElement("span");
      badge.className = "topic-badge";
      badge.textContent = ownerItem?.rank === item.rank ? "一致" : "不同";

      row.append(body, badge);
      nodes.list.append(row);
    }

    if (nodes.panel) {
      nodes.panel.hidden = false;
      nodes.panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function renderResultTitle(title) {
    els.resultTitle.textContent = "";
    els.resultTitle.append(document.createTextNode(title));
    const suffix = document.createElement("span");
    suffix.className = "result-title-suffix";
    suffix.textContent = "的锐评结果";
    els.resultTitle.append(suffix);
  }

  function boardComparisonNodes() {
    return {
      panel: els.comparisonPanel,
      score: els.comparisonScore,
      summary: els.comparisonSummary,
      list: els.comparisonList,
    };
  }

  function resultComparisonNodes() {
    return {
      panel: null,
      score: els.resultScore,
      summary: els.resultSummary,
      list: els.resultList,
    };
  }

  function renderResultRankingPreview(topic) {
    els.resultRankingPreview.innerHTML = "";
    const sortedItems = [...topic.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const rows = [...normalizeTiers(topic.tiers)];
    const unranked = sortedItems.filter((item) => !item.rank);
    if (unranked.length) rows.push({ id: "", label: "未排名" });

    for (const tier of rows) {
      const row = document.createElement("section");
      row.className = "result-rank-row";
      row.dataset.rank = tier.id;

      const label = document.createElement("div");
      label.className = "result-rank-label";
      label.dataset.rank = tier.id;
      label.textContent = tier.label;

      const content = document.createElement("div");
      content.className = "result-rank-items";
      const items = sortedItems.filter((item) => (tier.id ? item.rank === tier.id : !item.rank));
      if (!items.length) {
        const empty = document.createElement("span");
        empty.className = "result-rank-empty";
        empty.textContent = "暂无";
        content.append(empty);
      }
      for (const item of items) {
        content.append(createResultPreviewItem(item));
      }

      row.append(label, content);
      els.resultRankingPreview.append(row);
    }
  }

  function createResultPreviewItem(item) {
    const card = document.createElement("article");
    card.className = "result-preview-item";
    if (!shouldShowItemName()) card.classList.add("name-hidden");
    card.append(createItemMedia(item));
    if (shouldShowItemName()) {
      const name = document.createElement("strong");
      name.textContent = item.name;
      card.append(name);
    }
    return card;
  }

  function createComparisonThumb(item) {
    const thumb = document.createElement("div");
    thumb.className = "comparison-thumb";
    thumb.append(createItemMedia(item));
    return thumb;
  }

  function rankLabel(rank) {
    return getActiveTiers().find((tier) => tier.id === rank)?.label || "未排名";
  }

  function getActiveTiers() {
    return normalizeTiers(currentTopic()?.tiers);
  }

  function openTiersDialog() {
    const topic = currentTopic();
    if (!topic || !canEditTopic()) return;
    els.tierEditorGrid.innerHTML = "";
    for (const tier of getActiveTiers()) {
      const label = document.createElement("label");
      label.className = "tier-editor-field";
      label.dataset.rank = tier.id;
      const title = document.createElement("span");
      title.textContent = `${defaultLabelFor(tier.id)} 行名`;
      const input = document.createElement("input");
      input.type = "text";
      input.name = tier.id;
      input.maxLength = 16;
      input.required = true;
      input.value = tier.label;
      label.append(title, input);
      els.tierEditorGrid.append(label);
    }
    if (typeof els.tiersDialog.showModal === "function") {
      els.tiersDialog.showModal();
    }
  }

  async function handleSaveTiers(event) {
    event.preventDefault();
    const topic = currentTopic();
    if (!topic || !canEditTopic()) return;

    const form = new FormData(els.tiersForm);
    const nextTiers = tiers.map((tier) => ({
      id: tier.id,
      label: String(form.get(tier.id) || tier.label).trim().slice(0, 16) || tier.label,
    }));

    const { topic: savedTopic } = await api(`/api/topics/${encodeURIComponent(topic.id)}/tiers`, {
      method: "PUT",
      body: JSON.stringify({ tiers: nextTiers }),
    });
    state.currentTopic = savedTopic;
    closeTiersDialog();
    renderBoardShell();
    renderItems();
  }

  function closeTiersDialog() {
    if (els.tiersDialog.open) els.tiersDialog.close();
  }

  function openTopicInfoDialog() {
    const topic = currentTopic();
    if (!topic || !canEditTopic()) return;
    els.editTopicTitle.value = topic.title || "";
    els.editTopicAuthor.value = topic.author || "";
    populateCategorySelect(els.editTopicCategory, topic.category);
    els.editTopicPassword.value = "";
    els.editTopicPasswordField.hidden = topic.visibility !== "private";
    if (typeof els.topicInfoDialog.showModal === "function") {
      els.topicInfoDialog.showModal();
      els.editTopicTitle.select();
    }
  }

  function closeTopicInfoDialog() {
    if (els.topicInfoDialog.open) els.topicInfoDialog.close();
  }

  async function handleSaveTopicInfo(event) {
    event.preventDefault();
    const topic = currentTopic();
    if (!topic || !canEditTopic()) return;

    const title = els.editTopicTitle.value.trim();
    const author = els.editTopicAuthor.value.trim();
    const category = normalizeCategory(els.editTopicCategory.value);
    const sharePassword = els.editTopicPassword.value.trim();
    if (!title || !author || !category) return;

    const payload = { title, author, category };
    if (sharePassword) payload.sharePassword = sharePassword;
    const { topic: updated } = await api(`/api/topics/${encodeURIComponent(topic.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.currentTopic = {
      ...state.currentTopic,
      title: updated.title,
      author: updated.author,
      category: updated.category,
      hasSharePassword: updated.hasSharePassword,
    };
    rememberPrivateTopicPassword(topic.id, sharePassword);
    els.boardTitle.textContent = updated.title;
    els.topicAuthorLine.textContent = `By ${updated.author || "匿名"}`;
    els.topicMeta.textContent = `${topic.id} · ${updated.visibility === "public" ? "公开" : "私有"} · ${
      updated.author || "匿名"
    }`;
    closeTopicInfoDialog();
  }

  function openForkDialog(topic) {
    els.forkSourceId.value = topic.id;
    els.forkTitle.value = `${topic.title} 分支`.slice(0, 36);
    els.forkPassword.value = "";
    syncForkPasswordField();
    if (typeof els.forkDialog.showModal === "function") {
      els.forkDialog.showModal();
      els.forkTitle.select();
    }
  }

  function closeForkDialog() {
    if (els.forkDialog.open) els.forkDialog.close();
  }

  async function handleCreateFork(event) {
    event.preventDefault();
    const sourceId = els.forkSourceId.value;
    const form = new FormData(els.forkForm);
    const title = els.forkTitle.value.trim();
    const visibility = String(form.get("forkVisibility") || "public");
    const sharePassword = els.forkPassword.value.trim();
    if (!sourceId || !title) return;
    if (visibility === "private" && !sharePassword) {
      alert("私有分支需要设置分享密码");
      els.forkPassword.focus();
      return;
    }

    const { topic } = await api(`/api/topics/${encodeURIComponent(sourceId)}/forks`, {
      method: "POST",
      body: JSON.stringify({ title, visibility, sharePassword }),
    });
    rememberOwnedTopic(topic.id);
    rememberPrivateTopicPassword(topic.id, sharePassword);
    closeForkDialog();
    els.forkForm.reset();
    syncForkPasswordField();
    await showBoard(topic.id, { password: sharePassword });
  }

  function normalizeTiers(value) {
    const labels = new Map();
    if (Array.isArray(value)) {
      for (const tier of value) {
        const id = tiers.some((candidate) => candidate.id === tier?.id) ? tier.id : "";
        const label = String(tier?.label || "").trim();
        if (id && label) labels.set(id, label);
      }
    }
    return tiers.map((tier) => ({
      id: tier.id,
      label: labels.get(tier.id) || tier.label,
    }));
  }

  function defaultLabelFor(id) {
    return tiers.find((tier) => tier.id === id)?.label || id;
  }

  async function openHistoryDialog() {
    els.historyList.innerHTML = '<div class="empty-state history-empty">正在加载历史主题</div>';
    state.historyTab = state.historyTab || "owned";
    syncHistoryTabs();
    if (typeof els.historyDialog.showModal === "function") {
      els.historyDialog.showModal();
    }

    const [ownedTopics, participatedResults] = await Promise.all([loadOwnedTopics(), loadParticipatedResults()]);
    state.historyOwnedTopics = ownedTopics;
    state.historyParticipatedResults = participatedResults;
    renderHistoryList();
  }

  async function loadOwnedTopics() {
    const ids = [...new Set(readOwnedTopics())];
    const results = await Promise.allSettled(ids.map((id) => loadTopicWithPassword(id, { promptForPassword: false })));
    return results
      .filter((result) => result.status === "fulfilled" && result.value?.topic)
      .map((result) => result.value.topic)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async function loadParticipatedResults() {
    const entries = readParticipatedResults();
    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        const [{ topic }, { response }] = await Promise.all([
          loadTopicWithPassword(entry.topicId, { promptForPassword: false }),
          api(`/api/topics/${encodeURIComponent(entry.topicId)}/responses/${encodeURIComponent(entry.responseId)}`),
        ]);
        return { entry, topic, response };
      }),
    );
    return results
      .filter((result) => result.status === "fulfilled" && result.value?.topic && result.value?.response)
      .map((result) => result.value)
      .sort((a, b) => String(b.response.createdAt || b.entry.createdAt).localeCompare(String(a.response.createdAt || a.entry.createdAt)));
  }

  function setHistoryTab(tab) {
    state.historyTab = tab === "participated" ? "participated" : "owned";
    syncHistoryTabs();
    renderHistoryList();
  }

  function syncHistoryTabs() {
    const isOwned = state.historyTab !== "participated";
    els.historyOwnedTab.classList.toggle("is-active", isOwned);
    els.historyParticipatedTab.classList.toggle("is-active", !isOwned);
    els.historyOwnedTab.setAttribute("aria-selected", String(isOwned));
    els.historyParticipatedTab.setAttribute("aria-selected", String(!isOwned));
  }

  function renderHistoryList() {
    els.historyList.innerHTML = "";
    const isOwned = state.historyTab !== "participated";
    const entries = isOwned ? state.historyOwnedTopics : state.historyParticipatedResults;
    const createCard = isOwned ? createOwnedHistoryCard : createParticipatedHistoryCard;
    const emptyText = isOwned ? "暂无创建过的主题" : "暂无参与结果";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state history-empty";
      empty.textContent = emptyText;
      els.historyList.append(empty);
      return;
    }
    for (const entry of entries) {
      els.historyList.append(createCard(entry));
    }
  }

  function createHistorySection(title, entries, createCard, emptyText) {
    const section = document.createElement("section");
    section.className = "history-section";
    const heading = document.createElement("h3");
    heading.textContent = title;
    section.append(heading);

    const list = document.createElement("div");
    list.className = "topic-list";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state history-empty";
      empty.textContent = emptyText;
      list.append(empty);
    } else {
      for (const entry of entries) {
        list.append(createCard(entry));
      }
    }
    section.append(list);
    return section;
  }

  function createOwnedHistoryCard(topic) {
    const card = document.createElement("article");
    card.className = "topic-card";

    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = topic.title;
    const meta = document.createElement("p");
    meta.textContent = `${topic.id} · ${topic.visibility === "public" ? "公开" : "私有"} · ${topic.author || "匿名"}`;
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "toolbar-buttons";
    const open = document.createElement("button");
    open.className = "secondary-button";
    open.type = "button";
    open.textContent = "打开";
    open.addEventListener("click", () => {
      closeHistoryDialog();
      showBoard(topic.id);
    });
    const share = document.createElement("button");
    share.className = "secondary-button";
    share.type = "button";
    share.textContent = "分享";
    share.addEventListener("click", async () => {
      await copyTextValue(createShareUrl(topic));
      meta.textContent = "已复制分享链接";
    });
    actions.append(open, share);

    card.append(body, actions);
    return card;
  }

  function createParticipatedHistoryCard(result) {
    const card = document.createElement("article");
    card.className = "topic-card";

    const body = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = `${result.topic.title} 的结果`;
    const meta = document.createElement("p");
    meta.textContent = `${result.topic.id} · ${formatDate(result.response.createdAt || result.entry.createdAt)}`;
    body.append(title, meta);

    const actions = document.createElement("div");
    actions.className = "toolbar-buttons";
    const badge = document.createElement("span");
    badge.className = "topic-badge";
    badge.textContent = `${resultMatchPercent(result.topic, result.response)}% 一致`;
    const open = document.createElement("button");
    open.className = "secondary-button";
    open.type = "button";
    open.textContent = "查看结果";
    open.addEventListener("click", () => {
      closeHistoryDialog();
      showResult(result.topic.id, result.response.id);
    });
    actions.append(badge, open);

    card.append(body, actions);
    return card;
  }

  function resultMatchPercent(topic, response) {
    const ownerById = new Map(topic.items.map((item) => [item.id, item]));
    const total = response.rankings.length || topic.items.length;
    const matched = response.rankings.filter((ranking) => ownerById.get(ranking.itemId)?.rank === ranking.rank).length;
    return total ? Math.round((matched / total) * 100) : 0;
  }

  function closeHistoryDialog() {
    if (els.historyDialog.open) els.historyDialog.close();
  }

  function openShareDialog() {
    const topic = currentTopic();
    if (!topic) return;
    const code = createShareCode(topic);
    const url = createShareUrl(topic);
    els.shareLink.value = code;
    els.shareUrl.value = url;
    els.shareNote.textContent =
      topic.visibility === "public" ? "公开主题，可复制分享码或分享链接" : "私有主题需要分享密码，可复制分享码或分享链接";
    if (typeof els.shareDialog.showModal === "function") {
      els.shareDialog.showModal();
    } else {
      prompt("分享主题", `${code}\n${url}`);
    }
  }

  async function copyCurrentShareCode() {
    const code = els.shareLink.value || createShareCode(currentTopic());
    if (!code) return;
    await copyShareValue(code, els.shareLink, "已复制分享码");
  }

  async function copyCurrentShareUrl() {
    const url = els.shareUrl.value || createShareUrl(currentTopic());
    if (!url) return;
    await copyShareValue(url, els.shareUrl, "已复制分享链接");
  }

  async function copyShareValue(value, input, message) {
    await copyTextValue(value, input);
    els.shareNote.textContent = message;
  }

  async function copyTextValue(value, input) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const target = input || document.createElement("textarea");
      if (!input) {
        target.value = value;
        target.style.position = "fixed";
        target.style.left = "-9999px";
        document.body.append(target);
      }
      target.select();
      document.execCommand("copy");
      if (!input) target.remove();
    }
  }

  function createShareCode(topic) {
    return topic?.id || "";
  }

  function createShareUrl(topic) {
    const code = createShareCode(topic);
    if (!code) return "";
    const url = new URL(cleanBaseUrl());
    url.searchParams.set("topic", code);
    url.searchParams.set("share", "1");
    return url.toString();
  }

  async function copyCurrentResultLink() {
    const url = createResultUrl(state.currentResult);
    if (!url) return;
    await copyTextValue(url);
    els.resultShareNote.textContent = "已复制结果链接";
  }

  function openCurrentResultTopic() {
    if (!state.currentResult?.topicId) return;
    showBoard(state.currentResult.topicId);
  }

  function createResultUrl(result) {
    if (!result?.topicId || !result?.responseId) return "";
    const url = new URL(cleanBaseUrl());
    url.searchParams.set("topic", result.topicId);
    url.searchParams.set("result", result.responseId);
    return url.toString();
  }

  function parseShareCode(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      return (url.searchParams.get("topic") || url.pathname.split("/").filter(Boolean).pop() || "").trim();
    } catch {
      return raw.replace(/^#/, "").trim();
    }
  }

  function uniqueCategories(values) {
    const seen = new Set();
    const categories = [];
    for (const value of values) {
      const category = normalizeCategory(value);
      if (seen.has(category)) continue;
      seen.add(category);
      categories.push(category);
    }
    return categories.length ? categories : [...DEFAULT_TOPIC_CATEGORIES];
  }

  function normalizeCategory(value) {
    const category = String(value || "").trim().slice(0, 24);
    return category || "其他";
  }

  function shouldShowItemName() {
    return currentTopic()?.showNames !== false;
  }

  async function loadTopicWithPassword(topicId, options = {}) {
    let password =
      options.confirmPassword === true
        ? ""
        : typeof options.password === "string" && options.password.trim()
          ? options.password.trim()
          : readPrivateTopicPassword(topicId);
    const promptForPassword = options.promptForPassword !== false;

    for (;;) {
      try {
        const result = await api(createTopicApiPath(topicId, password));
        rememberPrivateTopicPassword(topicId, password);
        return result;
      } catch (error) {
        if (!isPasswordError(error) || !promptForPassword) throw error;
        const nextPassword = prompt(error.code === "INVALID_PASSWORD" ? "分享密码错误，请重新输入" : "请输入分享密码");
        if (nextPassword === null) throw error;
        password = nextPassword.trim();
      }
    }
  }

  function createTopicApiPath(topicId, password = "") {
    const path = `/api/topics/${encodeURIComponent(topicId)}`;
    return password ? `${path}?password=${encodeURIComponent(password)}` : path;
  }

  function isPasswordError(error) {
    return error?.code === "PASSWORD_REQUIRED" || error?.code === "INVALID_PASSWORD";
  }

  function rememberOwnedTopic(topicId) {
    const owned = new Set(readOwnedTopics());
    owned.add(topicId);
    localStorage.setItem(OWNER_TOPICS_KEY, JSON.stringify([...owned]));
  }

  function rememberPrivateTopicPassword(topicId, password) {
    const value = String(password || "").trim();
    if (!topicId || !value) return;
    const passwords = readPrivateTopicPasswords();
    passwords[topicId] = value;
    localStorage.setItem(PRIVATE_TOPIC_PASSWORDS_KEY, JSON.stringify(passwords));
  }

  function readPrivateTopicPassword(topicId) {
    return readPrivateTopicPasswords()[topicId] || "";
  }

  function readPrivateTopicPasswords() {
    try {
      const value = JSON.parse(localStorage.getItem(PRIVATE_TOPIC_PASSWORDS_KEY) || "{}");
      if (!value || typeof value !== "object" || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).map(([topicId, password]) => [String(topicId), String(password || "").trim()]).filter((entry) => entry[0] && entry[1]),
      );
    } catch {
      return {};
    }
  }

  function rememberParticipatedResult(topicId, response) {
    const responseId = response?.id;
    if (!topicId || !responseId) return;
    const entries = readParticipatedResults().filter(
      (entry) => !(entry.topicId === topicId && entry.responseId === responseId),
    );
    entries.unshift({
      topicId,
      responseId,
      createdAt: response.createdAt || new Date().toISOString(),
    });
    localStorage.setItem(PARTICIPATED_RESULTS_KEY, JSON.stringify(entries.slice(0, 80)));
  }

  function isOwnedTopic(topicId) {
    return readOwnedTopics().includes(topicId);
  }

  function readOwnedTopics() {
    try {
      const value = JSON.parse(localStorage.getItem(OWNER_TOPICS_KEY) || "[]");
      return Array.isArray(value) ? value.map(String) : [];
    } catch {
      return [];
    }
  }

  function readParticipatedResults() {
    try {
      const value = JSON.parse(localStorage.getItem(PARTICIPATED_RESULTS_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return value
        .map((entry) => ({
          topicId: String(entry?.topicId || ""),
          responseId: String(entry?.responseId || ""),
          createdAt: String(entry?.createdAt || ""),
        }))
        .filter((entry) => entry.topicId && entry.responseId);
    } catch {
      return [];
    }
  }

  function getParticipantId() {
    let participantId = localStorage.getItem(PARTICIPANT_ID_KEY);
    if (!participantId) {
      participantId = `P-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(PARTICIPANT_ID_KEY, participantId);
    }
    return participantId;
  }

  function cleanBaseUrl() {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    return url.toString();
  }

  async function api(path, options = {}) {
    const headers = options.headers === undefined ? { "Content-Type": "application/json" } : options.headers;
    const url = new URL(path, location.origin);
    const match = url.pathname.match(/^\/api\/topics\/([^/]+)/);
    if (match && !url.searchParams.has("password")) {
      const password = readPrivateTopicPassword(decodeURIComponent(match[1]));
      if (password) url.searchParams.set("password", password);
    }
    const response = await fetch(url, { ...options, headers });
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      const error = new Error(payload.message || "请求失败");
      error.code = payload.error || "";
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "未保存";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

})();
