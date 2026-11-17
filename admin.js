(function () {
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
    categoryDraft: [...DEFAULT_TOPIC_CATEGORIES],
    responsesByTopic: new Map(),
    selectedTopicId: "",
  };

  const els = {
    refreshButton: document.querySelector("#adminRefreshButton"),
    topicList: document.querySelector("#adminTopicList"),
    topicCounter: document.querySelector("#adminTopicCounter"),
    detailPanel: document.querySelector("#adminDetailPanel"),
    statTopics: document.querySelector("#statTopics"),
    statPublic: document.querySelector("#statPublic"),
    statItems: document.querySelector("#statItems"),
    statResponses: document.querySelector("#statResponses"),
    categoryForm: document.querySelector("#adminCategoryForm"),
    categoryInput: document.querySelector("#adminCategoryInput"),
    categoryList: document.querySelector("#adminCategoryList"),
    categoryCounter: document.querySelector("#adminCategoryCounter"),
    saveCategoriesButton: document.querySelector("#adminSaveCategoriesButton"),
    forkDialog: document.querySelector("#adminForkDialog"),
    forkForm: document.querySelector("#adminForkForm"),
    forkSourceId: document.querySelector("#adminForkSourceId"),
    forkTitle: document.querySelector("#adminForkTitle"),
    forkPasswordField: document.querySelector("#adminForkPasswordField"),
    forkPassword: document.querySelector("#adminForkPassword"),
    closeForkButton: document.querySelector("#adminCloseForkButton"),
  };

  init();

  async function init() {
    els.refreshButton.addEventListener("click", loadAdminData);
    els.categoryForm.addEventListener("submit", handleAddCategory);
    els.saveCategoriesButton.addEventListener("click", handleSaveCategories);
    els.forkForm.addEventListener("submit", handleForkSubmit);
    els.closeForkButton.addEventListener("click", closeForkDialog);
    els.forkForm.querySelectorAll('input[name="adminForkVisibility"]').forEach((input) => {
      input.addEventListener("change", syncForkPasswordField);
    });
    syncForkPasswordField();
    await loadAdminData();
  }

  async function loadAdminData() {
    const [{ topics }, { categories }] = await Promise.all([api("/api/topics"), api("/api/categories")]);
    state.topics = topics;
    state.categories = uniqueCategories(categories);
    state.categoryDraft = [...state.categories];
    state.responsesByTopic.clear();

    await Promise.all(
      topics.map(async (topic) => {
        const { responses } = await api(`/api/topics/${encodeURIComponent(topic.id)}/responses`);
        state.responsesByTopic.set(topic.id, responses);
      }),
    );

    if (!state.selectedTopicId && topics.length) {
      state.selectedTopicId = topics[0].id;
    }
    if (state.selectedTopicId && !topics.some((topic) => topic.id === state.selectedTopicId)) {
      state.selectedTopicId = topics[0]?.id || "";
    }

    renderStats();
    renderCategoryManager();
    renderTopicList();
    renderDetail();
  }

  function renderStats() {
    const itemCount = state.topics.reduce((sum, topic) => sum + topic.items.length, 0);
    const responseCount = [...state.responsesByTopic.values()].reduce((sum, responses) => sum + responses.length, 0);
    els.statTopics.textContent = String(state.topics.length);
    els.statPublic.textContent = String(state.topics.filter((topic) => topic.hot).length);
    els.statItems.textContent = String(itemCount);
    els.statResponses.textContent = String(responseCount);
    els.topicCounter.textContent = String(state.topics.length);
  }

  function renderCategoryManager() {
    els.categoryCounter.textContent = String(state.categoryDraft.length);
    els.categoryList.innerHTML = "";
    for (let index = 0; index < state.categoryDraft.length; index += 1) {
      const category = state.categoryDraft[index];
      const row = document.createElement("div");
      row.className = "admin-category-item";

      const name = document.createElement("strong");
      name.textContent = category;

      const actions = document.createElement("div");
      actions.className = "toolbar-buttons";
      const up = document.createElement("button");
      up.className = "icon-button";
      up.type = "button";
      up.title = "上移";
      up.disabled = index === 0;
      up.textContent = "↑";
      up.addEventListener("click", () => moveCategory(index, -1));

      const down = document.createElement("button");
      down.className = "icon-button";
      down.type = "button";
      down.title = "下移";
      down.disabled = index === state.categoryDraft.length - 1;
      down.textContent = "↓";
      down.addEventListener("click", () => moveCategory(index, 1));

      actions.append(up, down);
      row.append(name, actions);
      els.categoryList.append(row);
    }
  }

  function handleAddCategory(event) {
    event.preventDefault();
    const category = normalizeCategory(els.categoryInput.value);
    if (!category || state.categoryDraft.includes(category)) {
      els.categoryInput.value = "";
      return;
    }
    const insertIndex = state.categoryDraft.includes("其他") ? state.categoryDraft.indexOf("其他") : state.categoryDraft.length;
    state.categoryDraft.splice(insertIndex, 0, category);
    els.categoryInput.value = "";
    renderCategoryManager();
  }

  function moveCategory(index, direction) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= state.categoryDraft.length) return;
    const draft = [...state.categoryDraft];
    [draft[index], draft[nextIndex]] = [draft[nextIndex], draft[index]];
    state.categoryDraft = draft;
    renderCategoryManager();
  }

  async function handleSaveCategories() {
    try {
      const { categories } = await api("/api/categories", {
        method: "PUT",
        body: JSON.stringify({ categories: state.categoryDraft }),
      });
      state.categories = uniqueCategories(categories);
      state.categoryDraft = [...state.categories];
      renderCategoryManager();
      renderDetail();
    } catch (error) {
      alert(error.message || "保存标签失败");
    }
  }

  function renderTopicList() {
    els.topicList.innerHTML = "";
    if (!state.topics.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "暂无主题";
      els.topicList.append(empty);
      return;
    }

    for (const topic of state.topics) {
      const card = document.createElement("article");
      card.className = `topic-card admin-topic-card${topic.id === state.selectedTopicId ? " is-selected" : ""}`;
      card.addEventListener("click", () => {
        state.selectedTopicId = topic.id;
        renderTopicList();
        renderDetail();
      });

      const body = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = topic.title;
      const meta = document.createElement("p");
      meta.textContent = `${normalizeCategory(topic.category)} · ${topic.id} · ${topic.items.length} 评价项 · ${responseCount(
        topic.id,
      )} 结果`;
      body.append(title, meta);

      const badge = document.createElement("span");
      badge.className = "topic-badge";
      badge.textContent = topic.hot ? "置顶" : topic.visibility === "public" ? "公开" : "私有";

      card.append(body, badge);
      els.topicList.append(card);
    }
  }

  function renderDetail() {
    const topic = selectedTopic();
    if (!topic) {
      els.detailPanel.innerHTML = '<div class="empty-state">选择一个主题</div>';
      return;
    }

    els.detailPanel.innerHTML = "";
    const header = document.createElement("section");
    header.className = "admin-detail-header";
    header.innerHTML = `
      <div>
        <p class="eyebrow">${escapeHtml(topic.id)}</p>
        <h2>${escapeHtml(topic.title)}</h2>
        <div class="admin-detail-meta">
          <span class="topic-badge">${escapeHtml(normalizeCategory(topic.category))}</span>
          <span class="topic-badge">${topic.visibility === "public" ? "公开" : "私有"}</span>
          <span class="topic-badge">${topic.hot ? "置顶主题" : "未置顶"}</span>
        </div>
      </div>
      <div class="toolbar-buttons">
        <a class="secondary-button nav-link-button" href="./index.html?topic=${encodeURIComponent(topic.id)}">前台打开</a>
        <button class="secondary-button" id="adminForkTopicButton" type="button">新建分支</button>
        <button class="danger-button" id="adminDeleteTopicButton" type="button">删除</button>
      </div>
    `;

    const edit = document.createElement("form");
    edit.className = "admin-edit-form";
    edit.id = "adminEditForm";
    edit.innerHTML = `
      <label>
        <span>主题标题</span>
        <input id="adminTopicTitleInput" type="text" maxlength="36" required value="${escapeAttribute(topic.title)}" />
      </label>
      <label>
        <span>作者名称</span>
        <input id="adminTopicAuthorInput" type="text" maxlength="24" required value="${escapeAttribute(topic.author || "匿名")}" />
      </label>
      <label>
        <span>主题分类</span>
        <select id="adminTopicCategoryInput" required>${renderCategoryOptions(topic.category)}</select>
      </label>
      <fieldset class="visibility-group">
        <legend>公开状态</legend>
        <label>
          <input type="radio" name="adminVisibility" value="public" ${topic.visibility === "public" ? "checked" : ""} />
          <span>公开</span>
        </label>
        <label>
          <input type="radio" name="adminVisibility" value="private" ${topic.visibility === "private" ? "checked" : ""} />
          <span>私有</span>
        </label>
      </fieldset>
      <label>
        <span>分享密码</span>
        <input id="adminTopicPasswordInput" type="password" maxlength="32" placeholder="${
          topic.hasSharePassword ? "已设置，留空不修改" : "私有主题访问密码"
        }" />
      </label>
      <fieldset class="visibility-group">
        <legend>置顶主题</legend>
        <label>
          <input type="checkbox" name="adminHot" ${topic.hot ? "checked" : ""} />
          <span>置顶主题</span>
        </label>
      </fieldset>
      <fieldset class="visibility-group">
        <legend>评价项名称</legend>
        <label>
          <input type="checkbox" name="adminShowNames" ${topic.showNames !== false ? "checked" : ""} />
          <span>显示名称</span>
        </label>
      </fieldset>
      <button class="primary-button" type="submit">保存主题</button>
    `;

    const grids = document.createElement("section");
    grids.className = "admin-data-grid";
    grids.append(renderItemsPanel(topic), renderResponsesPanel(topic));

    els.detailPanel.append(header, edit, renderTiersEditor(topic), grids);
    document.querySelector("#adminEditForm").addEventListener("submit", handleTopicUpdate);
    document.querySelector("#adminTiersForm").addEventListener("submit", handleTiersUpdate);
    document.querySelector("#adminDeleteTopicButton").addEventListener("click", () => handleDeleteTopic(topic));
    document.querySelector("#adminForkTopicButton").addEventListener("click", () => openForkDialog(topic));
  }

  function renderTiersEditor(topic) {
    const form = document.createElement("form");
    form.className = "admin-tier-form";
    form.id = "adminTiersForm";
    const fields = normalizeTiers(topic.tiers)
      .map((tier) => {
        return `
          <label class="tier-editor-field">
            <span>${escapeHtml(defaultTierLabel(tier.id))}</span>
            <input name="${escapeAttribute(tier.id)}" type="text" maxlength="16" required value="${escapeAttribute(tier.label)}" />
          </label>
        `;
      })
      .join("");
    form.innerHTML = `
      <div class="section-heading">
        <h2>行名</h2>
        <button class="primary-button" type="submit">保存行名</button>
      </div>
      <div class="tier-editor-grid">${fields}</div>
    `;
    return form;
  }

  function renderItemsPanel(topic) {
    const panel = document.createElement("section");
    panel.className = "admin-card-panel";
    panel.innerHTML = `
      <div class="section-heading">
        <h2>评价项</h2>
        <span class="counter">${topic.items.length}</span>
      </div>
    `;

    const addForm = document.createElement("form");
    addForm.className = "admin-add-item-form";
    addForm.id = "adminAddItemForm";
    addForm.innerHTML = `
      <label>
        <span>新增评价项</span>
        <input id="adminNewItemName" type="text" maxlength="24" placeholder="评价项名称" required />
      </label>
      <label>
        <span>图片</span>
        <input id="adminNewItemImage" type="file" accept="image/*" />
      </label>
      <button class="primary-button" type="submit">添加评价项</button>
    `;
    panel.append(addForm);

    const list = document.createElement("div");
    list.className = "admin-item-editor-list";
    for (const item of [...topic.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      list.append(createEditableItem(topic, item));
    }
    if (!list.children.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state admin-empty";
      empty.textContent = "暂无评价项";
      list.append(empty);
    }
    panel.append(list);

    if (topic.items.length) {
      const saveRow = document.createElement("div");
      saveRow.className = "admin-items-save-row";
      const saveAll = document.createElement("button");
      saveAll.className = "primary-button";
      saveAll.type = "button";
      saveAll.textContent = "保存全部评价项";
      saveAll.addEventListener("click", () => handleItemsUpdate(topic, list));
      saveRow.append(saveAll);
      panel.append(saveRow);
    }

    addForm.addEventListener("submit", handleAddItem);
    return panel;
  }

  function createEditableItem(topic, item) {
    const row = document.createElement("div");
    row.className = "admin-item-editor";
    row.dataset.itemId = item.id;

    const media = document.createElement("div");
    media.className = "comparison-thumb";
    media.append(createItemMedia(item));

    const name = document.createElement("input");
    name.type = "text";
    name.name = "name";
    name.maxLength = 24;
    name.required = true;
    name.value = item.name;

    const rank = document.createElement("select");
    rank.name = "rank";
    const options = [{ id: "", label: "未排名" }, ...normalizeTiers(topic.tiers)];
    for (const option of options) {
      const node = document.createElement("option");
      node.value = option.id;
      node.textContent = option.label;
      node.selected = (item.rank || "") === option.id;
      rank.append(node);
    }

    const remove = document.createElement("button");
    remove.className = "danger-button";
    remove.type = "button";
    remove.textContent = "删除";
    remove.addEventListener("click", () => handleDeleteItem(topic, item));

    row.append(media, name, rank, remove);
    return row;
  }

  function renderResponsesPanel(topic) {
    const panel = document.createElement("section");
    panel.className = "admin-card-panel";
    const responses = state.responsesByTopic.get(topic.id) || [];
    panel.innerHTML = `
      <div class="section-heading">
        <h2>结果</h2>
        <span class="counter">${responses.length}</span>
      </div>
    `;

    if (!responses.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state admin-empty";
      empty.textContent = "暂无结果";
      panel.append(empty);
      return panel;
    }

    const ownerById = new Map(topic.items.map((item) => [item.id, item]));
    for (const response of responses) {
      const card = document.createElement("article");
      card.className = "admin-response-card";
      const matched = response.rankings.filter((ranking) => ownerById.get(ranking.itemId)?.rank === ranking.rank).length;
      const total = response.rankings.length || topic.items.length;
      const percent = total ? Math.round((matched / total) * 100) : 0;
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(response.id)}</strong>
          <p>${escapeHtml(response.participantId || "匿名")} · ${formatDate(response.createdAt)}</p>
        </div>
        <span class="topic-badge">${percent}% 一致</span>
      `;
      panel.append(card);
    }
    return panel;
  }

  async function handleTopicUpdate(event) {
    event.preventDefault();
    const topic = selectedTopic();
    if (!topic) return;

    const form = new FormData(event.currentTarget);
    const title = document.querySelector("#adminTopicTitleInput").value.trim();
    const author = document.querySelector("#adminTopicAuthorInput").value.trim();
    const category = normalizeCategory(document.querySelector("#adminTopicCategoryInput").value);
    const visibility = String(form.get("adminVisibility") || "public");
    const sharePassword = document.querySelector("#adminTopicPasswordInput").value.trim();
    const hot = form.get("adminHot") === "on";
    const showNames = form.get("adminShowNames") === "on";
    const payload = { title, author, category, visibility, hot, showNames };
    if (sharePassword) payload.sharePassword = sharePassword;
    let updated;
    try {
      ({ topic: updated } = await api(`/api/topics/${encodeURIComponent(topic.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }));
    } catch (error) {
      alert(error.message || "保存主题失败");
      return;
    }
    state.topics = state.topics.map((candidate) => (candidate.id === updated.id ? updated : candidate));
    renderStats();
    renderTopicList();
    renderDetail();
  }

  async function handleTiersUpdate(event) {
    event.preventDefault();
    const topic = selectedTopic();
    if (!topic) return;

    const form = new FormData(event.currentTarget);
    const nextTiers = tiers.map((tier) => ({
      id: tier.id,
      label: String(form.get(tier.id) || tier.label).trim().slice(0, 16) || tier.label,
    }));
    const { topic: updated } = await api(`/api/topics/${encodeURIComponent(topic.id)}/tiers`, {
      method: "PUT",
      body: JSON.stringify({ tiers: nextTiers }),
    });
    replaceTopic(updated);
    renderStats();
    renderTopicList();
    renderDetail();
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const topic = selectedTopic();
    if (!topic) return;

    const name = document.querySelector("#adminNewItemName").value.trim();
    if (!name) return;
    const file = document.querySelector("#adminNewItemImage").files?.[0];
    const form = new FormData();
    form.append("name", name);
    if (file) form.append("image", file);
    await api(`/api/topics/${encodeURIComponent(topic.id)}/items`, {
      method: "POST",
      body: form,
      headers: {},
    });
    await reloadSelectedTopic();
  }

  async function handleItemsUpdate(topic, list) {
    const rows = [...list.querySelectorAll(".admin-item-editor[data-item-id]")];
    const updates = rows.map((row) => ({
      id: row.dataset.itemId,
      name: row.querySelector('input[name="name"]')?.value.trim() || "",
      rank: row.querySelector('select[name="rank"]')?.value || "",
    }));
    if (updates.some((item) => !item.name)) {
      alert("评价项名称不能为空");
      return;
    }

    await Promise.all(
      updates.map((item) =>
        api(`/api/topics/${encodeURIComponent(topic.id)}/items/${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: item.name,
            rank: item.rank,
          }),
        }),
      ),
    );
    await reloadSelectedTopic();
  }

  async function handleDeleteItem(topic, item) {
    const ok = confirm(`删除评价项「${item.name}」？`);
    if (!ok) return;
    await api(`/api/topics/${encodeURIComponent(topic.id)}/items/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    await reloadSelectedTopic();
  }

  async function handleDeleteTopic(topic) {
    const ok = confirm(`删除主题「${topic.title}」？`);
    if (!ok) return;
    await api(`/api/topics/${encodeURIComponent(topic.id)}`, { method: "DELETE" });
    state.selectedTopicId = "";
    await loadAdminData();
  }

  async function reloadSelectedTopic() {
    const topic = selectedTopic();
    if (!topic) return;
    const [{ topic: updated }, { responses }] = await Promise.all([
      api(`/api/topics/${encodeURIComponent(topic.id)}`),
      api(`/api/topics/${encodeURIComponent(topic.id)}/responses`),
    ]);
    replaceTopic(updated);
    state.responsesByTopic.set(topic.id, responses);
    renderStats();
    renderTopicList();
    renderDetail();
  }

  function openForkDialog(topic) {
    els.forkSourceId.value = topic.id;
    els.forkTitle.value = `${topic.title} 分支`.slice(0, 36);
    els.forkPassword.value = "";
    syncForkPasswordField();
    els.forkDialog.showModal();
    els.forkTitle.select();
  }

  function closeForkDialog() {
    if (els.forkDialog.open) els.forkDialog.close();
  }

  async function handleForkSubmit(event) {
    event.preventDefault();
    const form = new FormData(els.forkForm);
    const sourceId = els.forkSourceId.value;
    const title = els.forkTitle.value.trim();
    const visibility = String(form.get("adminForkVisibility") || "public");
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
    closeForkDialog();
    state.selectedTopicId = topic.id;
    await loadAdminData();
  }

  function syncForkPasswordField() {
    const visibility = new FormData(els.forkForm).get("adminForkVisibility") || "public";
    const isPrivate = visibility === "private";
    els.forkPasswordField.hidden = !isPrivate;
    els.forkPassword.required = isPrivate;
    if (!isPrivate) els.forkPassword.value = "";
  }

  function selectedTopic() {
    return state.topics.find((topic) => topic.id === state.selectedTopicId) || null;
  }

  function responseCount(topicId) {
    return (state.responsesByTopic.get(topicId) || []).length;
  }

  function replaceTopic(topic) {
    state.topics = state.topics.map((candidate) => (candidate.id === topic.id ? topic : candidate));
  }

  function createItemMedia(item) {
    if (item.imagePath) {
      const image = document.createElement("img");
      const imageUrl = new URL(item.imagePath, location.origin);
      imageUrl.searchParams.set("key", new URLSearchParams(location.search).get("key") || "");
      image.src = imageUrl.toString();
      image.alt = item.name;
      return image;
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "image-placeholder";
      placeholder.textContent = item.name.slice(0, 1).toUpperCase();
      return placeholder;
    }
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
    return tiers.map((tier) => ({ id: tier.id, label: labels.get(tier.id) || tier.label }));
  }

  function defaultTierLabel(id) {
    return tiers.find((tier) => tier.id === id)?.label || id;
  }

  function renderCategoryOptions(selected) {
    const current = normalizeCategory(selected);
    const categories = uniqueCategories([...state.categories, current]);
    return categories
      .map((category) => {
        return `<option value="${escapeAttribute(category)}" ${category === current ? "selected" : ""}>${escapeHtml(
          category,
        )}</option>`;
      })
      .join("");
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

  async function api(path, options = {}) {
    const headers = new Headers(options.headers === undefined ? { "Content-Type": "application/json" } : options.headers);
    headers.set("X-Admin-Key", new URLSearchParams(location.search).get("key") || "");
    const response = await fetch(path, { ...options, headers });
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
    if (Number.isNaN(date.getTime())) return "未知时间";
    return new Intl.DateTimeFormat("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
