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
ClickableWords Component
========================
Tokenizes a string field value into individual words. Each word shows an underline
on hover and displays a dropdown menu on click with options to:
- Copy the word
- Filter (include) using str_match
- Exclude using str_match
-->
<template>
  <span class="clickable-words logs-highlight-json">
    <template v-for="(token, idx) in tokens" :key="idx">
      <span
        v-if="token.isWord"
        class="clickable-word log-string"
        :class="{ 'clickable-word--active': activeIndex === idx }"
        :ref="(el) => setWordRef(idx, el)"
        @click.stop="onWordClick($event, idx, token.text)"
      >{{ token.text }}</span>
      <span v-else class="log-string">{{ token.text }}</span>
    </template>

    <!-- Dropdown menu -->
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
import { ref, computed } from "vue";
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
  (e: "word-action", field: string, word: string, action: "include" | "exclude"): void;
}>();

const { t } = useI18n();
const $q = useQuasar();

const showMenu = ref(false);
const menuTarget = ref<HTMLElement | null>(null);
const activeIndex = ref<number | null>(null);
const selectedWord = ref("");
const wordRefs = ref<Record<number, HTMLElement | null>>({});

const setWordRef = (idx: number, el: any) => {
  wordRefs.value[idx] = el as HTMLElement;
};

/**
 * Tokenize the value string into word and non-word segments.
 * Words are sequences of alphanumeric/underscore/hyphen/dot characters.
 */
const tokens = computed(() => {
  const text = String(props.value);
  const result: { text: string; isWord: boolean }[] = [];
  const regex = /([a-zA-Z0-9_\-\.]+)|([^a-zA-Z0-9_\-\.]+)/g;
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
  emit("word-action", props.fieldName, selectedWord.value, "include");
  activeIndex.value = null;
};

const onExclude = () => {
  emit("word-action", props.fieldName, selectedWord.value, "exclude");
  activeIndex.value = null;
};
</script>

<style scoped lang="scss">
@import "@/assets/styles/log-highlighting.css";

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
