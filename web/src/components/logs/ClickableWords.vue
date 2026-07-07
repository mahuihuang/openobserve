<!-- Copyright 2026 OpenObserve Inc.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
-->

<!--
ClickableWords Component (Lazy Activation)
===========================================
Renders plain text by default. On click, tokenizes the string into individual
words with a dropdown menu for copy / include / exclude via str_match.
Deactivates back to plain text when clicking outside.
-->
<template>
<!-- Inactive: plain text, single DOM node -->
  <span
    v-if="!activated"
    class="clickable-words-plain log-string"
    @click.stop="activate"
  >{{ value }}</span>

<!-- Active: tokenized words -->
  <span v-else ref="rootRef" class="clickable-words logs-highlight-json">
    <template v-for="(token, idx) in tokens" :key="idx">
      <span
        v-if="token.isWord"
        class="clickable-word log-string"
        :class="{ 'clickable-word--active': activeIndex === idx }"
        @click.stop="onWordClick($event, idx, token.text)"
      >{{ token.text }}</span>
      <span v-else class="log-string">{{ token.text }}</span>
    </template>

    <!-- Context menu (teleported to body to avoid overflow clipping) -->
    <Teleport to="body">
      <div
        v-if="showMenu"
        ref="menuRef"
        class="clickable-words-menu"
        :style="menuStyle"
        @click.stop
        @pointerdown.stop
        @mousedown.stop
      >
      <div class="clickable-words-menu-item" @click="onCopy">
        <OIcon name="content-copy" size="sm" />
        <span>{{ t("common.copyToClipboard") }}</span>
      </div>
      <div class="clickable-words-menu-row">
        <div class="clickable-words-menu-item clickable-words-menu-row__main" @click="onInclude">
          <EqualIcon class="clickable-words-menu-icon" />
          <span>{{ t("common.includeSearchTerm") }}</span>
        </div>
        <div class="clickable-words-menu-row__btn" @click="onOpenNewTab('include')" :title="t('common.openInNewTab')">
          <OIcon name="open-in-new" size="sm" />
        </div>
      </div>
      <div class="clickable-words-menu-row">
        <div class="clickable-words-menu-item clickable-words-menu-row__main" @click="onExclude">
          <NotEqualIcon class="clickable-words-menu-icon" />
          <span>{{ t("common.excludeSearchTerm") }}</span>
        </div>
        <div class="clickable-words-menu-row__btn" @click="onOpenNewTab('exclude')" :title="t('common.openInNewTab')">
          <OIcon name="open-in-new" size="sm" />
        </div>
      </div>
    </div>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { copyToClipboard } from "@/utils/clipboard";
import EqualIcon from "@/components/icons/EqualIcon.vue";
import NotEqualIcon from "@/components/icons/NotEqualIcon.vue";
import OIcon from "@/lib/core/Icon/OIcon.vue";

interface Props {
  value: string;
  fieldName: string;
  queryString?: string;
}

const props = withDefaults(defineProps<Props>(), {
  queryString: "",
});

const emit = defineEmits<{
  (e: "word-action", field: string, word: string, action: "include" | "exclude"): void;
  (e: "open-in-new-tab", field: string, word: string, action: "include" | "exclude"): void;
}>();

const { t } = useI18n();

// Lazy activation state
const activated = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const showMenu = ref(false);
const menuRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});
const activeIndex = ref<number | null>(null);
const selectedWord = ref("");

const activate = () => {
  activated.value = true;
};

const deactivate = (e: MouseEvent) => {
  if (!activated.value) return;
  // Don't deactivate if clicking inside the component or menu
  if (rootRef.value?.contains(e.target as Node)) return;
  if (menuRef.value?.contains(e.target as Node)) return;
  if (showMenu.value) {
    showMenu.value = false;
    activeIndex.value = null;
    return;
  }
  activated.value = false;
  activeIndex.value = null;
};

onMounted(() => {
  document.addEventListener("click", deactivate, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("click", deactivate, true);
});

const tokens = computed(() => {
  const text = String(props.value);
  const result: { text: string; isWord: boolean }[] = [];
  const regex = /([\p{L}\p{N}_\-\.]+)|([^\p{L}\p{N}_\-\.]+)/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      result.push({ text: match[1], isWord: true });
    } else if (match[2]) {
      result.push({ text: match[2], isWord: false });
    }
  }
  return result;
});

const onWordClick = (event: MouseEvent, idx: number, word: string) => {
  activeIndex.value = idx;
  selectedWord.value = word;
  const target = event.target as HTMLElement;
  const rect = target.getBoundingClientRect();
  // Use fixed positioning since menu is teleported to body
  menuStyle.value = {
    position: "fixed",
    top: `${rect.bottom + 2}px`,
    left: `${rect.left}px`,
    zIndex: "9999",
  };
  showMenu.value = true;
};

const onCopy = () => {
  copyToClipboard(selectedWord.value, {
    successMessage: "Copied to clipboard",
    timeout: 1000,
  });
  showMenu.value = false;
  activeIndex.value = null;
};

const onInclude = () => {
  emit("word-action", props.fieldName, selectedWord.value, "include");
  showMenu.value = false;
  activeIndex.value = null;
};

const onExclude = () => {
  emit("word-action", props.fieldName, selectedWord.value, "exclude");
  showMenu.value = false;
  activeIndex.value = null;
};

const onOpenNewTab = (action: "include" | "exclude") => {
  emit("open-in-new-tab", props.fieldName, selectedWord.value, action);
  showMenu.value = false;
  activeIndex.value = null;
};
</script>

<style scoped lang="scss">
@import "@/assets/styles/log-highlighting.css";

.clickable-words-plain {
  cursor: pointer;
  font-family: monospace;
  font-size: 12px;
  word-break: break-word;
}

.clickable-words {
  display: inline;
  font-family: monospace;
  font-size: 12px;
  word-break: break-word;
}

.clickable-word {
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: border-bottom-color 0.15s ease;

  &:hover,
  &--active {
    border-bottom-color: currentColor;
  }
}

:global(.clickable-words-menu) {
  min-width: 200px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 6px;
  // The menu is teleported to <body>. When it is opened from inside a modal
  // overlay (e.g. the Source Details drawer), reka-ui sets `pointer-events: none`
  // on <body>, which the teleported menu would otherwise inherit and become
  // unclickable. Force pointer events back on so the menu items stay interactive.
  pointer-events: auto;
}

:global(.clickable-words-menu-item) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  color: #374151;
  background: transparent;
  transition: background 0.15s;
}

:global(.clickable-words-menu-item:hover) {
  background: #e2e8f0;
}

:global(.clickable-words-menu-icon) {
  width: 14px;
  height: 14px;
}

:global(.clickable-words-menu-row) {
  display: flex;
  align-items: center;
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px solid #f1f5f9;
}

:global(.clickable-words-menu-row__main) {
  flex: 1;
  min-width: 0;
}

:global(.clickable-words-menu-row__btn) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-right: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: #6b7280;
  background: transparent;
  transition: background 0.15s, color 0.15s;
}

:global(.clickable-words-menu-row__btn:hover) {
  background: #e2e8f0;
  color: #1e40af;
}

:global(.body--dark .clickable-words-menu) {
  background: #1e293b;
  border-color: #334155;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}

:global(.body--dark .clickable-words-menu-item) {
  color: #e2e8f0;
}

:global(.body--dark .clickable-words-menu-item:hover) {
  background: #334155;
}

:global(.body--dark .clickable-words-menu-row) {
  border-top-color: #334155;
}

:global(.body--dark .clickable-words-menu-row__btn) {
  color: #94a3b8;
}

:global(.body--dark .clickable-words-menu-row__btn:hover) {
  background: #475569;
  color: #60a5fa;
}
</style>
