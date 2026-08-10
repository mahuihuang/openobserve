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
words; clicking a word opens a menu offering copy / include / exclude, each
filter action also available as "open in a new tab". Clicking outside collapses
back to plain text.

Lazy activation matters: an expanded log row renders every field value, and a
raw-log page renders every row expanded. Tokenizing up front would multiply the
DOM node count by the word count of every value on screen, so the tokenized
form is built only for the one value the user actually clicked.

The menu is a single ODropdown that is mounted around the active word only —
one overlay instance at a time rather than one per token — which keeps the
design-system positioning, theming, and keyboard behaviour without paying for
a dropdown root per word.
-->
<template>
  <!-- Inactive: plain text, single DOM node -->
  <span
    v-if="!activated"
    class="clickable-words-plain log-string inline cursor-pointer font-mono text-xs wrap-break-word"
    data-test="clickable-words-plain"
    @click.stop="activate"
    >{{ value }}</span
  >

  <!-- Active: tokenized words -->
  <span
    v-else
    ref="rootRef"
    class="logs-highlight-json inline font-mono text-xs wrap-break-word"
    data-test="clickable-words-tokens"
  >
    <template v-for="(token, idx) in tokens" :key="idx">
      <!-- The clicked word carries the dropdown so the menu anchors to it. -->
      <ODropdown
        v-if="token.isWord && activeIndex === idx"
        v-model:open="showMenu"
        side="bottom"
        align="start"
      >
        <template #trigger>
          <span
            class="clickable-word log-string cursor-pointer border-b border-current"
            :data-test="`clickable-word-${idx}`"
            >{{ token.text }}</span
          >
        </template>
        <ODropdownItem
          data-test="clickable-word-copy-btn"
          icon-left="content-copy"
          @select="onCopy"
        >
          {{ t("common.copyToClipboard") }}
        </ODropdownItem>
        <ODropdownItem data-test="clickable-word-include-btn" @select="onFilter('include')">
          <template #icon-left><EqualIcon class="size-2.5" /></template>
          {{ t("common.includeSearchTerm") }}
        </ODropdownItem>
        <ODropdownItem data-test="clickable-word-exclude-btn" @select="onFilter('exclude')">
          <template #icon-left><NotEqualIcon class="size-2.5" /></template>
          {{ t("common.excludeSearchTerm") }}
        </ODropdownItem>
        <ODropdownSeparator />
        <!-- The new-tab variants are their own items rather than a trailing icon
          button inside the two rows above: an interactive control nested in a
          DropdownMenuItem still commits that item's `select` (reka-ui selects on
          pointerup, which `@click.stop` does not cancel), so a single click on
          the icon would both filter here and open a tab. -->
        <ODropdownItem
          data-test="clickable-word-include-new-tab-btn"
          icon-left="open-in-new"
          @select="onOpenNewTab('include')"
        >
          {{ t("common.includeSearchTermNewTab") }}
        </ODropdownItem>
        <ODropdownItem
          data-test="clickable-word-exclude-new-tab-btn"
          icon-left="open-in-new"
          @select="onOpenNewTab('exclude')"
        >
          {{ t("common.excludeSearchTermNewTab") }}
        </ODropdownItem>
      </ODropdown>
      <span
        v-else-if="token.isWord"
        class="clickable-word log-string cursor-pointer border-b border-transparent transition-colors duration-150 hover:border-current"
        :data-test="`clickable-word-${idx}`"
        @click.stop="onWordClick(idx, token.text)"
        >{{ token.text }}</span
      >
      <span v-else class="log-string">{{ token.text }}</span>
    </template>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount } from "vue";
import { useI18nTyped } from "@/types/i18n";
import { copyToClipboard } from "@/utils/clipboard";
import EqualIcon from "@/components/icons/EqualIcon.vue";
import NotEqualIcon from "@/components/icons/NotEqualIcon.vue";
import ODropdown from "@/lib/overlay/Dropdown/ODropdown.vue";
import ODropdownItem from "@/lib/overlay/Dropdown/ODropdownItem.vue";
import ODropdownSeparator from "@/lib/overlay/Dropdown/ODropdownSeparator.vue";

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

const { t } = useI18nTyped();

// Lazy activation state
const activated = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const showMenu = ref(false);
const activeIndex = ref<number | null>(null);
const selectedWord = ref("");

const activate = () => {
  activated.value = true;
};

const closeMenu = () => {
  showMenu.value = false;
  activeIndex.value = null;
};

/**
 * Collapse back to plain text on an outside click. Runs on capture so it sees
 * the click before the dropdown's own dismissal, and bails while the menu is
 * open so dismissing the menu does not also discard the tokenized view.
 */
const deactivate = (e: MouseEvent) => {
  if (!activated.value) return;
  const target = e.target as Node | null;
  if (target && rootRef.value?.contains(target)) return;
  // Menu content is portalled outside rootRef; treat clicks inside it as inside.
  if (target instanceof Element && target.closest('[role="menu"]')) return;
  if (showMenu.value) {
    closeMenu();
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
  const regex = /([\p{L}\p{N}_\-.]+)|([^\p{L}\p{N}_\-.]+)/gu;
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

/**
 * Selecting a word swaps its plain span for the ODropdown-wrapped one. The
 * open flag is set on the next tick so the dropdown mounts against an already
 * rendered trigger — opening in the same tick as the click makes reka-ui treat
 * that very click as an outside click and dismiss immediately.
 */
const onWordClick = (idx: number, word: string) => {
  activeIndex.value = idx;
  selectedWord.value = word;
  nextTick(() => {
    showMenu.value = true;
  });
};

const onCopy = () => {
  copyToClipboard(selectedWord.value, t, { timeout: 1000 });
  closeMenu();
};

const onFilter = (action: "include" | "exclude") => {
  emit("word-action", props.fieldName, selectedWord.value, action);
  closeMenu();
};

const onOpenNewTab = (action: "include" | "exclude") => {
  emit("open-in-new-tab", props.fieldName, selectedWord.value, action);
  closeMenu();
};

defineExpose({ activated, tokens, showMenu, activeIndex, selectedWord });
</script>
