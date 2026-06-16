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

    <q-menu
      v-model="showMenu"
      :target="menuTarget"
      anchor="bottom left"
      self="top left"
      no-parent-event
      class="clickable-words-menu"
    >
      <q-list dense class="logs-table-list">
        <q-item clickable v-close-popup @click="onCopy">
          <q-item-section side class="tw:min-w-0! tw:pr-2!">
            <q-icon name="content_copy" size="xs" />
          </q-item-section>
          <q-item-section>{{ t("common.copyToClipboard") }}</q-item-section>
        </q-item>
        <q-item clickable v-close-popup @click="onInclude">
          <q-item-section side class="tw:min-w-0! tw:pr-2!">
            <q-icon color="currentColor" size="xs">
              <EqualIcon />
            </q-icon>
          </q-item-section>
          <q-item-section>{{ t("common.includeSearchTerm") }}</q-item-section>
        </q-item>
        <q-item clickable v-close-popup @click="onExclude">
          <q-item-section side class="tw:min-w-0! tw:pr-2!">
            <q-icon color="currentColor" size="xs">
              <NotEqualIcon />
            </q-icon>
          </q-item-section>
          <q-item-section>{{ t("common.excludeSearchTerm") }}</q-item-section>
        </q-item>
      </q-list>
    </q-menu>
  </span>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useI18n } from "vue-i18n";
import { copyToClipboard, useQuasar } from "quasar";
import EqualIcon from "@/components/icons/EqualIcon.vue";
import NotEqualIcon from "@/components/icons/NotEqualIcon.vue";

interface Props {
  value: string;
  fieldName: string;
  queryString?: string;
}

const props = withDefaults(defineProps<Props>(), {
  queryString: "",
});

const emit = defineEmits<{
  (
    e: "word-action",
    field: string,
    word: string,
    action: "include" | "exclude",
    isFullValue: boolean,
  ): void;
}>();

const { t } = useI18n();
const $q = useQuasar();

// Lazy activation state
const activated = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const showMenu = ref(false);
const menuTarget = ref<HTMLElement | null>(null);
const activeIndex = ref<number | null>(null);
const selectedWord = ref("");

const activate = () => {
  activated.value = true;
};

const deactivate = (e: MouseEvent) => {
  if (!activated.value) return;
  // Don't deactivate if clicking inside the component or menu
  if (rootRef.value?.contains(e.target as Node)) return;
  if (showMenu.value) return;
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

// Returns true when the clicked word is exactly the entire field value, in
// which case the parent should build an equality (=/!=) filter instead of str_match.
const isFullValue = (word: string): boolean => {
  return String(props.value).trim() === String(word).trim();
};

const onWordClick = (event: MouseEvent, idx: number, word: string) => {
  activeIndex.value = idx;
  selectedWord.value = word;
  menuTarget.value = event.target as HTMLElement;
  showMenu.value = true;
};

const onCopy = () => {
  copyToClipboard(selectedWord.value).then(() => {
    $q.notify({
      type: "positive",
      message: "Copied to clipboard",
      timeout: 1000,
    });
  });
  activeIndex.value = null;
};

const onInclude = () => {
  emit(
    "word-action",
    props.fieldName,
    selectedWord.value,
    "include",
    isFullValue(selectedWord.value),
  );
  activeIndex.value = null;
};

const onExclude = () => {
  emit(
    "word-action",
    props.fieldName,
    selectedWord.value,
    "exclude",
    isFullValue(selectedWord.value),
  );
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

.clickable-words-menu {
  min-width: 180px;
}
</style>
